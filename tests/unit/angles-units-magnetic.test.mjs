import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../../src/core/angles.js';
import * as U from '../../src/core/units.js';
import * as M from '../../src/core/magnetic.js';

const REF = JSON.parse(fs.readFileSync(new URL('../reference/proj_reference.json', import.meta.url), 'utf8'));

test('Lecture des angles (décimal, virgule, DMS, hémisphères)', () => {
  assert.equal(A.parseAngle('-6.8498'), -6.8498);
  assert.equal(A.parseAngle('6,8498 W'), -6.8498);
  assert.equal(A.parseAngle('6,8498 O'), -6.8498);
  assert.ok(Math.abs(A.parseAngle('33°58\'12.3"N') - (33 + 58 / 60 + 12.3 / 3600)) < 1e-12);
  assert.ok(Math.abs(A.parseAngle('33 58 12.3') - (33 + 58 / 60 + 12.3 / 3600)) < 1e-12);
  assert.ok(Math.abs(A.parseAngle('S 22:30:00') + 22.5) < 1e-12);
  assert.ok(Number.isNaN(A.parseAngle('33°75\'')));
  assert.ok(Number.isNaN(A.parseAngle('abc')));
});

test('Lecture des nombres (virgule, espaces de milliers)', () => {
  assert.equal(A.parseNumber('380 000,125'), 380000.125);
  assert.equal(A.parseNumber('380000.125'), 380000.125);
  assert.ok(Number.isNaN(A.parseNumber('12a')));
});

test('DMS et grades', () => {
  assert.equal(A.toDMS(33.97008333, 1, ['N', 'S']), '33°58′12,3″ N'.replace(',', '.'));
  assert.equal(A.toDMS(-6.5, 0), '-6°30′00″');
  assert.equal(A.degToGrad(90), 100);
  assert.equal(A.gradToDeg(-6), -5.4);
  assert.equal(A.formatBearing(90, 'grad'), '100.0000 gr');
});

test('Gisements plans', () => {
  assert.equal(A.gridBearing([0, 0], [0, 10]), 0);
  assert.equal(A.gridBearing([0, 0], [10, 0]), 90);
  assert.equal(A.gridBearing([0, 0], [0, -10]), 180);
  assert.equal(A.gridBearing([0, 0], [-10, 0]), 270);
  assert.equal(A.cardinal(44), 'NE');
  assert.equal(A.cardinal(270), 'O');
});

test('Unités de superficie et format cadastral ha a ca', () => {
  assert.equal(U.formatHaACa(12530.4).replace(/ /g, ' '), '1 ha 25 a 30 ca');
  assert.equal(U.formatHaACa(100).replace(/ /g, ' '), '0 ha 01 a 00 ca');
  assert.equal(U.formatArea(12530.4, 'ha').replace(/ /g, ' '), '1,2530 ha');
  assert.equal(U.formatArea(12530.4, 'a').replace(/ /g, ' '), '125,3040 a');
  assert.equal(U.formatArea(1234567.891, 'm2').replace(/ /g, ' '), '1 234 567,89 m²');
  assert.equal(U.formatArea(2.5e6, 'km2').replace(/ /g, ' '), '2,500000 km²');
  assert.equal(U.formatNavDistance(4.26).replace(/ /g, ' '), '4,3 m');
  assert.equal(U.formatNavDistance(1520).replace(/ /g, ' '), '1,52 km');
});

test('WMM 2025 : déclinaison identique à la référence NOAA (pygeomag)', () => {
  const model = M.parseCOF(fs.readFileSync(new URL('../../vendor/wmm/WMM2025.COF', import.meta.url), 'utf8'));
  assert.equal(model.epoch, 2025);
  assert.ok(REF.declination.length >= 4);
  for (const r of REF.declination) {
    const f = M.magneticField(model, r.lat, r.lon, 0, r.year);
    assert.ok(Math.abs(f.declination - r.decl) < 1e-6, `${f.declination} vs ${r.decl}`);
    assert.equal(f.valid, true);
  }
  assert.equal(M.magneticField(model, 34, -6.8, 0, 2031).valid, false);
  assert.ok(Math.abs(M.decimalYear(new Date(Date.UTC(2026, 0, 1))) - 2026) < 1e-12);
});
