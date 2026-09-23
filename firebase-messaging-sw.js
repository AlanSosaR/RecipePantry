/**
 * firebase-messaging-sw.js — RecipePantry
 * Service Worker dedicado para Firebase Cloud Messaging (FCM)
 * Maneja notificaciones push cuando la app está en background o cerrada
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCcp8u2ckTy8E1Un1Fp5s-ZuYqJoxVYct4",
  authDomain: "recipepantry-e8ef8.firebaseapp.com",
  projectId: "recipepantry-e8ef8",
  storageBucket: "recipepantry-e8ef8.firebasestorage.app",
  messagingSenderId: "547631229279",
  appId: "1:547631229279:web:5ad75d816f2c37f75e6eea"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ── Capa 1: Firebase SDK onBackgroundMessage ──────────────────────────────────
// Se activa cuando la app está en background o el tab está oculto
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] onBackgroundMessage recibido:', payload);

  const title = payload.notification?.title || 'Recipe Pantry';
  const body  = payload.notification?.body  || '';
  const url   = payload.data?.url || '/';

  const options = {
    body,
    icon:             '/assets/icons/icon.svg',
    badge:            '/assets/icons/icon.svg',
    data:             { url, ...payload.data },
    requireInteraction: true,
    tag:              payload.data?.notification_id || 'rp-push',
    vibrate:          [200, 100, 200]
  };

  self.registration.showNotification(title, options);
});

// ── Capa 2: Evento push nativo (fallback) ─────────────────────────────────────
// Se activa si FCM SDK no captura el evento (casos extremos)
self.addEventListener('push', (event) => {
  // Si Firebase ya procesó el mensaje, evitar duplicado
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { notification: { title: 'Recipe Pantry', body: event.data.text() } };
  }

  // Si el payload tiene estructura FCM estándar ya la maneja onBackgroundMessage
  // Solo procesamos aquí si NO tiene el campo 'fcmMessageId'
  if (payload.fcmMessageId) return;

  console.log('[FCM SW] Push nativo (fallback):', payload);

  const title = payload.notification?.title || 'Recipe Pantry';
  const body  = payload.notification?.body  || '';
  const url   = payload.data?.url || '/';

  const options = {
    body,
    icon:             '/assets/icons/icon.svg',
    badge:            '/assets/icons/icon.svg',
    data:             { url },
    requireInteraction: true,
    tag:              'rp-push-fallback',
    vibrate:          [200, 100, 200]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Click en la notificación ──────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      // Si ya hay una pestaña abierta en esa URL, la enfocamos (sin duplicar)
      const existingClient = clientsArr.find((c) => c.url === targetUrl);
      if (existingClient) {
        return existingClient.focus();
      }
      // Si no, abrir nueva pestaña
      return self.clients.openWindow(targetUrl);
    })
  );
});
