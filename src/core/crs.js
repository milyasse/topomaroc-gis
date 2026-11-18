// @ts-check
/**
 * Registre des systèmes de référence de coordonnées (SRC) pris en charge et
 * transformations via proj4js.
 *
 * Toutes les définitions proviennent du registre EPSG (vérifiées sur epsg.io et
 * contrôlées par tests contre PROJ/pyproj, cf. tests/reference/proj_reference.json).
 * Aucune valeur n'est inventée : la seule transformation Merchich → WGS 84
 * publiée dans le registre EPSG est EPSG:1166 (translations géocentriques
 * 31, 146, 47 m ; exactitude annoncée ≈ 7 m). Des paramètres locaux plus précis
 * peuvent être saisis par l'utilisateur (ils relèvent alors de sa responsabilité).
 */
import proj4 from '../../vendor/proj4.mjs';

/** Ellipsoïde Clarke 1880 (IGN) : a = 6378249.2 m, 1/f = 293.466021293627 */
const CLARKE80IGN = '+a=6378249.2 +rf=293.466021293627';

/** Paramètres EPSG:1166 « Merchich to WGS 84 (1) » (DMA TR8350.2, 1987). */
export const MERCHICH_EPSG1166 = Object.freeze([31, 146, 47, 0, 0, 0, 0]);

/**
 * @typedef {Object} CrsDef
 * @property {string} id            identifiant interne (ex. "EPSG:26191")
 * @property {string} name          nom complet (registre EPSG)
 * @property {string} label         libellé court affiché
 * @property {number|null} epsg     code EPSG vérifié
 * @property {'geographic'|'projected'} kind
 * @property {'deg'|'m'} unit
 * @property {[string,string]} axes  libellés des deux valeurs saisies, dans l'ordre de saisie
 * @property {string} axisNote       convention de saisie
 * @property {'merchich'|'wgs84'} datum
 * @property {string} projParams     paramètres de projection (hors datum)
 * @property {[number,number,number,number]} bbox  emprise d'usage [lonMin, latMin, lonMax, latMax] (EPSG)
 * @property {string} description
 * @property {string} [projection]  description lisible des paramètres
 */

