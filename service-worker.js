const CACHE_NAME = 'atmosphere-weather-v7';
const STATIC_CACHE = 'atmosphere-static-v7';
const DYNAMIC_CACHE = 'atmosphere-dynamic-v7';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/signin.html',
  '/signup.html',
  '/style.css',
  '/signin.css',
  '/signup.css',
  '/script.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install - Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => !name.includes(CACHE_NAME) && !name.includes(STATIC_CACHE) && !name.includes(DYNAMIC_CACHE))
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - Advanced caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Strategy for API calls (Network First with Cache Fallback)
  if (url.href.includes('api.openweathermap.org')) {
    event.respondWith(networkFirstWithTimeout(request, 5000));
    return;
  }

  // Strategy for static assets (Cache First)
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Default: Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Caching Strategies

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  
  if (cached) return cached;
  
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithTimeout(request, timeout) {
  const cache = await caches.open(DYNAMIC_CACHE);
  
  return Promise.race([
    fetch(request).then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]).catch(async () => {
    const cached = await cache.match(request);
    if (cached) return cached;
    
    // Return offline fallback for API
    return new Response(
      JSON.stringify({ 
        error: 'Offline', 
        message: 'Using cached data or no data available' 
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  });
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  
  return cached || fetchPromise;
}

// Background Sync for offline requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-weather') {
    event.waitUntil(syncWeatherData());
  }
});

async function syncWeatherData() {
  // Process any queued weather requests
  console.log('Syncing weather data...');
}

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.body || 'Check the latest weather conditions',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'weather-update',
    requireInteraction: false,
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: data.data || {}
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Weather Update', 
      options
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const { action, notification } = event;
  
  if (action === 'dismiss') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        const url = notification.data?.url || '/';
        
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Periodic Background Sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'weather-update') {
    event.waitUntil(updateWeatherInBackground());
  }
});

async function updateWeatherInBackground() {
  // Fetch weather for saved locations and show notifications if needed
  console.log('Background sync: Updating weather...');
}

// Message handling from client
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
