import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as crs from '../../src/core/crs.js';

const REF = JSON.parse(fs.readFileSync(new URL('../reference/proj_reference.json', import.meta.url), 'utf8'));
const SAHARA = new Set([26194, 26195]);

test('Les définitions correspondent au registre EPSG via PROJ (noms)', () => {
  for (const [code, info] of Object.entries(REF.crs)) {
    assert.equal(crs.getCrs(`EPSG:${code}`).name, info.name, `nom EPSG:${code}`);
  }
});

test('Transformation WGS 84 → Lambert Nord/Sud, UTM, Merchich identique à PROJ (< 1 mm)', () => {
  let n = 0;
  for (const f of REF.forward) {
    if (SAHARA.has(f.epsg)) continue; // PROJ n'applique pas EPSG:1166 dans les zones Sahara (voir test dédié)
    const [x, y] = crs.fromWGS84(`EPSG:${f.epsg}`, f.lon, f.lat);
    if (f.epsg === 4261) {
      assert.ok(Math.abs(x - f.x) < 1e-8 && Math.abs(y - f.y) < 1e-8, `EPSG:4261 ${f.lon},${f.lat}`);
    } else {
      const d = Math.hypot(x - f.x, y - f.y);
      assert.ok(d < 0.001, `EPSG:${f.epsg} (${f.lon}, ${f.lat}) écart ${d} m`);
    }
    n++;
  }
  assert.ok(n >= 20);
});

test('Projections Lambert (toutes zones) : inverse identique à PROJ dans Merchich (< 0,1 mm)', () => {
  for (const v of REF.inverse) {
    if (![26191, 26192, 26194, 26195].includes(v.epsg)) continue;
    const [lon, lat] = crs.transform(`EPSG:${v.epsg}`, 'EPSG:4261', [v.x, v.y]);
    const dLat = Math.abs(lat - v.merchich_lat) * 111320;
    const dLon = Math.abs(lon - v.merchich_lon) * 111320 * Math.cos(lat * Math.PI / 180);
    assert.ok(dLat < 1e-4 && dLon < 1e-4, `EPSG:${v.epsg} ${v.x},${v.y} : ${dLat} / ${dLon} m`);
  }
});

test('Origines des projections Lambert : (X0, Y0) ↔ (φ0, λ0)', () => {
  const origins = { 'EPSG:26191': [500000, 300000, 33.3], 'EPSG:26192': [500000, 300000, 29.7], 'EPSG:26194': [1200000, 400000, 26.1], 'EPSG:26195': [1500000, 400000, 22.5] };
  for (const [id, [x0, y0, lat0]] of Object.entries(origins)) {
    const [lon, lat] = crs.transform(id, 'EPSG:4261', [x0, y0]);
    assert.ok(Math.abs(lon + 5.4) < 1e-9 && Math.abs(lat - lat0) < 1e-9, id);
  }
});

test('Projection seule : aller-retour Merchich ↔ Lambert < 1e-11° (inverse affinée)', () => {
  for (const id of ['EPSG:26191', 'EPSG:26192', 'EPSG:26194', 'EPSG:26195']) {
    const c = crs.getCrs(id);
    const lon = (c.bbox[0] + c.bbox[2]) / 2, lat = (c.bbox[1] + c.bbox[3]) / 2;
    const xy = crs.transform('EPSG:4261', id, [lon, lat]);
    const back = crs.transform(id, 'EPSG:4261', xy);
    assert.ok(Math.abs(back[0] - lon) < 1e-11 && Math.abs(back[1] - lat) < 1e-11, id);
  }
});

test('Inverse UTM → WGS 84 identique à PROJ', () => {
  for (const v of REF.inverse.filter((r) => [32628, 32629, 32630].includes(r.epsg))) {
    const w = crs.toWGS84(`EPSG:${v.epsg}`, [v.x, v.y]);
    assert.ok(Math.abs(w.lon - v.lon) < 1e-9 && Math.abs(w.lat - v.lat) < 1e-9);
  }
});

test('Allers-retours WGS 84 → SRC → WGS 84 pour tous les systèmes', () => {
  // Datum WGS 84 : < 1e-9°. Datum Merchich : < 3 mm (perte de la hauteur ellipsoïdale en
  // transformation 2D, comportement identique à PROJ ; négligeable devant l'exactitude ≈ 7 m d'EPSG:1166).
  const pts = [[-6.85, 34.02], [-7.98, 31.63], [-13.2, 27.15], [-15.95, 23.7], [-1.9, 34.68]];
  for (const c of crs.CRS_LIST) {
    for (const [lon, lat] of pts) {
      if (!crs.inBBox(c.bbox, lon, lat)) continue;
      const xy = crs.fromWGS84(c.id, lon, lat);
      const back = crs.toWGS84(c.id, xy);
      const tol = c.datum === 'wgs84' ? 1e-9 : 3e-8;
      assert.ok(Math.abs(back.lon - lon) < tol && Math.abs(back.lat - lat) < tol, `${c.id} ${lon},${lat}`);
    }
  }
});

