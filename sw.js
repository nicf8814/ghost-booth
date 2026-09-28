// Ghost Booth service worker (CLAUDE.md section 45: "the core booth must
// continue working after the initial installation without network access").
//
// Hand-written rather than a build-plugin-generated one (e.g.
// vite-plugin-pwa) -- section 1's "prefer browser-native APIs over
// unnecessary dependencies" -- and deliberately simple: cache what gets
// fetched, on the fly, rather than a build-time precache manifest. The
// booth's own JS/CSS bundle filenames are content-hashed by Vite already
// (see vite.config.ts), so once a file has loaded once, this worker can
// keep serving that exact version indefinitely without needing to know its
// name ahead of time.
//
// Strategy is deliberately asymmetric, because this project has already
// been bitten once by a *stale* cached index.html pointing at an old JS
// bundle hash (see PROJECT_LOG.md's share-sheet debugging session) -- the
// whole point of this worker is offline resilience, not "lock in whatever
// was cached first":
//   - Navigation requests (the page itself) and this very sw.js file:
//     network-first. When online, the operator/guest always gets whatever
//     is actually deployed, same as without a service worker at all. Only
//     falls back to the cached shell when the network request fails
//     outright (offline / DNS down / etc), which is exactly the scenario
//     this worker exists for.
//   - Everything else same-origin (hashed JS/CSS chunks, the face model
//     files, cameo/overlay images): cache-first. These are either
//     content-hashed or effectively static for the life of a deploy, so a
//     cache hit is always correct and this is what actually makes the
//     booth resilient to a mid-event Wi-Fi drop or a Safari tab reload
//     while offline.
//
// Bump CACHE_VERSION on any change to this file's own caching behavior (not
// on every app deploy -- deploys are already handled by the network-first
// navigation strategy above); activate() below deletes every other
// ghost-booth-* cache, so a stale previous version's cached entries don't
// linger.

const CACHE_VERSION = "ghost-booth-v1";

const CORE_SHELL = ["./", "./manifest.webmanifest", "./favicon.svg", "./icons.svg"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_SHELL))
      .catch((err) => {
        // Best-effort (CLAUDE.md section 49): if the shell can't be
        // precached right now (e.g. this install itself is happening
        // offline for some reason), don't block activation -- the
        // runtime cache-on-fetch below will still fill things in once a
        // network request succeeds.
        console.warn("Ghost Booth SW: failed to precache core shell", err);
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests -- never intercept cross-origin
  // calls (there shouldn't be any in the core booth flow, per CLAUDE.md
  // section 1's "no backend required" and section 44's no-cloud-upload
  // default) or non-GET requests (nothing to meaningfully cache).
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  const isNavigation = request.mode === "navigate";
  const isSelf = request.url.endsWith("/sw.js");

  if (isNavigation || isSelf) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Offline with nothing cached yet -- nothing this worker can do;
    // let the request fail normally rather than fabricating a response.
    throw new Error("Ghost Booth SW: offline and no cached copy available");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  // Nothing cached and, if the network's also unavailable (e.g. a
  // face-model file that never got a chance to load before Wi-Fi dropped),
  // this throws and propagates -- callers up the chain
  // (FaceDetectionWorker, OwnerCameoEngine, etc) already degrade gracefully
  // per CLAUDE.md section 49.
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}
