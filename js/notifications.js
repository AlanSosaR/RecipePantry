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
                    from_user:users!from_user_id(first_name, last_name, email),
                    recipe:recipes(id, name_es, name_en)
                `)
                .eq('user_id', user.id)
                .is('leido', false)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.notifications = data.map(n => {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const recipeName = isEn ? (n.recipe?.name_en || n.recipe?.name_es) : n.recipe?.name_es;
                const senderName = [n.from_user?.first_name, n.from_user?.last_name].filter(Boolean).join(' ')
                    || n.from_user?.email
                    || 'Alguien';

                return {
                    id: n.id,
                    recipeId: n.recipe_id,
                    recipeName: recipeName || 'Receta compartida',
                    type: n.type || 'recipe_shared',
                    timestamp: n.created_at,
                    sender: senderName,
                    leido: n.leido
                };
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

        window.supabaseClient
            .channel(`notifications:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, () => {
                this.fetchNotifications();
                window.utils.showToast('¡Has recibido una nueva receta!', 'info');
            })
            .subscribe();
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

            return `
                <div class="notification-item ${n.leido ? '' : 'unread'}" style="background:transparent !important; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
                    <div style="display:flex; align-items:flex-start; gap:12px;">
                        <div class="notification-avatar" style="flex-shrink:0;">
                            ${n.sender ? n.sender.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div style="flex:1; min-width:0;">
                            <span style="color:white; display:block; font-size:13px; font-weight:600;">Chef ${n.sender} te ha compartido una receta</span>
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

    /**
     * Accept: Convierte la receta en propia usando lógica centralizada (duplica ingredientes/pasos y actualiza caché local)
     */
    async handleAcceptRecipe(notificationId, recipeId) {
        try {
            const user = window.authManager.currentUser;
            if (!user) return;

            window.utils.showToast(window.i18n ? window.i18n.t('savingRecipe') : 'Guardando receta...', 'info');

            // 1. PRIMERO actualizar estado en el servidor para que la API lo devuelva como 'accepted'
            // Esto evita que desaparezca de la vista 'Compartidas' durante la recarga
            await window.supabaseClient
                .from('shared_recipes')
                .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                .eq('recipe_id', recipeId)
                .eq('recipient_user_id', user.id);

            // 2. Duplicar la receta (usando la lógica de db.js que ya limpia datos numéricos)
            const duplicateResult = await window.db.duplicateRecipe(recipeId, user.id);
            if (!duplicateResult.success) {
                throw new Error(duplicateResult.error);
            }

            // 3. Marcar como copiada
            await window.supabaseClient
                .from('shared_recipes')
                .update({ copied: true, copied_at: new Date().toISOString() })
                .eq('recipe_id', recipeId)
                .eq('recipient_user_id', user.id);

            // 4. Marcar notificación como leída
            await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('id', notificationId);

            // 4. Remove from local list and update UI
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateBadge();
            this.renderMenu();

            window.utils.showToast('✅ ¡Receta agregada a tu colección!', 'success');

            // Reload recipes if on dashboard to ensure UI consistency
            if (window.dashboard) {
                // Forzar recarga desde red para actualizar despensas limpia
                const currentFilters = window.dashboard.lastFilters || {};
                await window.dashboard.loadRecipes({ ...currentFilters, forceRefresh: true });
            }

        } catch (err) {
            console.error('Error aceptando receta:', err);
            window.utils.showToast('Error al agregar la receta', 'error');
        }
    }

    /**
     * Decline: Keep in shared, mark as read
     */
    async handleDeclineRecipe(notificationId, recipeId) {
        try {
            const user = window.authManager.currentUser;

            // 1. Update shared_recipes status (MUST be 'accepted' to pass constraints, it means accepted into shared despensa)
            await window.supabaseClient
                .from('shared_recipes')
                .update({ status: 'accepted' })
                .eq('recipe_id', recipeId)
                .eq('recipient_user_id', user.id);

            // 2. Mark notification as read
            await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('id', notificationId);

            // 3. Remove from local list and update UI
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateBadge();
            this.renderMenu();

            window.utils.showToast('Receta guardada en compartidas', 'info');

            // Reload shared recipes logic to ensure UI is completely synchronized
            if (window.dashboard) {
                await window.dashboard.loadRecipes({ shared: true, forceRefresh: true });
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
