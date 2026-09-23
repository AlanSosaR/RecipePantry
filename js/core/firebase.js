/**
 * js/core/firebase.js — RecipePantry
 * Inicializa Firebase App + Messaging y los expone globalmente.
 * Cargado como <script type="module"> para usar ES Modules CDN.
 */

import { initializeApp }   from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getMessaging }    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCcp8u2ckTy8E1Un1Fp5s-ZuYqJoxVYct4',
  authDomain:        'recipepantry-e8ef8.firebaseapp.com',
  projectId:         'recipepantry-e8ef8',
  storageBucket:     'recipepantry-e8ef8.firebasestorage.app',
  messagingSenderId: '547631229279',
  appId:             '1:547631229279:web:5ad75d816f2c37f75e6eea'
};

let firebaseApp;
let firebaseMessaging;

try {
  firebaseApp       = initializeApp(firebaseConfig);
  firebaseMessaging = getMessaging(firebaseApp);

  // Exponer globalmente para que push.js (script clásico) los pueda usar
  window.firebaseApp       = firebaseApp;
  window.firebaseMessaging = firebaseMessaging;

  console.log('🔥 [Firebase] Inicializado correctamente (recipepantry-e8ef8)');
} catch (err) {
  console.error('❌ [Firebase] Error al inicializar:', err);
}

export { firebaseApp, firebaseMessaging };
