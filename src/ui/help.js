// @ts-check
/** Aide contextuelle, limites, sources et licences. */
import * as crs from '../core/crs.js';
import { h, icon, mount } from './dom.js';
import { crsInfo } from './coordinput.js';

/** @param {HTMLElement} root */
export async function render(root) {
  let versions = {};
  try { versions = await (await fetch(new URL('../../vendor/VERSIONS.json', import.meta.url))).json(); } catch { /* */ }
  const sec = (/** @type {string} */ title, /** @type {any[]} */ ...c) => h('details.help', null, h('summary', null, title), ...c);
  mount(root,
    sec('Démarrage rapide',
      h('ol', null,
        h('li', null, 'Créez un projet (Accueil → Créer un projet). Sans projet, un projet daté est créé au premier enregistrement.'),
        h('li', null, 'Choisissez le système de coordonnées de vos documents (Lambert Nord, Sud, Sahara… ou WGS 84). La zone Lambert doit être choisie explicitement : les valeurs X/Y des quatre zones se ressemblent.'),
        h('li', null, '« Aller à un point » : saisissez X/Y, démarrez, suivez la distance et la flèche. Un signal retentit dans le rayon choisi.'),
        h('li', null, '« Levé » : collectez des points GPS, avec code, description et photo.'),
        h('li', null, '« Parcelles » : créez un contour (GPS, saisie, import, dessin), lisez superficie et périmètre, éditez le rapport PDF.'),
        h('li', null, 'Exportez (CSV, GeoJSON, KML, GPX, XLSX, DXF, PDF) et sauvegardez régulièrement vos projets.'))),
    sec('Précision : ce que l’application garantit et ne garantit pas',
      h('ul', null,
        h('li', null, 'Calculs : transformations identiques à PROJ (écart < 1 mm), superficies planes exactes (formule de Gauss) et géodésiques exactes (GeographicLib). Tests automatisés à l’appui.'),
        h('li', null, 'Positions GPS : précision du téléphone, typiquement 3 à 10 m à ciel ouvert. La valeur « ±x m » est celle annoncée par l’appareil, sans garantie. Aucune précision centimétrique n’est possible sans récepteur GNSS RTK.'),
        h('li', null, 'Lambert ↔ GPS : la transformation Merchich → WGS 84 publique (EPSG:1166) est exacte à ≈ 7 m. Elle n’est pas définie pour les provinces du Sud (zones Sahara) : l’application le signale.'),
        h('li', null, 'Les superficies calculées à partir de coordonnées Lambert saisies ne dépendent pas du GPS ni de la transformation.'),
        h('li', null, 'Les documents produits ne sont pas des documents cadastraux officiels.'))),
    sec('Systèmes de coordonnées pris en charge', ...crs.CRS_LIST.map((c) => h('div.crs-block', null, h('h4', null, `${c.label} — EPSG:${c.epsg}`), crsInfo(c.id)))),
    sec('Navigation et boussole',
      h('p', null, 'Sans boussole active, la flèche est orientée par rapport au nord (haut de l’écran = nord si la carte n’est pas tournée). Avec la boussole, la flèche est relative au téléphone ; le cap magnétique est corrigé de la déclinaison (WMM 2025). Si le capteur ne fournit pas sa calibration, la direction est marquée « indicative ».'),
      h('p', null, 'Azimut vrai : angle depuis le nord géographique. Gisement : angle depuis le nord de la grille Lambert/UTM (différence = convergence des méridiens). Cap magnétique : angle depuis le nord magnétique.')),
    sec('Hors connexion',
      h('p', null, 'Une fois l’application chargée, l’interface, les calculs, la saisie, le GPS et la sauvegarde fonctionnent sans Internet. Les fonds de carte nécessitent une connexion (seules les tuiles déjà affichées peuvent rester en cache du navigateur) : utilisez le fond « Sans fond » hors réseau. La recherche de lieux nécessite Internet.')),
    sec('Installer l’application',
      h('p', null, 'Android (Chrome) : menu ⋮ → « Installer l’application ». iPhone (Safari) : bouton Partager → « Sur l’écran d’accueil ». La géolocalisation exige HTTPS (fourni par GitHub Pages) et votre autorisation.')),
    sec('Sources, bibliothèques et licences',
      h('ul', null,
        h('li', null, 'Définitions des systèmes : registre EPSG (IOGP), vérifiées avec PROJ.'),
        h('li', null, 'Modèle magnétique : World Magnetic Model 2025 (NOAA/NGA, domaine public).'),
        Object.entries(versions).map(([k, v]) => h('li', null, `${k} ${/** @type {any} */ (v).version} — ${/** @type {any} */ (v).license}`)),
        h('li', null, 'Fonds de carte : © contributeurs OpenStreetMap ; Esri World Imagery ; OpenTopoMap (CC-BY-SA) ; CARTO. Attributions affichées sur la carte.'))),
    h('p.small.muted', null, icon('info'), ' TopoMaroc GIS — application libre, sans compte ni serveur : vos données restent sur votre appareil.'),
  );
}
