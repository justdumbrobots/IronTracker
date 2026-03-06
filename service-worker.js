// ─── FCM background messaging (must come before install/activate/fetch) ───────
// Uses Firebase compat SDK because ES module imports are not
// universally supported inside service workers.
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyB78UVReJzB467VOIZNukbOoMm1t-TSVBc",
    authDomain: "iron-tracker-3f59f.firebaseapp.com",
    projectId: "iron-tracker-3f59f",
    storageBucket: "iron-tracker-3f59f.firebasestorage.app",
    messagingSenderId: "990770977639",
    appId: "1:990770977639:web:934961d8b5abac53b02dc2"
});

const swMessaging = firebase.messaging();

// Show a notification when the app is in the background
swMessaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'IRON TRACK';
    const body  = payload.notification?.body  || '';
    self.registration.showNotification(title, {
        body,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  payload.data || {}
    });
});

// ─── PWA caching ──────────────────────────────────────────────────────────────
const CACHE = 'iron-track-v11';
const ASSETS = [
    '/', '/index.html', '/styles.css', '/app.js', '/manifest.json',
    '/favicon-16x16.png', '/favicon-32x32.png', '/apple-touch-icon.png',
    '/android-chrome-192x192.png', '/android-chrome-512x512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (!res || res.status !== 200 || res.type !== 'basic') return res;
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
                return res;
            }).catch(() => caches.match('/index.html'));
        })
    );
});
