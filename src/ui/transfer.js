// @ts-check
/** Assistants d'importation et d'exportation (choix du SRC, correspondance des colonnes). */
import * as crs from '../core/crs.js';
import { parseCSV, guessMapping, guessCoordinateKind, rowsToPoints, toCSV } from '../io/csv.js';
import { parseGeoJSON, geojsonToItems, parseKmlGpx, toGeoJSON, toKML, toGPX, toDXF } from '../io/formats.js';
import { crsSidecar, safeName, stamp } from '../io/common.js';
import { state, addFeature, ensureProject, nextPointNumber, openProject, updateSettings } from '../state.js';
import { zoneAt } from '../core/zones.js';
import * as db from '../services/storage.js';
import { parseAngle, parseNumber } from '../core/angles.js';
import { h, icon, mount, toast, field, select, modal, saveFile, pickFile, shareOrSave } from './dom.js';
import { crsSelect, crsInfo } from './coordinput.js';
import * as M from '../map/map.js';

export const IMPORT_ACCEPT = '.csv,.txt,.tsv,.geojson,.json,.kml,.gpx';

/**
 * Sélection d'un fichier puis analyse : renvoie des éléments géométriques avec leur SRC
 * confirmé par l'utilisateur, ou null si annulé.
 * @param {{ accept?: string, purpose?: 'any'|'vertices' }} [opts]
 * @returns {Promise<null | { crsId: string, items: any[], fileName: string }>}
 */
export async function importWizard(opts = {}) {
  const file = await pickFile(opts.accept ?? IMPORT_ACCEPT);
  if (!file) return null;
  const text = await file.text();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'json') {
      const j = JSON.parse(text);
      if (j?.format === db.BACKUP_FORMAT) { await restoreBackup(j); return null; }
    }
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return await csvDialog(text, file.name);
    if (ext === 'geojson' || ext === 'json') {
      const g = parseGeoJSON(text);
      return await crsDialogForGeo(g.features, g.declaredCrs, file.name, true);
    }
    if (ext === 'kml' || ext === 'gpx') {
      const g = await parseKmlGpx(text, /** @type {any} */ (ext));
      // KML et GPX sont par définition en WGS 84 (lon/lat)
      return { crsId: 'EPSG:4326', items: geojsonToItems(g.features, 'EPSG:4326'), fileName: file.name };
    }
    toast('Format non pris en charge. Formats acceptés : CSV, TXT, GeoJSON, KML, GPX, sauvegarde JSON.', 'error', 6000);
  } catch (e) {
    toast(`Lecture impossible : ${/** @type {Error} */ (e).message}`, 'error', 7000);
  }
  return null;
}

