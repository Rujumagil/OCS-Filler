const CACHE="ocs-filler-areas-v20";
const ASSETS=["/","/index.html","/almacen.html","/costos.js","/ventas.html","/recetario.html","/ventas-historico-2026-10.js","/ventas-graficos.js","/styles.css","/app.js","/manifest.webmanifest"];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith("/api/")){
    event.respondWith(fetch(req,{cache:"no-store"}));
    return;
  }
  event.respondWith(fetch(req).catch(()=>caches.match(req).then(r=>r||caches.match("/"))));
});