import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crs from '../../src/core/crs.js';
import { parseCSV, guessMapping, guessCoordinateKind, rowsToPoints, toCSV } from '../../src/io/csv.js';
import { toGeoJSON, parseGeoJSON, geojsonToItems, toKML, toGPX, toDXF } from '../../src/io/formats.js';
import { parseNMEA, checksumOk } from '../../src/services/nmea.js';
import { combineFixes } from '../../src/services/gps.js';

const square = {
  id: 'f-sq', projectId: 'p', type: 'parcel', name: 'Parcelle A', code: 'agricole', crsId: 'EPSG:26191', method: 'auto',
  vertices: [{ x: 400000, y: 380000, label: 'B1' }, { x: 400010, y: 380000, label: 'B2' }, { x: 400010, y: 380010, label: 'B3' }, { x: 400000, y: 380010, label: 'B4' }],
};
const pointLambert = (() => {
  const w = crs.toWGS84('EPSG:26191', [386512.35, 371204.88]);
  return { id: 'f-pt', projectId: 'p', type: 'point', num: '12', name: 'Borne 12', code: 'borne', wgs84: { lat: w.lat, lon: w.lon }, input: { crsId: 'EPSG:26191', x: 386512.35, y: 371204.88 }, accuracy: null, source: 'manual' };
})();

test('CSV : séparateur « ; », virgule décimale, correspondance automatique des colonnes', () => {
  const t = 'Point;X;Y;Code\nB1;386512,35;371204,88;borne\nB2;386640,12;371198,40;borne\n';
  const p = parseCSV(t);
  assert.equal(p.delimiter, ';');
  const m = guessMapping(p.fields);
  assert.deepEqual([m.name, m.x, m.y, m.code], ['Point', 'X', 'Y', 'Code']);
  const r = rowsToPoints(p.rows, /** @type {any} */ (m), 'EPSG:26191');
  assert.equal(r.errors.length, 0);
  assert.equal(r.points[1].x, 386640.12);
  assert.equal(r.points[0].name, 'B1');
});

test('CSV sans en-tête et lat/lon en DMS', () => {
  let p = parseCSV('1,386512.35,371204.88\n2,386640.12,371198.40\n');
  assert.deepEqual(p.fields, ['col1', 'col2', 'col3']);
  const m = guessMapping(p.fields);
  assert.deepEqual([m.name, m.x, m.y], ['col1', 'col2', 'col3']);
  p = parseCSV('nom,lon,lat\nA,"6°51\'W","34°01\'N"\n');
  const r = rowsToPoints(p.rows, /** @type {any} */ (guessMapping(p.fields)), 'EPSG:4326');
  assert.ok(Math.abs(r.points[0].x + (6 + 51 / 60)) < 1e-12);
  assert.ok(Math.abs(r.points[0].y - (34 + 1 / 60)) < 1e-12);
});

test('CSV : lignes invalides signalées', () => {
  const p = parseCSV('nom;x;y\nA;abc;12\nB;380000;370000\n');
  const r = rowsToPoints(p.rows, /** @type {any} */ (guessMapping(p.fields)), 'EPSG:26191');
  assert.equal(r.points.length, 1);
  assert.equal(r.errors.length, 1);
});

test('Détection du type de coordonnées (le SRC exact reste à confirmer)', () => {
  assert.equal(guessCoordinateKind([[-6.85, 34.02]]).kind, 'degrees');
  assert.equal(guessCoordinateKind([[34.02, -6.85]]).swapped, true);
  assert.equal(guessCoordinateKind([[365968, 3765000]]).kind, 'utm');
  assert.equal(guessCoordinateKind([[386512, 371204]]).kind, 'lambert');
  assert.equal(guessCoordinateKind([[386512, 371204]]).suggestion, null);
});