/** @param {string} text @param {string} fileName */
async function csvDialog(text, fileName) {
  const p = parseCSV(text);
  if (!p.rows.length) throw new Error('Fichier vide ou sans ligne de données.');
  const m = guessMapping(p.fields);
  const opts = [{ value: '', label: '— aucune —' }, ...p.fields.map((f) => ({ value: f, label: f }))];
  const sx = select(opts, m.x ?? ''), sy = select(opts, m.y ?? ''), sn = select(opts, m.name ?? ''), sc = select(opts, m.code ?? ''), sd = select(opts, m.desc ?? '');
  const values = () => p.rows.slice(0, 200).map((r) => /** @type {[number,number]} */ ([parseNumber(r[sx.value]) || parseAngle(r[sx.value]), parseNumber(r[sy.value]) || parseAngle(r[sy.value])]));
  let guess = guessCoordinateKind(values());
  const cs = crsSelect(guess.suggestion ?? (guess.kind === 'utm' ? 'EPSG:32629' : 'EPSG:26191'));
  const confirmBox = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox' }));
  const hint = h('div.coord-msg.warn');
  const preview = h('div.table-wrap');
  const swap = h('button.link-btn', { type: 'button', onclick: () => { const t = sx.value; sx.value = sy.value; sy.value = t; refresh(); } }, icon('swap'), 'Inverser X et Y');
  const refresh = () => {
    guess = guessCoordinateKind(values());
    const c = crs.getCrs(cs.value);
    hint.replaceChildren(h('p', null, icon('info'), `Analyse : ${guess.reason}`), h('p', null, `Colonne X = ${c.kind === 'geographic' ? 'longitude' : 'Est (m)'}, colonne Y = ${c.kind === 'geographic' ? 'latitude' : 'Nord (m)'}.`));
    const r = rowsToPoints(p.rows.slice(0, 6), { name: sn.value || null, x: sx.value, y: sy.value }, cs.value);
    mount(preview, h('table.tbl', null, h('thead', null, h('tr', null, h('th', null, 'Nom'), h('th', null, 'X'), h('th', null, 'Y'), h('th', null, 'WGS 84'))),
      h('tbody', null, r.points.map((pt) => h('tr', null, h('td', null, pt.name), h('td', null, String(pt.x)), h('td', null, String(pt.y)), h('td', null, `${pt.wgs84.lat.toFixed(5)}, ${pt.wgs84.lon.toFixed(5)}${pt.warnings.length ? ' ⚠' : ''}`))))),
    r.errors.length ? h('p.small.err', null, r.errors.slice(0, 3).join(' ')) : null);
  };
  [sx, sy, sn, cs].forEach((s) => s.addEventListener('change', refresh));
  refresh();
  const ok = await modal({ title: `Importer « ${fileName} »`, wide: true, body: () => [
    h('p.small', null, `${p.rows.length} ligne(s) · séparateur « ${p.delimiter === '\t' ? 'tabulation' : p.delimiter} »`),
    h('div.grid3', null, field('Colonne X / Est / Longitude', sx), field('Colonne Y / Nord / Latitude', sy), field('Nom / numéro', sn), field('Code', sc), field('Description', sd)),
    swap,
    field('Système de coordonnées du fichier', cs, 'Le système ne peut pas être déterminé avec certitude à partir des valeurs : choisissez-le explicitement (zone Lambert, fuseau UTM…).'),
    hint, preview,
    h('label.switch', null, confirmBox, h('span', null, 'Je confirme le système de coordonnées choisi')),
  ], actions: [{ label: 'Annuler', value: false }, { label: 'Importer', value: true, variant: 'primary' }] });
  if (!ok) return null;
  if (!confirmBox.checked) { toast('Import annulé : confirmez le système de coordonnées.', 'warn'); return null; }
  if (!sx.value || !sy.value) { toast('Choisissez les colonnes X et Y.', 'error'); return null; }
  const r = rowsToPoints(p.rows, { name: sn.value || null, x: sx.value, y: sy.value, code: sc.value || null, desc: sd.value || null }, cs.value);
  if (r.errors.length) toast(`${r.errors.length} ligne(s) ignorée(s) : ${r.errors[0]}`, 'warn', 7000);
  if (!r.points.length) { toast('Aucun point valide.', 'error'); return null; }
  return { crsId: cs.value, fileName, items: r.points.map((pt) => ({ type: 'point', name: pt.name, code: pt.code, description: pt.desc, x: pt.x, y: pt.y, z: pt.z })) };
}

/**
 * @param {any[]} features @param {string|null} declared @param {string} fileName @param {boolean} isGeoJSON
 */