/** @type {CrsDef[]} */
export const CRS_LIST = [
  {
    id: 'EPSG:4326', epsg: 4326, name: 'WGS 84', label: 'WGS 84 (lat/lon)',
    kind: 'geographic', unit: 'deg', axes: ['Latitude', 'Longitude'],
    axisNote: 'Saisie : latitude puis longitude, en degrés décimaux ou DMS (ex. 34.0209 / -6.8498). Ouest = négatif.',
    datum: 'wgs84', projParams: '+proj=longlat', bbox: [-180, -90, 180, 90],
    description: 'Système géodésique mondial utilisé par le GPS. Référence de la carte.',
    projection: 'Coordonnées géographiques, ellipsoïde WGS 84',
  },
  {
    id: 'EPSG:26191', epsg: 26191, name: 'Merchich / Nord Maroc', label: 'Lambert Nord Maroc (zone 1)',
    kind: 'projected', unit: 'm', axes: ['X (Est)', 'Y (Nord)'],
    axisNote: 'Saisie : X (Est) puis Y (Nord), en mètres. Ex. X = 380000, Y = 380000.',
    datum: 'merchich',
    projParams: '+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000',
    bbox: [-9.85, 31.49, -1.01, 35.97],
    description: 'Maroc au nord de 35 grades N (31°30′N). Système cadastral courant (ANCFCC).',
    projection: 'Lambert conique conforme 1SP · φ0 = 33,3° (37 gr) · λ0 = −5,4° (−6 gr) · k0 = 0,999625769 · X0 = 500 000 m · Y0 = 300 000 m',
  },
  {
    id: 'EPSG:26192', epsg: 26192, name: 'Merchich / Sud Maroc', label: 'Lambert Sud Maroc (zone 2)',
    kind: 'projected', unit: 'm', axes: ['X (Est)', 'Y (Nord)'],
    axisNote: 'Saisie : X (Est) puis Y (Nord), en mètres.',
    datum: 'merchich',
    projParams: '+proj=lcc +lat_1=29.7 +lat_0=29.7 +lon_0=-5.4 +k_0=0.999615596 +x_0=500000 +y_0=300000',
    bbox: [-13.24, 27.66, -3.59, 31.51],
    description: 'Maroc au sud de 35 grades N (31°30′N).',
    projection: 'Lambert conique conforme 1SP · φ0 = 29,7° (33 gr) · λ0 = −5,4° (−6 gr) · k0 = 0,999615596 · X0 = 500 000 m · Y0 = 300 000 m',
  },
  {
    id: 'EPSG:26194', epsg: 26194, name: 'Merchich / Sahara Nord', label: 'Lambert Sahara Nord (zone 3)',
    kind: 'projected', unit: 'm', axes: ['X (Est)', 'Y (Nord)'],
    axisNote: 'Saisie : X (Est) puis Y (Nord), en mètres.',
    datum: 'merchich',
    projParams: '+proj=lcc +lat_1=26.1 +lat_0=26.1 +lon_0=-5.4 +k_0=0.999616304 +x_0=1200000 +y_0=400000',
    bbox: [-15.42, 24.29, -8.66, 27.67],
    description: 'Provinces du Sud, au nord de 27 grades N (24°18′N).',
    projection: 'Lambert conique conforme 1SP · φ0 = 26,1° (29 gr) · λ0 = −5,4° (−6 gr) · k0 = 0,999616304 · X0 = 1 200 000 m · Y0 = 400 000 m',
  },
  {
    id: 'EPSG:26195', epsg: 26195, name: 'Merchich / Sahara Sud', label: 'Lambert Sahara Sud (zone 4)',
    kind: 'projected', unit: 'm', axes: ['X (Est)', 'Y (Nord)'],
    axisNote: 'Saisie : X (Est) puis Y (Nord), en mètres.',
    datum: 'merchich',
    projParams: '+proj=lcc +lat_1=22.5 +lat_0=22.5 +lon_0=-5.4 +k_0=0.999616437 +x_0=1500000 +y_0=400000',
    bbox: [-17.16, 20.71, -12.0, 24.31],
    description: 'Provinces du Sud, au sud de 27 grades N (24°18′N).',
    projection: 'Lambert conique conforme 1SP · φ0 = 22,5° (25 gr) · λ0 = −5,4° (−6 gr) · k0 = 0,999616437 · X0 = 1 500 000 m · Y0 = 400 000 m',
  },
  {
    id: 'EPSG:4261', epsg: 4261, name: 'Merchich', label: 'Merchich (lat/lon)',
    kind: 'geographic', unit: 'deg', axes: ['Latitude', 'Longitude'],
    axisNote: 'Saisie : latitude puis longitude Merchich, en degrés décimaux (pas en grades).',
    datum: 'merchich', projParams: '+proj=longlat',
    bbox: [-17.16, 20.71, -1.01, 35.97],
    description: 'Système géodésique historique marocain (ellipsoïde Clarke 1880 IGN).',
    projection: 'Coordonnées géographiques, ellipsoïde Clarke 1880 (IGN)',
  },
  {
    id: 'EPSG:32628', epsg: 32628, name: 'WGS 84 / UTM zone 28N', label: 'UTM 28N (WGS 84)',
    kind: 'projected', unit: 'm', axes: ['E (Est)', 'N (Nord)'],
    axisNote: 'Saisie : Easting puis Northing, en mètres. Fuseau 28 : 18°W à 12°W.',
    datum: 'wgs84', projParams: '+proj=utm +zone=28',
    bbox: [-18, 0, -12, 84],
    description: 'Fuseau UTM 28 Nord — Provinces du Sud (ouest de 12°W).',
    projection: 'Mercator transverse · λ0 = −15° · k0 = 0,9996 · E0 = 500 000 m · N0 = 0',
  },
  {
    id: 'EPSG:32629', epsg: 32629, name: 'WGS 84 / UTM zone 29N', label: 'UTM 29N (WGS 84)',
    kind: 'projected', unit: 'm', axes: ['E (Est)', 'N (Nord)'],
    axisNote: 'Saisie : Easting puis Northing, en mètres. Fuseau 29 : 12°W à 6°W.',
    datum: 'wgs84', projParams: '+proj=utm +zone=29',
    bbox: [-12, 0, -6, 84],
    description: 'Fuseau UTM 29 Nord — Maroc atlantique et centre.',
    projection: 'Mercator transverse · λ0 = −9° · k0 = 0,9996 · E0 = 500 000 m · N0 = 0',
  },
  {
    id: 'EPSG:32630', epsg: 32630, name: 'WGS 84 / UTM zone 30N', label: 'UTM 30N (WGS 84)',
    kind: 'projected', unit: 'm', axes: ['E (Est)', 'N (Nord)'],
    axisNote: 'Saisie : Easting puis Northing, en mètres. Fuseau 30 : 6°W à 0°.',
    datum: 'wgs84', projParams: '+proj=utm +zone=30',
    bbox: [-6, 0, 0, 84],
    description: 'Fuseau UTM 30 Nord — Maroc oriental.',
    projection: 'Mercator transverse · λ0 = −3° · k0 = 0,9996 · E0 = 500 000 m · N0 = 0',
  },
];

