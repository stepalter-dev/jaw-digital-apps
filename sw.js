/*
 * sw.js — offline support for the JAW Digital journals.
 *
 * One worker covers the whole suite. Each journal registers it with a
 * relative path (see journal-app.js), so the scope works out to the
 * directory the journals live in whether that's /jaw-digital-apps/ on
 * github.io or / on a custom domain — nothing here hardcodes a base path.
 *
 * Strategy, deliberately conservative:
 *   - Page loads are network-first. Online you always get the current
 *     journal; offline you get the last copy that loaded. A stale-first
 *     worker is how PWAs end up serving month-old builds, so we don't.
 *   - Fonts are cache-first. They're versioned by URL and never change
 *     under the same address.
 *   - Everything else same-origin is network-first with a cache fallback.
 *   - Anything that isn't a plain GET is passed straight through, so
 *     Supabase auth and progress sync are never touched.
 */

var VERSION = 'jaw-v1';
var PAGES = VERSION + '-pages';
var ASSETS = VERSION + '-assets';
var FONTS = VERSION + '-fonts';

var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (event) {
  // A new worker should take over promptly rather than waiting for every
  // tab to close — journals are usually left open for hours.
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(VERSION) !== 0) return caches.delete(k);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function putCopy(cacheName, request, response) {
  // Only cache complete, successful responses. An opaque or partial
  // response cached here would be indistinguishable from a real one later.
  if (!response || response.status !== 200 || response.type === 'opaque') return response;
  var copy = response.clone();
  caches.open(cacheName).then(function (c) { c.put(request, copy); });
  return response;
}

function networkFirst(request, cacheName) {
  return fetch(request)
    .then(function (res) { return putCopy(cacheName, request, res); })
    .catch(function () {
      return caches.match(request).then(function (hit) {
        if (hit) return hit;
        // Navigations with nothing cached get an honest offline page
        // rather than the browser's dinosaur.
        if (request.mode === 'navigate') {
          return new Response(
            '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>Offline</title><style>' +
            'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
            'background:#131110;color:#e8e0d0;font-family:Georgia,serif;text-align:center;padding:24px}' +
            'h1{font-size:22px;margin:0 0 10px}p{color:#a89b7f;font-size:15px;margin:0;max-width:44ch}' +
            '</style></head><body><div><h1>Not opened on this device yet</h1>' +
            '<p>This journal has to load once while you’re online before it can be read offline. ' +
            'Reconnect and open it, and it’ll be available from then on.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
        return Response.error();
      });
    });
}

function cacheFirst(request, cacheName) {
  return caches.match(request).then(function (hit) {
    if (hit) return hit;
    return fetch(request).then(function (res) { return putCopy(cacheName, request, res); });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Never interfere with sign-in, sync, or any other write.
  if (request.method !== 'GET') return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  if (FONT_HOSTS.indexOf(url.hostname) > -1) {
    event.respondWith(cacheFirst(request, FONTS));
    return;
  }

  // Leave every other cross-origin request alone — Supabase, the CDN that
  // serves supabase-js, anything else added later.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGES));
    return;
  }

  event.respondWith(networkFirst(request, ASSETS));
});
