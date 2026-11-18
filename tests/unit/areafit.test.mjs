import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitBySide, fitByScale, shiftSide } from '../../src/core/areafit.js';
import { planeArea, selfIntersections } from '../../src/core/geometry.js';

const RECT = [[400000, 380000], [400100, 380000], [400100, 380050], [400000, 380050]]; // 5000 m²
const IRREG = [[386512.35, 371204.88], [386640.12, 371198.40], [386702.91, 371301.77], [386655.03, 371402.15], [386530.66, 371388.09], [386480.20, 371290.51]];

test('Côté déplacé parallèlement : rectangle 5000 → 6000 m² (côté droit +20 m)', () => {
  const r = fitBySide(RECT, 1, 6000);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.area - 6000) < 1e-6);
  assert.ok(Math.abs(r.shift - 20) < 1e-6, String(r.shift));
  // seuls les sommets du côté 1 (indices 1 et 2) ont bougé
  assert.deepEqual(r.ring[0], RECT[0]); assert.deepEqual(r.ring[3], RECT[3]);
  assert.ok(Math.abs(r.ring[1][0] - 400120) < 1e-6 && Math.abs(r.ring[2][0] - 400120) < 1e-6);
});

test('Côté déplacé : réduction et parcelle irrégulière, superficie exacte, forme valide, sens inverse', () => {
  const A = planeArea(IRREG);
  for (let i = 0; i < IRREG.length; i++) for (const t of [A * 0.9, A * 1.07, Math.round(A)]) {
    const r = fitBySide(IRREG, i, t);
    assert.equal(r.ok, true, `côté ${i} cible ${t} : ${r.ok ? '' : r.error}`);
    assert.ok(Math.abs(r.area - t) < 1e-6, `${r.area} ≠ ${t}`);
    assert.equal(selfIntersections(r.ring).length, 0);
    // les sommets hors du côté ne bougent pas
    IRREG.forEach((p, k) => { if (k !== i && k !== (i + 1) % IRREG.length) assert.deepEqual(r.ring[k], p); });
  }
  const cw = IRREG.slice().reverse();
  const r = fitBySide(cw, 2, A * 1.05); assert.equal(r.ok, true); assert.ok(Math.abs(r.area - A * 1.05) < 1e-6);
});

test('Côté déplacé : cas impossibles refusés', () => {
  // réduire un rectangle de 5000 m² à 1 m² en déplaçant le côté de 50 m : OK (bande de 0,01 m) ; à 0 → refus
  assert.equal(fitBySide(RECT, 1, 1).ok, true);
  assert.equal(fitBySide(RECT, 1, 0).ok, false);
  // triangle : agrandir en déplaçant la base marche ; cible inaccessible quand les voisins convergent
  const TRI = [[0, 0], [100, 0], [50, 50]]; // 2500 m²
  assert.equal(fitBySide(TRI, 0, 3000).ok, true);
  const big = fitBySide(TRI, 0, 2499.99); assert.equal(big.ok, true);
  // trapèze dont les côtés voisins convergent vers le haut : impossible d'agrandir au-delà du triangle complet
  const TRAP = [[0, 0], [100, 0], [60, 40], [40, 40]]; // côté haut (2) ; triangle complet = 100×50/2 = 2500
  assert.equal(fitBySide(TRAP, 2, 2600).ok, false);
  assert.equal(fitBySide(TRAP, 2, 2400).ok, true);
  assert.equal(shiftSide([[0, 0], [10, 0], [10, 10], [0, 10]], 0, 1) !== null, true);
});

test('Mise à l’échelle : forme conservée, superficie exacte', () => {
  const r = fitByScale(IRREG, 25000);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.area - 25000) < 1e-6);
  const d = (/** @type {number[][]} */ g, i, j) => Math.hypot(g[i][0] - g[j][0], g[i][1] - g[j][1]);
  assert.ok(Math.abs(d(r.ring, 0, 1) / d(IRREG, 0, 1) - r.scale) < 1e-9);
});
