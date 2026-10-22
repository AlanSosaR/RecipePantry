/**
 * SettingsViewManager - Recipe Pantry
 * Manages the "Configuración" (Settings) native view:
 * - Offline storage management (Download full recipes, free local space)
 * - Cache maintenance (Clear Service Worker cache & hard reload)
 * - Language selection (Español / English)
 * 
 * Replaces the old PWA Help view since PWA install is already handled in "Descargar App".
 */
class SettingsViewManager {
    constructor() {
        this.init();
    }

    init() {
        this.container = document.getElementById('helpView');
    }

    render() {
        if (!this.container) {
            this.container = document.getElementById('helpView');
        }
        if (!this.container || !window.i18n) return;

        const t = (key, fallback) => {
            const val = window.i18n.t(key);
            return (val && val !== key) ? val : (fallback || key);
        };

        const currentLang = window.i18n.getLang ? window.i18n.getLang() : 'es';
        const isEn = currentLang === 'en';

        this.container.innerHTML = `
            <div class="allergens-module" style="padding-top: 4px;">

                <!-- 1. Tarjeta Independiente de Super Administrador: Gestión de Usuarios -->
                <div id="superadmin-users-card" class="settings-panel-m3" style="display: none; margin-bottom: 24px;">
                    <div id="superadmin-users-section"></div>
                </div>

                <!-- 2. Tarjeta: Preferencias de Idioma, Uso Offline y Almacenamiento -->
                <div class="settings-panel-m3" style="margin-bottom: 24px;">
                    <!-- Selector de Idioma en píldora unificada M3 al inicio del segmento -->
                    <div style="width: 100%;">
                        <div style="
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            width: 100%;
                            box-sizing: border-box;
                            background: #F8FAFC;
                            border: 1.5px solid #E2E8F0;
                            border-radius: 100px;
                            padding: 6px 8px 6px 18px;
                            gap: 12px;
                        ">
                            <span style="
                                font-family: var(--font-display, 'Poppins', sans-serif);
                                font-size: 13.5px;
                                font-weight: 700;
                                color: #475569;
                                letter-spacing: -0.01em;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #10B981;">language</span>
                                ${t('prefLangTitle', isEn ? 'Language' : 'Idioma')}
                            </span>
                            
                            <div style="display: flex; gap: 4px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 100px; padding: 3px;">
                                <button type="button" onclick="window.helpModal.setLanguage('es')"
                                    style="border: none; padding: 7px 16px; border-radius: 100px; font-family: var(--font-display, 'Poppins', sans-serif); font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); ${!isEn ? 'background: #10B981; color: white; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);' : 'background: transparent; color: #64748B;'}">
                                    Español
                                </button>
                                <button type="button" onclick="window.helpModal.setLanguage('en')"
                                    style="border: none; padding: 7px 16px; border-radius: 100px; font-family: var(--font-display, 'Poppins', sans-serif); font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); ${isEn ? 'background: #10B981; color: white; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);' : 'background: transparent; color: #64748B;'}">
                                    English
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Divisor visual elegante M3 -->
                    <div style="border-top: 1px solid #E2E8F0; margin: 16px 0;"></div>

                    <!-- SECCIÓN: Compartir Aplicación (Píldora Unificada M3 en una sola línea) -->
                    <div style="width: 100%;">
                        <div style="
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            flex-wrap: nowrap;
                            width: 100%;
                            box-sizing: border-box;
                            background: #F8FAFC;
                            border: 1.5px solid #E2E8F0;
                            border-radius: 100px;
                            padding: 6px 6px 6px 16px;
                            gap: 8px;
                        ">
                            <span style="
                                font-family: var(--font-display, 'Poppins', sans-serif);
                                font-size: 13.5px;
                                font-weight: 700;
                                color: #475569;
                                letter-spacing: -0.01em;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                                white-space: nowrap;
                                flex-shrink: 0;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #25D366;">share</span>
                                ${isEn ? 'Share' : 'Compartir'}
                            </span>
                            
                            <div style="display: flex; gap: 3px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 100px; padding: 3px; flex-shrink: 0;">
                                <button type="button" id="btn-settings-share-whatsapp" onclick="window.helpModal.handleShareWhatsApp()"
                                    style="border: none; padding: 6px 12px; border-radius: 100px; font-family: var(--font-display, 'Poppins', sans-serif); font-size: 12px; font-weight: 700; cursor: pointer; background: #25D366; color: white; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(37, 211, 102, 0.25); transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); white-space: nowrap;"
                                    onmouseover="this.style.background='#1EBE5D'"
                                    onmouseout="this.style.background='#25D366'">
                                    <svg style="width: 15px; height: 15px; fill: currentColor; flex-shrink: 0;" viewBox="0 0 24 24">
                                        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.04 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.34C9.36 7.34 9.09 7.4 8.87 7.65C8.65 7.89 8.02 8.49 8.02 9.71C8.02 10.93 8.91 12.11 9.03 12.27C9.16 12.44 10.74 14.86 13.17 15.91C13.75 16.16 14.2 16.31 14.55 16.42C15.13 16.61 15.67 16.58 16.09 16.52C16.56 16.45 17.53 15.93 17.73 15.36C17.93 14.79 17.93 14.31 17.87 14.2C17.81 14.1 17.65 14.04 17.41 13.92C17.16 13.8 15.97 13.21 15.75 13.13C15.53 13.05 15.37 13.01 15.21 13.25C15.05 13.5 14.58 14.04 14.44 14.2C14.3 14.37 14.16 14.39 13.92 14.27C13.67 14.15 12.87 13.88 11.92 13.04C11.19 12.38 10.69 11.57 10.55 11.33C10.41 11.08 10.54 10.95 10.66 10.83C10.77 10.72 10.91 10.54 11.03 10.4C11.16 10.25 11.2 10.15 11.28 9.99C11.36 9.82 11.2 10.15 11.28 9.99C11.36 9.82 11.32 9.68 11.26 9.56C11.2 9.44 10.74 8.3 10.55 7.84C10.36 7.39 10.17 7.45 10.03 7.44C9.9 7.44 9.74 7.34 9.53 7.34Z"/>
                                    </svg>
                                    <span>WhatsApp</span>
                                </button>
                                <button type="button" id="btn-settings-copy-link" onclick="window.helpModal.handleCopyShareLink()"
                                    style="border: none; padding: 6px 12px; border-radius: 100px; font-family: var(--font-display, 'Poppins', sans-serif); font-size: 12px; font-weight: 700; cursor: pointer; background: transparent; color: #475569; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); white-space: nowrap;"
                                    onmouseover="this.style.background='#F1F5F9'; this.style.color='#0F172A';"
                                    onmouseout="this.style.background='transparent'; this.style.color='#475569';">
                                    <span class="material-symbols-outlined" style="font-size: 16px; color: #10B981;">link</span>
                                    <span>${isEn ? 'Copy' : 'Copiar'}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Divisor visual elegante M3 -->
                    <div style="border-top: 1px solid #E2E8F0; margin: 18px 0;"></div>

                    <!-- SECCIÓN: Notificaciones Push -->
                    <div>
                        <div class="safe-filter-header" style="margin-bottom: 14px;">
                            <div class="safe-filter-title" style="display: flex; align-items: center; gap: 14px;">
                                <div class="safe-title-icon" style="background: rgba(16, 185, 129, 0.12); color: #10B981; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <span class="material-symbols-outlined" style="font-size: 24px;">notifications_active</span>
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 16.5px; font-weight: 700; color: #0F172A;">
                                        ${isEn ? 'Push Notifications' : 'Notificaciones Push'}
                                    </h3>
                                    <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748B;">
                                        ${isEn ? 'Task reminders, prep alerts and recipe updates' : 'Alertas de tareas, recordatorios y recetas'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Estado reactivo y acción de Notificaciones Push -->
                        <div id="settings-push-status-container"></div>
                    </div>

                    <!-- Divisor visual elegante M3 -->
                    <div style="border-top: 1px solid #E2E8F0; margin: 18px 0;"></div>

                    <div>
                        <div class="safe-filter-header" style="margin-bottom: 14px;">
                            <div class="safe-filter-title" style="display: flex; align-items: center; gap: 14px;">
                                <div class="safe-title-icon" style="background: rgba(16, 185, 129, 0.12); color: #10B981; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <span class="material-symbols-outlined" style="font-size: 24px;">cloud_download</span>
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 16.5px; font-weight: 700; color: #0F172A;">
                                        ${t('offlineStorageTitle', isEn ? 'Offline Usage & Storage' : 'Uso Offline y Almacenamiento')}
                                    </h3>
                                    <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748B;">
                                        ${isEn ? 'For use without internet' : 'Para usar sin internet'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Estado de almacenamiento -->
                        <div id="settings-offline-status" style="display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: #1F2937; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px 16px; margin-bottom: 14px;">
                            <span class="material-symbols-outlined" style="font-size: 18px; color: #10B981;">info</span>
                            <span>${isEn ? 'Verifying local storage...' : 'Verificando datos locales...'}</span>
                        </div>

                        <!-- Botones de acción offline -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                            <button type="button" id="btn-settings-download-offline" onclick="window.helpModal.handleDownloadOffline()" 
                                style="padding: 12px 18px; background: #10B981; color: white; border: none; border-radius: 14px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s;"
                                onmouseover="this.style.background='#059669'"
                                onmouseout="this.style.background='#10B981'">
                                <span class="material-symbols-outlined" style="font-size: 19px;">download</span>
                                <span>${t('offlineDownloadFullBtn', isEn ? 'Download all recipes for offline' : 'Descargar recetas para offline')}</span>
                            </button>

                            <button type="button" id="btn-settings-clear-offline" onclick="window.helpModal.handleClearOffline()" 
                                style="padding: 12px 18px; background: transparent; color: #EF4444; border: 1.5px solid rgba(239, 68, 68, 0.35); border-radius: 14px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s;"
                                onmouseover="this.style.background='rgba(239, 68, 68, 0.06)'"
                                onmouseout="this.style.background='transparent'">
                                <span class="material-symbols-outlined" style="font-size: 18px;">delete_outline</span>
                                <span>${t('offlineClearBtn', isEn ? 'Free up local space' : 'Liberar espacio local')}</span>
                            </button>
                        </div>

                        <!-- Opción de Recargar y vaciar caché en píldora unificada M3 en una sola línea -->
                        <div style="border-top: 1px solid #E2E8F0; margin: 18px 0 16px 0;"></div>
                        <div style="width: 100%;">
                            <div style="
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                width: 100%;
                                box-sizing: border-box;
                                background: #F8FAFC;
                                border: 1.5px solid #E2E8F0;
                                border-radius: 100px;
                                padding: 6px 8px 6px 18px;
                                gap: 10px;
                            ">
                                <span style="
                                    font-family: var(--font-display, 'Poppins', sans-serif);
                                    font-size: 13.5px;
                                    font-weight: 700;
                                    color: #475569;
                                    letter-spacing: -0.01em;
                                    display: flex;
                                    align-items: center;
                                    gap: 6px;
                                    white-space: nowrap;
                                ">
                                    <span class="material-symbols-outlined" style="font-size: 18px; color: #10B981;">cached</span>
                                    ${isEn ? 'Reload cache' : 'Recargar y vaciar'}
                                </span>
                                
                                <button type="button" id="btn-settings-reload-cache" onclick="window.helpModal.handleClearCache()"
                                    style="border: 1px solid #E2E8F0; padding: 7px 16px; border-radius: 100px; font-family: var(--font-display, 'Poppins', sans-serif); font-size: 12.5px; font-weight: 700; cursor: pointer; background: #FFFFFF; color: #334155; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); white-space: nowrap;"
                                    onmouseover="this.style.background='#F1F5F9';"
                                    onmouseout="this.style.background='#FFFFFF';">
                                    <span class="material-symbols-outlined" style="font-size: 16px; color: #10B981;">refresh</span>
                                    <span>${isEn ? 'Reload' : 'Borrar caché'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="height: 60px; width: 100%;"></div>
            </div>
        `;

        // Renderizar sección de Super Administrador si aplica
        const adminSection = document.getElementById('superadmin-users-section');
        const adminCard = document.getElementById('superadmin-users-card');
        if (adminSection && window.adminUsersManager) {
            window.adminUsersManager.render(adminSection);
            if (adminCard) {
                adminCard.style.display = window.adminUsersManager.isSuperAdmin() ? 'flex' : 'none';
            }
        }

        // Cargar estado offline y estado de notificaciones asíncronamente
        this.loadOfflineStatus();
        this.updatePushNotificationUI();
    }

