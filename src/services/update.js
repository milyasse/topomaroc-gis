// @ts-check
/**
 * Mises à jour de l'application (service worker).
 * - Une version téléchargée lors d'une ouverture précédente (worker « en attente ») est annoncée dès l'ouverture.
 * - La présence d'une nouvelle version est vérifiée au retour au premier plan et toutes les 30 minutes.
 * - La mise à jour n'est appliquée qu'à la demande de l'utilisateur (jamais au milieu d'une saisie).
 */
import { APP_VERSION } from '../version.js';

let requested = false;
let reloaded = false;

/** Version publiée en ligne (lue dans src/version.js, sans cache). @returns {Promise<string|null>} */
export async function onlineVersion() {
  try {
    const r = await fetch(new URL('../version.js', import.meta.url).href + `?fresh=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return /APP_VERSION\s*=\s*'([^']+)'/.exec(await r.text())?.[1] ?? null;
  } catch { return null; }
}

/** Compare deux numéros « a.b.c ». @param {string} a @param {string} b */
export function newer(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

/** @param {ServiceWorker} w @param {(el: HTMLElement) => void} show */
function offer(w, show) {
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div'); bar.className = 'update-bar';
  bar.innerHTML = '<svg class="ic"><use href="#i-info"/></svg><span>Une nouvelle version est disponible.</span>';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'link-btn'; b.textContent = 'Mettre à jour';
  b.addEventListener('click', () => { requested = true; w.postMessage('skipWaiting'); b.textContent = 'Mise à jour…'; });
  bar.append(b); show(bar);
}

/** Enregistre le service worker et surveille les mises à jour. */
export function registerUpdates() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const show = (/** @type {HTMLElement} */ el) => document.body.append(el);
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    // version déjà téléchargée et en attente (ouverture précédente)
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting, show);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw, show); });
    });
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch((e) => console.warn('Service worker non enregistré', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (requested && !reloaded) { reloaded = true; location.reload(); } });
}

/**
 * Mise à jour immédiate, demandée depuis la page « Version » :
 * active la version en attente, sinon la télécharge ; en dernier recours vide le cache hors ligne et recharge.
 * @returns {Promise<'reloading'|'uptodate'|'offline'>}
 */
export async function updateNow() {
  if (!navigator.onLine) return 'offline';
  const online = await onlineVersion();
  if (online && !newer(online, APP_VERSION)) return 'uptodate';
  requested = true;
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (reg) {
    if (reg.waiting) { reg.waiting.postMessage('skipWaiting'); return 'reloading'; }
    await reg.update().catch(() => {});
    const w = reg.installing || reg.waiting;
    if (w) {
      await new Promise((res) => { const t = setTimeout(res, 15000); w.addEventListener('statechange', () => { if (w.state === 'installed' || w.state === 'activated') { clearTimeout(t); res(null); } }); });
      if (reg.waiting) { reg.waiting.postMessage('skipWaiting'); setTimeout(() => location.reload(), 4000); return 'reloading'; }
    }
  }
  // dernier recours : cache hors ligne vidé puis rechargement depuis le réseau (les données des projets ne sont pas touchées)
  try { for (const k of await caches.keys()) if (k.startsWith('topomaroc-')) await caches.delete(k); } catch { /* */ }
  try { await reg?.unregister(); } catch { /* */ }
  location.reload();
  return 'reloading';
}
