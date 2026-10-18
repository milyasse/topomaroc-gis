import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../src/core/terrain.js';

/** Grille synthétique : z = f(est_m, nord_m) autour d'un point. */
function synth(f, z = 15, lat = 31.45, lon = -8.1, size = 40) {
  const c = T.lonLatToPixel(z, lon, lat);
  const x0 = Math.floor(c.x) - size / 2, y0 = Math.floor(c.y) - size / 2;
  const cell = T.pixelSize(z, lat);
  const data = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) data[j * size + i] = f((i - size / 2) * cell, -(j - size / 2) * cell);
  return { g: { data, w: size, h: size, x0, y0, z }, cell, c };
}

test('Décodage Terrarium', () => {
  assert.equal(T.decodeTerrarium(128, 0, 0), 0);
  assert.equal(T.decodeTerrarium(129, 44, 128), 300.5);
  assert.equal(T.decodeTerrarium(127, 156, 0), -100);
});

test('Projection pixel aller-retour', () => {
  const p = T.lonLatToPixel(14, -6.85, 34.02);
  const q = T.pixelToLonLat(14, p.x, p.y);
  assert.ok(Math.abs(q.lon + 6.85) < 1e-10 && Math.abs(q.lat - 34.02) < 1e-10);
  assert.ok(Math.abs(T.pixelSize(0, 0) - 156543.03392804097) < 1e-6);
});

test('Plan incliné de 10 % montant vers l’est : pente 10 %, exposition ouest', () => {
  const { g } = synth((e) => 500 + 0.10 * e);
  const ring = [[-8.1005, 31.4495], [-8.0995, 31.4495], [-8.0995, 31.4505], [-8.1005, 31.4505]];
  const r = T.polygonTerrain(g, ring);
  assert.ok(r.cells > 4);
  assert.ok(Math.abs(r.slopeMeanPct - 10) < 1e-3, String(r.slopeMeanPct));
  assert.ok(Math.abs(r.slopeMaxPct - 10) < 1e-3);
  assert.ok(Math.abs(r.aspect - 270) < 1e-6, String(r.aspect));
  assert.equal(T.aspectLabel(r.aspect), 'ouest');
  assert.ok(Math.abs(r.slopeMeanDeg - Math.atan(0.1) * 180 / Math.PI) < 1e-4);
});

test('Plan incliné de 25 % descendant vers le sud-est : exposition sud-est', () => {
  const k = 0.25 / Math.SQRT2;
  const { g } = synth((e, n) => 800 - k * e + k * n); // monte vers le nord-ouest
  const r = T.polygonTerrain(g, [[-8.1004, 31.4496], [-8.0996, 31.4496], [-8.0996, 31.4504], [-8.1004, 31.4504]]);
  assert.ok(Math.abs(r.slopeMeanPct - 25) < 1e-3, String(r.slopeMeanPct));
  assert.ok(Math.abs(r.aspect - 135) < 1e-6, String(r.aspect));
  assert.equal(T.slopeClass(r.slopeMeanPct), 'très forte');
});

test('Terrain plat, petite parcelle (plus petite qu’une cellule)', () => {
  const { g } = synth(() => 120);
  const r = T.polygonTerrain(g, [[-8.10001, 31.45], [-8.09999, 31.45], [-8.09999, 31.45002]]);
  assert.equal(r.cells, 1);
  assert.equal(r.slopeMeanPct, 0);
  assert.equal(r.relief, 0);
  assert.equal(T.aspectLabel(r.aspect), 'aucune (terrain plat)');
});

test('Pente entre deux points', () => {
  const s = T.slopeBetween(100, 112, 120);
  assert.ok(Math.abs(s.pct - 10) < 1e-12 && Math.abs(s.dz - 12) < 1e-12);
  assert.ok(Math.abs(s.deg - Math.atan(0.1) * 180 / Math.PI) < 1e-12);
});

test('Interpolation bilinéaire exacte sur un plan', () => {
  const { g, c } = synth((e, n) => 10 + 0.05 * e - 0.02 * n);
  assert.ok(Math.abs(T.sampleGrid(g, c.x, c.y) - 10) < 0.2);
});
