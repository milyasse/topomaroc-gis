// @ts-check
/** Module « Parcelles et superficies » : création (GPS, saisie, import, dessin), calculs, rapports. */
import * as crs from '../core/crs.js';
import { analyzeParcel, totalArea } from '../core/parcel.js';
import { formatArea, formatLength, fmtNum, AREA_UNITS, formatCoord } from '../core/units.js';
import { formatBearing } from '../core/angles.js';
import { inverse } from '../core/geodesy.js';
import { dist2D } from '../core/geometry.js';
import { averagePosition, accuracyQuality } from '../services/gps.js';
import { state, on, addFeature, updateFeature, removeFeature, updateSettings, ensureProject } from '../state.js';
import * as M from '../map/map.js';
import { h, icon, btn, mount, toast, field, select, modal, confirmDialog, promptDialog, shareOrSave } from './dom.js';
import { crsSelect } from './coordinput.js';
import { anim } from './anim.js';
import { parseAngle, parseNumber, gridBearing } from '../core/angles.js';
import { importWizard, exportDialog } from './transfer.js';
import { analyze, safeName } from '../io/common.js';

const L = M.L;
/** @type {Set<string>} */ const selected = new Set();

const areaUnitSelect = () => {
  const s = select(Object.entries(AREA_UNITS).map(([k, u]) => ({ value: k, label: u.label })), state.settings.areaUnit, { 'aria-label': 'Unité de superficie' });
  s.addEventListener('change', () => updateSettings({ areaUnit: /** @type {any} */ (s.value) }));
  return s;
};

// ============================================================= Liste
/** @param {HTMLElement} root @param {string} [id] */
export function render(root, id) {
  if (id) return renderEditor(root, id);
  const list = h('div.parcel-list');
  const total = h('div.total-bar');
  const unit = areaUnitSelect();

  const paint = () => {
    const parcels = state.features.filter((f) => f.type === 'parcel');
    for (const s of [...selected]) if (!parcels.some((p) => p.id === s)) selected.delete(s);
    if (!parcels.length) { mount(list, h('p.empty', null, 'Aucune parcelle. Créez-en une par levé GPS, saisie de coordonnées, import de fichier ou dessin sur la carte.')); total.hidden = true; return; }
    const res = new Map(parcels.map((p) => [p.id, safeAnalyze(p)]));
    mount(list, parcels.map((p) => {
      const a = res.get(p.id);
      const cb = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: selected.has(p.id), 'aria-label': `Sélectionner ${p.name}` }));
      cb.addEventListener('change', () => { if (cb.checked) selected.add(p.id); else selected.delete(p.id); paintTotal(); });
      return h('div.item', null, cb,
        h('div.item-main', { role: 'button', tabindex: 0, onclick: () => { location.hash = `#/parcels/${p.id}`; } },
          h('div.item-title', null, h('b', null, p.name || 'Parcelle sans nom'), a?.valid ? null : h('span.badge.q-poor', null, 'à corriger')),
          h('div.item-sub', null, a?.valid ? `${formatArea(a.area, /** @type {any} */ (state.settings.areaUnit))} · périmètre ${formatLength(a.perimeter)}` : `${p.vertices.length} sommet(s)`),
          h('div.item-sub.muted', null, `${crs.getCrs(p.crsId).label} · ${p.vertices.length} sommets`)),
        h('div.item-actions', null,
          h('button.icon-btn', { type: 'button', title: 'Voir sur la carte', 'aria-label': 'Voir sur la carte', onclick: () => p.vertices.length && M.zoomToFeature(p) }, icon('map')),
          h('button.icon-btn.danger', { type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer', onclick: () => deleteParcel(p) }, icon('trash'))));
    }));
    paintTotal();
    function paintTotal() {
      const sel = parcels.filter((p) => selected.has(p.id)).map((p) => res.get(p.id));
      total.hidden = sel.length < 1;
      if (!sel.length) return;
      const t = totalArea(sel);
      mount(total, h('span', null, `${t.count} parcelle(s) sélectionnée(s) : `), h('b', null, formatArea(t.area, /** @type {any} */ (state.settings.areaUnit))),
        t.mixedMethods ? h('small.warn', null, ' (méthodes de calcul différentes)') : null,
        h('button.link-btn', { type: 'button', onclick: () => exportDialog(parcels.filter((p) => selected.has(p.id)), 'geojson', 'parcelles') }, icon('download'), 'Exporter'));
    }
  };
  const off = on('features', paint);
  const off2 = on('settings', (p) => { if (p.areaUnit) paint(); });
  paint();

  mount(root,
    h('div.row', null, btn('Nouvelle parcelle', { variant: 'primary', onclick: () => newParcel() }, 'plus'), h('span.spacer'), field('Unité', unit)),
    list, total,
    h('details.help', null, h('summary', null, icon('info'), 'Méthode de calcul'),
      h('p', null, 'Coordonnées projetées (Lambert, UTM) : superficie plane par la formule de Gauss, comme sur les plans topographiques et cadastraux. Levés GPS (WGS 84) : superficie géodésique exacte sur l’ellipsoïde (GeographicLib). Au-delà de 10 km d’emprise, la méthode géodésique est retenue. Les deux valeurs sont toujours affichées pour contrôle.')),
  );
  return () => { off(); off2(); };
}

/** @param {any} p */
function safeAnalyze(p) { try { return analyze(p); } catch { return null; } }

async function newParcel() {
  const name = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: `Parcelle ${state.features.filter((f) => f.type === 'parcel').length + 1}` }));
  const cs = crsSelect(state.settings.inputCrs);
  const modes = [
    { value: 'gps', label: 'A — Levé GPS des sommets sur le terrain', ic: 'locate' },
    { value: 'manual', label: 'B — Saisie des coordonnées des sommets', ic: 'edit' },
    { value: 'import', label: 'C — Import d’un fichier CSV / GeoJSON', ic: 'upload' },
    { value: 'draw', label: 'D — Dessin sur la carte', ic: 'polygon' },
  ];
  const mode = await modal({ title: 'Nouvelle parcelle', body: () => [
    field('Nom de la parcelle', name),
    field('Système de coordonnées des sommets', cs, 'Pour un levé GPS, WGS 84 est conseillé (les coordonnées Lambert restent affichées et exportables).'),
    h('div.mode-grid', null, modes.map((m) => h('button.mode-btn', { type: 'button', 'data-mode': m.value }, icon(m.ic), h('span', null, m.label)))),
  ], dismissValue: null, actions: [] });
  void mode;
}

