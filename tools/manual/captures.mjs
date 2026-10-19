// Captures d'écran du manuel utilisateur (navigateur réel Chromium via Playwright, GPS simulé).
// Usage : node tools/manual/captures.mjs [URL de base] [dossier de sortie]
// Les données affichées sont un projet de démonstration créé par ce script.
import fs from 'node:fs';
import path from 'node:path';

let pw;
try { pw = await import('playwright'); } catch {
  pw = (await import('/home/claude/.npm-global/lib/node_modules/playwright/index.js')).default;
}
const { chromium } = pw;
const BASE = (process.argv.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:8080/').replace(/\/?$/, '/');
const OUT = process.argv.slice(2).find((a) => !/^https?:/.test(a) && !a.startsWith('--')) ?? 'docs/manuel/captures';
const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
fs.mkdirSync(OUT, { recursive: true });

const SITE = { latitude: 33.93410, longitude: -6.62590 }; // position simulée, près de la parcelle de démonstration
const browser = await chromium.launch({ executablePath: exe });
const log = [];
const NO_TOAST = '#toasts{display:none!important}';

async function newPage({ vp = { width: 390, height: 844 }, mobile = true, scheme = 'light', geo = SITE } = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, locale: 'fr-FR', colorScheme: scheme, permissions: ['geolocation'], geolocation: { ...geo, accuracy: 3.2 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '#/home', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body:not(.booting)', { timeout: 20000 });
  return { ctx, page };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const go = async (page, hash, wait = 700) => { await page.goto(BASE + hash); await page.reload(); await page.waitForSelector('body:not(.booting)'); await page.waitForTimeout(wait); };
const snap = (page, st) => ev(page, async (st) => { (await import('./src/state.js')).emit('sheet-snap', st); }, st);
async function tiles(page, ms = 6000) {
  // attend le chargement des tuiles visibles (ou l'échec), sans bloquer indéfiniment
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const busy = await page.evaluate(() => document.querySelectorAll('.leaflet-tile-container img:not(.leaflet-tile-loaded)').length);
    if (!busy) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);
}
async function shot(page, name, { toasts = false, wait = 250 } = {}) {
  const css = toasts ? '' : NO_TOAST;
  const h = css ? await page.addStyleTag({ content: css }) : null;
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  if (h) await h.evaluate((e) => e.remove());
  log.push(name);
  console.log('✔', name);
}
async function step(name, fn) {
  try { await fn(); } catch (e) { console.log('✘', name, String(e?.message ?? e).split('\n')[0]); log.push(`ÉCHEC ${name}`); }
}

// ------------------------------------------------------------------------------------------
// Projet de démonstration
const DEMO = async () => {
  const st = await import('./src/state.js'); const crs = await import('./src/core/crs.js');
  await st.updateSettings({ onboarded: true, basemap: 'sat' });
  await st.createProject({ name: 'Lotissement Ouled Ali (démo)', notes: 'Projet de démonstration du manuel' });
  const C = [[386512.35, 371204.88], [386640.12, 371198.40], [386702.91, 371301.77], [386655.03, 371402.15], [386530.66, 371388.09], [386480.20, 371290.51]];
  const ids = [];
  let n = 1;
  for (const [x, y] of C) {
    const w = crs.toWGS84('EPSG:26191', [x, y]);
    const p = await st.addFeature({ type: 'point', num: String(n), name: `B${n}`, code: 'borne', description: 'Borne en béton', wgs84: { lat: w.lat, lon: w.lon }, input: { crsId: 'EPSG:26191', x, y, zoneAuto: true }, accuracy: 2.4 + n * 0.3, source: 'gps', takenAt: new Date().toISOString() }, 'démo');
    ids.push(p.id); n++;
  }
  for (const [x, y, code, name] of [[386590, 371300, 'puits', 'Puits'], [386560, 371250, 'arbre', 'Olivier'], [386620, 371350, 'batiment', 'Abri']]) {
    const w = crs.toWGS84('EPSG:26191', [x, y]);
    await st.addFeature({ type: 'point', num: String(n++), name, code, wgs84: { lat: w.lat, lon: w.lon }, input: { crsId: 'EPSG:26191', x, y, zoneAuto: true }, accuracy: 3.1, source: 'gps', takenAt: new Date().toISOString() }, 'démo');
  }
  const melk = await st.addFeature({ type: 'parcel', name: 'Melk Ouled Ali', crsId: 'EPSG:26191', method: 'auto', source: 'gps', vertices: C.map(([x, y], i) => ({ x, y, label: `B${i + 1}`, pointId: ids[i] })) }, 'démo');
  const P2 = [[386702.91, 371301.77], [386790.40, 371310.20], [386770.10, 371420.66], [386655.03, 371402.15]];
  await st.addFeature({ type: 'parcel', name: 'Parcelle Est', crsId: 'EPSG:26191', method: 'auto', source: 'manual', vertices: P2.map(([x, y], i) => ({ x, y, label: `E${i + 1}` })) }, 'démo');
  const P3 = [[386480.20, 371290.51], [386530.66, 371388.09], [386440.00, 371420.00], [386400.30, 371320.00]];
  await st.addFeature({ type: 'parcel', name: 'Parcelle Ouest', crsId: 'EPSG:26191', method: 'auto', source: 'draw', vertices: P3.map(([x, y], i) => ({ x, y, label: `O${i + 1}` })) }, 'démo');
  // second projet (superposition)
  return melk.id;
};

const { ctx, page } = await newPage();
const melkId = await ev(page, DEMO);
const otherId = await ev(page, async () => {
  const st = await import('./src/state.js'); const cur = st.state.project.id;
  const p = await st.createProject({ name: 'Relevé voisin 2025' });
  await st.addFeature({ type: 'parcel', name: 'Voisin Nord', crsId: 'EPSG:26191', vertices: [[386500, 371440], [386700, 371450], [386690, 371530], [386510, 371520]].map(([x, y]) => ({ x, y })) });
  await st.openProject(cur);
  return p.id;
});
// vues fixes (centre de la zone de démonstration) : cadrage identique d'une capture à l'autre
const view = (p, z, dy = 0) => ev(p, async ([z, dy]) => { const M = await import('./src/map/map.js'); const m = M.getMap(); m.setView([33.93445 + dy, -6.62470], z, { animate: false }); }, [z, dy]);
const zoomMelk = () => view(page, 17, -0.0015);
const zoomAll = () => view(page, 17, 0);
// GPS « vivant » : une nouvelle position toutes les 3 s (évite l'état « signal perdu » sur les captures)
let gpsPos = { ...SITE };
const keepAlive = setInterval(() => { ctx.setGeolocation({ ...gpsPos, accuracy: 3.2 }).catch(() => {}); }, 3000);

await step('accueil', async () => { await go(page, '#/home', 1200); await shot(page, '01-accueil'); });
await step('carte-sat', async () => {
  await go(page, '#/map'); await zoomAll(); await tiles(page, 9000); await shot(page, '02-carte-satellite');
});
await step('carte-plan', async () => {
  await ev(page, async () => (await import('./src/state.js')).updateSettings({ basemap: 'osm' }));
  await tiles(page, 9000); await shot(page, '03-carte-plan');
  await ev(page, async () => (await import('./src/state.js')).updateSettings({ basemap: 'sat' }));
});
await step('popup-coord', async () => {
  await go(page, '#/map'); await zoomAll(); await tiles(page);
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + 200);
  await page.waitForSelector('.pi-tbl', { timeout: 4000 });
  await shot(page, '04-carte-coordonnees');
  await ev(page, async () => (await import('./src/map/map.js')).closePopup());
});
await step('projection', async () => {
  await page.click('#chip-crs'); await page.waitForSelector('.modal');
  await shot(page, '05-projection-auto');
  await page.click('.modal-actions button:has-text("Annuler")');
});
await step('projets', async () => {
  await go(page, '#/projects', 900); await snap(page, 'max'); await shot(page, '06-projets', { wait: 600 });
  await go(page, `#/projects/${await ev(page, async () => (await import('./src/state.js')).state.project.id)}`, 900); await snap(page, 'max'); await shot(page, '07-fiche-projet', { wait: 600 });
});
await step('nouveau-projet', async () => {
  await go(page, '#/projects', 600);
  await page.click('button:has-text("Créer un projet")'); await page.waitForSelector('.modal');
  await page.fill('.modal input[placeholder^="ex. Lotissement"]', 'Bornage parcelle Tiznit');
  await shot(page, '08-nouveau-projet');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
});
// ------------------------------------------------------------------ Navigation
await step('nav', async () => {
  await go(page, '#/nav', 900);
  const t = await ev(page, async () => { const crs = await import('./src/core/crs.js'); const xy = [386655.03, 371402.15]; return xy.map((v) => v.toFixed(2).replace('.', ',')); });
  await page.selectOption('.coord-input select', 'EPSG:26191');
  const inputs = page.locator('.coord-input input[type=text]');
  await inputs.nth(0).fill(t[0]); await inputs.nth(1).fill(t[1]);
  await page.fill('input[placeholder="ex. Borne B12"]', 'Borne B4');
  await snap(page, 'max'); await shot(page, '09-navigation-saisie', { wait: 600 });
  await page.click('button:has-text("Démarrer la navigation")');
  await page.waitForSelector('.nav-distance'); await page.waitForTimeout(1500);
  await snap(page, 'mid'); await tiles(page); await shot(page, '10-navigation-en-cours', { wait: 600 });
  await page.click('button:has-text("Plein écran simplifié")'); await page.waitForSelector('#nav-full');
  await shot(page, '11-navigation-plein-ecran', { wait: 700 });
  // arrivée : position à 2 m de la cible
  const near = await ev(page, async () => { const crs = await import('./src/core/crs.js'); const geo = await import('./src/core/geodesy.js'); const w = crs.toWGS84('EPSG:26191', [386655.03, 371402.15]); return geo.direct(w.lat, w.lon, 200, 2); });
  gpsPos = { latitude: near.lat, longitude: near.lon }; await ctx.setGeolocation({ ...gpsPos, accuracy: 2.8 });
  await page.waitForSelector('#nav-full.arrived', { timeout: 8000 });
  await shot(page, '12-navigation-arrivee', { wait: 600 });
  await page.click('#nav-full button:has-text("Quitter")');
  await page.waitForSelector('#nav-full', { state: 'detached' });
  gpsPos = { ...SITE }; await ctx.setGeolocation({ ...SITE, accuracy: 3.2 });
});
// ------------------------------------------------------------------ Levé
await step('leve', async () => {
  await go(page, '#/survey', 1500); await page.waitForSelector('.gps-card.st-active', { timeout: 10000 });
  await zoomMelk(); await tiles(page);
  await shot(page, '13-leve-gps', { wait: 500 });
  await snap(page, 'max'); await page.waitForTimeout(400);
  await ev(page, () => document.querySelector('.point-list')?.scrollIntoView());
  await shot(page, '14-leve-liste', { wait: 400 });
  await snap(page, 'mid');
  await page.click('button:has-text("Saisie manuelle")'); await page.waitForSelector('.modal');
  await shot(page, '15-saisie-manuelle');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await ev(page, async () => { const s = await import('./src/ui/survey.js'); const st = await import('./src/state.js'); s.editPoint(st.state.features.find((f) => f.type === 'point' && f.num === '7')); });
  await page.waitForSelector('.modal'); await shot(page, '16-modifier-point');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
});
// ------------------------------------------------------------------ Outils carte
await step('plus-point', async () => {
  await go(page, '#/map'); await zoomMelk(); await tiles(page);
  await page.click('#btn-addpt'); await page.waitForSelector('#action-bar:not([hidden])');
  await shot(page, '17-ajout-point-carte');
  await page.click('#action-bar button:has-text("Terminer")');
});
await step('selection', async () => {
  await page.click('#btn-select'); await page.waitForSelector('#action-bar:not([hidden])');
  await ev(page, async () => { const M = await import('./src/map/map.js'); const st = await import('./src/state.js'); M.selectIds(st.state.features.filter((f) => f.type === 'point' && f.code === 'borne').map((f) => f.id)); });
  await shot(page, '18-selection-multiple', { wait: 500 });
  await page.click('#action-bar button[aria-label="Terminer la sélection"]');
});
// ------------------------------------------------------------------ Parcelles
await step('parcelles', async () => {
  await go(page, '#/parcels', 900); await snap(page, 'max');
  await ev(page, () => document.querySelectorAll('.parcel-list .item input[type=checkbox]').forEach((c, i) => { if (i < 2) c.click(); }));
  await shot(page, '19-parcelles-liste', { wait: 600 });
  await page.click('button:has-text("Nouvelle parcelle")'); await page.waitForSelector('.modal');
  await shot(page, '20-nouvelle-parcelle');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
});
await step('editeur', async () => {
  await go(page, `#/parcels/${melkId}`, 1200); await tiles(page);
  await shot(page, '21-parcelle-carte', { wait: 500 });
  await snap(page, 'max'); await page.waitForTimeout(500);
  await shot(page, '22-parcelle-resultats');
  await ev(page, () => document.querySelector('table.vtx')?.scrollIntoView({ block: 'start' }));
  await shot(page, '23-parcelle-sommets', { wait: 400 });
  // relief (MNT en ligne)
  await ev(page, () => document.querySelector('.terrain-box')?.scrollIntoView({ block: 'start' }));
  const b = page.locator('button:has-text("Calculer la pente (MNT)")');
  if (await b.count()) { await b.click(); await page.waitForSelector('.terrain-box .stat-v', { timeout: 20000 }); }
  await ev(page, () => document.querySelector('.terrain-box')?.scrollIntoView({ block: 'start' }));
  await shot(page, '24-parcelle-pente', { wait: 500 });
});
await step('dessin', async () => {
  await go(page, `#/parcels/${melkId}/draw`, 1200); await zoomMelk(); await tiles(page);
  await shot(page, '25-parcelle-dessin', { wait: 500 });
});
await step('partage', async () => {
  await go(page, `#/parcels/${melkId}/share`, 900);
  await page.waitForSelector('.owner-row');
  await page.click('button:has-text("Ajouter une personne")');
  const names = page.locator('.owner-row input[type=text]:not(.share-in)');
  const shares = page.locator('.owner-row input.share-in');
  for (const [i, [n, s]] of [['Fatima', '1/8'], ['Ahmed', '7/16'], ['Khadija', '7/16']].entries()) { await names.nth(i).fill(n); await shares.nth(i).fill(s); }
  await page.waitForSelector('.share-sum.ok');
  await snap(page, 'max'); await shot(page, '26-partage-personnes', { wait: 500 });
  await page.selectOption('select[aria-label="Côté d’accès"]', '0');
  await page.click('button:has-text("Proposer des découpages")');
  await page.waitForSelector('.prop-card[aria-pressed="true"]');
  await ev(page, () => document.querySelector('.prop-card')?.scrollIntoView({ block: 'start' }));
  await shot(page, '27-partage-propositions', { wait: 500 });
  await snap(page, 'min'); await tiles(page); await shot(page, '28-partage-apercu', { wait: 500 });
  await snap(page, 'max');
  await page.click('button:has-text("Générer les parcelles")');
  await page.waitForTimeout(1500);
  await go(page, '#/map'); await zoomMelk(); await tiles(page);
  await shot(page, '29-partage-lots-carte', { wait: 800 });
});
await step('visibilite', async () => {
  await go(page, `#/parcels/${melkId}`, 900);
  await page.click('button:has-text("Afficher uniquement celle-ci")'); await page.waitForTimeout(600);
  await go(page, '#/parcels', 900); await snap(page, 'max'); await shot(page, '30-parcelles-visibilite', { wait: 600 });
  await ev(page, async () => { const st = await import('./src/state.js'); await st.setHidden(st.state.features.map((f) => f.id), false); });
});
// ------------------------------------------------------------------ Outils
await step('outils', async () => {
  await go(page, '#/tools', 900); await snap(page, 'max'); await shot(page, '31-outils', { wait: 500 });
  await go(page, '#/tools/convert', 700);
  await page.selectOption('.coord-input select', 'EPSG:26191');
  const inputs = page.locator('.coord-input input[type=text]');
  await inputs.nth(0).fill('386512,35'); await inputs.nth(1).fill('371204,88');
  await page.waitForSelector('.conv-out table'); await snap(page, 'max');
  await shot(page, '32-convertisseur', { wait: 500 });
  await go(page, '#/tools/measure-area', 900); await zoomMelk(); await tiles(page);
  const box = await page.locator('#map').boundingBox();
  for (const [fx, fy] of [[0.22, 0.14], [0.68, 0.12], [0.8, 0.3], [0.32, 0.38]]) { await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await page.waitForTimeout(300); }
  await page.waitForFunction(() => !/—/.test(document.querySelector('.results .value')?.textContent ?? '—'), null, { timeout: 5000 }).catch(() => {});
  await shot(page, '33-mesure-superficie', { wait: 500 });
  await go(page, '#/tools/slope', 900); await zoomMelk(); await tiles(page);
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3); await page.waitForTimeout(300);
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.22);
  await page.waitForSelector('.profile-svg', { timeout: 20000 });
  await snap(page, 'max'); await ev(page, () => document.querySelector('.results')?.scrollIntoView({ block: 'start' }));
  await shot(page, '34-pente-profil', { wait: 500 });
  await go(page, '#/tools/magnetic', 700); await snap(page, 'max'); await shot(page, '35-declinaison', { wait: 500 });
});
await step('couches', async () => {
  await ev(page, async (id) => { const st = await import('./src/state.js'); const all = { ...(st.state.settings.projectLayers ?? {}) }; all[id] = { on: true, points: true, parcels: true, lines: true }; await st.updateSettings({ projectLayers: all }); }, otherId);
  await go(page, '#/tools/layers', 900); await snap(page, 'max'); await shot(page, '36-couches-fonds', { wait: 500 });
  await ev(page, () => document.querySelector('.proj-layer')?.scrollIntoView({ block: 'start' }));
  await shot(page, '37-couches-projets', { wait: 400 });
  await go(page, '#/map'); await zoomAll(); await ev(page, async () => { const M = await import('./src/map/map.js'); M.getMap().zoomOut(1, { animate: false }); }); await tiles(page);
  await shot(page, '38-superposition-projets', { wait: 800 });
});
// ------------------------------------------------------------------ Import / export / réglages / aide / version
await step('import-export', async () => {
  await go(page, '#/projects', 800);
  await page.evaluate(() => { const d = document.querySelector('details.group'); if (d) d.open = true; });
  await page.click('button:has-text("Exporter les données")'); await page.waitForSelector('.modal');
  await shot(page, '39-export'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const csv = 'Point;X;Y;Code\nB1;386512,35;371204,88;borne\nB2;386640,12;371198,40;borne\nB3;386702,91;371301,77;borne\n';
  const tmp = path.join(OUT, '..', 'import-demo.csv'); fs.writeFileSync(tmp, csv);
  page.once('filechooser', (fc) => fc.setFiles(tmp));
  await page.click('button:has-text("Importer des données")'); await page.waitForSelector('.modal:has-text("Importer")');
  await page.selectOption('.modal select.crs-select', 'EPSG:26191');
  await shot(page, '40-import', { wait: 600 });
  await page.keyboard.press('Escape'); fs.unlinkSync(tmp);
});
await step('reglages', async () => {
  await go(page, '#/settings', 800); await snap(page, 'max'); await shot(page, '41-reglages', { wait: 500 });
  await go(page, '#/help', 800); await snap(page, 'max'); await shot(page, '42-aide', { wait: 500 });
  await go(page, '#/about', 1200); await snap(page, 'max'); await shot(page, '43-version', { wait: 500 });
});
await step('rapport-pdf', async () => {
  await go(page, `#/parcels/${melkId}`, 900);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('button:has-text("Rapport PDF")')]);
  fs.copyFileSync(await dl.path(), path.join(OUT, '44-rapport-parcelle.pdf')); log.push('44-rapport-parcelle.pdf');
  await go(page, `#/parcels/${melkId}/share`, 900);
  const b = page.locator('button:has-text("Rapport de partage (PDF)")');
  if (await b.count()) {
    const [d2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), b.click()]);
    fs.copyFileSync(await d2.path(), path.join(OUT, '45-rapport-partage.pdf')); log.push('45-rapport-partage.pdf');
  }
});
clearInterval(keepAlive);
await ctx.close();

