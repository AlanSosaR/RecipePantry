/**
 * NotificationManager - Recipe Pantry
 * Maneja las notificaciones de archivos compartidos
 * Con flujo interactivo: Aceptar (agregar a mis recetas) / Dejar en compartidas
 */
class NotificationManager {
    constructor() {
        this.notifications = [];
        this.lastCount = 0;
    }

    async init() {
        console.log('🔔 [Notifications] Iniciando manager...');
        this.menu = document.getElementById('notifications-menu');
        this.badge = document.getElementById('notifications-badge');
        this.list = document.getElementById('notifications-list');

        await this.fetchNotifications();
        this.setupRealtime();

        // Cerrar menú al hacer clic fuera
        document.addEventListener('mousedown', (e) => {
            if (this.menu && !this.menu.classList.contains('hidden')) {
                const btn = document.getElementById('btn-notifications');
                if (!this.menu.contains(e.target) && !btn.contains(e.target)) {
                    this.menu.classList.add('hidden');
                }
            }
        });
    }

    async fetchNotifications() {
        try {
            const user = window.authManager.currentUser;
            if (!user) return;

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
            console.log(`🔔 [Notifications] Datos del servidor (${data?.length || 0}):`, data);

            const serverNotifications = data.map(n => {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const recipeName = isEn ? (n.recipe?.name_en || n.recipe?.name_es) : n.recipe?.name_es;
                const senderName = [n.from_user?.first_name, n.from_user?.last_name].filter(Boolean).join(' ')
                    || n.from_user?.email
                    || 'Alguien';
                const senderPrefix = n.from_user?.prefix || (isEn ? 'Chef' : 'Chef');

                return {
                    id: n.id,
                    recipeId: n.recipe_id,
                    recipeName: recipeName || 'Receta compartida',
                    type: n.type || 'recipe_shared',
                    timestamp: n.created_at,
                    sender: senderName,
                    prefix: senderPrefix,
                    leido: n.leido
                };
            });

            // v156: Preservar notificaciones locales (update, sync) al refrescar desde el servidor
            const localNotifications = this.notifications.filter(n => ['app_update', 'offline_sync'].includes(n.type));
            
            // Combinar: las del servidor + las locales
            this.notifications = [...localNotifications, ...serverNotifications];
            
            // Eliminar duplicados si los hay (por ID)
            const seen = new Set();
            this.notifications = this.notifications.filter(n => {
                const duplicate = seen.has(n.id);
                seen.add(n.id);
                return !duplicate;
            });

            this.updateBadge();
            if (!this.menu?.classList.contains('hidden')) {
                this.renderMenu();
            }
        } catch (err) {
            console.error('Error cargando notificaciones:', err);
        }
    }

    setupRealtime() {
        const user = window.authManager.currentUser;
        if (!user) return;

        console.log(`📡 [Notifications] Suscribiendo a realtime para usuario: ${user.id}`);

        const channel = window.supabaseClient
            .channel(`notifications:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, (payload) => {
                console.log('🔔 Nueva notificación recibida vía Realtime:', payload);
                // v157: Añadir delay para dar tiempo a que la DB se estabilice
                setTimeout(() => this.fetchNotifications(), 500);
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                window.utils.showToast(isEn ? 'You have received a new recipe!' : '¡Has recibido una nueva receta!', 'info');
            });

        channel.subscribe((status) => {
            console.log(`📡 [Notifications] Realtime status: ${status}`);
        });
    }

    updateBadge() {
        if (!this.badge) return;
        const unreadCount = this.notifications.filter(n => !n.leido).length;
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
        console.log('🔔 [Notifications] Agregando tarjeta de actualización manual...');
        // Evitar duplicados
        if (this.notifications.some(n => n.type === 'app_update')) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        this.updateWorker = worker;

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

        // Mostrar un Toast para asegurar que el usuario lo vea
        if (window.utils && window.utils.showToast) {
            window.utils.showToast(isEn ? '🔔 New update available!' : '🔔 ¡Nueva actualización disponible!', 'info', 5000);
        }
    }

    addSyncNotification() {
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

        // Mostrar un Toast discreto
        if (window.utils && window.utils.showToast) {
            window.utils.showToast(isEn ? '🔔 Access your recipes offline!' : '🔔 ¡Accede a tus recetas sin conexión!', 'info', 5000);
        }
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
                                    <button onclick="event.stopPropagation(); window.notificationManager.handleUpdateApp()"
                                        style="flex:1; padding:8px 12px; background:#10B981; color:white; border:none; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                                        🔄 ${btnText}
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
                    ? 'Download your recipes to use them without internet.' 
                    : 'Descarga tus recetas para usarlas sin internet.';
                const btnText = isEn ? 'Download Now' : 'Descargar ahora';
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
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

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
                            <div style="display:flex; gap:8px; margin-top:10px;">
                                <button onclick="event.stopPropagation(); window.notificationManager.handleAcceptRecipe('${n.id}', '${n.recipeId}')"
                                    style="flex:1; padding:8px 12px; background:#10B981; color:white; border:none; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer;">
                                    ✅ Agregar a mis recetas
                                </button>
                                <button onclick="event.stopPropagation(); window.notificationManager.handleDeclineRecipe('${n.id}', '${n.recipeId}')"
                                    style="flex:1; padding:8px 12px; background:rgba(255,255,255,0.1); color:#ccc; border:1px solid rgba(255,255,255,0.15); border-radius:10px; font-size:12px; font-weight:600; cursor:pointer;">
                                    Dejar en compartidas
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    handleUpdateApp() {
        if (this.updateWorker) {
            window.utils.showToast(window.i18n && window.i18n.getLang() === 'en' ? 'Updating app...' : 'Actualizando la app...', 'info');
            this.updateWorker.postMessage({ type: 'SKIP_WAITING' });
        } else {
            window.location.reload();
        }
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

    /**
     * Accept: Convierte la receta en propia
     */
    async handleAcceptRecipe(notificationId, recipeId) {
        try {
            const user = window.authManager.currentUser;
            if (!user) return;

            // 0. Verificar si el nombre ya existe en mis recetas
            const n = this.notifications.find(item => item.id === notificationId);
            if (n && n.recipeName) {
                const exists = await window.db.recipeNameExists(n.recipeName);
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

            // 4. Marcar notificación como leída
            await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('id', notificationId);

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

            // 2. Mark notification as read
            await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('id', notificationId);

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
