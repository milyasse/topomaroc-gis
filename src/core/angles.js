// @ts-check
/** Angles, azimuts et formats de saisie (degrés décimaux, DMS, grades). */

/** Ramène un angle dans [0, 360[. @param {number} a */
export function norm360(a) { const r = a % 360; return r < 0 ? r + 360 : r; }
/** Ramène un angle dans ]-180, 180]. @param {number} a */
export function norm180(a) { const r = norm360(a); return r > 180 ? r - 360 : r; }

/** @param {number} deg */ export const degToGrad = (deg) => deg * 400 / 360;
/** @param {number} gr */ export const gradToDeg = (gr) => gr * 360 / 400;

/**
 * Azimut (gisement) plan entre deux points [x, y] (E, N), mesuré depuis le nord
 * de la grille dans le sens horaire, en degrés [0, 360[.
 * @param {[number,number]} a @param {[number,number]} b
 */
export function gridBearing(a, b) {
  return norm360(Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI);
}

/**
 * Formate un azimut exprimé en degrés.
 * @param {number} deg @param {'deg'|'grad'|'dms'} unit @param {number} [decimals]
 */
export function formatBearing(deg, unit = 'deg', decimals) {
  if (!Number.isFinite(deg)) return '—';
  const d = norm360(deg);
  if (unit === 'grad') return `${degToGrad(d).toFixed(decimals ?? 4)} gr`;
  if (unit === 'dms') return toDMS(d, decimals ?? 0);
  return `${d.toFixed(decimals ?? 2)}°`;
}

/** Point cardinal (16 directions) d'un azimut en degrés. @param {number} deg */
export function cardinal(deg) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return names[Math.round(norm360(deg) / 22.5) % 16];
}

/**
 * Degrés décimaux → texte DMS.
 * @param {number} value @param {number} [secDecimals] @param {[string,string]} [hemi] ex. ['N','S']
 */
export function toDMS(value, secDecimals = 1, hemi) {
  const sign = value < 0 ? -1 : 1;
  let v = Math.abs(value);
  let d = Math.floor(v);
  let m = Math.floor((v - d) * 60);
  let s = ((v - d) * 60 - m) * 60;
  const f = 10 ** secDecimals;
  s = Math.round(s * f) / f;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  const body = `${d}°${String(m).padStart(2, '0')}′${s.toFixed(secDecimals).padStart(secDecimals ? 3 + secDecimals : 2, '0')}″`;
  if (hemi) return `${body} ${sign < 0 ? hemi[1] : hemi[0]}`;
  return sign < 0 ? `-${body}` : body;
}

/**
 * Analyse une valeur angulaire saisie : « -6.8498 », « 6,8498 W », « 33°58'12.3"N »,
 * « 33 58 12.3 », « 33:58:12.3 ». Renvoie NaN si illisible.
 * @param {string|number} input
 */
export function parseAngle(input) {
  if (typeof input === 'number') return input;
  let s = String(input).trim().toUpperCase().replace(/,/g, '.');
  if (!s) return NaN;
  let sign = 1;
  const hemi = s.match(/[NSEWO]$/) || s.match(/^[NSEWO]/);
  if (hemi) {
    if (hemi[0] === 'S' || hemi[0] === 'W' || hemi[0] === 'O') sign = -1;
    s = s.replace(/^[NSEWO]\s*|\s*[NSEWO]$/g, '');
  }
  if (s.startsWith('-')) { sign *= -1; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  const parts = s.split(/[°º'′"″\s:]+/).filter(Boolean);
  if (!parts.length || parts.length > 3 || !parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return NaN;
  const [d, m = '0', sec = '0'] = parts;
  const mm = Number(m), ss = Number(sec);
  if (mm >= 60 || ss >= 60) return NaN;
  return sign * (Number(d) + mm / 60 + ss / 3600);
}

/** Analyse un nombre saisi avec virgule ou point, espaces de milliers tolérés. @param {string|number} input */
export function parseNumber(input) {
  if (typeof input === 'number') return input;
  const s = String(input).trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}
