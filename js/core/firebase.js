/**
 * js/core/firebase.js — RecipePantry
 * Inicializa Firebase App + Messaging y los expone globalmente.
 * Cargado como <script type="module"> para usar ES Modules CDN.
 */

import { initializeApp }   from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getMessaging }    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';

let firebaseApp = null;
let firebaseMessaging = null;

async function loadFirebaseConfig() {
  // 1. Configuración inyectada globalmente (p. ej. en window)
  if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
    return window.FIREBASE_CONFIG;
  }

  // 2. Archivo de configuración local (.gitignore - desarrollo local)
  try {
    const mod = await import('./firebase-config.js');
    const local = mod.default || mod.firebaseConfig;
    if (local && local.apiKey && !local.apiKey.includes('TU_FIREBASE_API_KEY')) {
      return local;
    }
  } catch (e) {
    // Normal cuando el archivo no existe en el despliegue
  }

  // 3. Endpoint dinámico seguro (Vercel serverless / dev-server)
  try {
    const res = await fetch('/api/firebase-config');
    if (res.ok) {
      const remote = await res.json();
      if (remote && remote.apiKey) {
        return remote;
      }
    }
  } catch (e) {
    // Modo offline o sin backend
  }

  return null;
}

const firebaseConfig = await loadFirebaseConfig();

if (firebaseConfig && firebaseConfig.apiKey) {
  try {
    firebaseApp       = initializeApp(firebaseConfig);
    firebaseMessaging = getMessaging(firebaseApp);

    // Exponer globalmente para que push.js (script clásico) los pueda usar
    window.firebaseApp       = firebaseApp;
    window.firebaseMessaging = firebaseMessaging;

    console.log(`🔥 [Firebase] Inicializado correctamente (${firebaseConfig.projectId || 'app'})`);
  } catch (err) {
    console.error('❌ [Firebase] Error al inicializar:', err);
  }
} else {
  console.warn('⚠️ [Firebase] Configuración no disponible. Notificaciones push en espera de credenciales.');
}

export { firebaseApp, firebaseMessaging };
