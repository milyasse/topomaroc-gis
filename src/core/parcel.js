// @ts-check
/**
 * Analyse complète d'une parcelle : validité géométrique, superficie, périmètre,
 * côtés, azimuts, avec choix et documentation de la méthode de calcul.
 *
 * Méthodes :
 *  - « plane » : formule de Gauss sur les coordonnées projetées (Lambert / UTM). C'est la
 *    convention des plans topographiques et cadastraux : la superficie est celle de la
 *    projection (elle inclut l'altération linéaire, ≈ −0,04 % à ±0,1 % en Lambert Maroc).
 *  - « géodésique » : superficie exacte sur l'ellipsoïde WGS 84 (GeographicLib), côtés
 *    géodésiques. Indépendante de toute projection ; recommandée pour les levés GPS et
 *    les grands polygones (> 10 km).
 */
import * as crs from './crs.js';
import { zoneAt } from './zones.js';
import * as geo from './geodesy.js';
import * as G from './geometry.js';
import { gridBearing } from './angles.js';

/**
 * @typedef {Object} Vertex
 * @property {number} x  1re coordonnée interne (lon ou E)
 * @property {number} y  2e coordonnée interne (lat ou N)
 * @property {string} [label]
 * @property {number|null} [accuracy] précision horizontale estimée (m), si levé GPS
 */
/**
 * @typedef {Object} Issue
 * @property {'error'|'warning'|'info'} level
 * @property {string} code
 * @property {string} message
 * @property {number[]} [vertices]
 */

export const LARGE_EXTENT_M = 10000;
export const CADASTRAL_ACCURACY_M = 0.1;

/**
 * @param {Vertex[]} vertices sommets (non refermés ; un sommet final identique au premier est ignoré)
 * @param {string} crsId SRC des sommets
 * @param {{ planeCrsId?: string|null, method?: 'auto'|'plane'|'geodesic', duplicateTol?: number }} [opts]
 * @returns {any} résultat d'analyse (voir champs ci-dessous ; `valid` indique si les calculs sont exploitables)
 */
