// @ts-check
/** Composant de saisie de coordonnées avec choix explicite du système et contrôle de cohérence. */
import * as crs from '../core/crs.js';
import { parseAngle, parseNumber } from '../core/angles.js';
import { h, icon } from './dom.js';

/** Options groupées pour une liste de SRC. @param {string} value @param {{ projectedOnly?: boolean }} [opts] */
export function crsSelect(value, opts = {}) {
  const groups = [
    { label: 'Lambert Maroc (Merchich)', ids: ['EPSG:26191', 'EPSG:26192', 'EPSG:26194', 'EPSG:26195'] },
    { label: 'WGS 84 / GPS', ids: ['EPSG:4326', 'EPSG:32628', 'EPSG:32629', 'EPSG:32630'] },
    { label: 'Historique', ids: ['EPSG:4261'] },
  ];
  const s = /** @type {HTMLSelectElement} */ (h('select.crs-select', { 'aria-label': 'Système de coordonnées' },
    groups.map((g) => h('optgroup', { label: g.label }, g.ids.filter((id) => !opts.projectedOnly || crs.getCrs(id).kind === 'projected').map((id) => {
      const c = crs.getCrs(id);
      return h('option', { value: id }, `${c.label} — EPSG:${c.epsg}`);
    })))));
  s.value = value;
  return s;
}

/** Fiche descriptive d'un SRC (nom, autorité, unité, axes, paramètres, transformation). @param {string} id */
export function crsInfo(id) {
  const c = crs.getCrs(id);
  const d = crs.datumInfo(id);
  return h('dl.crs-info', null,
    h('dt', null, 'Nom'), h('dd', null, c.name),
    h('dt', null, 'Autorité'), h('dd', null, c.epsg ? `EPSG:${c.epsg}` : '—'),
    h('dt', null, 'Unité'), h('dd', null, c.unit === 'm' ? 'mètre' : 'degré décimal (DMS accepté)'),
    h('dt', null, 'Saisie'), h('dd', null, c.axisNote),
    h('dt', null, 'Projection'), h('dd', null, c.projection ?? '—'),
    h('dt', null, 'Datum'), h('dd', null, `${d.datum} · ${d.ellipsoid}`),
    h('dt', null, 'Vers WGS 84'), h('dd', null, d.transformation + (d.accuracy ? ` (exactitude ≈ ${d.accuracy} m)` : '')),
    h('dt', null, 'Validité'), h('dd', null, c.description),
  );
}

/**
 * @param {{ crsId: string, a?: string|number, b?: string|number, compact?: boolean, onChange?: () => void, nearby?: () => ({lat:number, lon:number}|null) }} o
 */
export function coordInput(o) {
  let crsId = o.crsId;
  const sel = crsSelect(crsId);
  const inA = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: false, value: o.a ?? '' }));
  const inB = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: false, value: o.b ?? '' }));
  const labA = h('span'), labB = h('span');
  const note = h('small.hint');
  const msg = h('div.coord-msg', { 'aria-live': 'polite' });
  const infoBtn = h('button.link-btn', { type: 'button' }, icon('info'), 'Détails du système');
  const infoBox = h('div.crs-info-box', { hidden: true });
  infoBtn.addEventListener('click', () => { infoBox.hidden = !infoBox.hidden; if (!infoBox.hidden) infoBox.replaceChildren(crsInfo(crsId)); });

  const updateLabels = () => {
    const c = crs.getCrs(crsId);
    labA.textContent = `${c.axes[0]}${c.unit === 'm' ? ' (m)' : ' (°)'}`;
    labB.textContent = `${c.axes[1]}${c.unit === 'm' ? ' (m)' : ' (°)'}`;
    inA.placeholder = c.kind === 'geographic' ? 'ex. 34.0209 ou 34°01\'15"N' : 'ex. 380 000,00';
    inB.placeholder = c.kind === 'geographic' ? 'ex. -6.8498 ou 6°50\'59"W' : 'ex. 370 000,00';
    note.textContent = c.axisNote;
    if (!infoBox.hidden) infoBox.replaceChildren(crsInfo(crsId));
  };
  sel.addEventListener('change', () => { crsId = sel.value; updateLabels(); validate(); o.onChange?.(); });

  /** Lecture + contrôle. */
  const read = () => {
    const c = crs.getCrs(crsId);
    const a = c.kind === 'geographic' ? parseAngle(inA.value) : parseNumber(inA.value);
    const b = c.kind === 'geographic' ? parseAngle(inB.value) : parseNumber(inB.value);
    if (!inA.value.trim() || !inB.value.trim()) return { ok: false, empty: true, crsId, xy: null, check: null };
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, empty: false, crsId, xy: null, check: { ok: false, errors: ['Valeur illisible : utilisez des nombres (virgule ou point décimal).'], warnings: [], wgs84: null, suggestions: [] } };
    const xy = crs.inputToXY(crsId, a, b);
    const check = crs.checkCoordinate(crsId, xy);
    // Contrôle de vraisemblance par rapport à la position GPS (zones Lambert indiscernables par les valeurs)
    const here = o.nearby?.();
    if (check.ok && check.wgs84 && here) {
      const dkm = Math.hypot((check.wgs84.lat - here.lat) * 111, (check.wgs84.lon - here.lon) * 111 * Math.cos(here.lat * Math.PI / 180));
      if (dkm > 150) check.warnings.push(`Ce point est à environ ${Math.round(dkm)} km de votre position : vérifiez le système et la zone Lambert choisis.`);
    }
    if (check.ok && check.wgs84 && c.datum === 'merchich' && !crs.merchichShiftValidAt(check.wgs84.lon, check.wgs84.lat)) {
      check.warnings.push('Transformation Merchich → WGS 84 non définie par l’EPSG dans cette zone : position GPS/carte incertaine (plusieurs centaines de mètres possibles). Saisissez des paramètres locaux dans les Réglages si vous en disposez.');
    }
    return { ok: check.ok, empty: false, crsId, xy, check };
  };

  const validate = () => {
    const r = read();
    msg.replaceChildren();
    msg.className = 'coord-msg';
    if (r.empty || !r.check) return r;
    if (!r.check.ok) { msg.classList.add('err'); msg.append(...r.check.errors.map((e) => h('p', null, icon('alert'), e))); return r; }
    if (r.check.warnings.length) { msg.classList.add('warn'); msg.append(...r.check.warnings.map((e) => h('p', null, icon('alert'), e))); }
    else msg.classList.add('ok');
    const w = r.check.wgs84;
    if (w) msg.append(h('p.muted', null, icon('pin'), `WGS 84 : ${w.lat.toFixed(7)}°, ${w.lon.toFixed(7)}°`));
    return r;
  };
  inA.addEventListener('input', () => { validate(); o.onChange?.(); });
  inB.addEventListener('input', () => { validate(); o.onChange?.(); });
  updateLabels();

  const el = h(`div.coord-input${o.compact ? '.compact' : ''}`, null,
    h('label.field', null, h('span', null, 'Système de coordonnées'), sel),
    h('div.coord-pair', null, h('label.field', null, labA, inA), h('label.field', null, labB, inB)),
    note, msg, infoBtn, infoBox,
  );
  if (inA.value && inB.value) validate();
  return {
    el,
    read: validate,
    get crsId() { return crsId; },
    /** @param {string} id */
    setCrs(id) { crsId = id; sel.value = id; updateLabels(); validate(); },
    /** @param {string|number} a @param {string|number} b */
    setValues(a, b) { inA.value = String(a); inB.value = String(b); validate(); },
    focus() { inA.focus(); },
  };
}
