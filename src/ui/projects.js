// @ts-check
/** Gestion des projets locaux, sauvegardes et restauration. */
import * as db from '../services/storage.js';
import { state, on, openProject, createProject, updateProject } from '../state.js';
import { h, icon, btn, mount, toast, field, modal, confirmDialog, saveFile } from './dom.js';
import { crsSelect } from './coordinput.js';
import { exportDialog, importWizard, addImportedToProject } from './transfer.js';
import { safeName, stamp } from '../io/common.js';
import * as M from '../map/map.js';

/** Boîte de création de projet. @returns {Promise<any|null>} */
export async function newProjectDialog() {
  const name = /** @type {HTMLInputElement} */ (h('input', { type: 'text', placeholder: 'ex. Lotissement Al Amal — levé', maxlength: 80 }));
  const date = /** @type {HTMLInputElement} */ (h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) }));
  const notes = /** @type {HTMLTextAreaElement} */ (h('textarea', { rows: 3, placeholder: 'Opérateur, commune, références foncières, observations…' }));
  const cs = crsSelect(state.settings.inputCrs);
  const ok = await modal({ title: 'Créer un projet', body: (close) => h('form', { onsubmit: (/** @type {Event} */ e) => { e.preventDefault(); close(true); } },
    field('Nom du projet', name), field('Date du levé', date), field('Système de coordonnées de travail', cs, 'Système proposé par défaut pour les saisies et les exports.'), field('Observations', notes)),
  actions: [{ label: 'Annuler', value: false }, { label: 'Créer', value: true, variant: 'primary' }] });
  if (!ok) return null;
  const p = await createProject({ name: name.value.trim() || `Projet du ${new Date().toLocaleDateString('fr-FR')}`, date: date.value, notes: notes.value.trim(), crsId: cs.value });
  toast(`Projet « ${p.name} » créé.`, 'ok');
  return p;
}

/** @param {HTMLElement} root @param {string} [id] */
export async function render(root, id) {
  if (id) {
    const off = on('features', () => detail(root, id));
    const off2 = on('project', () => detail(root, id));
    await detail(root, id);
    return () => { off(); off2(); };
  }
  const off = on('project', () => draw(root));
  await draw(root);
  return off;
}

