// @ts-check
/** Version de l'application (numérotation sémantique) et historique des nouveautés. */
export const APP_VERSION = '1.2.0';
export const APP_DATE = '2026-10-18';

export const CHANGELOG = [
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
    const r = await fetch(new URL('../version.txt', import.meta.url), { cache: 'no-store' });
    build = r.ok ? (await r.text()).trim().slice(0, 7) : '';
  } catch { build = ''; }
  return build;
}

/** Libellé complet : « v1.2.0 (abc1234) ». */
export async function versionLabel() {
  const b = await buildId();
  return `v${APP_VERSION}${b ? ` (${b})` : ''}`;
}
