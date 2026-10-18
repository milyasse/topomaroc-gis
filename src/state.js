// @ts-check
/** État global de l'application, réglages persistants et opérations sur les entités (avec annulation). */
import * as db from './services/storage.js';
import { History } from './services/history.js';
import { GpsTracker } from './services/gps.js';
import * as crs from './core/crs.js';

export const POINT_CODES = [
  { value: 'borne', label: 'Borne', color: '#d6402a', ref: true },
  { value: 'angle', label: 'Angle de parcelle', color: '#e07b16', ref: false },
  { value: 'repere', label: 'Point de référence', color: '#7a3db8', ref: true },
  { value: 'batiment', label: 'Bâtiment', color: '#5b6573', ref: false },
  { value: 'arbre', label: 'Arbre', color: '#2c8a3e', ref: false },
  { value: 'route', label: 'Route / piste', color: '#8a6d3b', ref: false },
  { value: 'limite', label: 'Limite', color: '#0f6fb0', ref: false },
  { value: 'puits', label: 'Puits / source', color: '#1a9bb5', ref: false },
  { value: 'poteau', label: 'Poteau / réseau', color: '#9b9b2a', ref: false },
  { value: 'cloture', label: 'Clôture / mur', color: '#a0522d', ref: false },
  { value: 'cible', label: 'Point atteint (navigation)', color: '#c2185b', ref: false },
  { value: 'divers', label: 'Divers', color: '#4a5a6a', ref: false },
];
/** @param {string} code */
export const codeInfo = (code) => POINT_CODES.find((c) => c.value === code) ?? { value: code, label: code || '—', color: '#4a5a6a', ref: false };

export const DEFAULT_SETTINGS = {
  theme: 'auto', contrast: false, inputCrs: 'EPSG:26191', displayCrs: 'EPSG:26191',
  angleUnit: 'deg', areaUnit: 'm2', basemap: 'osm', sound: true, vibrate: true,
  arrivalRadius: 10, avgEnabled: false, avgMaxAcc: 8, avgDuration: 20,
  lastProjectId: null, merchichCustom: null, lang: 'fr',
  layers: { parcels: true, lines: true, points: true, nav: true, measures: true },
  layerOrder: ['parcels', 'lines', 'points'],
  onboarded: false,
  /** Système de projection choisi automatiquement selon la zone de navigation (v1.3). */
  autoCrs: true,
  autoFamily: /** @type {'lambert'|'utm'} */ ('lambert'),
  projectLayers: /** @type {Record<string, {on?:boolean, points?:boolean, parcels?:boolean, lines?:boolean, color?:string|null}>} */ ({}),
  customBasemap: /** @type {null|{url:string,label?:string,maxNativeZoom?:number,attribution?:string}} */ (null),
};

export const state = {
  /** @type {typeof DEFAULT_SETTINGS} */ settings: structuredClone(DEFAULT_SETTINGS),
  /** @type {any} */ project: null,
  /** @type {any[]} */ features: [],
  /** @type {{ lat:number, lon:number, name:string, crsId:string, x:number, y:number }|null} */ navTarget: null,
  history: new History(),
  gps: new GpsTracker(),
  bus: new EventTarget(),
};

/** @param {string} type @param {any} [detail] */
export function emit(type, detail) { state.bus.dispatchEvent(new CustomEvent(type, { detail })); }
/** @param {string} type @param {(d:any)=>void} fn */
export function on(type, fn) {
  const l = (/** @type {any} */ e) => fn(e.detail);
  state.bus.addEventListener(type, l);
  return () => state.bus.removeEventListener(type, l);
}

export async function loadSettings() {
  const saved = await db.getSetting('settings', {});
  state.settings = { ...structuredClone(DEFAULT_SETTINGS), ...saved, layers: { ...DEFAULT_SETTINGS.layers, ...(saved?.layers ?? {}) } };
  applyDatumSettings();
}
/** @param {Partial<typeof DEFAULT_SETTINGS>} patch */
export async function updateSettings(patch) {
  Object.assign(state.settings, patch);
  await db.setSetting('settings', state.settings);
  if ('merchichCustom' in patch) { applyDatumSettings(); emit('datum'); }
  emit('settings', patch);
}
function applyDatumSettings() {
  const c = /** @type {any} */ (state.settings.merchichCustom);
  try {
    if (c && Array.isArray(c.params)) crs.setMerchichShift(c.params, c.convention, c.label || 'Paramètres personnalisés');
    else crs.setMerchichShift(null);
  } catch { crs.setMerchichShift(null); }
}

// ------------------------------------------------------------- Projets
/** @param {string|null} id */
export async function openProject(id) {
  const p = id ? await db.getProject(id) : null;
  state.project = p ?? null;
  state.features = p ? await db.listFeatures(p.id) : [];
  state.history.clear();
  await updateSettings({ lastProjectId: p?.id ?? null });
  emit('project', state.project);
  emit('features', state.features);
  return p;
}

/** @param {{ name: string, date?: string, notes?: string, crsId?: string }} data */
export async function createProject(data) {
  const p = await db.saveProject({ id: db.uid('p-'), name: data.name, date: data.date ?? new Date().toISOString().slice(0, 10), notes: data.notes ?? '', crsId: data.crsId ?? state.settings.inputCrs });
  await openProject(p.id);
  return p;
}

/** Projet courant, créé automatiquement s'il n'existe pas. */
export async function ensureProject() {
  if (state.project) return state.project;
  const d = new Date();
  return createProject({ name: `Levé du ${d.toLocaleDateString('fr-FR')}` });
}

/** @param {any} patch */
export async function updateProject(patch) {
  if (!state.project) return;
  state.project = await db.saveProject({ ...state.project, ...patch });
  emit('project', state.project);
}

// ------------------------------------------------------------- Entités (avec historique)
async function reload() {
  state.features = state.project ? await db.listFeatures(state.project.id) : [];
  emit('features', state.features);
}

/** @param {any} f @param {string} label */
export async function addFeature(f, label = 'Ajout') {
  const p = await ensureProject();
  const rec = await db.saveFeature({ id: db.uid('f-'), projectId: p.id, ...f });
  await reload();
  state.history.push({
    label,
    undo: async () => { await db.deleteFeature(rec.id); await reload(); },
    redo: async () => { await db.saveFeature(rec); await reload(); },
  });
  return rec;
}

/** @param {any} f @param {string} label */
export async function updateFeature(f, label = 'Modification') {
  const before = await db.getFeature(f.id);
  const rec = await db.saveFeature(f);
  await reload();
  state.history.push({
    label,
    undo: async () => { await db.saveFeature(before); await reload(); },
    redo: async () => { await db.saveFeature(rec); await reload(); },
  });
  return rec;
}

/** @param {string} id @param {string} label */
export async function removeFeature(id, label = 'Suppression') {
  const before = await db.deleteFeature(id);
  await reload();
  if (before) {
    state.history.push({
      label,
      undo: async () => { await db.saveFeature(before); await reload(); },
      redo: async () => { await db.deleteFeature(id); await reload(); },
    });
  }
  return before;
}

/** Prochain numéro de point du projet. */
export function nextPointNumber() {
  let max = 0;
  for (const f of state.features) if (f.type === 'point') { const n = parseInt(String(f.num), 10); if (Number.isFinite(n)) max = Math.max(max, n); }
  return String(max + 1);
}