export function analyzeParcel(vertices, crsId, opts = {}) {
  const src = crs.getCrs(crsId);
  /** @type {Issue[]} */
  const issues = [];
  let pts = vertices.map((v) => /** @type {[number,number]} */ ([v.x, v.y]));
  const before = pts.length;
  pts = G.openRing(pts, src.unit === 'm' ? 1e-4 : 1e-9);
  const verts = vertices.slice(0, pts.length);
  if (before !== pts.length) issues.push({ level: 'info', code: 'closed', message: 'Le dernier sommet répétait le premier : il a été ignoré (fermeture automatique).' });

  const n = pts.length;
  const base = { n, crsId, issues };
  if (n < 3) {
    issues.push({ level: 'error', code: 'too_few', message: `Polygone incomplet : ${n} sommet(s), au moins 3 requis.` });
    return { ...base, valid: false };
  }

  // Coordonnées WGS 84 de chaque sommet
  const wgs = [];
  for (let i = 0; i < n; i++) {
    const chk = crs.checkCoordinate(crsId, pts[i]);
    if (!chk.ok || !chk.wgs84) {
      issues.push({ level: 'error', code: 'bad_coord', message: `Sommet ${i + 1} : ${chk.errors.join(' ')}`, vertices: [i] });
      continue;
    }
    for (const w of chk.warnings) issues.push({ level: 'warning', code: 'coord_warning', message: `Sommet ${i + 1} : ${w}`, vertices: [i] });
    wgs.push(chk.wgs84);
  }
  if (wgs.length !== n) return { ...base, valid: false };

  // SRC plan utilisé pour les contrôles géométriques et la superficie plane
  const centerLon = wgs.reduce((s, p) => s + p.lon, 0) / n;
  const centerLat = wgs.reduce((s, p) => s + p.lat, 0) / n;
  const planeCrsId = src.kind === 'projected'
    ? crsId
    : (opts.planeCrsId && crs.getCrs(opts.planeCrsId).kind === 'projected' ? opts.planeCrsId
      : (zoneAt(centerLon, centerLat) || crs.bestLambertZone(centerLon, centerLat) || `EPSG:326${crs.utmZoneFor(centerLon)}`));
  const plane = src.kind === 'projected' ? pts : wgs.map((p) => crs.fromWGS84(planeCrsId, p.lon, p.lat));

  // Contrôles de validité
  const tol = opts.duplicateTol ?? 0.001;
  const dups = G.duplicateVertices(plane, tol);
  for (const [i, j] of dups) issues.push({ level: 'error', code: 'duplicate', message: `Sommets ${i + 1} et ${j + 1} confondus (écart ≤ ${tol * 1000} mm).`, vertices: [i, j] });
  const inter = dups.length ? [] : G.selfIntersections(plane);
  for (const [i, j] of inter) issues.push({ level: 'error', code: 'self_intersection', message: `Les côtés ${i + 1}–${(i + 1) % n + 1} et ${j + 1}–${(j + 1) % n + 1} se croisent : polygone auto-intersecté.`, vertices: [i, (i + 1) % n, j, (j + 1) % n] });
  const col = G.collinearVertices(plane);
  if (col.length) issues.push({ level: 'info', code: 'collinear', message: `Sommet(s) aligné(s) sur un côté : ${col.map((i) => i + 1).join(', ')}.`, vertices: col });

  const pArea = G.planeArea(plane);
  const pPerim = G.planePerimeter(plane);
  const g = geo.polygonArea(wgs);
  const [x0, y0, x1, y1] = G.bbox(plane);
  const extent = Math.hypot(x1 - x0, y1 - y0);

  if (pArea < 1e-6) issues.push({ level: 'error', code: 'zero_area', message: 'Superficie nulle : sommets alignés ou confondus.' });
  else if (pArea < 1) issues.push({ level: 'warning', code: 'tiny_area', message: 'Superficie inférieure à 1 m² : vérifiez les unités et les coordonnées.' });
  if (pArea > 1e8) issues.push({ level: 'warning', code: 'huge_area', message: 'Superficie supérieure à 10 000 ha : vérifiez les coordonnées et le système choisi.' });

  // Précision des sommets levés au GPS
  const accs = verts.map((v) => v.accuracy).filter((a) => typeof a === 'number' && Number.isFinite(a));
  const worstAcc = accs.length ? Math.max(.../** @type {number[]} */ (accs)) : null;
  if (worstAcc !== null && worstAcc > CADASTRAL_ACCURACY_M) {
    issues.push({ level: 'warning', code: 'low_accuracy', message: `Précision GPS estimée jusqu’à ±${worstAcc.toFixed(1)} m : insuffisante pour un usage foncier ou cadastral (levé GNSS RTK ou station totale requis).` });
  }
  const di = crs.datumInfo(crsId);
  if (src.datum === 'merchich' && !crs.getMerchichShift().custom) {
    const outside = wgs.some((p) => !crs.merchichShiftValidAt(p.lon, p.lat));
    if (outside) issues.push({ level: 'warning', code: 'shift_extrapolated', message: 'La transformation EPSG:1166 n’est pas définie pour les provinces du Sud : la position WGS 84 (carte, GPS) peut être décalée de plusieurs centaines de mètres. La superficie plane n’est pas affectée.' });
  }

  // Choix de la méthode
  let method = opts.method && opts.method !== 'auto' ? opts.method : (src.kind === 'projected' && extent <= LARGE_EXTENT_M ? 'plane' : 'geodesic');
  let methodNote;
  if (method === 'plane') {
    methodNote = `Superficie plane (formule de Gauss) calculée dans la projection ${crs.getCrs(planeCrsId).label} (${crs.getCrs(planeCrsId).name}). Convention des plans topographiques et cadastraux.`;
  } else {
    methodNote = 'Superficie géodésique exacte sur l’ellipsoïde WGS 84 (GeographicLib, côtés géodésiques), indépendante de la projection.';
    if (extent > LARGE_EXTENT_M) methodNote += ` Méthode retenue car l’emprise dépasse ${LARGE_EXTENT_M / 1000} km.`;
  }
  if (extent > LARGE_EXTENT_M) issues.push({ level: 'info', code: 'large', message: `Grande emprise (${(extent / 1000).toFixed(1)} km) : les côtés droits en projection et les géodésiques diffèrent ; écart plane/géodésique ${(((pArea - g.area) / g.area) * 100).toFixed(3)} %.` });

  const sides = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const inv = geo.inverse(wgs[i].lat, wgs[i].lon, wgs[j].lat, wgs[j].lon);
    sides.push({
      from: i, to: j,
      gridLength: G.dist2D(plane[i], plane[j]),
      gridBearing: gridBearing(plane[i], plane[j]),
      geodesicLength: inv.distance,
      trueAzimuth: inv.azimuth,
    });
  }

  const valid = !issues.some((x) => x.level === 'error');
  const area = method === 'plane' ? pArea : g.area;
  const perimeter = method === 'plane' ? pPerim : g.perimeter;
  return {
    ...base, valid, method, methodNote, area, perimeter,
    planeCrsId, planeArea: pArea, planePerimeter: pPerim,
    geodesicArea: g.area, geodesicPerimeter: g.perimeter,
    diffPercent: g.area ? ((pArea - g.area) / g.area) * 100 : 0,
    extent, sides, wgs84: wgs, plane, worstAccuracy: worstAcc,
    orientation: G.signedArea(plane) > 0 ? 'anti-horaire' : 'horaire',
    datum: di,
  };
}

/** Somme des superficies de plusieurs parcelles analysées (même méthode requise pour la cohérence). @param {any[]} results */
export function totalArea(results) {
  const ok = results.filter((r) => r && r.valid);
  return {
    count: ok.length,
    area: ok.reduce((s, r) => s + r.area, 0),
    geodesicArea: ok.reduce((s, r) => s + r.geodesicArea, 0),
    mixedMethods: new Set(ok.map((r) => r.method)).size > 1,
  };
}
