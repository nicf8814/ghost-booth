// Keeps the booth working with no Wi-Fi or spotty Wi-Fi.
// At build time (see vite.config.ts) __PRECACHE__ becomes the list of every
// built file and __VERSION__ becomes a hash of them, so the first visit
// downloads the whole app and each new deploy gets a fresh cache.
// Page: try the network briefly (to pick up new deploys), then fall back to cache.
// Everything else: cache first.
const VERSION = "52a2976887cf";
const PRECACHE = ["./","./assets/creepster-latin-400-normal-DFidaany.woff","./assets/creepster-latin-400-normal-DnKpM-ys.woff2","./assets/index-CcchZZ9A.js","./assets/index-DBnhHm56.css","./assets/inter-cyrillic-600-normal-4D_pXhcN.woff","./assets/inter-cyrillic-600-normal-CWCymEST.woff2","./assets/inter-cyrillic-800-normal-C7MGvYyJ.woff2","./assets/inter-cyrillic-800-normal-CCHyn08d.woff","./assets/inter-cyrillic-ext-600-normal-Bcila6Z-.woff","./assets/inter-cyrillic-ext-600-normal-Dfes3d0z.woff2","./assets/inter-cyrillic-ext-800-normal-BZOjs1Xv.woff2","./assets/inter-cyrillic-ext-800-normal-Ca-gJeZY.woff","./assets/inter-greek-600-normal-BZpKdvQh.woff","./assets/inter-greek-600-normal-plRanbMR.woff2","./assets/inter-greek-800-normal-BU00tryP.woff","./assets/inter-greek-800-normal-CLIouy3y.woff2","./assets/inter-greek-ext-600-normal-B8X0CLgF.woff","./assets/inter-greek-ext-600-normal-DRtmH8MT.woff2","./assets/inter-greek-ext-800-normal-B--PVpEC.woff2","./assets/inter-greek-ext-800-normal-DUe57HfS.woff","./assets/inter-latin-600-normal-CiBQ2DWP.woff","./assets/inter-latin-600-normal-LgqL8muc.woff2","./assets/inter-latin-800-normal-BYj_oED-.woff2","./assets/inter-latin-800-normal-D1mf63XC.woff","./assets/inter-latin-ext-600-normal-CIVaiw4L.woff","./assets/inter-latin-ext-600-normal-D2bJ5OIk.woff2","./assets/inter-latin-ext-800-normal-BOMpwxm3.woff","./assets/inter-latin-ext-800-normal-DZJjya6U.woff2","./assets/inter-vietnamese-600-normal-BuLX-rYi.woff","./assets/inter-vietnamese-600-normal-Cc8MFFhd.woff2","./assets/inter-vietnamese-800-normal-Cm7tD1pz.woff2","./assets/inter-vietnamese-800-normal-DDlpr_Ee.woff","./cameo/ghost-bride.png","./cameo/nic-cutout.png","./cameo/victorian-man.png","./cameo/victorian-woman.png","./favicon.svg","./frames/filigree.png","./frames/title.svg","./index.html","./manifest.webmanifest"];
const CACHE = `human-photobooth-${VERSION}`;
const NAV_TIMEOUT_MS = 3000;

const files = Array.isArray(PRECACHE) ? PRECACHE : ["./", "./manifest.webmanifest", "./favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(files)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(req, NAV_TIMEOUT_MS)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./", copy));
          }
          return res;
        })
        .catch(() => caches.match("./", { ignoreSearch: true })),
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
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
