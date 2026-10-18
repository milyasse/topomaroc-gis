// @ts-check
/**
 * Gestion de la carte Leaflet : fonds, couches métier, position GPS, lecture des coordonnées.
 * Leaflet affiche en Web Mercator (EPSG:3857) à partir de coordonnées WGS 84 ; toutes les
 * données métier sont transformées en WGS 84 via core/crs.js avant affichage.
 */
import * as L from '../../vendor/leaflet/leaflet.mjs';
import { BASEMAPS } from './basemaps.js';
import * as crs from '../core/crs.js';
import { densify } from '../core/geodesy.js';
import { formatCoord, formatArea } from '../core/units.js';
import { toDMS } from '../core/angles.js';
import { verticesLL, analyze } from '../io/common.js';
import { state, on, codeInfo, emit } from '../state.js';

export { L };

export const MOROCCO_BOUNDS = L.latLngBounds([20.7, -17.2], [35.95, -1.0]);

/** @type {L.Map} */ let map;
/** @type {L.TileLayer|null} */ let base = null;
/** @type {Record<string, L.LayerGroup>} */ const groups = {};
/** @type {((e: any) => void)|null} */ let clickHandler = null;
let tileErrors = 0;
let tileWarned = false;

const PANES = { parcels: 410, lines: 420, points: 430, nav: 440, measures: 450, draft: 460, gps: 470 };

/** @param {HTMLElement} el */
export function initMap(el) {
  map = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true, maxZoom: 22, tapTolerance: 18, preferCanvas: false });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  for (const [name, z] of Object.entries(PANES)) { const p = map.createPane(name); p.style.zIndex = String(z); }
  for (const name of Object.keys(PANES)) groups[name] = L.layerGroup().addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft', maxWidth: 140 }).addTo(map);
  map.fitBounds(L.latLngBounds([30.5, -10.5], [35.95, -1.0]));
  setBasemap(state.settings.basemap);
  applyLayerSettings();

  map.on('click', (e) => { if (clickHandler) clickHandler(e); else showPointInfo(e.latlng); });
  map.on('mousemove', (e) => emit('cursor', { lat: e.latlng.lat, lon: e.latlng.lng, source: 'cursor' }));
  map.on('moveend', () => { const c = map.getCenter(); emit('cursor', { lat: c.lat, lon: c.lng, source: 'center' }); });

  on('features', () => renderFeatures());
  on('settings', (p) => { if (p.basemap) setBasemap(p.basemap); if (p.layers || p.layerOrder) applyLayerSettings(); if (p.areaUnit) renderFeatures(); });
  on('datum', () => renderFeatures());
  state.gps.addEventListener('fix', (e) => updateGps(/** @type {any} */ (e).detail));
  state.gps.addEventListener('state', () => { if (state.gps.state === 'idle') groups.gps.clearLayers(); });
  return map;
}

export function getMap() { return map; }

// ------------------------------------------------------------- Fonds de carte
/** @param {string} id */
export function setBasemap(id) {
  const def = BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
  if (base) map.removeLayer(base);
  base = null;
  tileErrors = 0; tileWarned = false;
  document.body.classList.toggle('no-basemap', !def.url);
  if (!def.url) return;
  base = L.tileLayer(def.url, { ...def.options, detectRetina: false });
  base.on('tileerror', () => {
    tileErrors++;
    if (tileErrors >= 6 && !tileWarned) {
      tileWarned = true;
      emit('tile-error', { id: def.id, offline: !navigator.onLine });
    }
  });
  base.on('tileload', () => { if (tileErrors > 0) tileErrors--; });
  base.addTo(map);
  base.bringToBack();
}

/** Visibilité et ordre des couches. */
export function applyLayerSettings() {
  const { layers, layerOrder } = state.settings;
  for (const [k, g] of Object.entries(groups)) {
    if (k in layers) {
      const visible = /** @type {any} */ (layers)[k];
      if (visible && !map.hasLayer(g)) g.addTo(map);
      if (!visible && map.hasLayer(g)) map.removeLayer(g);
    }
  }
  layerOrder.forEach((name, i) => { const p = map.getPane(name); if (p) p.style.zIndex = String(410 + (layerOrder.length - 1 - i) * 10); });
}

// ------------------------------------------------------------- Rendu des entités
const esc = (/** @type {any} */ s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));

