// @ts-check
/** Boîte à outils cartographique : mesures, convertisseur, recherche, couches, légende, historique. */
import * as crs from '../core/crs.js';
import { polygonArea, inverse, densify } from '../core/geodesy.js';
import { formatArea, formatLength, formatCoord } from '../core/units.js';
import { formatBearing, toDMS } from '../core/angles.js';
import * as db from '../services/storage.js';
import { declination } from '../services/compass.js';
import { state, on, updateSettings, POINT_CODES, addFeature, nextPointNumber } from '../state.js';
import { BASEMAPS } from '../map/basemaps.js';
import * as M from '../map/map.js';
import { h, icon, btn, mount, toast, field, select } from './dom.js';
import { coordInput, crsInfo } from './coordinput.js';
import { startNavigation } from './nav.js';
import { anim } from './anim.js';

const L = M.L;

const TOOLS = [
  { id: 'measure-dist', label: 'Mesurer une distance', ic: 'ruler' },
  { id: 'measure-area', label: 'Mesurer une superficie', ic: 'polygon' },
  { id: 'convert', label: 'Convertir des coordonnées', ic: 'swap' },
  { id: 'search', label: 'Rechercher', ic: 'search' },
  { id: 'layers', label: 'Couches et fonds', ic: 'layers' },
  { id: 'legend', label: 'Légende', ic: 'list' },
  { id: 'history', label: 'Historique des mesures', ic: 'history' },
  { id: 'magnetic', label: 'Déclinaison magnétique', ic: 'compass' },
];

/** @param {HTMLElement} root @param {string} [sub] */
export function render(root, sub) {
  if (sub === 'measure-dist') return measure(root, 'dist');
  if (sub === 'measure-area') return measure(root, 'area');
  if (sub === 'convert') return converter(root);
  if (sub === 'search') return search(root);
  if (sub === 'layers') return layers(root);
  if (sub === 'legend') return legend(root);
  if (sub === 'history') return history(root);
  if (sub === 'magnetic') return magnetic(root);
  mount(root, h('div.tool-grid', null, TOOLS.map((t) => h('a.tool-tile', { href: `#/tools/${t.id}`, 'data-stagger': '' }, icon(t.ic), h('span', null, t.label)))));
  anim.screenIn(root);
}

const back = () => h('button.link-btn.back', { type: 'button', onclick: () => { location.hash = '#/tools'; } }, icon('back'), 'Outils');

