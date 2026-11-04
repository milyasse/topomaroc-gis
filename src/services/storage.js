// @ts-check
/**
 * Stockage local IndexedDB : projets, entités (points, lignes, parcelles, cibles),
 * photos, réglages, historique des mesures. Aucune donnée n'est envoyée sur un serveur.
 */

const DB_NAME = 'topomaroc-gis';
const DB_VERSION = 1;
export const BACKUP_FORMAT = 'topomaroc-backup';
export const BACKUP_VERSION = 1;

/** @type {Promise<IDBDatabase>|null} */
let dbp = null;

/** @param {IDBFactory} [factory] */
export function openDB(factory = globalThis.indexedDB) {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!factory) { reject(new Error('IndexedDB indisponible : le stockage local est désactivé dans ce navigateur (navigation privée ?).')); return; }
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('features')) {
        const s = db.createObjectStore('features', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('measures')) {
        const s = db.createObjectStore('measures', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base locale bloquée par un autre onglet de TopoMaroc : fermez-le et rechargez.'));
  });
  return dbp;
}

/** @template T @param {IDBRequest<T>} req @returns {Promise<T>} */
function wrap(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
/** @param {IDBTransaction} tx */
function done(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(undefined); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}
/** @param {string} store @param {IDBTransactionMode} mode */
async function os(store, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

export function uid(prefix = '') {
  const r = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix + r;
}

// ---------- Projets ----------
/** @returns {Promise<any[]>} */
export async function listProjects() {
  const all = await wrap((await os('projects')).getAll());
  return all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
/** @param {string} id */
export async function getProject(id) { return wrap((await os('projects')).get(id)); }
/** @param {any} p */
export async function saveProject(p) {
  const now = new Date().toISOString();
  const rec = { createdAt: now, ...p, updatedAt: now };
  await wrap((await os('projects', 'readwrite')).put(rec));
  return rec;
}
/** Supprime un projet et toutes ses entités et photos. @param {string} id */
export async function deleteProject(id) {
  const db = await openDB();
  const tx = db.transaction(['projects', 'features', 'photos'], 'readwrite');
  const feats = await wrap(tx.objectStore('features').index('projectId').getAll(id));
  for (const f of feats) {
    tx.objectStore('features').delete(f.id);
    if (f.photoId) tx.objectStore('photos').delete(f.photoId);
  }
  tx.objectStore('projects').delete(id);
  await done(tx);
  return feats.length;
}

// ---------- Entités ----------
/** @param {string} projectId */
export async function listFeatures(projectId) {
  const r = await wrap((await os('features')).index('projectId').getAll(projectId));
  return r.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}
/** @param {string} id */
export async function getFeature(id) { return wrap((await os('features')).get(id)); }
/** @param {any} f */
export async function saveFeature(f) {
  const now = new Date().toISOString();
  const rec = { createdAt: now, ...f, updatedAt: now };
  await wrap((await os('features', 'readwrite')).put(rec));
  touchProject(rec.projectId);
  return rec;
}
/** @param {string} id */
export async function deleteFeature(id) {
  const f = await getFeature(id);
  if (!f) return null;
  await wrap((await os('features', 'readwrite')).delete(id));
  touchProject(f.projectId);
  return f;
}
/** @param {string} projectId */
async function touchProject(projectId) {
  const p = await getProject(projectId);
  if (p) await wrap((await os('projects', 'readwrite')).put({ ...p, updatedAt: new Date().toISOString() }));
}

// ---------- Photos ----------
/** @param {Blob} blob @returns {Promise<string>} */
export async function savePhoto(blob) {
  const id = uid('ph-');
  await wrap((await os('photos', 'readwrite')).put({ id, blob, type: blob.type, createdAt: new Date().toISOString() }));
  return id;
}
/** @param {string} id @returns {Promise<Blob|null>} */
export async function getPhoto(id) { const r = await wrap((await os('photos')).get(id)); return r ? r.blob : null; }
/** @param {string} id */
export async function deletePhoto(id) { await wrap((await os('photos', 'readwrite')).delete(id)); }

// ---------- Réglages ----------
/** @param {string} key @param {any} [fallback] */
export async function getSetting(key, fallback = null) {
  const r = await wrap((await os('settings')).get(key));
  return r ? r.value : fallback;
}
/** @param {string} key @param {any} value */
export async function setSetting(key, value) { await wrap((await os('settings', 'readwrite')).put({ key, value })); }

// ---------- Historique des mesures ----------
/** @param {any} m */
export async function addMeasure(m) {
  const rec = { id: uid('m-'), createdAt: new Date().toISOString(), ...m };
  await wrap((await os('measures', 'readwrite')).put(rec));
  return rec;
}
export async function listMeasures(limit = 50) {
  const all = await wrap((await os('measures')).getAll());
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
export async function clearMeasures() { await wrap((await os('measures', 'readwrite')).clear()); }

// ---------- Sauvegarde complète ----------
/** @param {Blob} blob @returns {Promise<string>} */
function blobToDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
/** @param {string} url */
async function dataURLToBlob(url) { return (await fetch(url)).blob(); }

/**
 * Exporte un ou tous les projets (avec entités, photos et réglages) en JSON.
 * @param {string[]|null} projectIds null = tous
 */
export async function exportBackup(projectIds = null) {
  const projects = (await listProjects()).filter((p) => !projectIds || projectIds.includes(p.id));
  const features = [];
  const photos = [];
  for (const p of projects) {
    for (const f of await listFeatures(p.id)) {
      features.push(f);
      if (f.photoId) {
        const b = await getPhoto(f.photoId);
        if (b) photos.push({ id: f.photoId, type: b.type, data: await blobToDataURL(b) });
      }
    }
  }
  const settings = await wrap((await os('settings')).getAll());
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, app: 'TopoMaroc GIS',
    exportedAt: new Date().toISOString(), projects, features, photos, settings,
  };
}

/**
 * Restaure une sauvegarde. Les projets dont l'identifiant existe déjà sont importés
 * sous de nouveaux identifiants (aucun écrasement).
 * @param {any} data @param {{ restoreSettings?: boolean }} [opts]
 */
export async function importBackup(data, opts = {}) {
  if (!data || data.format !== BACKUP_FORMAT) throw new Error('Ce fichier n’est pas une sauvegarde TopoMaroc GIS.');
  if (data.version > BACKUP_VERSION) throw new Error('Sauvegarde créée par une version plus récente de l’application.');
  const existing = new Set((await listProjects()).map((p) => p.id));
  /** @type {Record<string,string>} */ const pmap = {};
  /** @type {Record<string,string>} */ const phmap = {};
  for (const ph of data.photos || []) {
    phmap[ph.id] = await savePhoto(await dataURLToBlob(ph.data));
  }
  const db = await openDB();
  const tx = db.transaction(['projects', 'features', 'settings'], 'readwrite');
  for (const p of data.projects || []) {
    const id = existing.has(p.id) ? uid('p-') : p.id;
    pmap[p.id] = id;
    tx.objectStore('projects').put({ ...p, id, name: existing.has(p.id) ? `${p.name} (restauré)` : p.name });
  }
  let nf = 0;
  for (const f of data.features || []) {
    if (!pmap[f.projectId]) continue;
    tx.objectStore('features').put({ ...f, id: existing.has(f.projectId) ? uid('f-') : f.id, projectId: pmap[f.projectId], photoId: f.photoId ? phmap[f.photoId] ?? null : null });
    nf++;
  }
  if (opts.restoreSettings) for (const s of data.settings || []) tx.objectStore('settings').put(s);
  await done(tx);
  return { projects: Object.keys(pmap).length, features: nf, photos: Object.keys(phmap).length, idMap: pmap };
}

/** Demande un stockage persistant (évite l'effacement automatique par le navigateur). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch { return false; }
}

export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.(); } catch { return null; }
}
