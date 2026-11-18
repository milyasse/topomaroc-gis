// @ts-check
/**
 * Image de situation d'une parcelle sur fond satellite (tuiles Esri World Imagery, comme le fond
 * « Satellite » de l'application), pour les rapports PDF. Renvoie null si les tuiles ne sont pas
 * disponibles (hors connexion, serveur indisponible) : le rapport garde alors le seul plan coté.
 */
const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const MAP_ATTRIBUTION = 'Imagerie © Esri, Maxar, Earthstar Geographics, GIS User Community';
const MAX_NATIVE = 18; // imagerie disponible au Maroc rural (mesuré : docs/resultats-tests/tuiles.json)
const PLACEHOLDER_SIZE = 2521; // tuile « Map data not yet available » d'Esri

/** Coordonnées « monde » Web Mercator en pixels au zoom z. @param {number} lon @param {number} lat @param {number} z */
function project(lon, lat, z) {
  const s = 256 * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
}

/** @param {number} z @param {number} x @param {number} y @param {AbortSignal} signal @returns {Promise<ImageBitmap|null>} */
async function tile(z, x, y, signal) {
  try {
    const r = await fetch(TILE.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), { mode: 'cors', signal });
    if (!r.ok) return null;
    const b = await r.blob();
    if (b.size === PLACEHOLDER_SIZE) return null;
    return await createImageBitmap(b);
  } catch { return null; }
}

/**
 * @param {{lon:number, lat:number}[]} ring sommets WGS 84
 * @param {string[]} labels étiquettes des sommets
 * @param {{ widthPx?: number, heightPx?: number, timeoutMs?: number }} [o]
 * @returns {Promise<null | { dataUrl: string, zoom: number, metersPerPx: number }>}
 */
export async function parcelMapImage(ring, labels, o = {}) {
  if (typeof document === 'undefined' || !ring.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  const Wp = o.widthPx ?? 1056, Hp = o.heightPx ?? 1104;
  const lons = ring.map((p) => p.lon), lats = ring.map((p) => p.lat);
  const c0 = project(Math.min(...lons), Math.max(...lats), 0), c1 = project(Math.max(...lons), Math.min(...lats), 0);
  const bw = Math.max(c1.x - c0.x, 1e-9), bh = Math.max(c1.y - c0.y, 1e-9);
  // zoom (fractionnaire) pour que la parcelle occupe ~60 % du cadre
  const zf = Math.min(Math.log2((Wp * 0.6) / bw), Math.log2((Hp * 0.6) / bh), 21);
  const zi = Math.max(1, Math.min(MAX_NATIVE, Math.floor(zf)));
  const k = 2 ** (zf - zi); // agrandissement des tuiles au-delà de l'imagerie disponible
  const cx = (c0.x + c1.x) / 2 * 2 ** zi, cy = (c0.y + c1.y) / 2 * 2 ** zi; // centre, pixels au zoom zi
  const left = cx - Wp / 2 / k, top = cy - Hp / 2 / k;
  const tx0 = Math.floor(left / 256), ty0 = Math.floor(top / 256), tx1 = Math.floor((left + Wp / k) / 256), ty1 = Math.floor((top + Hp / k) / 256);
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 64) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 12000);
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push(tile(zi, tx, ty, ctl.signal).then((bmp) => ({ tx, ty, bmp })));
  const tiles = await Promise.all(jobs);
  clearTimeout(timer);
  const got = tiles.filter((t) => t.bmp).length;
  if (got < tiles.length * 0.6) return null;

  const cv = document.createElement('canvas'); cv.width = Wp; cv.height = Hp;
  const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  ctx.fillStyle = '#d9dee3'; ctx.fillRect(0, 0, Wp, Hp);
  ctx.imageSmoothingQuality = 'high';
  for (const t of tiles) if (t.bmp) ctx.drawImage(t.bmp, (t.tx * 256 - left) * k, (t.ty * 256 - top) * k, 256 * k + 0.5, 256 * k + 0.5);

  const P = ring.map((p) => { const q = project(p.lon, p.lat, zi); return [(q.x - left) * k, (q.y - top) * k]; });
  // parcelle : liseré blanc + contour orange, remplissage léger
  ctx.lineJoin = 'round';
  ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = 'rgba(214,96,42,0.16)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 9; ctx.stroke();
  ctx.strokeStyle = '#d6602a'; ctx.lineWidth = 4.5; ctx.stroke();
  // sommets et étiquettes
  const gx = P.reduce((s, p) => s + p[0], 0) / P.length, gy = P.reduce((s, p) => s + p[1], 0) / P.length;
  ctx.font = 'bold 26px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  P.forEach(([x, y], i) => {
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fillStyle = '#c62828'; ctx.fill();
    const vx = x - gx, vy = y - gy, n = Math.hypot(vx, vy) || 1;
    const lx = x + (vx / n) * 30, ly = y + (vy / n) * 30, txt = labels[i] ?? String(i + 1);
    const w = ctx.measureText(txt).width + 14;
    ctx.fillStyle = 'rgba(15,61,94,0.88)'; ctx.beginPath(); ctx.roundRect(lx - w / 2, ly - 17, w, 34, 8); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, lx, ly + 1);
  });
  // nord (Web Mercator : nord en haut)
  ctx.save(); ctx.translate(Wp - 56, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.arc(0, 8, 38, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#14212d'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-12, 16); ctx.lineTo(0, 9); ctx.lineTo(12, 16); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 20px Helvetica, Arial, sans-serif'; ctx.fillText('N', 0, 33); ctx.restore();
  // échelle graphique (au centre de l'image)
  const latC = (Math.min(...lats) + Math.max(...lats)) / 2;
  const mpp = (156543.03392804097 * Math.cos((latC * Math.PI) / 180)) / 2 ** zf;
  const raw = (Wp * 0.25) * mpp, pow = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((v) => v * pow).reduce((b, v) => (Math.abs(v - raw) < Math.abs(b - raw) ? v : b));
  const len = nice / mpp;
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.roundRect(22, Hp - 76, len + 40, 54, 10); ctx.fill();
  ctx.fillStyle = '#14212d'; ctx.fillRect(42, Hp - 40, len, 6); ctx.fillRect(42, Hp - 48, 3, 20); ctx.fillRect(42 + len - 3, Hp - 48, 3, 20);
  ctx.font = 'bold 20px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, 42 + len / 2, Hp - 58);
  return { dataUrl: cv.toDataURL('image/jpeg', 0.86), zoom: zf, metersPerPx: mpp };
}