/** Icône de point selon le code (carré pour les points de référence). @param {any} f */
function pointIcon(f) {
  const ci = codeInfo(f.code);
  const shape = ci.ref ? 'sq' : 'ci';
  return L.divIcon({
    className: 'pt-icon',
    html: `<span class="pt-mark pt-${shape}" style="--c:${ci.color}"></span><span class="pt-label">${esc(f.num || f.name || '')}</span>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
  });
}

export function renderFeatures() {
  if (!map) return;
  groups.parcels.clearLayers(); groups.lines.clearLayers(); groups.points.clearLayers();
  for (const f of state.features) {
    try {
      if (f.type === 'point') {
        const m = L.marker([f.wgs84.lat, f.wgs84.lon], { icon: pointIcon(f), pane: 'points', keyboard: true, title: `Point ${f.num || f.name || ''}` });
        m.on('click', (e) => { L.DomEvent.stopPropagation(e); emit('feature-click', f); });
        m.addTo(groups.points);
      } else if (f.type === 'parcel' && f.vertices.length >= 2) {
        const ll = verticesLL(f).map(([lon, lat]) => L.latLng(lat, lon));
        const a = f.vertices.length >= 3 ? analyze(f) : null;
        const poly = L.polygon(ll, { pane: 'parcels', color: a && !a.valid ? '#c62828' : '#0f5e9c', weight: 2.5, fillColor: '#2f86c8', fillOpacity: 0.15 });
        if (a?.valid) poly.bindTooltip(`<b>${esc(f.name || 'Parcelle')}</b><br>${formatArea(a.area, /** @type {any} */ (state.settings.areaUnit))}`, { permanent: true, direction: 'center', className: 'parcel-label' });
        poly.on('click', (e) => { L.DomEvent.stopPropagation(e); emit('feature-click', f); });
        poly.addTo(groups.parcels);
      } else if (f.type === 'line' && f.vertices.length >= 2) {
        const ll = verticesLL(f).map(([lon, lat]) => L.latLng(lat, lon));
        L.polyline(ll, { pane: 'lines', color: '#1e78c8', weight: 3 }).on('click', (e) => { L.DomEvent.stopPropagation(e); emit('feature-click', f); }).addTo(groups.lines);
      }
    } catch (err) { console.warn('Rendu impossible', f.id, err); }
  }
}

/** Marges de cadrage tenant compte du panneau ouvert (bas sur mobile, gauche sur ordinateur). */
function fitPadding() {
  const sheet = document.getElementById('sheet');
  const open = sheet && !sheet.hidden;
  if (!open) return { paddingTopLeft: L.point(40, 40), paddingBottomRight: L.point(40, 40) };
  if (window.matchMedia('(min-width: 900px)').matches) return { paddingTopLeft: L.point(sheet.offsetWidth + 40, 40), paddingBottomRight: L.point(70, 40) };
  return { paddingTopLeft: L.point(30, 30), paddingBottomRight: L.point(70, sheet.offsetHeight + 24) };
}

/** Centre la carte sur une entité. @param {any} f */
export function zoomToFeature(f) {
  if (f.type === 'point') {
    map.setView([f.wgs84.lat, f.wgs84.lon], Math.max(map.getZoom(), 18));
    const pad = fitPadding();
    map.panBy(L.point((pad.paddingTopLeft.x - pad.paddingBottomRight.x) / -2, (pad.paddingBottomRight.y - pad.paddingTopLeft.y) / 2), { animate: false });
  } else map.fitBounds(L.latLngBounds(verticesLL(f).map(([lon, lat]) => L.latLng(lat, lon))), { ...fitPadding(), maxZoom: 20 });
}

/** Emprise de toutes les entités du projet. */
export function zoomToAll() {
  const pts = [];
  for (const f of state.features) {
    if (f.type === 'point') pts.push(L.latLng(f.wgs84.lat, f.wgs84.lon));
    else verticesLL(f).forEach(([lon, lat]) => pts.push(L.latLng(lat, lon)));
  }
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { ...fitPadding(), maxZoom: 19 });
  else map.fitBounds(MOROCCO_BOUNDS);
}
export function zoomInitial() { map.fitBounds(MOROCCO_BOUNDS); }

// ------------------------------------------------------------- GPS
/** @type {L.CircleMarker|null} */ let gpsDot = null;
/** @type {L.Circle|null} */ let gpsCircle = null;
let followGps = false;
/** @param {any} f */
function updateGps(f) {
  const ll = L.latLng(f.lat, f.lon);
  if (!gpsDot) {
    gpsCircle = L.circle(ll, { radius: f.accuracy, pane: 'gps', color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.12, interactive: false }).addTo(groups.gps);
    gpsDot = L.circleMarker(ll, { radius: 8, pane: 'gps', color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(groups.gps);
    gpsDot.bindTooltip('Ma position', { direction: 'top' });
  }
  if (!map.hasLayer(gpsDot)) { gpsDot.addTo(groups.gps); gpsCircle?.addTo(groups.gps); }
  gpsDot.setLatLng(ll);
  gpsCircle?.setLatLng(ll).setRadius(f.accuracy);
  if (followGps) map.panTo(ll, { animate: true });
}
/** @param {boolean} v */
export function setFollow(v) { followGps = v; }
export function recenterOnGps() {
  const f = state.gps.last;
  if (!f) return false;
  map.setView([f.lat, f.lon], Math.max(map.getZoom(), 18));
  return true;
}

// ------------------------------------------------------------- Navigation (ligne vers la cible)
/** @type {L.Marker|null} */ let targetMarker = null;
/** @type {L.Polyline|null} */ let navLine = null;
/** @type {L.Circle|null} */ let radiusCircle = null;
/** @param {{lat:number, lon:number, name:string}|null} target @param {number} radius */
export function setNavTarget(target, radius) {
  groups.nav.clearLayers(); targetMarker = null; navLine = null; radiusCircle = null;
  if (!target) return;
  targetMarker = L.marker([target.lat, target.lon], {
    pane: 'nav', icon: L.divIcon({ className: 'target-icon', html: `<span class="target-flag"></span><span class="pt-label">${esc(target.name)}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
  }).addTo(groups.nav);
  radiusCircle = L.circle([target.lat, target.lon], { radius, pane: 'nav', color: '#c2185b', weight: 1.5, dashArray: '6 6', fill: false, interactive: false }).addTo(groups.nav);
}
/** @param {number} r */
export function setNavRadius(r) { radiusCircle?.setRadius(r); }
/** @param {{lat:number, lon:number}|null} from @param {{lat:number, lon:number}|null} to */
export function updateNavLine(from, to) {
  if (!from || !to) { if (navLine) { groups.nav.removeLayer(navLine); navLine = null; } return; }
  const pts = densify(from.lat, from.lon, to.lat, to.lon, 24);
  if (!navLine) navLine = L.polyline(pts, { pane: 'nav', color: '#c2185b', weight: 3, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(groups.nav);
  else navLine.setLatLngs(pts);
}
/** @param {{lat:number, lon:number}} a @param {{lat:number, lon:number}} b */
export function fitTwo(a, b) { map.fitBounds(L.latLngBounds([[a.lat, a.lon], [b.lat, b.lon]]), { ...fitPadding(), maxZoom: 19 }); }

// ------------------------------------------------------------- Couches temporaires
/** @param {'measures'|'draft'} name */
export function layer(name) { return groups[name]; }

/** Gestionnaire de clic temporaire (outils de mesure, dessin). @param {((e: any)=>void)|null} fn */
export function setClickHandler(fn) {
  clickHandler = fn;
  map.getContainer().classList.toggle('crosshair', !!fn);
}

// ------------------------------------------------------------- Coordonnées au clic
/**
 * Coordonnées d'un point WGS 84 dans les principaux systèmes (affichage).
 * @param {number} lat @param {number} lon
 */
export function coordinateTable(lat, lon) {
  const rows = [];
  rows.push({ label: 'WGS 84 (décimal)', value: `${lat.toFixed(7)}°, ${lon.toFixed(7)}°` });
  rows.push({ label: 'WGS 84 (DMS)', value: `${toDMS(lat, 2, ['N', 'S'])} ${toDMS(lon, 2, ['E', 'O'])}` });
  const lz = crs.bestLambertZone(lon, lat);
  const disp = state.settings.displayCrs;
  const ids = new Set([disp, lz, `EPSG:326${crs.utmZoneFor(lon)}`].filter(Boolean));
  for (const id of ids) {
    if (!id) continue;
    let c; try { c = crs.getCrs(id); } catch { continue; }
    if (c.kind !== 'projected') continue;
    try {
      const [x, y] = crs.fromWGS84(id, lon, lat);
      const warn = c.datum === 'merchich' && !crs.merchichShiftValidAt(lon, lat) ? ' ⚠' : '';
      rows.push({ label: c.label + warn, value: `X ${formatCoord(x, 'm')}  Y ${formatCoord(y, 'm')}`, id, x, y });
    } catch { /* hors domaine */ }
  }
  return rows;
}

/** @param {L.LatLng} ll */
function showPointInfo(ll) {
  emit('map-info', { lat: ll.lat, lon: ll.lng });
}

/** Ouvre une bulle sur la carte. @param {number} lat @param {number} lon @param {HTMLElement} content */
export function popup(lat, lon, content) {
  return L.popup({ maxWidth: 340, className: 'info-popup', autoPanPadding: [20, 80] }).setLatLng([lat, lon]).setContent(content).openOn(map);
}
export function closePopup() { map.closePopup(); }
export function invalidate() { setTimeout(() => map?.invalidateSize(), 60); }