    async loadOfflineStatus() {
        const statusEl = document.getElementById('settings-offline-status');
        if (!statusEl) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';

        try {
            if (window.localDB) {
                await window.localDB.init();
                const fullRecipes = await window.localDB.getAll('recipes_full');
                const completeCount = (fullRecipes || []).filter(r => Array.isArray(r.ingredients)).length;
                const indexRecipes = await window.localDB.getAll('recipes_index');
                const totalIndex = (indexRecipes || []).length;

                const text = isEn 
                    ? `Available offline: <strong style="color: #10B981; margin: 0 4px;">${completeCount}</strong> of ${totalIndex || completeCount} full recipes.`
                    : `Disponibles offline: <strong style="color: #10B981; margin: 0 4px;">${completeCount}</strong> de ${totalIndex || completeCount} recetas completas.`;

                statusEl.innerHTML = `
                    <span class="material-symbols-outlined" style="font-size: 18px; color: #10B981;">check_circle</span>
                    <span>${text}</span>
                `;
            } else {
                statusEl.innerHTML = `
                    <span class="material-symbols-outlined" style="font-size: 18px; color: #10B981;">check_circle</span>
                    <span>${isEn ? 'Local storage ready.' : 'Almacenamiento local listo.'}</span>
                `;
            }
        } catch (e) {
            console.error('Error checking offline status:', e);
            statusEl.innerHTML = `
                <span class="material-symbols-outlined" style="font-size: 18px; color: #6b7280;">info</span>
                <span>${isEn ? 'Local storage available.' : 'Almacenamiento local disponible.'}</span>
            `;
        }
    }

