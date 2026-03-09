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

    // Limpiar acciones previas
    const actionsEl = snackbar.querySelector('.snackbar-actions');
    if (actionsEl) actionsEl.innerHTML = '';

    // Forzar reinicio de clase active para animar de nuevo si ya estaba visible
    snackbar.classList.remove('active');
    void snackbar.offsetWidth; // Trigger reflow
    snackbar.classList.add('active');

    // Botón de cerrar (dismiss) por defecto si la duración es larga o indefinida
    if (duration === 0 || duration > 5000) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-icon-m3';
        closeBtn.style.color = 'inherit';
        closeBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px;">close</span>';
        closeBtn.onclick = () => snackbar.classList.remove('active');
        actionsEl.appendChild(closeBtn);
    }

    if (duration > 0) {
        // Limpiar cualquier timer anterior si existiera
        if (snackbar._timeout) clearTimeout(snackbar._timeout);
        snackbar._timeout = setTimeout(() => {
            snackbar.classList.remove('active');
        }, duration);
    }
};

/**
 * Muestra un Snackbar con un botón de acción
 */
window.showActionSnackbar = (message, actionText, onAction) => {
    // Eliminar cualquier snackbar anterior del DOM para evitar residuos
    const old = document.getElementById('global-snackbar');
    if (old) {
        if (old._timeout) clearTimeout(old._timeout);
        old.remove();
    }

    // Crear snackbar fresco en el DOM
    const snackbar = document.createElement('div');
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

    const messageEl = snackbar.querySelector('.message');
    if (messageEl) messageEl.textContent = message;

    const actionsEl = snackbar.querySelector('.snackbar-actions');

    // Función de cierre definitivo: quita clase Y elimina del DOM
    const closeSnackbar = () => {
        if (snackbar._timeout) clearTimeout(snackbar._timeout);
        snackbar.classList.remove('active');
        // Esperar la transición CSS antes de eliminar del DOM
        setTimeout(() => {
            if (snackbar.parentNode) snackbar.remove();
        }, 400);
    };

    // Botón de acción principal (ELIMINAR, ACEPTAR, etc.)
    const btn = document.createElement('button');
    btn.className = 'snackbar-btn';
    btn.textContent = actionText;
    btn.onclick = (e) => {
        if (e) e.preventDefault();
        closeSnackbar();
        if (onAction) onAction();
    };
    actionsEl.appendChild(btn);

    // Botón X de cierre
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon-m3';
    closeBtn.style.color = 'inherit';
    closeBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px;">close</span>';
    closeBtn.onclick = () => closeSnackbar();
    actionsEl.appendChild(closeBtn);

    // Forzar reflow y mostrar
    void snackbar.offsetWidth;
    snackbar.classList.add('active');

    // Auto-cierre de seguridad tras 15 segundos
    snackbar._timeout = setTimeout(() => closeSnackbar(), 15000);
};

/**
 * Formatea una cantidad decimal a una fracción legible (ej: 0.5 -> 1/2)
 * Soporta números mixtos (ej: 1.5 -> 1 1/2)
 */
window.utils = window.utils || {};

window.utils.formatQuantity = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;

    // Si es entero, devolver tal cual
    if (Number.isInteger(num)) return num.toString();

    const epsilon = 0.01;
    const commonFractions = [
        { dec: 0.25, frac: '1/4' },
        { dec: 0.5, frac: '1/2' },
        { dec: 0.75, frac: '3/4' },
        { dec: 0.33, frac: '1/3' },
        { dec: 0.66, frac: '2/3' },
        { dec: 0.2, frac: '1/5' },
        { dec: 0.125, frac: '1/8' },
        { dec: 0.0625, frac: '1/16' }
    ];

    const integerPart = Math.floor(num);
    const decimalPart = num - integerPart;

    // Buscar coincidencia cercana en fracciones comunes
    const match = commonFractions.find(f => Math.abs(f.dec - decimalPart) < epsilon);

    if (match) {
        return integerPart > 0 ? `${integerPart} ${match.frac}` : match.frac;
    }

    // Si no es fracción común, redondear a 2 decimales y mostrar
    return parseFloat(num.toFixed(2)).toString();
};

/**
 * Convierte cualquier formato de número (fracción, mixto, decimal) a un float puro.
 */
window.utils.parseToDecimal = (str) => {
    if (!str) return null;
    let cleanStr = str.toString().replace(',', '.').trim();

    // Caso fracción mixta: "1 1/2"
    if (cleanStr.includes(' ') && cleanStr.includes('/')) {
        const parts = cleanStr.split(/\s+/);
        const integerPart = parseFloat(parts[0]);
        const fractionParts = parts[1].split('/');
        if (fractionParts.length === 2) {
            return integerPart + (parseFloat(fractionParts[0]) / parseFloat(fractionParts[1]));
        }
    }

    // Caso fracción simple: "1/2"
    if (cleanStr.includes('/')) {
        const parts = cleanStr.split('/');
        if (parts.length === 2) {
            return parseFloat(parts[0]) / parseFloat(parts[1]);
        }
    }

    const val = parseFloat(cleanStr);
    return isNaN(val) ? null : val;
};

/**
 * Escala todos los números encontrados en una cadena de texto.
 * Ideal para cuando la cantidad está mezclada en el nombre del ingrediente.
 */
window.utils.scaleText = (text, scale) => {
    if (!text || scale === 1) return text;

    // Regex mejorado: 
    // 1. Fracciones mixtas: "1 1/2"
    // 2. Fracciones simples: "1/2"
    // 3. Decimales: "1.5" o "1,5"
    // 4. Números enteros (incluso si están pegados a letras como "125g")
    const regex = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+[\.,]\d+|\d+)/g;

    return text.replace(regex, (match, p1, offset, fullString) => {
        // Evitar escalar números que parecen ser parte de una versión o identificador
        // Si el número está precedido por una letra (ej: v46), no lo escalamos.
        const prevChar = offset > 0 ? fullString[offset - 1] : '';
        if (/[a-zA-Z]/.test(prevChar)) {
            return match;
        }

        const val = window.utils.parseToDecimal(match);
        if (val === null) return match;

        const scaled = val * scale;

        // Si el número es grande (> 10), redondear para evitar decimales extraños en gramos/ml
        if (val >= 10) {
            return Math.round(scaled).toString();
        }
        return window.utils.formatQuantity(scaled);
    });
};

console.log('✅ Utilidades inicializadas (v49)');
