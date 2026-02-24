/**
 * NotificationManager - RecipeHub
 * Maneja las notificaciones de archivos compartidos
 */
class NotificationManager {
    constructor() {
        this.notifications = [];
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

            const { data, error } = await window.supabaseClient
                .from('notifications')
                .select(`
                    *,
                    from_user:users!from_user_id(first_name, last_name, email),
                    recipe:recipes(id, name_es)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.notifications = data.map(n => ({
                id: n.id,
                recipeId: n.recipe_id,
                recipeName: n.recipe?.name_es || 'Receta compartida',
                permission: n.type === 'recipe_shared' ? 'view' : 'view', // logic for permission if needed
                timestamp: n.created_at,
                sender: [n.from_user?.first_name, n.from_user?.last_name].filter(Boolean).join(' ') || n.from_user?.email || 'Alguien',
                leido: n.leido
            }));

            this.updateBadge();
        } catch (err) {
            console.error('Error cargando notificaciones:', err);
        }
    }

    setupRealtime() {
        const user = window.authManager.currentUser;
        if (!user) return;

        window.supabaseClient
            .channel('public:notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, payload => {
                console.log('🔔 Nueva notificación recibida:', payload);
                this.fetchNotifications();
                // Opcional: mostrar toast
                window.utils.showToast('¡Has recibido una nueva receta!', 'info');
            })
            .subscribe();
    }

    updateBadge() {
        if (!this.badge) return;
        const unreadCount = this.notifications.filter(n => !n.leido).length;
        if (unreadCount > 0) {
            this.badge.classList.remove('hidden');
            this.badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        } else {
            this.badge.classList.add('hidden');
        }
    }

    toggleMenu(event) {
        if (event) event.stopPropagation();
        if (!this.menu) return;

        const isHidden = this.menu.classList.contains('hidden');
        if (isHidden) {
            this.renderMenu();
            this.menu.classList.remove('hidden');
            this.markAllAsRead();
        } else {
            this.menu.classList.add('hidden');
        }
    }

    async markAllAsRead() {
        const unread = this.notifications.filter(n => !n.leido);
        if (unread.length === 0) return;

        try {
            const { error } = await window.supabaseClient
                .from('notifications')
                .update({ leido: true })
                .in('id', unread.map(n => n.id));

            if (error) throw error;

            this.notifications.forEach(n => n.leido = true);
            this.updateBadge();
        } catch (err) {
            console.error('Error marcando como leído:', err);
        }
    }

    renderMenu() {
        if (!this.list) return;

        if (this.notifications.length === 0) {
            this.list.innerHTML = `
                <div class="notifications-empty">
                    <p>No tienes notificaciones</p>
                </div>
            `;
            return;
        }

        this.list.innerHTML = this.notifications.map(n => `
            <div class="notification-item ${n.leido ? '' : 'unread'}" onclick="window.notificationManager.handleNotificationClick('${n.id}')">
                <div class="notification-icon-container">
                    <span class="material-symbols-outlined">recipe_box</span>
                </div>
                <div class="notification-content">
                    <strong class="notification-title">${n.sender} compartió una receta</strong>
                    <p class="notification-desc">"${n.recipeName}"</p>
                    <div class="notification-meta">
                         <span class="notif-time">${new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async handleNotificationClick(notificationId) {
        const n = this.notifications.find(n => n.id === notificationId);
        if (!n) return;

        // Abrir la receta
        window.location.href = `recipe-detail.html?id=${n.recipeId}`;
        this.menu.classList.add('hidden');
    }
}

// Inicializar y exponer globalmente de forma inmediata
window.notificationManager = new NotificationManager();
