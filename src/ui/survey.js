// @ts-check
/** Module « Levé topographique » : collecte de points GPS ou manuels. */
import * as crs from '../core/crs.js';
import { formatCoord } from '../core/units.js';
import { accuracyQuality, averagePosition } from '../services/gps.js';
import * as db from '../services/storage.js';
import { state, on, addFeature, updateFeature, removeFeature, nextPointNumber, ensureProject, updateSettings, POINT_CODES, codeInfo } from '../state.js';
import * as M from '../map/map.js';
import { h, icon, btn, mount, toast, field, select, modal, confirmDialog } from './dom.js';
import { parseNumber } from '../core/angles.js';
import { coordInput } from './coordinput.js';
import { anim } from './anim.js';
import { startNavigation } from './nav.js';
import { pointXY } from '../io/common.js';
import { pointInput } from '../services/autocrs.js';

/** Ligne de coordonnées d'un point dans le SRC d'affichage. @param {any} f */
export function pointCoordText(f) {
  const id = state.settings.displayCrs;
  const c = crs.getCrs(id);
  try {
    const [x, y] = pointXY(f, id);
    const [a, b] = crs.xyToInput(id, [x, y]);
    return `${c.axes[0].split(' ')[0]} ${formatCoord(a, c.unit)} · ${c.axes[1].split(' ')[0]} ${formatCoord(b, c.unit)}`;
  } catch { return '—'; }
}

