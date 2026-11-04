// @ts-check
/** Import / export CSV de points et de sommets. */
import Papa from '../../vendor/papaparse.mjs';
import * as crs from '../core/crs.js';
import { parseAngle, parseNumber } from '../core/angles.js';
import { pointXY, verticesXY } from './common.js';

/**
 * @param {string} text
 * @returns {{ fields: string[], rows: Record<string,string>[], delimiter: string, errors: string[] }}
 */
export function parseCSV(text) {
  const clean = text.replace(/^﻿/, '');
  const r = Papa.parse(clean, { header: true, skipEmptyLines: 'greedy', delimitersToGuess: [';', ',', '\t', '|'], transformHeader: (/** @type {string} */ h) => h.trim() });
  const fields = (r.meta.fields || []).filter(Boolean);
  // Fichier sans en-tête : première ligne numérique → colonnes génériques
  if (fields.length && fields.filter((f) => Number.isFinite(parseNumber(f))).length >= 2) {
    const r2 = Papa.parse(clean, { header: false, skipEmptyLines: 'greedy', delimitersToGuess: [';', ',', '\t', '|'] });
    const n = Math.max(...r2.data.map((/** @type {any[]} */ row) => row.length));
    const names = Array.from({ length: n }, (_, i) => `col${i + 1}`);
    return {
      fields: names,
      rows: r2.data.map((/** @type {string[]} */ row) => Object.fromEntries(names.map((k, i) => [k, (row[i] ?? '').trim()]))),
      delimiter: r2.meta.delimiter, errors: r2.errors.map((/** @type {any} */ e) => `Ligne ${e.row + 1} : ${e.message}`),
    };
  }
  return {
    fields,
    rows: r.data.map((/** @type {any} */ row) => Object.fromEntries(fields.map((k) => [k, String(row[k] ?? '').trim()]))),
    delimiter: r.meta.delimiter,
    errors: r.errors.map((/** @type {any} */ e) => `Ligne ${(e.row ?? 0) + 2} : ${e.message}`),
  };
}

const PATTERNS = {
  name: /^(nom|name|id|num(ero)?|n°|no|point|pt|matricule|borne|label|sommet)$/i,
  x: /^(x|e|est|easting|east|lon|long|longitude|lng)$/i,
  y: /^(y|n|nord|northing|north|lat|latitude)$/i,
  code: /^(code|type|nature)$/i,
  desc: /^(desc|description|obs|observations?|remarques?|commentaires?)$/i,
  z: /^(z|h|alt|altitude|elevation|cote)$/i,
};

/**
 * Propose une correspondance colonnes → champs à partir des en-têtes.
 * @param {string[]} fields
 * @returns {{ name: string|null, x: string|null, y: string|null, code: string|null, desc: string|null, z: string|null, axisHint: 'xy'|'latlon'|null }}
 */
export function guessMapping(fields) {
  /** @param {RegExp} re */
  const find = (re) => fields.find((f) => re.test(f.replace(/[_\s.]/g, ''))) ?? null;
  const m = { name: find(PATTERNS.name), x: find(PATTERNS.x), y: find(PATTERNS.y), code: find(PATTERNS.code), desc: find(PATTERNS.desc), z: find(PATTERNS.z), axisHint: /** @type {'xy'|'latlon'|null} */ (null) };
  if (m.x && /lon|lng/i.test(m.x)) m.axisHint = 'latlon';
  else if (m.x) m.axisHint = 'xy';
  if (!m.x || !m.y) {
    // fichier sans en-têtes reconnus : première(s) colonne(s) texte = nom, puis deux colonnes numériques
    const generic = fields.filter((f) => /^col\d+$/.test(f));
    if (generic.length >= 3) { m.name = m.name ?? generic[0]; m.x = m.x ?? generic[1]; m.y = m.y ?? generic[2]; if (generic.length >= 4) m.z = m.z ?? generic[3]; }
    else if (generic.length === 2) { m.x = generic[0]; m.y = generic[1]; }
  }
  return m;
}

/**
 * Estimation du type de coordonnées d'une liste de valeurs (pour pré-remplir le choix du SRC ;
 * l'utilisateur doit TOUJOURS confirmer : les zones Lambert ne se distinguent pas par les valeurs).
 * @param {[number,number][]} xy valeurs (colonne X, colonne Y)
 * @returns {{ kind: 'degrees'|'utm'|'lambert'|'unknown', suggestion: string|null, swapped: boolean, reason: string }}
 */