// ------------------------------------------------------------- Mesures
/** @param {HTMLElement} root @param {'dist'|'area'} mode */
function measure(root, mode) {
  /** @type {{lat:number, lon:number}[]} */ let pts = [];
  const lay = M.layer('measures');
  const out = h('div.results');
  const segs = h('div.small');
  const ang = /** @type {any} */ (state.settings.angleUnit);
  const paint = () => {
    lay.clearLayers();
    pts.forEach((p, i) => L.circleMarker([p.lat, p.lon], { pane: 'measures', radius: 6, color: '#fff', weight: 2, fillColor: '#e07b16', fillOpacity: 1 }).bindTooltip(String(i + 1), { permanent: true, direction: 'top', className: 'vx-tip' }).addTo(lay));
    if (pts.length >= 2) {
      const line = [];
      for (let i = 0; i < pts.length - 1; i++) line.push(...densify(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon, 8));
      if (mode === 'area' && pts.length >= 3) { L.polygon(pts.map((p) => [p.lat, p.lon]), { pane: 'measures', color: '#e07b16', weight: 2.5, dashArray: '6 6', fillOpacity: 0.15 }).addTo(lay); }
      else L.polyline(line, { pane: 'measures', color: '#e07b16', weight: 3, dashArray: '6 6' }).addTo(lay);
    }
    let total = 0;
    const rows = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const v = inverse(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon);
      total += v.distance;
      rows.push(h('div', null, `${i + 1}→${i + 2} : ${formatLength(v.distance)} · azimut ${formatBearing(v.azimuth, ang === 'grad' ? 'grad' : 'deg', 2)}`));
    }
    if (mode === 'area' && pts.length >= 3) {
      const r = polygonArea(pts);
      mount(out, h('div.big-grid', null, h('div.big-figure', null, h('div.eyebrow', null, 'Superficie'), h('div.value', null, formatArea(r.area, /** @type {any} */ (state.settings.areaUnit))), h('div.sub', null, formatArea(r.area, 'haaca'))),
        h('div.big-figure', null, h('div.eyebrow', null, 'Périmètre'), h('div.value', null, formatLength(r.perimeter)))),
      h('p.small.muted', null, 'Calcul géodésique sur l’ellipsoïde WGS 84. Mesure indicative : la précision dépend du pointé sur la carte.'));
    } else {
      mount(out, h('div.big-figure', null, h('div.eyebrow', null, mode === 'dist' ? 'Distance totale' : 'Superficie'), h('div.value', null, mode === 'dist' ? formatLength(total) : '—')),
        h('p.small.muted', null, mode === 'dist' ? 'Distance géodésique (ellipsoïde WGS 84), sommée par segment.' : 'Ajoutez au moins 3 points.'));
    }
    mount(segs, rows);
  };
  M.setClickHandler((e) => { pts.push({ lat: e.latlng.lat, lon: e.latlng.lng }); paint(); });
  const save = btn('Enregistrer dans l’historique', { variant: 'ghost', onclick: async () => {
    if (pts.length < 2) return;
    const r = mode === 'area' && pts.length >= 3 ? polygonArea(pts) : null;
    let total = 0; for (let i = 0; i < pts.length - 1; i++) total += inverse(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon).distance;
    await db.addMeasure({ kind: mode, points: pts, distance: total, area: r?.area ?? null, perimeter: r?.perimeter ?? null });
    toast('Mesure enregistrée dans l’historique.', 'ok');
  } }, 'history');
  const asParcel = mode === 'area' ? btn('Créer une parcelle', { variant: 'ghost', onclick: async () => {
    if (pts.length < 3) return;
    const rec = await addFeature({ type: 'parcel', name: 'Parcelle mesurée', crsId: 'EPSG:4326', method: 'auto', source: 'draw', vertices: pts.map((p, i) => ({ x: p.lon, y: p.lat, label: String(i + 1), drawn: true })) }, 'Parcelle depuis mesure');
    location.hash = `#/parcels/${rec.id}/manual`;
  } }, 'polygon') : null;
  const asLine = mode === 'dist' ? btn('Enregistrer comme ligne', { variant: 'ghost', onclick: async () => {
    if (pts.length < 2) return;
    await addFeature({ type: 'line', name: `Ligne ${new Date().toLocaleTimeString('fr-FR')}`, crsId: 'EPSG:4326', source: 'draw', vertices: pts.map((p, i) => ({ x: p.lon, y: p.lat, label: String(i + 1) })) }, 'Ligne');
    toast('Ligne ajoutée au projet.', 'ok');
  } }, 'line') : null;
  mount(root, back(), h('p.small', null, 'Touchez la carte pour placer les points de mesure.'), out, segs,
    h('div.btn-grid', null, btn('Retirer le dernier point', { variant: 'ghost', onclick: () => { pts.pop(); paint(); } }, 'undo'), btn('Effacer', { variant: 'ghost', onclick: () => { pts = []; paint(); } }, 'trash'), save, asParcel, asLine));
  paint();
  return () => { M.setClickHandler(null); lay.clearLayers(); };
}

