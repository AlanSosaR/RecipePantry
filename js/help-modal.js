/**
 * HelpModalManager - Recipe Pantry
 * Handles the installation guide modal logic.
 */
class HelpModalManager {
    constructor() {
        this.init();
    }

    init() {
        this.modal = document.getElementById('help-modal');
        this.body = document.getElementById('help-modal-body');

        if (!this.modal) return;

        // Close when clicking outside the container
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
    }

    open() {
        if (!this.modal) return;
        this.render();
        this.modal.classList.remove('hidden');
    }

    close() {
        if (this.modal) {
            this.modal.classList.add('hidden');
        }
    }

    render() {
        if (!this.body || !window.i18n) return;

        const t = window.i18n.t.bind(window.i18n);

        this.body.innerHTML = `
            <div class="help-section">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; color: var(--primary);">
                    <span class="material-symbols-outlined" style="font-size: 32px;">android</span>
                    <h4 style="margin: 0; font-size: 18px;">${t('instAndroidTitle')}</h4>
                </div>
                <ul style="list-style: none; padding: 0; margin: 0 0 24px 0; color: var(--on-surface-variant);">
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <span style="background: var(--primary-container); color: var(--on-primary-container); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; font-weight: bold;">1</span>
                        <span>${t('instAndroidStep1')}</span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <span style="background: var(--primary-container); color: var(--on-primary-container); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; font-weight: bold;">2</span>
                        <span>${t('instAndroidStep2')}</span>
                    </li>
                    <li style="margin-bottom: 0; display: flex; align-items: flex-start; gap: 10px;">
                        <span style="background: var(--primary-container); color: var(--on-primary-container); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; font-weight: bold;">3</span>
                        <span>${t('instAndroidStep3')}</span>
                    </li>
                </ul>

                <div style="height: 1px; background: var(--outline-variant); margin-bottom: 24px;"></div>

                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; color: #007AFF;">
                    <span class="material-symbols-outlined" style="font-size: 32px;">apple</span>
                    <h4 style="margin: 0; font-size: 18px;">${t('instIosTitle')}</h4>
                </div>
                <ul style="list-style: none; padding: 0; margin: 0; color: var(--on-surface-variant);">
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <span style="background: #E3F2FD; color: #007AFF; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; font-weight: bold;">1</span>
                        <span>${t('instIosStep1')}</span>
                    </li>
                    <li style="margin-bottom: 12px; display: flex; align-items: flex-start; gap: 10px;">
                        <span style="background: #E3F2FD; color: #007AFF; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; font-weight: bold;">2</span>
                        <span>${t('instIosStep2')}</span>
                    </li>
                    <li style="margin-bottom: 0; display: flex; align-items: flex-start; gap: 10px;">
                        <span style="background: #E3F2FD; color: #007AFF; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; font-weight: bold;">3</span>
                        <span>${t('instIosStep3')}</span>
                    </li>
                </ul>
            </div>
        `;
    }
}

// Initialize and expose
window.helpModal = new HelpModalManager();
