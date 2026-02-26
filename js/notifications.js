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
            return `
                <div class="notification-item ${n.leido ? '' : 'unread'}" style="background:transparent !important; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08);">
                    <div style="display:flex; align-items:flex-start; gap:12px;">
                        <div class="notification-avatar" style="flex-shrink:0;">
                            ${n.sender ? n.sender.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div style="flex:1; min-width:0;">
                            <span style="color:white; display:block; font-size:13px; font-weight:600;">${n.sender} te compartió una receta</span>
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

    /**
     * Accept: Copy recipe to user's own recipes, mark shared_recipes.copied = true
     */
    async handleAcceptRecipe(notificationId, recipeId) {
        try {
            const user = window.authManager.currentUser;
            if (!user) return;

            // 1. Fetch the original recipe data
            const { data: original, error: fetchErr } = await window.supabaseClient
                .from('recipes')
                .select('*')
                .eq('id', recipeId)
                .single();

            if (fetchErr) throw fetchErr;

            // 2. Create a copy under the current user's ID
            const copy = { ...original };
            delete copy.id; // Let DB generate new ID
            copy.user_id = user.id;
            copy.created_at = new Date().toISOString();
            copy.updated_at = new Date().toISOString();
            copy.is_favorite = false;
            copy.view_count = 0;
            copy.times_cooked = 0;

            const { error: insertErr } = await window.supabaseClient
                .from('recipes')
                .insert([copy]);

            if (insertErr) throw insertErr;

            // 3. Mark shared_recipes as copied
            await window.supabaseClient
                .from('shared_recipes')
                .update({ copied: true, copied_at: new Date().toISOString(), status: 'accepted' })
                .eq('recipe_id', recipeId)
                .eq('recipient_user_id', user.id);

            // 4. Mark notification as read
            await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('id', notificationId);

            // 5. Remove from local list and update UI
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            this.updateBadge();
            this.renderMenu();

            window.utils.showToast('✅ ¡Receta agregada a tu colección!', 'success');

            // Reload recipes if on dashboard
            if (window.dashboard) window.dashboard.loadRecipes();

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

            // 1. Update shared_recipes status
            await window.supabaseClient
                .from('shared_recipes')
                .update({ status: 'shared' })
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

            window.location.href = `recipe-detail.html?id=${n.recipeId}`;
            this.menu.classList.add('hidden');
        } catch (err) {
            console.error('Error:', err);
            window.location.href = `recipe-detail.html?id=${n.recipeId}`;
        }
    }
}

// Inicializar y exponer globalmente
window.notificationManager = new NotificationManager();
