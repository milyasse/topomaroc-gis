// @ts-check
/** Module « Aller à un point » : navigation GPS vers une cible connue. */
import * as crs from '../core/crs.js';
import { formatBearing, cardinal, gridBearing, degToGrad } from '../core/angles.js';
import { formatNavDistance, fmtNum } from '../core/units.js';
import { vectorTo, accuracyQuality, GPS_STATE_LABELS } from '../services/gps.js';
import { Compass, COMPASS_LABELS, declination } from '../services/compass.js';
import { state, on, emit, addFeature, nextPointNumber, updateSettings } from '../state.js';
import * as M from '../map/map.js';
import { h, icon, btn, mount, toast, field, select } from './dom.js';
import { coordInput } from './coordinput.js';
import { anim } from './anim.js';
import { pointXY } from '../io/common.js';

const RADII = [50, 20, 10, 5];

/** Session de navigation (persiste quand on change de panneau). */
const nav = {
  active: false,
  arrived: false,
  compass: new Compass(),
  /** @type {any} */ wakeLock: null,
  decl: { value: 0, valid: true },
  /** @type {AudioContext|null} */ audio: null,
  last: /** @type {{distance:number, azimuth:number}|null} */ (null),
};

/** Démarre la navigation vers une cible. @param {{lat:number, lon:number, name:string, crsId:string, x:number, y:number}} target */
export async function startNavigation(target) {
  state.navTarget = target;
  nav.active = true; nav.arrived = false; nav.last = null;
  M.setNavTarget(target, state.settings.arrivalRadius);
  state.gps.start();
  try { nav.wakeLock = await /** @type {any} */ (navigator).wakeLock?.request('screen'); } catch { /* facultatif */ }
  try { nav.decl = await declination(target.lat, target.lon); } catch { nav.decl = { value: 0, valid: false }; }
  nav.compass.declination = nav.decl.value;
  if (state.gps.last) M.fitTwo(state.gps.last, target); else M.getMap().setView([target.lat, target.lon], 17);
  // pré-autorisation audio (geste utilisateur)
  try { nav.audio = nav.audio ?? new AudioContext(); nav.audio.resume(); } catch { /* */ }
  emit('nav', { active: true });
  rerouteNav();
}

/** Ré-affiche le module de navigation (avec nettoyage de la vue précédente). */
function rerouteNav() {
  if (location.hash === '#/nav') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#/nav';
}

export function stopNavigation() {
  if (!nav.active) return;
  nav.active = false;
  state.navTarget = null;
  M.setNavTarget(null, 0);
  M.updateNavLine(null, null);
  nav.compass.stop();
  state.gps.stop();
  try { nav.wakeLock?.release(); } catch { /* */ }
  nav.wakeLock = null;
  document.body.classList.remove('nav-full');
  document.getElementById('nav-full')?.remove();
  emit('nav', { active: false });
}

function beep() {
  if (!state.settings.sound) return;
  try {
    const ctx = nav.audio ?? new AudioContext();
    nav.audio = ctx;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + i * 0.22); o.stop(t0 + i * 0.22 + 0.2);
    }
  } catch { /* audio indisponible */ }
}

/** Calcule les éléments de navigation depuis la dernière position. */
function compute() {
  const f = state.gps.last, t = state.navTarget;
  if (!f || !t) return null;
  const v = vectorTo(f, t);
  // Gisement dans un système projeté (celui de la cible, sinon celui d'affichage)
  let gridId = crs.getCrs(t.crsId).kind === 'projected' ? t.crsId : state.settings.displayCrs;
  if (crs.getCrs(gridId).kind !== 'projected') gridId = crs.bestLambertZone(t.lon, t.lat) ?? 'EPSG:32629';
  let grid = NaN;
  try {
    const here = crs.fromWGS84(gridId, f.lon, f.lat);
    const there = t.crsId === gridId ? [t.x, t.y] : crs.fromWGS84(gridId, t.lon, t.lat);
    grid = gridBearing(/** @type {[number,number]} */ (here), /** @type {[number,number]} */ (there));
  } catch { /* */ }
  return { distance: v.distance, azimuth: v.azimuth, grid, gridId, magnetic: (v.azimuth - nav.decl.value + 360) % 360, fix: f };
}

