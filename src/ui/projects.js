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

/** @param {HTMLElement} root */
export async function render(root) {
  const off = on('project', () => draw(root));
  await draw(root);
  return off;
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
      h('div.item-main', { role: 'button', tabindex: 0, onclick: async () => { await openProject(p.id); toast(`Projet « ${p.name} » ouvert.`, 'ok'); M.zoomToAll(); location.hash = '#/map'; } },
        h('div.item-title', null, h('b', null, p.name), state.project?.id === p.id ? h('span.badge.q-good', null, 'ouvert') : null),
        h('div.item-sub', null, `${counts.get(p.id)} entité(s) · ${p.date || ''} · modifié le ${new Date(p.updatedAt).toLocaleString('fr-FR')}`)),
      h('div.item-actions', null,
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
