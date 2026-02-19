// =============================================
//  Firebase Messaging Service Worker
//  Handles BACKGROUND push notifications
// =============================================

// Import Firebase scripts for service workers
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
    apiKey: "AIzaSyBI2KiFFcO45htNnRtV-7BNS-C_IRVcfKQ",
    authDomain: "lockyourassin.firebaseapp.com",
    projectId: "lockyourassin",
    storageBucket: "lockyourassin.firebasestorage.app",
    messagingSenderId: "689115328263",
    appId: "1:689115328263:web:31c382acad81c60a639fa2"
});

const messaging = firebase.messaging();

// Handle background messages (when browser tab is closed or in background)
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);

    const title = payload.notification?.title || '⏰ Task Reminder';
    const body = payload.notification?.body || 'You have a task deadline approaching.';
    const icon = '/icons/icon-192.png';

    const options = {
        body: body,
        icon: icon,
        badge: icon,
        vibrate: [200, 100, 200],
        tag: payload.data?.taskId || 'task-reminder',
        renotify: true,
        data: {
            url: self.location.origin + '/index.html',
            taskId: payload.data?.taskId || '',
        },
        actions: [
            { action: 'open', title: '📋 Open App' },
            { action: 'dismiss', title: '✕ Dismiss' },
        ],
    };

    return self.registration.showNotification(title, options);
});

// Handle notification click → open the app
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action);
    event.notification.close();

    if (event.action === 'dismiss') return;

    // Open the app or focus if already open
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it
            for (const client of clientList) {
                if (client.url.includes('/index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            return clients.openWindow('/index.html');
        })
    );
});
