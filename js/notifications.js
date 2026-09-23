/**
 * NotificationManager - Recipe Pantry
 * Maneja las notificaciones de archivos compartidos
 * Con flujo interactivo: Aceptar (agregar a mis recetas) / Dejar en compartidas
 */
class NotificationManager {
    constructor() {
        this.notifications = [];
        this.lastCount = 0;
        this.isReady = false;
        this.pendingNotifications = []; // v217: Cola para notificaciones que llegan antes del init
    }

    async init() {
        console.log('🔔 [Notifications] Iniciando manager...');
        this.menu = document.getElementById('notifications-menu');
        this.badge = document.getElementById('notifications-badge');
        this.list = document.getElementById('notifications-list');

        await this.fetchNotifications();
        this.setupRealtime();
        
        this.isReady = true;
        // Procesar pendientes si las hay
        if (this.pendingNotifications.length > 0) {
            console.log(`🔔 [Notifications] Procesando ${this.pendingNotifications.length} notificaciones pendientes...`);
            this.pendingNotifications.forEach(fn => fn());
            this.pendingNotifications = [];
        }

        // Cerrar menú al hacer clic fuera
        document.addEventListener('mousedown', (e) => {
            if (this.menu && !this.menu.classList.contains('hidden')) {
                const btn = document.getElementById('btn-notifications');
                if (btn && !this.menu.contains(e.target) && !btn.contains(e.target)) {
                    this.menu.classList.add('hidden');
                }
            }
        });

        // Comprobar si acabamos de actualizar para mostrar confirmación de éxito
        if (sessionStorage.getItem('recipe_pantry_just_updated')) {
            sessionStorage.removeItem('recipe_pantry_just_updated');
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            setTimeout(() => {
                if (window.utils && window.utils.showToast) {
                    window.utils.showToast(
                        isEn ? '✨ Recipe Pantry updated to the latest version!' : '✨ ¡Recipe Pantry se ha actualizado a la última versión!',
                        'success',
                        4500
                    );
                }
            }, 700);
        }

        // ── Firebase Push Notifications ──────────────────────────────────────
        // Registrar token FCM si el usuario está autenticado
        const currentUser = window.authManager?.currentUser;
        if (currentUser?.id) {
            if (typeof window.registerPushToken === 'function') {
                window.registerPushToken(currentUser.id);
            } else {
                // push.js puede no haber cargado aún si está después en el DOM
                window.addEventListener('push:ready', () => {
                    window.registerPushToken(currentUser.id);
                }, { once: true });
            }
        }

        // Escuchar mensajes push en foreground para refrescar el badge
        window.addEventListener('push:foreground', (e) => {
            console.log('📬 [Notifications] Push foreground recibido:', e.detail);
            // Refrescar notificaciones desde Supabase
            setTimeout(() => this.fetchNotifications(), 800);
        });

        // Inicializar handler de foreground
        if (typeof window.initForegroundPush === 'function') {
            window.initForegroundPush();
        }
        // ─────────────────────────────────────────────────────────────────────
    }

