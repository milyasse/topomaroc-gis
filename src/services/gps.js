// @ts-check
/**
 * Géolocalisation : suivi continu, états explicites, détection de perte de signal,
 * moyenne de positions (« attendre une meilleure précision »).
 *
 * Architecture : une « source de position » abstraite. La source par défaut est la
 * géolocalisation du navigateur (GPS du téléphone). Une source externe (récepteur GNSS /
 * RTK via Web Bluetooth ou Web Serial, flux NMEA — cf. nmea.js) pourra être branchée
 * sans modifier le reste de l'application.
 */
import { inverse } from '../core/geodesy.js';

/**
 * @typedef {Object} Fix
 * @property {number} lat
 * @property {number} lon
 * @property {number} accuracy  précision horizontale annoncée (m, ~68 %)
 * @property {number|null} altitude
 * @property {number|null} altitudeAccuracy
 * @property {number|null} heading  cap de déplacement (°)
 * @property {number|null} speed    m/s
 * @property {number} timestamp
 * @property {string} source
 */

/**
 * @typedef {'idle'|'requesting'|'active'|'stale'|'denied'|'unavailable'|'timeout'|'insecure'|'unsupported'} GpsState
 */

export const GPS_STATE_LABELS = /** @type {Record<GpsState,string>} */ ({
  idle: 'GPS arrêté',
  requesting: 'Recherche de la position…',
  active: 'Position GPS active',
  stale: 'Signal GPS perdu (dernière position conservée)',
  denied: 'Accès à la position refusé',
  unavailable: 'Position indisponible',
  timeout: 'Délai dépassé, nouvelle tentative…',
  insecure: 'La géolocalisation exige une connexion sécurisée (HTTPS)',
  unsupported: 'Géolocalisation non prise en charge par ce navigateur',
});

