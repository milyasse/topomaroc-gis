// @ts-check
/**
 * Ajustement d'une parcelle dessinée à une superficie souhaitée (calcul plan, dans la projection).
 *
 * Deux méthodes :
 *  - « côté » : une limite est déplacée parallèlement à elle-même ; ses deux sommets glissent sur
 *    les côtés voisins (prolongés). Les autres limites ne bougent pas. C'est la méthode usuelle
 *    pour donner une superficie exacte à un lot (déplacement parallèle d'une limite).
 *  - « échelle » : homothétie autour du centre de gravité ; la forme et les angles sont conservés,
 *    tous les sommets bougent.
 */
import { signedArea, planeArea, selfIntersections, openRing, centroid } from './geometry.js';

/** @typedef {[number, number]} XY */

/** Intersection des droites (p1,p2) et (p3,p4) ; null si parallèles. @param {XY} p1 @param {XY} p2 @param {XY} p3 @param {XY} p4 @returns {XY|null} */
function lineIntersect(p1, p2, p3, p4) {
  const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1], d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
  const den = d1x * d2y - d1y * d2x;
  const L = Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y);
  if (!L || Math.abs(den) < L * 1e-9) return null;
  const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / den;
  return [p1[0] + t * d1x, p1[1] + t * d1y];
}

/**
 * Anneau obtenu en décalant le côté i (sommets i et i+1) de d mètres vers l'extérieur.
 * @param {XY[]} ring anneau ouvert @param {number} i @param {number} d @returns {XY[]|null}
 */
export function shiftSide(ring, i, d) {
  const n = ring.length;
  const a = ring[i], b = ring[(i + 1) % n];
  const prev = ring[(i - 1 + n) % n], next = ring[(i + 2) % n];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!L) return null;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const s = signedArea(ring) > 0 ? 1 : -1; // sens de parcours
  const nx = s * uy, ny = -s * ux; // normale extérieure
  /** @type {XY} */ const a2 = [a[0] + nx * d, a[1] + ny * d];
  /** @type {XY} */ const b2 = [b[0] + nx * d, b[1] + ny * d];
  const na = lineIntersect(prev, a, a2, b2), nb = lineIntersect(next, b, a2, b2);
  if (!na || !nb) return null;
  const out = ring.slice();
  out[i] = na; out[(i + 1) % n] = nb;
  return out;
}

/** La forme reste-t-elle un polygone simple de même sens ? @param {XY[]} r @param {XY[]} ref */
function sound(r, ref) {
  return Math.sign(signedArea(r)) === Math.sign(signedArea(ref)) && selfIntersections(r).length === 0;
}

/**
 * Déplacement parallèle du côté i pour atteindre la superficie cible.
 * La superficie est un polynôme du 2ᵉ degré en d : résolution exacte, puis contrôle de la forme.
 * @param {XY[]} ringIn @param {number} i @param {number} target m²
 * @returns {{ ok: true, ring: XY[], shift: number, area: number } | { ok: false, error: string }}
 */
export function fitBySide(ringIn, i, target) {
  const ring = openRing(ringIn);
  const A0 = planeArea(ring);
  if (ring.length < 3 || !(A0 > 0)) return { ok: false, error: 'Parcelle invalide.' };
  if (!(target > 0)) return { ok: false, error: 'Superficie souhaitée invalide.' };
  const n = ring.length, a = ring[i], b = ring[(i + 1) % n];
  const h = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.01, 0.01);
  const Ad = (/** @type {number} */ d) => { const r = shiftSide(ring, i, d); return r ? planeArea(r) * Math.sign(signedArea(r)) * Math.sign(signedArea(ring)) : NaN; };
  const Ap = Ad(h), Am = Ad(-h);
  if (!Number.isFinite(Ap) || !Number.isFinite(Am)) return { ok: false, error: 'Ce côté est parallèle à un côté voisin : il ne peut pas être déplacé. Choisissez un autre côté ou la mise à l’échelle.' };
  // A(d) = A0 + B d + C d²
  const B = (Ap - Am) / (2 * h), C = (Ap + Am - 2 * A0) / (2 * h * h);
  let d;
  if (Math.abs(C) < 1e-12 * Math.max(1, Math.abs(B))) d = (target - A0) / B;
  else {
    const disc = B * B - 4 * C * (A0 - target);
    if (disc < 0) return { ok: false, error: 'Superficie impossible à atteindre en déplaçant ce côté (les côtés voisins se rejoignent avant). Choisissez un autre côté ou la mise à l’échelle.' };
    const r1 = (-B + Math.sqrt(disc)) / (2 * C), r2 = (-B - Math.sqrt(disc)) / (2 * C);
    d = Math.abs(r1) < Math.abs(r2) ? r1 : r2;
  }
  // affinage (Newton) contre les arrondis
  for (let k = 0; k < 5; k++) {
    const e = Ad(d) - target; if (!Number.isFinite(e) || Math.abs(e) < 1e-9) break;
    d -= e / (B + 2 * C * d || B);
  }
  const out = shiftSide(ring, i, d);
  if (!out || !sound(out, ring)) return { ok: false, error: 'En déplaçant ce côté, la parcelle se croiserait ou s’inverserait. Choisissez un autre côté ou la mise à l’échelle.' };
  return { ok: true, ring: out, shift: d, area: planeArea(out) };
}

/**
 * Homothétie autour du centre de gravité pour atteindre la superficie cible.
 * @param {XY[]} ringIn @param {number} target m²
 * @returns {{ ok: true, ring: XY[], scale: number, area: number } | { ok: false, error: string }}
 */
export function fitByScale(ringIn, target) {
  const ring = openRing(ringIn);
  const A0 = planeArea(ring);
  if (ring.length < 3 || !(A0 > 0)) return { ok: false, error: 'Parcelle invalide.' };
  if (!(target > 0)) return { ok: false, error: 'Superficie souhaitée invalide.' };
  const k = Math.sqrt(target / A0);
  const c = centroid(ring);
  /** @type {XY[]} */ const out = ring.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
  return { ok: true, ring: out, scale: k, area: planeArea(out) };
}
