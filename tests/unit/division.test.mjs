import { test } from 'node:test';
import assert from 'node:assert/strict';
import { divideByStrips, proposeDivisions, parseShare, checkShares, clipHalfPlane, frontage } from '../../src/core/division.js';
import { planeArea, selfIntersections } from '../../src/core/geometry.js';

const RECT = [[400000, 380000], [400100, 380000], [400100, 380050], [400000, 380050]]; // 100 × 50 = 5000 m²
const IRREG = [[386512.35, 371204.88], [386640.12, 371198.40], [386702.91, 371301.77], [386655.03, 371402.15], [386530.66, 371388.09], [386480.20, 371290.51]];
const L_SHAPE = [[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]]; // non convexe, 2000 m²

test('Lecture des parts : %, décimales, fractions', () => {
  assert.equal(parseShare('25'), 25);
  assert.equal(parseShare('12,5 %'), 12.5);
  assert.equal(parseShare('1/8'), 12.5);
  assert.ok(Math.abs(parseShare('2/3') - 66.6666666667) < 1e-9);
  assert.ok(Number.isNaN(parseShare('abc')));
  assert.equal(checkShares([{ name: 'A', percent: 50 }, { name: 'B', percent: 50 }]).ok, true);
  assert.equal(checkShares([{ name: 'A', percent: 50 }, { name: 'B', percent: 40 }]).ok, false);
  assert.equal(checkShares([{ name: '', percent: 100 }]).ok, false);
  // héritage : 1/8 + 7/8
  assert.equal(checkShares([{ name: 'Épouse', percent: parseShare('1/8') }, { name: 'Enfants', percent: parseShare('7/8') }]).ok, true);
});

test('Demi-plan : découpe exacte d’un rectangle', () => {
  const left = clipHalfPlane(RECT, [1, 0], 400030);
  assert.ok(Math.abs(planeArea(left) - 1500) < 1e-9);
  const right = clipHalfPlane(RECT, [1, 0], 400030, true);
  assert.ok(Math.abs(planeArea(right) - 3500) < 1e-9);
});

test('Rectangle 5000 m² partagé 50/30/20 : superficies exactes, somme conservée', () => {
  const r = divideByStrips(RECT, [50, 30, 20], 0); // lignes nord-sud
  assert.equal(r.pieces.length, 3);
  const exp = [2500, 1500, 1000];
  r.pieces.forEach((p, i) => assert.ok(Math.abs(p.area - exp[i]) < 1e-6, `${p.area} vs ${exp[i]}`));
  assert.ok(Math.abs(r.pieces.reduce((s, p) => s + p.area, 0) - 5000) < 1e-6);
  assert.ok(r.contiguous);
  // bandes nord-sud : largeurs 50, 30, 20 m
  assert.ok(Math.abs(r.cuts[0] - 400050) < 1e-6 && Math.abs(r.cuts[1] - 400080) < 1e-6);
});

test('Parcelle irrégulière : parts héritage (1/8, 7/16, 7/16) à moins de 1 mm² près, pour plusieurs orientations', () => {
  const A = planeArea(IRREG);
  const parts = [12.5, 43.75, 43.75];
  for (const bearing of [0, 37, 90, 133.5]) {
    const r = divideByStrips(IRREG, parts, bearing);
    r.pieces.forEach((p, i) => assert.ok(Math.abs(p.area - (parts[i] / 100) * A) < 1e-3, `${bearing}° pièce ${i}: ${p.area}`));
    r.pieces.forEach((p) => assert.equal(selfIntersections(p.ring).length, 0));
  }
});

test('Polygone non convexe (en L) : superficies exactes, non-contiguïté signalée', () => {
  const r = divideByStrips(L_SHAPE, [50, 50], 90); // lignes est-ouest
  assert.ok(Math.abs(r.pieces[0].area - 1000) < 1e-6 && Math.abs(r.pieces[1].area - 1000) < 1e-6);
  // une ligne verticale à x≈? coupe le L en 2 points seulement → contigu ; tester un cas non contigu :
  const U = [[0, 0], [60, 0], [60, 60], [40, 60], [40, 20], [20, 20], [20, 60], [0, 60]];
  const u = divideByStrips(U, [30, 70], 90); // la bande nord ne contient que les deux bras du U
  assert.ok(Math.abs(u.pieces[0].area + u.pieces[1].area - planeArea(U)) < 1e-6);
  assert.equal(u.contiguous, false);
});

test('Façade sur le côté de référence', () => {
  const r = divideByStrips(RECT, [50, 50], 0, { refSide: [RECT[0], RECT[1]] });
  assert.ok(Math.abs(r.pieces[0].frontage - 50) < 1e-6 && Math.abs(r.pieces[1].frontage - 50) < 1e-6);
  assert.ok(Math.abs(frontage(RECT, RECT[0], RECT[1]) - 100) < 1e-9);
});

test('Propositions : perpendiculaire au côté donnant accès à chacun, classement', () => {
  const props = proposeDivisions(RECT, [40, 30, 30]);
  assert.ok(props.length >= 2);
  // Toutes les propositions conservent la superficie
  for (const p of props) assert.ok(Math.abs(p.result.pieces.reduce((s, q) => s + q.area, 0) - 5000) < 1e-6);
  // Pour un rectangle 100×50, couper perpendiculairement au grand côté donne des bandes plus compactes
  assert.equal(props[0].kind, 'perpendicular');
  assert.ok(props[0].allFront);
  const pref = proposeDivisions(RECT, [50, 50], { preferSide: 1 });
  assert.equal(pref[0].side, 1);
});

test('Une seule personne : la parcelle entière', () => {
  const r = divideByStrips(IRREG, [100], 0);
  assert.equal(r.pieces.length, 1);
  assert.ok(Math.abs(r.pieces[0].area - planeArea(IRREG)) < 1e-6);
});

import { contourOrder, bestContour, bestInsertion, insertAll } from '../../src/core/assemble.js';

test('Assemblage : points dans le désordre → contour simple et superficie correcte', () => {
  const pts = [[10, 10], [0, 0], [0, 10], [10, 0]];
  const { order, simple } = bestContour(pts);
  assert.equal(simple, true);
  assert.ok(Math.abs(planeArea(order.map((i) => pts[i])) - 100) < 1e-9);
  const irr = [IRREG[3], IRREG[0], IRREG[5], IRREG[1], IRREG[4], IRREG[2]];
  const o2 = contourOrder(irr);
  assert.ok(Math.abs(planeArea(o2.map((i) => irr[i])) - planeArea(IRREG)) < 1e-6);
});

test('Insertion d’un sommet au meilleur endroit du contour', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(bestInsertion(sq, [5, -1]), 1);
  assert.equal(bestInsertion(sq, [11, 5]), 2);
  const r = insertAll(sq, [[5, -1], [-1, 5]]);
  assert.equal(r.ring.length, 6);
  assert.equal(selfIntersections(r.ring).length, 0);
});
