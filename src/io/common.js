// @ts-check
/** Outils communs aux imports / exports. */
import * as crs from '../core/crs.js';
import { analyzeParcel } from '../core/parcel.js';

/**
 * Coordonnées d'un point dans un SRC donné. Les valeurs saisies sont restituées telles
 * quelles si le SRC demandé est celui de la saisie (pas d'aller-retour de transformation).
 * @param {any} f entité point @param {string} crsId @returns {[number, number]}
 */
export function pointXY(f, crsId) {
  if (f.input && f.input.crsId === crsId) return [f.input.x, f.input.y];
  if (f.input && f.input.crsId) return crs.transform(f.input.crsId, crsId, [f.input.x, f.input.y]);
  return crs.fromWGS84(crsId, f.wgs84.lon, f.wgs84.lat);
}

/** Sommets d'une parcelle / ligne dans un SRC donné. @param {any} f @param {string} crsId @returns {[number,number][]} */
export function verticesXY(f, crsId) {
  return f.vertices.map((/** @type {any} */ v) => (f.crsId === crsId ? [v.x, v.y] : crs.transform(f.crsId, crsId, [v.x, v.y])));
}

/** Sommets en WGS 84 [lon, lat]. @param {any} f @returns {[number,number][]} */
export function verticesLL(f) {
  return f.vertices.map((/** @type {any} */ v) => {
    const w = crs.toWGS84(f.crsId, [v.x, v.y]);
    return [w.lon, w.lat];
  });
}

/** Analyse d'une parcelle stockée. @param {any} f @param {string|null} [planeCrsId] */
export function analyze(f, planeCrsId = null) {
  return analyzeParcel(f.vertices, f.crsId, { method: f.method || 'auto', planeCrsId });
}

/** Description textuelle d'un SRC, pour les fichiers d'accompagnement. @param {string} crsId */
export function crsSidecar(crsId) {
  const c = crs.getCrs(crsId);
  const d = crs.datumInfo(crsId);
  return [
    `Système de coordonnées : ${c.name}${c.epsg ? ` (EPSG:${c.epsg})` : ''}`,
    `Libellé : ${c.label}`,
    `Unité : ${c.unit === 'm' ? 'mètre' : 'degré décimal'}`,
    `Ordre des axes dans les fichiers : ${c.kind === 'projected' ? 'X = Est, Y = Nord' : 'longitude, latitude (colonnes nommées)'}`,
    `Paramètres : ${c.projection ?? ''}`,
    `Datum : ${d.datum} — ellipsoïde ${d.ellipsoid}`,
    `Transformation vers WGS 84 : ${d.transformation}`,
    `Chaîne PROJ : ${crs.proj4StringWithDatum(crsId)}`,
    '',
    'Fichier produit par TopoMaroc GIS. Les coordonnées issues d’un GPS de téléphone ont une précision métrique ;',
    'elles ne constituent pas un document cadastral officiel.',
  ].join('\n');
}

/** Nom de fichier sûr. @param {string} s */
export function safeName(s) {
  return (s || 'export').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'export';
}

/** Échappement XML. @param {any} s */
export function xmlEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Horodatage pour noms de fichiers. */
export function stamp(d = new Date()) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