// Délégation : les boutons de mode ferment la modale via un clic intercepté
document.addEventListener('click', async (e) => {
  const b = /** @type {HTMLElement} */ (e.target)?.closest?.('.mode-btn');
  if (!b) return;
  const card = b.closest('.modal');
  const name = /** @type {HTMLInputElement|null} */ (card?.querySelector('input[type=text]'));
  const cs = /** @type {HTMLSelectElement|null} */ (card?.querySelector('select.crs-select'));
  const mode = /** @type {HTMLElement} */ (b).dataset.mode;
  /** @type {HTMLElement|null} */ (card?.querySelector('.modal-head .icon-btn'))?.click();
  let crsId = cs?.value ?? state.settings.inputCrs;
  if (mode === 'gps' && crsId !== 'EPSG:4326' && crs.getCrs(crsId).datum === 'merchich') {
    toast('Levé GPS : sommets enregistrés en WGS 84 (natif GPS) ; les coordonnées Lambert sont calculées à l’affichage.', 'info', 5000);
    crsId = 'EPSG:4326';
  }
  await ensureProject();
  if (mode !== 'import') await updateSettings({ inputCrs: cs?.value ?? crsId });
  if (mode === 'import') {
    const imp = await importWizard({ accept: '.csv,.txt,.geojson,.json,.kml,.gpx' });
    if (!imp) return;
    const pts = imp.items.flatMap((it) => (it.type === 'point' ? [{ x: it.x, y: it.y, label: it.name, desc: it.description || '' }] : it.vertices.map((/** @type {any} */ v, /** @type {number} */ k) => ({ ...v, label: String(k + 1) }))));
    const rec = await addFeature({ type: 'parcel', name: name?.value || imp.fileName, crsId: imp.crsId, method: 'auto', source: 'import', vertices: pts }, 'Nouvelle parcelle (import)');
    location.hash = `#/parcels/${rec.id}/manual`;
    return;
  }
  const rec = await addFeature({ type: 'parcel', name: name?.value || 'Parcelle', crsId, method: 'auto', source: mode, vertices: [] }, 'Nouvelle parcelle');
  location.hash = `#/parcels/${rec.id}/${mode}`;
});

