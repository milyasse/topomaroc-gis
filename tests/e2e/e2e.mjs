// Tests de bout en bout (navigateur réel Chromium via Playwright), GPS simulé.
// Usage : node tests/e2e/e2e.mjs [URL de base] [--chromium=/chemin/chrome]
// Écrit tests/e2e/results.json (réussis / échoués / non exécutés).
import fs from 'node:fs';
import path from 'node:path';

let pw;
try { pw = await import('playwright'); } catch {
  pw = (await import('/home/claude/.npm-global/lib/node_modules/playwright/index.js')).default;
}
const { chromium } = pw;
const BASE = (process.argv.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:8080/').replace(/\/?$/, '/');
const exe = process.argv.find((a) => a.startsWith('--chromium='))?.split('=')[1] ?? (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'results.json');
const SHOTS = path.join(path.dirname(new URL(import.meta.url).pathname), 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const RABAT = { latitude: 34.0209, longitude: -6.8498 };
const results = [];
const browser = await chromium.launch({ executablePath: exe });

/** @param {any} [opts] */
async function newPage(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR',
    permissions: opts.denyGeo ? [] : ['geolocation'], geolocation: { ...RABAT, accuracy: 4 }, acceptDownloads: true, ...opts.ctx,
  });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|openstreetmap|arcgisonline|opentopomap|cartocdn|ERR_|Failed to load resource|net::/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE + (opts.hash ?? ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body:not(.booting)', { timeout: 15000 });
  return { ctx, page, errors };
}

async function test(name, fn, { skip = null } = {}) {
  if (skip) { results.push({ name, status: 'non exécuté', detail: skip }); console.log(`- ${name} : NON EXÉCUTÉ (${skip})`); return; }
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: 'réussi', ms: Date.now() - t0, detail: detail ?? '' });
    console.log(`✔ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, status: 'échoué', ms: Date.now() - t0, detail: String(e?.message ?? e).slice(0, 600) });
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=E2E ${name.replace(/[:,]/g, ' ')}::${String(e?.message ?? e).replace(/\x1b\[[0-9;]*m/g, '').replace(/\r?\n/g, ' | ').slice(0, 900)}`);
    console.log(`✘ ${name} — ${e?.message ?? e}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const text = async (page, sel) => (await page.locator(sel).first().innerText()).replace(/ | /g, ' ');

// ------------------------------------------------------------------------------------------
await test('Chargement de l’application sans erreur JavaScript', async () => {
  const { page, ctx, errors } = await newPage();
  await page.waitForSelector('.tiles .tile');
  const n = await page.locator('.tiles .tile').count();
  assert(n === 8, `${n} tuiles`);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-accueil.png') });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `${n} actions sur l’écran d’accueil`;
});

await test('Lien direct et rechargement d’une route profonde (#/parcels)', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/parcels' });
  await page.waitForSelector('#sheet-title:has-text("Parcelles")');
  await page.reload(); await page.waitForSelector('body:not(.booting)');
  await page.waitForSelector('#sheet-title:has-text("Parcelles")');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
});

await test('PWA : manifeste valide et service worker actif', async () => {
  const { page, ctx } = await newPage();
  const man = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  assert(man.name === 'TopoMaroc GIS' && man.icons.some((i) => i.purpose === 'maskable'), 'manifeste');
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  assert(sw, 'service worker inactif');
  await ctx.close();
  return 'manifeste + service worker « activated »';
});

await test('Hors connexion : l’application redémarre depuis le cache (service worker)', async () => {
  const { page, ctx } = await newPage();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await page.waitForSelector('body:not(.booting)');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; await new Promise((r) => setTimeout(r, 1500)); });
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body:not(.booting)', { timeout: 15000 });
  await page.goto(BASE + '#/parcels'); await page.waitForSelector('#sheet-title:has-text("Parcelles")');
  await ctx.setOffline(false);
  await ctx.close();
  return 'interface et modules servis hors ligne';
});

await test('Navigation : saisie Lambert Nord, distance et azimut cohérents', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/nav' });
  // Cible à ~120 m au nord-est de la position simulée, exprimée en Lambert Nord (calcul dans la page)
  const target = await page.evaluate(async () => {
    const crs = await import('./src/core/crs.js');
    const geo = await import('./src/core/geodesy.js');
    const p = geo.direct(34.0209, -6.8498, 45, 120);
    const xy = crs.fromWGS84('EPSG:26191', p.lon, p.lat);
    return { x: xy[0].toFixed(3), y: xy[1].toFixed(3) };
  });
  const inputs = page.locator('.coord-input input[type=text]');
  await inputs.nth(0).fill(target.x.replace('.', ','));
  await inputs.nth(1).fill(target.y);
  await page.fill('input[placeholder="ex. Borne B12"]', 'B-TEST');
  await page.click('button:has-text("Démarrer la navigation")');
  await page.waitForSelector('.nav-distance');
  await page.waitForFunction(() => /m/.test(document.querySelector('.nav-distance')?.textContent ?? ''));
  await page.waitForTimeout(700);
  const d = await text(page, '.nav-distance');
  const dist = Number(d.replace(/[^\d,]/g, '').replace(',', '.'));
  assert(Math.abs(dist - 120) <= 1, `distance affichée ${d}`);
  const bear = await text(page, '.nav-bearing');
  assert(/45[.,]\d°/.test(bear) || /4[45][.,]\d°/.test(bear), `azimut ${bear}`);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-navigation.png') });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `distance ${d}, ${bear.split('\n')[0]}`;
});

await test('Navigation : arrivée dans le rayon (10 m) → alerte visuelle', async () => {
  const { page, ctx } = await newPage({ hash: '#/nav' });
  const target = await page.evaluate(async () => {
    const geo = await import('./src/core/geodesy.js');
    return geo.direct(34.0209, -6.8498, 90, 60);
  });
  const inputs = page.locator('.coord-input input[type=text]');
  await page.selectOption('.coord-input select', 'EPSG:4326');
  await inputs.nth(0).fill(String(target.lat));
  await inputs.nth(1).fill(String(target.lon));
  await page.click('.chips .chip:has-text("10 m")');
  await page.click('button:has-text("Démarrer la navigation")');
  await page.waitForSelector('.nav-distance');
  await page.waitForTimeout(600);
  assert(!(await page.locator('.nav-main.arrived').count()), 'arrivée prématurée');
  // On se rapproche : 4 m de la cible
  const near = await page.evaluate(async (t) => { const geo = await import('./src/core/geodesy.js'); return geo.direct(t.lat, t.lon, 270, 4); }, target);
  await ctx.setGeolocation({ latitude: near.lat, longitude: near.lon, accuracy: 3 });
  await page.waitForSelector('.nav-main.arrived', { timeout: 5000 });
  await page.waitForSelector('.toast:has-text("Point atteint")');
  await page.screenshot({ path: path.join(SHOTS, 'mobile-arrivee.png') });
  // enregistrement du point atteint
  await page.click('button:has-text("Enregistrer le point atteint")');
  await page.waitForSelector('.toast:has-text("enregistré")');
  await ctx.close();
  return 'arrivée détectée à 4 m, point atteint enregistré';
});

await test('Navigation : précision GPS insuffisante signalée', async () => {
  const { page, ctx } = await newPage({ hash: '#/nav' });
  await ctx.setGeolocation({ ...RABAT, accuracy: 35 });
  const inputs = page.locator('.coord-input input[type=text]');
  await page.selectOption('.coord-input select', 'EPSG:4326');
  await inputs.nth(0).fill('34.0215'); await inputs.nth(1).fill('-6.8490');
  await page.click('.chips .chip:has-text("5 m")');
  await page.click('button:has-text("Démarrer la navigation")');
  await page.waitForSelector('.nav-warn p:has-text("dépasse le rayon")', { timeout: 6000 });
  const badge = await page.locator('.nav-gps .badge').getAttribute('class');
  assert(/q-poor/.test(badge ?? ''), `badge ${badge}`);
  await ctx.close();
});

await test('GPS : autorisation refusée', async () => {
  const { page, ctx } = await newPage({ denyGeo: true, hash: '#/survey' });
  await page.waitForSelector('.gps-card.st-denied', { timeout: 8000 });
  const t = await text(page, '.gps-card');
  assert(/[Aa]utorisez|refusé/.test(t), t);
  await ctx.close();
  return t.split('\n')[0];
});

await test('GPS : position indisponible (erreur du capteur)', async () => {
  const init = () => {
    const geo = { watchPosition: (_s, e) => { setTimeout(() => e({ code: 2, message: 'unavailable' }), 200); return 1; }, clearWatch() {}, getCurrentPosition: (_s, e) => e({ code: 2 }) };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  };
  const { page, ctx } = await newPage({ init, hash: '#/survey' });
  await page.waitForSelector('.gps-card.st-unavailable', { timeout: 8000 });
  await page.click('button:has-text("Enregistrer le point GPS")');
  await page.waitForSelector('.toast-error');
  await ctx.close();
});

await test('GPS : perte du signal (aucune mesure depuis 15 s) → état « signal perdu »', async () => {
  const { page, ctx } = await newPage({ hash: '#/survey' });
  await page.waitForSelector('.gps-card.st-active', { timeout: 8000 });
  await page.waitForSelector('.gps-card.st-stale', { timeout: 25000 });
  await ctx.close();
  return 'état stale détecté après ~15 s sans nouvelle position';
});

await test('Levé : enregistrement GPS, persistance après rechargement', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/survey' });
  await page.waitForSelector('.gps-card.st-active', { timeout: 8000 });
  await page.fill('textarea[placeholder="Description / observations"]', 'Borne d’angle nord');
  await page.click('button:has-text("Enregistrer le point GPS")');
  await page.waitForSelector('.point-list .item');
  await ctx.setGeolocation({ latitude: 34.0211, longitude: -6.8496, accuracy: 5 });
  await page.waitForTimeout(500);
  await page.click('button:has-text("Enregistrer le point GPS")');
  await page.waitForFunction(() => document.querySelectorAll('.point-list .item').length === 2);
  // annulation / rétablissement
  await page.click('button[aria-label="Annuler"]');
  await page.waitForFunction(() => document.querySelectorAll('.point-list .item').length === 1);
  await page.click('button[aria-label="Rétablir"]');
  await page.waitForFunction(() => document.querySelectorAll('.point-list .item').length === 2);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-leve.png') });
  await page.reload(); await page.waitForSelector('body:not(.booting)');
  await page.waitForFunction(() => document.querySelectorAll('.point-list .item').length === 2, null, { timeout: 8000 });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return '2 points, annuler/rétablir, persistance IndexedDB';
});

await test('Levé : moyenne « attendre une meilleure précision »', async () => {
  const { page, ctx } = await newPage({ hash: '#/survey' });
  await page.waitForSelector('.gps-card.st-active', { timeout: 8000 });
  await page.check('label.switch:has-text("Attendre une meilleure précision") input');
  await page.fill('.avg-opts input >> nth=1', '3');
  await page.locator('.avg-opts input').nth(1).dispatchEvent('change');
  await page.click('button:has-text("Enregistrer le point GPS")');
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(500); await ctx.setGeolocation({ latitude: 34.0209 + i * 1e-6, longitude: -6.8498, accuracy: 3 + (i % 2) }); }
  await page.waitForSelector('.toast:has-text("enregistré")', { timeout: 10000 });
  await ctx.close();
});

await test('Parcelle : carré 10 m × 10 m saisi en Lambert Nord → 100,00 m²', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/parcels' });
  await page.click('button:has-text("Nouvelle parcelle")');
  await page.selectOption('.modal select.crs-select', 'EPSG:26191');
  await page.click('.mode-btn[data-mode="manual"]');
  await page.waitForSelector('table.vtx');
  const pts = [['400000', '380000'], ['400010', '380000'], ['400010', '380010'], ['400000', '380010']];
  for (const [x, y] of pts) {
    const foot = page.locator('table.vtx tfoot input');
    await foot.nth(1).fill(x); await foot.nth(2).fill(y);
    await page.click('table.vtx tfoot button:has-text("Ajouter")');
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => /100,00/.test(document.querySelector('.results .value')?.textContent?.replace(/ /g, ' ') ?? ''));
  const v = await text(page, '.results .value');
  const per = await text(page, '.results .big-figure:nth-child(2) .value');
  assert(/40,0/.test(per), `périmètre ${per}`);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-parcelle.png'), fullPage: false });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `superficie ${v}, périmètre ${per}`;
});

await test('Parcelle : polygone auto-intersecté et sommets en double détectés', async () => {
  const { page, ctx } = await newPage({ hash: '#/parcels' });
  await page.click('button:has-text("Nouvelle parcelle")');
  await page.selectOption('.modal select.crs-select', 'EPSG:26191');
  await page.click('.mode-btn[data-mode="manual"]');
  await page.waitForSelector('table.vtx');
  for (const [x, y] of [['400000', '380000'], ['400010', '380010'], ['400010', '380000'], ['400000', '380010']]) {
    const foot = page.locator('table.vtx tfoot input');
    await foot.nth(1).fill(x); await foot.nth(2).fill(y);
    await page.click('table.vtx tfoot button:has-text("Ajouter")');
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('.issue.error:has-text("auto-intersecté")');
  const foot = page.locator('table.vtx tfoot input');
  await foot.nth(1).fill('400000'); await foot.nth(2).fill('380010');
  await page.click('table.vtx tfoot button:has-text("Ajouter")');
  await page.waitForSelector('.issue.error:has-text("confondus")');
  await ctx.close();
});

await test('Parcelle : mode dessin sur la carte puis rapport PDF', async () => {
  const { page, ctx } = await newPage({ hash: '#/parcels' });
  await page.click('button:has-text("Nouvelle parcelle")');
  await page.click('.mode-btn[data-mode="draw"]');
  await page.waitForSelector('.tab[aria-selected="true"]:has-text("Dessin")');
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); M.getMap().setView([34.0209, -6.8498], 18, { animate: false }); });
  await page.waitForTimeout(400);
  const box = await page.locator('#map').boundingBox();
  for (const [dx, dy] of [[-60, -40], [60, -40], [60, 60], [-60, 60]]) { await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy); await page.waitForTimeout(300); }
  await page.waitForFunction(() => document.querySelectorAll('.vx-icon').length === 4);
  await page.click('#action-bar button:has-text("Fermer la parcelle")');
  await page.waitForFunction(() => /\/manual$/.test(location.hash));
  await page.waitForTimeout(400);
  const v = await text(page, '.results .value');
  assert(/m²/.test(v), v);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('button:has-text("Rapport PDF")')]);
  const p = await dl.path();
  const buf = fs.readFileSync(p);
  assert(buf.subarray(0, 5).toString() === '%PDF-', 'pas un PDF');
  fs.writeFileSync(path.join(SHOTS, 'rapport-parcelle.pdf'), buf);
  await ctx.close();
  return `4 sommets dessinés, ${v}, PDF ${buf.length} octets`;
});

await test('Import CSV (séparateur ;) avec choix du système puis export GeoJSON/DXF/CSV/XLSX', async () => {
  const { page, ctx } = await newPage({ hash: '#/projects' });
  const csv = 'Point;X;Y;Code\nB1;386512,35;371204,88;borne\nB2;386640,12;371198,40;borne\nB3;386702,91;371301,77;borne\n';
  const tmp = path.join(SHOTS, '..', 'import-test.csv');
  fs.writeFileSync(tmp, csv);
  page.on('filechooser', (fc) => fc.setFiles(tmp));
  await page.click('button:has-text("Importer des données")');
  await page.waitForSelector('.modal:has-text("Importer")');
  await page.selectOption('.modal select.crs-select', 'EPSG:26191');
  await page.check('.modal label.switch input');
  await page.click('.modal-actions button:has-text("Importer")');
  await page.waitForSelector('.modal:has-text("Type d’import")');
  await page.click('.modal-actions button:has-text("Points")');
  await page.waitForSelector('.toast:has-text("Import terminé")');
  fs.unlinkSync(tmp);
  const formats = { geojson: '.geojson', dxf: '.dxf', csv: '.csv', xlsx: '.xlsx' };
  const got = [];
  for (const [fmt, ext] of Object.entries(formats)) {
    await page.goto(BASE + '#/projects'); await page.waitForSelector('button:has-text("Exporter les données")', { state: 'attached' });
    await page.evaluate(() => { const d = document.querySelector('details.group'); if (d) d.open = true; });
    await page.click('button:has-text("Exporter les données")');
    await page.selectOption('.modal select >> nth=0', fmt);
    await page.uncheck('.modal label.switch input');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.modal-actions button:has-text("Exporter")')]);
    assert(dl.suggestedFilename().endsWith(ext), dl.suggestedFilename());
    const buf = fs.readFileSync(await dl.path());
    if (fmt === 'geojson') { const g = JSON.parse(buf.toString()); assert(g.features.length === 3, 'geojson'); }
    if (fmt === 'dxf') assert(buf.toString().includes('386512.3500'), 'dxf');
    if (fmt === 'csv') assert(buf.toString().includes('386512.350,371204.880'), 'csv');
    if (fmt === 'xlsx') assert(buf.subarray(0, 2).toString() === 'PK', 'xlsx');
    got.push(dl.suggestedFilename());
  }
  await ctx.close();
  return got.join(', ');
});

await test('Sauvegarde complète puis restauration', async () => {
  const { page, ctx } = await newPage({ hash: '#/projects' });
  await page.click('button:has-text("Créer un projet")');
  await page.fill('.modal input[placeholder^="ex. Lotissement"]', 'Projet sauvegarde');
  await page.click('.modal-actions button:has-text("Créer")');
  await page.goto(BASE + '#/survey'); await page.waitForSelector('.gps-card.st-active', { timeout: 8000 });
  await page.click('button:has-text("Enregistrer le point GPS")'); await page.waitForSelector('.point-list .item');
  await page.goto(BASE + '#/projects'); await page.waitForSelector('.project-list .item');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Sauvegarder tout")')]);
  const file = await dl.path();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(data.format === 'topomaroc-backup' && data.features.length >= 1, 'contenu sauvegarde');
  // nouveau navigateur (stockage vide) → restauration
  const { page: p2, ctx: c2 } = await newPage({ hash: '#/projects' });
  const dest = path.join(SHOTS, '..', 'backup-test.json');
  fs.copyFileSync(file, dest);
  p2.on('filechooser', (fc) => fc.setFiles(dest));
  await p2.click('button:has-text("Importer des données")');
  await p2.click('.modal-actions button:has-text("Restaurer")');
  await p2.waitForSelector('.toast:has-text("Restauration")');
  await p2.goto(BASE + '#/survey');
  await p2.waitForFunction(() => document.querySelectorAll('.point-list .item').length >= 1, null, { timeout: 8000 });
  fs.unlinkSync(dest);
  await ctx.close(); await c2.close();
  return `${data.projects.length} projet(s), ${data.features.length} entité(s) restaurés`;
});

await test('Outils : convertisseur (Lambert Nord → tous systèmes) et mesure de distance', async () => {
  const { page, ctx } = await newPage({ hash: '#/tools/convert' });
  const inputs = page.locator('.coord-input input[type=text]');
  await page.selectOption('.coord-input select', 'EPSG:26191');
  await inputs.nth(0).fill('500000'); await inputs.nth(1).fill('300000');
  await page.waitForSelector('.conv-out table');
  const t = await text(page, '.conv-out table');
  assert(/33,3000000/.test(t) && /-5,4000000/.test(t), 'origine Lambert en Merchich');
  await page.goto(BASE + '#/tools/measure-dist');
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); M.getMap().setView([34.0209, -6.8498], 17, { animate: false }); });
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + 100, box.y + 120); await page.mouse.click(box.x + 250, box.y + 120);
  await page.waitForFunction(() => /m/.test(document.querySelector('.results .value')?.textContent ?? '') && !/—/.test(document.querySelector('.results .value')?.textContent ?? ''));
  const v = await text(page, '.results .value');
  await ctx.close();
  return `origine (500 000 ; 300 000) → φ 33,3° λ −5,4° ; distance mesurée ${v}`;
});

await test('Interface tablette et ordinateur (captures)', async () => {
  for (const [name, vp, mobile] of [['tablette', { width: 820, height: 1180 }, true], ['ordinateur', { width: 1440, height: 900 }, false]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, locale: 'fr-FR', permissions: ['geolocation'], geolocation: { ...RABAT, accuracy: 5 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '#/parcels'); await page.waitForSelector('body:not(.booting)');
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!overflow, `débordement horizontal (${name})`);
    await page.screenshot({ path: path.join(SHOTS, `${name}-parcelles.png`) });
    await ctx.close();
  }
});

await test('Mode sombre et thème clair', async () => {
  const { page, ctx } = await newPage({ hash: '#/settings', ctx: { colorScheme: 'dark' } });
  const th = await page.evaluate(() => document.documentElement.dataset.theme);
  assert(th === 'dark', th);
  await page.selectOption('.group select >> nth=0', 'light');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await ctx.close();
});

// ------------------------------------------------------------------------------------------ v1.1
const FIXTURE = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixture-tile.jpg'));
/** Ajoute des entités directement via les modules de l'application. */
const seed = (page, fn, arg) => page.evaluate(fn, arg);
/** Attend qu'une fonction asynchrone évaluée dans la page renvoie une valeur vraie. */
async function until(page, fn, timeout = 8000) {
  const t0 = Date.now();
  for (;;) { if (await page.evaluate(fn)) return; if (Date.now() - t0 > timeout) throw new Error('délai dépassé : ' + String(fn).slice(0, 120)); await page.waitForTimeout(100); }
}

await test('« + Point » : placement au réticule sans GPS (2 points)', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/map' });
  await page.click('#btn-addpt');
  await page.waitForSelector('#action-bar:not([hidden]) button:has-text("Placer ici")');
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); M.getMap().setView([34.0209, -6.8498], 18, { animate: false }); });
  await page.click('#action-bar button:has-text("Placer ici")');
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); M.getMap().panBy([80, 0], { animate: false }); });
  await page.click('#action-bar button:has-text("Placer ici")');
  await until(page, async () => (await import('./src/state.js')).state.features.filter((f) => f.type === 'point' && f.source === 'map').length === 2);
  const c = await page.evaluate(async () => (await import('./src/state.js')).state.features.find((f) => f.source === 'map').wgs84);
  assert(Math.abs(c.lat - 34.0209) < 1e-5 && Math.abs(c.lon + 6.8498) < 1e-5, JSON.stringify(c));
  await page.screenshot({ path: path.join(SHOTS, 'mobile-placement.png') });
  await page.click('#action-bar button:has-text("Terminer")');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return '2 points placés, position exacte du réticule';
});

await test('Sélection de 4 points sur la carte → parcelle (contour automatique)', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/map' });
  await seed(page, async () => {
    const st = await import('./src/state.js'); const crs = await import('./src/core/crs.js');
    const pts = [[400000, 380010], [400010, 380000], [400000, 380000], [400010, 380010]]; // désordonnés
    let n = 1;
    for (const [x, y] of pts) { const w = crs.toWGS84('EPSG:26191', [x, y]); await st.addFeature({ type: 'point', num: String(n++), code: 'borne', wgs84: { lat: w.lat, lon: w.lon }, input: { crsId: 'EPSG:26191', x, y }, source: 'manual' }); }
    const M = await import('./src/map/map.js'); M.zoomToAll();
  });
  await page.waitForTimeout(500);
  await page.click('#btn-select');
  await page.waitForSelector('#action-bar:not([hidden])');
  await page.click('#action-bar button:has-text("Visibles")');
  await page.waitForSelector('#action-bar:has-text("4 point(s) sélectionné(s)")');
  await page.click('#action-bar button:has-text("Créer une parcelle")');
  await page.click('.modal-actions button:has-text("Créer")');
  await page.waitForSelector('.sticky-summary:has-text("S =")');
  const v = await text(page, '.sticky-summary');
  assert(/100,00 m²/.test(v), v);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return v;
});

await test('Dessin : accrochage aux points et fermeture en touchant le 1er sommet', async () => {
  const { page, ctx } = await newPage({ hash: '#/map' });
  await seed(page, async () => {
    const st = await import('./src/state.js'); const crs = await import('./src/core/crs.js');
    const w = crs.toWGS84('EPSG:26191', [400000, 380000]);
    await st.addFeature({ type: 'point', num: '77', code: 'borne', wgs84: { lat: w.lat, lon: w.lon }, input: { crsId: 'EPSG:26191', x: 400000, y: 380000 }, source: 'manual' });
    await st.updateSettings({ inputCrs: 'EPSG:26191' });
  });
  await page.goto(BASE + '#/parcels');
  await page.click('button:has-text("Nouvelle parcelle")');
  await page.selectOption('.modal select.crs-select', 'EPSG:26191');
  await page.click('.mode-btn[data-mode="draw"]');
  await page.waitForSelector('.tab[aria-selected="true"]:has-text("Dessin")');
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); const crs = await import('./src/core/crs.js'); const w = crs.toWGS84('EPSG:26191', [400010, 380020]); M.getMap().setView([w.lat, w.lon], 19, { animate: false }); });
  await page.waitForTimeout(300);
  const px = async (x, y) => page.evaluate(async ([x, y]) => { const M = await import('./src/map/map.js'); const crs = await import('./src/core/crs.js'); const w = crs.toWGS84('EPSG:26191', [x, y]); const p = M.toPixel(w.lat, w.lon); const r = document.getElementById('map').getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; }, [x, y]);
  // 1er sommet : 3 px à côté du point 77 → doit être accroché exactement
  let [cx, cy] = await px(400000, 380000); await page.mouse.click(cx + 3, cy - 2); await page.waitForTimeout(300);
  [cx, cy] = await px(400020, 380000); await page.mouse.click(cx, cy); await page.waitForTimeout(300);
  [cx, cy] = await px(400020, 380030); await page.mouse.click(cx, cy); await page.waitForTimeout(300);
  [cx, cy] = await px(400000, 380000); await page.mouse.click(cx + 2, cy + 2); // fermeture
  await page.waitForSelector('.toast:has-text("Parcelle fermée")');
  await page.waitForFunction(() => /\/manual$/.test(location.hash));
  const v = await page.evaluate(async () => { const st = await import('./src/state.js'); const p = st.state.features.find((f) => f.type === 'parcel'); return { n: p.vertices.length, v0: p.vertices[0] }; });
  assert(v.n === 3, `sommets ${v.n}`);
  assert(v.v0.x === 400000 && v.v0.y === 380000 && v.v0.label === '77', JSON.stringify(v.v0));
  await ctx.close();
  return '1er sommet accroché exactement au point 77, parcelle fermée au toucher du 1er sommet';
});

await test('Partage : 3 personnes (1/8, 7/16, 7/16), propositions, lots colorés, rapport PDF', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/map' });
  const pid = await seed(page, async () => {
    const st = await import('./src/state.js');
    const c = [[386512.35, 371204.88], [386640.12, 371198.40], [386702.91, 371301.77], [386655.03, 371402.15], [386530.66, 371388.09], [386480.20, 371290.51]];
    const p = await st.addFeature({ type: 'parcel', name: 'Melk', crsId: 'EPSG:26191', method: 'auto', vertices: c.map(([x, y], i) => ({ x, y, label: `B${i + 1}` })) });
    return p.id;
  });
  await page.goto(BASE + `#/parcels/${pid}/share`);
  await page.waitForSelector('.owner-row');
  await page.click('button:has-text("Ajouter une personne")');
  const names = page.locator('.owner-row input[type=text]:not(.share-in)');
  const shares = page.locator('.owner-row input.share-in');
  for (const [i, [n, s]] of [['Fatima', '1/8'], ['Ahmed', '7/16'], ['Khadija', '7/16']].entries()) { await names.nth(i).fill(n); await shares.nth(i).fill(s); }
  await page.waitForSelector('.share-sum.ok');
  await page.selectOption('select[aria-label="Côté d’accès"]', '0');
  await page.click('button:has-text("Proposer des découpages")');
  await page.waitForSelector('.prop-card[aria-pressed="true"]');
  const nprops = await page.locator('.prop-card').count();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-partage-propositions.png') });
  await page.click('button:has-text("Générer les parcelles")');
  await page.waitForSelector('.toast:has-text("3 lots créés")');
  const lots = await page.evaluate(async (pid) => {
    const st = await import('./src/state.js'); const P = await import('./src/core/parcel.js');
    return st.state.features.filter((f) => f.parentId === pid).map((f) => ({ n: f.owner.name, c: f.owner.color, a: P.analyzeParcel(f.vertices, f.crsId, { method: 'plane' }).planeArea }));
  }, pid);
  const total = lots.reduce((s, l) => s + l.a, 0);
  assert(lots.length === 3 && new Set(lots.map((l) => l.c)).size === 3, JSON.stringify(lots));
  assert(Math.abs(lots[0].a / total - 0.125) < 1e-9 && Math.abs(lots[1].a / total - 0.4375) < 1e-9, JSON.stringify(lots));
  await page.goto(BASE + '#/map'); await page.waitForTimeout(400);
  await page.evaluate(async (pid) => { const M = await import('./src/map/map.js'); const st = await import('./src/state.js'); M.zoomToFeature(st.state.features.find((f) => f.id === pid)); }, pid);
  await page.waitForTimeout(500);
  const labels = await page.locator('.parcel-label.owned').count();
  assert(labels === 3, `étiquettes ${labels}`);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-partage-carte.png') });
  await page.goto(BASE + `#/parcels/${pid}/share`);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('button:has-text("Rapport de partage (PDF)")')]);
  const buf = fs.readFileSync(await dl.path());
  assert(buf.subarray(0, 5).toString() === '%PDF-', 'PDF');
  fs.writeFileSync(path.join(SHOTS, 'rapport-partage.pdf'), buf);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `${nprops} propositions ; lots ${lots.map((l) => `${l.n} ${l.a.toFixed(2)} m²`).join(', ')} ; PDF ${buf.length} octets`;
});

