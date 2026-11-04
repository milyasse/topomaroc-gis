// @ts-check
/**
 * Géométrie plane (coordonnées projetées en mètres) et contrôles de validité des polygones.
 */

/** @typedef {[number, number]} XY */

/** Supprime le sommet de fermeture s'il répète le premier. @param {XY[]} ring @param {number} [tol] */
export function openRing(ring, tol = 1e-9) {
  if (ring.length > 1) {
    const a = ring[0], b = ring[ring.length - 1];
    if (Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol) return ring.slice(0, -1);
  }
  return ring.slice();
}

/**
 * Aire signée (formule de Gauss / « shoelace »), positive si sens anti-horaire.
 * Calcul centré sur le premier sommet pour limiter les erreurs d'arrondi avec de grandes coordonnées.
 * @param {XY[]} ring
 */
export function signedArea(ring) {
  const r = openRing(ring);
  if (r.length < 3) return 0;
  const [x0, y0] = r[0];
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [xa, ya] = r[i];
    const [xb, yb] = r[(i + 1) % r.length];
    s += (xa - x0) * (yb - y0) - (xb - x0) * (ya - y0);
  }
  return s / 2;
}

/** @param {XY[]} ring */
export function planeArea(ring) { return Math.abs(signedArea(ring)); }

/** @param {XY} a @param {XY} b */
export function dist2D(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

/** @param {XY[]} ring @param {boolean} [closed] */
export function planePerimeter(ring, closed = true) {
  const r = openRing(ring);
  let p = 0;
  const n = closed ? r.length : r.length - 1;
  for (let i = 0; i < n; i++) p += dist2D(r[i], r[(i + 1) % r.length]);
  return p;
}

/** @param {XY} p @param {XY} q @param {XY} r */
function orient(p, q, r) {
  const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const scale = Math.max(1, Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])) * Math.max(1, Math.abs(r[0] - p[0]) + Math.abs(r[1] - p[1]));
  if (Math.abs(v) <= 1e-12 * scale) return 0;
  return v > 0 ? 1 : -1;
}
/** @param {XY} p @param {XY} q @param {XY} r */
function onSegment(p, q, r) {
  return Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);
}
/** Les segments [p1,p2] et [p3,p4] se coupent-ils (contact compris) ? @param {XY} p1 @param {XY} p2 @param {XY} p3 @param {XY} p4 */
export function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4), o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
}

/**
 * Paires de côtés non adjacents qui se croisent ou se touchent.
 * @param {XY[]} ring @returns {[number, number][]} indices des côtés (côté i = sommet i → i+1)
 */
export function selfIntersections(ring) {
  const r = openRing(ring);
  const n = r.length;
  /** @type {[number,number][]} */
  const out = [];
  if (n < 4) return out;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // côtés adjacents
      if (segmentsIntersect(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) out.push([i, j]);
    }
  }
  return out;
}

/**
 * Sommets en double (distance ≤ tolérance).
 * @param {XY[]} ring @param {number} tol @returns {[number, number][]}
 */
export function duplicateVertices(ring, tol) {
  const r = openRing(ring);
  /** @type {[number,number][]} */
  const out = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (dist2D(r[i], r[j]) <= tol) out.push([i, j]);
  return out;
}

/** Sommets alignés avec leurs voisins (inutiles). @param {XY[]} ring @param {number} tolMeters */
export function collinearVertices(ring, tolMeters = 0.001) {
  const r = openRing(ring);
  const out = [];
  for (let i = 0; i < r.length && r.length > 3; i++) {
    const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
    const base = dist2D(a, c);
    if (base === 0) continue;
    const h = Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / base;
    if (h <= tolMeters && onSegment(a, b, c)) out.push(i);
  }
  return out;
}

/** Emprise [minX, minY, maxX, maxY]. @param {XY[]} pts */
export function bbox(pts) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}

/** Centroïde surfacique d'un polygone plan. @param {XY[]} ring @returns {XY} */
export function centroid(ring) {
  const r = openRing(ring);
  const [x0, y0] = r[0];
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i++) {
    const xa = r[i][0] - x0, ya = r[i][1] - y0;
    const xb = r[(i + 1) % r.length][0] - x0, yb = r[(i + 1) % r.length][1] - y0;
    const f = xa * yb - xb * ya;
    A += f; cx += (xa + xb) * f; cy += (ya + yb) * f;
  }
  if (Math.abs(A) < 1e-12) {
    const n = r.length;
    return [r.reduce((s, p) => s + p[0], 0) / n, r.reduce((s, p) => s + p[1], 0) / n];
  }
  return [x0 + cx / (3 * A), y0 + cy / (3 * A)];
}
