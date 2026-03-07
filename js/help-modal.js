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
                    <h2 class="stitch-main-headline">${isAndroid ? t('instAndroidTitle') : t('instIosTitle')}</h2>
                    <p class="stitch-sub-headline">${isAndroid ? t('instAndroidSubtitle') : t('instIosSubtitle')}</p>

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
            <div class="stitch-iphone-steps">
                <div class="stitch-stepper-vertical">
                    <div class="stitch-step">
                        <div class="stitch-step-circle">
                            <span class="material-symbols-outlined">browser_updated</span>
                        </div>
                        <div class="stitch-step-content">
                            <h4>${t('instAndroidStep1Title')}</h4>
                            <p>${t('instAndroidStep1Desc')}</p>
                        </div>
                    </div>
                    <div class="stitch-step">
                        <div class="stitch-step-circle">
                            <span class="material-symbols-outlined">more_vert</span>
                        </div>
                        <div class="stitch-step-content">
                            <h4>${t('instAndroidStep2Title')}</h4>
                            <p>${t('instAndroidStep2Desc')}</p>
                        </div>
                    </div>
                    <div class="stitch-step">
                        <div class="stitch-step-circle">
                            <span class="material-symbols-outlined">install_mobile</span>
                        </div>
                        <div class="stitch-step-content">
                            <h4>${t('instAndroidStep3Title')}</h4>
                            <p>${t('instAndroidStep3Desc')}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderIphoneSteps(t) {
        return `
            <div class="stitch-iphone-steps">
                <div class="stitch-stepper-vertical">
                    <div class="stitch-step">
                        <div class="stitch-step-circle">
                            <span class="material-symbols-outlined">explore</span>
                        </div>
                        <div class="stitch-step-content">
                            <h4>${t('instIosStep1Title')}</h4>
                            <p>${t('instIosStep1Desc')}</p>
                        </div>
                    </div>
                    <div class="stitch-step">
                        <div class="stitch-step-circle">
                            <span class="material-symbols-outlined">ios_share</span>
                        </div>
                        <div class="stitch-step-content">
                            <h4>${t('instIosStep2Title')}</h4>
                            <p>${t('instIosStep2Desc')}</p>
                        </div>
                    </div>
                    <div class="stitch-step">
                        <div class="stitch-step-circle">
                            <span class="material-symbols-outlined">add_box</span>
                        </div>
                        <div class="stitch-step-content">
                            <h4>${t('instIosStep3Title')}</h4>
                            <p>${t('instIosStep3Desc')}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Initialize and expose (Keeping helpModal name for compatibility with switchView)
window.helpModal = new HelpViewManager();