/** Fiche détaillée d'un projet : statistiques, personnes, superficies, actions. @param {HTMLElement} root @param {string} id */
async function detail(root, id) {
  const p = await db.getProject(id);
  if (!p) { mount(root, h('p.empty', null, 'Projet introuvable.'), btn('Tous les projets', { onclick: () => { location.hash = '#/projects'; } })); return; }
  const isOpen = state.project?.id === id;
  const feats = isOpen ? state.features : await db.listFeatures(id);
  const { analyze } = await import('../io/common.js');
  const { formatArea } = await import('../core/units.js');
  const crs = await import('../core/crs.js');
  const pts = feats.filter((f) => f.type === 'point');
  const parcels = feats.filter((f) => f.type === 'parcel');
  const top = parcels.filter((f) => !f.parentId);
  let total = 0, invalid = 0;
  /** @type {Map<string, {area:number, color:string, n:number}>} */ const people = new Map();
  for (const f of parcels) {
    let a = null; try { a = f.vertices.length >= 3 ? analyze(f) : null; } catch { /* */ }
    if (!a?.valid) { if (!f.parentId) invalid++; continue; }
    if (!f.parentId) total += a.area;
    if (f.owner?.name && (f.parentId || !parcels.some((c) => c.parentId === f.id))) {
      const k = f.owner.name.trim();
      const e = people.get(k) ?? { area: 0, color: f.owner.color, n: 0 };
      e.area += a.area; e.n++; people.set(k, e);
    }
  }
  const src = { gps: 0, manual: 0, import: 0, map: 0, nav: 0 };
  for (const f of pts) /** @type {any} */ (src)[f.source] = (/** @type {any} */ (src)[f.source] ?? 0) + 1;
  const stat = (/** @type {string} */ label, /** @type {any} */ value, /** @type {string} */ ic) => h('div.stat', null, icon(ic), h('div', null, h('div.stat-v', null, value), h('div.stat-l', null, label)));
  const unit = /** @type {any} */ (state.settings.areaUnit);
  mount(root,
    h('button.link-btn.back', { type: 'button', onclick: () => { location.hash = '#/projects'; } }, icon('back'), 'Tous les projets'),
    h('div.project-hero', null,
      h('div.eyebrow', null, isOpen ? 'Projet ouvert' : 'Projet'),
      h('h3', null, p.name),
      h('div.small.muted', null, `${p.date ? `Levé du ${new Date(p.date).toLocaleDateString('fr-FR')} · ` : ''}créé le ${new Date(p.createdAt).toLocaleDateString('fr-FR')} · modifié le ${new Date(p.updatedAt).toLocaleString('fr-FR')}`),
      p.notes ? h('p.small', null, p.notes) : null,
      h('div.small', null, icon('grid'), ` Système de travail : ${p.crsId ? crs.getCrs(p.crsId).label : '—'}`)),
    h('div.stats', null,
      stat('Points', String(pts.length), 'pin'),
      stat('Parcelles', `${top.length}${invalid ? ` (${invalid} à corriger)` : ''}`, 'polygon'),
      stat('Superficie totale', formatArea(total, unit), 'grid'),
      stat('Personnes', String(people.size), 'users')),
    pts.length ? h('p.small.muted', null, `Origine des points : ${src.gps} GPS · ${src.manual} saisis · ${src.map} placés sur la carte · ${src.import} importés · ${src.nav} atteints en navigation`) : null,
    people.size ? h('div', null, h('h4', null, 'Superficie par personne'),
      h('div.table-wrap', null, h('table.tbl', null, h('tbody', null, [...people.entries()].sort((a, b) => b[1].area - a[1].area).map(([name, e]) => h('tr', null,
        h('td', null, h('span.swatch', { style: { background: e.color } }), ` ${name}`), h('td.num', null, `${e.n} lot(s)`), h('td.num', null, formatArea(e.area, unit)))))))) : null,
    top.length ? h('div', null, h('h4', null, 'Parcelles'), top.map((f) => {
      let a = null; try { a = analyze(f); } catch { /* */ }
      const lots = parcels.filter((c) => c.parentId === f.id).length;
      return h('div.item', null, icon('polygon'), h('div.item-main', { role: 'button', tabindex: 0, onclick: async () => { if (!isOpen) await openProject(id); location.hash = `#/parcels/${f.id}`; } },
        h('div.item-title', null, h('b', null, f.name || 'Parcelle'), lots ? h('span.badge', null, `${lots} lots`) : null, f.owner ? h('span.badge', null, f.owner.name) : null),
        h('div.item-sub', null, a?.valid ? formatArea(a.area, unit) : 'à corriger')));
    })) : null,
    h('div.btn-grid', null,
      btn(isOpen ? 'Voir sur la carte' : 'Ouvrir et voir sur la carte', { variant: 'primary', onclick: async () => { if (!isOpen) await openProject(id); location.hash = '#/map'; setTimeout(() => M.zoomToAll(), 150); } }, 'map'),
      btn('Exporter', { variant: 'ghost', onclick: async () => { if (!isOpen) await openProject(id); exportDialog(state.features, 'geojson'); } }, 'download'),
      btn('Sauvegarder', { variant: 'ghost', onclick: () => backup([id], p.name) }, 'folder'),
      isOpen ? null : btn('Ouvrir le projet', { variant: 'ghost', onclick: async () => { await openProject(id); toast(`Projet « ${p.name} » ouvert.`, 'ok'); } }, 'check')),
  );
}

