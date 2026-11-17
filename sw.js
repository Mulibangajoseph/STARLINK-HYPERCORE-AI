// STARLINK HYPERCORE FINANCE service worker. Bump V on every release so users get the new files.
const V = 'shf-v4';
const CORE = ['./', 'index.html', 'auth-firebase.js', 'firebase-config.js', 'loan-calc.js', 'loan-ui.js', 'manifest.webmanifest', 'offline.html',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg'];
// The staff portal is never cached or served offline: always fetch it fresh from the network.
const STAFF = /\/admin\.(html|js)$/;
// Only static assets from these hosts are cached. Firebase Auth and Firestore API calls are never touched.
const RT = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com\/firebasejs)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function swr(r) {
  return caches.match(r).then(hit => {
    const net = fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; }).catch(() => hit);
    return hit || net;
  });
}
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (STAFF.test(new URL(r.url).pathname)) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put('index.html', cp)); } return res; })
      .catch(() => caches.match('index.html').then(m => m || caches.match('offline.html'))));
    return;
  }
  if (new URL(r.url).origin === location.origin || RT.test(r.url)) e.respondWith(swr(r));
});
