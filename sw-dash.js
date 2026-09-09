/**
 * TVL Task Delegation — service worker
 *
 * NETWORK FIRST, deliberately, exactly like the gate pass worker.
 *
 * A cache-first worker keeps serving last week's dashboard.html long
 * after a change is committed, and that is the hardest kind of bug to
 * spot: the page looks fine and simply behaves like an older version.
 * We lost an afternoon to a stale cache once already.
 *
 * Requests to Apps Script are never cached at all. A stale task list or
 * a stale score is worse than an error, because it looks true.
 */
const CACHE = 'tvl-dash-v1';
const SHELL = ['./dashboard.html', './manifest-dash.json'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // One failure must not abort the whole install.
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;

  // Never touch anything that talks to the sheet.
  if (req.method !== 'GET' || req.url.indexOf('script.google.com') > -1) return;

  e.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || new Response(
            '<h2 style="font:16px sans-serif;padding:20px">No internet connection.</h2>' +
            '<p style="font:14px sans-serif;padding:0 20px">The dashboard needs a ' +
            'connection to reach the sheet. Reconnect and reopen.</p>',
            { headers: { 'Content-Type': 'text/html' } });
        });
      })
  );
});
