// @ts-check
/**
 * Animations de l'interface avec GSAP. Toutes les animations sont désactivées (durée nulle)
 * si l'utilisateur a demandé « réduire les animations » dans son système.
 */
import { gsap, Draggable } from '../../vendor/gsap.mjs';

const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const d = (/** @type {number} */ s) => (reduce() ? 0 : s);

export { gsap, Draggable };

export const anim = {
  /** Apparition d'un écran (tuiles en cascade). @param {Element} el */
  screenIn(el) {
    const items = el.querySelectorAll('[data-stagger]');
    const tl = gsap.timeline();
    tl.fromTo(el, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: d(0.28), ease: 'power2.out' });
    if (items.length) tl.fromTo(items, { autoAlpha: 0, y: 16, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: d(0.32), stagger: d(0.04), ease: 'power2.out' }, '-=0.15');
    return tl;
  },
  /** @param {Element} el */
  screenOut(el) { return gsap.to(el, { autoAlpha: 0, y: 8, duration: d(0.18), ease: 'power1.in' }); },
  /** Contenu du panneau qui change. @param {Element} el */
  panelIn(el) { return gsap.fromTo(el, { autoAlpha: 0, x: 14 }, { autoAlpha: 1, x: 0, duration: d(0.25), ease: 'power2.out', clearProps: 'transform' }); },
  /** @param {Element} el */
  toastIn(el) { return gsap.fromTo(el, { autoAlpha: 0, y: 20, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: d(0.25), ease: 'back.out(1.6)' }); },
  /** @param {Element} el */
  toastOut(el) { return new Promise((r) => gsap.to(el, { autoAlpha: 0, y: -8, duration: d(0.2), onComplete: r })); },
  /** @param {Element} card @param {Element} bg */
  modalIn(card, bg) {
    gsap.fromTo(bg, { autoAlpha: 0 }, { autoAlpha: 1, duration: d(0.18) });
    return gsap.fromTo(card, { autoAlpha: 0, y: 24, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: d(0.28), ease: 'power3.out' });
  },
  /** @param {Element} card @param {Element} bg */
  modalOut(card, bg) {
    return new Promise((r) => {
      gsap.to(card, { autoAlpha: 0, y: 16, duration: d(0.16), ease: 'power1.in' });
      gsap.to(bg, { autoAlpha: 0, duration: d(0.18), onComplete: r });
    });
  },
  /** Mise en évidence d'une valeur mise à jour. @param {Element} el */
  flash(el) { return gsap.fromTo(el, { backgroundColor: 'rgba(214,96,42,0.25)' }, { backgroundColor: 'rgba(214,96,42,0)', duration: d(0.9), ease: 'power1.out', clearProps: 'backgroundColor' }); },
  /** Rotation d'une aiguille par le plus court chemin. @param {Element} el @param {number} deg */
  rotate(el, deg) { return gsap.to(el, { rotation: `${deg}_short`, duration: d(0.35), ease: 'power2.out', transformOrigin: '50% 50%', overwrite: 'auto' }); },
  /** Pulsation d'arrivée (boucle). @param {Element} el */
  arrival(el) {
    if (reduce()) return gsap.set(el, { scale: 1 });
    return gsap.fromTo(el, { scale: 1 }, { scale: 1.06, duration: 0.45, yoyo: true, repeat: 5, ease: 'sine.inOut' });
  },
  /** Secousse (erreur de saisie). @param {Element} el */
  shake(el) { return gsap.fromTo(el, { x: -6 }, { x: 0, duration: d(0.4), ease: 'elastic.out(1, 0.3)' }); },
  /** Valeur numérique animée (compteur). @param {HTMLElement} el @param {number} to @param {(v:number)=>string} fmt */
  count(el, to, fmt) {
    const from = Number(el.dataset.v ?? to);
    el.dataset.v = String(to);
    const o = { v: from };
    return gsap.to(o, { v: to, duration: d(0.4), ease: 'power1.out', onUpdate: () => { el.textContent = fmt(o.v); } });
  },
};

/**
 * Panneau inférieur glissable (mobile) : positions « réduit », « mi-hauteur », « plein ».
 * @param {HTMLElement} sheet @param {HTMLElement} handle
 * @returns {{ snap: (state: 'min'|'mid'|'max') => void, state: () => string }}
 */
export function makeSheet(sheet, handle) {
  let current = 'mid';
  const isMobile = () => window.matchMedia('(max-width: 899px)').matches;
  // Hauteurs visibles du panneau (le contenu reste entièrement accessible par défilement)
  const heights = () => {
    const avail = /** @type {HTMLElement} */ (sheet.parentElement).clientHeight;
    return { min: Math.min(112, avail), mid: Math.round(avail * 0.52), max: avail - 8 };
  };
  /** @param {'min'|'mid'|'max'} s @param {boolean} [instant] */
  const snap = (s, instant = false) => {
    current = s;
    sheet.dataset.state = s;
    document.body.dataset.sheet = s;
    if (!isMobile()) { gsap.set(sheet, { clearProps: 'height' }); return; }
    gsap.to(sheet, { height: heights()[s], duration: instant ? 0 : d(0.32), ease: 'power3.out', overwrite: 'auto' });
  };
  // Glissement de la poignée : Draggable sur un élément « fantôme », la hauteur suit le doigt
  const proxy = document.createElement('div');
  let startH = 0;
  const [drag] = Draggable.create(proxy, {
    type: 'y', trigger: handle, allowContextMenu: true, zIndexBoost: false,
    onPress() { if (!isMobile()) { this.endDrag(); return; } startH = sheet.offsetHeight; gsap.set(proxy, { y: 0 }); this.update(); },
    onDrag() {
      const hs = heights();
      gsap.set(sheet, { height: Math.max(hs.min, Math.min(hs.max, startH - this.y)) });
    },
    onDragEnd() {
      const hs = heights();
      const hNow = sheet.offsetHeight;
      /** @type {('min'|'mid'|'max')[]} */
      const order = ['min', 'mid', 'max'];
      let best = order.reduce((b, k) => (Math.abs(hs[k] - hNow) < Math.abs(hs[b] - hNow) ? k : b), /** @type {'min'|'mid'|'max'} */ ('mid'));
      const moved = startH - hNow;
      if (Math.abs(moved) > 40 && best === current) { const i = order.indexOf(/** @type {any} */ (current)); best = order[Math.max(0, Math.min(2, i + (moved > 0 ? 1 : -1)))]; }
      snap(best);
    },
  });
  handle.addEventListener('click', () => { if (!drag.isDragging && isMobile()) snap(current === 'min' ? 'mid' : current === 'mid' ? 'max' : 'min'); });
  handle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle.click(); } });
  window.addEventListener('resize', () => snap(/** @type {any} */ (current), true));
  snap('mid', true);
  return { snap, state: () => current };
}
