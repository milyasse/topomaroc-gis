/* Service worker TopoMaroc GIS.
   - Pré-cache de l'application (interface, calculs, bibliothèques, modèle magnétique) :
     fonctionnement hors connexion pour la saisie, le GPS, les calculs et les exports.
   - Les tuiles de fonds de carte et la recherche de lieux (domaines tiers) ne sont PAS mises
     en cache par le service worker (respect des politiques d'usage des fournisseurs) : seul
     le cache HTTP ordinaire du navigateur peut en conserver. */
importScripts('./sw-precache.js');
/* global PRECACHE */
const CACHE = `topomaroc-${self.PRECACHE.version}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(self.PRECACHE.files.map((f) => new Request(f, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('topomaroc-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiers : réseau uniquement
  if (req.mode === 'navigate') {
    // Réseau d'abord (version à jour), repli sur la page en cache hors connexion
    event.respondWith((async () => {
      try {
        const r = await fetch(req);
        return r;
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }
  // Ressources de l'application : cache d'abord (versionné), réseau en repli
  event.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok && r.type === 'basic') c.put(req, r.clone());
      return r;
    } catch {
      return new Response('Ressource indisponible hors connexion', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
