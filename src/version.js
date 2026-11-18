// @ts-check
/** Version de l'application (numérotation sémantique) et historique des nouveautés. */
export const APP_VERSION = '1.8.1';
export const APP_DATE = '2026-11-18';

export const CHANGELOG = [
  {
    version: '1.8.1', date: '2026-11-18', items: [
      'PDF en arabe : les noms en arabe (personnes, parcelles, projet, points) s’affichent correctement, lettres liées et de droite à gauche, dans tous les rapports PDF (parcelles et partages, rapport de parcelle, fiche de levé).',
      'Police DejaVu Sans (latin + arabe) intégrée au PDF seulement s’il contient de l’arabe ; disponible hors connexion.',
    ],
  },
  {
    version: '1.8.0', date: '2026-11-18', items: [
      'Liste des parcelles : « Tout sélectionner », puis « PDF parcelles et partages » pour un rapport PDF unique des parcelles cochées.',
      'Ce rapport contient une page de synthèse (chaque parcelle, puis ses lots : nom de la personne, part en %, superficie en m² et ha a ca, total), puis pour chaque parcelle son plan des lots, le tableau des parts et les coordonnées des sommets.',
      'Une parcelle non partagée figure avec son propriétaire éventuel (100 %) ; cocher un lot inclut sa parcelle d’origine.',
    ],
  },
  {
    version: '1.7.1', date: '2026-11-18', items: [
      'Ordinateur (PC, Mac) : « Rapport PDF » et « Exporter » téléchargent directement le fichier (dossier Téléchargements) au lieu d’ouvrir la fenêtre « Partager » du système.',
      'Après chaque enregistrement, un bandeau garde un bouton « Télécharger » au cas où le navigateur aurait bloqué le téléchargement.',
      'Téléphone et tablette : feuille de partage du système (Fichiers, Drive, WhatsApp…) comme avant.',
    ],
  },
  {
    version: '1.7.0', date: '2026-11-18', items: [
      'Partage : « Tracer la direction sur la carte » — touchez 2 points (accrochage aux sommets) ; les limites de partage sont parallèles à la ligne tracée et chaque lot reçoit exactement sa part (% ou superficie).',
      'Partage : « Inverser l’ordre des lots » (le premier lot passe à l’autre extrémité).',
      'Partage : cotes (longueur de chaque côté des lots) affichées sur la carte pendant le découpage, masquées après « Générer les parcelles » ; option pour les masquer.',
      'Correction : le réglage fin de l’orientation conserve le côté d’accès choisi (calcul des façades).',
    ],
  },
  {
    version: '1.6.0', date: '2026-11-18', items: [
      'Ajuster une parcelle à une superficie souhaitée : dans la fiche, saisissez la superficie réelle (m², a, ha) ; la parcelle est modifiée pour l’atteindre exactement.',
      'Deux méthodes : déplacer un côté parallèlement (les autres limites ne bougent pas) ou mise à l’échelle (forme et angles conservés). Aperçu en vert sur la carte avant d’appliquer ; annulable.',
    ],
  },
  {
    version: '1.5.0', date: '2026-11-18', items: [
      'Partage d’une parcelle par superficie : saisissez la superficie revenant à chaque personne (m², ou 12,5 a, 0,25 ha, 1 ha 20 a 30 ca) ; un champ laissé vide reçoit le reste. Les lots sont calculés automatiquement à la superficie exacte.',
      'Contrôle immédiat : superficie attribuée, reste non attribué ou dépassement ; la fiche de chaque lot rappelle la superficie demandée.',
    ],
  },
  {
    version: '1.4.4', date: '2026-11-04', items: [
      'Fond satellite par défaut.',
      'Projection automatique : quand la carte montre une autre région que votre position GPS, la zone suit la carte consultée (retour à la zone GPS en revenant sur votre position).',
      'Parcelle enregistrée dans une autre zone que la sienne : avertissement dans sa fiche et conversion en un geste ; Réglages → « Recalculer dans leur zone » traite aussi les parcelles.',
    ],
  },
  {
    version: '1.4.3', date: '2026-11-04', items: [
      'Mises à jour fiables : une nouvelle version déjà téléchargée est annoncée dès l’ouverture, la recherche se fait aussi au retour dans l’application, et la page « Version » propose « Mettre à jour maintenant ».',
    ],
  },
  {
    version: '1.4.2', date: '2026-11-04', items: [
      'Export PDF : rapport de parcelle complet (superficie, plan coté, carte de situation sur fond satellite, coordonnées des sommets en Lambert/UTM et WGS 84, côtés) — une page par parcelle, puis la fiche des points.',
      'Le rapport PDF de la fiche parcelle inclut aussi la carte de situation (sans connexion : plan coté seul).',
    ],
  },
  {
    version: '1.4.1', date: '2026-11-04', items: [
      'Export direct : le bouton « Exporter » propose les formats ; toucher un format crée le fichier aussitôt, sans seconde validation.',
      'Le dernier format utilisé est proposé en premier ; le système de coordonnées suit la zone des données (options repliables).',
    ],
  },
  {
    version: '1.4.0', date: '2026-10-19', items: [
      'Afficher / masquer chaque parcelle sur la carte (œil dans la liste, Outils → Couches, fiche et bulle de la parcelle), « Afficher uniquement celle-ci », « Tout afficher ».',
      'Masquer une parcelle partagée masque aussi ses lots ; les parcelles masquées restent dans les listes, les calculs, les rapports et les exports.',
      'Page « Version de l’application » : numéro, publication, mode installé, recherche de mise à jour et historique complet.',
    ],
  },
  {
    version: '1.3.0', date: '2026-10-18', items: [
      'Système de projection automatique selon la zone de navigation (position GPS, sinon centre de la carte) : Lambert Nord / Sud / Sahara Nord / Sahara Sud, ou UTM 28 / 29 / 30.',
      'Chaque point collecté est enregistré dans la zone de sa propre position ; recalcul des points existants dans leur zone (Réglages).',
      'Badge « AUTO » et message lors d’un changement de zone ; choix manuel toujours possible.',
    ],
  },
  {
    version: '1.2.0', date: '2026-10-18', items: [
      'Déplacement d’un point en édition : nouvelles coordonnées, glisser sur la carte ou position GPS actuelle ; les parcelles qui utilisent ce point sont mises à jour.',
      'Couches par projet : superposition de plusieurs projets, chacun avec sa couleur et ses couches Points / Parcelles / Lignes activables.',
      'Pente : relief des parcelles (altitudes, dénivelé, pente moyenne et maximale, exposition) d’après un MNT ; outil « Pente entre deux points » avec profil.',
      'Altitude des points (saisie, GPS ou MNT) et numéro de version de l’application.',
    ],
  },
  {
    version: '1.1.0', date: '2026-10-18', items: [
      'Partage d’une parcelle entre personnes (parts en % ou fractions, propositions, lots colorés, rapport PDF).',
      'Satellite à fort zoom (agrandissement automatique), nouveaux fonds, fond personnalisé.',
      '« + Point » sur la carte, sélection multiple, accrochage et fermeture du dessin, fiche projet.',
    ],
  },
  { version: '1.0.0', date: '2026-10-18', items: ['Première version : systèmes marocains, navigation GPS, levé, superficies, exports, hors ligne.'] },
];

let build = /** @type {string|null} */ (null);
/** Identifiant de la publication (commit), si disponible (fichier version.txt écrit par la CI). */
export async function buildId() {
  if (build !== null) return build;
  try {
    const r = await fetch(new URL(`../version.txt?fresh=${Date.now()}`, import.meta.url), { cache: 'no-store' });
    build = r.ok ? (await r.text()).trim().slice(0, 7) : '';
  } catch { build = ''; }
  return build;
}

/** Libellé complet : « v1.2.0 (abc1234) ». */
export async function versionLabel() {
  const b = await buildId();
  return `v${APP_VERSION}${b ? ` (${b})` : ''}`;
}
