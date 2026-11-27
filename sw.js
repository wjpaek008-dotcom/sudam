/* 수담 게임방 — 오프라인 실행 + 자동 업데이트 */
const V = 'sudam-20261128001143';
const CORE = ['./', './index.html', './net.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.png',
  './baduk/', './janggi/', './omok/', './tile/', './chess/', './sudoku/', './vendor/firebase-app-compat.js', './vendor/firebase-database-compat.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache:'reload' })).catch(()=>{})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // 온라인 서버 통신은 건드리지 않음
  if (url.pathname.endsWith('/config.js')){ // 설정은 항상 새로
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req)));
    return;
  }
  // 저장된 것을 바로 보여주고, 뒤에서 새 버전을 받아둠 (다음에 열 때 반영)
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then(r => { if (r && r.ok) c.put(req.mode === 'navigate' ? new Request(url.origin + url.pathname) : req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('오프라인이에요', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
