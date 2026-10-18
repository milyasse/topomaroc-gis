// Mesure la disponibilité des tuiles satellite au Maroc par niveau de zoom (exécuté dans GitHub Actions).
// Détecte les tuiles « Map data not yet available » (image de remplacement identique d'un lieu à l'autre).
import crypto from 'node:crypto';
import fs from 'node:fs';
const PLACES = [
  ['Rabat (ville)', 34.0209, -6.8498], ['Saïs rural (Meknès)', 33.95, -5.30], ['Souss rural (Agadir)', 30.35, -9.30],
  ['Haouz rural (Marrakech)', 31.45, -8.10], ['Oriental rural (Oujda)', 34.20, -2.30], ['Dakhla', 23.70, -15.95],
];
const PROVIDERS = {
  esri: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  esri_clarity: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  esri_services: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  eox_s2_2016: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
  eox_s2_2023: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg',
  esri_labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  terrarium: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
};
const tile = (lat, lon, z) => {
  const n = 2 ** z, r = lat * Math.PI / 180;
  return { x: Math.floor((lon + 180) / 360 * n), y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) };
};
const out = { date: new Date().toISOString(), results: [] };
for (const [pid, tpl] of Object.entries(PROVIDERS)) {
  for (const [name, lat, lon] of PLACES) {
    for (const z of (pid === 'terrarium' ? [12, 13, 14, 15, 16] : [14, 16, 17, 18, 19, 20, 21])) {
      const { x, y } = tile(lat, lon, z);
      const url = tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
      let status = 0, size = 0, md5 = '', type = '', cors = '';
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'TopoMaroc-GIS tile availability check', Referer: 'https://milyasse.github.io/topomaroc-gis/', Origin: 'https://milyasse.github.io' } });
        status = r.status; type = r.headers.get('content-type') || ''; cors = r.headers.get('access-control-allow-origin') || '';
        const b = Buffer.from(await r.arrayBuffer()); size = b.length; md5 = crypto.createHash('md5').update(b).digest('hex');
      } catch (e) { status = -1; type = String(e.message); }
      out.results.push({ provider: pid, place: name, z, status, size, md5, type, cors });
      if (pid === 'terrarium' && status === 200 && z === 14) out.terrariumSample = out.terrariumSample || {}, out.terrariumSample[name] = size;
    }
  }
}
// Images identiques sur plusieurs lieux différents au même zoom = image de remplacement (pas de donnée)
const count = {};
for (const r of out.results) if (r.status === 200) count[r.provider + r.md5] = (count[r.provider + r.md5] || new Set()).add(r.place);
for (const r of out.results) r.placeholder = r.status === 200 && (count[r.provider + r.md5]?.size ?? 0) >= 2;
const summary = {};
for (const r of out.results) {
  const k = `${r.provider} | ${r.place}`;
  summary[k] = summary[k] || {};
  summary[k][r.z] = r.status !== 200 ? `HTTP ${r.status}` : r.placeholder ? 'vide' : `ok ${Math.round(r.size / 1024)}k`;
}
out.summary = summary;
fs.mkdirSync('docs/resultats-tests', { recursive: true });
fs.writeFileSync('docs/resultats-tests/tuiles.json', JSON.stringify(out, null, 1));
console.table(summary);