    async fetchNotifications() {
        try {
            const user = window.authManager?.currentUser;
            if (!user) {
                console.warn('⚠️ [Notifications] No hay usuario para buscar notificaciones');
                return;
            }

            console.log(`🔔 [Notifications] Buscando notificaciones para user_id: ${user.id}`);

            const { data, error } = await window.supabaseClient
                .from('notifications')
                .select(`
                    id, 
                    created_at, 
                    leido, 
                    type,
                    from_user_id, 
                    recipe_id,
                    from_user:users!from_user_id(first_name, last_name, email, prefix),
                    recipe:recipes(id, name_es, name_en)
                `)
                .eq('user_id', user.id)
                .is('leido', false)
                .order('created_at', { ascending: false });

            if (error) throw error;
            console.log(`🔔 [Notifications] Fetch successful for ${user.id}. Rows: ${data?.length || 0}`);
            if (data && data.length > 0) {
                console.log('🔔 [Notifications] Detalle de datos crudos:', data);
            }

            const serverNotifications = data.map(n => {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const recipeName = isEn ? (n.recipe?.name_en || n.recipe?.name_es) : n.recipe?.name_es;
                const senderName = [n.from_user?.first_name, n.from_user?.last_name].filter(Boolean).join(' ')
                    || n.from_user?.email
                    || (isEn ? 'Someone' : 'Alguien');
                const senderPrefix = n.from_user?.prefix || (isEn ? 'Chef' : 'Chef');

                return {
                    id: n.id,
                    recipeId: n.recipe_id,
                    recipeName: recipeName || (isEn ? 'Shared Recipe' : 'Receta compartida'),
                    type: n.type || 'recipe_shared',
                    timestamp: n.created_at,
                    sender: senderName,
                    prefix: senderPrefix,
                    leido: n.leido
                };
            });

            // Preservar notificaciones locales (update, sync)
            const localNotifications = this.notifications.filter(n => ['app_update', 'offline_sync'].includes(n.type));
            this.notifications = [...localNotifications, ...serverNotifications];
            
            // Eliminar duplicados por ID
            const seen = new Set();
            this.notifications = this.notifications.filter(n => {
                if (!n.id) return true;
                const duplicate = seen.has(n.id);
                seen.add(n.id);
                return !duplicate;
            });

            this.updateBadge();
            if (this.menu && !this.menu.classList.contains('hidden')) {
                this.renderMenu();
            }
        } catch (err) {
            console.error('❌ [Notifications] Error en fetchNotifications:', err);
        }
    }

