// @ts-check
/**
 * Fonds de carte. Pour changer de fournisseur, modifier uniquement cette liste.
 * Aucun fond n'est une référence cadastrale ; les limites affichées relèvent des fournisseurs.
 *
 * Disponibilité mesurée au Maroc (docs/resultats-tests/tuiles.json, GitHub Actions) :
 *  - Esri World Imagery : imagerie jusqu'au zoom 18 en zone rurale, 19 en ville, 17 à Dakhla ;
 *    au-delà, image grise « pas de données » → couche `smart` (repli automatique, image agrandie).
 *  - Esri Clarity : imagerie souvent plus récente/nette jusqu'au zoom 17 en rural (404 au-delà).
 *  - Sentinel-2 cloudless (EOX) : 10 m, jusqu'au zoom 18 (vue d'ensemble, récente).
 *
 * Conditions principales :
 *  - OpenStreetMap : attribution, usage modéré, pas de téléchargement massif (politique OSMF).
 *  - Esri : attribution ; usage régi par les conditions Esri/ArcGIS.
 *  - OpenTopoMap : CC-BY-SA, usage modéré.
 *  - CARTO : attribution ; licence entreprise pour un usage commercial.
 *  - EOX Sentinel-2 cloudless 2023 : CC BY-NC-SA 4.0 (usage NON commercial).
 */
export const BASEMAPS = [
  {
    id: 'osm', label: 'Plan (OpenStreetMap)', group: 'plan',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 22, maxNativeZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Contributeurs OpenStreetMap</a>' },
  },
  {
    id: 'sat', label: 'Satellite Esri (meilleure résolution auto)', group: 'satellite', smart: true,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 22, maxNativeZoom: 19, attribution: 'Imagerie &copy; Esri, Maxar, Earthstar Geographics, GIS User Community' },
  },
  {
    id: 'sat-clarity', label: 'Satellite Esri Clarity (images récentes)', group: 'satellite', smart: true,
    url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 22, maxNativeZoom: 19, attribution: 'Imagerie &copy; Esri, Maxar, Earthstar Geographics (Clarity)' },
  },
  {
    id: 'sat-s2', label: 'Satellite Sentinel-2 2023 (vue d’ensemble)', group: 'satellite', smart: true,
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg',
    options: { maxZoom: 22, maxNativeZoom: 18, attribution: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> par EOX IT Services GmbH (données Copernicus Sentinel 2023, modifiées) — CC BY-NC-SA 4.0' },
  },
  {
    id: 'topo', label: 'Relief (OpenTopoMap)', group: 'plan',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 22, maxNativeZoom: 17, subdomains: 'abc', attribution: '&copy; Contributeurs OpenStreetMap, SRTM | Style &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)' },
  },
  {
    id: 'light', label: 'Fond clair (CARTO)', group: 'plan',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    options: { maxZoom: 22, maxNativeZoom: 20, subdomains: 'abcd', attribution: '&copy; Contributeurs OpenStreetMap &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' },
  },
  {
    id: 'custom', label: 'Fond personnalisé (URL XYZ)', group: 'autre', url: null, custom: true,
    options: { maxZoom: 22, attribution: '' },
  },
  {
    id: 'none', label: 'Sans fond (hors ligne)', group: 'autre', url: null,
    options: { maxZoom: 22, attribution: '' },
  },
];
