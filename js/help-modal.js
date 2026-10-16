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

                <!-- 2. Tarjeta Independiente: Uso Offline y Almacenamiento -->
                <div class="settings-panel-m3" style="margin-bottom: 24px;">
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

                        <!-- Restauración de opción: Borrar caché y recargar -->
                        <div style="border-top: 1px solid #E2E8F0; margin: 18px 0 16px 0;"></div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 180px;">
                                <div style="font-size: 13.5px; font-weight: 700; color: #1E293B;">
                                    ${isEn ? 'Reload & reset cache' : 'Recargar y vaciar caché'}
                                </div>
                                <div style="font-size: 12px; color: #64748B; margin-top: 2px;">
                                    ${isEn ? 'Clears temporary cache and forces fresh reload from server' : 'Elimina archivos temporales y fuerza la recarga limpia desde el servidor'}
                                </div>
                            </div>
                            <button type="button" id="btn-settings-reload-cache" onclick="window.helpModal.handleClearCache()" 
                                style="padding: 10px 16px; background: #F8FAFC; color: #334155; border: 1.5px solid #CBD5E1; border-radius: 14px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.03);"
                                onmouseover="this.style.background='#F1F5F9'; this.style.borderColor='#94A3B8';"
                                onmouseout="this.style.background='#F8FAFC'; this.style.borderColor='#CBD5E1';">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #059669;">refresh</span>
                                <span>${isEn ? 'Clear Cache & Reload' : 'Borrar caché y recargar'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Selector de Idioma en píldora unificada M3 que abarca todo el ancho en móvil -->
                <div style="margin-top: 4px; margin-bottom: 24px; width: 100%;">
                    <div style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        width: 100%;
                        box-sizing: border-box;
                        background: #FFFFFF;
                        border: 1.5px solid #E2E8F0;
                        border-radius: 100px;
                        padding: 6px 8px 6px 18px;
                        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
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
                        
                        <div style="display: flex; gap: 4px; background: #F8FAFC; border-radius: 100px; padding: 3px;">
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

        // Cargar estado offline asíncronamente
        this.loadOfflineStatus();
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