async function crsDialogForGeo(features, declared, fileName, isGeoJSON) {
  if (!features.length) throw new Error('Aucune géométrie dans le fichier.');
  const items = geojsonToItems(features, 'EPSG:4326');
  const sample = items.flatMap((it) => (it.type === 'point' ? [[it.x, it.y]] : it.vertices.map((/** @type {any} */ v) => [v.x, v.y]))).slice(0, 200);
  const guess = guessCoordinateKind(/** @type {any} */ (sample));
  // RFC 7946 : sans membre « crs », le GeoJSON est en WGS 84 — on le confirme si les valeurs sont des degrés.
  let def = declared ?? (guess.kind === 'degrees' ? 'EPSG:4326' : null);
  try { if (def) crs.getCrs(def); } catch { def = null; }
  if (def && (declared || guess.kind === 'degrees')) {
    if (!declared && isGeoJSON) toast('GeoJSON sans système déclaré : WGS 84 (RFC 7946) retenu.', 'info');
    return { crsId: def, items, fileName };
  }
  const cs = crsSelect(guess.kind === 'utm' ? 'EPSG:32629' : 'EPSG:26191');
  const ok = await modal({ title: `Système de « ${fileName} »`, body: () => [
    h('p', null, `Le fichier ne déclare pas de système reconnu. ${guess.reason}`),
    field('Système de coordonnées du fichier', cs),
  ], actions: [{ label: 'Annuler', value: false }, { label: 'Importer', value: true, variant: 'primary' }] });
  if (!ok) return null;
  return { crsId: cs.value, items, fileName };
}

/** Ajoute les éléments importés au projet courant. @param {{crsId:string, items:any[], fileName:string}} imp */
export async function addImportedToProject(imp) {
  await ensureProject();
  let np = 0, nz = 0;
  const pointsAsParcel = imp.items.every((i) => i.type === 'point') && imp.items.length >= 3;
  let asParcel = false;
  if (pointsAsParcel) {
    asParcel = await modal({ title: 'Type d’import', body: () => h('p', null, `${imp.items.length} points lus. Les importer comme points de levé, ou comme sommets d’une nouvelle parcelle (dans l’ordre du fichier) ?`),
      actions: [{ label: 'Points', value: false }, { label: 'Sommets de parcelle', value: true, variant: 'primary' }], dismissValue: false });
  }
  if (asParcel) {
    await addFeature({ type: 'parcel', name: imp.fileName.replace(/\.[^.]+$/, ''), crsId: imp.crsId, method: 'auto', source: 'import',
      vertices: imp.items.map((i, k) => ({ x: i.x, y: i.y, label: i.name || String(k + 1), desc: i.description || '' })) }, 'Import parcelle');
    toast('Parcelle importée.', 'ok');
    M.zoomToAll();
    return;
  }
  for (const it of imp.items) {
    try {
      if (it.type === 'point') {
        const w = crs.toWGS84(imp.crsId, [it.x, it.y]);
        await addFeature({ type: 'point', num: it.name && /^\d+$/.test(it.name) ? it.name : nextPointNumber(), name: it.name ?? '', code: it.code ?? 'divers', description: it.description ?? '',
          wgs84: { lat: w.lat, lon: w.lon }, input: { crsId: imp.crsId, x: it.x, y: it.y }, accuracy: null, altitude: it.z ?? null, source: 'import', takenAt: new Date().toISOString() }, 'Import');
        np++;
      } else {
        await addFeature({ type: it.type, name: it.name, code: it.code ?? '', description: it.description ?? '', crsId: imp.crsId, method: 'auto', source: 'import',
          vertices: it.vertices.map((/** @type {any} */ v, /** @type {number} */ k) => ({ x: v.x, y: v.y, label: String(k + 1) })) }, 'Import');
        nz++;
      }
    } catch (e) { console.warn(e); }
  }
  toast(`Import terminé : ${np} point(s), ${nz} ligne(s)/parcelle(s).`, 'ok');
  M.zoomToAll();
}

