// @ts-check
/**
 * Calculs géodésiques sur l'ellipsoïde WGS 84 (GeographicLib, C. Karney) :
 * distances, azimuts et superficies exactes au millimètre près.
 */
import { Geodesic } from '../../vendor/geodesic.mjs';

const geod = Geodesic.WGS84;

/**
 * Problème inverse : distance (m) et azimut de départ (°, depuis le nord vrai).
 * @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2
 * @returns {{ distance: number, azimuth: number }}
 */
export function inverse(lat1, lon1, lat2, lon2) {
  const r = geod.Inverse(lat1, lon1, lat2, lon2);
  return { distance: r.s12, azimuth: (r.azi1 + 360) % 360 };
}

/** @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2 */
export function distance(lat1, lon1, lat2, lon2) { return geod.Inverse(lat1, lon1, lat2, lon2).s12; }

/**
 * Problème direct : point atteint depuis (lat, lon) selon un azimut et une distance.
 * @param {number} lat @param {number} lon @param {number} azimuth @param {number} dist
 */
export function direct(lat, lon, azimuth, dist) {
  const r = geod.Direct(lat, lon, azimuth, dist);
  return { lat: r.lat2, lon: r.lon2 };
}

/**
 * Superficie et périmètre géodésiques d'un polygone (côtés = géodésiques WGS 84).
 * @param {{lat:number, lon:number}[]} ring sommets (non refermés)
 * @returns {{ area: number, perimeter: number }}
 */
export function polygonArea(ring) {
  const p = geod.Polygon(false);
  for (const v of ring) p.AddPoint(v.lat, v.lon);
  const r = p.Compute(false, true);
  return { area: Math.abs(r.area), perimeter: r.perimeter };
}

/**
 * Point intermédiaire le long d'une géodésique (pour tracer des lignes fidèles sur la carte).
 * @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2 @param {number} n
 */
export function densify(lat1, lon1, lat2, lon2, n = 16) {
  const line = geod.InverseLine(lat1, lon1, lat2, lon2);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const r = line.Position((line.s13 * i) / n);
    out.push([r.lat2, r.lon2]);
  }
  return out;
}