/** Emprise approximative du Maroc (y compris provinces du Sud), pour les contrôles de vraisemblance. */
export const MOROCCO_BBOX = /** @type {[number,number,number,number]} */ ([-17.3, 20.7, -0.9, 36.0]);

/** Domaine de validité de EPSG:1166 « Morocco - onshore » [lonMin, latMin, lonMax, latMax]. */
export const EPSG1166_BBOX = /** @type {[number,number,number,number]} */ ([-13.24, 27.66, -1.01, 35.97]);

/**
 * La transformation Merchich → WGS 84 active est-elle définie en ce point ?
 * (EPSG:1166 ne couvre pas les zones Sahara Nord / Sahara Sud : PROJ refuse alors de l'appliquer.)
 * @param {number} lon @param {number} lat
 */
export function merchichShiftValidAt(lon, lat) {
  return datumShift.custom || inBBox(EPSG1166_BBOX, lon, lat, 0.05);
}

/** @type {Map<string, CrsDef>} */
const BY_ID = new Map(CRS_LIST.map((c) => [c.id, c]));

/**
 * Paramètres de transformation Merchich → WGS 84 actifs (7 paramètres, convention
 * « Position Vector » de PROJ : tx ty tz [m], rx ry rz [″], ds [ppm]).
 * @type {{ params: number[], source: string, custom: boolean }}
 */
let datumShift = { params: [...MERCHICH_EPSG1166], source: 'EPSG:1166 (exactitude ≈ 7 m)', custom: false };

/**
 * Définit des paramètres Merchich → WGS 84 personnalisés (ex. paramètres locaux
 * fournis par un organisme). `convention` : 'position_vector' (PROJ, EPSG:9606) ou
 * 'coordinate_frame' (EPSG:9607, rotations de signe opposé).
 * @param {number[]|null} params null pour revenir à EPSG:1166
 * @param {'position_vector'|'coordinate_frame'} [convention]
 * @param {string} [label]
 */
export function setMerchichShift(params, convention = 'position_vector', label = 'Paramètres personnalisés') {
  if (!params) {
    datumShift = { params: [...MERCHICH_EPSG1166], source: 'EPSG:1166 (exactitude ≈ 7 m)', custom: false };
  } else {
    if (params.length !== 3 && params.length !== 7) throw new Error('3 ou 7 paramètres attendus');
    if (!params.every(Number.isFinite)) throw new Error('Paramètres non numériques');
    const p = params.length === 3 ? [...params, 0, 0, 0, 0] : [...params];
    if (convention === 'coordinate_frame') { p[3] = -p[3]; p[4] = -p[4]; p[5] = -p[5]; }
    datumShift = { params: p, source: label, custom: true };
  }
  cache.clear();
}

export function getMerchichShift() { return { ...datumShift, params: [...datumShift.params] }; }

