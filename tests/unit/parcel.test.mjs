import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeParcel, totalArea } from '../../src/core/parcel.js';
import * as G from '../../src/core/geometry.js';
import * as geo from '../../src/core/geodesy.js';
import * as crs from '../../src/core/crs.js';

const REF = JSON.parse(fs.readFileSync(new URL('../reference/proj_reference.json', import.meta.url), 'utf8'));
const poly = (name) => REF.polygons.find((p) => p.name === name);
const V = (coords) => coords.map(([x, y]) => ({ x, y }));

test('Carré 10 m × 10 m → 100 m² exactement (Lambert Nord)', () => {
  const p = poly('carre_10x10_lambert_nord');
  const r = analyzeParcel(V(p.coords), 'EPSG:26191');
  assert.equal(r.valid, true);
  assert.equal(r.method, 'plane');
  assert.ok(Math.abs(r.area - 100) < 1e-9, String(r.area));
  assert.ok(Math.abs(r.perimeter - 40) < 1e-9);
  assert.equal(r.sides.length, 4);
  assert.ok(r.sides.every((s) => Math.abs(s.gridLength - 10) < 1e-9));
  // Contrôle ellipsoïdal contre GeographicLib-C (pyproj)
  assert.ok(Math.abs(r.geodesicArea - p.geodesic_area) < 1e-4, `${r.geodesicArea} vs ${p.geodesic_area}`);
});

test('Rectangle 20 m × 30 m → 600 m² (Lambert Sud)', () => {
  const p = poly('rectangle_20x30_lambert_sud');
  const r = analyzeParcel(V(p.coords), 'EPSG:26192');
  assert.ok(Math.abs(r.area - 600) < 1e-9);
  assert.ok(Math.abs(r.perimeter - 100) < 1e-9);
  assert.ok(Math.abs(r.geodesicArea - p.geodesic_area) < 1e-4);
});

test('Triangle base 40 m, hauteur 25 m → 500 m²', () => {
  const p = poly('triangle_base40_h25_lambert_nord');
  const r = analyzeParcel(V(p.coords), 'EPSG:26191');
  assert.ok(Math.abs(r.area - 500) < 1e-9);
  assert.ok(Math.abs(r.planeArea - p.plane_area) < 1e-9);
  assert.ok(Math.abs(r.planePerimeter - p.plane_perimeter) < 1e-9);
});

test('Parcelle irrégulière : identique à Shapely (plan) et GeographicLib-C (ellipsoïde)', () => {
  const p = poly('parcelle_irreguliere_lambert_nord');
  const r = analyzeParcel(V(p.coords), 'EPSG:26191');
  assert.equal(r.valid, true);
  assert.ok(Math.abs(r.planeArea - p.plane_area) < 1e-6, `${r.planeArea} vs ${p.plane_area}`);
  assert.ok(Math.abs(r.planePerimeter - p.plane_perimeter) < 1e-6);
  assert.ok(Math.abs(r.geodesicArea - p.geodesic_area) < 1e-3);
  assert.ok(Math.abs(r.geodesicPerimeter - p.geodesic_perimeter) < 1e-4);
  // écart plane / ellipsoïde cohérent avec l'altération linéaire Lambert (|Δ| < 0,2 %)
  assert.ok(Math.abs(r.diffPercent) < 0.2);
});

test('Carré 100 m × 100 m en UTM 29N', () => {
  const p = poly('carre_100x100_utm29');
  const r = analyzeParcel(V(p.coords), 'EPSG:32629');
  assert.ok(Math.abs(r.area - 10000) < 1e-7);
  assert.ok(Math.abs(r.geodesicArea - p.geodesic_area) < 1e-3);
});

test('Parcelle saisie dans un autre SRC que la carte (WGS 84 → contrôle en Lambert)', () => {
  // Les sommets du carré 10 m Lambert Nord exprimés en WGS 84 (via PROJ)
  const p = poly('carre_10x10_lambert_nord');
  const r = analyzeParcel(p.wgs84.map(([lon, lat]) => ({ x: lon, y: lat })), 'EPSG:4326', { planeCrsId: 'EPSG:26191' });
  assert.equal(r.method, 'geodesic');
  assert.equal(r.planeCrsId, 'EPSG:26191');
  assert.ok(Math.abs(r.area - p.geodesic_area) < 1e-4);
  assert.ok(Math.abs(r.planeArea - 100) < 1e-4, `plane ${r.planeArea}`);
});

test('Polygone WGS 84 (levé GPS) : superficie géodésique = pyproj.Geod', () => {
  const p = poly('wgs84_0.01deg_rabat');
  const r = analyzeParcel(V(p.coords), 'EPSG:4326');
  assert.equal(r.method, 'geodesic');
  assert.ok(Math.abs(r.area - p.geodesic_area) < 1e-3, `${r.area} vs ${p.geodesic_area}`);
  assert.ok(Math.abs(r.perimeter - p.geodesic_perimeter) < 1e-4);
  assert.equal(r.planeCrsId, 'EPSG:26191');
});

