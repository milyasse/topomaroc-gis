// @ts-check
/**
 * Outils directement sur la carte :
 *  - « + Point » : placement d'un point au réticule (ou au toucher), sans GPS ;
 *  - « Sélection » : multi-sélection de points → créer une parcelle ou les ajouter à une parcelle.
 */
import * as crs from '../core/crs.js';
import { bestContour, insertAll } from '../core/assemble.js';
import { state, on, addFeature, updateFeature, nextPointNumber, ensureProject, POINT_CODES } from '../state.js';
import * as M from '../map/map.js';
import { h, icon, btn, mount, toast, field, select, modal } from './dom.js';
import { anim } from './anim.js';
import { pointXY } from '../io/common.js';

const bar = () => /** @type {HTMLElement} */ (document.getElementById('action-bar'));
let mode = /** @type {'none'|'place'|'select'} */ ('none');

/** @param {...any} children */
export function showBar(...children) {
  const b = bar();
  mount(b, ...children);
  b.hidden = false;
  anim.toastIn(b);
}
export function hideBar() { bar().hidden = true; bar().replaceChildren(); }

export function stopModes() {
  if (mode === 'place') { M.setClickHandler(null); document.body.classList.remove('placing'); }
  if (mode === 'select') M.setSelectionMode(false);
  document.getElementById('btn-addpt')?.classList.remove('on');
  document.getElementById('btn-select')?.classList.remove('on');
  mode = 'none';
  hideBar();
}

// ------------------------------------------------------------- Placement d'un point
let lastCode = 'borne';
export function startPlacing() {
  if (mode === 'place') { stopModes(); return; }
  stopModes();
  mode = 'place';
  if (location.hash !== '#/map') location.hash = '#/map';
  document.body.classList.add('placing');
  document.getElementById('btn-addpt')?.classList.add('on');
  const code = select(POINT_CODES.filter((c) => c.value !== 'cible').map((c) => ({ value: c.value, label: c.label })), lastCode, { 'aria-label': 'Code du point' });
  code.addEventListener('change', () => { lastCode = code.value; });
  const place = (/** @type {number} */ lat, /** @type {number} */ lon) => placePoint(lat, lon, code.value);
  showBar(
    h('div.ab-text', null, icon('crosshair'), h('span', null, 'Déplacez la carte sous le réticule ou touchez l’emplacement')),
    h('div.ab-row', null, code,
      btn('Placer ici', { variant: 'primary', onclick: () => { const c = M.getMap().getCenter(); place(c.lat, c.lng); } }, 'pin-plus'),
      btn('Terminer', { variant: 'ghost', onclick: stopModes }, 'check')),
  );
  M.setClickHandler((e) => place(e.latlng.lat, e.latlng.lng));
}

/** @param {number} lat @param {number} lon @param {string} code */
async function placePoint(lat, lon, code) {
  await ensureProject();
  const id = crs.getCrs(state.settings.displayCrs).kind === 'projected' ? state.settings.displayCrs : 'EPSG:4326';
  const xy = crs.fromWGS84(id, lon, lat);
  const num = nextPointNumber();
  await addFeature({ type: 'point', num, name: '', code, description: 'Placé sur la carte', wgs84: { lat, lon }, input: { crsId: id, x: xy[0], y: xy[1] }, accuracy: null, source: 'map', takenAt: new Date().toISOString() }, `Point ${num} (carte)`);
  if (state.settings.vibrate) navigator.vibrate?.(30);
  toast(`Point ${num} placé. Précision = celle du pointé sur la carte.`, 'ok', 2000);
}

// ------------------------------------------------------------- Sélection multiple
export function startSelecting() {
  if (mode === 'select') { stopModes(); return; }
  stopModes();
  mode = 'select';
  if (!location.hash.startsWith('#/map')) location.hash = '#/map';
  document.getElementById('btn-select')?.classList.add('on');
  M.setSelectionMode(true);
  paintSelectBar();
}

function paintSelectBar() {
  if (mode !== 'select') return;
  const n = M.selection.size;
  showBar(
    h('div.ab-text', null, icon('select'), h('span', null, n ? `${n} point(s) sélectionné(s)` : 'Touchez les points à sélectionner')),
    h('div.ab-row', null,
      btn('Visibles', { variant: 'ghost', title: 'Sélectionner tous les points visibles', onclick: () => {
        const b = M.getMap().getBounds();
        M.selectIds(state.features.filter((f) => f.type === 'point' && b.contains([f.wgs84.lat, f.wgs84.lon])).map((f) => f.id));
      } }, 'select'),
      btn('Créer une parcelle', { variant: 'primary', disabled: n < 3, onclick: parcelFromSelection }, 'polygon'),
      btn('Ajouter à…', { variant: 'ghost', disabled: n < 1 || !state.features.some((f) => f.type === 'parcel'), onclick: addSelectionToParcel }, 'plus'),
      btn('', { variant: 'ghost', 'aria-label': 'Terminer la sélection', title: 'Terminer', onclick: stopModes }, 'close')),
  );
}
on('selection', () => paintSelectBar());

/** Points sélectionnés, dans l'ordre de sélection. */
const selectedPoints = () => [...M.selection].map((id) => state.features.find((f) => f.id === id)).filter(Boolean);