// ------------------------------------------------------------------ Ordinateur, tablette, mode sombre
await step('ordinateur', async () => {
  const { ctx: c2, page: p2 } = await newPage({ vp: { width: 1440, height: 900 }, mobile: false });
  const id = await ev(p2, DEMO);
  await go(p2, `#/parcels/${id}`, 1200); await view(p2, 18, -0.0002); await tiles(p2, 9000);
  await shot(p2, '46-ordinateur-parcelle', { wait: 800 });
  await c2.close();
});
await step('sombre', async () => {
  const { ctx: c3, page: p3 } = await newPage({ scheme: 'dark' });
  await ev(p3, DEMO);
  await go(p3, '#/home', 1200); await shot(p3, '47-mode-sombre-accueil');
  await go(p3, '#/parcels', 900); await view(p3, 17, -0.0015); await tiles(p3); await shot(p3, '48-mode-sombre-parcelles', { wait: 600 });
  await c3.close();
});

await browser.close();
fs.writeFileSync(path.join(OUT, 'captures.json'), JSON.stringify({ base: BASE, date: new Date().toISOString(), captures: log }, null, 2));
console.log(`${log.filter((l) => !l.startsWith('ÉCHEC')).length} capture(s), ${log.filter((l) => l.startsWith('ÉCHEC')).length} échec(s)`);