/** @param {HTMLElement} root */
export function render(root) {
  if (nav.active && state.navTarget) return renderActive(root);
  return renderSetup(root);
}

/** @param {HTMLElement} root */
function renderSetup(root) {
  const ci = coordInput({ crsId: state.settings.inputCrs, nearby: () => state.gps.last });
  const name = /** @type {HTMLInputElement} */ (h('input', { type: 'text', placeholder: 'ex. Borne B12', maxlength: 60 }));
  const pts = state.features.filter((f) => f.type === 'point');
  const pick = select([{ value: '', label: pts.length ? '— Choisir un point du projet —' : 'Aucun point dans le projet' }, ...pts.map((f) => ({ value: f.id, label: `${f.num || ''} ${f.name || ''} ${f.code ? '(' + f.code + ')' : ''}`.trim() }))], '', { disabled: !pts.length });
  pick.addEventListener('change', () => {
    const f = pts.find((x) => x.id === pick.value);
    if (!f) return;
    const id = f.input?.crsId ?? 'EPSG:4326';
    ci.setCrs(id);
    const [x, y] = pointXY(f, id);
    const [a, b] = crs.xyToInput(id, [x, y]);
    ci.setValues(a, b);
    name.value = f.num ? `${f.num} ${f.name || ''}`.trim() : f.name || '';
  });
  const radius = radiusPicker();
  const fromMap = btn('Pointer sur la carte', { variant: 'ghost', onclick: () => {
    toast('Touchez la carte à l’emplacement de la cible.', 'info');
    M.setClickHandler((e) => {
      M.setClickHandler(null);
      const id = ci.crsId;
      const xy = crs.fromWGS84(id, e.latlng.lng, e.latlng.lat);
      const [a, b] = crs.xyToInput(id, xy);
      const dec = crs.getCrs(id).unit === 'm' ? 3 : 8;
      ci.setValues(a.toFixed(dec), b.toFixed(dec));
      document.querySelector('.sheet')?.scrollIntoView();
    });
  } }, 'crosshair');

  const go = btn('Démarrer la navigation', { variant: 'primary', onclick: async () => {
    const r = ci.read();
    if (!r.ok || !r.xy || !r.check?.wgs84) { anim.shake(ci.el); toast(r.empty ? 'Saisissez les deux coordonnées de la cible.' : 'Coordonnées invalides : voir le message.', 'error'); return; }
    await updateSettings({ inputCrs: r.crsId });
    startNavigation({ lat: r.check.wgs84.lat, lon: r.check.wgs84.lon, name: name.value.trim() || 'Cible', crsId: r.crsId, x: r.xy[0], y: r.xy[1] });
  } }, 'play');
  go.classList.add('btn-big');

  mount(root,
    h('p.lead', null, 'Saisissez les coordonnées du point à retrouver dans son système d’origine. L’application les transforme et vous guide avec le GPS.'),
    ci.el,
    field('Nom ou identifiant du point', name),
    field('Ou point existant du projet', pick),
    h('div.row', null, fromMap),
    radius.el,
    h('div.sticky-actions', null, go),
    gpsHelp(),
  );
}

/** Sélecteur du rayon d'arrivée. */
function radiusPicker() {
  const custom = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min: 0.5, max: 1000, step: 0.5, inputmode: 'decimal', 'aria-label': 'Rayon personnalisé (m)', value: RADII.includes(state.settings.arrivalRadius) ? '' : state.settings.arrivalRadius }));
  const chips = h('div.chips', { role: 'radiogroup', 'aria-label': 'Rayon d’arrivée' });
  const paint = () => chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(Number(/** @type {HTMLElement} */ (b).dataset.v) === state.settings.arrivalRadius)));
  for (const r of RADII) {
    chips.append(h('button.chip', { type: 'button', role: 'radio', dataset: { v: String(r) }, onclick: async () => { custom.value = ''; await updateSettings({ arrivalRadius: r }); M.setNavRadius(r); paint(); } }, `${r} m`));
  }
  custom.addEventListener('change', async () => { const v = Number(custom.value); if (v > 0) { await updateSettings({ arrivalRadius: v }); M.setNavRadius(v); paint(); } });
  const sound = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: state.settings.sound }));
  sound.addEventListener('change', () => updateSettings({ sound: sound.checked }));
  const vib = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: state.settings.vibrate }));
  vib.addEventListener('change', () => updateSettings({ vibrate: vib.checked }));
  paint();
  return { el: h('fieldset.group', null, h('legend', null, 'Alerte d’arrivée'), chips, h('label.inline', null, 'Autre (m)', custom), h('label.switch', null, sound, h('span', null, 'Signal sonore')), h('label.switch', null, vib, h('span', null, 'Vibration'))) };
}