/** SRC projeté commun pour des points (celui de leur saisie s'il est commun, sinon zone Lambert). @param {any[]} pts */
function commonCrs(pts) {
  const ids = new Set(pts.map((p) => p.input?.crsId).filter(Boolean));
  if (ids.size === 1) { const id = [...ids][0]; if (crs.getCrs(id).kind === 'projected') return id; }
  const d = state.settings.displayCrs;
  if (crs.getCrs(d).kind === 'projected') return d;
  const c = pts[0].wgs84;
  return crs.bestLambertZone(c.lon, c.lat) ?? `EPSG:326${crs.utmZoneFor(c.lon)}`;
}

async function parcelFromSelection() {
  const pts = selectedPoints();
  if (pts.length < 3) return;
  const name = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: `Parcelle ${state.features.filter((f) => f.type === 'parcel').length + 1}` }));
  const ord = select([
    { value: 'auto', label: 'Contour automatique (recommandé)' },
    { value: 'click', label: 'Ordre de sélection' },
    { value: 'num', label: 'Numéros des points croissants' },
  ], 'auto');
  const ok = await modal({ title: `Parcelle à partir de ${pts.length} points`, body: () => [
    field('Nom de la parcelle', name), field('Ordre des sommets', ord, 'Le contour automatique trie les points autour de leur centre et supprime les croisements.'),
  ], actions: [{ label: 'Annuler', value: false }, { label: 'Créer', value: true, variant: 'primary' }] });
  if (!ok) return;
  const crsId = commonCrs(pts);
  const xy = pts.map((p) => /** @type {[number,number]} */ (pointXY(p, crsId)));
  let order = pts.map((_, i) => i);
  if (ord.value === 'num') order.sort((a, b) => (parseFloat(pts[a].num) || 0) - (parseFloat(pts[b].num) || 0));
  if (ord.value === 'auto') {
    const r = bestContour(xy);
    order = r.order;
    if (!r.simple) toast('Contour automatique imparfait : vérifiez l’ordre des sommets.', 'warn', 5000);
  }
  const rec = await addFeature({
    type: 'parcel', name: name.value.trim() || 'Parcelle', crsId, method: 'auto', source: 'points',
    vertices: order.map((i) => ({ x: xy[i][0], y: xy[i][1], label: String(pts[i].num || i + 1), pointId: pts[i].id, accuracy: pts[i].accuracy ?? null })),
  }, 'Parcelle depuis points');
  stopModes();
  location.hash = `#/parcels/${rec.id}/manual`;
}

async function addSelectionToParcel() {
  const pts = selectedPoints();
  const parcels = state.features.filter((f) => f.type === 'parcel');
  const sel = select(parcels.map((p) => ({ value: p.id, label: `${p.name || 'Parcelle'} (${p.vertices.length} sommets)` })), parcels[0].id);
  const how = select([{ value: 'best', label: 'Insérer chaque point au meilleur endroit du contour' }, { value: 'end', label: 'Ajouter à la fin, dans l’ordre de sélection' }], 'best');
  const ok = await modal({ title: `Ajouter ${pts.length} point(s) à une parcelle`, body: () => [field('Parcelle', sel), field('Position', how)],
    actions: [{ label: 'Annuler', value: false }, { label: 'Ajouter', value: true, variant: 'primary' }] });
  if (!ok) return;
  const p = parcels.find((x) => x.id === sel.value);
  const already = new Set(p.vertices.map((/** @type {any} */ v) => v.pointId).filter(Boolean));
  const add = pts.filter((q) => !already.has(q.id));
  if (!add.length) { toast('Ces points sont déjà des sommets de la parcelle.', 'info'); return; }
  const isProj = crs.getCrs(p.crsId).kind === 'projected';
  const planeId = isProj ? p.crsId : commonCrs(add);
  const toPlane = (/** @type {any} */ v) => /** @type {[number,number]} */ (isProj ? [v.x, v.y] : crs.transform(p.crsId, planeId, [v.x, v.y]));
  const newV = add.map((q) => { const [x, y] = pointXY(q, p.crsId); return { x, y, label: String(q.num || ''), pointId: q.id, accuracy: q.accuracy ?? null }; });
  let vertices;
  if (how.value === 'end' || p.vertices.length < 2) vertices = [...p.vertices, ...newV];
  else {
    const ring = p.vertices.map(toPlane);
    vertices = p.vertices.slice();
    for (const v of newV) {
      const r = insertAll(ring, [toPlane(v)]);
      const k = r.positions[0];
      ring.splice(k, 0, toPlane(v));
      vertices.splice(k, 0, v);
    }
  }
  await updateFeature({ ...p, vertices }, `Ajout de ${add.length} sommet(s)`);
  stopModes();
  toast(`${add.length} sommet(s) ajouté(s) à « ${p.name} ».`, 'ok');
  location.hash = `#/parcels/${p.id}/manual`;
}

// ------------------------------------------------------------- Badge de résolution satellite
on('resolution', (r) => {
  const el = document.getElementById('res-badge');
  if (!el) return;
  if (!r) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = `Imagerie max. ici : zoom ${r.served} — image agrandie`;
});