/** @param {HTMLElement} root */
async function draw(root) {
  const list = h('div.project-list');
  const paint = async () => {
    const projects = await db.listProjects();
    const counts = new Map();
    for (const p of projects) counts.set(p.id, (await db.listFeatures(p.id)).length);
    if (!projects.length) { mount(list, h('p.empty', null, 'Aucun projet. Créez un projet ou importez une sauvegarde.')); return; }
    mount(list, projects.map((p) => h(`div.item${state.project?.id === p.id ? '.current' : ''}`, null,
      icon('folder'),
      h('div.item-main', { role: 'button', tabindex: 0, onclick: () => { location.hash = `#/projects/${p.id}`; } },
        h('div.item-title', null, h('b', null, p.name), state.project?.id === p.id ? h('span.badge.q-good', null, 'ouvert') : null),
        h('div.item-sub', null, `${counts.get(p.id)} entité(s) · ${p.date || ''} · modifié le ${new Date(p.updatedAt).toLocaleString('fr-FR')}`)),
      h('div.item-actions', null,
        h('button.icon-btn', { type: 'button', title: 'Ouvrir et voir sur la carte', 'aria-label': 'Voir sur la carte', onclick: async () => { await openProject(p.id); location.hash = '#/map'; setTimeout(() => M.zoomToAll(), 150); } }, icon('map')),
        h('button.icon-btn', { type: 'button', title: 'Sauvegarder (fichier)', 'aria-label': 'Sauvegarder', onclick: () => backup([p.id], p.name) }, icon('download')),
        h('button.icon-btn.danger', { type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer le projet', onclick: () => del(p) }, icon('trash'))))));
  };
  /** @param {any} p */
  const del = async (p) => {
    const n = (await db.listFeatures(p.id)).length;
    if (!await confirmDialog('Supprimer le projet', `La suppression de « ${p.name} » efface définitivement ses ${n} entité(s) et photos de cet appareil. Pensez à exporter une sauvegarde avant.`, { danger: true, confirmLabel: 'Supprimer définitivement', typeToConfirm: 'SUPPRIMER' })) return;
    await db.deleteProject(p.id);
    if (state.project?.id === p.id) await openProject(null);
    toast('Projet supprimé.', 'ok');
    paint();
  };
  const cur = state.project;
  const editCur = cur ? h('details.group', null, h('summary', null, icon('edit'), 'Projet ouvert : ', h('b', null, cur.name)),
    (() => {
      const n = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: cur.name }));
      const d = /** @type {HTMLInputElement} */ (h('input', { type: 'date', value: cur.date || '' }));
      const o = /** @type {HTMLTextAreaElement} */ (h('textarea', { rows: 3 }, cur.notes || ''));
      return h('div', null, field('Nom', n), field('Date', d), field('Observations', o),
        h('div.btn-grid', null,
          btn('Enregistrer', { variant: 'primary', onclick: async () => { await updateProject({ name: n.value.trim() || cur.name, date: d.value, notes: o.value.trim() }); toast('Projet mis à jour.', 'ok'); paint(); } }, 'check'),
          btn('Exporter les données', { variant: 'ghost', onclick: () => exportDialog(state.features, 'geojson') }, 'download')));
    })()) : null;

  mount(root,
    h('div.btn-grid', null,
      btn('Créer un projet', { variant: 'primary', onclick: async () => { if (await newProjectDialog()) paint(); } }, 'plus'),
      btn('Importer des données', { variant: 'ghost', onclick: async () => { const imp = await importWizard(); if (imp) { await addImportedToProject(imp); } paint(); } }, 'upload'),
      btn('Sauvegarder tout', { variant: 'ghost', onclick: () => backup(null, 'tous-projets') }, 'download'),
    ),
    editCur, list,
    storageInfo(),
  );
  await paint();
}

/** @param {string[]|null} ids @param {string} name */
async function backup(ids, name) {
  const data = await db.exportBackup(ids);
  await saveFile(JSON.stringify(data), `topomaroc-sauvegarde-${safeName(name)}-${stamp()}.json`, 'application/json');
}

function storageInfo() {
  const el = h('p.small.muted');
  db.storageEstimate().then(async (e) => {
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    el.textContent = `Données stockées uniquement sur cet appareil (IndexedDB)${e ? ` · ${(e.usage / 1e6).toFixed(1)} Mo utilisés` : ''} · stockage ${persisted ? 'persistant' : 'non garanti (le navigateur peut l’effacer en cas de manque d’espace) — exportez régulièrement une sauvegarde'}.`;
  });
  return el;
}