function gpsHelp() {
  return h('details.help', null, h('summary', null, icon('info'), 'Précision et limites'),
    h('p', null, 'La précision affichée est celle annoncée par le téléphone (rayon ~68 %). Un GPS de smartphone donne en général 3 à 10 m à ciel ouvert, davantage en ville ou sous couvert. Il ne permet pas un piquetage centimétrique : pour implanter une borne, utilisez un récepteur GNSS RTK ou une station totale.'),
    h('p', null, 'Pour les systèmes Lambert (Merchich), la transformation publique EPSG:1166 a une exactitude d’environ 7 m : l’écart entre la position GPS et la cible inclut cette incertitude.'),
    h('p', null, 'La géolocalisation nécessite une connexion HTTPS et votre autorisation.'));
}

/** @param {HTMLElement} root */
function renderActive(root) {
  const t = /** @type {NonNullable<typeof state.navTarget>} */ (state.navTarget);
  const elDist = h('div.nav-distance', { 'aria-live': 'polite' }, '—');
  const elCard = h('div.nav-card');
  const arrow = h('div.nav-arrow', null, icon('nav-arrow'));
  const dial = h('div.nav-dial', null, h('span.n', null, 'N'), arrow);
  const elBear = h('div.nav-bearing');
  const elGps = h('div.nav-gps');
  const elCompass = h('p.muted.small');
  const elWarn = h('div.nav-warn');
  const status = h('div.nav-status');

  const compassBtn = btn('Activer la boussole', { variant: 'ghost', onclick: async () => {
    const s = await nav.compass.start();
    if (s === 'unsupported' || s === 'denied') toast(COMPASS_LABELS[s], 'warn', 5000);
  } }, 'compass');

  const saveBtn = btn('Enregistrer le point atteint', { variant: 'primary', onclick: saveReached }, 'pin');
  const stopBtn = btn('Arrêter la navigation', { variant: 'danger', onclick: () => { stopNavigation(); rerouteNav(); } }, 'stop');
  const recBtn = btn('Recentrer sur ma position', { variant: 'ghost', onclick: () => { if (!M.recenterOnGps()) toast('Position GPS pas encore disponible.', 'warn'); } }, 'locate');
  const fullBtn = btn('Plein écran simplifié', { variant: 'ghost', onclick: openFull }, 'expand');

  const srcInfo = (() => {
    const c = crs.getCrs(t.crsId);
    const [a, b] = crs.xyToInput(t.crsId, [t.x, t.y]);
    const dec = c.unit === 'm' ? 3 : 7;
    return `${c.label} : ${c.axes[0]} ${fmtNum(a, dec)} · ${c.axes[1]} ${fmtNum(b, dec)}`;
  })();

  mount(root,
    h('div.nav-head', null, h('div', null, h('div.eyebrow', null, 'Cible'), h('h3.nav-name', null, t.name), h('div.muted.small', null, srcInfo))),
    h('div.nav-main', null, dial, h('div.nav-figs', null, h('div.eyebrow', null, 'Distance restante'), elDist, elBear)),
    status, elWarn, elGps, elCompass,
    h('div.btn-grid', null, saveBtn, recBtn, compassBtn, fullBtn),
    radiusPicker().el,
    h('div.sticky-actions', null, stopBtn),
  );

  const update = () => {
    const g = state.gps;
    status.className = `nav-status st-${g.state}`;
    status.replaceChildren(icon(g.state === 'active' ? 'check' : 'alert'), h('span', null, g.message));
    const r = compute();
    if (!r) { elDist.textContent = '—'; elGps.replaceChildren(h('span.muted', null, 'En attente d’une position GPS…')); return; }
    nav.last = r;
    anim.count(/** @type {HTMLElement} */ (elDist), r.distance, formatNavDistance);
    const unit = /** @type {any} */ (state.settings.angleUnit);
    elBear.replaceChildren(
      h('div', null, h('b', null, formatBearing(r.azimuth, unit === 'grad' ? 'grad' : 'deg', unit === 'grad' ? 2 : 1)), ` ${cardinal(r.azimuth)} · azimut vrai`),
      h('div.muted.small', null, `Gisement ${crs.getCrs(r.gridId).label} : ${Number.isFinite(r.grid) ? (unit === 'grad' ? degToGrad(r.grid).toFixed(2) + ' gr' : r.grid.toFixed(1) + '°') : '—'}`),
      h('div.muted.small', null, `Cap magnétique : ${r.magnetic.toFixed(1)}° (déclinaison ${nav.decl.value >= 0 ? '+' : ''}${nav.decl.value.toFixed(1)}°, WMM 2025)`),
    );
    const q = accuracyQuality(r.fix.accuracy);
    const age = Math.max(0, Math.round((Date.now() - r.fix.timestamp) / 1000));
    elGps.replaceChildren(
      h(`span.badge.q-${q.level}`, null, `±${r.fix.accuracy.toFixed(r.fix.accuracy < 10 ? 1 : 0)} m`),
      h('span', null, ` Précision GPS ${q.label.toLowerCase()} · dernière mesure ${new Date(r.fix.timestamp).toLocaleTimeString('fr-FR')} (il y a ${age} s)`),
    );
    elWarn.replaceChildren();
    if (r.fix.accuracy > state.settings.arrivalRadius) elWarn.append(h('p.warn', null, icon('alert'), `La précision GPS (±${r.fix.accuracy.toFixed(0)} m) dépasse le rayon d’arrivée (${state.settings.arrivalRadius} m) : l’indication d’arrivée n’est pas fiable.`));
    if (r.distance > 150000) elWarn.append(h('p.warn', null, icon('alert'), 'Cible à plus de 150 km : vérifiez le système de coordonnées et la zone Lambert.'));
    // flèche : relative au cap du téléphone si la boussole est active, sinon par rapport au nord
    const heading = nav.compass.trueHeading;
    const useCompass = Number.isFinite(heading) && (nav.compass.status === 'ok' || nav.compass.status === 'indicative');
    anim.rotate(arrow, useCompass ? r.azimuth - heading : r.azimuth);
    dial.classList.toggle('compass-on', useCompass);
    dial.classList.toggle('indicative', nav.compass.status === 'indicative');
    elCompass.textContent = nav.compass.status === 'off' ? 'Flèche orientée par rapport au nord (haut de l’écran = nord). Activez la boussole pour une flèche relative au téléphone.' : COMPASS_LABELS[nav.compass.status];
    M.updateNavLine(r.fix, t);
    checkArrival(r.distance, root);
    updateFull(r);
  };

  const offFix = () => state.gps.removeEventListener('fix', update);
  state.gps.addEventListener('fix', update);
  state.gps.addEventListener('state', update);
  nav.compass.addEventListener('heading', update);
  nav.compass.addEventListener('status', update);
  const timer = setInterval(update, 1000);
  update();
  return () => { offFix(); state.gps.removeEventListener('state', update); nav.compass.removeEventListener('heading', update); nav.compass.removeEventListener('status', update); clearInterval(timer); };
}

