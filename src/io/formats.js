// @ts-check
/** GeoJSON, KML, GPX et DXF (écriture) ; GeoJSON / KML / GPX (lecture). */
import * as crs from '../core/crs.js';
import { formatArea, fmtNum } from '../core/units.js';
import { pointXY, verticesXY, verticesLL, analyze, xmlEsc } from './common.js';

const round = (/** @type {number} */ v, /** @type {number} */ d) => Math.round(v * 10 ** d) / 10 ** d;

// ------------------------------------------------------------------ GeoJSON
/**
 * GeoJSON. Par défaut conforme RFC 7946 (WGS 84, lon/lat). Avec `projectedCrsId`, les
 * coordonnées sont projetées et le membre « crs » (ancienne spécification, lu par QGIS)
 * est ajouté.
 * @param {any[]} features @param {{ projectedCrsId?: string|null, project?: any }} [opts]
 */
export function toGeoJSON(features, opts = {}) {
  const pc = opts.projectedCrsId ?? null;
  const d = pc ? 3 : 9;
  /** @param {[number,number]} p */
  const r = (p) => [round(p[0], d), round(p[1], d)];
  const out = [];
  for (const f of features) {
    const props = { id: f.id, nom: f.name ?? '', numero: f.num ?? '', type: f.type, code: f.code ?? '', description: f.description ?? '', source: f.source ?? '', date: f.takenAt ?? f.createdAt ?? '' };
    if (f.type === 'point') {
      const g = pc ? pointXY(f, pc) : [f.wgs84.lon, f.wgs84.lat];
      out.push({ type: 'Feature', id: f.id, geometry: { type: 'Point', coordinates: r(/** @type {[number,number]} */ (g)) }, properties: { ...props, precision_m: f.accuracy ?? null, saisie_src: f.input?.crsId ?? null, saisie_x: f.input?.x ?? null, saisie_y: f.input?.y ?? null } });
    } else if (f.type === 'parcel' || f.type === 'line') {
      const pts = (pc ? verticesXY(f, pc) : verticesLL(f)).map(r);
      const extra = {};
      if (f.type === 'parcel') {
        const a = analyze(f);
        if (a.valid) Object.assign(extra, { superficie_m2: round(a.area, 3), perimetre_m: round(a.perimeter, 3), methode: a.method, src_calcul: a.method === 'plane' ? a.planeCrsId : 'WGS 84 ellipsoïde' });
      }
      out.push({
        type: 'Feature', id: f.id,
        geometry: f.type === 'parcel' ? { type: 'Polygon', coordinates: [[...pts, pts[0]]] } : { type: 'LineString', coordinates: pts },
        properties: { ...props, src_saisie: f.crsId, sommets: f.vertices.map((/** @type {any} */ v, /** @type {number} */ i) => v.label ?? String(i + 1)), ...extra },
      });
    }
  }
  /** @type {any} */
  const fc = { type: 'FeatureCollection', name: opts.project?.name ?? 'TopoMaroc', features: out };
  if (pc) fc.crs = { type: 'name', properties: { name: `urn:ogc:def:crs:EPSG::${crs.getCrs(pc).epsg}` } };
  return JSON.stringify(fc, null, 1);
}

/**
 * Lit un GeoJSON. Renvoie les entités et le SRC déclaré (membre « crs ») s'il existe.
 * @param {string} text
 */
export function parseGeoJSON(text) {
  const j = JSON.parse(text);
  const feats = j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : [{ type: 'Feature', geometry: j, properties: {} }];
  let declared = null;
  const name = j.crs?.properties?.name;
  if (typeof name === 'string') {
    const m = name.match(/EPSG:{1,2}(\d+)/i) || name.match(/CRS84/i);
    if (m) declared = m[1] ? `EPSG:${m[1]}` : 'EPSG:4326';
  }
  return { features: feats.filter((/** @type {any} */ f) => f && f.geometry), declaredCrs: declared };
}

/**
 * Convertit des entités GeoJSON (coordonnées [x, y] dans `crsId`) en objets TopoMaroc.
 * @param {any[]} gfeatures @param {string} crsId
 */