/** @param {HTMLElement} root */
export function render(root) {
  state.gps.start();
  /** @type {AbortController|null} */ let averaging = null;

  const gpsCard = h('div.gps-card');
  const num = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: nextPointNumber(), inputmode: 'numeric', maxlength: 20 }));
  const name = /** @type {HTMLInputElement} */ (h('input', { type: 'text', placeholder: 'facultatif', maxlength: 60 }));
  const code = select(POINT_CODES.filter((c) => c.value !== 'cible').map((c) => ({ value: c.value, label: c.label })), 'borne');
  const desc = /** @type {HTMLTextAreaElement} */ (h('textarea', { rows: 2, placeholder: 'Description / observations', maxlength: 500 }));
  const photo = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: 'image/*', capture: 'environment' }));
  const avg = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: state.settings.avgEnabled }));
  const avgAcc = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min: 1, max: 100, step: 1, value: state.settings.avgMaxAcc, inputmode: 'numeric' }));
  const avgDur = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min: 3, max: 600, step: 1, value: state.settings.avgDuration, inputmode: 'numeric' }));
  const avgBox = h('div.avg-opts', { hidden: !avg.checked }, h('div.coord-pair', null, field('Précision exigée ≤ (m)', avgAcc), field('Durée d’observation (s)', avgDur)),
    h('small.hint', null, 'Moyenne des positions reçues dont la précision annoncée respecte le seuil. Réduit le bruit, pas les biais (multitrajets, masques) : ne remplace pas un levé GNSS professionnel.'));
  avg.addEventListener('change', () => { avgBox.hidden = !avg.checked; updateSettings({ avgEnabled: avg.checked }); });
  avgAcc.addEventListener('change', () => updateSettings({ avgMaxAcc: Number(avgAcc.value) || 8 }));
  avgDur.addEventListener('change', () => updateSettings({ avgDuration: Number(avgDur.value) || 20 }));
  const progress = h('div.avg-progress', { hidden: true });

  const recBtn = btn('Enregistrer le point GPS', { variant: 'primary', onclick: () => record() }, 'pin');
  recBtn.classList.add('btn-big');
  const manBtn = btn('Saisie manuelle', { variant: 'ghost', onclick: () => manualPoint() }, 'edit');
  const undoBtn = h('button.icon-btn', { type: 'button', title: 'Annuler la dernière opération', 'aria-label': 'Annuler', onclick: async () => { const l = await state.history.undo(); if (l) toast(`Annulé : ${l}`); } }, icon('undo'));
  const redoBtn = h('button.icon-btn', { type: 'button', title: 'Rétablir', 'aria-label': 'Rétablir', onclick: async () => { const l = await state.history.redo(); if (l) toast(`Rétabli : ${l}`); } }, icon('redo'));
  const list = h('div.point-list');

  const paintHistory = () => { /** @type {HTMLButtonElement} */ (undoBtn).disabled = !state.history.canUndo; /** @type {HTMLButtonElement} */ (redoBtn).disabled = !state.history.canRedo; };
  state.history.addEventListener('change', paintHistory);
  paintHistory();

  const paintGps = () => {
    const g = state.gps, f = g.last;
    const q = accuracyQuality(f?.accuracy);
    gpsCard.className = `gps-card st-${g.state}`;
    gpsCard.replaceChildren(
      h('div.gps-line', null, h(`span.badge.q-${q.level}`, null, f ? `±${f.accuracy.toFixed(f.accuracy < 10 ? 1 : 0)} m` : '—'), h('span', null, g.message)),
      f ? h('div.small', null, pointCoordText({ wgs84: { lat: f.lat, lon: f.lon } })) : null,
      f ? h('div.small.muted', null, `WGS 84 ${f.lat.toFixed(7)}°, ${f.lon.toFixed(7)}° · ${new Date(f.timestamp).toLocaleTimeString('fr-FR')}${f.altitude != null ? ` · alt. ${f.altitude.toFixed(0)} m (ellipsoïdale, indicative)` : ''}`) : null,
    );
  };
  state.gps.addEventListener('fix', paintGps);
  state.gps.addEventListener('state', paintGps);
  paintGps();

  async function record() {
    const g = state.gps;
    if (!g.last || g.state === 'denied' || g.state === 'insecure' || g.state === 'unsupported') { toast(g.message || 'Position indisponible.', 'error'); return; }
    let fix = { lat: g.last.lat, lon: g.last.lon, accuracy: g.last.accuracy, altitude: g.last.altitude, timestamp: g.last.timestamp };
    /** @type {any} */ let gpsInfo = { mode: 'instantané' };
    if (g.age() > 10) { toast('Dernière position GPS trop ancienne (> 10 s) : patientez.', 'warn'); return; }
    if (avg.checked) {
      averaging = new AbortController();
      /** @type {HTMLButtonElement} */ (recBtn).disabled = true;
      progress.hidden = false;
      const cancel = btn('Arrêter', { variant: 'ghost', onclick: () => averaging?.abort() }, 'stop');
      const bar = h('div.bar', null, h('i'));
      const txt = h('span');
      progress.replaceChildren(txt, bar, cancel);
      const dur = Number(avgDur.value) || 20;
      try {
        const r = await averagePosition(g, {
          durationS: dur, maxAccuracy: Number(avgAcc.value) || 8, signal: averaging.signal,
          onProgress: (p) => { txt.textContent = `Observation ${Math.floor(p.elapsed)} / ${dur} s · ${p.accepted} position(s) retenue(s), ${p.rejected} rejetée(s)`; /** @type {HTMLElement} */ (bar.firstChild).style.width = `${Math.min(100, (p.elapsed / dur) * 100)}%`; },
        });
        fix = { lat: r.lat, lon: r.lon, accuracy: r.accuracy, altitude: g.last?.altitude ?? null, timestamp: Date.now() };
        gpsInfo = { mode: 'moyenne', samples: r.samples, rejected: r.rejected, spread: Number(r.spread.toFixed(2)), durationS: Math.round(r.durationS) };
      } catch (e) {
        progress.hidden = true; /** @type {HTMLButtonElement} */ (recBtn).disabled = false;
        if (/** @type {any} */ (e).name !== 'AbortError') toast(/** @type {Error} */ (e).message, 'error', 6000);
        return;
      }
      progress.hidden = true; /** @type {HTMLButtonElement} */ (recBtn).disabled = false;
    }
    const inp = pointInput(fix.lon, fix.lat);
    let photoId = null;
    if (photo.files?.[0]) photoId = await db.savePhoto(photo.files[0]);
    const rec = await addFeature({
      type: 'point', num: num.value.trim() || nextPointNumber(), name: name.value.trim(), code: code.value, description: desc.value.trim(),
      wgs84: { lat: fix.lat, lon: fix.lon }, input: inp, accuracy: fix.accuracy, altitude: fix.altitude,
      source: 'gps', gpsInfo, photoId, takenAt: new Date(fix.timestamp).toISOString(),
    }, `Point ${num.value}`);
    toast(`Point ${rec.num} enregistré (±${fix.accuracy.toFixed(1)} m) · ${crs.getCrs(inp.crsId).label}.`, 'ok');
    if (state.settings.vibrate) navigator.vibrate?.(60);
    num.value = nextPointNumber(); name.value = ''; desc.value = ''; photo.value = '';
    anim.flash(num);
  }

  async function manualPoint() {
    await ensureProject();
    const ci = coordInput({ crsId: state.settings.inputCrs, nearby: () => state.gps.last });
    const n = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: nextPointNumber() }));
    const nm = /** @type {HTMLInputElement} */ (h('input', { type: 'text' }));
    const cd = select(POINT_CODES.map((c) => ({ value: c.value, label: c.label })), 'repere');
    const ds = /** @type {HTMLTextAreaElement} */ (h('textarea', { rows: 2 }));
    const ok = await modal({ title: 'Saisie manuelle d’un point', body: () => [ci.el, h('div.coord-pair', null, field('Numéro', n), field('Nom', nm)), field('Code', cd), field('Description', ds)],
      actions: [{ label: 'Annuler', value: false }, { label: 'Ajouter', value: true, variant: 'primary' }] });
    if (!ok) return;
    const r = ci.read();
    if (!r.ok || !r.xy || !r.check?.wgs84) { toast('Point non ajouté : coordonnées invalides.', 'error'); return; }
    await updateSettings({ inputCrs: r.crsId });
    await addFeature({ type: 'point', num: n.value.trim() || nextPointNumber(), name: nm.value.trim(), code: cd.value, description: ds.value.trim(),
      wgs84: r.check.wgs84, input: { crsId: r.crsId, x: r.xy[0], y: r.xy[1] }, accuracy: null, source: 'manual', takenAt: new Date().toISOString() }, `Point ${n.value}`);
    toast('Point ajouté.', 'ok');
  }

  const paintList = () => {
    const pts = state.features.filter((f) => f.type === 'point').slice().reverse();
    if (!pts.length) { mount(list, h('p.empty', null, 'Aucun point. Placez-vous sur le point à lever puis touchez « Enregistrer le point GPS ».')); return; }
    mount(list, h('div.list-head', null, `${pts.length} point(s)`), pts.map((f) => pointRow(f)));
  };
  const off = on('features', paintList);
  paintList();

  mount(root,
    h('div.project-line', null, icon('folder'), h('span', null, state.project ? state.project.name : 'Aucun projet ouvert : un projet sera créé au premier point.'), h('span.spacer'), undoBtn, redoBtn),
    gpsCard,
    h('div.coord-pair', null, field('N° du point', num), field('Code', code)),
    field('Nom', name),
    field('Description', desc),
    field('Photographie (facultatif)', photo),
    h('label.switch', null, avg, h('span', null, 'Attendre une meilleure précision')),
    avgBox, progress,
    h('div.sticky-actions.two', null, manBtn, recBtn),
    list,
  );
  return () => {
    averaging?.abort();
    state.gps.removeEventListener('fix', paintGps); state.gps.removeEventListener('state', paintGps);
    state.history.removeEventListener('change', paintHistory);
    off();
    state.gps.stop();
  };
}