/** Source : API Geolocation du navigateur. */
export class BrowserPositionSource {
  constructor() { /** @type {number|null} */ this.watchId = null; this.name = 'GPS de l’appareil'; }
  /** @param {(f: Fix)=>void} onFix @param {(code: GpsState, msg: string)=>void} onError */
  start(onFix, onError) {
    if (!('geolocation' in navigator)) { onError('unsupported', GPS_STATE_LABELS.unsupported); return; }
    if (typeof window !== 'undefined' && window.isSecureContext === false) { onError('insecure', GPS_STATE_LABELS.insecure); return; }
    this.watchId = navigator.geolocation.watchPosition(
      (p) => onFix({
        lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy,
        altitude: p.coords.altitude, altitudeAccuracy: p.coords.altitudeAccuracy,
        heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null,
        speed: Number.isFinite(p.coords.speed) ? p.coords.speed : null,
        timestamp: p.timestamp || Date.now(), source: 'device',
      }),
      (e) => {
        if (e.code === 1) onError('denied', 'Autorisez l’accès à la position dans les réglages du navigateur, puis réessayez.');
        else if (e.code === 3) onError('timeout', GPS_STATE_LABELS.timeout);
        else onError('unavailable', 'Position indisponible : vérifiez que la localisation est activée et placez-vous à ciel ouvert.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }
  stop() { if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
}

/** Suivi GPS partagé par toute l'application (événements « fix » et « state »). */
export class GpsTracker extends EventTarget {
  /** @param {{ staleAfterMs?: number, source?: any }} [opts] */
  constructor(opts = {}) {
    super();
    /** @type {GpsState} */ this.state = 'idle';
    /** @type {Fix|null} */ this.last = null;
    this.message = GPS_STATE_LABELS.idle;
    this.staleAfterMs = opts.staleAfterMs ?? 15000;
    this.source = opts.source ?? new BrowserPositionSource();
    /** @type {any} */ this.timer = null;
    this.users = 0;
  }
  /** @param {GpsState} s @param {string} [msg] */
  setState(s, msg) {
    if (s === this.state && (msg ?? GPS_STATE_LABELS[s]) === this.message) return;
    this.state = s; this.message = msg ?? GPS_STATE_LABELS[s];
    this.dispatchEvent(new CustomEvent('state', { detail: { state: s, message: this.message } }));
  }
  get running() { return this.users > 0; }
  /** Démarre (compteur de références : plusieurs modules peuvent l'utiliser). */
  start() {
    this.users++;
    if (this.users > 1) return;
    this.setState('requesting');
    this.source.start((/** @type {Fix} */ f) => this.onFix(f), (/** @type {GpsState} */ code, /** @type {string} */ msg) => {
      if (code === 'timeout' && this.last) { this.setState('stale'); return; }
      this.setState(code, msg);
    });
    this.timer = setInterval(() => {
      if (this.last && this.state === 'active' && Date.now() - this.last.timestamp > this.staleAfterMs) this.setState('stale');
    }, 2000);
  }
  /** @param {boolean} [force] */
  stop(force = false) {
    this.users = force ? 0 : Math.max(0, this.users - 1);
    if (this.users > 0) return;
    this.source.stop();
    clearInterval(this.timer);
    this.setState('idle');
  }
  /** @param {Fix} f */
  onFix(f) {
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) return;
    this.last = f;
    this.setState('active');
    this.dispatchEvent(new CustomEvent('fix', { detail: f }));
  }
  /** Âge de la dernière position (s). */
  age() { return this.last ? (Date.now() - this.last.timestamp) / 1000 : Infinity; }
}

/**
 * Qualité indicative d'une position selon la précision annoncée.
 * @param {number|null|undefined} acc
 * @returns {{ level: 'good'|'fair'|'poor'|'none', label: string }}
 */
export function accuracyQuality(acc) {
  if (acc == null || !Number.isFinite(acc)) return { level: 'none', label: 'Inconnue' };
  if (acc <= 5) return { level: 'good', label: 'Bonne' };
  if (acc <= 15) return { level: 'fair', label: 'Moyenne' };
  return { level: 'poor', label: 'Faible' };
}

/**
 * Moyenne pondérée des positions reçues pendant une durée, en ne retenant que celles dont
 * la précision annoncée est ≤ seuil. NE remplace PAS un levé GNSS professionnel : les
 * erreurs successives d'un GPS de téléphone sont fortement corrélées, la moyenne réduit
 * surtout le bruit, pas les biais (multitrajets, masques).
 * @param {GpsTracker} tracker
 * @param {{ durationS: number, maxAccuracy: number, minSamples?: number, signal?: AbortSignal,
 *           onProgress?: (p: { elapsed: number, accepted: number, rejected: number, best: number|null }) => void }} opts
 * @returns {Promise<{ lat:number, lon:number, accuracy:number, spread:number, samples:number, rejected:number, durationS:number, met:boolean }>}
 */
export function averagePosition(tracker, opts) {
  const minSamples = opts.minSamples ?? 3;
  return new Promise((resolve, reject) => {
    /** @type {Fix[]} */ const acc = [];
    let rejected = 0;
    const t0 = Date.now();
    const onFix = (/** @type {any} */ e) => {
      const f = /** @type {Fix} */ (e.detail);
      if (f.accuracy <= opts.maxAccuracy) acc.push(f); else rejected++;
      report();
    };
    const report = () => opts.onProgress?.({
      elapsed: (Date.now() - t0) / 1000, accepted: acc.length, rejected,
      best: acc.length ? Math.min(...acc.map((f) => f.accuracy)) : (tracker.last?.accuracy ?? null),
    });
    const tick = setInterval(report, 500);
    const finish = () => {
      tracker.removeEventListener('fix', onFix);
      clearInterval(tick); clearTimeout(timer);
      if (!acc.length) {
        reject(new Error(`Aucune position avec une précision ≤ ${opts.maxAccuracy} m n’a été reçue (${rejected} rejetée(s)).`));
        return;
      }
      resolve(combineFixes(acc, rejected, (Date.now() - t0) / 1000, minSamples));
    };
    const timer = setTimeout(finish, opts.durationS * 1000);
    opts.signal?.addEventListener('abort', () => {
      tracker.removeEventListener('fix', onFix); clearInterval(tick); clearTimeout(timer);
      reject(new DOMException('Annulé', 'AbortError'));
    });
    tracker.addEventListener('fix', onFix);
    if (tracker.last && Date.now() - tracker.last.timestamp < 1500) onFix({ detail: tracker.last });
  });
}

/**
 * Combine des positions (pondération 1/σ²) dans un repère local métrique.
 * @param {Fix[]} fixes @param {number} rejected @param {number} durationS @param {number} minSamples
 */
export function combineFixes(fixes, rejected = 0, durationS = 0, minSamples = 1) {
  const lat0 = fixes[0].lat, lon0 = fixes[0].lon;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * lat0 * Math.PI / 180);
  const mPerDegLon = 111412.84 * Math.cos(lat0 * Math.PI / 180);
  let sw = 0, se = 0, sn = 0;
  const pts = fixes.map((f) => ({ e: (f.lon - lon0) * mPerDegLon, n: (f.lat - lat0) * mPerDegLat, w: 1 / Math.max(f.accuracy, 0.5) ** 2 }));
  for (const p of pts) { sw += p.w; se += p.w * p.e; sn += p.w * p.n; }
  const me = se / sw, mn = sn / sw;
  const spread = Math.sqrt(pts.reduce((s, p) => s + (p.e - me) ** 2 + (p.n - mn) ** 2, 0) / pts.length);
  const sorted = fixes.map((f) => f.accuracy).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    lat: lat0 + mn / mPerDegLat, lon: lon0 + me / mPerDegLon,
    // Précision rapportée de façon prudente : on ne divise pas par √n (erreurs corrélées).
    accuracy: Math.max(median, spread),
    spread, samples: fixes.length, rejected, durationS, met: fixes.length >= minSamples,
  };
}

/**
 * Distance et azimut vrai de la position vers une cible.
 * @param {{lat:number, lon:number}} from @param {{lat:number, lon:number}} to
 */
export function vectorTo(from, to) { return inverse(from.lat, from.lon, to.lat, to.lon); }
