/**
 * HelpModalManager - Recipe Pantry
 * Rebuilds the PWA installation guide using premium Stitch templates.
 */
class HelpModalManager {
    constructor() {
        this.currentPlatform = 'android'; // 'android' or 'iphone'
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

    setPlatform(platform) {
        this.currentPlatform = platform;
        this.render();
    }

    render() {
        if (!this.body || !window.i18n) return;

        const t = window.i18n.t.bind(window.i18n);
        const isAndroid = this.currentPlatform === 'android';

        this.body.innerHTML = `
            <div class="stitch-help-container">
                <!-- Header with Back Arrow and Title -->
                <div class="stitch-modal-header-premium">
                    <button class="stitch-back-btn" onclick="window.helpModal.close()">
                        <span class="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h3 class="stitch-title-premium">${t('helpModalTitle')}</h3>
                </div>

                <div class="stitch-content-wrapper">
                    <h2 class="stitch-main-headline">Install our App</h2>
                    <p class="stitch-sub-headline">Add this app to your home screen for a fast, native experience and offline access.</p>

                    <!-- Platform Selector (Pills) -->
                    <div class="stitch-tab-selector">
                        <button class="stitch-tab-btn ${isAndroid ? 'active' : ''}" onclick="window.helpModal.setPlatform('android')">Android</button>
                        <button class="stitch-tab-btn ${!isAndroid ? 'active' : ''}" onclick="window.helpModal.setPlatform('iphone')">iPhone</button>
                    </div>

                    <div class="stitch-platform-content">
                        ${isAndroid ? this.renderAndroidSteps(t) : this.renderIphoneSteps(t)}
                    </div>
                </div>

                <!-- Footer Action -->
                <div class="stitch-footer-premium">
                    <button class="stitch-btn-primary-m3" onclick="window.helpModal.close()">
                        <span class="material-symbols-outlined">check_circle</span>
                        <span>Entendido</span>
                    </button>
                </div>
            </div>
        `;
    }

    renderAndroidSteps(t) {
        return `
            <div class="stitch-android-steps">
                <div class="stitch-card-premium">
                    <div class="stitch-card-icon android"><span class="material-symbols-outlined">browser_updated</span></div>
                    <div class="stitch-card-text">
                        <h4>Open Chrome</h4>
                        <p>${t('instAndroidStep1')}</p>
                    </div>
                </div>
                <div class="stitch-card-premium">
                    <div class="stitch-card-icon android"><span class="material-symbols-outlined">more_vert</span></div>
                    <div class="stitch-card-text">
                        <h4>Tap Menu</h4>
                        <p>${t('instAndroidStep2')}</p>
                    </div>
                </div>
                <div class="stitch-card-premium">
                    <div class="stitch-card-icon android"><span class="material-symbols-outlined">install_mobile</span></div>
                    <div class="stitch-card-text">
                        <h4>Install App</h4>
                        <p>${t('instAndroidStep3')}</p>
                    </div>
                </div>
            </div>
        `;
    }

    renderIphoneSteps(t) {
        return `
            <div class="stitch-iphone-steps">
                <h4 class="stitch-steps-label">Follow these steps</h4>
                <div class="stitch-stepper-vertical">
                    <div class="stitch-step">
                        <div class="stitch-step-circle">
                            <span class="material-symbols-outlined">explore</span>
                        </div>
                        <div class="stitch-step-content">
                            <span class="step-num">STEP 01</span>
                            <p>${t('instIosStep1')}</p>
                        </div>
                    </div>
                    <div class="stitch-step">
                        <div class="stitch-step-circle">
                            <span class="material-symbols-outlined">ios_share</span>
                        </div>
                        <div class="stitch-step-content">
                            <span class="step-num">STEP 02</span>
                            <p>${t('instIosStep2')}</p>
                        </div>
                    </div>
                    <div class="stitch-step">
                        <div class="stitch-step-circle">
                            <span class="material-symbols-outlined">add_box</span>
                        </div>
                        <div class="stitch-step-content">
                            <span class="step-num">STEP 03</span>
                            <p>${t('instIosStep3')}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Initialize and expose
window.helpModal = new HelpModalManager();
