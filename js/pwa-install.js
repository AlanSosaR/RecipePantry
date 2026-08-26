/**
 * Recipe Pantry - PWA Install Manager (Material 3 Expressive In-App Dialog)
 * Muestra la opción "Descargar App" en el menú lateral y abre un modal propio
 * con el diseño de la aplicación antes de proceder con la instalación.
 */

(function () {
    class PWAInstallManager {
        constructor() {
            this.deferredPrompt = null;
            this.isInstalled = this.checkIfInstalled();
            this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            this.init();
        }

        checkIfInstalled() {
            // 1. Standalone display mode (abierta como PWA instalada en Android/PC/Mac)
            if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
                return true;
            }
            // 2. iOS standalone mode
            if (window.navigator.standalone === true) {
                return true;
            }
            // 3. Document referrer de Android / TWA
            if (document.referrer && document.referrer.startsWith('android-app://')) {
                return true;
            }
            // 4. Marca guardada en localStorage
            if (localStorage.getItem('pantry_app_installed') === 'true') {
                return true;
            }
            return false;
        }

        init() {
            if (this.isInstalled) {
                console.log('📱 [PWA] La app ya está instalada. No se muestra la opción en el menú.');
                this.removeInstallUI();
                return;
            }

            // Intentar renderizar en el menú inmediatamente o tras cargar el DOM
            this.tryAttachSidebarOption();
            document.addEventListener('DOMContentLoaded', () => this.tryAttachSidebarOption());
            window.addEventListener('load', () => this.tryAttachSidebarOption());

            // Capturar evento estándar de instalación del navegador
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                this.deferredPrompt = e;
                console.log('📱 [PWA] beforeinstallprompt listo.');
                this.tryAttachSidebarOption();
            });

            // Evento cuando se completa la instalación
            window.addEventListener('appinstalled', () => {
                console.log('🎉 [PWA] ¡Aplicación instalada exitosamente!');
                this.isInstalled = true;
                localStorage.setItem('pantry_app_installed', 'true');
                this.removeInstallUI();
                this.closeModal();
                
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const successMsg = isEn ? 'Recipe Pantry installed successfully!' : '¡Aplicación instalada con éxito!';
                if (window.utils && window.utils.showToast) {
                    window.utils.showToast(successMsg, 'success');
                } else if (window.showToast) {
                    window.showToast(successMsg, 'success');
                }
            });
        }

        tryAttachSidebarOption() {
            if (this.isInstalled) {
                this.removeInstallUI();
                return;
            }

            const sidebarNav = document.querySelector('.sidebar-nav') || document.querySelector('.notas-sidebar-nav');
            if (!sidebarNav || document.getElementById('sidebar-pwa-install-btn')) return;

            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const labelText = isEn ? 'Install App' : 'Descargar App';

            const installItem = document.createElement('a');
            installItem.id = 'sidebar-pwa-install-btn';
            installItem.href = '#';
            installItem.className = 'nav-item';
            installItem.style.cssText = 'color: var(--md-primary, #10B981); font-weight: 600; cursor: pointer;';
            installItem.innerHTML = `
                <span class="material-symbols-outlined" style="color: var(--md-primary, #10B981);">install_mobile</span>
                <span data-i18n="navInstallApp">${labelText}</span>
            `;

            installItem.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.closeSidebar) window.closeSidebar();
                this.showCustomInstallModal();
            });

            // Insertar justo antes del botón de Cerrar Sesión (o al final)
            const logoutBtn = sidebarNav.querySelector('.nav-logout-m3') || sidebarNav.querySelector('.notas-nav-item--logout');
            if (logoutBtn) {
                sidebarNav.insertBefore(installItem, logoutBtn);
            } else {
                sidebarNav.appendChild(installItem);
            }
        }

        showCustomInstallModal() {
            if (this.isInstalled) {
                this.removeInstallUI();
                return;
            }

            if (document.getElementById('pwa-custom-modal')) {
                document.getElementById('pwa-custom-modal').remove();
            }

            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const title = isEn ? 'Install Recipe Pantry' : 'Instalar Recipe Pantry';
            const subtitle = isEn 
                ? 'Get the full app experience on your device with quick access from your home screen.' 
                : 'Obtén la experiencia completa en tu dispositivo con acceso instantáneo desde tu pantalla de inicio.';
            const feat1 = isEn ? 'Works offline and saves data' : 'Acceso instantáneo sin abrir el navegador';
            const feat2 = isEn ? 'Faster loading and full screen' : 'Experiencia fluida a pantalla completa';
            const feat3 = isEn ? 'Always syncs your recipes' : 'Tus recetas siempre sincronizadas';
            const btnInstallText = isEn ? 'Install Now' : 'Instalar Ahora';
            const btnCancelText = isEn ? 'Cancel' : 'Cancelar';

            const modal = document.createElement('div');
            modal.id = 'pwa-custom-modal';
            modal.className = 'pwa-modal-overlay';
            modal.innerHTML = `
                <div class="pwa-modal-card">
                    <div class="pwa-modal-header">
                        <div class="pwa-modal-icon-badge">
                            <img src="assets/icons/icon.svg" width="40" height="40" alt="Recipe Pantry" />
                        </div>
                        <button type="button" class="pwa-modal-close" onclick="window.pwaInstallManager.closeModal()">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <h2 class="pwa-modal-title">${title}</h2>
                    <p class="pwa-modal-desc">${subtitle}</p>

                    <div class="pwa-modal-features">
                        <div class="pwa-feature-item">
                            <span class="material-symbols-outlined pwa-check-icon">check_circle</span>
                            <span>${feat1}</span>
                        </div>
                        <div class="pwa-feature-item">
                            <span class="material-symbols-outlined pwa-check-icon">check_circle</span>
                            <span>${feat2}</span>
                        </div>
                        <div class="pwa-feature-item">
                            <span class="material-symbols-outlined pwa-check-icon">check_circle</span>
                            <span>${feat3}</span>
                        </div>
                    </div>

                    <div class="pwa-modal-actions">
                        <button type="button" class="pwa-modal-btn-cancel" onclick="window.pwaInstallManager.closeModal()">
                            ${btnCancelText}
                        </button>
                        <button type="button" class="pwa-modal-btn-confirm" id="btn-confirm-pwa-install">
                            <span class="material-symbols-outlined" style="font-size: 20px;">download</span>
                            <span>${btnInstallText}</span>
                        </button>
                    </div>
                </div>
            `;

            this.injectStyles();
            document.body.appendChild(modal);

            document.getElementById('btn-confirm-pwa-install')?.addEventListener('click', () => {
                this.executeInstall();
            });

            // Cerrar al hacer clic en el fondo
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal();
            });
        }

        closeModal() {
            const modal = document.getElementById('pwa-custom-modal');
            if (modal) {
                modal.classList.add('fade-out');
                setTimeout(() => modal.remove(), 250);
            }
        }

        async executeInstall() {
            if (this.deferredPrompt) {
                // Diálogo nativo confirmado
                this.deferredPrompt.prompt();
                const { outcome } = await this.deferredPrompt.userChoice;
                console.log(`📱 [PWA] Elección de instalación: ${outcome}`);

                if (outcome === 'accepted') {
                    this.isInstalled = true;
                    localStorage.setItem('pantry_app_installed', 'true');
                    this.removeInstallUI();
                    this.closeModal();
                    
                    const isEn = window.i18n && window.i18n.getLang() === 'en';
                    const successMsg = isEn ? 'Recipe Pantry installed successfully!' : '¡Aplicación instalada con éxito!';
                    if (window.utils && window.utils.showToast) {
                        window.utils.showToast(successMsg, 'success');
                    } else if (window.showToast) {
                        window.showToast(successMsg, 'success');
                    }
                }
                this.deferredPrompt = null;
            } else if (this.isIOS) {
                this.closeModal();
                this.showIOSModal();
            } else {
                this.closeModal();
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const msg = isEn
                    ? 'Click the install icon in your browser address bar to finish.'
                    : 'Haz clic en el icono de instalar en la barra de tu navegador para finalizar.';
                if (window.utils && window.utils.showToast) {
                    window.utils.showToast(msg, 'info');
                } else if (window.showToast) {
                    window.showToast(msg, 'info');
                }
            }
        }

        showIOSModal() {
            if (document.getElementById('ios-install-modal')) return;

            const modal = document.createElement('div');
            modal.id = 'ios-install-modal';
            modal.style.cssText = `
                position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);
                display: flex; align-items: flex-end; justify-content: center;
                z-index: 9999999; padding: 16px; backdrop-filter: blur(6px);
            `;
            modal.innerHTML = `
                <div style="background: #FFFFFF; border-radius: 24px; padding: 24px; max-width: 420px; width: 100%; box-shadow: 0 16px 36px rgba(0,0,0,0.25);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #111;">Instalar en iPhone / iPad</h3>
                        <button onclick="document.getElementById('ios-install-modal').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #888;">✕</button>
                    </div>
                    <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 18px 0;">
                        1. Pulsa el botón <strong>Compartir</strong> <span class="material-symbols-outlined" style="vertical-align: middle; font-size: 18px;">ios_share</span> en la barra inferior de Safari.<br>
                        2. Elige <strong>"Agregar a inicio"</strong> ➕.<br>
                        3. Pulsa <strong>"Agregar"</strong> en la esquina superior derecha.
                    </p>
                    <button onclick="document.getElementById('ios-install-modal').remove()" style="width: 100%; height: 48px; background: #10B981; color: white; border: none; border-radius: 14px; font-weight: 700; font-size: 15px; cursor: pointer;">
                        Entendido
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        }

        removeInstallUI() {
            document.getElementById('sidebar-pwa-install-btn')?.remove();
            document.getElementById('pwa-custom-modal')?.remove();
            document.getElementById('ios-install-modal')?.remove();
        }

        injectStyles() {
            if (document.getElementById('pwa-modal-styles')) return;

            const style = document.createElement('style');
            style.id = 'pwa-modal-styles';
            style.textContent = `
                .pwa-modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 999999;
                    padding: 20px;
                    animation: pwaFadeIn 0.25s ease-out;
                    box-sizing: border-box;
                }

                .pwa-modal-overlay.fade-out {
                    opacity: 0;
                    transition: opacity 0.2s ease;
                }

                @keyframes pwaFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .pwa-modal-card {
                    background: #FFFFFF;
                    width: 100%;
                    max-width: 440px;
                    border-radius: 28px;
                    padding: 28px 24px;
                    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
                    animation: pwaScaleUp 0.3s cubic-bezier(0.2, 0, 0, 1);
                    box-sizing: border-box;
                }

                @keyframes pwaScaleUp {
                    from { opacity: 0; transform: scale(0.92) translateY(12px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }

                .pwa-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 20px;
                }

                .pwa-modal-icon-badge {
                    width: 60px;
                    height: 60px;
                    border-radius: 18px;
                    background: #F0FDF4;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.15);
                }

                .pwa-modal-close {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: none;
                    background: #F3F4F6;
                    color: #6B7280;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .pwa-modal-close:hover {
                    background: #E5E7EB;
                    color: #111827;
                }

                .pwa-modal-title {
                    font-family: var(--font-brand, 'Poppins', sans-serif);
                    font-size: 20px;
                    font-weight: 700;
                    color: #1B1B1F;
                    margin: 0 0 8px 0;
                }

                .pwa-modal-desc {
                    font-size: 14px;
                    color: #6B7280;
                    line-height: 1.5;
                    margin: 0 0 20px 0;
                }

                .pwa-modal-features {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    background: #F9FAFB;
                    border-radius: 16px;
                    padding: 16px;
                    margin-bottom: 24px;
                }

                .pwa-feature-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #374151;
                }

                .pwa-check-icon {
                    color: #10B981;
                    font-size: 18px;
                    flex-shrink: 0;
                }

                .pwa-modal-actions {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .pwa-modal-btn-cancel {
                    flex: 1;
                    height: 48px;
                    border-radius: 14px;
                    border: 1.5px solid #E5E7EB;
                    background: transparent;
                    color: #4B5563;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .pwa-modal-btn-cancel:hover {
                    background: #F3F4F6;
                    border-color: #D1D5DB;
                }

                .pwa-modal-btn-confirm {
                    flex: 1.6;
                    height: 48px;
                    border-radius: 14px;
                    border: none;
                    background: #10B981;
                    color: #FFFFFF;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
                    transition: all 0.2s;
                }

                .pwa-modal-btn-confirm:hover {
                    filter: brightness(1.06);
                    transform: translateY(-1px);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
                }

                .pwa-modal-btn-confirm:active {
                    transform: scale(0.98);
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Instancia global
    window.pwaInstallManager = new PWAInstallManager();
})();
