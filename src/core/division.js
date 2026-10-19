// @ts-check
/**
 * Partage d'une parcelle entre plusieurs personnes selon des quotes-parts.
 *
 * Méthode : découpage en bandes par des lignes parallèles d'orientation donnée. Pour chaque
 * limite, la position de la ligne est trouvée par dichotomie de sorte que la superficie
 * cumulée soit exactement égale à la part demandée (précision < 1 mm²). Calcul plan, dans
 * la projection de la parcelle (Lambert ou UTM), comme les superficies cadastrales.
 *
 * Ce module propose un découpage TECHNIQUE. Un partage foncier ou successoral doit être
 * validé par un ingénieur géomètre-topographe et les parties concernées.
 */
import { planeArea, planePerimeter, openRing, signedArea } from './geometry.js';

/** @typedef {[number, number]} XY */

export const OWNER_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#808000', '#000075', '#e6a700', '#dcbeff', '#800000', '#aaffc3', '#ffd8b1'];

/**
 * Lit une quote-part saisie : « 25 », « 25 % », « 12,5 », « 1/8 » (fraction → %).
 * @param {string|number} v @returns {number} pourcentage
 */
export function parseShare(v) {
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace('%', '').replace(',', '.').replace(/\s+/g, '');
  const f = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (f) { const d = Number(f[2]); return d > 0 ? (Number(f[1]) / d) * 100 : NaN; }
  return /^\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

/**
 * Contrôle des quotes-parts.
 * @param {{name:string, percent:number}[]} owners
 */
export function checkShares(owners) {
  const errors = [];
  if (!owners.length) errors.push('Ajoutez au moins une personne.');
  owners.forEach((o, i) => {
    if (!o.name || !o.name.trim()) errors.push(`Ligne ${i + 1} : nom manquant.`);
    if (!Number.isFinite(o.percent) || o.percent <= 0) errors.push(`Ligne ${i + 1} : part invalide (nombre > 0, ex. 25 ou 1/8).`);
  });
  const total = owners.reduce((s, o) => s + (Number.isFinite(o.percent) ? o.percent : 0), 0);
  if (owners.length && Math.abs(total - 100) > 0.01) errors.push(`La somme des parts vaut ${total.toFixed(4)} % au lieu de 100 %.`);
  return { ok: !errors.length, errors, total };
}

/**
 * Découpe d'un polygone par le demi-plan {p · n ≤ c} (ou ≥ si `above`), algorithme de
 * Sutherland–Hodgman. Pour un polygone non convexe, une pièce non contiguë est renvoyée
 * comme un seul anneau relié par des segments de surface nulle (la superficie reste exacte).
 * @param {XY[]} ring @param {XY} n @param {number} c @param {boolean} [above]
 * @returns {XY[]}
 */
export function clipHalfPlane(ring, n, c, above = false) {
  const val = (/** @type {XY} */ p) => (above ? -1 : 1) * (p[0] * n[0] + p[1] * n[1] - c);
  /** @type {XY[]} */ const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const va = val(a), vb = val(b);
    if (va <= 0) out.push(a);
    if ((va < 0 && vb > 0) || (va > 0 && vb < 0)) {
      const t = va / (va - vb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return cleanRing(out);
}

/** Supprime les sommets consécutifs confondus. @param {XY[]} r @param {number} [tol] */
export function cleanRing(r, tol = 1e-9) {
  /** @type {XY[]} */ const out = [];
  for (const p of r) { const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) > tol || Math.abs(q[1] - p[1]) > tol) out.push(p); }
  if (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol) out.pop(); }
  return out;
}

/** Vecteurs de découpe pour un gisement (°) des lignes de partage. @param {number} bearingDeg */
export function cutVectors(bearingDeg) {
  const r = bearingDeg * Math.PI / 180;
  /** @type {XY} */ const d = [Math.sin(r), Math.cos(r)];   // direction des lignes de partage
  /** @type {XY} */ const n = [Math.cos(r), -Math.sin(r)];  // direction de progression des bandes
  return { d, n };
}

/** Nombre de traversées du contour par la ligne {p·n = t}. @param {XY[]} ring @param {XY} n @param {number} t */
export function crossings(ring, n, t) {
  let k = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const va = a[0] * n[0] + a[1] * n[1] - t, vb = b[0] * n[0] + b[1] * n[1] - t;
    if ((va < 0 && vb >= 0) || (va >= 0 && vb < 0)) k++;
  }
  return k;
}

/**
 * Longueur de la limite d'une pièce située sur un segment de référence (façade).
 * @param {XY[]} piece @param {XY} a @param {XY} b
 */
export function frontage(piece, a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!L) return 0;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const tol = Math.max(1e-6, L * 1e-9);
  let len = 0;
  for (let i = 0; i < piece.length; i++) {
    const p = piece[i], q = piece[(i + 1) % piece.length];
    const dp = Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux), dq = Math.abs((q[0] - a[0]) * uy - (q[1] - a[1]) * ux);
    if (dp > tol || dq > tol) continue;
    const sp = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy, sq = (q[0] - a[0]) * ux + (q[1] - a[1]) * uy;
    const lo = Math.max(0, Math.min(sp, sq)), hi = Math.min(L, Math.max(sp, sq));
    if (hi > lo) len += hi - lo;
  }
  return len;
}