export function geojsonToItems(gfeatures, crsId) {
  const items = [];
  const nameOf = (/** @type {any} */ p, /** @type {number} */ i) => p?.nom ?? p?.name ?? p?.Name ?? p?.id ?? p?.numero ?? `${i + 1}`;
  gfeatures.forEach((f, i) => {
    const g = f.geometry; const p = f.properties || {};
    const base = { name: String(nameOf(p, i)), code: p.code ?? '', description: p.description ?? p.desc ?? '' };
    const push = (/** @type {string} */ type, /** @type {number[][]} */ coords) => items.push({ ...base, type, vertices: coords.map((c) => ({ x: c[0], y: c[1] })) });
    if (g.type === 'Point') items.push({ ...base, type: 'point', x: g.coordinates[0], y: g.coordinates[1], z: g.coordinates[2] ?? null });
    else if (g.type === 'MultiPoint') g.coordinates.forEach((/** @type {number[]} */ c, /** @type {number} */ k) => items.push({ ...base, name: `${base.name}-${k + 1}`, type: 'point', x: c[0], y: c[1] }));
    else if (g.type === 'LineString') push('line', g.coordinates);
    else if (g.type === 'MultiLineString') g.coordinates.forEach((/** @type {number[][]} */ c) => push('line', c));
    else if (g.type === 'Polygon') push('parcel', dropClosing(g.coordinates[0]));
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((/** @type {number[][][]} */ c, /** @type {number} */ k) => items.push({ ...base, name: `${base.name}-${k + 1}`, type: 'parcel', vertices: dropClosing(c[0]).map((v) => ({ x: v[0], y: v[1] })) }));
  });
  void crsId;
  return items;
}
/** @param {number[][]} ring */
function dropClosing(ring) {
  if (ring.length > 1) { const a = ring[0], b = ring[ring.length - 1]; if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1); }
  return ring;
}

