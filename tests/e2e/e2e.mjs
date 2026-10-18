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
  for (const [dx, dy] of [[-60, -200], [60, -200], [60, -100], [-60, -100]]) { await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy); await page.waitForTimeout(300); }
  await page.waitForFunction(() => document.querySelectorAll('.vx-icon').length === 4);
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

await test('Smartphone iOS / Android réels', null, { skip: 'aucun appareil physique disponible dans l’environnement de test : à valider sur le terrain (Safari iOS, Chrome Android)' });
await test('Installation PWA sur l’écran d’accueil', null, { skip: 'nécessite une interaction utilisateur sur un appareil réel ; critères vérifiés automatiquement (manifeste, icônes, service worker, HTTPS)' });

await browser.close();
const summary = { base: BASE, date: new Date().toISOString(), passed: results.filter((r) => r.status === 'réussi').length, failed: results.filter((r) => r.status === 'échoué').length, skipped: results.filter((r) => r.status === 'non exécuté').length, results };
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(`\nRésultat : ${summary.passed} réussi(s), ${summary.failed} échoué(s), ${summary.skipped} non exécuté(s)`);
process.exit(summary.failed ? 1 : 0);