/** @param {any} p */
async function deleteParcel(p) {
  if (!await confirmDialog('Supprimer la parcelle', `Supprimer « ${p.name} » et ses ${p.vertices.length} sommets ? (annulable pendant la session)`, { danger: true, confirmLabel: 'Supprimer' })) return;
  await removeFeature(p.id, `Suppression de ${p.name}`);
  if (location.hash.startsWith(`#/parcels/${p.id}`)) location.hash = '#/parcels';
  toast('Parcelle supprimée.', 'ok');
}

// ============================================================= Éditeur
/** @param {HTMLElement} root @param {string} id */
function renderEditor(root, id) {
  const [pid, tabInit] = id.split('/');
  let tab = tabInit || 'manual';
  const get = () => state.features.find((f) => f.id === pid);
  if (!get()) { mount(root, h('p.empty', null, 'Parcelle introuvable.'), btn('Retour à la liste', { onclick: () => { location.hash = '#/parcels'; } })); return; }

  const results = h('div.results');
  const summary = h('div.sticky-summary', { 'aria-live': 'polite' });
  const issues = h('div.issues');
  const tabs = h('div.tabs', { role: 'tablist' });
  const body = h('div.tab-body');
  const sides = h('div.sides');
  const between = h('div.between');
  /** @type {(() => void)|null} */ let tabCleanup = null;

  /** Sauvegarde des sommets (avec historique). @param {any[]} vertices @param {string} label @param {any} [extra] */
  const saveVertices = async (vertices, label, extra = {}) => { const p = get(); if (p) await updateFeature({ ...p, ...extra, vertices }, label); };

  // ---------------- résultats
  const unit = areaUnitSelect();
  const method = select([{ value: 'auto', label: 'Méthode automatique' }, { value: 'plane', label: 'Plane (projection)' }, { value: 'geodesic', label: 'Géodésique (ellipsoïde)' }], get().method || 'auto', { 'aria-label': 'Méthode de calcul' });
  method.addEventListener('change', () => { const p = get(); updateFeature({ ...p, method: method.value }, 'Méthode de calcul'); });
  const projSel = crsSelect(crs.getCrs(state.settings.displayCrs).kind === 'projected' ? state.settings.displayCrs : (crs.getCrs(get().crsId).kind === 'projected' ? get().crsId : 'EPSG:26191'), { projectedOnly: true });

  const paintResults = () => {
    const p = get(); if (!p) return;
    /** @type {any} */ let a = null;
    if (p.vertices.length >= 3) {
      try { a = analyzeParcel(p.vertices, p.crsId, { method: p.method || 'auto', planeCrsId: crs.getCrs(p.crsId).kind === 'projected' ? null : projSel.value }); } catch (e) { a = null; }
    }
    const u = /** @type {any} */ (state.settings.areaUnit);
    if (!a) {
      summary.className = 'sticky-summary';
      mount(summary, h('span', null, `${p.vertices.length} sommet(s) — au moins 3 pour calculer`));
      mount(results, h('div.big-figure', null, h('div.eyebrow', null, 'Superficie'), h('div.value', null, '—')), h('p.muted', null, `${p.vertices.length} sommet(s) : au moins 3 nécessaires.`));
      mount(issues); mount(sides); mount(between); return;
    }
    const val = h('div.value', null, a.valid ? formatArea(a.area, u) : '—');
    summary.className = `sticky-summary${a.valid ? '' : ' invalid'}`;
    mount(summary, a.valid ? [h('span', null, 'S = '), h('b', null, formatArea(a.area, u)), h('span', null, `· P = ${formatLength(a.perimeter)} · ${a.n} sommets`)] : h('span', null, `Géométrie à corriger (${a.issues.filter((/** @type {any} */ i) => i.level === 'error').length} erreur(s))`));
    mount(results,
      h('div.big-grid', null,
        h('div.big-figure', null, h('div.eyebrow', null, 'Superficie'), val, a.valid && u !== 'haaca' ? h('div.sub', null, formatArea(a.area, 'haaca')) : a.valid ? h('div.sub', null, formatArea(a.area, 'm2')) : null),
        h('div.big-figure', null, h('div.eyebrow', null, 'Périmètre'), h('div.value', null, a.valid ? formatLength(a.perimeter) : '—'), h('div.sub', null, `${a.n} sommets`))),
      a.valid ? h('p.method', null, icon('info'), a.methodNote) : null,
      a.valid ? h('p.small.muted', null, `Contrôle : plane ${crs.getCrs(a.planeCrsId).label} ${formatArea(a.planeArea, 'm2')} · ellipsoïdale WGS 84 ${formatArea(a.geodesicArea, 'm2')} (écart ${a.diffPercent.toFixed(3)} %)`) : null,
      h('div.row.wrap', null, field('Unité', unit), field('Méthode', method), crs.getCrs(p.crsId).kind === 'geographic' ? field('Projection de contrôle', projSel) : null),
    );
    if (a.valid) anim.flash(val);
    mount(issues, a.issues.map((/** @type {any} */ i) => h(`p.issue.${i.level}`, null, icon(i.level === 'info' ? 'info' : 'alert'), i.message)));
    // côtés
    const ang = /** @type {any} */ (state.settings.angleUnit);
    const labels = p.vertices.map((/** @type {any} */ v, /** @type {number} */ i) => v.label || String(i + 1));
    mount(sides, h('h4', null, 'Côtés'), h('div.table-wrap', null, h('table.tbl', null,
      h('thead', null, h('tr', null, h('th', null, 'Côté'), h('th', null, 'Longueur'), h('th', null, 'Gisement'), h('th', null, 'Azimut vrai'), h('th', null, 'Long. géod.'))),
      h('tbody', null, a.sides.map((/** @type {any} */ s, /** @type {number} */ k) => h('tr', { tabindex: 0, onclick: () => highlightSide(p, s.from, s.to), title: 'Afficher ce côté sur la carte' },
        h('td', null, `${labels[s.from]}–${labels[s.to]}`), h('td.num', null, formatLength(s.gridLength, 3)),
        h('td.num', null, formatBearing(s.gridBearing, ang, ang === 'grad' ? 4 : 3)), h('td.num', null, formatBearing(s.trueAzimuth, ang === 'grad' ? 'grad' : 'deg', 3)), h('td.num', null, formatLength(s.geodesicLength, 3))))))),
    h('p.small.muted', null, 'Longueur et gisement mesurés dans la projection ; azimut et longueur géodésiques sur l’ellipsoïde WGS 84.'));
    // distance entre deux sommets quelconques
    const opts = labels.map((/** @type {string} */ l, /** @type {number} */ i) => ({ value: String(i), label: l }));
    const s1 = select(opts, '0'), s2 = select(opts, String(Math.min(2, labels.length - 1)));
    const out = h('div.small');
    const calc = () => {
      const i = Number(s1.value), j = Number(s2.value);
      const d = dist2D(a.plane[i], a.plane[j]);
      const g = inverse(a.wgs84[i].lat, a.wgs84[i].lon, a.wgs84[j].lat, a.wgs84[j].lon);
      out.textContent = `${labels[i]} → ${labels[j]} : ${formatLength(d, 3)} (plan) · ${formatLength(g.distance, 3)} (géodésique) · gisement ${formatBearing(gridBearing(a.plane[i], a.plane[j]), ang, 3)}`;
    };
    s1.addEventListener('change', calc); s2.addEventListener('change', calc); calc();
    mount(between, h('h4', null, 'Distance entre deux sommets'), h('div.coord-pair', null, s1, s2), out);
  };

  // ---------------- carte : brouillon + sommets déplaçables
  const draft = M.layer('draft');
  /** @type {any} */ let sideHl = null;
  /** @param {any} p @param {number} i @param {number} j */
  function highlightSide(p, i, j) {
    if (sideHl) draft.removeLayer(sideHl);
    const a = crs.toWGS84(p.crsId, [p.vertices[i].x, p.vertices[i].y]), b = crs.toWGS84(p.crsId, [p.vertices[j].x, p.vertices[j].y]);
    sideHl = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { pane: 'draft', color: '#d6602a', weight: 7, opacity: 0.85 }).addTo(draft);
    M.getMap().fitBounds(sideHl.getBounds(), { padding: [80, 80], maxZoom: 21 });
  }
  const paintMap = () => {
    draft.clearLayers(); sideHl = null;
    const p = get(); if (!p) return;
    const ll = p.vertices.map((/** @type {any} */ v) => { const w = crs.toWGS84(p.crsId, [v.x, v.y]); return L.latLng(w.lat, w.lon); });
    if (ll.length >= 3) L.polygon(ll, { pane: 'draft', color: '#d6602a', weight: 3, fillOpacity: 0.12, dashArray: '8 6', interactive: false }).addTo(draft);
    else if (ll.length === 2) L.polyline(ll, { pane: 'draft', color: '#d6602a', weight: 3, dashArray: '8 6' }).addTo(draft);
    ll.forEach((pt, i) => {
      const m = L.marker(pt, { pane: 'draft', draggable: true, autoPan: true, icon: L.divIcon({ className: 'vx-icon', html: `<span>${(p.vertices[i].label || i + 1)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }), title: `Sommet ${p.vertices[i].label || i + 1} — glisser pour déplacer` });
      m.on('dragend', async () => {
        const q = get(); const nl = m.getLatLng();
        const xy = crs.transform('EPSG:4326', q.crsId, [nl.lng, nl.lat]);
        const vs = q.vertices.map((/** @type {any} */ v, /** @type {number} */ k) => (k === i ? { ...v, x: xy[0], y: xy[1], accuracy: null, moved: true } : v));
        await saveVertices(vs, `Déplacement du sommet ${q.vertices[i].label || i + 1}`);
        toast('Sommet déplacé sur la carte (précision du pointé limitée à l’échelle d’affichage).', 'info');
      });
      m.addTo(draft);
    });
  };

  // ---------------- onglets
  const TABS = [
    { id: 'gps', label: 'GPS', ic: 'locate' },
    { id: 'manual', label: 'Sommets', ic: 'list' },
    { id: 'import', label: 'Import', ic: 'upload' },
    { id: 'draw', label: 'Dessin', ic: 'polygon' },
  ];
  const paintTabs = () => mount(tabs, TABS.map((t) => h('button.tab', { type: 'button', role: 'tab', 'aria-selected': String(t.id === tab), onclick: () => { tab = t.id; paintTabs(); paintTab(); } }, icon(t.ic), h('span', null, t.label))));
  const paintTab = () => {
    tabCleanup?.(); tabCleanup = null;
    M.setClickHandler(null);
    if (tab === 'gps') tabCleanup = tabGps(body, get, saveVertices);
    else if (tab === 'import') tabImport(body, get, saveVertices);
    else if (tab === 'draw') tabCleanup = tabDraw(body, get, saveVertices);
    else tabManual(body, get, saveVertices);
    anim.panelIn(body);
  };

  const p0 = get();
  const title = h('h3.editor-title', null, p0.name || 'Parcelle');
  const rename = h('button.icon-btn', { type: 'button', title: 'Renommer', 'aria-label': 'Renommer', onclick: async () => {
    const n = await promptDialog('Renommer la parcelle', 'Nom', get().name || '');
    if (n) { await updateFeature({ ...get(), name: n }, 'Renommage'); title.textContent = n; }
  } }, icon('edit'));
  const actions = h('div.btn-grid', null,
    btn('Rapport PDF', { variant: 'primary', onclick: async () => {
      try {
        const { parcelReportPDF } = await import('../io/office.js');
        const p = get();
        const blob = await parcelReportPDF(p, state.project, { angleUnit: state.settings.angleUnit === 'grad' ? 'grad' : 'deg', reportCrsId: crs.getCrs(p.crsId).kind === 'projected' ? null : projSel.value });
        await shareOrSave(blob, `${safeName(p.name)}-rapport.pdf`);
      } catch (e) { toast(/** @type {Error} */ (e).message, 'error', 6000); }
    } }, 'file'),
    btn('Exporter', { variant: 'ghost', onclick: () => exportDialog([get()], 'dxf', get().name) }, 'download'),
    btn('Voir sur la carte', { variant: 'ghost', onclick: () => get().vertices.length && M.zoomToFeature(get()) }, 'map'),
    btn('Supprimer', { variant: 'ghost-danger', onclick: () => deleteParcel(get()) }, 'trash'),
  );
  const undo = h('button.icon-btn', { type: 'button', title: 'Annuler', 'aria-label': 'Annuler', onclick: async () => { const l = await state.history.undo(); if (l) toast(`Annulé : ${l}`); } }, icon('undo'));
  const redo = h('button.icon-btn', { type: 'button', title: 'Rétablir', 'aria-label': 'Rétablir', onclick: async () => { const l = await state.history.redo(); if (l) toast(`Rétabli : ${l}`); } }, icon('redo'));

  mount(root,
    summary,
    h('div.editor-head', null, h('button.icon-btn', { type: 'button', 'aria-label': 'Retour à la liste', title: 'Retour à la liste', onclick: () => { location.hash = '#/parcels'; } }, icon('back')), title, rename, h('span.spacer'), undo, redo),
    h('div.muted.small', null, `Sommets en ${crs.getCrs(p0.crsId).label} (${crs.getCrs(p0.crsId).epsg ? 'EPSG:' + crs.getCrs(p0.crsId).epsg : ''})`),
    results, issues, tabs, body, sides, between, actions,
  );
  paintTabs(); paintTab(); paintResults(); paintMap();
  if (p0.vertices.length) M.zoomToFeature(p0);
  projSel.addEventListener('change', paintResults);
  const off = on('features', () => { if (!get()) { location.hash = '#/parcels'; return; } paintResults(); paintMap(); if (tab === 'manual') tabManual(body, get, saveVertices, true); });
  const off2 = on('settings', (s) => { if (s.areaUnit || s.angleUnit) paintResults(); });
  const offDatum = on('datum', () => { paintResults(); paintMap(); });
  return () => { off(); off2(); offDatum(); tabCleanup?.(); M.setClickHandler(null); draft.clearLayers(); };
}

// ---------------- Onglet A : GPS
/** @param {HTMLElement} el @param {()=>any} get @param {(v:any[], l:string)=>Promise<void>} save */
function tabGps(el, get, save) {
  state.gps.start();
  const info = h('div.gps-card');
  const avg = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: state.settings.avgEnabled }));
  avg.addEventListener('change', () => updateSettings({ avgEnabled: avg.checked }));
  const prog = h('div.avg-progress', { hidden: true });
  /** @type {AbortController|null} */ let ctl = null;
  const paint = () => {
    const f = state.gps.last; const q = accuracyQuality(f?.accuracy);
    info.className = `gps-card st-${state.gps.state}`;
    mount(info, h('div.gps-line', null, h(`span.badge.q-${q.level}`, null, f ? `±${f.accuracy.toFixed(1)} m` : '—'), h('span', null, state.gps.message)));
  };
  state.gps.addEventListener('fix', paint); state.gps.addEventListener('state', paint); paint();
  const add = btn('Ajouter le sommet à ma position', { variant: 'primary', onclick: async () => {
    const g = state.gps;
    if (!g.last || g.age() > 10) { toast('Pas de position GPS récente.', 'warn'); return; }
    let fix = { lat: g.last.lat, lon: g.last.lon, accuracy: g.last.accuracy };
    if (avg.checked) {
      ctl = new AbortController(); prog.hidden = false; /** @type {HTMLButtonElement} */ (add).disabled = true;
      const txt = h('span'); mount(prog, txt, btn('Arrêter', { variant: 'ghost', onclick: () => ctl?.abort() }, 'stop'));
      try {
        const r = await averagePosition(g, { durationS: state.settings.avgDuration, maxAccuracy: state.settings.avgMaxAcc, signal: ctl.signal, onProgress: (p) => { txt.textContent = `${Math.floor(p.elapsed)} / ${state.settings.avgDuration} s · ${p.accepted} retenue(s)`; } });
        fix = { lat: r.lat, lon: r.lon, accuracy: r.accuracy };
      } catch (e) { if (/** @type {any} */ (e).name !== 'AbortError') toast(/** @type {Error} */ (e).message, 'error', 6000); prog.hidden = true; /** @type {HTMLButtonElement} */ (add).disabled = false; return; }
      prog.hidden = true; /** @type {HTMLButtonElement} */ (add).disabled = false;
    }
    const p = get();
    const xy = crs.transform('EPSG:4326', p.crsId, [fix.lon, fix.lat]);
    const label = `S${p.vertices.length + 1}`;
    await save([...p.vertices, { x: xy[0], y: xy[1], label, accuracy: fix.accuracy, at: new Date().toISOString() }], `Sommet ${label} (GPS)`);
    toast(`Sommet ${label} ajouté (±${fix.accuracy.toFixed(1)} m).`, 'ok');
    if (state.settings.vibrate) navigator.vibrate?.(60);
  } }, 'pin');
  add.classList.add('btn-big');
  mount(el, h('p.small', null, 'Placez-vous sur chaque sommet, dans l’ordre du contour, puis touchez « Ajouter ». Le polygone se ferme automatiquement entre le dernier et le premier sommet.'),
    info, h('label.switch', null, avg, h('span', null, `Attendre une meilleure précision (≤ ${state.settings.avgMaxAcc} m, ${state.settings.avgDuration} s)`)), prog, add,
    btn('Retirer le dernier sommet', { variant: 'ghost', onclick: async () => { const p = get(); if (p.vertices.length) await save(p.vertices.slice(0, -1), 'Retrait du dernier sommet'); } }, 'undo'));
  return () => { ctl?.abort(); state.gps.removeEventListener('fix', paint); state.gps.removeEventListener('state', paint); state.gps.stop(); };
}

// ---------------- Onglet B : tableau des sommets
/** @param {HTMLElement} el @param {()=>any} get @param {(v:any[], l:string)=>Promise<void>} save @param {boolean} [refreshOnly] */
function tabManual(el, get, save, refreshOnly = false) {
  const p = get(); if (!p) return;
  const c = crs.getCrs(p.crsId);
  if (refreshOnly && el.contains(document.activeElement)) return; // ne pas perturber une saisie en cours
  const geo = c.kind === 'geographic';
  const dec = c.unit === 'm' ? 3 : 8;
  /** @param {number} i @param {'a'|'b'} which @param {string} val */
  const setCoord = async (i, which, val) => {
    const q = get();
    const n = geo ? parseAngle(val) : parseNumber(val);
    if (!Number.isFinite(n)) { toast('Valeur illisible.', 'error'); paintRows(); return; }
    const v = { ...q.vertices[i] };
    // ordre de saisie : géographique = lat (a) / lon (b) ; projeté = X (a) / Y (b)
    if (geo) { if (which === 'a') v.y = n; else v.x = n; } else if (which === 'a') v.x = n; else v.y = n;
    v.accuracy = null;
    await save(q.vertices.map((/** @type {any} */ o, /** @type {number} */ k) => (k === i ? v : o)), `Modification du sommet ${v.label || i + 1}`);
  };
  const tbody = h('tbody');
  const paintRows = () => {
    const q = get();
    mount(tbody, q.vertices.map((/** @type {any} */ v, /** @type {number} */ i) => {
      const [a, b] = crs.xyToInput(q.crsId, [v.x, v.y]);
      const ia = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'decimal', value: a.toFixed(dec), 'aria-label': `${c.axes[0]} sommet ${i + 1}` }));
      const ib = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'decimal', value: b.toFixed(dec), 'aria-label': `${c.axes[1]} sommet ${i + 1}` }));
      const il = /** @type {HTMLInputElement} */ (h('input.lbl', { type: 'text', value: v.label ?? String(i + 1), 'aria-label': `Numéro du sommet ${i + 1}` }));
      const id = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: v.desc ?? '', placeholder: '—', 'aria-label': `Description du sommet ${i + 1}` }));
      ia.addEventListener('change', () => setCoord(i, 'a', ia.value));
      ib.addEventListener('change', () => setCoord(i, 'b', ib.value));
      il.addEventListener('change', async () => { const q2 = get(); await save(q2.vertices.map((/** @type {any} */ o, /** @type {number} */ k) => (k === i ? { ...o, label: il.value.trim() } : o)), 'Renumérotation'); });
      id.addEventListener('change', async () => { const q2 = get(); await save(q2.vertices.map((/** @type {any} */ o, /** @type {number} */ k) => (k === i ? { ...o, desc: id.value.trim() } : o)), 'Description du sommet'); });
      const move = async (/** @type {number} */ d) => { const q2 = get(); const j = i + d; if (j < 0 || j >= q2.vertices.length) return; const vs = q2.vertices.slice(); [vs[i], vs[j]] = [vs[j], vs[i]]; await save(vs, 'Réordonnancement'); };
      return h('tr', null, h('td', null, il), h('td', null, ia), h('td', null, ib), h('td', null, id),
        h('td.acts', null,
          h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Monter', title: 'Monter', onclick: () => move(-1), disabled: i === 0 }, icon('up')),
          h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Descendre', title: 'Descendre', onclick: () => move(1), disabled: i === q.vertices.length - 1 }, icon('down')),
          h('button.icon-btn.sm.danger', { type: 'button', 'aria-label': 'Supprimer le sommet', title: 'Supprimer', onclick: async () => { const q2 = get(); await save(q2.vertices.filter((/** @type {any} */ _, /** @type {number} */ k) => k !== i), `Suppression du sommet ${v.label || i + 1}`); } }, icon('trash'))));
    }));
  };
  if (refreshOnly) { paintRows(); return; }
  // ligne d'ajout
  const na = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'decimal', placeholder: c.axes[0], 'aria-label': `${c.axes[0]} du nouveau sommet` }));
  const nb = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'decimal', placeholder: c.axes[1], 'aria-label': `${c.axes[1]} du nouveau sommet` }));
  const nl = /** @type {HTMLInputElement} */ (h('input.lbl', { type: 'text', placeholder: 'N°', 'aria-label': 'Numéro du nouveau sommet' }));
  const addMsg = h('div.coord-msg');
  const addRow = async () => {
    const a = geo ? parseAngle(na.value) : parseNumber(na.value);
    const b = geo ? parseAngle(nb.value) : parseNumber(nb.value);
    const xy = crs.inputToXY(p.crsId, a, b);
    const chk = crs.checkCoordinate(p.crsId, xy);
    addMsg.className = 'coord-msg';
    if (!chk.ok) { addMsg.classList.add('err'); mount(addMsg, ...chk.errors.map((e) => h('p', null, e))); anim.shake(na.parentElement ?? na); return; }
    if (chk.warnings.length) { addMsg.classList.add('warn'); mount(addMsg, ...chk.warnings.map((e) => h('p', null, e))); } else mount(addMsg);
    const q = get();
    await save([...q.vertices, { x: xy[0], y: xy[1], label: nl.value.trim() || String(q.vertices.length + 1) }], 'Ajout de sommet');
    na.value = ''; nb.value = ''; nl.value = ''; na.focus();
  };
  [na, nb, nl].forEach((i) => i.addEventListener('keydown', (e) => { if (/** @type {KeyboardEvent} */ (e).key === 'Enter') { e.preventDefault(); addRow(); } }));
  paintRows();
  mount(el,
    h('p.small', null, c.axisNote),
    h('div.table-wrap', null, h('table.tbl.vtx', null,
      h('thead', null, h('tr', null, h('th', null, 'N°'), h('th', null, `${c.axes[0]}`), h('th', null, `${c.axes[1]}`), h('th', null, 'Description'), h('th', null, ''))),
      tbody,
      h('tfoot', null, h('tr', null, h('td', null, nl), h('td', null, na), h('td', null, nb), h('td', { colspan: 2 }, btn('Ajouter', { variant: 'primary', onclick: addRow }, 'plus')))))),
    addMsg,
  );
}

// ---------------- Onglet C : import
/** @param {HTMLElement} el @param {()=>any} get @param {(v:any[], l:string, e?:any)=>Promise<void>} save */
function tabImport(el, get, save) {
  mount(el, h('p.small', null, 'Importez les sommets depuis un fichier CSV (colonnes configurables), GeoJSON, KML ou GPX. Le système de coordonnées du fichier vous est demandé.'),
    btn('Choisir un fichier…', { variant: 'primary', onclick: async () => {
      const imp = await importWizard({ accept: '.csv,.txt,.geojson,.json,.kml,.gpx' });
      if (!imp) return;
      const p = get();
      const pts = imp.items.flatMap((it) => (it.type === 'point' ? [{ x: it.x, y: it.y, label: it.name, desc: it.description || '' }] : it.vertices.map((/** @type {any} */ v, /** @type {number} */ k) => ({ ...v, label: String(k + 1) }))));
      if (!p.vertices.length) {
        await save(pts, 'Import de sommets', { crsId: imp.crsId });
      } else {
        const conv = pts.map((v) => { const xy = crs.transform(imp.crsId, p.crsId, [v.x, v.y]); return { ...v, x: xy[0], y: xy[1] }; });
        await save([...p.vertices, ...conv], 'Import de sommets');
      }
      toast(`${pts.length} sommet(s) importé(s).`, 'ok');
      M.zoomToFeature(get());
    } }, 'upload'));
}

// ---------------- Onglet D : dessin
/** @param {HTMLElement} el @param {()=>any} get @param {(v:any[], l:string)=>Promise<void>} save */
function tabDraw(el, get, save) {
  M.setClickHandler(async (e) => {
    const p = get();
    const xy = crs.transform('EPSG:4326', p.crsId, [e.latlng.lng, e.latlng.lat]);
    await save([...p.vertices, { x: xy[0], y: xy[1], label: String(p.vertices.length + 1), drawn: true }], 'Sommet dessiné');
  });
  mount(el, h('p.small', null, 'Touchez la carte pour ajouter les sommets dans l’ordre du contour. Faites glisser un sommet pour le déplacer. La précision dépend du zoom et du fond de carte : ce mode convient à une estimation, pas à un levé.'),
    btn('Retirer le dernier sommet', { variant: 'ghost', onclick: async () => { const p = get(); if (p.vertices.length) await save(p.vertices.slice(0, -1), 'Retrait du dernier sommet'); } }, 'undo'),
    btn('Terminer le dessin', { variant: 'primary', onclick: () => { M.setClickHandler(null); location.hash = `#/parcels/${get().id}/manual`; } }, 'check'));
  return () => M.setClickHandler(null);
}

void fmtNum; void formatCoord; void selected;