test('Grande emprise (> 10 km) : méthode géodésique choisie automatiquement et signalée', () => {
  const p = poly('grand_polygone_20km_lambert_nord');
  const r = analyzeParcel(V(p.coords), 'EPSG:26191');
  assert.equal(r.method, 'geodesic');
  assert.ok(r.issues.some((i) => i.code === 'large'));
  assert.ok(Math.abs(r.planeArea - 4e8) < 1e-3);
  assert.ok(Math.abs(r.geodesicArea - p.geodesic_area) / p.geodesic_area < 1e-9);
  // méthode imposée
  const r2 = analyzeParcel(V(p.coords), 'EPSG:26191', { method: 'plane' });
  assert.equal(r2.method, 'plane');
  assert.ok(Math.abs(r2.area - 4e8) < 1e-3);
});

test('Sommets en double détectés', () => {
  const r = analyzeParcel(V([[400000, 380000], [400010, 380000], [400010, 380000.0005], [400000, 380010]]), 'EPSG:26191');
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.code === 'duplicate'));
});

test('Polygone auto-intersecté (« nœud papillon ») détecté', () => {
  const r = analyzeParcel(V([[400000, 380000], [400010, 380010], [400010, 380000], [400000, 380010]]), 'EPSG:26191');
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.code === 'self_intersection'));
});

test('Moins de 3 sommets, superficie nulle, fermeture répétée', () => {
  assert.equal(analyzeParcel(V([[400000, 380000], [400010, 380000]]), 'EPSG:26191').valid, false);
  const flat = analyzeParcel(V([[400000, 380000], [400010, 380000], [400020, 380000]]), 'EPSG:26191');
  assert.equal(flat.valid, false);
  assert.ok(flat.issues.some((i) => i.code === 'zero_area' || i.code === 'self_intersection'));
  const closed = analyzeParcel(V([[400000, 380000], [400010, 380000], [400010, 380010], [400000, 380010], [400000, 380000]]), 'EPSG:26191');
  assert.equal(closed.n, 4);
  assert.ok(Math.abs(closed.area - 100) < 1e-9);
});

test('Coordonnées incompatibles avec le SRC → erreur', () => {
  const r = analyzeParcel(V([[-6.85, 34.02], [-6.84, 34.02], [-6.84, 34.03]]), 'EPSG:26191');
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.code === 'bad_coord'));
});

test('Avertissement précision GPS insuffisante pour usage foncier', () => {
  const p = poly('wgs84_0.01deg_rabat');
  const r = analyzeParcel(p.coords.map(([x, y]) => ({ x, y, accuracy: 4.2 })), 'EPSG:4326');
  assert.ok(r.issues.some((i) => i.code === 'low_accuracy'));
});

test('Zones Sahara : avertissement transformation extrapolée', () => {
  const xy = crs.fromWGS84('EPSG:26195', -15.95, 23.7);
  const r = analyzeParcel(V([xy, [xy[0] + 10, xy[1]], [xy[0] + 10, xy[1] + 10]]), 'EPSG:26195');
  assert.ok(r.issues.some((i) => i.code === 'shift_extrapolated'));
  assert.ok(Math.abs(r.area - 50) < 1e-9);
});

test('Côtés : longueurs, gisements et azimuts géodésiques', () => {
  const r = analyzeParcel(V([[400000, 380000], [400010, 380000], [400010, 380010], [400000, 380010]]), 'EPSG:26191');
  assert.ok(Math.abs(r.sides[0].gridBearing - 90) < 1e-9);
  assert.ok(Math.abs(r.sides[1].gridBearing - 0) < 1e-9);
  // azimut vrai = gisement + convergence
  const conv = crs.gridConvergence('EPSG:26191', r.wgs84[0].lon, r.wgs84[0].lat);
  assert.ok(Math.abs(((r.sides[1].trueAzimuth + 180) % 360 - 180) - conv) < 0.01);
});

test('Total de plusieurs parcelles', () => {
  const a = analyzeParcel(V(poly('carre_10x10_lambert_nord').coords), 'EPSG:26191');
  const b = analyzeParcel(V(poly('triangle_base40_h25_lambert_nord').coords), 'EPSG:26191');
  const t = totalArea([a, b]);
  assert.equal(t.count, 2);
  assert.ok(Math.abs(t.area - 600) < 1e-9);
  assert.equal(t.mixedMethods, false);
});

test('Géométrie plane : formule de Gauss stable avec de grandes coordonnées', () => {
  const ring = [[1500000.001, 400000.002], [1500000.011, 400000.002], [1500000.011, 400000.012], [1500000.001, 400000.012]];
  assert.ok(Math.abs(G.planeArea(ring) - 1e-4) < 1e-12);
  assert.deepEqual(G.centroid([[0, 0], [2, 0], [2, 2], [0, 2]]), [1, 1]);
});

test('Géodésie : inverse identique à pyproj.Geod', () => {
  for (const g of REF.geodesic_inverse) {
    const r = geo.inverse(g.lat1, g.lon1, g.lat2, g.lon2);
    assert.ok(Math.abs(r.distance - g.dist) < 1e-6, `${r.distance} vs ${g.dist}`);
    assert.ok(Math.abs(((r.azimuth - g.azi1 + 540) % 360) - 180) < 1e-9);
  }
});