export function guessCoordinateKind(xy) {
  const ok = xy.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (!ok.length) return { kind: 'unknown', suggestion: null, swapped: false, reason: 'Aucune coordonnée numérique.' };
  const all = (/** @type {(p:[number,number])=>boolean} */ f) => ok.every(f);
  if (all(([a, b]) => Math.abs(a) <= 180 && Math.abs(b) <= 90)) {
    // x = lon, y = lat ?
    if (all(([a, b]) => crs.inBBox(crs.MOROCCO_BBOX, a, b, 1))) return { kind: 'degrees', suggestion: 'EPSG:4326', swapped: false, reason: 'Valeurs en degrés situées au Maroc (X = longitude, Y = latitude).' };
    if (all(([a, b]) => crs.inBBox(crs.MOROCCO_BBOX, b, a, 1))) return { kind: 'degrees', suggestion: 'EPSG:4326', swapped: true, reason: 'Valeurs en degrés : la 1re colonne semble être la latitude.' };
    return { kind: 'degrees', suggestion: 'EPSG:4326', swapped: false, reason: 'Valeurs en degrés hors du Maroc.' };
  }
  if (all(([a, b]) => a > 100000 && a < 900000 && b > 2000000 && b < 4100000)) {
    return { kind: 'utm', suggestion: null, swapped: false, reason: 'Valeurs compatibles avec l’UTM (Nord de 2 000 000 à 4 100 000 m) : précisez le fuseau 28, 29 ou 30.' };
  }
  if (all(([a, b]) => a > 0 && a < 1900000 && b > 0 && b < 900000)) {
    return { kind: 'lambert', suggestion: null, swapped: false, reason: 'Valeurs compatibles avec une projection Lambert Maroc : précisez la zone (Nord, Sud, Sahara Nord, Sahara Sud).' };
  }
  if (all(([a, b]) => b > 0 && b < 1900000 && a > 0 && a < 900000 && a > b)) {
    return { kind: 'lambert', suggestion: null, swapped: true, reason: 'Colonnes X et Y peut-être inversées.' };
  }
  return { kind: 'unknown', suggestion: null, swapped: false, reason: 'Type de coordonnées non reconnu.' };
}

/**
 * Convertit des lignes CSV en points (coordonnées internes x/y du SRC choisi).
 * Pour un SRC géographique, la colonne X contient la longitude et Y la latitude (DMS accepté).
 * @param {Record<string,string>[]} rows
 * @param {{ name: string|null, x: string, y: string, code?: string|null, desc?: string|null, z?: string|null }} map
 * @param {string} crsId
 */
export function rowsToPoints(rows, map, crsId) {
  const geo = crs.getCrs(crsId).kind === 'geographic';
  const points = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const x = geo ? parseAngle(r[map.x]) : parseNumber(r[map.x]);
    const y = geo ? parseAngle(r[map.y]) : parseNumber(r[map.y]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { errors.push(`Ligne ${i + 2} : coordonnées illisibles (« ${r[map.x]} », « ${r[map.y]} »).`); continue; }
    const chk = crs.checkCoordinate(crsId, [x, y]);
    if (!chk.ok) { errors.push(`Ligne ${i + 2} : ${chk.errors.join(' ')}`); continue; }
    points.push({
      name: map.name ? r[map.name] || String(i + 1) : String(i + 1),
      x, y, z: map.z ? parseNumber(r[map.z]) : null,
      code: map.code ? r[map.code] || '' : '',
      desc: map.desc ? r[map.desc] || '' : '',
      wgs84: chk.wgs84, warnings: chk.warnings,
    });
  }
  return { points, errors };
}

/** @param {number} v @param {number} d @param {string} dec */
const num = (v, d, dec) => (Number.isFinite(v) ? v.toFixed(d).replace('.', dec) : '');

/**
 * Export CSV de points (et sommets de parcelles).
 * @param {any[]} features @param {string} crsId SRC des colonnes X/Y
 * @param {{ delimiter?: string, decimal?: '.'|',' }} [opts]
 */
export function toCSV(features, crsId, opts = {}) {
  const delim = opts.delimiter ?? ',';
  const dec = opts.decimal ?? '.';
  const c = crs.getCrs(crsId);
  const d = c.unit === 'm' ? 3 : 8;
  const [ax, ay] = c.kind === 'projected' ? ['X', 'Y'] : ['Longitude', 'Latitude'];
  const header = ['id', 'numero', 'nom', 'type', 'code', 'parcelle', 'sommet', `${ax}_${c.epsg}`, `${ay}_${c.epsg}`, 'lat_wgs84', 'lon_wgs84', 'precision_m', 'source', 'date', 'description'];
  const rows = [header];
  for (const f of features) {
    if (f.type === 'point') {
      const [x, y] = pointXY(f, crsId);
      rows.push([f.id, f.num ?? '', f.name ?? '', 'point', f.code ?? '', '', '', num(x, d, dec), num(y, d, dec), num(f.wgs84.lat, 8, dec), num(f.wgs84.lon, 8, dec), f.accuracy != null ? num(f.accuracy, 2, dec) : '', f.source ?? '', f.takenAt ?? f.createdAt ?? '', f.description ?? '']);
    } else if (f.type === 'parcel' || f.type === 'line') {
      const xy = verticesXY(f, crsId);
      f.vertices.forEach((/** @type {any} */ v, /** @type {number} */ i) => {
        const w = crs.toWGS84(f.crsId, [v.x, v.y]);
        rows.push([f.id, v.label ?? String(i + 1), f.name ?? '', f.type === 'parcel' ? 'sommet' : 'sommet_ligne', f.code ?? '', f.name ?? '', String(i + 1), num(xy[i][0], d, dec), num(xy[i][1], d, dec), num(w.lat, 8, dec), num(w.lon, 8, dec), v.accuracy != null ? num(v.accuracy, 2, dec) : '', f.source ?? '', f.createdAt ?? '', v.desc ?? '']);
      });
    }
  }
  return '﻿' + Papa.unparse(rows, { delimiter: delim, newline: '\r\n' });
}
