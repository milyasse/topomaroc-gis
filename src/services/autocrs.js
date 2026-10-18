// @ts-check
/**
 * Système de projection automatique selon la zone de navigation.
 *
 * - Position de référence : la dernière position GPS (précision ≤ 2 km, âge ≤ 2 min) ;
 *   à défaut, le centre de la carte.
 * - Quand la zone change (avec hystérésis de ~2 km le long des limites), le système d'affichage
 *   ET le système de saisie par défaut basculent sur la nouvelle zone et un message l'indique.
 * - Chaque point collecté (GPS, carte, navigation, déplacement) est enregistré dans la zone
 *   de SA position (`pointCrs`), même si la carte montre une autre zone.
 */
import * as crs from '../core/crs.js';
import { zoneFor, zoneAt, familyOf } from '../core/zones.js';
import { state, updateSettings, emit } from '../state.js';

/** Famille active (celle du système d'affichage, sinon le réglage). */
export function activeFamily() {
  return familyOf(state.settings.displayCrs) ?? state.settings.autoFamily ?? 'lambert';
}

/**
 * Système dans lequel enregistrer un point situé en (lon, lat).
 * @param {number} lon @param {number} lat
 * @param {{ allowGeographic?: boolean }} [o] si faux, un système géographique est remplacé par une zone projetée
 */
export function pointCrs(lon, lat, o = {}) {
  const disp = state.settings.displayCrs;
  if (state.settings.autoCrs) {
    const z = zoneAt(lon, lat, activeFamily());
    if (z) return z;
  }
  if (crs.getCrs(disp).kind === 'projected' || o.allowGeographic !== false) return disp;
  return zoneAt(lon, lat, 'lambert') ?? `EPSG:326${crs.utmZoneFor(lon)}`;
}

/** Coordonnées d'enregistrement d'un point : { crsId, x, y, zoneAuto }. @param {number} lon @param {number} lat @param {{ allowGeographic?: boolean }} [o] */
export function pointInput(lon, lat, o) {
  const id = pointCrs(lon, lat, o);
  const [x, y] = crs.fromWGS84(id, lon, lat);
  return { crsId: id, x, y, ...(state.settings.autoCrs ? { zoneAuto: true } : {}) };
}

/** Dernière source de position utilisée ('gps' | 'carte'). */
export let lastSource = /** @type {'gps'|'carte'|null} */ (null);

/**
 * Évalue la zone pour une position et bascule si nécessaire.
 * @param {number} lon @param {number} lat @param {'gps'|'carte'} source
 * @returns {Promise<string|null>} nouvelle zone si changement
 */
export async function evaluate(lon, lat, source) {
  refPos = { lon, lat };
  if (!state.settings.autoCrs) return null;
  lastSource = source;
  const cur = state.settings.displayCrs;
  const z = zoneFor(lon, lat, activeFamily(), cur);
  if (!z || z === cur) return null;
  const patch = /** @type {any} */ ({ displayCrs: z });
  // Le système de saisie suit, sauf s'il est géographique (saisie en degrés choisie volontairement)
  if (crs.getCrs(state.settings.inputCrs).kind === 'projected') patch.inputCrs = z;
  await updateSettings(patch);
  emit('zone-change', { from: cur, to: z, source });
  return z;
}

/** Le GPS est-il une référence fiable en ce moment ? */
function gpsFresh() {
  const g = state.gps;
  return !!g.last && g.state === 'active' && g.age() < 120 && g.last.accuracy <= 2000;
}

/** Zoom minimal de la carte pour que son centre serve de zone (vue de travail, pas vue du pays). */
export const MAP_MIN_ZOOM = 9;

/**
 * Branche le suivi : GPS (prioritaire) et déplacements de la carte.
 * @param {{ on: (ev:string, fn:()=>void)=>void, getCenter: ()=>{lat:number, lng:number}, getZoom: ()=>number }|null} map
 */
export function startAutoCrs(map) {
  state.gps.addEventListener('fix', () => {
    const f = state.gps.last;
    if (f && f.accuracy <= 2000) evaluate(f.lon, f.lat, 'gps');
  });
  if (!map) return;
  const fromMap = () => {
    if (gpsFresh() || map.getZoom() < MAP_MIN_ZOOM) return; // la position réelle prime ; vue d'ensemble ignorée
    const c = map.getCenter();
    evaluate(c.lng, c.lat, 'carte');
  };
  map.on('moveend', fromMap);
  fromMap();
}

/** Position de référence actuelle (GPS récent, sinon dernière évaluation). */
let refPos = /** @type {{lon:number, lat:number}|null} */ (null);
/** @param {{lon:number, lat:number}} p */
export function setReference(p) { refPos = p; }

/**
 * Choix manuel d'un système par l'utilisateur. S'il contredit la zone automatique,
 * le mode automatique est désactivé (sinon il annulerait le choix au prochain déplacement).
 * @param {'displayCrs'|'inputCrs'} key @param {string} id
 * @returns {Promise<boolean>} true si le mode automatique a été désactivé
 */
export async function manualCrsChoice(key, id) {
  const patch = /** @type {any} */ ({ [key]: id });
  let disabled = false;
  if (state.settings.autoCrs) {
    const fam = familyOf(id);
    const ref = gpsFresh() ? /** @type {any} */ (state.gps.last) : refPos;
    const z = ref && fam ? zoneAt(ref.lon, ref.lat, fam) : null;
    if (key === 'displayCrs' && (!fam || (z && z !== id))) { patch.autoCrs = false; disabled = true; }
    else if (key === 'displayCrs' && fam) patch.autoFamily = fam;
  }
  await updateSettings(patch);
  return disabled;
}

/**
 * Points dont le système d'enregistrement ne correspond pas à la zone de leur position.
 * Les coordonnées WGS 84 (référence interne) ne changent pas ; seules E/N « de saisie » sont
 * recalculées, l'ancienne valeur étant conservée dans `input.original` (traçabilité).
 * @param {any[]} features @param {string} [family]
 * @returns {{ f:any, from:string, to:string, input:any }[]}
 */
export function zoneMismatches(features, family = activeFamily()) {
  const out = [];
  for (const f of features) {
    if (f.type !== 'point' || !f.wgs84) continue;
    const from = f.input?.crsId ?? null;
    if (from && crs.getCrs(from).kind !== 'projected') continue; // saisie en degrés : conservée
    const to = zoneAt(f.wgs84.lon, f.wgs84.lat, family);
    if (!to || to === from) continue;
    const [x, y] = crs.fromWGS84(to, f.wgs84.lon, f.wgs84.lat);
    out.push({ f, from: from ?? '—', to, input: { crsId: to, x, y, zoneAuto: true, ...(f.input ? { original: f.input.original ?? { crsId: f.input.crsId, x: f.input.x, y: f.input.y } } : {}) } });
  }
  return out;
}
