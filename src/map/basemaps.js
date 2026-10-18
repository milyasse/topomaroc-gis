// @ts-check
/**
 * Fonds de carte. Pour changer de fournisseur, modifier uniquement cette liste.
 * Aucun fond n'est une référence cadastrale ; les limites affichées relèvent des fournisseurs.
 *
 * Conditions principales (à respecter par l'exploitant de l'application) :
 *  - OpenStreetMap : attribution obligatoire, usage modéré, pas de téléchargement massif ni
 *    de pré-chargement pour usage hors ligne (politique OSMF « Tile Usage Policy »).
 *  - Esri World Imagery : attribution obligatoire ; usage régi par les conditions Esri/ArcGIS.
 *  - OpenTopoMap : CC-BY-SA, attribution obligatoire, usage modéré, zoom max 17.
 *  - CARTO Positron : attribution obligatoire ; usage gratuit soumis aux conditions CARTO
 *    (licence entreprise requise pour un usage commercial).
 */
export const BASEMAPS = [
  {
    id: 'osm', label: 'Plan (OpenStreetMap)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 21, maxNativeZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Contributeurs OpenStreetMap</a>' },
  },
  {
    id: 'sat', label: 'Satellite (Esri World Imagery)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagerie &copy; Esri, Maxar, Earthstar Geographics, GIS User Community' },
  },
  {
    id: 'topo', label: 'Relief (OpenTopoMap)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 21, maxNativeZoom: 17, subdomains: 'abc', attribution: '&copy; Contributeurs OpenStreetMap, SRTM | Style &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)' },
  },
  {
    id: 'light', label: 'Fond clair (CARTO)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    options: { maxZoom: 21, maxNativeZoom: 20, subdomains: 'abcd', attribution: '&copy; Contributeurs OpenStreetMap &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' },
  },
  {
    id: 'none', label: 'Sans fond (hors ligne)', url: null,
    options: { maxZoom: 22, attribution: '' },
  },
];