/** @param {number} dist @param {HTMLElement} root */
function checkArrival(dist, root) {
  const R = state.settings.arrivalRadius;
  if (!nav.arrived && dist <= R) {
    nav.arrived = true;
    beep();
    if (state.settings.vibrate) navigator.vibrate?.([200, 100, 200, 100, 400]);
    toast(`Point atteint : vous êtes à moins de ${R} m de « ${state.navTarget?.name} ».`, 'ok', 6000);
    root.querySelector('.nav-main')?.classList.add('arrived');
    document.getElementById('nav-full')?.classList.add('arrived');
    const target = root.querySelector('.nav-distance');
    if (target) anim.arrival(target);
    emit('nav-arrived', { distance: dist });
  } else if (nav.arrived && dist > R * 1.3 + 1) {
    nav.arrived = false;
    root.querySelector('.nav-main')?.classList.remove('arrived');
    document.getElementById('nav-full')?.classList.remove('arrived');
  }
}

async function saveReached() {
  const f = state.gps.last, t = state.navTarget;
  if (!f || !t) { toast('Aucune position GPS disponible.', 'warn'); return; }
  const disp = state.settings.displayCrs;
  const xy = crs.fromWGS84(disp, f.lon, f.lat);
  const d = nav.last?.distance;
  await addFeature({
    type: 'point', num: nextPointNumber(), name: `Atteint ${t.name}`, code: 'cible',
    wgs84: { lat: f.lat, lon: f.lon }, input: { crsId: disp, x: xy[0], y: xy[1] },
    accuracy: f.accuracy, altitude: f.altitude, source: 'nav', takenAt: new Date(f.timestamp).toISOString(),
    description: `Position GPS à l’arrivée sur « ${t.name} » (${t.crsId} ${t.x.toFixed(3)} ; ${t.y.toFixed(3)}). Écart restant : ${d != null ? d.toFixed(2) + ' m' : 'inconnu'}.`,
  }, 'Point atteint');
  toast('Point atteint enregistré dans le projet.', 'ok');
}

