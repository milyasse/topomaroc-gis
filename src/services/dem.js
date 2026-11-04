// @ts-check
/**
 * Modèle numérique de terrain en ligne : tuiles « Terrarium » (AWS Open Data, dérivées notamment
 * de SRTM ~30 m au Maroc ; disponibles jusqu'au zoom 15 — mesure : docs/resultats-tests/tuiles.json).
 * Précision indicative : ± 5 à 10 m en altitude ; les pentes calculées sont des tendances
 * à l'échelle de la parcelle, pas des mesures topographiques.
 */
import { decodeTerrarium, lonLatToPixel } from '../core/terrain.js';

export const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const DEM_ZOOM = 14;
export const DEM_SOURCE = 'MNT Terrarium (AWS Open Data / Mapzen, SRTM ~30 m)';

const cache = new Map();

/** @param {number} z @param {number} x @param {number} y @returns {Promise<Float32Array>} */
function tile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const r = await fetch(DEM_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), { mode: 'cors' });
    if (!r.ok) throw new Error(`MNT indisponible (HTTP ${r.status})`);
    const bmp = await createImageBitmap(await r.blob());
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const ctx = /** @type {any} */ (canvas).getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, 256, 256).data;
    const out = new Float32Array(256 * 256);
    for (let k = 0; k < out.length; k++) out[k] = decodeTerrarium(d[4 * k], d[4 * k + 1], d[4 * k + 2]);
    return out;
  })();
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return p;
}

/**
 * Grille d'altitudes couvrant une emprise WGS 84 (+ marge de 2 pixels).
 * @param {{minLon:number, minLat:number, maxLon:number, maxLat:number}} b @param {number} [z]
 * @returns {Promise<import('../core/terrain.js').Grid>}
 */
export async function gridFor(b, z = DEM_ZOOM) {
  if (!navigator.onLine) throw new Error('MNT indisponible hors connexion.');
  const a = lonLatToPixel(z, b.minLon, b.maxLat), c = lonLatToPixel(z, b.maxLon, b.minLat);
  const x0 = Math.floor(a.x) - 2, y0 = Math.floor(a.y) - 2, x1 = Math.ceil(c.x) + 2, y1 = Math.ceil(c.y) + 2;
  const w = x1 - x0, h = y1 - y0;
  if (w * h > 1600 * 1600) throw new Error('Emprise trop grande pour le calcul de pente (> 12 km).');
  const data = new Float32Array(w * h);
  const jobs = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y1 - 1) / 256); ty++) {
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x1 - 1) / 256); tx++) {
      jobs.push(tile(z, tx, ty).then((t) => {
        for (let j = Math.max(y0, ty * 256); j < Math.min(y1, ty * 256 + 256); j++) {
          for (let i = Math.max(x0, tx * 256); i < Math.min(x1, tx * 256 + 256); i++) data[(j - y0) * w + (i - x0)] = t[(j - ty * 256) * 256 + (i - tx * 256)];
        }
      }));
    }
  }
  await Promise.all(jobs);
  return { data, w, h, x0, y0, z };
}

/** Altitude MNT en un point. @param {number} lat @param {number} lon */
export async function elevationAt(lat, lon) {
  const { sampleGrid } = await import('../core/terrain.js');
  const d = 0.0005;
  const g = await gridFor({ minLon: lon - d, minLat: lat - d, maxLon: lon + d, maxLat: lat + d });
  const p = lonLatToPixel(g.z, lon, lat);
  return sampleGrid(g, p.x, p.y);
}
