/**
 * NotificationManager - Recipe Pantry
 * Maneja las notificaciones de archivos compartidos
 */
class NotificationManager {
    constructor() {
        this.notifications = [];
        this.lastCount = 0;
        // No llamamos a init() aquí para evitar colisiones con el DOM
    }

    async init() {
        this.menu = document.getElementById('notifications-menu');
        this.badge = document.getElementById('notifications-badge');
        this.list = document.getElementById('notifications-list');

        // 1. Cargar notificaciones iniciales desde BD
        await this.fetchNotifications();

        // 2. Suscribirse a cambios en tiempo real
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

            console.log('🔔 Buscando notificaciones para el usuario:', user.id);

            // Buscamos notificaciones básicas primero para asegurar que funcionen incluso si los joins fallan
            const { data, error } = await window.supabaseClient
                .from('notifications')
                .select(`
                    id, 
                    created_at, 
                    leido, 
                    from_user_id, 
                    recipe_id,
                    from_user:users!from_user_id(first_name, last_name, email),
                    recipe:recipes(id, name_es, name_en)
                `)
                .eq('user_id', user.id)
                .is('leido', false)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Error Supabase fetchNotifications:', error);
                throw error;
            }

            console.log('📬 Notificaciones recibidas:', data.length);

            this.notifications = data.map(n => {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const recipeName = isEn ? (n.recipe?.name_en || n.recipe?.name_es) : n.recipe?.name_es;
                const senderName = [n.from_user?.first_name, n.from_user?.last_name].filter(Boolean).join(' ')
                    || n.from_user?.email
                    || (window.i18n ? window.i18n.t('notifSomebody') : 'Alguien');

                return {
                    id: n.id,
                    recipeId: n.recipe_id,
                    recipeName: recipeName || (window.i18n ? window.i18n.t('notifSharedRecipe') : 'Receta compartida'),
                    permission: 'view', // Por defecto view, ya que shared_recipes manejará el permiso real
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
            console.error('⚠️ Detalle del error cargando notificaciones:', err);
        }
    }

    setupRealtime() {
        const user = window.authManager.currentUser;
        if (!user) return;

        console.log('📡 Iniciando canal Realtime para notificaciones...');

        const channel = window.supabaseClient
            .channel(`notifications:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, (payload) => {
                console.log('⚡ ¡Nueva notificación recibida por Realtime!', payload);
                this.fetchNotifications();
                const newRecipeMsg = (window.i18n && window.i18n.t)
                    ? window.i18n.t('notifNewRecipe')
                    : '¡Has recibido una nueva receta!';
                window.utils.showToast(newRecipeMsg, 'info');
            })
            .subscribe((status) => {
                console.log('🔌 Estado suscripción Realtime:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Escuchando cambios en la tabla notifications...');
                }
            });
    }

    updateBadge() {
        if (!this.badge) return;
        const unreadCount = this.notifications.filter(n => !n.leido).length;
        const btn = document.getElementById('btn-notifications');

        if (unreadCount > 0) {
            this.badge.classList.remove('hidden');
            this.badge.textContent = unreadCount;

            // Si es una nueva notificación (incremento), agitamos la campana
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
            // Ya no marcamos todo como leído al abrir, solo al hacer clic individual
        } else {
            this.menu.classList.add('hidden');
        }
    }

    renderMenu() {
        if (!this.list) return;

        if (this.notifications.length === 0) {
            const emptyTxt = window.i18n ? window.i18n.t('notifEmpty') : 'Sin notificaciones';
            this.list.innerHTML = `
                <div class="notifications-empty">
                    <p>${emptyTxt}</p>
                </div>
            `;
            return;
        }

        this.list.innerHTML = this.notifications.map(n => {
            const isCopyable = n.permission === 'view_and_copy';
            const permissionText = isCopyable
                ? (window.i18n ? window.i18n.t('notifCanCopy') : '📋 Puedes agregar a tus recetas')
                : (window.i18n ? window.i18n.t('notifCanViewOnly') : '👁️ Solo puedes ver · Expira en 7 días');

            const userSharedTxt = window.i18n ? window.i18n.t('notifUserShared', { user: n.sender }) : `${n.sender} compartió una receta`;

            return `
                <div class="notification-item ${n.leido ? '' : 'unread'}" onclick="window.notificationManager.handleNotificationClick('${n.id}')" style="background: transparent !important;">
                    <div class="notification-avatar">
                        ${n.sender ? n.sender.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div class="notification-content">
                        <span class="notification-main-text" style="color: white; display: block;">${userSharedTxt}</span>
                        <span class="notification-recipe-name" style="color: #00A676; font-weight: 700; display: block;">${n.recipeName}</span>
                        <span class="notification-permission" style="color: #888; font-size: 11px; display: block; margin-top: 2px;">${permissionText}</span>
                        <span class="notification-time" style="color: #666; font-size: 10px; display: block; margin-top: 4px;">${new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    async handleNotificationClick(notificationId) {
        const n = this.notifications.find(n => n.id === notificationId);
        if (!n) return;

        try {
            // 1. Marcar como leída en DB
            await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .eq('id', notificationId);

            // 2. Eliminarla del panel local (según instrucción del usuario)
            this.notifications = this.notifications.filter(item => item.id !== notificationId);

            // 3. Actualizar UI
            this.updateBadge();
            this.renderMenu();

            // 4. Abrir la receta pasando el permiso
            window.location.href = `recipe-detail.html?id=${n.recipeId}&permission=${n.permission}`;
            this.menu.classList.add('hidden');
        } catch (err) {
            console.error('Error al procesar click de notificación:', err);
            window.location.href = `recipe-detail.html?id=${n.recipeId}&permission=${n.permission}`;
        }
    }
}

// Inicializar y exponer globalmente de forma inmediata
window.notificationManager = new NotificationManager();
