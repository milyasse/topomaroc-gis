// @ts-check
/**
 * Internationalisation. Le français est la langue de référence ; l'arabe pourra être ajouté
 * en fournissant un dictionnaire `ar.js` (l'attribut dir="rtl" est géré par setLang).
 */
import fr from './fr.js';

/** @type {Record<string, Record<string,string>>} */
const DICTS = { fr };
let lang = 'fr';

/** @param {string} key @param {Record<string, string|number>} [vars] */
export function t(key, vars) {
  const s = DICTS[lang]?.[key] ?? DICTS.fr[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : s;
}

export const LANGS = [{ value: 'fr', label: 'Français', dir: 'ltr', available: true }, { value: 'ar', label: 'العربية (bientôt)', dir: 'rtl', available: false }];

/** @param {string} l */
export function setLang(l) {
  const def = LANGS.find((x) => x.value === l && x.available) ?? LANGS[0];
  lang = def.value;
  document.documentElement.lang = def.value;
  document.documentElement.dir = def.dir;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(/** @type {HTMLElement} */ (el).dataset.i18n || ''); });
}
export const getLang = () => lang;
