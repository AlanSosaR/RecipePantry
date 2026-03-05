// js/utils.js
// Funciones helper y de UI

// ─── Estilos globales del Toast (inyectados una vez) ──────────────────
(function injectToastCSS() {
    if (document.getElementById('__toast-global-styles')) return;
    const style = document.createElement('style');
    style.id = '__toast-global-styles';
    style.textContent = `
        .toast-container {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            pointer-events: none;
        }
        .toast {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #ffffff;
            color: #10B981;
            border-radius: 14px;
            padding: 12px 20px;
            font-size: 14px;
            font-weight: 600;
            font-family: inherit;
            box-shadow: 0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
            min-width: 220px;
            max-width: 360px;
            border: 1.5px solid rgba(16, 185, 129, 0.18);
            pointer-events: auto;
            animation: toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }
        .toast .material-symbols-outlined {
            font-size: 20px;
            flex-shrink: 0;
            color: #10B981;
        }
        .toast-error .material-symbols-outlined {
            color: #EF4444;
        }
        .toast-error {
            color: #EF4444;
            border-color: rgba(239, 68, 68, 0.2);
        }
        .toast-info .material-symbols-outlined {
            color: #6B7280;
        }
        .toast-info {
            color: #374151;
        }
        .toast-message {
            flex: 1;
            line-height: 1.4;
        }
        .slide-out {
            animation: toastOut 0.3s ease forwards !important;
        }
        @keyframes toastIn {
            from { opacity: 0; transform: translateY(16px) scale(0.95); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes toastOut {
            from { opacity: 1; transform: translateY(0)   scale(1);    }
            to   { opacity: 0; transform: translateY(8px)  scale(0.95); }
        }
    `;
    document.head.appendChild(style);
})();

/**
 * Muestra una notificación toast
 */
window.showToast = (message, type = 'info') => {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined">
            ${type === 'error' ? 'error' : type === 'success' ? 'check_circle' : 'info'}
        </span>
        <span class="toast-message">${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('slide-out');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
};


/**
 * Maneja el estado de carga de un botón
 */
window.setButtonLoading = (btn, isLoading, text) => {
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `<div class="spinner-sm"></div> ${text || 'Cargando...'}`;
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || text;
    }
};

/**
 * Formatea una fecha
 */
window.formatDate = (dateString) => {
    const lang = (window.i18n && window.i18n.getLang()) || 'es';
    const locale = lang === 'en' ? 'en-US' : 'es-ES';
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(locale, options);
};

// Exportar como objeto utils para retrocompatibilidad
window.utils = {
    showToast: window.showToast,
    setButtonLoading: window.setButtonLoading,
    formatDate: window.formatDate
};

/**
 * Muestra el Snackbar M3 Premium
 */
window.showSnackbar = (message, duration = 4000) => {
    let snackbar = document.getElementById('global-snackbar');
    if (!snackbar) {
        snackbar = document.createElement('div');
        snackbar.id = 'global-snackbar';
        snackbar.className = 'snackbar-m3';
        snackbar.innerHTML = `
            <div class="snackbar-content">
                <span class="material-symbols-outlined icon">info</span>
                <span class="message"></span>
            </div>
            <div class="snackbar-actions"></div>
        `;
        document.body.appendChild(snackbar);
    }

    const messageEl = snackbar.querySelector('.message');
    if (messageEl) messageEl.textContent = message;

    // Remove any previous action button
    const actionsEl = snackbar.querySelector('.snackbar-actions');
    if (actionsEl) actionsEl.innerHTML = '';

    snackbar.classList.add('active');

    if (duration > 0) {
        setTimeout(() => {
            snackbar.classList.remove('active');
        }, duration);
    }
};

/**
 * Muestra un Snackbar con un botón de acción
 */
window.showActionSnackbar = (message, actionText, onAction) => {
    window.showSnackbar(message, 0); // duration 0 means it stays until action or manual close
    const snackbar = document.getElementById('global-snackbar');
    const actionsEl = snackbar.querySelector('.snackbar-actions');

    const btn = document.createElement('button');
    btn.className = 'snackbar-btn';
    btn.textContent = actionText;
    btn.onclick = () => {
        snackbar.classList.remove('active');
        if (onAction) onAction();
    };

    actionsEl.appendChild(btn);

    // Auto-close after a bit if no action taken? No, better keep it for confirmation.
    // But let's add a close timer anyway just in case.
    setTimeout(() => {
        snackbar.classList.remove('active');
    }, 10000);
};

console.log('✅ Utilidades inicializadas');