// ------------------------------------------------------------- Mode plein écran simplifié
function openFull() {
  if (document.getElementById('nav-full')) return;
  const el = h('div#nav-full', { role: 'dialog', 'aria-label': 'Navigation plein écran' },
    h('div.nf-name'), h('div.nf-dial', null, h('span.n', null, 'N'), h('div.nf-arrow', null, icon('nav-arrow'))),
    h('div.nf-dist', null, '—'), h('div.nf-bear'), h('div.nf-acc'),
    h('div.nf-actions', null,
      btn('Enregistrer', { variant: 'primary', onclick: saveReached }, 'pin'),
      btn('Quitter', { variant: 'ghost', onclick: closeFull }, 'close'),
    ));
  document.body.append(el);
  document.body.classList.add('nav-full');
  try { document.documentElement.requestFullscreen?.(); } catch { /* */ }
  anim.screenIn(el);
  if (nav.last) updateFull({ ...nav.last, fix: state.gps.last });
}
function closeFull() {
  document.getElementById('nav-full')?.remove();
  document.body.classList.remove('nav-full');
  if (document.fullscreenElement) document.exitFullscreen?.();
}
/** @param {any} r */
function updateFull(r) {
  const el = document.getElementById('nav-full');
  if (!el || !r) return;
  /** @type {HTMLElement} */ (el.querySelector('.nf-name')).textContent = state.navTarget?.name ?? '';
  /** @type {HTMLElement} */ (el.querySelector('.nf-dist')).textContent = formatNavDistance(r.distance);
  /** @type {HTMLElement} */ (el.querySelector('.nf-bear')).textContent = `${r.azimuth.toFixed(0)}° ${cardinal(r.azimuth)}`;
  /** @type {HTMLElement} */ (el.querySelector('.nf-acc')).textContent = r.fix ? `GPS ±${r.fix.accuracy.toFixed(0)} m · ${GPS_STATE_LABELS[state.gps.state]}` : '';
  const heading = nav.compass.trueHeading;
  const useCompass = Number.isFinite(heading) && (nav.compass.status === 'ok' || nav.compass.status === 'indicative');
  anim.rotate(/** @type {Element} */ (el.querySelector('.nf-arrow')), useCompass ? r.azimuth - heading : r.azimuth);
}

on('nav', () => { /* réservé */ });
export const isNavigating = () => nav.active;
