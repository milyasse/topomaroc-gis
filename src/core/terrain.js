// @ts-check
/**
 * Relief : altitudes et pentes à partir d'un modèle numérique de terrain (MNT) en tuiles
 * « Terrarium » (altitude codée dans les canaux RVB), et pente entre deux points d'altitude connue.
 *
 * La pente d'une cellule est calculée par la méthode de Horn (fenêtre 3 × 3), standard des SIG
 * (identique à GDAL `gdaldem slope`). Exposition = direction de la plus grande descente.
 */

const R = 6378137;
const ORIGIN = 2 * Math.PI * R;

/** Altitude (m) d'un pixel Terrarium. @param {number} r @param {number} g @param {number} b */
export const decodeTerrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

/** Coordonnées pixel globales (tuiles 256 px) d'une position WGS 84 au zoom z. @param {number} z @param {number} lon @param {number} lat */
export function lonLatToPixel(z, lon, lat) {
  const n = 256 * 2 ** z;
  const s = Math.sin(lat * Math.PI / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
/** Inverse de lonLatToPixel. @param {number} z @param {number} x @param {number} y */
export function pixelToLonLat(z, x, y) {
  const n = 256 * 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lon, lat };
}
/** Taille au sol d'un pixel (m) au zoom z et à la latitude donnée. @param {number} z @param {number} lat */
export const pixelSize = (z, lat) => (ORIGIN * Math.cos(lat * Math.PI / 180)) / (256 * 2 ** z);

/**
 * @typedef {Object} Grid
 * @property {Float32Array} data altitudes (m), ligne par ligne
 * @property {number} w @property {number} h
 * @property {number} x0 @property {number} y0 coordonnées pixel globales du coin haut-gauche
 * @property {number} z niveau de zoom
 */

/** Altitude interpolée (bilinéaire) en un pixel global. @param {Grid} g @param {number} px @param {number} py */
export function sampleGrid(g, px, py) {
  const x = px - g.x0 - 0.5, y = py - g.y0 - 0.5;
  const i = Math.max(0, Math.min(g.w - 2, Math.floor(x))), j = Math.max(0, Math.min(g.h - 2, Math.floor(y)));
  const fx = Math.min(1, Math.max(0, x - i)), fy = Math.min(1, Math.max(0, y - j));
  const v = (/** @type {number} */ a, /** @type {number} */ b) => g.data[b * g.w + a];
  return v(i, j) * (1 - fx) * (1 - fy) + v(i + 1, j) * fx * (1 - fy) + v(i, j + 1) * (1 - fx) * fy + v(i + 1, j + 1) * fx * fy;
}

/**
 * Pente (Horn) d'une cellule intérieure.
 * @param {Grid} g @param {number} i @param {number} j @param {number} cell taille de cellule (m)
 * @returns {{ dzdx: number, dzdy: number, pct: number, deg: number }}
 */
export function hornSlope(g, i, j, cell) {
  const v = (/** @type {number} */ a, /** @type {number} */ b) => g.data[(j + b) * g.w + (i + a)];
  // x vers l'est, y vers le nord (les lignes de la grille descendent vers le sud)
  const dzdx = ((v(1, -1) + 2 * v(1, 0) + v(1, 1)) - (v(-1, -1) + 2 * v(-1, 0) + v(-1, 1))) / (8 * cell);
  const dzdy = ((v(-1, -1) + 2 * v(0, -1) + v(1, -1)) - (v(-1, 1) + 2 * v(0, 1) + v(1, 1))) / (8 * cell);
  const t = Math.hypot(dzdx, dzdy);
  return { dzdx, dzdy, pct: t * 100, deg: Math.atan(t) * 180 / Math.PI };
}

/** Exposition (direction de descente, ° depuis le nord) d'un gradient. @param {number} dzdx @param {number} dzdy */
export function aspect(dzdx, dzdy) {
  if (Math.hypot(dzdx, dzdy) < 1e-9) return NaN;
  return (Math.atan2(-dzdx, -dzdy) * 180 / Math.PI + 360) % 360;
}

/** @param {number} x @param {number} y @param {[number,number][]} ring */
function inside(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Statistiques de relief d'un polygone (sommets en [lon, lat]).
 * @param {Grid} g @param {[number,number][]} ringLL
 */
export function polygonTerrain(g, ringLL) {
  const ringPx = ringLL.map(([lon, lat]) => { const p = lonLatToPixel(g.z, lon, lat); return /** @type {[number,number]} */ ([p.x, p.y]); });
  const lat0 = ringLL.reduce((s, p) => s + p[1], 0) / ringLL.length;
  const cell = pixelSize(g.z, lat0);
  let n = 0, sum = 0, mn = Infinity, mx = -Infinity, sSum = 0, sMax = 0, gx = 0, gy = 0;
  const cells = [];
  for (let j = 1; j < g.h - 1; j++) {
    for (let i = 1; i < g.w - 1; i++) {
      if (!inside(g.x0 + i + 0.5, g.y0 + j + 0.5, ringPx)) continue;
      cells.push([i, j]);
    }
  }
  if (!cells.length) {
    // parcelle plus petite qu'une cellule du MNT : cellule la plus proche du centre
    const cx = ringPx.reduce((s, p) => s + p[0], 0) / ringPx.length, cy = ringPx.reduce((s, p) => s + p[1], 0) / ringPx.length;
    cells.push([Math.max(1, Math.min(g.w - 2, Math.floor(cx - g.x0))), Math.max(1, Math.min(g.h - 2, Math.floor(cy - g.y0)))]);
  }
  for (const [i, j] of cells) {
    const z = g.data[j * g.w + i];
    const s = hornSlope(g, i, j, cell);
    n++; sum += z; mn = Math.min(mn, z); mx = Math.max(mx, z);
    sSum += s.pct; sMax = Math.max(sMax, s.pct); gx += s.dzdx; gy += s.dzdy;
  }
  // altitudes aux sommets (interpolées) pour le dénivelé du contour
  const vz = ringPx.map(([x, y]) => sampleGrid(g, x, y));
  mn = Math.min(mn, ...vz); mx = Math.max(mx, ...vz);
  const meanG = Math.hypot(gx / n, gy / n);
  return {
    cells: n, cellSize: cell,
    elevMin: mn, elevMax: mx, elevMean: sum / n, relief: mx - mn,
    slopeMeanPct: sSum / n, slopeMaxPct: sMax, slopeMeanDeg: Math.atan(sSum / n / 100) * 180 / Math.PI,
    trendPct: meanG * 100, aspect: aspect(gx / n, gy / n),
    vertexElev: vz,
  };
}

/** Pente entre deux points. @param {number} z1 @param {number} z2 @param {number} dist distance horizontale (m) */
export function slopeBetween(z1, z2, dist) {
  const dz = z2 - z1;
  return { dz, pct: dist > 0 ? (dz / dist) * 100 : NaN, deg: dist > 0 ? Math.atan2(dz, dist) * 180 / Math.PI : NaN };
}

/** Classe de pente (usage agricole / aménagement). @param {number} pct */
export function slopeClass(pct) {
  const a = Math.round(Math.abs(pct) * 10) / 10; // classe cohérente avec la valeur affichée (1 décimale)
  if (a < 2) return 'plat';
  if (a < 5) return 'faible';
  if (a < 10) return 'modérée';
  if (a < 20) return 'forte';
  if (a < 35) return 'très forte';
  return 'escarpée';
}

/** Libellé d'exposition (8 directions). @param {number} deg */
export function aspectLabel(deg) {
  if (!Number.isFinite(deg)) return 'aucune (terrain plat)';
  return ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'][Math.round(deg / 45) % 8];
}
