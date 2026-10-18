// @ts-check
/** Construction de contours à partir de points : ordre automatique, insertion de sommets. */
import { selfIntersections, planePerimeter } from './geometry.js';

/** @typedef {[number, number]} XY */

/**
 * Ordonne des points en contour (tri angulaire autour du barycentre). Donne un contour simple
 * pour toute forme « étoilée » par rapport au barycentre (cas courant d'une parcelle) ; le
 * résultat est contrôlé (auto-intersection signalée).
 * @param {XY[]} pts @returns {number[]} indices dans l'ordre du contour (sens anti-horaire)
 */
export function contourOrder(pts) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n, cy = pts.reduce((s, p) => s + p[1], 0) / n;
  return pts.map((p, i) => ({ i, a: Math.atan2(p[1] - cy, p[0] - cx), d: Math.hypot(p[0] - cx, p[1] - cy) }))
    .sort((u, v) => u.a - v.a || u.d - v.d).map((o) => o.i);
}

/**
 * Meilleur ordre parmi : tri angulaire, puis amélioration 2-opt (suppression des croisements).
 * @param {XY[]} pts
 */
export function bestContour(pts) {
  let order = contourOrder(pts);
  const ring = () => order.map((i) => pts[i]);
  // 2-opt : inverse des sous-chaînes tant qu'il reste des côtés qui se croisent
  for (let iter = 0; iter < 50; iter++) {
    const x = selfIntersections(/** @type {XY[]} */ (ring()));
    if (!x.length) break;
    const [i, j] = x[0];
    const seg = order.slice(i + 1, j + 1).reverse();
    order = [...order.slice(0, i + 1), ...seg, ...order.slice(j + 1)];
  }
  return { order, simple: selfIntersections(/** @type {XY[]} */ (ring())).length === 0 };
}

/**
 * Position d'insertion d'un point dans un contour qui allonge le moins le périmètre.
 * @param {XY[]} ring @param {XY} p @returns {number} index où insérer (avant cet index)
 */
export function bestInsertion(ring, p) {
  if (ring.length < 2) return ring.length;
  let best = 0, bestCost = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const cost = Math.hypot(p[0] - a[0], p[1] - a[1]) + Math.hypot(p[0] - b[0], p[1] - b[1]) - Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (cost < bestCost) { bestCost = cost; best = i + 1; }
  }
  return best;
}

/**
 * Insère plusieurs points dans un contour (chacun au meilleur endroit).
 * @param {XY[]} ring @param {XY[]} pts @returns {{ ring: XY[], positions: number[] }}
 */
export function insertAll(ring, pts) {
  const r = ring.slice();
  const positions = [];
  for (const p of pts) { const k = bestInsertion(r, p); r.splice(k, 0, p); positions.push(k); }
  return { ring: r, positions, perimeter: planePerimeter(r) };
}
