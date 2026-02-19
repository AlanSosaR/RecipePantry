// js/utils.js
// Funciones helper y de UI

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
    toast.className = `toast toast-${type} slide-in`;
    toast.innerHTML = `
        <span class="material-symbols-outlined">
            ${type === 'error' ? 'error' : type === 'success' ? 'check_circle' : 'info'}
        </span>
        <span class="toast-message">${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('slide-out');
        setTimeout(() => toast.remove(), 500);
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
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('es-ES', options);
};

// Exportar como objeto utils para retrocompatibilidad
window.utils = {
    showToast: window.showToast,
    setButtonLoading: window.setButtonLoading,
    formatDate: window.formatDate
};

console.log('✅ Utilidades inicializadas');