await test('Fiche projet : statistiques et superficie par personne', async () => {
  const { page, ctx } = await newPage({ hash: '#/map' });
  const id = await seed(page, async () => {
    const st = await import('./src/state.js');
    const p = await st.createProject({ name: 'Projet fiche' });
    await st.addFeature({ type: 'parcel', name: 'A', crsId: 'EPSG:26191', owner: { name: 'Youssef', percent: 100, color: '#e6194b' }, vertices: [[400000, 380000], [400010, 380000], [400010, 380010], [400000, 380010]].map(([x, y]) => ({ x, y })) });
    return p.id;
  });
  await page.goto(BASE + `#/projects/${id}`);
  await page.waitForSelector('.project-hero h3:has-text("Projet fiche")');
  const t = await text(page, '.stats');
  assert(/100,00 m²/.test(t) && /Personnes/.test(t), t);
  await page.waitForSelector('td:has-text("Youssef")');
  await page.screenshot({ path: path.join(SHOTS, 'mobile-fiche-projet.png') });
  await ctx.close();
});

await test('Satellite : au-delà de l’imagerie disponible, image agrandie au lieu d’une zone vide', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/map' });
  const PH = Buffer.alloc(2521, 7);
  await page.route(/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery/, (route) => {
    const z = Number(route.request().url().match(/tile\/(\d+)\//)[1]);
    if (z >= 19) route.fulfill({ status: 200, contentType: 'image/jpeg', body: PH, headers: { 'access-control-allow-origin': '*' } });
    else route.fulfill({ status: 200, contentType: 'image/jpeg', body: FIXTURE, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.evaluate(async () => { const st = await import('./src/state.js'); await st.updateSettings({ basemap: 'sat' }); const M = await import('./src/map/map.js'); M.getMap().setView([31.45, -8.10], 21, { animate: false }); });
  await page.waitForSelector('#res-badge:not([hidden])', { timeout: 10000 });
  const badge = await text(page, '#res-badge');
  assert(/zoom 18/.test(badge), badge);
  const drawn = await page.evaluate(() => [...document.querySelectorAll('.leaflet-tile-loaded')].filter((c) => c.tagName === 'CANVAS').length);
  assert(drawn > 0, 'aucune tuile dessinée');
  // couleur du pixel central = image agrandie (vert), pas la tuile vide
  const px = await page.evaluate(() => { const c = document.querySelector('canvas.leaflet-tile-loaded'); const d = c.getContext('2d').getImageData(128, 128, 1, 1).data; return [d[0], d[1], d[2]]; });
  assert(px[1] > px[0] && px[1] > 100, JSON.stringify(px));
  await page.screenshot({ path: path.join(SHOTS, 'mobile-satellite-zoom21.png') });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `${drawn} tuiles affichées au zoom 21, ${badge}`;
});

// ------------------------------------------------------------------------------------------ v1.2
/** Tuile Terrarium synthétique : plan incliné de 10 % montant vers l'est (altitude 500 m au centre). */
async function demRoute(page) {
  await page.route(/elevation-tiles-prod\/terrarium/, async (route) => {
    const [z, x, y] = route.request().url().match(/terrarium\/(\d+)\/(\d+)\/(\d+)/).slice(1).map(Number);
    const png = await page.evaluate(async ([z, x, y]) => {
      const T = await import('./src/core/terrain.js');
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const ctx = c.getContext('2d'); const img = ctx.createImageData(256, 256);
      const ref = T.lonLatToPixel(z, -8.1, 31.45);
      for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
        const px = x * 256 + i + 0.5;
        const east = (px - ref.x) * T.pixelSize(z, 31.45);
        const v = 500 + 0.10 * east + 32768;
        const k = 4 * (j * 256 + i);
        img.data[k] = Math.floor(v / 256); img.data[k + 1] = Math.floor(v % 256); img.data[k + 2] = Math.round((v - Math.floor(v)) * 256); img.data[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    }, [z, x, y]);
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(png, 'base64'), headers: { 'access-control-allow-origin': '*' } });
  });
}

await test('Déplacer un point en édition (glisser sur la carte) + sommet de parcelle lié', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/map' });
  const ids = await seed(page, async () => {
    const st = await import('./src/state.js'); const crs = await import('./src/core/crs.js');
    const w = crs.toWGS84('EPSG:26191', [400000, 380000]);
    const pt = await st.addFeature({ type: 'point', num: '9', code: 'borne', wgs84: { lat: w.lat, lon: w.lon }, input: { crsId: 'EPSG:26191', x: 400000, y: 380000 }, source: 'gps', accuracy: 4 });
    const pa = await st.addFeature({ type: 'parcel', name: 'P', crsId: 'EPSG:26191', vertices: [{ x: 400000, y: 380000, pointId: pt.id, label: '9' }, { x: 400010, y: 380000 }, { x: 400010, y: 380010 }, { x: 400000, y: 380010 }] });
    return { pt: pt.id, pa: pa.id };
  });
  await page.evaluate(async (id) => { const s = await import('./src/ui/survey.js'); const st = await import('./src/state.js'); s.editPoint(st.state.features.find((f) => f.id === id)); }, ids.pt);
  await page.click('.modal button:has-text("Déplacer sur la carte")');
  await page.waitForSelector('#action-bar button:has-text("Valider")');
  // nouvelle position : 3 m à l'est (via le réticule)
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); const crs = await import('./src/core/crs.js'); const w = crs.toWGS84('EPSG:26191', [400003, 380000]); M.getMap().setView([w.lat, w.lon], 20, { animate: false }); });
  await page.click('#action-bar button:has-text("Au réticule")');
  await page.click('#action-bar button:has-text("Valider")');
  await page.waitForSelector('.modal:has-text("Mettre à jour les parcelles")');
  await page.click('.modal-actions button:has-text("Mettre à jour")');
  await page.waitForSelector('.toast:has-text("déplacé")');
  const r = await page.evaluate(async (ids) => {
    const st = await import('./src/state.js'); const P = await import('./src/core/parcel.js');
    const pt = st.state.features.find((f) => f.id === ids.pt), pa = st.state.features.find((f) => f.id === ids.pa);
    return { x: pt.input.x, y: pt.input.y, moves: pt.moves.length, vx: pa.vertices[0].x, area: P.analyzeParcel(pa.vertices, pa.crsId).area };
  }, ids);
  assert(Math.abs(r.x - 400003) < 0.05 && Math.abs(r.y - 380000) < 0.05, JSON.stringify(r));
  assert(r.moves === 1 && Math.abs(r.vx - r.x) < 1e-9, JSON.stringify(r));
  assert(Math.abs(r.area - 85) < 1, `superficie ${r.area}`);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `point déplacé à X=${r.x.toFixed(2)} ; sommet lié suivi ; nouvelle superficie ${r.area.toFixed(2)} m²`;
});

