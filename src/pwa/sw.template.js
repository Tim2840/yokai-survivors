/* 百鬼陣的 Service Worker（由 vite.config.ts 的 pwa 外掛在打包時填入版本編號與檔案清單，輸出成 dist/sw.js）。
 * 做法：
 * - 安裝時把打包出來的檔案（頁面、程式、樣式、圖示）先存起來，之後沒網路也能開。
 * - 開頁面（導覽）：**網路優先**，連得上就一定拿到最新版；連不上才用存起來的。這樣更新遊戲不會被舊快取卡住。
 * - 其他同網域檔案（檔名有雜湊，內容不會變）：快取優先，沒有就去抓並存起來。
 * - 換版時舊版的快取整個刪掉。跨網域的東西（Google 字型）不碰，離線時用系統字型。 */
const BUILD = '__BUILD_ID__';
const CACHE = 'yokai-survivors-' + BUILD;
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('yokai-survivors-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true })),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
