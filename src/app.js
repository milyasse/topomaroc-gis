// @ts-check
/** Point d'entrée : initialisation, routage (hash, compatible GitHub Pages), barre d'état, accueil. */
import * as crs from './core/crs.js';
import { formatCoord, formatArea, formatLength } from './core/units.js';
import { state, on, emit, loadSettings, openProject, updateSettings, codeInfo } from './state.js';
import { openDB, requestPersistence } from './services/storage.js';
import { accuracyQuality } from './services/gps.js';
import * as M from './map/map.js';
import { h, icon, btn, mount, toast, modal } from './ui/dom.js';
import { anim, makeSheet } from './ui/anim.js';
import { setLang, t } from './i18n/index.js';
import { crsSelect } from './ui/coordinput.js';
import { analyze } from './io/common.js';

const ROUTES = /** @type {Record<string, { title: string, load: () => Promise<any>, ic: string }>} */ ({
  nav: { title: 'Aller à un point', ic: 'target', load: () => import('./ui/nav.js') },
  survey: { title: 'Levé topographique', ic: 'pin', load: () => import('./ui/survey.js') },
  parcels: { title: 'Parcelles et superficies', ic: 'polygon', load: () => import('./ui/parcels.js') },
  tools: { title: 'Boîte à outils', ic: 'ruler', load: () => import('./ui/tools.js') },
  projects: { title: 'Projets', ic: 'folder', load: () => import('./ui/projects.js') },
  settings: { title: 'Réglages', ic: 'settings', load: () => import('./ui/settings.js') },
  help: { title: 'Aide', ic: 'help', load: () => import('./ui/help.js') },
});

/** @type {(() => void)|null} */ let cleanup = null;
/** @type {ReturnType<typeof makeSheet>} */ let sheet;
let routeSeq = 0;

async function boot() {
  try { await openDB(); } catch (e) {
    document.getElementById('boot-msg')?.replaceChildren(String(/** @type {Error} */ (e).message));
  }
  await loadSettings().catch(() => {});
  setLang(state.settings.lang);
  applyTheme();
  M.initMap(/** @type {HTMLElement} */ (document.getElementById('map')));
  sheet = makeSheet(/** @type {HTMLElement} */ (document.getElementById('sheet')), /** @type {HTMLElement} */ (document.getElementById('sheet-handle')));
  wireChrome();
  if (state.settings.lastProjectId) await openProject(state.settings.lastProjectId).catch(() => openProject(null));
  window.addEventListener('hashchange', route);
  await route();
  document.body.classList.remove('booting');
  registerSW();
  requestPersistence();
}