// ------------------------------------------------------------------ KML
/** @param {any[]} features @param {{ project?: any }} [opts] */
export function toKML(features, opts = {}) {
  const pm = [];
  for (const f of features) {
    const ext = (/** @type {Record<string,any>} */ o) => `<ExtendedData>${Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<Data name="${xmlEsc(k)}"><value>${xmlEsc(v)}</value></Data>`).join('')}</ExtendedData>`;
    const base = { id: f.id, code: f.code ?? '', source: f.source ?? '' };
    if (f.type === 'point') {
      pm.push(`<Placemark><name>${xmlEsc(f.num || f.name || '')}</name><description>${xmlEsc(f.description ?? '')}</description><styleUrl>#pt</styleUrl>${ext({ ...base, precision_m: f.accuracy ?? '' })}<Point><coordinates>${f.wgs84.lon.toFixed(9)},${f.wgs84.lat.toFixed(9)},0</coordinates></Point></Placemark>`);
    } else {
      const ll = verticesLL(f).map(([lon, lat]) => `${lon.toFixed(9)},${lat.toFixed(9)},0`);
      if (f.type === 'parcel') {
        const a = analyze(f);
        const desc = a.valid ? `Superficie : ${formatArea(a.area, 'm2')} (${formatArea(a.area, 'haaca')}) — Périmètre : ${fmtNum(a.perimeter, 2)} m — Méthode : ${a.method === 'plane' ? 'plane (' + crs.getCrs(a.planeCrsId).label + ')' : 'géodésique WGS 84'}` : 'Géométrie invalide';
        pm.push(`<Placemark><name>${xmlEsc(f.name ?? '')}</name><description>${xmlEsc(desc)}</description><styleUrl>#parcelle</styleUrl>${ext({ ...base, superficie_m2: a.valid ? a.area.toFixed(3) : '' })}<Polygon><outerBoundaryIs><LinearRing><coordinates>${[...ll, ll[0]].join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`);
      } else {
        pm.push(`<Placemark><name>${xmlEsc(f.name ?? '')}</name><styleUrl>#ligne</styleUrl>${ext(base)}<LineString><coordinates>${ll.join(' ')}</coordinates></LineString></Placemark>`);
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(opts.project?.name ?? 'TopoMaroc GIS')}</name>
<Style id="pt"><IconStyle><color>ff2c6cf0</color><scale>0.9</scale></IconStyle></Style>
<Style id="parcelle"><LineStyle><color>ff2c6cf0</color><width>2.5</width></LineStyle><PolyStyle><color>402c6cf0</color></PolyStyle></Style>
<Style id="ligne"><LineStyle><color>ffc8781e</color><width>2.5</width></LineStyle></Style>
${pm.join('\n')}
</Document></kml>`;
}

// ------------------------------------------------------------------ GPX
/** @param {any[]} features @param {{ project?: any }} [opts] */
export function toGPX(features, opts = {}) {
  const wpts = [], trks = [];
  for (const f of features) {
    if (f.type === 'point') {
      wpts.push(`<wpt lat="${f.wgs84.lat.toFixed(9)}" lon="${f.wgs84.lon.toFixed(9)}">${f.altitude != null ? `<ele>${f.altitude.toFixed(2)}</ele>` : ''}${f.takenAt ? `<time>${xmlEsc(f.takenAt)}</time>` : ''}<name>${xmlEsc(f.num || f.name || '')}</name><desc>${xmlEsc(f.description ?? '')}</desc><type>${xmlEsc(f.code ?? '')}</type></wpt>`);
    } else {
      const ll = verticesLL(f);
      if (f.type === 'parcel') ll.push(ll[0]);
      trks.push(`<trk><name>${xmlEsc(f.name ?? '')}</name><type>${f.type === 'parcel' ? 'parcelle' : 'ligne'}</type><trkseg>${ll.map(([lon, lat]) => `<trkpt lat="${lat.toFixed(9)}" lon="${lon.toFixed(9)}"/>`).join('')}</trkseg></trk>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TopoMaroc GIS" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${xmlEsc(opts.project?.name ?? 'TopoMaroc GIS')}</name><time>${new Date().toISOString()}</time></metadata>
${wpts.join('\n')}
${trks.join('\n')}
</gpx>`;
}

/**
 * Lecture KML / GPX (via @tmcw/togeojson ; nécessite DOMParser → navigateur).
 * @param {string} text @param {'kml'|'gpx'} kind
 */
export async function parseKmlGpx(text, kind) {
  const tg = await import('../../vendor/togeojson.mjs');
  const dom = new DOMParser().parseFromString(text, 'application/xml');
  if (dom.querySelector('parsererror')) throw new Error(`Fichier ${kind.toUpperCase()} mal formé.`);
  const fc = kind === 'kml' ? tg.kml(dom) : tg.gpx(dom);
  return { features: fc.features.filter((/** @type {any} */ f) => f.geometry), declaredCrs: 'EPSG:4326' };
}

// ------------------------------------------------------------------ DXF (R12 ASCII)
/**
 * DXF AutoCAD R12 (AC1009) : calques POINTS, PARCELLES, LIGNES, NUMEROS, SURFACES.
 * Les coordonnées sont celles du SRC projeté choisi (mètres). Le DXF ne porte pas de SRC :
 * un fichier d'accompagnement le documente.
 * @param {any[]} features @param {string} crsId SRC projeté
 * @param {{ textHeight?: number }} [opts]
 */
export function toDXF(features, crsId, opts = {}) {
  if (crs.getCrs(crsId).kind !== 'projected') throw new Error('L’export DXF nécessite un système projeté (Lambert ou UTM).');
  const th = opts.textHeight ?? 0.5;
  /** @type {(string|number)[]} */
  const o = [];
  const g = (/** @type {number} */ code, /** @type {string|number} */ val) => { o.push(code, val); };
  const f3 = (/** @type {number} */ v) => v.toFixed(4);
  const layers = [['POINTS', 1], ['PARCELLES', 5], ['LIGNES', 3], ['NUMEROS', 7], ['SURFACES', 2]];
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009');
  // emprise
  /** @type {[number,number][]} */
  const all = [];
  for (const f of features) { if (f.type === 'point') all.push(pointXY(f, crsId)); else all.push(...verticesXY(f, crsId)); }
  if (all.length) {
    g(9, '$EXTMIN'); g(10, f3(Math.min(...all.map((p) => p[0])))); g(20, f3(Math.min(...all.map((p) => p[1])))); g(30, '0.0');
    g(9, '$EXTMAX'); g(10, f3(Math.max(...all.map((p) => p[0])))); g(20, f3(Math.max(...all.map((p) => p[1])))); g(30, '0.0');
  }
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
  for (const [name, color] of layers) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const text = (/** @type {string} */ layer, /** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ s, /** @type {number} */ h) => {
    g(0, 'TEXT'); g(8, layer); g(10, f3(x)); g(20, f3(y)); g(30, '0.0'); g(40, h.toFixed(3)); g(1, s.replace(/[\r\n]+/g, ' '));
  };
  for (const f of features) {
    if (f.type === 'point') {
      const [x, y] = pointXY(f, crsId);
      g(0, 'POINT'); g(8, 'POINTS'); g(10, f3(x)); g(20, f3(y)); g(30, f3(f.altitude ?? 0));
      text('NUMEROS', x + th * 0.6, y + th * 0.6, String(f.num || f.name || ''), th);
    } else {
      const pts = verticesXY(f, crsId);
      const layer = f.type === 'parcel' ? 'PARCELLES' : 'LIGNES';
      g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, '0.0'); g(20, '0.0'); g(30, '0.0'); g(70, f.type === 'parcel' ? 1 : 0);
      for (const [x, y] of pts) { g(0, 'VERTEX'); g(8, layer); g(10, f3(x)); g(20, f3(y)); g(30, '0.0'); }
      g(0, 'SEQEND'); g(8, layer);
      f.vertices.forEach((/** @type {any} */ v, /** @type {number} */ i) => text('NUMEROS', pts[i][0] + th * 0.6, pts[i][1] + th * 0.6, String(v.label ?? i + 1), th));
      if (f.type === 'parcel') {
        const a = analyze(f, crsId);
        if (a.valid) {
          const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
          text('SURFACES', cx, cy, `${f.name ?? ''} S=${a.area.toFixed(2)} m2`, th * 1.4);
        }
      }
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  const lines = [];
  for (let i = 0; i < o.length; i += 2) lines.push(String(o[i]).padStart(3, ' '), String(o[i + 1]));
  return lines.join('\r\n') + '\r\n';
}
