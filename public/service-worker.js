// =====================================================
// VAMOS FESTA - Service Worker for PWA
// Enables offline functionality and caching
// =====================================================

const CACHE_NAME = 'vamosfesta-v2.1.0';
const RUNTIME_CACHE = 'vamosfesta-runtime-v2.1.0';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/vamos-festa-logo.png'
];

// External libraries (cache with network fallback)
const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://unpkg.com/qr-scanner@1.4.2/qr-scanner.umd.min.js'
];

// =====================================================
// INSTALL EVENT - Cache core assets
// =====================================================
self.addEventListener('install', (event) => {
  console.log('[Vamos Festa SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Vamos Festa SW] Precaching app shell');
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'})));
      })
      .catch(err => console.log('[Vamos Festa SW] Precache failed:', err))
      .then(() => self.skipWaiting())
  );
});

// =====================================================
// ACTIVATE EVENT - Clean up old caches
// =====================================================
self.addEventListener('activate', (event) => {
  console.log('[Vamos Festa SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName.startsWith('vamosfesta-') && 
                     cacheName !== CACHE_NAME && 
                     cacheName !== RUNTIME_CACHE;
            })
            .map((cacheName) => {
              console.log('[Vamos Festa SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// =====================================================
// FETCH EVENT - Network-first with cache fallback
// =====================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip chrome extensions
  if (url.protocol === 'chrome-extension:') return;
  
  // Supabase API - Network first with cache fallback
  if (url.hostname.includes('supabase')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then((cachedResponse) => {
              return cachedResponse || new Response(
                JSON.stringify({
                  error: 'Offline',
                  message: 'No internet connection'
                }),
                {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
    return;
  }
  
  // App assets - Cache first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          return fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseClone);
                });
              }
              return response;
            })
            .catch(() => {
              if (request.destination === 'document') {
                return caches.match('/index.html');
              }
            });
        })
    );
    return;
  }
  
  // External CDN - Cache first
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        
        return fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          });
      })
  );
});

// =====================================================
// MESSAGE HANDLER
// =====================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// =====================================================
// PUSH NOTIFICATIONS
// =====================================================
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from Vamos Festa',
    icon: '/icons/android-chrome-192x192.png',
    badge: '/icons/favicon-32x32.png',
    vibrate: [200, 100, 200],
    tag: 'vamosfesta-notification'
  };
  
  event.waitUntil(
    self.registration.showNotification('Vamos Festa', options)
  );
});

console.log('[Vamos Festa SW] Loaded successfully');