/** Ligne d'un point dans une liste. @param {any} f */
export function pointRow(f) {
  const ci = codeInfo(f.code);
  const q = accuracyQuality(f.accuracy);
  return h('div.item', null,
    h(`span.dot${ci.ref ? '.sq' : ''}`, { style: { '--c': ci.color } }),
    h('div.item-main', { onclick: () => M.zoomToFeature(f), role: 'button', tabindex: 0 },
      h('div.item-title', null, h('b', null, f.num || '—'), ' ', f.name || ci.label, f.photoId ? icon('camera', 'mini') : null),
      h('div.item-sub', null, pointCoordText(f)),
      h('div.item-sub', null, f.accuracy != null ? h(`span.badge.q-${q.level}`, null, `±${f.accuracy.toFixed(1)} m`) : h('span.badge', null, f.source === 'manual' ? 'saisi' : f.source === 'import' ? 'importé' : '—'), ' ', f.takenAt ? new Date(f.takenAt).toLocaleString('fr-FR') : ''),
    ),
    h('div.item-actions', null,
      h('button.icon-btn', { type: 'button', title: 'Naviguer vers ce point', 'aria-label': 'Naviguer vers ce point', onclick: () => navTo(f) }, icon('target')),
      h('button.icon-btn', { type: 'button', title: 'Modifier', 'aria-label': 'Modifier', onclick: () => editPoint(f) }, icon('edit')),
      h('button.icon-btn.danger', { type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer', onclick: () => deletePoint(f) }, icon('trash')),
    ),
  );
}

/** @param {any} f */
export function navTo(f) {
  const id = f.input?.crsId ?? 'EPSG:4326';
  const [x, y] = pointXY(f, id);
  startNavigation({ lat: f.wgs84.lat, lon: f.wgs84.lon, name: `${f.num || ''} ${f.name || ''}`.trim() || 'Point', crsId: id, x, y });
}

/** @param {any} f */
export async function deletePoint(f) {
  if (!await confirmDialog('Supprimer le point', `Supprimer le point ${f.num || ''} ${f.name || ''} ? Vous pourrez annuler cette opération pendant la session.`, { danger: true, confirmLabel: 'Supprimer' })) return;
  await removeFeature(f.id, `Suppression du point ${f.num}`);
  toast('Point supprimé.', 'ok');
}

/** @param {any} f */
export async function editPoint(f) {
  const n = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: f.num ?? '' }));
  const nm = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: f.name ?? '' }));
  const cd = select(POINT_CODES.map((c) => ({ value: c.value, label: c.label })), f.code || 'divers');
  const ds = /** @type {HTMLTextAreaElement} */ (h('textarea', { rows: 3 }, f.description ?? ''));
  const measured = f.source === 'gps' || f.source === 'nav';
  const id = f.input?.crsId ?? 'EPSG:4326';
  const [a, b] = crs.xyToInput(id, pointXY(f, id));
  const dec = crs.getCrs(id).unit === 'm' ? 3 : 8;
  const ci = coordInput({ crsId: id, a: a.toFixed(dec), b: b.toFixed(dec) });
  const coordBox = h('div.coord-edit', { hidden: true },
    measured ? h('p.issue.warning', null, icon('alert'), 'Ce point a été mesuré au GPS : les nouvelles coordonnées remplaceront la mesure (l’ancienne position est conservée dans l’historique du point).') : null,
    ci.el);
  let action = 'save';
  const alt = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'decimal', value: f.altitude != null ? String(Math.round(f.altitude * 100) / 100) : '', placeholder: 'm' }));
  const altSrc = h('small.hint', null, f.altitude != null ? `Source : ${f.altitudeSource ?? (f.source === 'gps' ? 'GPS (ellipsoïdale, indicative)' : 'saisie')}` : 'Altitude inconnue');
  const altBtn = btn('Altitude MNT', { variant: 'ghost', onclick: async () => {
    try {
      const { elevationAt } = await import('../services/dem.js');
      const z = await elevationAt(f.wgs84.lat, f.wgs84.lon);
      alt.value = z.toFixed(1); alt.dataset.src = 'MNT (SRTM ~30 m, ±5–10 m)'; altSrc.textContent = `Source : ${alt.dataset.src}`;
    } catch (e) { toast(/** @type {Error} */ (e).message, 'warn'); }
  } }, 'globe');
  const photoBox = h('div.photo-box');
  if (f.photoId) db.getPhoto(f.photoId).then((blob) => { if (blob) photoBox.append(h('img', { src: URL.createObjectURL(blob), alt: `Photographie du point ${f.num}` })); });
  const meta = h('p.muted.small', null, `Source : ${f.source ?? '—'} · ${f.takenAt ? new Date(f.takenAt).toLocaleString('fr-FR') : ''}${f.accuracy != null ? ` · précision annoncée ±${f.accuracy.toFixed(1)} m` : ''}${f.gpsInfo?.mode === 'moyenne' ? ` · moyenne de ${f.gpsInfo.samples} positions sur ${f.gpsInfo.durationS} s (dispersion ${f.gpsInfo.spread} m)` : ''}${f.moves?.length ? ` · déplacé ${f.moves.length} fois` : ''}`);
  const ok = await modal({ title: `Point ${f.num ?? ''}`, body: (close) => [
    h('div.coord-pair', null, field('Numéro', n), field('Nom', nm)), field('Code', cd), field('Description', ds),
    h('fieldset.group', null, h('legend', null, 'Position'),
      h('p.small', null, pointCoordText(f)),
      h('div.btn-grid', null,
        btn('Nouvelles coordonnées', { variant: 'ghost', onclick: (/** @type {Event} */ e) => { coordBox.hidden = false; action = 'coords'; /** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-pressed', 'true'); ci.focus(); } }, 'edit'),
        btn('Déplacer sur la carte', { variant: 'ghost', onclick: () => { action = 'map'; close(true); } }, 'pointer'),
        btn('Ma position GPS actuelle', { variant: 'ghost', onclick: () => { action = 'gps'; close(true); } }, 'locate')),
      coordBox),
    h('div.alt-row', null, field('Altitude (m)', alt), altBtn), altSrc,
    meta, photoBox,
  ], actions: [{ label: 'Annuler', value: false }, { label: 'Enregistrer', value: true, variant: 'primary' }] });
  if (!ok) return;
  /** @type {any} */
  const upd = { ...f, num: n.value.trim(), name: nm.value.trim(), code: cd.value, description: ds.value.trim() };
  const z = parseNumber(alt.value);
  if (alt.value.trim() === '') { upd.altitude = null; } else if (Number.isFinite(z) && z !== f.altitude) { upd.altitude = z; upd.altitudeSource = alt.dataset.src ?? 'saisie'; }
  if (action === 'coords') {
    const r = ci.read();
    if (!r.ok || !r.xy || !r.check?.wgs84) { toast('Coordonnées invalides : modification non enregistrée.', 'error'); return; }
    await relocatePoint(upd, { wgs84: r.check.wgs84, input: { crsId: r.crsId, x: r.xy[0], y: r.xy[1] }, how: 'saisie' });
    return;
  }
  await updateFeature(upd, `Modification du point ${upd.num}`);
  if (action === 'map') {
    const { startMovePoint } = await import('./maptools.js');
    startMovePoint(state.features.find((x) => x.id === f.id) ?? upd, async (lat, lon) => {
      const cur = state.features.find((x) => x.id === f.id) ?? upd;
      await relocatePoint(cur, { wgs84: { lat, lon }, input: relocInput(cur, lon, lat), how: 'carte' });
    });
    return;
  }
  if (action === 'gps') {
    state.gps.start();
    try {
      const fix = await new Promise((res, rej) => {
        if (state.gps.last && state.gps.age() < 5) { res(state.gps.last); return; }
        const t = setTimeout(() => { state.gps.removeEventListener('fix', on1); rej(new Error('Pas de position GPS reçue en 20 s.')); }, 20000);
        const on1 = (/** @type {any} */ e) => { clearTimeout(t); state.gps.removeEventListener('fix', on1); res(e.detail); };
        state.gps.addEventListener('fix', on1);
        toast('Recherche de votre position…', 'info', 2500);
      });
      await relocatePoint(upd, { wgs84: { lat: fix.lat, lon: fix.lon }, input: relocInput(upd, fix.lon, fix.lat), how: 'GPS', accuracy: fix.accuracy, altitude: fix.altitude });
    } catch (e) { toast(/** @type {Error} */ (e).message, 'error'); } finally { state.gps.stop(); }
    return;
  }
  toast('Point modifié.', 'ok');
}

/**
 * Système d'enregistrement d'un point déplacé : zone automatique de sa nouvelle position
 * (mode automatique), sinon le système d'origine du point.
 * @param {any} f @param {number} lon @param {number} lat
 */
function relocInput(f, lon, lat) {
  if (state.settings.autoCrs || !f.input?.crsId) return pointInput(lon, lat);
  const xy = crs.fromWGS84(f.input.crsId, lon, lat);
  return { crsId: f.input.crsId, x: xy[0], y: xy[1] };
}

/**
 * Change la position d'un point et, si l'utilisateur l'accepte, celle des sommets de parcelles
 * et de lignes qui y sont rattachés (limites communes conservées).
 * @param {any} f @param {{ wgs84: {lat:number, lon:number}, input: {crsId:string, x:number, y:number}, how: string, accuracy?: number|null, altitude?: number|null }} pos
 */
export async function relocatePoint(f, pos) {
  const prev = { wgs84: f.wgs84, input: f.input, accuracy: f.accuracy ?? null, at: new Date().toISOString(), how: pos.how };
  const moved = { ...f, wgs84: pos.wgs84, input: pos.input, accuracy: pos.accuracy ?? null, moves: [...(f.moves ?? []), prev] };
  if (pos.how === 'GPS') { moved.source = 'gps'; moved.takenAt = new Date().toISOString(); if (pos.altitude != null) { moved.altitude = pos.altitude; moved.altitudeSource = 'GPS (ellipsoïdale, indicative)'; } }
  else if (moved.source === 'gps' || moved.source === 'nav') moved.source = pos.how === 'carte' ? 'map' : 'manual';
  const linked = state.features.filter((x) => (x.type === 'parcel' || x.type === 'line') && x.vertices.some((/** @type {any} */ v) => v.pointId === f.id));
  await updateFeature(moved, `Déplacement du point ${f.num ?? ''}`);
  if (linked.length && await confirmDialog('Mettre à jour les parcelles', `${linked.length} parcelle(s)/ligne(s) utilisent ce point comme sommet : ${linked.map((x) => x.name || 'sans nom').join(', ')}. Déplacer aussi ces sommets ?`, { confirmLabel: 'Mettre à jour' })) {
    for (const x of linked) {
      const [vx, vy] = pointXY(moved, x.crsId);
      await updateFeature({ ...x, vertices: x.vertices.map((/** @type {any} */ v) => (v.pointId === f.id ? { ...v, x: vx, y: vy, accuracy: moved.accuracy } : v)) }, `Sommet ${f.num ?? ''} suivi`);
    }
  }
  const d = Math.hypot((pos.wgs84.lat - f.wgs84.lat) * 111320, (pos.wgs84.lon - f.wgs84.lon) * 111320 * Math.cos(f.wgs84.lat * Math.PI / 180));
  toast(`Point ${f.num ?? ''} déplacé de ${d < 100 ? d.toFixed(2) : Math.round(d)} m (${pos.how}).`, 'ok');
}