test('Domaine EPSG:1166 : valide au nord, extrapolé dans les zones Sahara', () => {
  assert.equal(crs.merchichShiftValidAt(-6.85, 34.02), true);
  assert.equal(crs.merchichShiftValidAt(-13.2, 26.0), false);
  assert.equal(crs.merchichShiftValidAt(-15.95, 23.7), false);
});

test('Ordre des axes : saisie lat/lon pour les SRC géographiques, X/Y pour les projetés', () => {
  assert.deepEqual(crs.inputToXY('EPSG:4326', 34, -6.8), [-6.8, 34]);
  assert.deepEqual(crs.inputToXY('EPSG:26191', 380000, 370000), [380000, 370000]);
  assert.deepEqual(crs.xyToInput('EPSG:4326', [-6.8, 34]), [34, -6.8]);
});

test('Contrôles de cohérence des saisies', () => {
  // lat/lon inversées
  let r = crs.checkCoordinate('EPSG:4326', [34.02, -6.85]);
  assert.ok(r.warnings.some((w) => /inversées/.test(w)));
  // longitude positive
  r = crs.checkCoordinate('EPSG:4326', [6.85, 34.02]);
  assert.ok(r.warnings.some((w) => /négative/.test(w)));
  // mètres saisis en WGS 84
  r = crs.checkCoordinate('EPSG:4326', [380000, 370000]);
  assert.equal(r.ok, false);
  // degrés saisis en Lambert
  r = crs.checkCoordinate('EPSG:26191', [-6.85, 34.02]);
  assert.equal(r.ok, false);
  // coordonnées UTM 29N saisies comme Lambert Nord → hors zone + suggestion UTM 29N
  const utm = crs.fromWGS84('EPSG:32629', -6.85, 34.02);
  r = crs.checkCoordinate('EPSG:26191', utm);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /hors de la zone/.test(w)));
  assert.ok(r.suggestions.includes('EPSG:32629'), JSON.stringify(r.suggestions));
  // NB : les 4 zones Lambert ont des plages X/Y qui se recouvrent (ex. un point Sahara Sud
  // saisi comme Lambert Nord tombe dans la zone Nord) : la confusion de zone n'est pas
  // détectable par les coordonnées seules → contrôle par la position GPS dans l'interface.
  const ss = crs.fromWGS84('EPSG:26195', -15.95, 23.7);
  assert.equal(crs.checkCoordinate('EPSG:26191', ss).warnings.length, 0);
  // valeur non numérique
  assert.equal(crs.checkCoordinate('EPSG:26191', [NaN, 1]).ok, false);
  // cas nominal
  r = crs.checkCoordinate('EPSG:26191', [380000, 370000]);
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 0);
});

test('Zone Lambert recommandée selon la latitude', () => {
  assert.equal(crs.bestLambertZone(-6.85, 34.02), 'EPSG:26191');
  assert.equal(crs.bestLambertZone(-9.6, 30.43), 'EPSG:26192');
  assert.equal(crs.bestLambertZone(-13.2, 27.0), 'EPSG:26194');
  assert.equal(crs.bestLambertZone(-15.95, 23.7), 'EPSG:26195');
  assert.equal(crs.utmZoneFor(-6.85), 29);
  assert.equal(crs.utmZoneFor(-1.9), 30);
  assert.equal(crs.utmZoneFor(-15.9), 28);
});

test('Convergence des méridiens : nulle sur le méridien central, de signe correct', () => {
  // (le méridien −5,4° Merchich est décalé d'environ 1e-5° en WGS 84 par le changement de datum)
  assert.ok(Math.abs(crs.gridConvergence('EPSG:26191', -5.4, 34)) < 1e-3);
  // À l'ouest du méridien central (hémisphère Nord), la convergence est négative
  assert.ok(crs.gridConvergence('EPSG:26191', -8, 34) < 0);
  assert.ok(crs.gridConvergence('EPSG:26191', -2, 34) > 0);
  // Lambert : γ = n·(λ − λ0), n = sin φ0
  const g = crs.gridConvergence('EPSG:26191', -8, 34);
  assert.ok(Math.abs(g - Math.sin(33.3 * Math.PI / 180) * (-8 + 5.4)) < 0.01);
});

test('Paramètres Merchich personnalisés (convention Coordinate Frame inversée)', () => {
  crs.setMerchichShift([10, 20, 30, 1, 2, 3, 0.5], 'coordinate_frame', 'Test');
  const s = crs.getMerchichShift();
  assert.deepEqual(s.params, [10, 20, 30, -1, -2, -3, 0.5]);
  assert.equal(s.custom, true);
  assert.equal(crs.merchichShiftValidAt(-15, 23), true);
  crs.setMerchichShift(null);
  assert.deepEqual(crs.getMerchichShift().params, [31, 146, 47, 0, 0, 0, 0]);
  assert.throws(() => crs.setMerchichShift([1, 2]));
});
