// @ts-check
/** Page « Version de l'application » : numéro, publication, mode d'installation, mises à jour, nouveautés. */
import { h, icon, btn, mount, toast } from './dom.js';
import { APP_VERSION, APP_DATE, CHANGELOG, buildId } from '../version.js';

const REPO = 'https://github.com/milyasse/topomaroc-gis';

/** Publication en ligne actuelle (version.txt écrit par la CI), sans cache. */
async function onlineBuild() {
  try {
    const r = await fetch(new URL('../../version.txt', import.meta.url), { cache: 'no-store' });
    return r.ok ? (await r.text()).trim().slice(0, 7) : null;
  } catch { return null; }
}

/** @param {number} b */
const fmtBytes = (b) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`);

/** @param {HTMLElement} root */
export async function render(root) {
  const build = await buildId();
  const dl = h('dl.about-kv');
  const row = (/** @type {string} */ k, /** @type {any} */ v) => [h('dt', null, k), h('dd', null, v)];
  const standalone = matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
  const status = h('p.small', { 'aria-live': 'polite' });

  const paintInfo = async () => {
    /** @type {any[]} */ const rows = [
      row('Version', h('b', null, `v${APP_VERSION}`)),
      row('Date de la version', new Date(APP_DATE).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })),
      row('Publication', build ? h('a', { href: `${REPO}/commit/${build}`, target: '_blank', rel: 'noopener' }, build) : 'locale (non publiée)'),
      row('Mode', standalone ? 'Application installée (écran d’accueil)' : 'Navigateur web'),
    ];
    try {
      const keys = (await caches.keys()).filter((k) => k.startsWith('topomaroc-'));
      rows.push(row('Hors connexion', keys.length ? `prêt (cache ${keys[0].slice(10, 17)})` : 'pas encore installé'));
    } catch { rows.push(row('Hors connexion', 'non disponible')); }
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage != null) rows.push(row('Stockage utilisé', `${fmtBytes(est.usage)}${est.quota ? ` sur ${fmtBytes(est.quota)}` : ''}`));
    } catch { /* */ }
    rows.push(row('Code source', h('a', { href: REPO, target: '_blank', rel: 'noopener' }, 'github.com/milyasse/topomaroc-gis')));
    mount(dl, rows.flat());
  };

  const check = btn('Rechercher une mise à jour', { variant: 'primary', onclick: async () => {
    /** @type {HTMLButtonElement} */ (check).disabled = true;
    status.textContent = 'Vérification…';
    try {
      if (!navigator.onLine) { status.textContent = 'Hors connexion : vérification impossible. La version installée reste utilisable.'; return; }
      const online = await onlineBuild();
      const reg = await navigator.serviceWorker?.getRegistration?.();
      await reg?.update().catch(() => {});
      if (!online) status.textContent = 'Version publiée introuvable (exécution locale).';
      else if (!build || online === build) { status.textContent = `Vous utilisez la dernière version (v${APP_VERSION}, publication ${online}).`; toast('Application à jour.', 'ok'); }
      else status.textContent = `Nouvelle publication disponible (${online}). Touchez « Mettre à jour » dans la bande en bas de l’écran, ou rechargez la page.`;
    } finally { /** @type {HTMLButtonElement} */ (check).disabled = false; }
  } }, 'download');

  mount(root,
    h('div.about-hero', null, h('img', { src: 'icons/icon.svg', alt: '' }),
      h('div', null, h('div.small.muted', null, 'TopoMaroc GIS'), h('div.v-big', { id: 'about-version' }, `Version ${APP_VERSION}`),
        h('div.small', null, build ? `publication ${build}` : 'exécution locale'))),
    dl,
    h('div.row', null, check), status,
    h('h3', null, 'Historique des versions'),
    CHANGELOG.map((c, i) => h(`div.changelog${i === 0 ? '.current' : ''}`, null,
      h('b', null, `v${c.version}`, i === 0 ? ' (installée)' : ''), h('small.muted', null, ` · ${new Date(c.date).toLocaleDateString('fr-FR')}`),
      h('ul', null, c.items.map((it) => h('li', null, it))))),
    h('p.small.muted', null, icon('info'), ' Numérotation : majeur.mineur.correctif. Le numéro de publication (7 caractères) identifie exactement le code en ligne sur GitHub.'),
  );
  await paintInfo();
}