await test('Couches par projet : superposition d’un 2e projet, activation/désactivation', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/map' });
  await seed(page, async () => {
    const st = await import('./src/state.js');
    await st.createProject({ name: 'Projet Nord' });
    await st.addFeature({ type: 'parcel', name: 'N1', crsId: 'EPSG:26191', vertices: [[400000, 380100], [400050, 380100], [400050, 380150], [400000, 380150]].map(([x, y]) => ({ x, y })) });
    await st.createProject({ name: 'Projet Sud' });
    await st.addFeature({ type: 'parcel', name: 'S1', crsId: 'EPSG:26191', vertices: [[400000, 380000], [400050, 380000], [400050, 380050], [400000, 380050]].map(([x, y]) => ({ x, y })) });
  });
  await page.goto(BASE + '#/tools/layers');
  await page.waitForSelector('.proj-layer');
  assert(await page.locator('.proj-layer').count() === 2, 'deux projets listés');
  const other = page.locator('.proj-layer:not(.current)');
  await other.locator('.pl-head input[type=checkbox]').check();
  await until(page, async () => (await import('./src/map/map.js')).getMap().getPane('overlays').querySelectorAll('path').length > 0);
  await other.locator('button[aria-label^="Zoomer"]').click();
  await page.goto(BASE + '#/map'); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-couches-projets.png') });
  await page.goto(BASE + '#/tools/layers'); await page.waitForSelector('.proj-layer');
  await page.locator('.proj-layer:not(.current) .pl-head input[type=checkbox]').uncheck();
  await until(page, async () => (await import('./src/map/map.js')).getMap().getPane('overlays').querySelectorAll('path').length === 0);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return 'projet Nord superposé au projet Sud ouvert, puis masqué';
});