    async handleDownloadOffline() {
        const btn = document.getElementById('btn-settings-download-offline');
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        if (!window.syncManager) {
            const msg = isEn ? 'Sync manager not available' : 'Sincronizador no disponible';
            if (window.utils?.showToast) window.utils.showToast(msg, 'error');
            return;
        }

        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.innerHTML = `
                <span class="material-symbols-outlined" style="font-size: 18px; animation: spin 1s linear infinite;">sync</span>
                <span>${isEn ? 'Downloading...' : 'Descargando...'}</span>
            `;
        }

        try {
            await window.syncManager.preloadOfflineRecipes({ silent: false });
            await this.loadOfflineStatus();
        } catch (err) {
            console.error('Error preloading offline recipes:', err);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.innerHTML = originalHTML;
            }
        }
    }

    handleClearOffline() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const confirmMsg = isEn 
            ? 'Free up offline storage on this device?' 
            : '¿Liberar el espacio de recetas descargadas en este dispositivo?';
        const actionBtn = isEn ? 'Free space' : 'Liberar';
        const cancelBtn = isEn ? 'Cancel' : 'Cancelar';

        const triggerAction = window.showActionToast || window.utils?.showActionToast;

        if (triggerAction) {
            triggerAction({
                message: confirmMsg,
                actionText: actionBtn,
                cancelText: cancelBtn,
                actionColor: '#EF4444',
                type: 'error',
                onConfirm: async () => {
                    await this._executeClearOffline();
                }
            });
        } else {
            if (confirm(confirmMsg)) {
                this._executeClearOffline();
            }
        }
    }

    async _executeClearOffline() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        try {
            if (window.localDB) {
                await window.localDB.clear('recipes_full');
                localStorage.removeItem('recipepantry_initial_sync_completed');
                localStorage.removeItem('recipepantry_offline_prompt_dismissed');
                
                const msg = isEn ? 'Local storage freed successfully' : 'Espacio local liberado con éxito';
                const showToast = window.utils?.showToast || window.showToast;
                if (showToast) showToast(msg, 'success');
                
                await this.loadOfflineStatus();
            }
        } catch (err) {
            console.error('Error clearing local storage:', err);
            const errorMsg = isEn ? 'Error clearing local storage' : 'Error al liberar espacio local';
            const showToast = window.utils?.showToast || window.showToast;
            if (showToast) showToast(errorMsg, 'error');
        }
    }

    async handleClearCache() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const confirmMsg = isEn
            ? 'Perform a complete cache reset? All temporary files, offline databases, and local folders cache will be purged, keeping your login session active so everything reloads fresh from the server.'
            : '¿Hacer un reset total de caché y datos locales? Se borrarán todos los archivos en caché, bases de datos locales y carpetas temporales, manteniendo tu sesión abierta para recargar todo limpio desde el servidor.';
        const actionBtn = isEn ? 'Reset & Reload' : 'Resetear y recargar';
        const cancelBtn = isEn ? 'Cancel' : 'Cancelar';

        const doClean = async () => {
            const showToast = window.utils?.showToast || window.showToast;
            if (showToast) {
                showToast(isEn ? '⏳ Performing full reset...' : '⏳ Realizando reset completo de caché...', 'info', 3000);
            }

            try {
                // 1. Borrar todas las cachés del Service Worker (Caches API)
                if ('caches' in window) {
                    try {
                        const cacheNames = await caches.keys();
                        await Promise.all(cacheNames.map(name => caches.delete(name)));
                        console.log('✅ [Reset] Caches API borrado:', cacheNames);
                    } catch (e) {
                        console.warn('⚠️ [Reset] Error borrando caches:', e);
                    }
                }

                // 2. Desregistrar Service Workers activos
                if ('serviceWorker' in navigator) {
                    try {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        await Promise.all(registrations.map(r => r.unregister()));
                        console.log('✅ [Reset] Service Workers desregistrados:', registrations.length);
                    } catch (e) {
                        console.warn('⚠️ [Reset] Error desregistrando SW:', e);
                    }
                }

                // 3. Limpiar y eliminar todas las bases de datos de IndexedDB
                if (window.localDB) {
                    try { await window.localDB.clear('recipes_index'); } catch(e){}
                    try { await window.localDB.clear('recipes_full'); } catch(e){}
                    try { await window.localDB.clear('recipes'); } catch(e){}
                    try { if (window.localDB.db) window.localDB.db.close(); } catch(e){}
                }

                if (window.indexedDB) {
                    try {
                        if (indexedDB.databases) {
                            const dbs = await indexedDB.databases();
                            for (const db of dbs) {
                                if (db && db.name) {
                                    try { indexedDB.deleteDatabase(db.name); } catch(e){}
                                }
                            }
                        }
                    } catch (e) {}

                    // Bases de datos conocidas de RecipePantry
                    ['RecipePantryDB', 'recipe_pantry_offline', 'RecipePantry_MenuDocs'].forEach(name => {
                        try { indexedDB.deleteDatabase(name); } catch(e){}
                    });
                    console.log('✅ [Reset] Bases de datos IndexedDB eliminadas');
                }

                // 4. Limpiar sessionStorage
                try {
                    sessionStorage.clear();
                } catch (e) {}

                // 5. Limpiar localStorage preservando ÚNICAMENTE la sesión de Supabase y el perfil/idioma
                try {
                    const preserved = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k) {
                            if (
                                k.includes('sb-') ||
                                k.includes('auth-token') ||
                                k.includes('supabase.auth') ||
                                k.startsWith('rp_folders_') ||
                                k === 'recipe_pantry_user_profile' ||
                                k === 'lang' ||
                                k === 'preferredLang'
                            ) {
                                preserved[k] = localStorage.getItem(k);
                            }
                        }
                    }
                    localStorage.clear();
                    Object.keys(preserved).forEach(k => {
                        localStorage.setItem(k, preserved[k]);
                    });
                    console.log('✅ [Reset] localStorage purgado (sesión y perfil preservados)');
                } catch (e) {
                    console.warn('⚠️ [Reset] Error en localStorage:', e);
                }

                if (showToast) {
                    showToast(isEn ? '✅ Reset complete! Reloading...' : '✅ Reset completado. Recargando...', 'success', 2000);
                }

                // 6. Recargar forzando descarga fresca del servidor con bypass de query
                setTimeout(() => {
                    const cleanUrl = window.location.origin + window.location.pathname + '?reset=' + Date.now();
                    window.location.href = cleanUrl;
                }, 700);

            } catch (err) {
                console.error('❌ Error durante el reset:', err);
                const errMsg = isEn ? 'Error performing reset' : 'Error al resetear caché';
                if (showToast) showToast(errMsg, 'error');
            }
        };

        const triggerAction = window.showActionToast || window.utils?.showActionToast;
        if (triggerAction) {
            triggerAction({
                message: confirmMsg,
                actionText: actionBtn,
                cancelText: cancelBtn,
                actionColor: '#10B981',
                type: 'info',
                onConfirm: doClean
            });
        } else {
            if (confirm(confirmMsg)) await doClean();
        }
    }

    handleShareWhatsApp() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const shareUrl = 'https://recipe-pantry.vercel.app/';
        const text = isEn 
            ? `Hey! I invite you to try Recipe Pantry, an amazing app to organize and digitize recipes: ${shareUrl}`
            : `¡Hola! Te invito a probar Recipe Pantry, una app genial para guardar, organizar y digitalizar recetas de cocina. Entra aquí: ${shareUrl}`;
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(whatsappUrl, '_blank');
    }

    async handleCopyShareLink() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const shareUrl = 'https://recipe-pantry.vercel.app/';
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(shareUrl);
            } else {
                const tempInput = document.createElement('input');
                tempInput.value = shareUrl;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
            }
            const msg = isEn ? 'Link copied to clipboard!' : '¡Enlace copiado al portapapeles!';
            if (window.utils?.showToast) window.utils.showToast(msg, 'success');
            else if (window.showToast) window.showToast(msg, 'success');
            else alert(msg);
        } catch (e) {
            console.error('Error copying share link:', e);
        }
    }

    async handleRequestPushNotification() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        if (!('Notification' in window)) {
            const msg = isEn ? 'Notifications are not supported in this browser' : 'Tu navegador no soporta notificaciones';
            if (window.utils?.showToast) window.utils.showToast(msg, 'warning');
            return;
        }

        try {
            const perm = await Notification.requestPermission();
            this.updatePushNotificationUI();

            if (perm === 'granted') {
                if (window.registerPushToken && window.auth?.user?.id) {
                    try {
                        await window.registerPushToken(window.auth.user.id);
                    } catch (pushErr) {
                        console.warn('[Push] Error registrando token FCM:', pushErr);
                    }
                }

                // Disparar notificación local de bienvenida
                try {
                    const title = '🔔 Recipe Pantry';
                    const body = isEn 
                        ? 'Notifications active! You will now receive reminders and alerts.' 
                        : '¡Notificaciones activadas! Ahora recibirás avisos y recordatorios.';
                    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                        const reg = await navigator.serviceWorker.ready;
                        reg.showNotification(title, {
                            body,
                            icon: '/assets/icons/icon.svg',
                            badge: '/assets/icons/icon.svg',
                            tag: 'rp-welcome-notif'
                        });
                    } else {
                        new Notification(title, { body, icon: '/assets/icons/icon.svg' });
                    }
                } catch (e) {}

                const successMsg = isEn ? 'Notifications enabled successfully!' : '¡Notificaciones activadas con éxito!';
                if (window.utils?.showToast) window.utils.showToast(successMsg, 'success');
                else if (window.showToast) window.showToast(successMsg, 'success');
            } else if (perm === 'denied') {
                const deniedMsg = isEn 
                    ? 'Permission blocked. Please allow notifications in site settings.' 
                    : 'Permiso denegado. Puedes activarlo en los ajustes del navegador.';
                if (window.utils?.showToast) window.utils.showToast(deniedMsg, 'warning');
                else if (window.showToast) window.showToast(deniedMsg, 'warning');
            }
        } catch (err) {
            console.error('[Push] Error pidiendo permiso:', err);
        }
    }

    async handleTestPushNotification() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return this.handleRequestPushNotification();
        }

        try {
            const title = '🔔 Recipe Pantry';
            const body = isEn 
                ? 'Test successful! Notifications are functioning properly.' 
                : '¡Prueba exitosa! Las notificaciones están funcionando correctamente.';

            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                const reg = await navigator.serviceWorker.ready;
                await reg.showNotification(title, {
                    body,
                    icon: '/assets/icons/icon.svg',
                    badge: '/assets/icons/icon.svg',
                    tag: 'rp-test-notif'
                });
            } else {
                new Notification(title, { body, icon: '/assets/icons/icon.svg' });
            }

            const msg = isEn ? 'Test notification sent!' : '¡Notificación de prueba enviada!';
            if (window.utils?.showToast) window.utils.showToast(msg, 'success');
            else if (window.showToast) window.showToast(msg, 'success');
        } catch (e) {
            console.error('Error enviando notificación de prueba:', e);
        }
    }

    
    playNotificationChime() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const now = ctx.currentTime;
            
            // Tone 1: 587.33 Hz (D5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.12, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.22);

            // Tone 2: 880 Hz (A5)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.12);
            gain2.gain.setValueAtTime(0.15, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.12);
            osc2.stop(now + 0.45);
        } catch (e) {}
    }

    handleTestInAppNotification() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        this.playNotificationChime();
        if (navigator.vibrate) {
            try { navigator.vibrate([70, 40, 70]); } catch (e) {}
        }
        const msg = isEn 
            ? '🔔 Recipe Pantry: Prep reminder! You have active kitchen tasks for today.' 
            : '🔔 Recipe Pantry: ¡Aviso de prep! Tienes tareas de cocina activas para hoy.';
        
        if (window.utils?.showToast) {
            window.utils.showToast(msg, 'success', 4500);
        } else if (window.showToast) {
            window.showToast(msg, 'success');
        } else {
            alert(msg);
        }
    }

    async handleRecheckPushPermission() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        
        if (!('Notification' in window)) {
            const msg = isEn ? 'Notifications not supported in this browser' : 'Tu navegador no soporta notificaciones';
            if (window.utils?.showToast) window.utils.showToast(msg, 'warning');
            return;
        }

        // Invocar la solicitud nativa para que el navegador lance el cuadro de diálogo de Permitir/Aceptar
        await this.handleRequestPushNotification();

        // Actualizar la interfaz de inmediato
        this.updatePushNotificationUI();

        if (Notification.permission === 'denied') {
            const msg = isEn
                ? 'ℹ️ Permission blocked by browser. Tap the lock/tune icon 🔒 in the address bar to Allow.'
                : 'ℹ️ Tu navegador mantiene bloqueada la ventana. Toca el candado o ajustes 🔒 en la barra de direcciones y cambia Notificaciones a "Permitir".';
            if (window.utils?.showToast) window.utils.showToast(msg, 'info', 5000);
            else if (window.showToast) window.showToast(msg, 'info');
        }
    }

    updatePushNotificationUI() {
        const container = document.getElementById('settings-push-status-container');
        if (!container) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';

        if (!('Notification' in window)) {
            container.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: #64748B; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px 16px;">
                    <span class="material-symbols-outlined" style="font-size: 18px; color: #94A3B8;">notifications_off</span>
                    <span>${isEn ? 'Notifications not supported in this browser' : 'Las notificaciones no son compatibles con este navegador'}</span>
                </div>
            `;
            return;
        }

        const permission = Notification.permission;

        if (permission === 'granted') {
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; font-size: 13px; font-weight: 600; color: #065F46; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 14px; padding: 12px 16px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="font-size: 20px; color: #10B981;">check_circle</span>
                        <div>
                            <div style="font-weight: 700; color: #047857;">${isEn ? 'Notifications Active' : 'Notificaciones activadas'}</div>
                            <div style="font-size: 12px; font-weight: 500; color: #065F46; margin-top: 2px;">${isEn ? 'Receiving task alerts and reminders' : 'Recibiendo alertas de tareas y avisos'}</div>
                        </div>
                    </div>
                    <button type="button" onclick="window.helpModal.handleTestPushNotification()"
                        style="border: 1px solid #10B981; background: #FFFFFF; color: #059669; padding: 6px 14px; border-radius: 100px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(16, 185, 129, 0.15); transition: all 0.2s;"
                        onmouseover="this.style.background='#F0FDF4'"
                        onmouseout="this.style.background='#FFFFFF'">
                        <span class="material-symbols-outlined" style="font-size: 16px;">send</span>
                        <span>${isEn ? 'Test Notification' : 'Probar Notificación'}</span>
                    </button>
                </div>
            `;
        } else if (permission === 'denied') {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: #991B1B; background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 16px; padding: 14px 16px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #991B1B;">
                            <span class="material-symbols-outlined" style="font-size: 22px; color: #EF4444;">notifications_off</span>
                            <span style="font-size: 14px;">${isEn ? 'Permission Blocked in Browser' : 'Permiso bloqueado en el navegador'}</span>
                        </div>
                        <button type="button" onclick="window.helpModal.handleRecheckPushPermission()"
                            style="border: 1px solid #FCA5A5; background: #FFFFFF; color: #B91C1C; padding: 5px 14px; border-radius: 100px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s;"
                            onmouseover="this.style.background='#FEE2E2'"
                            onmouseout="this.style.background='#FFFFFF'">
                            <span class="material-symbols-outlined" style="font-size: 15px;">refresh</span>
                            <span>${isEn ? 'Recheck' : 'Recomprobar'}</span>
                        </button>
                    </div>
                    <p style="margin: 0; font-size: 12px; font-weight: 400; color: #7F1D1D; line-height: 1.45;">
                        ${isEn ? 'To receive notifications, tap the lock/settings icon in your browser URL bar and change Notifications to "Allow".' : 'Para recibir avisos, toca el candado o icono de ajustes en la barra de tu navegador y cambia Notificaciones a "Permitir".'}
                    </p>
                </div>
            `;
        } else {
            // default
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; font-size: 13px; font-weight: 600; color: #92400E; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 14px; padding: 12px 16px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="font-size: 20px; color: #F59E0B;">notification_important</span>
                        <div>
                            <div style="font-weight: 700; color: #B45309;">${isEn ? 'Notifications Not Enabled' : 'Notificaciones no activadas'}</div>
                            <div style="font-size: 12px; font-weight: 500; color: #92400E; margin-top: 2px;">${isEn ? 'Enable permissions to receive alerts' : 'Actívalas para recibir alertas y recordatorios'}</div>
                        </div>
                    </div>
                    <button type="button" onclick="window.helpModal.handleRequestPushNotification()"
                        style="border: none; background: #10B981; color: white; padding: 8px 18px; border-radius: 100px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.28); transition: all 0.2s;"
                        onmouseover="this.style.background='#059669'"
                        onmouseout="this.style.background='#10B981'">
                        <span class="material-symbols-outlined" style="font-size: 16px;">notifications_active</span>
                        <span>${isEn ? 'Enable Notifications' : 'Activar Notificaciones'}</span>
                    </button>
                </div>
            `;
        }
    }

    setLanguage(lang) {
        if (!window.i18n) return;
        localStorage.setItem('lang', lang);
        localStorage.setItem('preferredLang', lang.toUpperCase());
        if (window.i18n.applyLanguage) {
            window.i18n.applyLanguage(lang);
        }
        // Actualizar título en la barra superior si existe
        const titleEl = document.getElementById('view-title');
        if (titleEl) {
            titleEl.textContent = window.i18n.t('navHelp', 'Configuración');
        }
        this.render();
    }
}

// Aliases for compatibility
const settingsInstance = new SettingsViewManager();
window.helpModal = settingsInstance;
window.settingsManager = settingsInstance;