/** @param {any} data */
async function restoreBackup(data) {
  const n = (data.projects || []).length;
  const ok = await modal({ title: 'Restaurer une sauvegarde', body: () => h('p', null, `Cette sauvegarde du ${new Date(data.exportedAt).toLocaleString('fr-FR')} contient ${n} projet(s) et ${(data.features || []).length} entité(s). Les projets existants ne seront pas écrasés.`),
    actions: [{ label: 'Annuler', value: false }, { label: 'Restaurer', value: true, variant: 'primary' }] });
  if (!ok) return;
  const r = await db.importBackup(data);
  toast(`Restauration : ${r.projects} projet(s), ${r.features} entité(s), ${r.photos} photo(s).`, 'ok', 6000);
  const first = Object.values(r.idMap)[0];
  if (first) await openProject(first);
}

// ------------------------------------------------------------- Export
export const EXPORT_FORMATS = [
  { value: 'geojson', label: 'GeoJSON', sub: 'SIG · WGS 84', ext: '.geojson', ic: 'globe', proj: false },
  { value: 'geojson-proj', label: 'GeoJSON projeté', sub: 'QGIS · Lambert / UTM', ext: '.geojson', ic: 'globe', proj: true },
  { value: 'kml', label: 'KML', sub: 'Google Earth · WGS 84', ext: '.kml', ic: 'map', proj: false },
  { value: 'gpx', label: 'GPX', sub: 'GPS · WGS 84', ext: '.gpx', ic: 'locate', proj: false },
  { value: 'csv', label: 'CSV', sub: 'Tableur, SIG', ext: '.csv', ic: 'list', proj: true },
  { value: 'csv-fr', label: 'CSV Excel français', sub: 'Séparateur ; et virgule', ext: '.csv', ic: 'list', proj: true },
  { value: 'xlsx', label: 'XLSX', sub: 'Excel', ext: '.xlsx', ic: 'grid', proj: true },
  { value: 'dxf', label: 'DXF', sub: 'AutoCAD / Covadis', ext: '.dxf', ic: 'polygon', proj: true },
  { value: 'pdf-sheet', label: 'PDF', sub: 'Fiche de levé', ext: '.pdf', ic: 'file', proj: true },
];

/** Système projeté proposé pour exporter des entités : leur zone (projection automatique), sinon le système affiché. @param {any[]} features */
export function exportCrsFor(features) {
  const own = features.map((f) => (f.type === 'point' ? f.input?.crsId : f.crsId)).find((id) => id && crs.getCrs(id).kind === 'projected');
  if (state.settings.autoCrs) {
    const p = features.find((f) => f.type === 'point' && f.wgs84);
    const z = p ? zoneAt(p.wgs84.lon, p.wgs84.lat, /** @type {any} */ (state.settings).autoFamily ?? 'lambert') : null;
    if (z) return z;
    if (own) return own;
  }
  const d = state.settings.displayCrs;
  if (crs.getCrs(d).kind === 'projected') return d;
  return own ?? 'EPSG:26191';
}

/**
 * Exporte immédiatement des entités dans un format.
 * @param {any[]} features @param {string} fmt
 * @param {{ crsId?: string, sidecar?: boolean, baseName?: string }} [o]
 * @returns {Promise<boolean>}
 */