await test('Pente d’une parcelle (MNT) : plan incliné de 10 % → 10 %, exposition ouest', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/map' });
  await demRoute(page);
  const pid = await seed(page, async () => {
    const st = await import('./src/state.js');
    const d = 0.0006;
    const p = await st.addFeature({ type: 'parcel', name: 'Coteau', crsId: 'EPSG:4326', vertices: [[-8.1 - d, 31.45 - d], [-8.1 + d, 31.45 - d], [-8.1 + d, 31.45 + d], [-8.1 - d, 31.45 + d]].map(([x, y]) => ({ x, y })) });
    return p.id;
  });
  await page.goto(BASE + `#/parcels/${pid}`);
  await page.click('button:has-text("Calculer la pente (MNT)")');
  await page.waitForSelector('.terrain-box .stat-v', { timeout: 15000 });
  const t = await text(page, '.terrain-box');
  assert(/10,0 %/.test(t), t);
  assert(/ouest/.test(t), t);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-pente-parcelle.png') });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return t.replace(/\s+/g, ' ').slice(0, 160);
});

await test('Outil « Pente entre deux points » : profil et pente', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/tools/slope' });
  await demRoute(page);
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); M.getMap().setView([31.45, -8.1], 17, { animate: false }); });
  await page.waitForTimeout(300);
  const px = async (lon, lat) => page.evaluate(async ([lon, lat]) => { const M = await import('./src/map/map.js'); const p = M.toPixel(lat, lon); const r = document.getElementById('map').getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; }, [lon, lat]);
  let [x, y] = await px(-8.1008, 31.4505); await page.mouse.click(x, y); await page.waitForTimeout(200);
  [x, y] = await px(-8.0992, 31.4505); await page.mouse.click(x, y);
  await page.waitForSelector('.profile-svg', { timeout: 15000 });
  const t = await text(page, '.results');
  assert(/1[0-9],[0-9] m/.test(t) || /\+1[0-9]/.test(t), t);
  assert(/10,0 %|9,9 %|10,1 %/.test(t), t);
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return t.replace(/\s+/g, ' ').slice(0, 140);
});