// ------------------------------------------------------------- Convertisseur
/** @param {HTMLElement} root */
function converter(root) {
  const out = h('div.conv-out');
  const ci = coordInput({ crsId: state.settings.inputCrs, onChange: () => run() });
  const run = () => {
    const r = ci.read();
    if (!r.ok || !r.check?.wgs84 || !r.xy) { mount(out); return; }
    const w = r.check.wgs84;
    const rows = crs.CRS_LIST.map((c) => {
      try {
        const xy = crs.transform(r.crsId, c.id, /** @type {[number,number]} */ (r.xy));
        const [a, b] = crs.xyToInput(c.id, xy);
        const inZone = crs.inBBox(c.bbox, w.lon, w.lat, 0.1);
        return h(`tr${inZone ? '' : '.dim'}`, null, h('th', null, c.label, h('small', null, ` EPSG:${c.epsg}`)), h('td.num', null, formatCoord(a, c.unit)), h('td.num', null, formatCoord(b, c.unit)), h('td', null, inZone ? '' : 'hors zone'));
      } catch { return null; }
    });
    mount(out, h('div.table-wrap', null, h('table.tbl', null, h('thead', null, h('tr', null, h('th', null, 'Système'), h('th', null, '1re valeur'), h('th', null, '2e valeur'), h('th', null, ''))), h('tbody', null, rows))),
      h('p.small', null, `WGS 84 DMS : ${toDMS(w.lat, 3, ['N', 'S'])} ${toDMS(w.lon, 3, ['E', 'O'])}`),
      h('p.small.muted', null, 'Ordre : latitude puis longitude pour les systèmes géographiques ; X (Est) puis Y (Nord) pour les projections.'),
      h('div.btn-grid', null,
        btn('Voir sur la carte', { variant: 'ghost', onclick: () => { M.getMap().setView([w.lat, w.lon], 18); M.popup(w.lat, w.lon, h('div', null, 'Point converti')); } }, 'map'),
        btn('Aller à ce point', { variant: 'primary', onclick: () => startNavigation({ lat: w.lat, lon: w.lon, name: 'Point converti', crsId: r.crsId, x: /** @type {any} */ (r.xy)[0], y: /** @type {any} */ (r.xy)[1] }) }, 'target')));
  };
  mount(root, back(), ci.el, out);
}

