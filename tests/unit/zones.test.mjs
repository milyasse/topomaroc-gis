import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Z from '../../src/core/zones.js';
import * as crs from '../../src/core/crs.js';
import { analyzeParcel } from '../../src/core/parcel.js';

test('Bandes Lambert déduites des domaines d’usage EPSG', () => {
  const b = Object.fromEntries(Z.LAMBERT_BANDS.map((x) => [x.id, x]));
  assert.ok(Math.abs(b['EPSG:26191'].min - 31.5) < 1e-9);
  assert.ok(Math.abs(b['EPSG:26192'].min - 27.665) < 1e-9);
  assert.ok(Math.abs(b['EPSG:26194'].min - 24.3) < 1e-9);
  // bandes contiguës, sans trou
  for (let i = 1; i < Z.LAMBERT_BANDS.length; i++) assert.equal(Z.LAMBERT_BANDS[i].max, Z.LAMBERT_BANDS[i - 1].min);
});

test('Zone Lambert et fuseau UTM de villes marocaines', () => {
  const cases = [
    ['Tanger', -5.81, 35.77, 'EPSG:26191', 'EPSG:32630'],
    ['Rabat', -6.85, 34.02, 'EPSG:26191', 'EPSG:32629'],
    ['Oujda', -1.91, 34.68, 'EPSG:26191', 'EPSG:32630'],
    ['Marrakech', -8.0, 31.63, 'EPSG:26191', 'EPSG:32629'],
    ['Agadir', -9.6, 30.42, 'EPSG:26192', 'EPSG:32629'],
    ['Guelmim', -10.06, 28.99, 'EPSG:26192', 'EPSG:32629'],
    ['Laâyoune', -13.2, 27.15, 'EPSG:26194', 'EPSG:32628'],
    ['Dakhla', -15.94, 23.7, 'EPSG:26195', 'EPSG:32628'],
  ];
  for (const [n, lon, lat, lz, uz] of cases) {
    assert.equal(Z.zoneAt(lon, lat), lz, n);
    assert.equal(Z.zoneAt(lon, lat, 'utm'), uz, n);
    // la zone choisie contient bien le point dans son domaine EPSG
    assert.ok(crs.inBBox(crs.getCrs(lz).bbox, lon, lat, 0.01), `${n} dans le domaine de ${lz}`);
  }
});

test('Hors du Maroc : pas de bascule', () => {
  assert.equal(Z.zoneAt(2.35, 48.85), null);
  assert.equal(Z.zoneFor(2.35, 48.85, 'lambert', 'EPSG:26192'), null);
});

test('Hystérésis le long de la limite Nord / Sud (31,5° N)', () => {
  // En venant du nord, on reste en zone Nord jusqu'à 31,48° N
  assert.equal(Z.zoneFor(-8, 31.49, 'lambert', 'EPSG:26191'), 'EPSG:26191');
  assert.equal(Z.zoneFor(-8, 31.475, 'lambert', 'EPSG:26191'), 'EPSG:26192');
  // En venant du sud, on reste en zone Sud jusqu'à 31,52° N
  assert.equal(Z.zoneFor(-8, 31.51, 'lambert', 'EPSG:26192'), 'EPSG:26192');
  assert.equal(Z.zoneFor(-8, 31.53, 'lambert', 'EPSG:26192'), 'EPSG:26191');
  // Sans zone courante : limite exacte
  assert.equal(Z.zoneAt(-8, 31.5), 'EPSG:26191');
  assert.equal(Z.zoneAt(-8, 31.4999), 'EPSG:26192');
});

test('Hystérésis UTM (limite 29/30 à 6° W)', () => {
  assert.equal(Z.zoneFor(-5.99, 34, 'utm', 'EPSG:32629'), 'EPSG:32629');
  assert.equal(Z.zoneFor(-5.99, 34, 'utm', null), 'EPSG:32630');
  assert.equal(Z.zoneFor(-5.95, 34, 'utm', 'EPSG:32629'), 'EPSG:32630');
});

test('Famille d’un système', () => {
  assert.equal(Z.familyOf('EPSG:26194'), 'lambert');
  assert.equal(Z.familyOf('EPSG:32628'), 'utm');
  assert.equal(Z.familyOf('EPSG:4326'), null);
  assert.equal(Z.familyOf('EPSG:4261'), null);
});

test('Parcelle WGS 84 à Agadir : superficie plane calculée en Lambert Sud', () => {
  const lon = -9.6, lat = 30.42, d = 0.001;
  const v = [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d]].map(([x, y]) => ({ x, y }));
  const r = analyzeParcel(v, 'EPSG:4326', { method: 'plane' });
  assert.equal(r.planeCrsId, 'EPSG:26192');
});