await test('Projection automatique : Rabat (Lambert Nord) → Agadir (Lambert Sud), points enregistrés dans leur zone', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/survey' });
  await page.waitForSelector('.gps-card.st-active', { timeout: 8000 });
  await page.waitForSelector('#chip-crs:has-text("Lambert Nord") .chip-auto');
  await page.click('button:has-text("Enregistrer le point GPS")');
  await until(page, async () => (await import('./src/state.js')).state.features.filter((f) => f.type === 'point').length === 1);
  // Déplacement simulé vers Agadir (30,42° N)
  await ctx.setGeolocation({ latitude: 30.4202, longitude: -9.5982, accuracy: 4 });
  await page.waitForSelector('#chip-crs:has-text("Lambert Sud")', { timeout: 8000 });
  await page.waitForSelector('.toast:has-text("Lambert Sud Maroc")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Enregistrer le point GPS")');
  await until(page, async () => (await import('./src/state.js')).state.features.filter((f) => f.type === 'point').length === 2);
  const r = await page.evaluate(async () => {
    const st = await import('./src/state.js'); const crs = await import('./src/core/crs.js');
    const pts = st.state.features.filter((f) => f.type === 'point');
    return { s: st.state.settings, pts: pts.map((f) => ({ id: f.input.crsId, auto: f.input.zoneAuto, back: crs.toWGS84(f.input.crsId, [f.input.x, f.input.y]), w: f.wgs84 })) };
  });
  assert(r.s.displayCrs === 'EPSG:26192' && r.s.inputCrs === 'EPSG:26192', `réglages ${r.s.displayCrs} / ${r.s.inputCrs}`);
  assert(r.pts[0].id === 'EPSG:26191' && r.pts[1].id === 'EPSG:26192', r.pts.map((p) => p.id).join(', '));
  for (const p of r.pts) assert(p.auto && Math.abs(p.back.lat - p.w.lat) < 1e-7 && Math.abs(p.back.lon - p.w.lon) < 1e-7, 'aller-retour ' + JSON.stringify(p));
  await page.screenshot({ path: path.join(SHOTS, 'mobile-zone-auto.png') });
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return 'point 1 en EPSG:26191 (Rabat), point 2 en EPSG:26192 (Agadir), réglages basculés';
});

