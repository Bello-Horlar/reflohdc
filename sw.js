/* TITLE: sw.js */
const CACHE_NAME = 'reflo-pwa-v2';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/register.html',
    '/404.html',
    '/assets/css/main.css',
    '/assets/css/components.css',
    '/assets/images/reflo-icon.png',
    '/assets/images/reflo-logo.png',
    '/assets/images/default-business-logo.png'
];

// 1. INSTALL & CACHE
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
    );
});

// 2. ACTIVATE & PURGE OLD CACHES
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
        )).then(() => clients.claim())
    );
});

// 3. NETWORK-FIRST FOR DYNAMIC CODE, CACHE FALLBACK FOR OFFLINE
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // If network is available, return live file and update cache
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return networkResponse;
            })
            .catch(() => {
                // If offline or network fails, fallback to cached assets
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});

/* ==========================================================================
   HYBRID PUSH NOTIFICATION ENGINE (APK & Background Lockscreen Alerts)
   ========================================================================== */
self.addEventListener('push', (event) => {
    // Wrap entire async resolution inside event.waitUntil so APKs/Android never drop alerts
    event.waitUntil(
        (async () => {
            // 1. Check if user is actively focused on the open screen
            const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
            const isAppActiveAndFocused = windowClients.some(c => c.visibilityState === 'visible' && c.focused);

            // If app is currently open and focused in front of user, let in-app realtime toast handle it
            if (isAppActiveAndFocused) {
                return;
            }

            // 2. Parse incoming notification payload from Supabase
            let payload = {
                title: '🔔 REFLO Business Alert',
                body: 'New urgent customer activity.',
                link: '/app/dashboard.html',
                plan: 'growth',
                vibrate: [350, 150, 350],
                requireInteraction: false
            };

            if (event.data) {
                try {
                    const parsed = event.data.json();
                    payload = Object.assign(payload, parsed);
                } catch (e) {
                    payload.body = event.data.text();
                }
            }

            const isPro = payload.plan === 'pro';

         // 3. Configure hardware vibration pattern and lock-screen options
            const options = {
                body: payload.body || payload.message, // 🟢 Supports both keys safely
                icon: '/assets/images/reflo-icon.png',
                badge: '/assets/images/reflo-icon.png',
                // PRO gets intense 4-pulse vibration; Growth gets 2-pulse
                vibrate: isPro ? [500, 100, 500, 100, 500, 100, 800] : (payload.vibrate || [250, 150, 250]),
                tag: payload.tag || ('reflo-alert-' + Date.now()),
                renotify: true,
                requireInteraction: isPro,
                data: {
                    link: payload.link || payload.url || '/app/dashboard.html',
                    timestamp: Date.now()
                },
                actions: isPro ? [
                    { action: 'open', title: '⚡ Respond' },
                    { action: 'dismiss', title: '✕ Dismiss' }
                ] : [
                    { action: 'open', title: 'View' }
                ]
            };

            return self.registration.showNotification(payload.title, options);
        })()
    );
});

/* ==========================================================================
   NOTIFICATION CLICK ROUTER
   ========================================================================== */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    const relativeLink = event.notification.data?.link || '/app/dashboard.html';
    const targetUrl = new URL(relativeLink, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // If the tab is already open, focus on it
            for (let client of windowClients) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise, open a fresh window straight to the alert link
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});