    setupRealtime() {
        const user = window.authManager?.currentUser;
        if (!user) return;
        const userId = user.id;

        console.log(`📡 [Notifications] Configurando Realtime (INSERT) para user_id: ${userId}`);

        const channel = window.supabaseClient
            .channel(`notifications:${userId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                console.log('📬 [Notifications] Nuevo registro detectado vía Realtime!', payload);
                
                // Optimistic UI Update: Mostrar en la campana de inmediato
                if (payload.new && payload.new.id) {
                    const isEn = window.i18n && window.i18n.getLang() === 'en';
                    this.notifications.unshift({
                        id: payload.new.id,
                        recipeId: payload.new.recipe_id,
                        recipeName: isEn ? 'Loading recipe...' : 'Cargando receta...',
                        type: payload.new.type || 'recipe_shared',
                        timestamp: payload.new.created_at || new Date().toISOString(),
                        sender: '...',
                        prefix: '',
                        leido: false
                    });
                    this.updateBadge(); // Esto hará que tiemble y suba el contador inmediatamente
                    if (this.menu && !this.menu.classList.contains('hidden')) {
                        this.renderMenu();
                    }
                }

                // Delay para asegurar que los joins (from_user, recipes) estén listos
                setTimeout(() => this.fetchNotifications(), 800);
                
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                if (window.utils && window.utils.showToast) {
                    window.utils.showToast(isEn ? '🔔 You have received a new recipe!' : '🔔 ¡Has recibido una nueva receta!', 'info');
                }
            });

        channel.subscribe((status) => {
            console.log(`📡 [Notifications] Realtime Channel Status: ${status}`);
        });
    }

    updateBadge() {
        if (!this.badge) return;
        const unreadCount = this.notifications.filter(n => !n.leido).length;
        console.log(`🔔 [Notifications] Actualizando badge: ${unreadCount} pendientes`);
        const btn = document.getElementById('btn-notifications');

        if (unreadCount > 0) {
            this.badge.classList.remove('hidden');
            this.badge.textContent = unreadCount;
            if (this.lastCount < unreadCount && btn) {
                btn.classList.add('bell-shake');
                setTimeout(() => btn.classList.remove('bell-shake'), 1000);
            }
        } else {
            this.badge.classList.add('hidden');
        }
        this.lastCount = unreadCount;
    }

    addUpdateNotification(worker) {
        if (!this.isReady) {
            console.log('🔔 [Notifications] Manager no listo, encolando actualización...');
            this.pendingNotifications.push(() => this.addUpdateNotification(worker));
            return;
        }

        console.log('🔔 [Notifications] Agregando tarjeta de actualización manual...');
        this.updateWorker = worker;
        // Evitar duplicados en la lista de UI
        if (this.notifications.some(n => n.type === 'app_update')) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';

        // Añadir al principio de la lista
        this.notifications.unshift({
            id: 'update-1',
            type: 'app_update',
            recipeName: isEn ? 'New Version Available' : 'Nueva versión disponible',
            sender: 'Sistema',
            timestamp: new Date().toISOString(),
            leido: false
        });

        this.updateBadge();
        if (this.menu && !this.menu.classList.contains('hidden')) {
            this.renderMenu();
        }

        // Animar la campana de forma llamativa para que el usuario lo note
        const btn = document.getElementById('btn-notifications');
        if (btn) {
            btn.classList.add('bell-update-pulse');
        }
    }

    addSyncNotification() {
        if (!this.isReady) {
            console.log('🔔 [Notifications] Manager no listo, encolando aviso de sync...');
            this.pendingNotifications.push(() => this.addSyncNotification());
            return;
        }

        // Evitar duplicados
        if (this.notifications.some(n => n.type === 'offline_sync')) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';

        // Añadir al principio de la lista
        this.notifications.unshift({
            id: 'sync-prompt-1',
            type: 'offline_sync',
            recipeName: isEn ? 'Recipes Offline' : 'Recetas Offline',
            sender: 'Sistema',
            timestamp: new Date().toISOString(),
            leido: false
        });

        this.updateBadge();
        if (this.menu && !this.menu.classList.contains('hidden')) {
            this.renderMenu();
        }

        // Mostrar el aviso directamente debajo de la campana una sola vez al ingresar
        if (!sessionStorage.getItem('pantry_offline_toast_shown')) {
            sessionStorage.setItem('pantry_offline_toast_shown', 'true');
            const title = isEn ? 'Access recipes offline' : '¡Accede a tus recetas sin conexión!';
            const desc = isEn ? 'Tap the bell to download or manage them.' : 'Toca la campana para descargarlas u omitir.';
            setTimeout(() => this.showBellTooltip(title, desc), 1000);
        }
    }

    showBellTooltip(title, subtitle) {
        if (document.getElementById('bell-tooltip-offline')) return;
        const bellWrapper = document.querySelector('.notifications-wrapper');
        const bellBtn = document.getElementById('btn-notifications');
        if (!bellWrapper || !bellBtn) return;

        // Inyectar estilos una sola vez
        if (!document.getElementById('bell-tooltip-styles')) {
            const style = document.createElement('style');
            style.id = 'bell-tooltip-styles';
            style.textContent = `
                .bell-offline-tooltip {
                    position: absolute;
                    top: calc(100% + 12px);
                    right: -6px;
                    z-index: 99999;
                    background: #FFFFFF;
                    border: 1.5px solid rgba(16, 185, 129, 0.35);
                    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(16, 185, 129, 0.15);
                    border-radius: 18px;
                    padding: 12px 14px;
                    min-width: 250px;
                    max-width: 290px;
                    cursor: pointer;
                    animation: bellTooltipFadeIn 0.3s cubic-bezier(0.2, 0, 0, 1);
                    box-sizing: border-box;
                }
                @keyframes bellTooltipFadeIn {
                    from { opacity: 0; transform: translateY(-8px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .bell-offline-tooltip.slide-out {
                    opacity: 0;
                    transform: translateY(-6px) scale(0.95);
                    transition: all 0.25s ease;
                }
                .bell-tooltip-arrow {
                    position: absolute;
                    top: -7px;
                    right: 18px;
                    width: 12px;
                    height: 12px;
                    background: #FFFFFF;
                    border-top: 1.5px solid rgba(16, 185, 129, 0.35);
                    border-left: 1.5px solid rgba(16, 185, 129, 0.35);
                    transform: rotate(45deg);
                }
                .bell-tooltip-body {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                }
                .bell-tooltip-icon {
                    color: #10B981;
                    font-size: 22px;
                    flex-shrink: 0;
                    margin-top: 1px;
                }
                .bell-tooltip-text {
                    flex: 1;
                    min-width: 0;
                }
                .bell-tooltip-title {
                    font-size: 12.5px;
                    font-weight: 700;
                    color: #111827;
                    display: block;
                    line-height: 1.3;
                }
                .bell-tooltip-desc {
                    font-size: 11px;
                    color: #6B7280;
                    margin-top: 2px;
                    display: block;
                    line-height: 1.35;
                }
                .bell-tooltip-close {
                    background: transparent;
                    border: none;
                    color: #9CA3AF;
                    cursor: pointer;
                    font-size: 14px;
                    padding: 0 0 0 4px;
                    line-height: 1;
                }
                .bell-tooltip-close:hover {
                    color: #111827;
                }
            `;
            document.head.appendChild(style);
        }

        const tooltip = document.createElement('div');
        tooltip.id = 'bell-tooltip-offline';
        tooltip.className = 'bell-offline-tooltip';
        tooltip.innerHTML = `
            <div class="bell-tooltip-arrow"></div>
            <div class="bell-tooltip-body">
                <span class="material-symbols-outlined bell-tooltip-icon">download_for_offline</span>
                <div class="bell-tooltip-text">
                    <span class="bell-tooltip-title">${title}</span>
                    <span class="bell-tooltip-desc">${subtitle}</span>
                </div>
                <button type="button" class="bell-tooltip-close" title="Cerrar">✕</button>
            </div>
        `;

        // Al tocar la burbuja, abre el menú de notificaciones
        tooltip.addEventListener('click', (e) => {
            if (e.target.classList.contains('bell-tooltip-close')) {
                tooltip.classList.add('slide-out');
                setTimeout(() => tooltip.remove(), 250);
                return;
            }
            tooltip.remove();
            this.toggleMenu(e);
        });

        bellWrapper.appendChild(tooltip);

        // Auto ocultar después de 6 segundos
        setTimeout(() => {
            if (document.getElementById('bell-tooltip-offline')) {
                tooltip.classList.add('slide-out');
                setTimeout(() => tooltip.remove(), 250);
            }
        }, 6000);
    }

    toggleMenu(event) {
        if (event) event.stopPropagation();
        if (!this.menu) return;

        const isHidden = this.menu.classList.contains('hidden');
        if (isHidden) {
            this.renderMenu();
            this.menu.classList.remove('hidden');
        } else {
            this.menu.classList.add('hidden');
        }
    }

    renderMenu() {
        if (!this.list) return;

        if (this.notifications.length === 0) {
            this.list.innerHTML = `
                <div class="notifications-empty">
                    <p>Sin notificaciones</p>
                </div>
            `;
            return;
        }

        this.list.innerHTML = this.notifications.map(n => {
            if (n.type === 'welcome') {
                return `
                    <div class="notification-item unread" style="background:transparent !important; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
                        <div style="display:flex; align-items:flex-start; gap:12px;">
                            <div class="notification-avatar" style="flex-shrink:0; background:#10B981;">
                                🎉
                            </div>
                            <div style="flex:1; min-width:0;">
                                <span style="color:white; display:block; font-size:13px; font-weight:600;">Recipe Pantry</span>
                                <span style="color:#10B981; font-weight:700; display:block; margin-top:2px;">¡Te damos la bienvenida!</span>
                                <span style="color:#bbb; font-size:11px; display:block; margin-top:4px;">Toca para abrir tu mensaje de bienvenida.</span>
                                
                                <div style="display:flex; gap:8px; margin-top:10px;">
                                    <button onclick="event.stopPropagation(); window.notificationManager.handleWelcomeClick('${n.id}')"
                                        style="flex:1; padding:8px 12px; background:#10B981; color:white; border:none; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                                        📋 Ver Bienvenida
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            if (n.type === 'app_update') {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const msg = isEn ? 'Tap to apply the new version and reload.' : 'Toca para aplicar la nueva versión y recargar.';
                const btnText = isEn ? 'Update Now' : 'Actualizar ahora';
                return `
                    <div class="notification-item unread" style="background:transparent !important; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
                        <div style="display:flex; align-items:flex-start; gap:12px;">
                            <div class="notification-avatar" style="flex-shrink:0; background:#10B981;">
                                🚀
                            </div>
                            <div style="flex:1; min-width:0;">
                                <span style="color:white; display:block; font-size:13px; font-weight:600;">Recipe Pantry</span>
                                <span style="color:#10B981; font-weight:700; display:block; margin-top:2px;">${n.recipeName}</span>
                                <span style="color:#bbb; font-size:11px; display:block; margin-top:4px;">${msg}</span>
                                
                                <!-- Action buttons -->
                                <div style="display:flex; gap:8px; margin-top:10px;">
                                    <button onclick="event.stopPropagation(); window.notificationManager.handleUpdateApp('${n.id}')"
                                        style="flex:1; padding:8px 12px; background:#10B981; color:white; border:none; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                                        🔄 ${btnText}
                                    </button>
                                    <button onclick="event.stopPropagation(); window.notificationManager.dismissNotification('${n.id}')"
                                        style="padding:8px 12px; background:rgba(255,255,255,0.1); color:#ccc; border:none; border-radius:10px; font-size:12px; font-weight:600; cursor:pointer;">
                                        ✕
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            if (n.type === 'offline_sync') {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const msg = isEn 
                    ? 'Download your recipes to use them without internet (Optional).' 
                    : 'Descarga tus recetas para usarlas sin internet (Opcional).';
                const btnText = isEn ? 'Download Now' : 'Descargar ahora';
                const dismissText = isEn ? 'Dismiss' : 'Omitir';
                return `
                    <div class="notification-item unread" style="background:transparent !important; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
                        <div style="display:flex; align-items:flex-start; gap:12px;">
                            <div class="notification-avatar" style="flex-shrink:0; background:#10B981;">
                                📥
                            </div>
                            <div style="flex:1; min-width:0;">
                                <span style="color:white; display:block; font-size:13px; font-weight:600;">Recipe Pantry</span>
                                <span style="color:#10B981; font-weight:700; display:block; margin-top:2px;">${n.recipeName}</span>
                                <span style="color:#bbb; font-size:11px; display:block; margin-top:4px;">${msg}</span>
                                
                                <!-- Action buttons -->
                                <div style="display:flex; gap:8px; margin-top:10px;">
                                    <button onclick="event.stopPropagation(); window.notificationManager.handleSyncDownload('${n.id}')"
                                        style="flex:1; padding:8px 12px; background:#10B981; color:white; border:none; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                                        ⚡ ${btnText}
                                    </button>
                                    <button onclick="event.stopPropagation(); window.notificationManager.dismissNotification('${n.id}')"
                                        style="padding:8px 12px; background:rgba(255,255,255,0.1); color:#ccc; border:1px solid rgba(255,255,255,0.15); border-radius:10px; font-size:12px; font-weight:600; cursor:pointer;">
                                        ${dismissText}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            const safeRecipeId = n.recipeId || '';
            const isRecipeIdValid = safeRecipeId.length > 10 && safeRecipeId !== 'undefined';
            
            return `
                <div class="notification-item ${n.leido ? '' : 'unread'}" style="background:transparent !important; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
                    <div style="display:flex; align-items:flex-start; gap:12px;">
                        <div class="notification-avatar" style="flex-shrink:0;">
                            ${n.sender ? n.sender.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div style="flex:1; min-width:0;">
                            <span style="color:white; display:block; font-size:13px; font-weight:600;">${n.prefix} ${n.sender} te ha compartido una receta</span>
                            <span style="color:#10B981; font-weight:700; display:block; margin-top:2px;">${n.recipeName}</span>
                            <span style="color:#666; font-size:10px; display:block; margin-top:4px;">${new Date(n.timestamp).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            
                            <!-- Action buttons -->
                            <div style="display:flex; gap:8px; margin-top:10px; ${isRecipeIdValid ? '' : 'opacity:0.5; pointer-events:none;'}">
                                <button onclick="event.stopPropagation(); window.notificationManager.handleAcceptRecipe('${n.id}', '${safeRecipeId}')"
                                    style="flex:1; padding:8px 12px; background:#10B981; color:white; border:none; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                                    ✅ Agregar a mis recetas
                                </button>
                                <button onclick="event.stopPropagation(); window.notificationManager.handleDeclineRecipe('${n.id}', '${safeRecipeId}')"
                                    style="flex:1; padding:8px 12px; background:rgba(255,255,255,0.1); color:#ccc; border:1px solid rgba(255,255,255,0.15); border-radius:10px; font-size:12px; font-weight:600; cursor:pointer;">
                                    Dejar en compartidas
                                </button>
                            </div>
                            <!-- Error fallback message if ID is invalid -->
                            ${!isRecipeIdValid ? '<span style="color:red; font-size:10px; display:block; margin-top:4px;">⚠️ Error: ID de receta no válido</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    handleWelcomeClick(notificationId) {
        console.log('🎉 [Notifications] Abriendo mensaje de bienvenida:', notificationId);
        
        // Marcar como leída en el servidor
        window.supabaseClient.from('notifications').update({ leido: true }).eq('id', notificationId).then();

        // Quitar de la lista local para que desaparezca de la campana
        this.notifications = this.notifications.filter(n => n.id !== notificationId);
        this.updateBadge();
        this.renderMenu();
        if (this.menu) this.menu.classList.add('hidden');

        // Mostrar el modal que está en index.html
        const modal = document.getElementById('welcome-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.setProperty('display', 'flex', 'important');
        }
    }

    handleUpdateApp(notificationId = 'update-1') {
        console.log('🔄 [Notifications] Intentando actualizar app...', this.updateWorker);
        window._manualAppUpdateTriggered = true;
        window._progressHandlingReload = true;
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        // 1. Cerrar inmediatamente el menú de notificaciones para no obstruir la vista
        if (this.menu) {
            this.menu.classList.add('hidden');
        }

        // 2. Quitar la tarjeta de actualización de la lista y actualizar contador de campana
        this.notifications = this.notifications.filter(n => n.id !== notificationId && n.type !== 'app_update');
        this.updateBadge();
        this.renderMenu();

        // 3. Mostrar barra de progreso interactiva Material 3 Expressive
        this.showUpdateProgressUI(isEn);
    }

    showUpdateProgressUI(isEn) {
        // Remover si ya existe
        const oldEl = document.getElementById('app-update-progress-modal');
        if (oldEl) oldEl.remove();

        const modal = document.createElement('div');
        modal.id = 'app-update-progress-modal';
        modal.style.cssText = `
            position: fixed;
            bottom: 28px;
            left: 50%;
            transform: translateX(-50%);
            background: #18181B;
            color: #FFFFFF;
            padding: 18px 24px;
            border-radius: 24px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
            display: flex;
            flex-direction: column;
            gap: 12px;
            z-index: 100000;
            width: 90%;
            max-width: 420px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            animation: m3UpdateSlideUp 0.35s cubic-bezier(0.2, 0, 0, 1) forwards;
        `;

        if (!document.getElementById('m3-update-progress-style')) {
            const style = document.createElement('style');
            style.id = 'm3-update-progress-style';
            style.textContent = `
                @keyframes m3UpdateSlideUp {
                    from { opacity: 0; transform: translate(-50%, 40px) scale(0.96); }
                    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
                }
                .m3-update-track {
                    width: 100%;
                    height: 8px;
                    background: rgba(255, 255, 255, 0.12);
                    border-radius: 999px;
                    overflow: hidden;
                    position: relative;
                }
                .m3-update-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #10B981 0%, #34D399 100%);
                    width: 0%;
                    border-radius: 999px;
                    transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);
                }
            `;
            document.head.appendChild(style);
        }

        modal.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div id="m3-update-icon-wrap" style="width: 36px; height: 36px; border-radius: 12px; background: rgba(16, 185, 129, 0.18); display: flex; align-items: center; justify-content: center; color: #34D399;">
                        <span class="material-symbols-outlined" style="font-size: 22px; animation: spin 2s linear infinite;">sync</span>
                    </div>
                    <div>
                        <div id="m3-update-title" style="font-size: 14px; font-weight: 700; color: #FFFFFF;">
                            ${isEn ? 'Downloading update...' : 'Descargando actualización...'}
                        </div>
                        <div id="m3-update-sub" style="font-size: 12px; color: #A1A1AA; margin-top: 1px;">
                            ${isEn ? 'Preparing newest features' : 'Descargando recursos y mejoras'}
                        </div>
                    </div>
                </div>
                <span id="m3-update-percent" style="font-size: 15px; font-weight: 800; color: #34D399;">0%</span>
            </div>
            <div class="m3-update-track">
                <div id="m3-update-fill" class="m3-update-fill"></div>
            </div>
        `;
        document.body.appendChild(modal);

        const fillEl = document.getElementById('m3-update-fill');
        const percentEl = document.getElementById('m3-update-percent');
        const titleEl = document.getElementById('m3-update-title');
        const subEl = document.getElementById('m3-update-sub');
        const iconWrap = document.getElementById('m3-update-icon-wrap');

        let currentPercent = 12;
        if (fillEl) fillEl.style.width = '12%';
        if (percentEl) percentEl.textContent = '12%';

        const interval = setInterval(() => {
            if (currentPercent < 90) {
                currentPercent += Math.floor(Math.random() * 16) + 10;
                if (currentPercent > 90) currentPercent = 90;
                if (fillEl) fillEl.style.width = currentPercent + '%';
                if (percentEl) percentEl.textContent = currentPercent + '%';
                if (currentPercent > 50 && subEl) {
                    subEl.textContent = isEn ? 'Installing components...' : 'Instalando componentes y vistas...';
                }
            }
        }, 120);

        let completed = false;
        const finishUpdate = () => {
            if (completed) return;
            completed = true;
            clearInterval(interval);

            if (fillEl) fillEl.style.width = '100%';
            if (percentEl) percentEl.textContent = '100%';
            if (titleEl) titleEl.textContent = isEn ? '✅ App Updated!' : '✅ ¡Actualizado con éxito!';
            if (subEl) subEl.textContent = isEn ? 'Reloading application...' : 'Reiniciando aplicación...';
            if (iconWrap) {
                iconWrap.style.background = 'rgba(16, 185, 129, 0.3)';
                iconWrap.innerHTML = '<span class="material-symbols-outlined" style="font-size: 22px; color: #34D399;">check_circle</span>';
            }

            sessionStorage.setItem('recipe_pantry_just_updated', 'true');

            // Dar tiempo a ver el estado "Actualizado" y recargar
            setTimeout(() => {
                modal.style.animation = 'm3UpdateSlideUp 0.3s cubic-bezier(0.2, 0, 0, 1) reverse forwards';
                setTimeout(() => {
                    modal.remove();
                    window.location.reload();
                }, 300);
            }, 750);
        };

        // Solicitar al worker activar la nueva versión
        if (this.updateWorker && this.updateWorker.state !== 'redundant') {
            try {
                this.updateWorker.postMessage({ type: 'SKIP_WAITING' });
            } catch (err) {
                console.warn('postMessage failed:', err);
            }
        }

        // Si el Service Worker cambia de controlador, finalizar con éxito
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            finishUpdate();
        }, { once: true });

        // Fallback de seguridad por si el worker ya estaba activo o tarda
        setTimeout(() => {
            finishUpdate();
        }, 1300);
    }

    handleSyncDownload(notificationId) {
        if (window.syncManager) {
            window.syncManager.preloadOfflineRecipes({ silent: false });
            
            // Marcar como leída y quitar de la lista
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateBadge();
            this.renderMenu();
            this.menu.classList.add('hidden');
        }
    }

    dismissNotification(notificationId) {
        if (notificationId && notificationId.startsWith('sync-')) {
            localStorage.setItem('recipepantry_offline_prompt_dismissed', 'true');
        }
        this.notifications = this.notifications.filter(n => n.id !== notificationId);
        this.updateBadge();
        this.renderMenu();
    }

    /**
     * Accept: Convierte la receta en propia
     */
    async handleAcceptRecipe(notificationId, recipeId) {
        try {
            const user = window.authManager.currentUser;
            if (!user) return;

            // 0. Verificar si el nombre ya existe en mis recetas (excluyendo la que estamos aceptando)
            const n = this.notifications.find(item => item.id === notificationId);
            if (n && n.recipeName) {
                const exists = await window.db.recipeNameExists(n.recipeName, { 
                    includeShared: false, 
                    excludeId: recipeId // v250: Crítico para que no se autodetecte como duplicado
                });
                if (exists) {
                    window.utils.showToast(
                        window.i18n && window.i18n.getLang() === 'en' ?
                            'A recipe with this name already exists in your recipes' :
                            'esta receta con este nobree ya esta en tus recetas',
                        'warning'
                    );
                    return;
                }
            }

            window.utils.showToast(window.i18n ? window.i18n.t('savingRecipe') : 'Guardando receta...', 'info');

            // 1. Actualizar estado en el servidor (shared_recipes) - Opcional si vamos a borrar, pero mantenemos flujo
            const { error: shareError } = await window.supabaseClient
                .from('shared_recipes')
                .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                .eq('recipe_id', recipeId)
                .eq('recipient_user_id', user.id);

            if (shareError) throw shareError;

            // 2. Duplicar la receta
            const duplicateResult = await window.db.duplicateRecipe(recipeId, user.id);
            if (!duplicateResult.success) throw new Error(duplicateResult.error);

            // 3. Eliminar de compartidas definitivamente
            await window.db.deleteSharedRecipe(user.id, recipeId);

            // 4. Marcar notificación como leída (y cualquier otra duplicada para esta receta)
            const { error: notifError } = await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('user_id', user.id)
                .eq('recipe_id', recipeId)
                .eq('type', 'recipe_shared');

            if (notifError) {
                console.error('⚠️ [Notifications] Error marcando como leída:', notifError);
                // Intentar backup por ID exacto si el filtro complejo falla
                await window.supabaseClient.from('notifications').update({ leido: true }).eq('id', notificationId);
            }

            // 5. Actualizar UI
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateBadge();
            this.renderMenu();

            window.utils.showToast('✅ ¡Receta agregada a tu colección!', 'success');

            // 6. NAVEGACIÓN AUTOMÁTICA a "Mis Recetas"
            if (window.dashboardManager) {
                window.dashboardManager.switchView('recipes');
            } else if (window.dashboard) {
                window.dashboard.switchView('recipes');
            }

        } catch (err) {
            console.error('Error aceptando receta:', err);
            window.utils.showToast('Error al agregar la receta', 'error');
        }
    }

    /**
     * Decline: Dejar en compartidas
     */
    async handleDeclineRecipe(notificationId, recipeId) {
        try {
            const user = window.authManager.currentUser;
            if (!user) return;

            window.utils.showToast('Guardando en compartidas...', 'info');

            // 1. Update shared_recipes status
            const { error: shareError } = await window.supabaseClient
                .from('shared_recipes')
                .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                .eq('recipe_id', recipeId)
                .eq('recipient_user_id', user.id);

            if (shareError) throw shareError;

            // 2. Mark notification as read (and any duplicates)
            const { error: notifError } = await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('user_id', user.id)
                .eq('recipe_id', recipeId);
            
            if (notifError) {
                console.error('⚠️ [Notifications] Error marcando declive como leído:', notifError);
                await window.supabaseClient.from('notifications').update({ leido: true }).eq('id', notificationId);
            }

            // 3. Update UI
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateBadge();
            this.renderMenu();

            window.utils.showToast('Receta guardada en compartidas', 'success');

            // 4. NAVEGACIÓN AUTOMÁTICA a "Compartidas"
            if (window.dashboardManager) {
                window.dashboardManager.switchView('shared');
            } else if (window.dashboard) {
                window.dashboard.switchView('shared');
            }

        } catch (err) {
            console.error('Error procesando receta:', err);
            window.utils.showToast('Error al procesar', 'error');
        }
    }

    // Legacy: direct click opens recipe
    async handleNotificationClick(notificationId) {
        const n = this.notifications.find(n => n.id === notificationId);
        if (!n) return;

        try {
            await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('id', notificationId);

            this.notifications = this.notifications.filter(item => item.id !== notificationId);
            this.updateBadge();
            this.renderMenu();

            window.location.href = `/recipe-detail?id=${n.recipeId}`;
            this.menu.classList.add('hidden');
        } catch (err) {
            console.error('Error:', err);
            window.location.href = `/recipe-detail?id=${n.recipeId}`;
        }
    }
}

// Inicializar y exponer globalmente
window.notificationManager = new NotificationManager();
