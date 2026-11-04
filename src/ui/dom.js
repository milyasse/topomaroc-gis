// @ts-check
/** Petits utilitaires DOM : création d'éléments, notifications, boîtes de dialogue. */
import { anim } from './anim.js';
import { t } from '../i18n/index.js';

/**
 * Crée un élément. `tag` accepte « div.classe.autre#id ».
 * @param {string} tag @param {Record<string, any>|null} [props] @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9-]*)(.*)$/i) || [];
  const el = document.createElement(name || 'div');
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, String(sv)); else /** @type {any} */ (el.style)[sk] = sv;
        }
      }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') /** @type {any} */ (el)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

/** @param {HTMLElement} el @param {any[]} children */
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** @param {HTMLElement} el @param {...any} children */
export function mount(el, ...children) { el.replaceChildren(); append(el, children); return el; }

/** Icône SVG du sprite (icons/sprite.svg incorporé dans index.html). @param {string} name @param {string} [cls] */
export function icon(name, cls = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', `ic ${cls}`);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/** Bouton standard. @param {string} label @param {Record<string,any>} [props] @param {string} [ic] */
export function btn(label, props = {}, ic) {
  return h(`button.btn${props.variant ? '.btn-' + props.variant : ''}`, { type: 'button', ...props, variant: null }, ic ? icon(ic) : null, label ? h('span', null, label) : null);
}

// ------------------------------------------------------------- Notifications
/** @param {string} msg @param {'info'|'ok'|'warn'|'error'} [kind] @param {number} [ms] */
export function toast(msg, kind = 'info', ms = 3500) {
  let host = document.getElementById('toasts');
  if (!host) { host = h('div#toasts', { role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const el = h(`div.toast.toast-${kind}`, null, icon(kind === 'ok' ? 'check' : kind === 'error' ? 'alert' : kind === 'warn' ? 'alert' : 'info'), h('span', null, msg));
  host.append(el);
  anim.toastIn(el);
  const close = () => anim.toastOut(el).then(() => el.remove());
  el.addEventListener('click', close);
  setTimeout(close, ms);
}

// ------------------------------------------------------------- Dialogues
/**
 * Fenêtre modale générique. Résout avec la valeur passée à `close`.
 * @param {{ title: string, body: (close: (v:any)=>void) => any, actions?: {label:string, value:any, variant?:string, ic?: string}[], wide?: boolean, dismissValue?: any }} o
 * @returns {Promise<any>}
 */
export function modal(o) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const backdrop = h('div.modal-backdrop');
    /** @param {any} v */
    const close = (v) => {
      document.removeEventListener('keydown', onKey);
      anim.modalOut(card, backdrop).then(() => { backdrop.remove(); if (prev instanceof HTMLElement) prev.focus(); });
      resolve(v);
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') close(o.dismissValue ?? null); };
    const titleId = `m-${Math.random().toString(36).slice(2)}`;
    const card = h(`div.modal${o.wide ? '.modal-wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div.modal-head', null, h('h2', { id: titleId }, o.title), h('button.icon-btn', { type: 'button', 'aria-label': t('close'), onclick: () => close(o.dismissValue ?? null) }, icon('close'))),
      h('div.modal-body', null, o.body(close)),
      o.actions?.length ? h('div.modal-actions', null, o.actions.map((a) => btn(a.label, { variant: a.variant, onclick: () => close(a.value) }, a.ic))) : null,
    );
    backdrop.append(card);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(o.dismissValue ?? null); });
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    anim.modalIn(card, backdrop);
    const first = card.querySelector('input, select, textarea, .modal-actions .btn');
    if (first instanceof HTMLElement) setTimeout(() => first.focus(), 50);
  });
}

/**
 * Confirmation d'une opération (irréversible si `danger`).
 * @param {string} title @param {string} message @param {{ confirmLabel?: string, danger?: boolean, typeToConfirm?: string }} [opts]
 */
export async function confirmDialog(title, message, opts = {}) {
  /** @type {HTMLInputElement|null} */ let input = null;
  const r = await modal({
    title,
    body: () => [
      h('p', null, message),
      opts.typeToConfirm ? h('label.field', null, h('span', null, `Pour confirmer, saisissez « ${opts.typeToConfirm} »`), input = /** @type {HTMLInputElement} */ (h('input', { type: 'text', autocomplete: 'off' }))) : null,
    ],
    actions: [{ label: t('cancel'), value: false }, { label: opts.confirmLabel ?? t('confirm'), value: true, variant: opts.danger ? 'danger' : 'primary' }],
    dismissValue: false,
  });
  if (r && opts.typeToConfirm && input && input.value.trim() !== opts.typeToConfirm) { toast('Texte de confirmation incorrect : opération annulée.', 'warn'); return false; }
  return !!r;
}

/** @param {string} title @param {string} label @param {string} [value] */
export async function promptDialog(title, label, value = '') {
  /** @type {HTMLInputElement} */ let input;
  const r = await modal({
    title,
    body: (close) => h('form', { onsubmit: (/** @type {Event} */ e) => { e.preventDefault(); close(true); } },
      h('label.field', null, h('span', null, label), input = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value })))),
    actions: [{ label: t('cancel'), value: false }, { label: 'OK', value: true, variant: 'primary' }],
    dismissValue: false,
  });
  // @ts-ignore
  return r ? input.value.trim() : null;
}

/** Champ libellé. @param {string} label @param {HTMLElement} control @param {string} [hint] */
export function field(label, control, hint) {
  return h('label.field', null, h('span', null, label), control, hint ? h('small.hint', null, hint) : null);
}

/** Liste déroulante. @param {{value:string,label:string}[]} options @param {string} value @param {Record<string,any>} [props] */
export function select(options, value, props = {}) {
  const s = /** @type {HTMLSelectElement} */ (h('select', props, options.map((o) => h('option', { value: o.value }, o.label))));
  s.value = value;
  return s;
}

/** Téléchargement / partage d'un fichier. @param {Blob|string} data @param {string} filename @param {string} [mime] */
export async function saveFile(data, filename, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  /** @type {HTMLAnchorElement} */ (a).click();
  setTimeout(() => { URL.revokeObjectURL(/** @type {HTMLAnchorElement} */ (a).href); a.remove(); }, 4000);
  toast(`Fichier « ${filename} » enregistré.`, 'ok');
}

/** Partage natif (mobile) si disponible, sinon téléchargement. @param {Blob} blob @param {string} filename */
export async function shareOrSave(blob, filename) {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
  } catch (e) { if (/** @type {any} */ (e)?.name === 'AbortError') return; }
  await saveFile(blob, filename);
}

/** Sélection d'un fichier local. @param {string} accept @returns {Promise<File|null>} */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const i = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept, style: { display: 'none' } }));
    i.addEventListener('change', () => { resolve(i.files?.[0] ?? null); i.remove(); });
    i.addEventListener('cancel', () => { resolve(null); i.remove(); });
    document.body.append(i);
    i.click();
  });
}
