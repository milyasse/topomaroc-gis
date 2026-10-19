// @ts-check
/** Réglages : affichage, unités, systèmes par défaut, paramètres Merchich, langue. */
import * as crs from '../core/crs.js';
import { AREA_UNITS } from '../core/units.js';
import { state, updateSettings } from '../state.js';
import { LANGS, setLang } from '../i18n/index.js';
import { requestPersistence } from '../services/storage.js';
import { h, icon, btn, mount, toast, field, select } from './dom.js';
import { crsSelect, crsInfo } from './coordinput.js';
import { versionLabel } from '../version.js';
import { manualCrsChoice, zoneMismatches } from '../services/autocrs.js';
import { FAMILIES } from '../core/zones.js';
import { updateFeature } from '../state.js';

/** @param {HTMLElement} root */
export function render(root) {
  const s = state.settings;
  const theme = select([{ value: 'auto', label: 'Automatique (système)' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }], s.theme);
  theme.addEventListener('change', () => updateSettings({ theme: theme.value }));
  const contrast = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: s.contrast }));
  contrast.addEventListener('change', () => updateSettings({ contrast: contrast.checked }));
  const inCrs = crsSelect(s.inputCrs);
  inCrs.addEventListener('change', () => manualCrsChoice('inputCrs', inCrs.value));
  const dispCrs = crsSelect(s.displayCrs);
  dispCrs.addEventListener('change', async () => {
    if (await manualCrsChoice('displayCrs', dispCrs.value)) { autoChk.checked = false; famBox.hidden = true; toast('Choix manuel : projection automatique désactivée.', 'info', 4000); }
  });
  const autoChk = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: !!s.autoCrs, id: 'set-autocrs' }));
  const fam = select(FAMILIES, s.autoFamily ?? 'lambert');
  const famBox = h('div', { hidden: !s.autoCrs }, field('Famille de systèmes', fam));
  autoChk.addEventListener('change', async () => { famBox.hidden = !autoChk.checked; await updateSettings({ autoCrs: autoChk.checked }); toast(autoChk.checked ? 'Projection automatique activée : elle s’appliquera au prochain déplacement ou fix GPS.' : 'Projection automatique désactivée.', 'info'); });
  fam.addEventListener('change', () => updateSettings({ autoFamily: /** @type {any} */ (fam.value) }));
  const mis = h('div.small');
  const paintMis = () => {
    const m = zoneMismatches(state.features, fam.value);
    mount(mis, m.length
      ? [h('p', null, `${m.length} point(s) du projet sont enregistrés dans un système qui n’est pas celui de leur zone (ex. point ${m[0].f.num ?? ''} : ${m[0].from === '—' ? '—' : crs.getCrs(m[0].from).label} → ${crs.getCrs(m[0].to).label}).`),
        btn('Recalculer dans leur zone', { variant: 'ghost', onclick: async () => {
          for (const x of m) await updateFeature({ ...x.f, input: x.input }, `Zone du point ${x.f.num ?? ''}`);
          toast(`${m.length} point(s) recalculé(s) dans leur zone (positions inchangées, ancienne valeur conservée).`, 'ok', 5000); paintMis();
        } }, 'grid')]
      : h('p.muted', null, state.features.some((f) => f.type === 'point') ? 'Tous les points du projet sont enregistrés dans la zone de leur position.' : 'Aucun point dans le projet ouvert.'));
  };
  fam.addEventListener('change', paintMis);
  paintMis();
  const ang = select([{ value: 'deg', label: 'Degrés décimaux (°)' }, { value: 'grad', label: 'Grades (gr) — usage topographique' }, { value: 'dms', label: 'Degrés, minutes, secondes' }], s.angleUnit);
  ang.addEventListener('change', () => updateSettings({ angleUnit: /** @type {any} */ (ang.value) }));
  const area = select(Object.entries(AREA_UNITS).map(([k, u]) => ({ value: k, label: u.label })), s.areaUnit);
  area.addEventListener('change', () => updateSettings({ areaUnit: /** @type {any} */ (area.value) }));
  const lang = select(LANGS.map((l) => ({ value: l.value, label: l.label })), s.lang);
  lang.addEventListener('change', () => { const def = LANGS.find((l) => l.value === lang.value); if (!def?.available) { toast('La version arabe est prévue : l’architecture la prend en charge, la traduction reste à fournir.', 'info', 5000); lang.value = 'fr'; return; } updateSettings({ lang: lang.value }); setLang(lang.value); });

  // Paramètres Merchich → WGS 84
  const cur = /** @type {any} */ (s.merchichCustom);
  const useCustom = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: !!cur }));
  const names = ['ΔX (m)', 'ΔY (m)', 'ΔZ (m)', 'Rx (″)', 'Ry (″)', 'Rz (″)', 'Échelle (ppm)'];
  const inputs = names.map((n, i) => /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'decimal', value: cur ? String(cur.params[i] ?? 0) : String(crs.MERCHICH_EPSG1166[i]), 'aria-label': n })));
  const conv = select([{ value: 'position_vector', label: 'Position Vector (EPSG:9606, PROJ)' }, { value: 'coordinate_frame', label: 'Coordinate Frame (EPSG:9607)' }], cur?.convention ?? 'position_vector');
  const label = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: cur?.label ?? '', placeholder: 'Origine des paramètres (organisme, zone, date)' }));
  const box = h('div', { hidden: !cur }, h('div.grid4', null, inputs.map((inp, i) => field(names[i], inp))), field('Convention des rotations', conv), field('Source', label),
    btn('Appliquer ces paramètres', { variant: 'primary', onclick: async () => {
      const vals = inputs.map((i) => Number(i.value.replace(',', '.')));
      if (!vals.every(Number.isFinite)) { toast('Paramètres non numériques.', 'error'); return; }
      if (!label.value.trim()) { toast('Indiquez la source des paramètres (traçabilité).', 'warn'); return; }
      await updateSettings({ merchichCustom: /** @type {any} */ ({ params: vals, convention: conv.value, label: label.value.trim() }) });
      toast('Paramètres Merchich → WGS 84 appliqués à toutes les transformations.', 'ok');
    } }, 'check'));
  useCustom.addEventListener('change', async () => {
    box.hidden = !useCustom.checked;
    if (!useCustom.checked) { await updateSettings({ merchichCustom: null }); toast('Retour à la transformation EPSG:1166.', 'info'); }
  });

  mount(root,
    h('fieldset.group', null, h('legend', null, 'Affichage'), field('Thème', theme), h('label.switch', null, contrast, h('span', null, 'Contraste renforcé (plein soleil)')), field('Langue', lang)),
    h('fieldset.group', null, h('legend', null, 'Systèmes de coordonnées'),
      h('label.switch', null, autoChk, h('span', null, 'Projection automatique selon ma zone de navigation')),
      h('p.small.muted', null, 'Zone déterminée par la position GPS (sinon le centre de la carte), limites tirées des domaines d’usage EPSG : Lambert Nord au nord de 31,5° N, Sud de 27,66° à 31,5° N, Sahara Nord de 24,3° à 27,66° N, Sahara Sud au sud de 24,3° N. Chaque point collecté est enregistré dans la zone de sa propre position.'),
      famBox, h('div.zone-box', { id: 'zone-mismatch' }, mis),
      field('Système de saisie par défaut', inCrs), field('Système d’affichage (barre de coordonnées, listes)', dispCrs, 'Système de la carte : WGS 84 / Web Mercator (Leaflet). Les coordonnées sont transformées à l’affichage.')),
    h('fieldset.group', null, h('legend', null, 'Unités'), field('Angles et azimuts', ang), field('Superficies', area)),
    h('fieldset.group', null, h('legend', null, 'Transformation Merchich → WGS 84'),
      h('p.small', null, 'Par défaut : EPSG:1166, seule transformation publiée dans le registre EPSG pour le Maroc (translations 31, 146, 47 m ; exactitude ≈ 7 m ; non définie pour les provinces du Sud). Si vous disposez de paramètres locaux officiels plus précis, saisissez-les ici : ils s’appliqueront aux zones Lambert et à Merchich.'),
      h('label.switch', null, useCustom, h('span', null, 'Utiliser des paramètres personnalisés')), box,
      h('details.help', null, h('summary', null, icon('info'), 'Paramètres actifs'), crsInfo('EPSG:26191'))),
    h('fieldset.group', null, h('legend', null, 'Stockage'),
      (() => { const v = h('a.small', { href: '#/about' }, ''); versionLabel().then((l) => { v.textContent = `Application : TopoMaroc GIS ${l} — détails de la version`; }); return h('p', null, v); })(),
      btn('Demander un stockage persistant', { variant: 'ghost', onclick: async () => toast(await requestPersistence() ? 'Stockage persistant accordé.' : 'Le navigateur n’a pas accordé le stockage persistant : exportez régulièrement des sauvegardes.', 'info', 5000) }, 'folder')),
  );
}
