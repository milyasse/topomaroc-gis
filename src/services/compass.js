// @ts-check
/**
 * Boussole du téléphone (capteur d'orientation). Le cap fourni par les capteurs est
 * MAGNÉTIQUE ; il est converti en cap vrai par la déclinaison du modèle WMM 2025.
 * La fiabilité n'est affirmée que si le navigateur fournit une précision de calibration
 * (iOS : webkitCompassAccuracy). Sinon la direction est signalée comme « indicative ».
 */
import { parseCOF, magneticField, decimalYear } from '../core/magnetic.js';

/** @type {import('../core/magnetic.js').WmmModel|null} */
let model = null;
export async function loadWMM() {
  if (model) return model;
  const r = await fetch(new URL('../../vendor/wmm/WMM2025.COF', import.meta.url));
  model = parseCOF(await r.text());
  return model;
}
/** Déclinaison (°, positive vers l'est) au point et à la date. @param {number} lat @param {number} lon @param {Date} [date] */
export async function declination(lat, lon, date = new Date()) {
  const m = await loadWMM();
  const f = magneticField(m, lat, lon, 0, decimalYear(date));
  return { value: f.declination, valid: f.valid, model: 'WMM 2025' };
}

/** @typedef {'off'|'unsupported'|'denied'|'waiting'|'ok'|'uncalibrated'|'indicative'} CompassStatus */

export class Compass extends EventTarget {
  constructor() {
    super();
    /** @type {CompassStatus} */ this.status = 'off';
    /** cap magnétique (°) */ this.magnetic = NaN;
    /** précision annoncée (°), null si inconnue */ this.accuracy = /** @type {number|null} */ (null);
    this.declination = 0;
    this.handler = (/** @type {any} */ e) => this.onEvent(e);
    this.evName = '';
    /** @type {any} */ this.watchdog = null;
  }
  get trueHeading() { return Number.isFinite(this.magnetic) ? (this.magnetic + this.declination + 360) % 360 : NaN; }

  /** À appeler depuis un geste utilisateur (exigence iOS). */
  async start() {
    const DOE = /** @type {any} */ (globalThis).DeviceOrientationEvent;
    if (!DOE) { this.set('unsupported'); return this.status; }
    if (typeof DOE.requestPermission === 'function') {
      try { if ((await DOE.requestPermission()) !== 'granted') { this.set('denied'); return this.status; } } catch { this.set('denied'); return this.status; }
    }
    this.evName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(this.evName, this.handler, true);
    this.set('waiting');
    this.watchdog = setTimeout(() => { if (this.status === 'waiting') this.set('unsupported'); }, 4000);
    return this.status;
  }
  stop() {
    if (this.evName) window.removeEventListener(this.evName, this.handler, true);
    clearTimeout(this.watchdog);
    this.set('off');
  }
  /** @param {CompassStatus} s */
  set(s) { if (s !== this.status) { this.status = s; this.dispatchEvent(new CustomEvent('status', { detail: s })); } }
  /** @param {any} e */
  onEvent(e) {
    let heading = NaN;
    const screenAngle = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (/** @type {any} */ (window).orientation || 0);
    if (typeof e.webkitCompassHeading === 'number') {
      heading = e.webkitCompassHeading + screenAngle;
      this.accuracy = typeof e.webkitCompassAccuracy === 'number' && e.webkitCompassAccuracy >= 0 ? e.webkitCompassAccuracy : null;
    } else if ((e.absolute || this.evName === 'deviceorientationabsolute') && typeof e.alpha === 'number') {
      heading = 360 - e.alpha + screenAngle;
      this.accuracy = null;
    } else {
      // orientation relative (non référencée au nord) : inutilisable comme boussole
      this.set('unsupported');
      return;
    }
    this.magnetic = (heading % 360 + 360) % 360;
    if (this.accuracy == null) this.set('indicative');
    else if (this.accuracy > 25) this.set('uncalibrated');
    else this.set('ok');
    this.dispatchEvent(new CustomEvent('heading', { detail: { magnetic: this.magnetic, true: this.trueHeading, accuracy: this.accuracy } }));
  }
}

export const COMPASS_LABELS = /** @type {Record<CompassStatus,string>} */ ({
  off: 'Boussole inactive',
  unsupported: 'Boussole indisponible sur cet appareil : suivez la flèche de la carte et l’azimut.',
  denied: 'Accès aux capteurs d’orientation refusé.',
  waiting: 'Lecture des capteurs…',
  ok: 'Boussole calibrée',
  uncalibrated: 'Boussole mal calibrée : décrivez un « 8 » avec le téléphone, loin des objets métalliques.',
  indicative: 'Direction indicative (calibration inconnue) : éloignez-vous des masses métalliques, vérifiez avec l’azimut.',
});
