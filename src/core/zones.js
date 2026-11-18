// @ts-check
/**
 * Choix automatique du système de projection selon la position.
 *
 * Les limites entre zones Lambert sont déduites des domaines d'usage EPSG enregistrés dans
 * CRS_LIST (emprises issues de la base PROJ/EPSG) : deux zones voisines se recouvrent de ~0,02°,
 * la limite retenue est le milieu de ce recouvrement (≈ 31,5° N, 27,665° N et 24,3° N).
 * UTM : fuseau = ⌊(λ + 180) / 6⌋ + 1 (28, 29 ou 30 au Maroc).
 *
 * Une marge (hystérésis) évite les basculements incessants quand on se déplace le long d'une
 * limite : on ne quitte la zone courante qu'après l'avoir dépassée de `margin` degrés (~2 km).
 */
import { CRS_LIST, MOROCCO_BBOX, inBBox, utmZoneFor } from './crs.js';

const ORDER = ['EPSG:26191', 'EPSG:26192', 'EPSG:26194', 'EPSG:26195'];

/** Bandes de latitude [min, max[ de chaque zone Lambert, du nord au sud. */
export const LAMBERT_BANDS = ORDER.map((id, i) => {
  const bb = (/** @type {string} */ k) => /** @type {any} */ (CRS_LIST.find((c) => c.id === k)).bbox;
  const me = bb(id);
  const max = i === 0 ? 90 : (bb(ORDER[i - 1])[1] + me[3]) / 2;
  const min = i === ORDER.length - 1 ? -90 : (me[1] + bb(ORDER[i + 1])[3]) / 2;
  return { id, min, max };
});

/** Familles proposées pour le choix automatique. */
export const FAMILIES = [
  { value: 'lambert', label: 'Lambert Maroc (Merchich) — zone selon la latitude' },
  { value: 'utm', label: 'UTM WGS 84 — fuseau selon la longitude' },
];

/**
 * Zone de travail pour une position (null si hors du Maroc : on garde alors le système courant).
 * @param {number} lon @param {number} lat
 * @param {string} [family] 'lambert' | 'utm'
 * @param {string|null} [current] zone actuellement active (pour l'hystérésis)
 * @param {number} [margin] marge en degrés
 * @returns {string|null}
 */
export function zoneFor(lon, lat, family = 'lambert', current = null, margin = 0.02) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !inBBox(MOROCCO_BBOX, lon, lat, 0.5)) return null;
  if (family === 'utm') {
    const cur = current ? /^EPSG:326(\d\d)$/.exec(current) : null;
    if (cur) {
      const west = -180 + (Number(cur[1]) - 1) * 6;
      if (lon >= west - margin && lon < west + 6 + margin) return /** @type {string} */ (current);
    }
    return `EPSG:326${String(utmZoneFor(lon)).padStart(2, '0')}`;
  }
  const cb = LAMBERT_BANDS.find((b) => b.id === current);
  if (cb && lat >= cb.min - margin && lat < cb.max + margin) return /** @type {string} */ (current);
  return (LAMBERT_BANDS.find((b) => lat >= b.min && lat < b.max) ?? LAMBERT_BANDS[0]).id;
}

/** Famille d'un système (null si ce n'est ni Lambert Maroc ni UTM). @param {string} id */
export function familyOf(id) {
  if (ORDER.includes(id)) return 'lambert';
  if (/^EPSG:326\d\d$/.test(id)) return 'utm';
  return null;
}

/** Zone d'un point isolé, sans hystérésis. @param {number} lon @param {number} lat @param {string} [family] */
export const zoneAt = (lon, lat, family = 'lambert') => zoneFor(lon, lat, family, null, 0);
