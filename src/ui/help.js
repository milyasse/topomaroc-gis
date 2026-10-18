// @ts-check
/** Aide contextuelle, limites, sources et licences. */
import * as crs from '../core/crs.js';
import { h, icon, mount } from './dom.js';
import { crsInfo } from './coordinput.js';
import { APP_VERSION, APP_DATE, CHANGELOG, versionLabel } from '../version.js';

/** @param {HTMLElement} root */
export async function render(root) {
  let versions = {};
  try { versions = await (await fetch(new URL('../../vendor/VERSIONS.json', import.meta.url))).json(); } catch { /* */ }
  const sec = (/** @type {string} */ title, /** @type {any[]} */ ...c) => h('details.help', null, h('summary', null, title), ...c);
  const label = await versionLabel();
  const about = h('details.help', { open: true }, h('summary', null, icon('info'), `Version ${label}`),
    h('p.small', null, `TopoMaroc GIS ${APP_VERSION} du ${new Date(APP_DATE).toLocaleDateString('fr-FR')}${label.includes('(') ? ` — publication ${label.match(/\((\w+)\)/)?.[1]}` : ''}. Le numéro de publication correspond au code source sur GitHub (milyasse/topomaroc-gis).`),
    CHANGELOG.map((c) => h('div.changelog', null, h('b', null, `v${c.version}`), h('ul', null, c.items.map((i) => h('li', null, i))))));
  mount(root,
    about,
    sec('Démarrage rapide',
      h('ol', null,
        h('li', null, 'Créez un projet (Accueil → Créer un projet). Sans projet, un projet daté est créé au premier enregistrement.'),
        h('li', null, 'Choisissez le système de coordonnées de vos documents (Lambert Nord, Sud, Sahara… ou WGS 84). La zone Lambert doit être choisie explicitement : les valeurs X/Y des quatre zones se ressemblent.'),
        h('li', null, '« Aller à un point » : saisissez X/Y, démarrez, suivez la distance et la flèche. Un signal retentit dans le rayon choisi.'),
        h('li', null, '« Levé » : collectez des points GPS, avec code, description et photo.'),
        h('li', null, '« Parcelles » : créez un contour (GPS, saisie, import, dessin), lisez superficie et périmètre, éditez le rapport PDF.'),
        h('li', null, 'Exportez (CSV, GeoJSON, KML, GPX, XLSX, DXF, PDF) et sauvegardez régulièrement vos projets.'))),
    sec('Nouveautés : carte, sélection, partage',
      h('ul', null,
        h('li', null, 'Bouton orange « + Point » sur la carte : placez des points sans GPS, au réticule (« Placer ici ») ou en touchant la carte ; enchaînez plusieurs points puis « Terminer ».'),
        h('li', null, 'Bouton « Sélection » : touchez des points (ou « Visibles ») puis « Créer une parcelle » (contour automatique, ordre de sélection ou numéros) ou « Ajouter à… » une parcelle existante (insertion au meilleur endroit du contour).'),
        h('li', null, 'Dessin de parcelle : les points et les sommets voisins sont accrochés automatiquement (limites communes exactes) ; touchez le 1er sommet (cercle orange) ou « Fermer la parcelle » pour terminer.'),
        h('li', null, 'Partage : dans une parcelle, « Partager entre personnes » → noms et parts (25, 12,5 ou 1/8…) → « Proposer des découpages » → choisissez une proposition (réglage fin de l’orientation possible) → « Générer les parcelles ». Chaque lot est associé à sa personne, avec sa couleur et sa superficie exacte ; rapport PDF de partage.'),
        h('li', null, 'Satellite : au-delà de la résolution disponible (zoom 18 en zone rurale), l’image est agrandie automatiquement au lieu d’une zone grise ; trois fonds satellite et un fond personnalisé (URL XYZ) dans Outils → Couches.'),
        h('li', null, 'Fiche projet : touchez le projet (accueil ou puce en haut) pour voir statistiques, superficie totale et superficie par personne.'))),
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
