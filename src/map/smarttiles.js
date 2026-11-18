// @ts-check
/**
 * Couche de tuiles « intelligente » pour l'imagerie satellite.
 *
 * Problème mesuré (docs/resultats-tests/tuiles.json) : au Maroc, l'imagerie Esri n'existe
 * que jusqu'au zoom 18 en zone rurale (19 en ville, 17 à Dakhla). Au-delà, le serveur
 * renvoie une image grise « Map data not yet available » (JPEG de 2 521 octets) ou une
 * erreur 404 : la carte paraissait vide.
 *
 * Solution : chaque tuile est téléchargée ; si elle est absente ou de remplacement, on
 * remonte au niveau inférieur (jusqu'à `maxBack` niveaux) et on agrandit la portion
 * correspondante. On voit ainsi toujours la meilleure image disponible, quel que soit le zoom.
 */
import * as L from '../../vendor/leaflet/leaflet.mjs';

/** Signatures connues des tuiles « pas de données ». */
export const PLACEHOLDERS = [{ size: 2521, type: 'image/jpeg' }];

/** @param {Blob} b @param {{size:number,type:string}[]} sigs */
export function isPlaceholder(b, sigs = PLACEHOLDERS) {
  return sigs.some((s) => b.size === s.size && (!s.type || b.type === s.type));
}

const cache = new Map();
const CACHE_MAX = 300;

/**
 * @param {string} url
 * @param {{ subdomains?: string, placeholders?: {size:number,type:string}[] }} o
 * @param {number} z @param {number} x @param {number} y
 * @returns {Promise<ImageBitmap|HTMLImageElement|null>}
 */
function getImage(url, o, z, x, y) {
  const key = `${url}|${z}/${x}/${y}`;
  if (cache.has(key)) return cache.get(key);
  const sub = o.subdomains ? o.subdomains[Math.abs(x + y) % o.subdomains.length] : '';
  const src = url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{s}', sub).replace('{r}', '');
  const p = (async () => {
    try {
      const r = await fetch(src, { mode: 'cors', credentials: 'omit' });
      if (!r.ok) return null;
      const b = await r.blob();
      if (isPlaceholder(b, o.placeholders)) return null;
      if ('createImageBitmap' in window) return await createImageBitmap(b);
      return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(b); });
    } catch { return null; }
  })();
  cache.set(key, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return p;
}

/**
 * @param {string} url
 * @param {any} options options Leaflet + { maxBack?: number, placeholders?: any[] }
 */
export function smartTileLayer(url, options = {}) {
  const maxBack = options.maxBack ?? 5;
  const Layer = L.TileLayer.extend({
    createTile(/** @type {any} */ coords, /** @type {(e:any, t:any)=>void} */ done) {
      const size = this.getTileSize();
      const canvas = document.createElement('canvas');
      canvas.width = size.x; canvas.height = size.y;
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      const z = coords.z;
      (async () => {
        const maxNative = this.options.nativeLimit ?? 22;
        const startBack = Math.max(0, z - maxNative);
        for (let back = startBack; back <= startBack + maxBack && z - back >= 0; back++) {
          const zz = z - back, f = 2 ** back;
          const xx = Math.floor(coords.x / f), yy = Math.floor(coords.y / f);
          const img = await getImage(url, this.options, zz, xx, yy);
          if (!img) continue;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          const w = /** @type {any} */ (img).width / f, hgt = /** @type {any} */ (img).height / f;
          ctx.drawImage(/** @type {any} */ (img), (coords.x - xx * f) * w, (coords.y - yy * f) * hgt, w, hgt, 0, 0, size.x, size.y);
          this.fire('resolution', { requested: z, served: zz });
          done(null, canvas);
          return;
        }
        done(new Error('Aucune imagerie disponible'), canvas);
      })();
      return canvas;
    },
  });
  // Leaflet demande une tuile à chaque zoom ; la couche choisit elle-même le niveau réellement
  // disponible (nativeLimit = niveau maximal connu du fournisseur, puis repli automatique).
  const { maxNativeZoom, ...rest } = options;
  return new Layer(url, { ...rest, nativeLimit: maxNativeZoom ?? 22 });
}