// ------------------------------------------------------------- Recherche
/** @param {HTMLElement} root */
function search(root) {
  const q = /** @type {HTMLInputElement} */ (h('input', { type: 'search', placeholder: 'Lieu (ex. Ifrane) ou coordonnées « 34.02, -6.85 »', enterkeyhint: 'search' }));
  const res = h('div.search-res');
  const go = async () => {
    const s = q.value.trim(); if (!s) return;
    const m = s.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (m) {
      const a = Number(m[1].replace(',', '.')), b = Number(m[2].replace(',', '.'));
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) { M.getMap().setView([a, b], 17); M.popup(a, b, h('div', null, `${a}, ${b} (WGS 84)`)); return; }
      toast('Coordonnées en mètres : utilisez « Convertir des coordonnées » ou « Aller à un point » en choisissant le système.', 'info', 6000);
      return;
    }
    if (!navigator.onLine) { toast('Recherche de lieux indisponible hors connexion.', 'warn'); return; }
    mount(res, h('p.muted', null, 'Recherche…'));
    try {
      // Nominatim (OSM) : 1 requête max par seconde, pas d'autocomplétion (politique d'usage)
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=ma,eh&accept-language=fr&q=${encodeURIComponent(s)}`;
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data.length) { mount(res, h('p.empty', null, 'Aucun résultat.')); return; }
      mount(res, data.map((/** @type {any} */ d) => h('button.item.as-btn', { type: 'button', onclick: () => { M.getMap().setView([Number(d.lat), Number(d.lon)], 15); } }, icon('pin'), h('div.item-main', null, h('div.item-title', null, d.name || d.display_name.split(',')[0]), h('div.item-sub', null, d.display_name)))),
        h('p.small.muted', null, 'Résultats © contributeurs OpenStreetMap (Nominatim).'));
    } catch (e) { mount(res, h('p.err', null, `Recherche impossible : ${/** @type {Error} */ (e).message}`)); }
  };
  q.addEventListener('keydown', (e) => { if (/** @type {KeyboardEvent} */ (e).key === 'Enter') go(); });
  mount(root, back(), h('div.row', null, q, btn('', { variant: 'primary', onclick: go, 'aria-label': 'Rechercher' }, 'search')), res);
  setTimeout(() => q.focus(), 100);
}

// ------------------------------------------------------------- Couches
/** @param {HTMLElement} root */
function layers(root) {
  const names = /** @type {Record<string,string>} */ ({ parcels: 'Parcelles', lines: 'Lignes', points: 'Points levés', nav: 'Cible de navigation', measures: 'Mesures temporaires' });
  const paint = () => {
    const order = state.settings.layerOrder;
    mount(root, back(),
      h('fieldset.group', null, h('legend', null, 'Fond de carte'),
        [['satellite', 'Satellite'], ['plan', 'Plans'], ['autre', 'Autres']].map(([g, gl]) => h('div.bm-group', null, h('div.eyebrow', null, gl), BASEMAPS.filter((b) => b.group === g).map((b) => {
          const r = /** @type {HTMLInputElement} */ (h('input', { type: 'radio', name: 'bm', value: b.id, checked: state.settings.basemap === b.id }));
          r.addEventListener('change', () => { updateSettings({ basemap: b.id }).then(paint); });
          return h('label.radio', null, r, h('span', null, b.label));
        }))),
        state.settings.basemap === 'custom' ? customForm() : null,
        h('p.small.muted', null, 'Satellite : au Maroc, l’imagerie Esri existe jusqu’au zoom 18 en zone rurale (19 en ville). Au-delà, l’application agrandit automatiquement la meilleure image disponible au lieu d’afficher une zone grise. Aucun fond n’est une référence cadastrale ; hors connexion, utilisez « Sans fond ».')),
      h('fieldset.group', null, h('legend', null, 'Couches (de haut en bas)'),
        order.map((k, i) => {
          const cb = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: /** @type {any} */ (state.settings.layers)[k] }));
          cb.addEventListener('change', () => updateSettings({ layers: { ...state.settings.layers, [k]: cb.checked } }));
          const mv = (/** @type {number} */ d) => { const o = order.slice(); const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; updateSettings({ layerOrder: o }).then(paint); };
          return h('div.layer-row', null, h('label.switch', null, cb, h('span', null, names[k])), h('span.spacer'),
            h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Monter', onclick: () => mv(-1), disabled: i === 0 }, icon('up')),
            h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Descendre', onclick: () => mv(1), disabled: i === order.length - 1 }, icon('down')));
        }),
        ['nav', 'measures'].map((k) => {
          const cb = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: /** @type {any} */ (state.settings.layers)[k] }));
          cb.addEventListener('change', () => updateSettings({ layers: { ...state.settings.layers, [k]: cb.checked } }));
          return h('div.layer-row', null, h('label.switch', null, cb, h('span', null, names[k])));
        })),
      h('div.btn-grid', null, btn('Emprise du projet', { variant: 'ghost', onclick: () => M.zoomToAll() }, 'expand'), btn('Emprise initiale (Maroc)', { variant: 'ghost', onclick: () => M.zoomInitial() }, 'globe')),
    );
  };
  paint();
}

/** Formulaire du fond personnalisé (URL XYZ fournie par l'utilisateur). */
function customForm() {
  const c = /** @type {any} */ (state.settings).customBasemap ?? {};
  const url = /** @type {HTMLInputElement} */ (h('input', { type: 'url', value: c.url ?? '', placeholder: 'https://…/{z}/{x}/{y}.png', inputmode: 'url', spellcheck: false }));
  const label = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: c.label ?? '', placeholder: 'ex. Orthophoto commune' }));
  const mz = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min: 10, max: 22, value: c.maxNativeZoom ?? 19 }));
  const att = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: c.attribution ?? '', placeholder: 'Attribution exigée par le fournisseur' }));
  return h('div.custom-bm', null,
    field('Adresse des tuiles (XYZ)', url, 'Modèle avec {z}, {x}, {y} (et éventuellement {s}). Utilisez uniquement un service dont la licence vous y autorise (clé personnelle, orthophoto fournie par un organisme…).'),
    h('div.coord-pair', null, field('Nom', label), field('Zoom natif max.', mz)), field('Attribution', att),
    btn('Appliquer ce fond', { variant: 'primary', onclick: async () => {
      const u = url.value.trim();
      if (!/^https:\/\//.test(u) || !/\{z\}/.test(u) || !/\{x\}/.test(u) || !/\{y\}/.test(u)) { toast('Adresse invalide : HTTPS avec {z}, {x} et {y} requis.', 'error'); return; }
      await updateSettings({ customBasemap: { url: u, label: label.value.trim(), maxNativeZoom: Number(mz.value) || 19, attribution: att.value.trim() } });
      toast('Fond personnalisé appliqué.', 'ok');
    } }, 'check'));
}

// ------------------------------------------------------------- Légende
/** @param {HTMLElement} root */
function legend(root) {
  mount(root, back(),
    h('ul.legend', null,
      h('li', null, h('span.lg.parcel'), 'Parcelle enregistrée (étiquette : superficie)'),
      h('li', null, h('span.lg.owned'), 'Lot attribué à une personne (couleur de la personne, nom, superficie, part)'),
      h('li', null, h('span.lg.divided'), 'Parcelle d’origine partagée (contour tireté)'),
      h('li', null, h('span.lg.parcel-bad'), 'Parcelle à corriger (géométrie invalide)'),
      h('li', null, h('span.lg.draft'), 'Parcelle en cours d’édition, sommets numérotés'),
      h('li', null, h('span.lg.line'), 'Ligne'),
      h('li', null, h('span.lg.measure'), 'Mesure temporaire'),
      h('li', null, h('span.lg.target'), 'Cible de navigation et rayon d’arrivée'),
      h('li', null, h('span.lg.gps'), 'Ma position GPS et cercle de précision'),
      POINT_CODES.map((c) => h('li', null, h(`span.dot${c.ref ? '.sq' : ''}`, { style: { '--c': c.color } }), c.label, c.ref ? ' (point de référence)' : ''))));
}

// ------------------------------------------------------------- Historique
/** @param {HTMLElement} root */
async function history(root) {
  const list = await db.listMeasures(50);
  mount(root, back(), list.length ? list.map((m) => h('div.item', null, icon(m.kind === 'area' ? 'polygon' : 'ruler'),
    h('div.item-main', { role: 'button', tabindex: 0, onclick: () => { const lay = M.layer('measures'); lay.clearLayers(); const ll = m.points.map((/** @type {any} */ p) => [p.lat, p.lon]); (m.kind === 'area' ? L.polygon(ll, { pane: 'measures', color: '#e07b16' }) : L.polyline(ll, { pane: 'measures', color: '#e07b16' })).addTo(lay); M.getMap().fitBounds(L.latLngBounds(ll), { padding: [40, 40] }); } },
      h('div.item-title', null, m.kind === 'area' ? formatArea(m.area, /** @type {any} */ (state.settings.areaUnit)) : formatLength(m.distance)),
      h('div.item-sub', null, `${m.points.length} points · ${new Date(m.createdAt).toLocaleString('fr-FR')}`)))) : h('p.empty', null, 'Aucune mesure enregistrée.'),
  list.length ? btn('Vider l’historique', { variant: 'ghost-danger', onclick: async () => { await db.clearMeasures(); history(root); } }, 'trash') : null);
}

// ------------------------------------------------------------- Déclinaison
/** @param {HTMLElement} root */
async function magnetic(root) {
  const c = M.getMap().getCenter();
  const f = state.gps.last;
  const lat = f?.lat ?? c.lat, lon = f?.lon ?? c.lng;
  const d = await declination(lat, lon);
  const lz = crs.bestLambertZone(lon, lat);
  const conv = lz ? crs.gridConvergence(lz, lon, lat) : null;
  mount(root, back(),
    h('div.big-figure', null, h('div.eyebrow', null, 'Déclinaison magnétique'), h('div.value', null, `${d.value >= 0 ? '+' : ''}${d.value.toFixed(2)}°`), h('div.sub', null, d.value < 0 ? 'Le nord magnétique est à l’ouest du nord géographique' : 'Le nord magnétique est à l’est du nord géographique')),
    conv != null ? h('div.big-figure', null, h('div.eyebrow', null, `Convergence des méridiens (${crs.getCrs(/** @type {string} */ (lz)).label})`), h('div.value', null, `${conv >= 0 ? '+' : ''}${conv.toFixed(3)}°`), h('div.sub', null, 'Angle entre le nord géographique et le nord de la grille')) : null,
    h('p.small', null, `Au point ${lat.toFixed(4)}°, ${lon.toFixed(4)}° (${f ? 'position GPS' : 'centre de la carte'}) le ${new Date().toLocaleDateString('fr-FR')}. Modèle WMM 2025 (NOAA/NGA), valide 2025–2030${d.valid ? '' : ' — HORS période de validité'}.`),
    h('p.small.muted', null, 'Azimut vrai = cap magnétique + déclinaison. Gisement (grille) = azimut vrai − convergence.'));
}

void field; void select; void crsInfo; void nextPointNumber; void on;