// ------------------------------------------------------------- Thème
function applyTheme() {
  const s = state.settings;
  const dark = s.theme === 'dark' || (s.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('contrast', !!s.contrast);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b1a26' : '#0f3d5e');
}

// ------------------------------------------------------------- Routage
async function route() {
  const seq = ++routeSeq;
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = hash.split('/');
  const param = rest.join('/') || undefined;
  cleanup?.(); cleanup = null;
  M.closePopup();
  document.querySelectorAll('.dock a').forEach((a) => a.setAttribute('aria-current', String(/** @type {HTMLAnchorElement} */ (a).dataset.route === (name || 'home'))));

  const home = /** @type {HTMLElement} */ (document.getElementById('home'));
  const sh = /** @type {HTMLElement} */ (document.getElementById('sheet'));
  if (!name || name === 'home') {
    sh.hidden = true; document.body.classList.remove('has-sheet');
    renderHome(home);
    home.hidden = false;
    anim.screenIn(home);
    return;
  }
  if (!home.hidden) { await anim.screenOut(home); home.hidden = true; }
  if (name === 'map') { sh.hidden = true; document.body.classList.remove('has-sheet'); M.invalidate(); return; }
  if (name === 'import') {
    const { importWizard, addImportedToProject } = await import('./ui/transfer.js');
    const imp = await importWizard();
    if (imp) await addImportedToProject(imp);
    location.hash = '#/map';
    return;
  }
  const r = ROUTES[name];
  if (!r) { location.hash = '#/home'; return; }
  sh.hidden = false; document.body.classList.add('has-sheet');
  const title = /** @type {HTMLElement} */ (document.getElementById('sheet-title'));
  mount(title, icon(r.ic), h('span', null, r.title));
  const content = /** @type {HTMLElement} */ (document.getElementById('sheet-content'));
  mount(content, h('div.loading', null, h('span.spinner'), 'Chargement…'));
  try {
    const mod = await r.load();
    if (seq !== routeSeq) return;
    mount(content);
    const c = await mod.render(content, param);
    if (seq !== routeSeq) { if (typeof c === 'function') c(); return; }
    cleanup = typeof c === 'function' ? c : null;
    content.scrollTop = 0;
    anim.panelIn(content);
    if (sheet.state() === 'min') sheet.snap('mid'); else sheet.snap(/** @type {any} */ (sheet.state()));
    M.invalidate();
  } catch (e) {
    console.error(e);
    mount(content, h('p.err', null, `Erreur de chargement du module : ${/** @type {Error} */ (e).message}`));
  }
}

// ------------------------------------------------------------- Accueil
/** @param {HTMLElement} el */
function renderHome(el) {
  const p = state.project;
  const counts = { points: 0, parcels: 0 };
  for (const f of state.features) { if (f.type === 'point') counts.points++; if (f.type === 'parcel') counts.parcels++; }
  const tile = (/** @type {string} */ href, /** @type {string} */ ic, /** @type {string} */ label, /** @type {string} */ sub, primary = false) =>
    h(`a.tile${primary ? '.tile-primary' : ''}`, { href, 'data-stagger': '' }, h('span.tile-ic', null, icon(ic)), h('span.tile-txt', null, h('b', null, label), h('small', null, sub)));
  mount(el,
    h('div.home-inner', null,
      h('div.home-brand', { 'data-stagger': '' }, h('img', { src: 'icons/icon.svg', alt: '', width: 56, height: 56 }), h('div', null, h('h1', null, 'TopoMaroc ', h('span', null, 'GIS')), h('p', null, t('tagline')))),
      h('div.project-card', { 'data-stagger': '' },
        p ? [h('div.eyebrow', null, 'Projet en cours'), h('div.pc-name', null, p.name), h('div.pc-sub', null, `${counts.points} point(s) · ${counts.parcels} parcelle(s) · ${crs.getCrs(state.settings.inputCrs).label}`)]
          : [h('div.eyebrow', null, 'Aucun projet ouvert'), h('div.pc-sub', null, 'Créez un projet ou reprenez-en un. Vos données restent sur cet appareil.')]),
      h('div.tiles', null,
        tile('#/nav', 'target', 'Aller à un point', 'Navigation GPS vers des coordonnées', true),
        tile('#/survey', 'pin', 'Collecter des points', 'Levé GPS, codes, photos'),
        tile('#/parcels', 'polygon', 'Calculer une superficie', 'Parcelles, périmètres, rapport PDF'),
        tile('#/map', 'map', 'Ouvrir la carte', 'Plan, satellite, relief'),
        h('button.tile', { type: 'button', 'data-stagger': '', onclick: async () => { const { newProjectDialog } = await import('./ui/projects.js'); if (await newProjectDialog()) renderHome(el); } }, h('span.tile-ic', null, icon('plus')), h('span.tile-txt', null, h('b', null, 'Créer un projet'), h('small', null, 'Nom, date, système de travail'))),
        tile('#/projects', 'folder', 'Reprendre un projet', 'Projets, sauvegardes, restauration'),
        tile('#/import', 'upload', 'Importer des données', 'CSV, GeoJSON, KML, GPX, sauvegarde'),
        tile('#/tools', 'ruler', 'Outils', 'Mesures, conversion, couches'),
      ),
      h('div.home-links', { 'data-stagger': '' }, h('a', { href: '#/settings' }, icon('settings'), 'Réglages'), h('a', { href: '#/help' }, icon('help'), 'Aide et limites')),
      !window.isSecureContext ? h('p.warn', null, icon('alert'), 'Connexion non sécurisée : la géolocalisation est désactivée par le navigateur. Utilisez l’adresse HTTPS.') : null,
      h('p.small.muted.center', null, 'Positions GPS de smartphone : précision métrique, non cadastrale.'),
    ));
}

// ------------------------------------------------------------- Habillage permanent
function wireChrome() {
  // Empêche le défilement parasite du conteneur de la carte (focus d'un champ du panneau)
  const stage = /** @type {HTMLElement} */ (document.querySelector('.stage'));
  stage.addEventListener('scroll', () => { if (stage.scrollTop || stage.scrollLeft) { stage.scrollTop = 0; stage.scrollLeft = 0; } });
  window.addEventListener('scroll', () => { if (window.scrollY) window.scrollTo(0, 0); });

  // Fermeture du panneau
  document.getElementById('sheet-close')?.addEventListener('click', () => { location.hash = '#/map'; });

  // Puce projet
  const pchip = /** @type {HTMLElement} */ (document.getElementById('chip-project'));
  const paintProject = () => mount(pchip, icon('folder'), h('span', null, state.project?.name ?? 'Aucun projet'));
  on('project', paintProject); paintProject();
  pchip.addEventListener('click', () => { location.hash = '#/projects'; });

  // Puce système d'affichage
  const cchip = /** @type {HTMLElement} */ (document.getElementById('chip-crs'));
  const paintCrs = () => mount(cchip, icon('grid'), h('span', null, crs.getCrs(state.settings.displayCrs).label));
  on('settings', (p) => { if (p.displayCrs) paintCrs(); if (p.theme || 'contrast' in p) applyTheme(); });
  paintCrs();
  cchip.addEventListener('click', async () => {
    const s = crsSelect(state.settings.displayCrs);
    const ok = await modal({ title: 'Système d’affichage des coordonnées', body: () => [h('p.small', null, 'Système utilisé pour la barre de coordonnées, les listes et les exports par défaut. La carte reste en WGS 84 / Web Mercator.'), s],
      actions: [{ label: 'Annuler', value: false }, { label: 'Appliquer', value: true, variant: 'primary' }] });
    if (ok) updateSettings({ displayCrs: s.value });
  });

  // Pastille GPS
  const gpill = /** @type {HTMLElement} */ (document.getElementById('gps-pill'));
  const paintGps = () => {
    const g = state.gps; const q = accuracyQuality(g.last?.accuracy);
    gpill.className = `gps-pill st-${g.state} q-${g.state === 'active' ? q.level : 'none'}`;
    gpill.title = g.message;
    mount(gpill, icon('locate'), h('span', null, g.state === 'active' && g.last ? `±${g.last.accuracy.toFixed(0)} m` : g.state === 'idle' ? 'GPS' : g.state === 'requesting' ? '…' : '!'));
  };
  state.gps.addEventListener('state', paintGps); state.gps.addEventListener('fix', paintGps); paintGps();
  gpill.addEventListener('click', () => toast(state.gps.message, state.gps.state === 'active' ? 'ok' : 'info'));

  // Contrôles de carte
  let following = false;
  const locBtn = /** @type {HTMLElement} */ (document.getElementById('btn-locate'));
  locBtn.addEventListener('click', () => {
    if (!following) {
      following = true; state.gps.start(); M.setFollow(true); locBtn.classList.add('on');
      if (!M.recenterOnGps()) toast('Recherche de votre position…', 'info');
      state.gps.addEventListener('fix', function once() { M.recenterOnGps(); state.gps.removeEventListener('fix', once); });
    } else {
      following = false; M.setFollow(false); state.gps.stop(); locBtn.classList.remove('on');
    }
  });
  document.getElementById('btn-zin')?.addEventListener('click', () => M.getMap().zoomIn());
  document.getElementById('btn-zout')?.addEventListener('click', () => M.getMap().zoomOut());
  document.getElementById('btn-extent')?.addEventListener('click', () => (state.features.length ? M.zoomToAll() : M.zoomInitial()));
  document.getElementById('btn-layers')?.addEventListener('click', () => { location.hash = '#/tools/layers'; });
  document.getElementById('btn-full')?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => toast('Plein écran non disponible sur ce navigateur.', 'warn'));
  });
  M.getMap().on('dragstart', () => { if (following) { following = false; M.setFollow(false); state.gps.stop(); locBtn.classList.remove('on'); } });

  // Barre de coordonnées
  const bar = /** @type {HTMLElement} */ (document.getElementById('coordbar'));
  /** @type {{lat:number, lon:number, source:string}|null} */ let lastCur = null;
  const paintBar = () => {
    if (!lastCur) return;
    const id = state.settings.displayCrs; const c = crs.getCrs(id);
    let txt = '';
    try {
      const [a, b] = crs.xyToInput(id, crs.fromWGS84(id, lastCur.lon, lastCur.lat));
      txt = `${c.axes[0].split(' ')[0]} ${formatCoord(a, c.unit)}  ${c.axes[1].split(' ')[0]} ${formatCoord(b, c.unit)}`;
    } catch { txt = 'hors domaine'; }
    mount(bar, h('span.cb-src', null, lastCur.source === 'center' ? icon('crosshair') : icon('pointer')), h('b', null, txt), h('span.cb-crs', null, c.label), h('span.cb-wgs', null, `${lastCur.lat.toFixed(6)}°, ${lastCur.lon.toFixed(6)}°`));
  };
  on('cursor', (c) => { lastCur = c; paintBar(); });
  on('settings', (p) => { if (p.displayCrs) paintBar(); });
  bar.addEventListener('click', async () => {
    if (!lastCur) return;
    try { await navigator.clipboard.writeText(bar.textContent ?? ''); toast('Coordonnées copiées.', 'ok'); } catch { /* */ }
  });

  // Clic sur la carte : coordonnées dans tous les systèmes + actions
  on('map-info', ({ lat, lon }) => {
    const rows = M.coordinateTable(lat, lon);
    const content = h('div.pi', null,
      h('table.pi-tbl', null, rows.map((r) => h('tr', null, h('th', null, r.label), h('td', null, r.value)))),
      h('div.pi-actions', null,
        btn('Aller à', { variant: 'primary', onclick: async () => {
          const { startNavigation } = await import('./ui/nav.js');
          const id = state.settings.displayCrs; const xy = crs.fromWGS84(id, lon, lat);
          startNavigation({ lat, lon, name: 'Point de la carte', crsId: id, x: xy[0], y: xy[1] });
        } }, 'target'),
        btn('Ajouter un point', { variant: 'ghost', onclick: async () => {
          const { addFeature, nextPointNumber } = await import('./state.js');
          const id = state.settings.displayCrs; const xy = crs.fromWGS84(id, lon, lat);
          await addFeature({ type: 'point', num: nextPointNumber(), name: '', code: 'divers', wgs84: { lat, lon }, input: { crsId: id, x: xy[0], y: xy[1] }, accuracy: null, source: 'map', description: 'Pointé sur la carte', takenAt: new Date().toISOString() }, 'Point pointé');
          M.closePopup(); toast('Point ajouté (pointé sur la carte).', 'ok');
        } }, 'plus'),
        btn('Copier', { variant: 'ghost', onclick: async () => { try { await navigator.clipboard.writeText(rows.map((r) => `${r.label}: ${r.value}`).join('\n')); toast('Coordonnées copiées.', 'ok'); } catch { toast('Copie impossible.', 'warn'); } } }, 'copy')));
    M.popup(lat, lon, content);
  });

  // Clic sur une entité
  on('feature-click', async (f) => {
    if (f.type === 'point') {
      const { pointCoordText, navTo, editPoint, deletePoint } = await import('./ui/survey.js');
      const ci = codeInfo(f.code);
      M.popup(f.wgs84.lat, f.wgs84.lon, h('div.pi', null,
        h('div.pi-title', null, h(`span.dot${ci.ref ? '.sq' : ''}`, { style: { '--c': ci.color } }), h('b', null, `${f.num || ''} ${f.name || ''}`), h('span.muted', null, ` ${ci.label}`)),
        h('div.small', null, pointCoordText(f)),
        f.accuracy != null ? h('div.small.muted', null, `Précision annoncée ±${f.accuracy.toFixed(1)} m · ${new Date(f.takenAt).toLocaleString('fr-FR')}`) : h('div.small.muted', null, `Source : ${f.source}`),
        f.description ? h('div.small', null, f.description) : null,
        h('div.pi-actions', null, btn('Aller à', { variant: 'primary', onclick: () => navTo(f) }, 'target'), btn('Modifier', { variant: 'ghost', onclick: () => editPoint(f) }, 'edit'), btn('', { variant: 'ghost-danger', 'aria-label': 'Supprimer', onclick: () => { M.closePopup(); deletePoint(f); } }, 'trash'))));
    } else {
      let a = null; try { a = f.type === 'parcel' && f.vertices.length >= 3 ? analyze(f) : null; } catch { /* */ }
      const w = crs.toWGS84(f.crsId, [f.vertices[0].x, f.vertices[0].y]);
      M.popup(w.lat, w.lon, h('div.pi', null, h('div.pi-title', null, icon(f.type === 'parcel' ? 'polygon' : 'line'), h('b', null, f.name || (f.type === 'parcel' ? 'Parcelle' : 'Ligne'))),
        a?.valid ? h('div', null, `${formatArea(a.area, /** @type {any} */ (state.settings.areaUnit))} · ${formatLength(a.perimeter)}`) : h('div.small', null, `${f.vertices.length} sommets`),
        f.type === 'parcel' ? h('div.pi-actions', null, btn('Ouvrir', { variant: 'primary', onclick: () => { location.hash = `#/parcels/${f.id}`; } }, 'edit')) : null));
    }
  });

  // Erreurs de tuiles
  on('tile-error', ({ offline }) => {
    toast(offline ? 'Hors connexion : le fond de carte n’est pas disponible. Les calculs, la saisie et le GPS fonctionnent.' : 'Le fond de carte ne répond pas. Essayez un autre fond (Outils → Couches) ou « Sans fond ».', 'warn', 7000);
  });
  window.addEventListener('offline', () => { document.body.classList.add('offline'); toast('Hors connexion : mode terrain (saisie, GPS, calculs et sauvegarde locale).', 'info', 5000); });
  window.addEventListener('online', () => { document.body.classList.remove('offline'); toast('Connexion rétablie.', 'ok'); });
  if (!navigator.onLine) document.body.classList.add('offline');

  // Raccourcis clavier (ordinateur)
  document.addEventListener('keydown', async (e) => {
    if (!(e.ctrlKey || e.metaKey) || /** @type {HTMLElement} */ (e.target)?.closest?.('input,textarea,select')) return;
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); const l = await state.history.undo(); if (l) toast(`Annulé : ${l}`); }
    if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); const l = await state.history.redo(); if (l) toast(`Rétabli : ${l}`); }
  });
  void emit;
}

// ------------------------------------------------------------- Service worker (PWA)
let updateRequested = false;
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          const b = h('button.link-btn', { type: 'button', onclick: () => { updateRequested = true; nw.postMessage('skipWaiting'); } }, 'Mettre à jour');
          const el = h('div.update-bar', null, icon('info'), h('span', null, 'Une nouvelle version est disponible.'), b);
          document.body.append(el);
        }
      });
    });
  }).catch((e) => console.warn('Service worker non enregistré', e));
  // Rechargement uniquement après une mise à jour acceptée par l'utilisateur
  // (pas lors de la première prise de contrôle, qui interromprait la saisie en cours).
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested && !reloaded) { reloaded = true; location.reload(); } });
}

boot().catch((e) => {
  console.error(e);
  const m = document.getElementById('boot-msg');
  if (m) m.textContent = `Erreur au démarrage : ${e.message}`;
});