/**
 * Partage d'un polygone plan en bandes de superficies proportionnelles aux parts.
 * @param {XY[]} ringIn sommets (coordonnées planes, m)
 * @param {number[]} percents parts en % dans l'ordre des bandes (somme 100)
 * @param {number} bearingDeg gisement des lignes de partage (°)
 * @param {{ refSide?: [XY, XY] }} [opts] côté de référence (calcul des façades)
 */
export function divideByStrips(ringIn, percents, bearingDeg, opts = {}) {
  const ring = openRing(ringIn);
  const A = planeArea(ring);
  if (ring.length < 3 || A <= 0) throw new Error('Parcelle invalide : impossible de la partager.');
  const total = percents.reduce((s, p) => s + p, 0);
  const { n, d } = cutVectors(bearingDeg);
  const proj = ring.map((p) => p[0] * n[0] + p[1] * n[1]);
  const tmin = Math.min(...proj), tmax = Math.max(...proj);
  /** Superficie de la partie {p·n ≤ t}. @param {number} t */
  const below = (t) => planeArea(clipHalfPlane(ring, n, t));
  const cuts = [];
  let cum = 0;
  for (let i = 0; i < percents.length - 1; i++) {
    cum += percents[i] / total;
    const target = cum * A;
    let lo = tmin, hi = tmax;
    for (let k = 0; k < 200 && hi - lo > 1e-10; k++) {
      const mid = (lo + hi) / 2;
      if (below(mid) < target) lo = mid; else hi = mid;
    }
    cuts.push((lo + hi) / 2);
  }
  const bounds = [tmin - 1, ...cuts, tmax + 1];
  const pieces = [];
  for (let i = 0; i < percents.length; i++) {
    let piece = clipHalfPlane(ring, n, bounds[i + 1]);
    piece = clipHalfPlane(piece, n, bounds[i], true);
    const area = planeArea(piece);
    // Contiguïté : chaque ligne bordant la pièce ne doit couper le contour qu'en 2 points
    const lineCross = [i > 0 ? crossings(ring, n, bounds[i]) : 2, i < percents.length - 1 ? crossings(ring, n, bounds[i + 1]) : 2];
    if (signedArea(piece) < 0) piece.reverse();
    pieces.push({
      ring: piece,
      area,
      target: (percents[i] / total) * A,
      percent: percents[i],
      perimeter: planePerimeter(piece),
      compactness: area > 0 ? (4 * Math.PI * area) / planePerimeter(piece) ** 2 : 0,
      contiguous: lineCross.every((c) => c <= 2),
      frontage: opts.refSide ? frontage(piece, opts.refSide[0], opts.refSide[1]) : null,
    });
  }
  // Segments des lignes de partage (pour l'affichage)
  const span = Math.max(tmax - tmin, ...ring.map((p) => Math.abs(p[0] * d[0] + p[1] * d[1]))) * 4 + 10;
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const s0 = cx * d[0] + cy * d[1];
  const lines = cuts.map((t) => {
    /** @param {number} s @returns {XY} */
    const P = (s) => [t * n[0] + s * d[0], t * n[1] + s * d[1]];
    return [P(s0 - span), P(s0 + span)];
  });
  return { area: A, bearing: ((bearingDeg % 180) + 180) % 180, pieces, cuts, lines, contiguous: pieces.every((p) => p.contiguous) };
}

/**
 * Propositions de découpage : bandes perpendiculaires à chaque côté (chacun garde une façade
 * sur ce côté) ou parallèles à ce côté. Classées par qualité (contiguïté, forme compacte,
 * accès au côté de référence).
 * @param {XY[]} ringIn @param {number[]} percents @param {{ max?: number, preferSide?: number|null }} [opts]
 */
export function proposeDivisions(ringIn, percents, opts = {}) {
  const ring = openRing(ringIn);
  const per = planePerimeter(ring);
  const seen = [];
  const out = [];
  const order = ring.map((_, i) => i);
  if (opts.preferSide != null && opts.preferSide >= 0 && opts.preferSide < ring.length) { order.splice(opts.preferSide, 1); order.unshift(opts.preferSide); }
  for (const i of order) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < per * 0.04 && i !== opts.preferSide) continue;
    const sideBearing = ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI) + 360) % 180;
    for (const kind of ['perpendicular', 'parallel']) {
      const bearing = kind === 'perpendicular' ? (sideBearing + 90) % 180 : sideBearing;
      if (seen.some((s) => Math.abs(((s - bearing + 270) % 180) - 90) < 1)) continue;
      seen.push(bearing);
      let r;
      try { r = divideByStrips(ring, percents, bearing, { refSide: [a, b] }); } catch { continue; }
      const minCompact = Math.min(...r.pieces.map((p) => p.compactness));
      const allFront = r.pieces.every((p) => (p.frontage ?? 0) > 0.01);
      let score = minCompact;
      if (!r.contiguous) score -= 1;
      if (kind === 'perpendicular' && allFront) score += 0.15;
      if (opts.preferSide === i) score += kind === 'perpendicular' ? 0.5 : 0.1;
      out.push({ side: i, kind, bearing, score, result: r, minCompact, allFront, sideLength: len });
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, opts.max ?? 4);
}
