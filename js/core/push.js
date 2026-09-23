/**
 * js/core/push.js — RecipePantry
 * Gestión de Push Notifications con Firebase Cloud Messaging:
 *  - registerPushToken(userId): pide permiso, registra SW FCM, guarda token en Supabase
 *  - initForegroundPush():     escucha mensajes en foreground y despacha evento UI
 *  - Snackbar de permiso personalizado (respeta window.i18n)
 */

(function () {
  'use strict';

  // ─── Constantes ─────────────────────────────────────────────────────────────
  const VAPID_KEY =
    'BM-SgYdkNOhKtyviNFLLvgFG8w3bbsNyJ2mtBh71swud3uFI7RUH9fvk-zxagdB4PpKwKlduFUv2WuG0Chn5Jjo';

  const SW_PATH       = '/firebase-messaging-sw.js';
  const PUSH_TABLE    = 'push_tokens';
  const PLATFORM      = 'web';

  // ─── Snackbar de permiso personalizado ──────────────────────────────────────
  function _injectSnackbarStyles() {
    if (document.getElementById('rp-push-snackbar-style')) return;
    const style = document.createElement('style');
    style.id = 'rp-push-snackbar-style';
    style.textContent = `
      #rp-push-snackbar {
        position: fixed;
        bottom: 88px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        z-index: 9999;
        background: var(--md-sys-color-surface-container-high, #2a2a2a);
        color: var(--md-sys-color-on-surface, #fff);
        border-radius: 16px;
        padding: 16px 20px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 16px;
        max-width: 380px;
        width: calc(100vw - 32px);
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
      }
      #rp-push-snackbar.rp-push-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: all;
      }
      #rp-push-snackbar .rp-push-icon {
        font-size: 28px;
        flex-shrink: 0;
      }
      #rp-push-snackbar .rp-push-text {
        flex: 1;
        font-size: 14px;
        line-height: 1.4;
      }
      #rp-push-snackbar .rp-push-text strong {
        display: block;
        margin-bottom: 4px;
        font-size: 15px;
      }
      #rp-push-snackbar .rp-push-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      #rp-push-snackbar button {
        border: none;
        border-radius: 20px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
      }
      #rp-push-snackbar button:hover { opacity: 0.85; }
      #rp-push-btn-allow {
        background: var(--md-sys-color-primary, #10B981);
        color: var(--md-sys-color-on-primary, #fff);
      }
      #rp-push-btn-deny {
        background: transparent;
        color: var(--md-sys-color-on-surface-variant, #aaa);
        border: 1px solid currentColor !important;
      }
    `;
    document.head.appendChild(style);
  }

  function _showPermissionSnackbar(onAllow, onDeny) {
    _injectSnackbarStyles();

    const isEn = window.i18n?.getLang?.() === 'en';
    const title = isEn
      ? '🔔 Enable notifications?'
      : '🔔 ¿Activar notificaciones?';
    const body = isEn
      ? 'Get alerts when someone shares a recipe with you.'
      : 'Recibe avisos cuando alguien te comparta una receta.';
    const allowText = isEn ? 'Allow'    : 'Permitir';
    const denyText  = isEn ? 'Not now'  : 'Ahora no';

    // Eliminar snackbar previo si existe
    const prev = document.getElementById('rp-push-snackbar');
    if (prev) prev.remove();

    const snackbar = document.createElement('div');
    snackbar.id = 'rp-push-snackbar';
    snackbar.setAttribute('role', 'alertdialog');
    snackbar.setAttribute('aria-label', title);
    snackbar.innerHTML = `
      <div class="rp-push-icon">🔔</div>
      <div class="rp-push-text">
        <strong>${title}</strong>
        ${body}
      </div>
      <div class="rp-push-actions">
        <button id="rp-push-btn-deny">${denyText}</button>
        <button id="rp-push-btn-allow">${allowText}</button>
      </div>
    `;
    document.body.appendChild(snackbar);

    // Animar entrada
    requestAnimationFrame(() => {
      requestAnimationFrame(() => snackbar.classList.add('rp-push-visible'));
    });

    const _dismiss = () => {
      snackbar.classList.remove('rp-push-visible');
      setTimeout(() => snackbar.remove(), 350);
    };

    document.getElementById('rp-push-btn-allow').addEventListener('click', () => {
      _dismiss();
      onAllow();
    });
    document.getElementById('rp-push-btn-deny').addEventListener('click', () => {
      _dismiss();
      onDeny();
    });

    // Auto-dismiss a los 15 segundos
    setTimeout(() => { if (document.getElementById('rp-push-snackbar')) _dismiss(); }, 15000);
  }

  // ─── Registro del Service Worker FCM y obtención del token ──────────────────
  async function _registerSWAndGetToken() {
    const messaging = window.firebaseMessaging;
    if (!messaging) {
      console.warn('⚠️ [Push] firebaseMessaging no disponible aún. Reintentando en 1s...');
      await new Promise(r => setTimeout(r, 1000));
      if (!window.firebaseMessaging) {
        console.error('❌ [Push] firebaseMessaging no está disponible.');
        return null;
      }
    }

    // Importar getToken dinámicamente (firebase.js ya importó messaging)
    const { getToken } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');

    const swReg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
    console.log('🔧 [Push] SW FCM registrado:', swReg.scope);

    const token = await getToken(window.firebaseMessaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    return token || null;
  }

  // ─── Guardar token en Supabase ───────────────────────────────────────────────
  async function _saveToken(userId, token) {
    const client = window.supabaseClient;
    if (!client) {
      console.error('❌ [Push] supabaseClient no disponible');
      return;
    }

    const { error } = await client
      .from(PUSH_TABLE)
      .upsert(
        { user_id: userId, token, platform: PLATFORM, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,platform' }
      );

    if (error) {
      console.error('❌ [Push] Error guardando token en Supabase:', error);
    } else {
      console.log('✅ [Push] Token FCM guardado en Supabase');
    }
  }

  // ─── API Pública: registerPushToken ─────────────────────────────────────────
  async function registerPushToken(userId) {
    if (!userId) {
      console.warn('⚠️ [Push] registerPushToken: userId requerido');
      return;
    }

    // Verificar soporte
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('⚠️ [Push] Notificaciones o SW no soportados en este browser');
      return;
    }

    const currentPermission = Notification.permission;

    if (currentPermission === 'denied') {
      console.warn('⚠️ [Push] Permiso denegado por el usuario. No se puede registrar.');
      return;
    }

    if (currentPermission === 'granted') {
      // Ya tenemos permiso → registrar directamente
      console.log('✅ [Push] Permiso ya concedido. Registrando token...');
      try {
        const token = await _registerSWAndGetToken();
        if (token) await _saveToken(userId, token);
      } catch (err) {
        console.error('❌ [Push] Error al registrar token (permiso ya concedido):', err);
      }
      return;
    }

    // Estado 'default' → mostrar snackbar personalizado
    // Esperar un momento para no interrumpir el login flow
    setTimeout(() => {
      _showPermissionSnackbar(
        // onAllow
        async () => {
          try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              console.log('✅ [Push] Permiso concedido por el usuario');
              const token = await _registerSWAndGetToken();
              if (token) await _saveToken(userId, token);
            } else {
              console.warn('⚠️ [Push] Permiso denegado tras solicitud');
            }
          } catch (err) {
            console.error('❌ [Push] Error al solicitar permiso:', err);
          }
        },
        // onDeny
        () => {
          console.log('ℹ️ [Push] Usuario eligió "Ahora no"');
        }
      );
    }, 3000); // 3 segundos después del login
  }

  // ─── API Pública: initForegroundPush ────────────────────────────────────────
  // Escucha mensajes FCM cuando la app está ABIERTA y despacha evento UI
  async function initForegroundPush() {
    // Esperar a que firebaseMessaging esté disponible
    let attempts = 0;
    while (!window.firebaseMessaging && attempts < 10) {
      await new Promise(r => setTimeout(r, 500));
      attempts++;
    }

    const messaging = window.firebaseMessaging;
    if (!messaging) {
      console.warn('⚠️ [Push] initForegroundPush: messaging no disponible');
      return;
    }

    const { onMessage } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');

    onMessage(messaging, (payload) => {
      console.log('📬 [Push] Mensaje en foreground:', payload);

      // Despachar evento para que notifications.js o dashboard.js lo muestren
      const event = new CustomEvent('push:foreground', { detail: payload });
      window.dispatchEvent(event);

      // También mostrar como toast si está disponible
      const isEn = window.i18n?.getLang?.() === 'en';
      const title = payload.notification?.title || (isEn ? 'New notification' : 'Nueva notificación');
      const body  = payload.notification?.body  || '';

      if (window.utils?.showToast) {
        window.utils.showToast(`🔔 ${title}${body ? ': ' + body : ''}`, 'info', 4000);
      }
    });

    console.log('👂 [Push] Escuchando mensajes en foreground');
  }

  // ─── Exponer globalmente ─────────────────────────────────────────────────────
  window.registerPushToken  = registerPushToken;
  window.initForegroundPush = initForegroundPush;

  console.log('✅ [Push] push.js cargado');
})();
