// @ts-check
/** Unités et formatage (français, séparateurs fins). */

export const AREA_UNITS = /** @type {const} */ ({
  m2: { label: 'm²', factor: 1, decimals: 2 },
  a: { label: 'a (are)', factor: 100, decimals: 4 },
  ha: { label: 'ha', factor: 10000, decimals: 4 },
  km2: { label: 'km²', factor: 1e6, decimals: 6 },
  haaca: { label: 'ha a ca', factor: 1, decimals: 0 },
});

const NBSP = ' ';

/** @param {number} v @param {number} decimals */
export function fmtNum(v, decimals = 2) {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(decimals);
  const [int, dec] = s.split('.');
  const neg = int.startsWith('-');
  const digits = neg ? int.slice(1) : int;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (neg ? '-' : '') + grouped + (dec ? ',' + dec : '');
}

/**
 * Format cadastral marocain « X ha Y a Z ca » (1 ca = 1 m², 1 a = 100 m², 1 ha = 10 000 m²),
 * centiares arrondis à l'unité.
 * @param {number} m2
 */
export function formatHaACa(m2) {
  if (!Number.isFinite(m2)) return '—';
  const total = Math.round(m2);
  const ha = Math.floor(total / 10000);
  const a = Math.floor((total % 10000) / 100);
  const ca = total % 100;
  return `${ha}${NBSP}ha ${String(a).padStart(2, '0')}${NBSP}a ${String(ca).padStart(2, '0')}${NBSP}ca`;
}

/** @param {number} m2 @param {keyof typeof AREA_UNITS} unit */
export function formatArea(m2, unit = 'm2') {
  if (unit === 'haaca') return formatHaACa(m2);
  const u = AREA_UNITS[unit];
  return `${fmtNum(m2 / u.factor, u.decimals)}${NBSP}${unit === 'm2' ? 'm²' : unit === 'km2' ? 'km²' : unit}`;
}

/** @param {number} m @param {number} [decimals] */
export function formatLength(m, decimals) {
  if (!Number.isFinite(m)) return '—';
  if (m >= 10000 && decimals === undefined) return `${fmtNum(m / 1000, 3)}${NBSP}km`;
  return `${fmtNum(m, decimals ?? (m < 100 ? 2 : m < 1000 ? 2 : 1))}${NBSP}m`;
}

/** Distance pour la navigation (lisible en marchant). @param {number} m */
export function formatNavDistance(m) {
  if (!Number.isFinite(m)) return '—';
  if (m < 10) return `${fmtNum(m, 1)}${NBSP}m`;
  if (m < 1000) return `${Math.round(m)}${NBSP}m`;
  return `${fmtNum(m / 1000, m < 10000 ? 2 : 1)}${NBSP}km`;
}

/** Coordonnée dans l'unité du SRC. @param {number} v @param {'deg'|'m'} unit */
export function formatCoord(v, unit) {
  return unit === 'm' ? fmtNum(v, 3) : fmtNum(v, 7);
}