await test('Projection automatique sans GPS : « + Point » à Laâyoune → Lambert Sahara Nord ; choix manuel désactive l’automatique', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/map', denyGeo: true });
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); M.getMap().setView([27.1536, -13.2033], 16, { animate: false }); });
  await page.waitForSelector('#chip-crs:has-text("Sahara Nord")', { timeout: 5000 });
  await page.click('#btn-addpt');
  await page.click('#action-bar button:has-text("Placer ici")');
  await until(page, async () => (await import('./src/state.js')).state.features.filter((f) => f.source === 'map').length === 1);
  const id = await page.evaluate(async () => (await import('./src/state.js')).state.features.find((f) => f.source === 'map').input.crsId);
  assert(id === 'EPSG:26194', id);
  await page.click('#action-bar button:has-text("Terminer")');
  // Vue d'ensemble du pays : pas de bascule
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); M.zoomInitial(); });
  await page.waitForTimeout(600);
  assert(/Sahara Nord/.test(await text(page, '#chip-crs')), 'bascule en vue d’ensemble');
  // Choix manuel (puce) : UTM 28N fixe → automatique désactivé
  await page.click('#chip-crs');
  await page.uncheck('.modal label.switch input');
  await page.selectOption('.modal select.crs-select', 'EPSG:32628');
  await page.click('.modal-actions button:has-text("Appliquer")');
  await page.waitForSelector('#chip-crs:has-text("UTM 28N")');
  assert(await page.locator('#chip-crs .chip-auto').count() === 0, 'badge AUTO encore présent');
  await page.evaluate(async () => { const M = await import('./src/map/map.js'); M.getMap().setView([34.02, -6.85], 15, { animate: false }); });
  await page.waitForTimeout(600);
  assert(/UTM 28N/.test(await text(page, '#chip-crs')), 'le mode manuel a été écrasé');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return 'point carte en EPSG:26194 ; vue pays ignorée ; choix manuel respecté';
});

