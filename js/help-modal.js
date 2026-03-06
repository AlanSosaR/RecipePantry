/**
 * HelpViewManager - Recipe Pantry
 * Rebuilds the PWA installation guide as a native view using premium Stitch templates.
 */
class HelpViewManager {
    constructor() {
        this.currentPlatform = 'android'; // 'android' or 'iphone'
        this.init();
    }

    init() {
        this.container = document.getElementById('helpView');
    }

    setPlatform(platform) {
        this.currentPlatform = platform;
        this.render();
    }

    render() {
        if (!this.container || !window.i18n) return;

        const t = window.i18n.t.bind(window.i18n);
        const isAndroid = this.currentPlatform === 'android';

        this.container.innerHTML = `
            <div class="stitch-help-container view-mode">
                <div class="stitch-content-wrapper">
                    <h2 class="stitch-main-headline">${t('helpMainHeadline')}</h2>
                    <p class="stitch-sub-headline">${t('helpSubHeadline')}</p>

                    <!-- Platform Selector (Pills) -->
                    <div class="stitch-tab-selector">
                        <button class="stitch-tab-btn ${isAndroid ? 'active' : ''}" onclick="window.helpModal.setPlatform('android')">Android</button>
                        <button class="stitch-tab-btn ${!isAndroid ? 'active' : ''}" onclick="window.helpModal.setPlatform('iphone')">iPhone</button>
                    </div>

                    <div class="stitch-platform-content">
                        ${isAndroid ? this.renderAndroidSteps(t) : this.renderIphoneSteps(t)}
                    </div>
                </div>

                <!-- Footer Action (Optional in view mode) -->
                <div class="stitch-footer-premium view-mode">
                    <button class="stitch-btn-primary-m3" onclick="window.dashboard.switchView('recipes', document.querySelector('[data-view=recipes]'))">
                        <span class="material-symbols-outlined">arrow_back</span>
                        <span>Volver a recetas</span>
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

// Initialize and expose (Keeping helpModal name for compatibility with switchView)
window.helpModal = new HelpViewManager();