export async function exportAs(features, fmt, o = {}) {
  if (!features.length) { toast('Rien à exporter.', 'warn'); return false; }
  const name = `${safeName(o.baseName ?? state.project?.name ?? 'topomaroc')}-${stamp()}`;
  const cid = o.crsId ?? exportCrsFor(features);
  if (fmt === 'dxf' && crs.getCrs(cid).kind !== 'projected') { toast('Le DXF nécessite un système projeté (Lambert ou UTM).', 'error'); return false; }
  const ep = crs.getCrs(cid).epsg;
  try {
    switch (fmt) {
      case 'geojson': await saveFile(toGeoJSON(features, { project: state.project }), `${name}.geojson`, 'application/geo+json'); break;
      case 'geojson-proj': await saveFile(toGeoJSON(features, { projectedCrsId: cid, project: state.project }), `${name}-${ep}.geojson`, 'application/geo+json'); break;
      case 'kml': await saveFile(toKML(features, { project: state.project }), `${name}.kml`, 'application/vnd.google-earth.kml+xml'); break;
      case 'gpx': await saveFile(toGPX(features, { project: state.project }), `${name}.gpx`, 'application/gpx+xml'); break;
      case 'csv': await saveFile(toCSV(features, cid), `${name}-${ep}.csv`, 'text/csv'); break;
      case 'csv-fr': await saveFile(toCSV(features, cid, { delimiter: ';', decimal: ',' }), `${name}-${ep}.csv`, 'text/csv'); break;
      case 'dxf': await saveFile(toDXF(features, cid), `${name}-${ep}.dxf`, 'application/dxf'); break;
      case 'xlsx': { const { toXLSX } = await import('../io/office.js'); await shareOrSave(await toXLSX(features, cid, state.project), `${name}.xlsx`); break; }
      case 'pdf-sheet': { const { surveySheetPDF } = await import('../io/office.js'); await shareOrSave(await surveySheetPDF(features, state.project, cid), `${name}-fiche.pdf`); break; }
      default: toast('Format inconnu.', 'error'); return false;
    }
    const wgsOnly = ['geojson', 'kml', 'gpx'].includes(fmt);
    if (o.sidecar) await saveFile(crsSidecar(wgsOnly ? 'EPSG:4326' : cid), `${name}-SRC.txt`, 'text/plain');
    const f = EXPORT_FORMATS.find((x) => x.value === fmt);
    toast(`Export ${f?.label ?? fmt} : ${features.length} entité(s)${wgsOnly ? ' (WGS 84)' : ` (${crs.getCrs(cid).label})`}.`, 'ok');
    return true;
  } catch (e) {
    toast(`Export impossible : ${/** @type {Error} */ (e).message}`, 'error', 6000);
    return false;
  }
}

/**
 * Choix du format : toucher un format crée le fichier aussitôt (pas de seconde validation).
 * Le dernier format utilisé est proposé en premier ; système et fichier SRC restent réglables.
 * @param {any[]} features @param {string} [preset] format mis en avant si aucun n'a encore été utilisé @param {string} [baseName]
 */
export async function exportDialog(features, preset = 'geojson', baseName) {
  if (!features.length) { toast('Rien à exporter.', 'warn'); return; }
  const last = /** @type {any} */ (state.settings).exportFormat ?? preset;
  const cs = crsSelect(exportCrsFor(features), { projectedOnly: true });
  const sidecar = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: !!(/** @type {any} */ (state.settings).exportSidecar) }));
  const order = [...EXPORT_FORMATS].sort((a, b) => (b.value === last ? 1 : 0) - (a.value === last ? 1 : 0));
  const r = await modal({
    title: `Exporter ${features.length} entité(s)`,
    dismissValue: null,
    body: (close) => [
      h('p.small.muted', null, 'Touchez un format : le fichier est créé aussitôt.'),
      h('div.fmt-grid', null, order.map((f) => h(`button.fmt-btn${f.value === last ? '.last' : ''}`, { type: 'button', 'data-fmt': f.value, onclick: () => close(f.value) },
        icon(f.ic), h('span.fmt-t', null, h('b', null, f.label), h('small', null, f.value === last ? `${f.sub} · dernier utilisé` : f.sub))))),
      h('details.fmt-opts', null, h('summary', null, icon('settings'), 'Options'),
        field('Système des coordonnées X/Y (CSV, XLSX, DXF, PDF, GeoJSON projeté)', cs, 'GeoJSON, KML et GPX standard sont toujours en WGS 84.'),
        h('label.switch', null, sidecar, h('span', null, 'Joindre un fichier décrivant le système de coordonnées'))),
    ],
  });
  if (!r) return;
  await updateSettings(/** @type {any} */ ({ exportFormat: r, exportSidecar: sidecar.checked }));
  await exportAs(features, r, { crsId: cs.value, sidecar: sidecar.checked, baseName });
}
