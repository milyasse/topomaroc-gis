// @ts-check
/** Réglages : affichage, unités, systèmes par défaut, paramètres Merchich, langue. */
import * as crs from '../core/crs.js';
import { AREA_UNITS } from '../core/units.js';
import { state, updateSettings } from '../state.js';
import { LANGS, setLang } from '../i18n/index.js';
import { requestPersistence } from '../services/storage.js';
import { h, icon, btn, mount, toast, field, select } from './dom.js';
import { crsSelect, crsInfo } from './coordinput.js';

/** @param {HTMLElement} root */
export function render(root) {
  const s = state.settings;
  const theme = select([{ value: 'auto', label: 'Automatique (système)' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }], s.theme);
  theme.addEventListener('change', () => updateSettings({ theme: theme.value }));
  const contrast = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: s.contrast }));
  contrast.addEventListener('change', () => updateSettings({ contrast: contrast.checked }));
  const inCrs = crsSelect(s.inputCrs);
  inCrs.addEventListener('change', () => updateSettings({ inputCrs: inCrs.value }));
  const dispCrs = crsSelect(s.displayCrs);
  dispCrs.addEventListener('change', () => updateSettings({ displayCrs: dispCrs.value }));
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
      field('Système de saisie par défaut', inCrs), field('Système d’affichage (barre de coordonnées, listes)', dispCrs, 'Système de la carte : WGS 84 / Web Mercator (Leaflet). Les coordonnées sont transformées à l’affichage.')),
    h('fieldset.group', null, h('legend', null, 'Unités'), field('Angles et azimuts', ang), field('Superficies', area)),
    h('fieldset.group', null, h('legend', null, 'Transformation Merchich → WGS 84'),
      h('p.small', null, 'Par défaut : EPSG:1166, seule transformation publiée dans le registre EPSG pour le Maroc (translations 31, 146, 47 m ; exactitude ≈ 7 m ; non définie pour les provinces du Sud). Si vous disposez de paramètres locaux officiels plus précis, saisissez-les ici : ils s’appliqueront aux zones Lambert et à Merchich.'),
      h('label.switch', null, useCustom, h('span', null, 'Utiliser des paramètres personnalisés')), box,
      h('details.help', null, h('summary', null, icon('info'), 'Paramètres actifs'), crsInfo('EPSG:26191'))),
    h('fieldset.group', null, h('legend', null, 'Stockage'),
      btn('Demander un stockage persistant', { variant: 'ghost', onclick: async () => toast(await requestPersistence() ? 'Stockage persistant accordé.' : 'Le navigateur n’a pas accordé le stockage persistant : exportez régulièrement des sauvegardes.', 'info', 5000) }, 'folder')),
  );
}