/** @param {string} id */
export function getCrs(id) {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Système de coordonnées inconnu : ${id}`);
  return c;
}

/**
 * Chaîne proj4 d'un SRC (ellipsoïde seul, sans paramètres de datum : le changement
 * de datum est réalisé par datumShiftLL, plus précis que celui de proj4js).
 * @param {string} id
 */
export function proj4String(id) {
  const c = getCrs(id);
  const ell = c.datum === 'wgs84' ? '+ellps=WGS84' : CLARKE80IGN;
  return `${c.projParams} ${ell}${c.unit === 'm' ? ' +units=m' : ''} +no_defs`;
}

/** Chaîne proj4 complète (avec +towgs84), pour export / information. @param {string} id */
export function proj4StringWithDatum(id) {
  const c = getCrs(id);
  if (c.datum === 'wgs84') return `${c.projParams} +datum=WGS84${c.unit === 'm' ? ' +units=m' : ''} +no_defs`;
  return `${c.projParams} ${CLARKE80IGN} +towgs84=${datumShift.params.join(',')}${c.unit === 'm' ? ' +units=m' : ''} +no_defs`;
}

/** @type {Map<string, any>} */
const cache = new Map();
/** @param {string} from @param {string} to */
function converter(from, to) {
  const key = `${from}>${to}`;
  let c = cache.get(key);
  if (!c) { c = proj4(proj4String(from), proj4String(to)); cache.set(key, c); }
  return c;
}

// ---------------------------------------------------------------------------
// Changement de datum Merchich ↔ WGS 84 : transformation de Helmert (convention
// Position Vector, EPSG:9606) entre coordonnées géocentriques, hauteur ellipsoïdale
// supposée nulle (domaine « geog2D », comme PROJ).
// ---------------------------------------------------------------------------
const ELL = {
  wgs84: { a: 6378137, f: 1 / 298.257223563 },
  merchich: { a: 6378249.2, f: 1 / 293.466021293627 },
};
const D2R = Math.PI / 180;

/** @param {{a:number,f:number}} e @param {number} lon @param {number} lat @param {number} h */
function toGeocentric(e, lon, lat, h) {
  const e2 = e.f * (2 - e.f);
  const sl = Math.sin(lat * D2R), cl = Math.cos(lat * D2R);
  const N = e.a / Math.sqrt(1 - e2 * sl * sl);
  return [(N + h) * cl * Math.cos(lon * D2R), (N + h) * cl * Math.sin(lon * D2R), (N * (1 - e2) + h) * sl];
}

/** @param {{a:number,f:number}} e @param {number[]} p */
function fromGeocentric(e, p) {
  const [X, Y, Z] = p;
  const e2 = e.f * (2 - e.f);
  const lon = Math.atan2(Y, X);
  const r = Math.hypot(X, Y);
  let lat = Math.atan2(Z, r * (1 - e2));
  let h = 0;
  for (let i = 0; i < 10; i++) {
    const sl = Math.sin(lat);
    const N = e.a / Math.sqrt(1 - e2 * sl * sl);
    h = r / Math.cos(lat) - N;
    const nl = Math.atan2(Z, r * (1 - e2 * N / (N + h)));
    if (Math.abs(nl - lat) < 1e-15) { lat = nl; break; }
    lat = nl;
  }
  return { lon: lon / D2R, lat: lat / D2R, h };
}

/** Matrice de Helmert (Position Vector) : X' = T + (1+s)·R·X. @param {number[]} p */
function helmert(p) {
  const as = Math.PI / 648000;
  const [tx, ty, tz, rx, ry, rz, ds] = p;
  const k = 1 + ds * 1e-6, x = rx * as, y = ry * as, z = rz * as;
  const R = [[1, -z, y], [z, 1, -x], [-y, x, 1]];
  return { T: [tx, ty, tz], M: R.map((row) => row.map((v) => v * k)) };
}

/** Résout M·x = b (3×3). @param {number[][]} M @param {number[]} b */
function solve3(M, b) {
  const [[a, bb, c], [d, e, f], [g, h, i]] = M;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + bb * B + c * C;
  const inv = [
    [A, -(bb * i - c * h), bb * f - c * e],
    [B, a * i - c * g, -(a * f - c * d)],
    [C, -(a * h - bb * g), a * e - bb * d],
  ];
  return inv.map((row) => (row[0] * b[0] + row[1] * b[1] + row[2] * b[2]) / det);
}

/**
 * Change le datum d'une position géographique (degrés).
 * @param {'merchich'|'wgs84'} from @param {'merchich'|'wgs84'} to @param {number} lon @param {number} lat
 * @returns {[number, number]}
 */
export function datumShiftLL(from, to, lon, lat) {
  if (from === to) return [lon, lat];
  const { T, M } = helmert(datumShift.params);
  const P = toGeocentric(ELL[from], lon, lat, 0);
  let Q;
  if (from === 'merchich') {
    Q = [0, 1, 2].map((r) => T[r] + M[r][0] * P[0] + M[r][1] * P[1] + M[r][2] * P[2]);
  } else {
    Q = solve3(M, [P[0] - T[0], P[1] - T[1], P[2] - T[2]]);
  }
  const g = fromGeocentric(ELL[to], Q);
  return [g.lon, g.lat];
}

/**
 * Convertit une saisie (dans l'ordre d'axes de l'utilisateur) en [x, y] interne
 * (lon/lat pour les SRC géographiques, E/N pour les projetés).
 * @param {string} id @param {number} a @param {number} b
 * @returns {[number, number]}
 */
export function inputToXY(id, a, b) {
  return getCrs(id).kind === 'geographic' ? [b, a] : [a, b];
}
/** Inverse de inputToXY. @param {string} id @param {[number,number]} xy @returns {[number,number]} */
export function xyToInput(id, xy) {
  return getCrs(id).kind === 'geographic' ? [xy[1], xy[0]] : [xy[0], xy[1]];
}

/**
 * Transforme des coordonnées [x, y] (lon/lat ou E/N) d'un SRC à un autre :
 * inverse de projection (affinée) → changement de datum (Helmert) → projection.
 * @param {string} from @param {string} to @param {[number, number]} xy
 * @returns {[number, number]}
 */
export function transform(from, to, xy) {
  if (from === to) return [xy[0], xy[1]];
  const src = getCrs(from), dst = getCrs(to);
  let ll = src.kind === 'projected' ? projInverse(from, xy) : [xy[0], xy[1]];
  ll = datumShiftLL(src.datum, dst.datum, ll[0], ll[1]);
  const r = dst.kind === 'projected' ? converter(baseGeographic(to), to).forward(ll) : ll;
  if (!Number.isFinite(r[0]) || !Number.isFinite(r[1])) throw new Error('Transformation impossible pour ces coordonnées');
  return [r[0], r[1]];
}

/** SRC géographique de base d'un SRC (même datum). @param {string} id */
export function baseGeographic(id) { return getCrs(id).datum === 'merchich' ? 'EPSG:4261' : 'EPSG:4326'; }

/**
 * Inverse d'une projection, affinée par itérations de Newton sur les formules directes
 * (exactes). L'inverse de proj4js pour le Lambert conique converge à ~1e-8° (≈ 2 mm) ;
 * l'affinage ramène l'erreur aller-retour sous le micromètre.
 * @param {string} id @param {[number,number]} xy @returns {[number,number]}
 */
function projInverse(id, xy) {
  const conv = converter(baseGeographic(id), id);
  let [lon, lat] = conv.inverse([xy[0], xy[1]]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [NaN, NaN];
  const h = 1e-7;
  for (let k = 0; k < 4; k++) {
    const f = conv.forward([lon, lat]);
    const ex = xy[0] - f[0], ey = xy[1] - f[1];
    if (Math.abs(ex) < 1e-7 && Math.abs(ey) < 1e-7) break;
    const fl = conv.forward([lon + h, lat]);
    const fp = conv.forward([lon, lat + h]);
    const a = (fl[0] - f[0]) / h, b = (fp[0] - f[0]) / h, c = (fl[1] - f[1]) / h, d = (fp[1] - f[1]) / h;
    const det = a * d - b * c;
    if (!Number.isFinite(det) || det === 0) break;
    lon += (d * ex - b * ey) / det;
    lat += (-c * ex + a * ey) / det;
  }
  return [lon, lat];
}

/** @param {string} from @param {[number,number]} xy @returns {{lon:number, lat:number}} */
export function toWGS84(from, xy) {
  const [lon, lat] = transform(from, 'EPSG:4326', xy);
  return { lon, lat };
}
/** @param {string} to @param {number} lon @param {number} lat @returns {[number,number]} */
export function fromWGS84(to, lon, lat) { return transform('EPSG:4326', to, [lon, lat]); }

/** @param {[number,number,number,number]} bbox @param {number} lon @param {number} lat @param {number} [marginDeg] */
export function inBBox(bbox, lon, lat, marginDeg = 0) {
  return lon >= bbox[0] - marginDeg && lon <= bbox[2] + marginDeg && lat >= bbox[1] - marginDeg && lat <= bbox[3] + marginDeg;
}

/** Fuseau UTM (Nord) contenant une longitude. @param {number} lon */
export function utmZoneFor(lon) { return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1)); }

/**
 * SRC projetés marocains dont l'emprise contient un point WGS 84 (zones Lambert en premier).
 * @param {number} lon @param {number} lat @returns {string[]}
 */
export function suggestProjected(lon, lat) {
  const out = CRS_LIST.filter((c) => c.kind === 'projected' && c.datum === 'merchich' && inBBox(c.bbox, lon, lat)).map((c) => c.id);
  const z = utmZoneFor(lon);
  if (z >= 28 && z <= 30) out.push(`EPSG:326${z}`);
  return out;
}

/** Zone Lambert recommandée pour un point WGS 84 (la plus centrale si chevauchement). @param {number} lon @param {number} lat */
export function bestLambertZone(lon, lat) {
  const cands = CRS_LIST.filter((c) => c.datum === 'merchich' && c.kind === 'projected' && inBBox(c.bbox, lon, lat));
  if (!cands.length) return null;
  const lat0 = { 'EPSG:26191': 33.3, 'EPSG:26192': 29.7, 'EPSG:26194': 26.1, 'EPSG:26195': 22.5 };
  cands.sort((a, b) => Math.abs(lat - lat0[/** @type {keyof typeof lat0} */ (a.id)]) - Math.abs(lat - lat0[/** @type {keyof typeof lat0} */ (b.id)]));
  return cands[0].id;
}

/**
 * Contrôle de cohérence d'une coordonnée saisie.
 * @param {string} id SRC de la saisie
 * @param {[number,number]} xy coordonnées internes (lon/lat ou E/N)
 * @returns {{ ok: boolean, errors: string[], warnings: string[], wgs84: {lon:number, lat:number}|null, suggestions: string[] }}
 */
export function checkCoordinate(id, xy) {
  const c = getCrs(id);
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];
  /** @type {string[]} */ const suggestions = [];
  const [x, y] = xy;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, errors: ['Les deux coordonnées doivent être des nombres.'], warnings, wgs84: null, suggestions };
  }
  if (c.kind === 'geographic') {
    if (Math.abs(y) > 90) errors.push('Latitude hors de l’intervalle [−90°, 90°].');
    if (Math.abs(x) > 180) errors.push('Longitude hors de l’intervalle [−180°, 180°].');
    if (!errors.length && !inBBox(MOROCCO_BBOX, x, y, 0.5)) {
      if (inBBox(MOROCCO_BBOX, y, x, 0.5)) warnings.push('Latitude et longitude semblent inversées (la latitude du Maroc est entre 21° et 36° N, la longitude est négative).');
      else if (inBBox(MOROCCO_BBOX, -x, y, 0.5)) warnings.push('Longitude positive : au Maroc, la longitude Ouest doit être négative.');
      else warnings.push('Ce point est situé hors du Maroc.');
    }
    if (Math.abs(x) > 1000 || Math.abs(y) > 1000) errors.push('Valeurs trop grandes pour des degrés : s’agit-il de coordonnées en mètres (Lambert ou UTM) ?');
  } else {
    if (Math.abs(x) < 360 && Math.abs(y) < 360) errors.push('Valeurs trop petites pour des mètres : s’agit-il de degrés (WGS 84) ?');
  }
  if (errors.length) return { ok: false, errors, warnings, wgs84: null, suggestions };

  /** @type {{lon:number, lat:number}|null} */
  let wgs84 = null;
  try { wgs84 = toWGS84(id, xy); } catch {
    return { ok: false, errors: ['Transformation impossible : coordonnées incompatibles avec le système choisi.'], warnings, wgs84: null, suggestions };
  }
  if (!inBBox(c.bbox, wgs84.lon, wgs84.lat, 0.25)) {
    warnings.push(`Le point (${wgs84.lat.toFixed(4)}°, ${wgs84.lon.toFixed(4)}°) est hors de la zone de validité de « ${c.label} ».`);
    if (c.kind === 'projected') {
      // Quel autre système placerait ce couple de valeurs au Maroc ?
      for (const other of CRS_LIST) {
        if (other.kind !== 'projected' || other.id === id) continue;
        try {
          const p = toWGS84(other.id, xy);
          if (inBBox(other.bbox, p.lon, p.lat) && inBBox(MOROCCO_BBOX, p.lon, p.lat)) suggestions.push(other.id);
        } catch { /* ignore */ }
      }
      if (suggestions.length) warnings.push(`Ces valeurs correspondraient plutôt à : ${suggestions.map((s) => getCrs(s).label).join(', ')}.`);
      const sw = toWGS84Safe(id, [y, x]);
      if (sw && inBBox(c.bbox, sw.lon, sw.lat)) warnings.push('X et Y semblent inversés.');
    }
  }
  return { ok: true, errors, warnings, wgs84, suggestions };
}

/** @param {string} id @param {[number,number]} xy */
function toWGS84Safe(id, xy) { try { return toWGS84(id, xy); } catch { return null; } }

/**
 * Convergence des méridiens (angle du nord géographique vers le nord de la grille, en degrés,
 * positif vers l'est) pour un SRC projeté au point WGS 84 donné. Calcul numérique par différences.
 * @param {string} id @param {number} lon @param {number} lat
 */
export function gridConvergence(id, lon, lat) {
  const c = getCrs(id);
  if (c.kind !== 'projected') return 0;
  const d = 1e-4;
  const p0 = fromWGS84(id, lon, lat);
  const p1 = fromWGS84(id, lon, lat + d);
  // azimut grille du méridien (nord vrai) ; la convergence est son opposé
  const azTrueNorthInGrid = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]) * 180 / Math.PI;
  return -azTrueNorthInGrid;
}

/**
 * Facteur d'échelle ponctuel (linéaire) d'un SRC projeté, par différences finies
 * géodésiques sur l'ellipsoïde WGS 84 (approximation suffisante pour l'information).
 * @param {string} id @param {number} lon @param {number} lat
 * @param {(lat1:number, lon1:number, lat2:number, lon2:number)=>number} geodesicDistance
 */
export function pointScaleFactor(id, lon, lat, geodesicDistance) {
  const d = 0.001;
  const p0 = fromWGS84(id, lon, lat);
  const p1 = fromWGS84(id, lon + d, lat);
  const grid = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  return grid / geodesicDistance(lat, lon, lat, lon + d);
}

/** Description du datum / transformation, pour affichage. @param {string} id */
export function datumInfo(id) {
  const c = getCrs(id);
  if (c.datum === 'wgs84') return { datum: 'WGS 84', ellipsoid: 'WGS 84 (a = 6 378 137 m, 1/f = 298,257223563)', transformation: 'Aucune (identique au GPS)', accuracy: 0 };
  return {
    datum: 'Merchich (EPSG:6261)',
    ellipsoid: 'Clarke 1880 IGN (a = 6 378 249,2 m, 1/f = 293,466021293627)',
    transformation: datumShift.custom
      ? `${datumShift.source} : TOWGS84 = ${datumShift.params.join(', ')}`
      : 'EPSG:1166 « Merchich to WGS 84 (1) » : translations géocentriques ΔX = 31 m, ΔY = 146 m, ΔZ = 47 m',
    accuracy: datumShift.custom ? null : 7,
  };
}