test('Export CSV : valeurs saisies restituées sans altération, sommets de parcelle', () => {
  const out = toCSV([pointLambert, square], 'EPSG:26191');
  assert.ok(out.startsWith('﻿'));
  assert.ok(out.includes('386512.350,371204.880'));
  assert.ok(out.includes('X_26191'));
  assert.equal(out.trim().split('\r\n').length, 1 + 1 + 4);
  const fr = toCSV([pointLambert], 'EPSG:26191', { delimiter: ';', decimal: ',' });
  assert.ok(fr.includes('386512,350;371204,880'));
});

test('GeoJSON : RFC 7946 (WGS 84) et variante projetée avec membre crs ; aller-retour', () => {
  const g = JSON.parse(toGeoJSON([pointLambert, square]));
  assert.equal(g.features.length, 2);
  assert.equal(g.crs, undefined);
  const poly = g.features[1];
  assert.equal(poly.geometry.type, 'Polygon');
  assert.equal(poly.geometry.coordinates[0].length, 5);
  assert.ok(Math.abs(poly.properties.superficie_m2 - 100) < 1e-6);
  const gp = toGeoJSON([square], { projectedCrsId: 'EPSG:26191' });
  const parsed = parseGeoJSON(gp);
  assert.equal(parsed.declaredCrs, 'EPSG:26191');
  const items = geojsonToItems(parsed.features, 'EPSG:26191');
  assert.equal(items[0].type, 'parcel');
  assert.equal(items[0].vertices.length, 4);
  assert.deepEqual([items[0].vertices[2].x, items[0].vertices[2].y], [400010, 380010]);
});

test('KML et GPX bien formés', () => {
  const k = toKML([pointLambert, square], { project: { name: 'Essai & <test>' } });
  assert.ok(k.includes('<Polygon>') && k.includes('Essai &amp; &lt;test&gt;'));
  assert.ok(/Superficie : 100,00/.test(k));
  const g = toGPX([pointLambert, square]);
  assert.ok(g.includes('<wpt lat="') && g.includes('<trkseg>'));
  assert.equal((g.match(/<trkpt /g) || []).length, 5);
});

test('DXF R12 : structure valide, coordonnées projetées, polyligne fermée', () => {
  const d = toDXF([pointLambert, square], 'EPSG:26191');
  const lines = d.trimEnd().split('\r\n');
  assert.equal(lines.length % 2, 0);
  assert.equal(lines[lines.length - 1], 'EOF');
  assert.ok(d.includes('AC1009'));
  assert.ok(d.includes('386512.3500'));
  assert.ok(d.includes('POLYLINE') && d.includes('SEQEND'));
  assert.equal((d.match(/\r\nVERTEX\r\n/g) || []).length, 4);
  assert.ok(d.includes('S=100.00 m2'));
  assert.throws(() => toDXF([square], 'EPSG:4326'));
});

test('NMEA : GGA avec somme de contrôle, qualité RTK', () => {
  const s = '$GPGGA,123519,4807.038,N,01131.000,E,4,08,0.9,545.4,M,46.9,M,,*42';
  assert.equal(checksumOk(s), true);
  const r = parseNMEA(s);
  assert.equal(r?.type, 'GGA');
  assert.ok(Math.abs(r.lat - (48 + 7.038 / 60)) < 1e-12);
  assert.equal(r.qualityLabel, 'RTK fixé');
  assert.equal(parseNMEA('$GPGGA,123519*00'), null);
});

test('Moyenne GPS pondérée et précision rapportée prudemment', () => {
  const fixes = [
    { lat: 34.02, lon: -6.85, accuracy: 4 }, { lat: 34.02001, lon: -6.85, accuracy: 4 }, { lat: 34.02, lon: -6.85001, accuracy: 8 },
  ].map((f) => ({ ...f, altitude: null, altitudeAccuracy: null, heading: null, speed: null, timestamp: 0, source: 't' }));
  const r = combineFixes(fixes, 2, 10, 3);
  assert.equal(r.samples, 3);
  assert.equal(r.met, true);
  assert.ok(r.lat > 34.02 && r.lat < 34.02001);
  assert.ok(r.accuracy >= 4, 'précision non surévaluée');
});