await test('Réglages : recalcul des points anciens dans leur zone', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/home', denyGeo: true });
  await seed(page, async () => {
    const st = await import('./src/state.js'); const crs = await import('./src/core/crs.js');
    const w = { lat: 30.42, lon: -9.6 }; const xy = crs.fromWGS84('EPSG:26191', w.lon, w.lat); // Agadir saisi à tort en zone Nord
    await st.addFeature({ type: 'point', num: '1', code: 'borne', wgs84: w, input: { crsId: 'EPSG:26191', x: xy[0], y: xy[1] }, source: 'gps' });
  });
  await page.goto(BASE + '#/settings');
  await page.waitForSelector('#zone-mismatch:has-text("1 point(s)")');
  await page.click('#zone-mismatch button:has-text("Recalculer dans leur zone")');
  await page.waitForSelector('#zone-mismatch:has-text("Tous les points")');
  const f = await page.evaluate(async () => (await import('./src/state.js')).state.features[0]);
  assert(f.input.crsId === 'EPSG:26192' && f.input.original?.crsId === 'EPSG:26191' && f.wgs84.lat === 30.42, JSON.stringify(f.input));
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `E ${f.input.x.toFixed(2)} N ${f.input.y.toFixed(2)} (Lambert Sud), ancienne valeur conservée`;
});

