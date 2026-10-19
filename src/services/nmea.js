// @ts-check
/**
 * Lecture de trames NMEA 0183 (GGA, RMC, GST) — base pour l'intégration future d'un
 * récepteur GNSS externe / RTK (Bluetooth, série). Non utilisé par la source par défaut.
 */

/** @param {string} sentence */
export function checksumOk(sentence) {
  const m = sentence.trim().match(/^\$([^*]+)\*([0-9A-Fa-f]{2})$/);
  if (!m) return false;
  let c = 0;
  for (const ch of m[1]) c ^= ch.charCodeAt(0);
  return c === parseInt(m[2], 16);
}

/** @param {string} v @param {string} hemi */
function coord(v, hemi) {
  if (!v) return NaN;
  const dot = v.indexOf('.');
  const degLen = dot - 2;
  const d = Number(v.slice(0, degLen)), m = Number(v.slice(degLen));
  const r = d + m / 60;
  return hemi === 'S' || hemi === 'W' ? -r : r;
}

export const GGA_QUALITY = /** @type {Record<number,string>} */ ({
  0: 'Pas de position', 1: 'GPS autonome', 2: 'DGPS', 4: 'RTK fixé', 5: 'RTK flottant', 6: 'Estimée',
});

/**
 * @param {string} sentence
 * @returns {null | { type: string, [k: string]: any }}
 */
export function parseNMEA(sentence) {
  if (!checksumOk(sentence)) return null;
  const body = sentence.trim().slice(1, sentence.indexOf('*'));
  const f = body.split(',');
  const type = f[0].slice(2);
  if (type === 'GGA') {
    return {
      type, time: f[1], lat: coord(f[2], f[3]), lon: coord(f[4], f[5]),
      quality: Number(f[6]), qualityLabel: GGA_QUALITY[Number(f[6])] ?? 'Inconnue',
      satellites: Number(f[7]), hdop: Number(f[8]), altitude: Number(f[9]), geoidSeparation: Number(f[11]),
    };
  }
  if (type === 'RMC') {
    return { type, time: f[1], valid: f[2] === 'A', lat: coord(f[3], f[4]), lon: coord(f[5], f[6]), speedKnots: Number(f[7]), course: Number(f[8]), date: f[9] };
  }
  if (type === 'GST') {
    return { type, sigmaLat: Number(f[6]), sigmaLon: Number(f[7]), sigmaAlt: Number(f[8]) };
  }
  return { type };
}
