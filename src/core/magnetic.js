// @ts-check
/**
 * Déclinaison magnétique selon le World Magnetic Model (WMM 2025, NOAA/NGA, domaine public).
 * Synthèse en harmoniques sphériques (algorithme de référence geomag.c).
 * Les coefficients (vendor/wmm/WMM2025.COF) sont valides du 2025.0 au 2030.0.
 */

/**
 * @typedef {{ epoch: number, name: string, nmax: number,
 *   g: number[][], h: number[][], gd: number[][], hd: number[][] }} WmmModel
 */

/** Analyse un fichier .COF du WMM. @param {string} text @returns {WmmModel} */
export function parseCOF(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].trim().split(/\s+/);
  const epoch = Number(head[0]);
  const name = head[1] || 'WMM';
  const N = 12;
  const z = () => Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  const g = z(), h = z(), gd = z(), hd = z();
  let nmax = 0;
  for (const l of lines.slice(1)) {
    const t = l.trim().split(/\s+/).map(Number);
    if (t[0] >= 9999) break;
    const [n, m, gnm, hnm, dg, dh] = t;
    if (n > N) continue;
    g[n][m] = gnm; h[n][m] = hnm; gd[n][m] = dg; hd[n][m] = dh;
    nmax = Math.max(nmax, n);
  }
  if (!Number.isFinite(epoch) || nmax < 1) throw new Error('Fichier WMM invalide');
  return { epoch, name, nmax, g, h, gd, hd };
}

/**
 * Calcule les éléments du champ en un point.
 * @param {WmmModel} model
 * @param {number} latDeg latitude géodésique (°)
 * @param {number} lonDeg longitude (°)
 * @param {number} altKm altitude ellipsoïdale (km)
 * @param {number} decimalYear année décimale (ex. 2026.79)
 * @returns {{ declination: number, inclination: number, totalIntensity: number, valid: boolean }}
 */
export function magneticField(model, latDeg, lonDeg, altKm, decimalYear) {
  const { nmax } = model;
  const a = 6378.137, b = 6356.7523142, re = 6371.2;
  const a2 = a * a, b2 = b * b, c2 = a2 - b2, a4 = a2 * a2, b4 = b2 * b2, c4 = a4 - b4;
  const dt = decimalYear - model.epoch;
  const rad = Math.PI / 180;
  const rlat = latDeg * rad, rlon = lonDeg * rad;
  const srlat = Math.sin(rlat), crlat = Math.cos(rlat);
  const srlat2 = srlat * srlat, crlat2 = crlat * crlat;

  // Géodésique → sphérique géocentrique
  const q = Math.sqrt(a2 - c2 * srlat2);
  const q1 = altKm * q;
  const q2 = ((q1 + a2) / (q1 + b2)) ** 2;
  const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
  const st = Math.sqrt(1 - ct * ct);
  const r2 = altKm * altKm + 2 * q1 + (a4 - c4 * srlat2) / (q * q);
  const r = Math.sqrt(r2);
  const d = Math.sqrt(a2 * crlat2 + b2 * srlat2);
  const ca = (altKm + d) / r;
  const sa = (c2 * crlat * srlat) / (r * d);

  // Facteurs de normalisation de Schmidt et coefficients de récurrence
  const N = nmax;
  const S = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  const K = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  S[0][0] = 1;
  for (let n = 1; n <= N; n++) {
    S[n][0] = S[n - 1][0] * (2 * n - 1) / n;
    for (let m = 1; m <= n; m++) S[n][m] = S[n][m - 1] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    for (let m = 0; m <= n; m++) K[n][m] = n > 1 ? (((n - 1) ** 2) - m * m) / ((2 * n - 1) * (2 * n - 3)) : 0;
  }

  const P = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  const dP = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  P[0][0] = 1;
  const sp = [0], cp = [1];
  for (let m = 1; m <= N; m++) { sp[m] = Math.sin(m * rlon); cp[m] = Math.cos(m * rlon); }

  const aor = re / r;
  let ar = aor * aor;
  let br = 0, bt = 0, bp = 0;
  for (let n = 1; n <= N; n++) {
    ar *= aor;
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        P[n][m] = st * P[n - 1][m - 1];
        dP[n][m] = st * dP[n - 1][m - 1] + ct * P[n - 1][m - 1];
      } else if (n === 1 && m === 0) {
        P[n][m] = ct * P[n - 1][m];
        dP[n][m] = ct * dP[n - 1][m] - st * P[n - 1][m];
      } else {
        const p2 = m > n - 2 ? 0 : P[n - 2][m];
        const dp2 = m > n - 2 ? 0 : dP[n - 2][m];
        P[n][m] = ct * P[n - 1][m] - K[n][m] * p2;
        dP[n][m] = ct * dP[n - 1][m] - st * P[n - 1][m] - K[n][m] * dp2;
      }
      const gt = S[n][m] * (model.g[n][m] + dt * model.gd[n][m]);
      const ht = S[n][m] * (model.h[n][m] + dt * model.hd[n][m]);
      const temp1 = gt * cp[m] + ht * sp[m];
      const temp2 = gt * sp[m] - ht * cp[m];
      const par = ar * P[n][m];
      bt -= ar * temp1 * dP[n][m];
      bp += m * temp2 * par;
      br += (n + 1) * temp1 * par;
    }
  }
  bp = st === 0 ? 0 : bp / st;

  const bx = -bt * ca - br * sa;
  const by = bp;
  const bz = bt * sa - br * ca;
  const bh = Math.hypot(bx, by);
  return {
    declination: Math.atan2(by, bx) / rad,
    inclination: Math.atan2(bz, bh) / rad,
    totalIntensity: Math.hypot(bh, bz),
    valid: dt >= 0 && dt <= 5,
  };
}

/** Année décimale d'une date. @param {Date} date */
export function decimalYear(date) {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}