await test('Parcelles : afficher / masquer chacune, « uniquement celle-ci », lots masqués avec leur parcelle', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/parcels' });
  await seed(page, async () => {
    const st = await import('./src/state.js');
    const sq = (x0, y0) => [[x0, y0], [x0 + 20, y0], [x0 + 20, y0 + 20], [x0, y0 + 20]].map(([x, y]) => ({ x, y }));
    await st.addFeature({ type: 'parcel', name: 'Parcelle 1', crsId: 'EPSG:26191', method: 'plane', vertices: sq(400000, 380000) });
    const p2 = await st.addFeature({ type: 'parcel', name: 'Parcelle 2', crsId: 'EPSG:26191', method: 'plane', vertices: sq(400030, 380000) });
    await st.addFeature({ type: 'parcel', name: 'Parcelle 3', crsId: 'EPSG:26191', method: 'plane', vertices: sq(400060, 380000) });
    // lot de la parcelle 2
    await st.addFeature({ type: 'parcel', name: 'Lot A', parentId: p2.id, owner: { name: 'Ahmed', percent: 100, color: '#e53935' }, crsId: 'EPSG:26191', method: 'plane', vertices: sq(400030, 380000) });
  });
  const shown = () => page.evaluate(async () => { const M = await import('./src/map/map.js'); const n = []; M.getMap().eachLayer((l) => { if (l.options?.pane === 'parcels' && l.getLatLngs) n.push(l); }); return n.length; });
  await until(page, async () => document.querySelectorAll('.parcel-list .item').length === 4);
  assert(await shown() === 4, `au départ ${await shown()} parcelles dessinées`);
  // « Afficher uniquement celle-ci » depuis la fiche de la parcelle 1
  await page.click('.parcel-list .item-main:has-text("Parcelle 1")');
  await page.click('button:has-text("Afficher uniquement celle-ci")');
  await until(page, async () => (await import('./src/state.js')).state.features.filter((f) => f.hidden).length === 2);
  assert(await shown() === 1, `uniquement P1 : ${await shown()} dessinée(s)`);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-parcelle-seule.png') });
  // Liste : la parcelle 2 et son lot apparaissent masqués ; œil → réaffiche P2 et son lot
  await page.goto(BASE + '#/parcels');
  await page.waitForSelector('.vis-bar:has-text("3 parcelle(s) masquée(s)")');
  await page.click('.parcel-list .item:has-text("Parcelle 2") .vis-btn');
  await until(page, async () => { const M = await import('./src/map/map.js'); let n = 0; M.getMap().eachLayer((l) => { if (l.options?.pane === 'parcels' && l.getLatLngs) n++; }); return n === 3; });
  // Outils → Couches : case de la parcelle 1 décochée
  await page.goto(BASE + '#/tools/layers');
  await page.waitForSelector('.parcel-vis:has-text("Parcelles affichées : 3 / 4")');
  await page.locator('.parcel-vis label.switch:has-text("Parcelle 1") input').uncheck();
  await page.waitForSelector('.parcel-vis:has-text("Parcelles affichées : 2 / 4")');
  assert(await shown() === 2, `après décochage : ${await shown()}`);
  await page.click('.parcel-vis button:has-text("Tout afficher")');
  await page.waitForSelector('.parcel-vis:has-text("Parcelles affichées : 4 / 4")');
  assert(await shown() === 4, `tout afficher : ${await shown()}`);
  // Persistance du masquage après rechargement
  await page.locator('.parcel-vis label.switch:has-text("Parcelle 3") input').uncheck();
  await page.waitForSelector('.parcel-vis:has-text("3 / 4")');
  await page.reload(); await page.waitForSelector('body:not(.booting)');
  await until(page, async () => (await import('./src/state.js')).state.features.some((f) => f.name === 'Parcelle 3' && f.hidden));
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return 'seule P1 → 1 tracé ; P2 + lot réaffichés ; couches 2/4 → 4/4 ; masquage conservé après rechargement';
});

await test('Page « Version de l’application » (accueil, réglages, aide)', async () => {
  const { page, ctx, errors } = await newPage({ hash: '#/home' });
  await page.waitForSelector('.version-tag');
  const v = await text(page, '.version-tag');
  assert(/v1\.4\.0/.test(v), v);
  await page.click('.version-tag');
  await page.waitForSelector('#about-version:has-text("Version 1.4.0")');
  await page.waitForSelector('.about-kv dt:has-text("Publication")');
  await page.waitForSelector('.changelog.current:has-text("v1.4.0")');
  const n = await page.locator('.changelog').count();
  assert(n >= 5, `${n} versions dans l’historique`);
  await page.click('button:has-text("Rechercher une mise à jour")');
  await page.waitForFunction(() => !/Vérification/.test(document.querySelector('[aria-live=polite]')?.textContent ?? 'Vérification'));
  const st = await text(page, '[aria-live=polite]');
  await page.screenshot({ path: path.join(SHOTS, 'mobile-version.png') });
  await page.goto(BASE + '#/settings'); await page.waitForSelector('a[href="#/about"]');
  await page.goto(BASE + '#/help'); await page.waitForSelector('summary:has-text("Version v1.4.0")');
  assert(errors.length === 0, errors.join(' | '));
  await ctx.close();
  return `${v} · ${n} versions · « ${st} »`;
});

await test('Smartphone iOS / Android réels', null, { skip: 'aucun appareil physique disponible dans l’environnement de test : à valider sur le terrain (Safari iOS, Chrome Android)' });
await test('Installation PWA sur l’écran d’accueil', null, { skip: 'nécessite une interaction utilisateur sur un appareil réel ; critères vérifiés automatiquement (manifeste, icônes, service worker, HTTPS)' });

await browser.close();
const summary = { base: BASE, date: new Date().toISOString(), passed: results.filter((r) => r.status === 'réussi').length, failed: results.filter((r) => r.status === 'échoué').length, skipped: results.filter((r) => r.status === 'non exécuté').length, results };
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(`\nRésultat : ${summary.passed} réussi(s), ${summary.failed} échoué(s), ${summary.skipped} non exécuté(s)`);
process.exit(summary.failed ? 1 : 0);
