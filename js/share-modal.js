/**
 * ShareModalManager - RecipeHub
 * Maneja la lógica del modal de compartir con búsqueda real en BD
 */
class ShareModalManager {
    constructor() {
        this.recipeId = null;
        this.selectedUsers = [];
        this.searchTimeout = null;

        this.init();
    }

    init() {
        this.modal = document.getElementById('share-modal');
        this.searchInput = document.getElementById('user-search-input');
        this.suggestionsContainer = document.getElementById('search-suggestions');
        this.chipsContainer = document.getElementById('selected-users-chips');
        this.btnShare = document.getElementById('btn-share-submit');
        this.btnCopy = document.getElementById('btn-copy-link');

        if (!this.modal) return;

        // Búsqueda en tiempo real con debounce
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                const value = e.target.value.trim();
                if (!value) {
                    this.suggestionsContainer.classList.add('hidden');
                    return;
                }
                // Esperar 300ms antes de buscar
                this.searchTimeout = setTimeout(() => this.handleSearch(value), 300);
            });

            this.searchInput.addEventListener('focus', () => {
                const value = this.searchInput.value.trim();
                if (value) this.handleSearch(value);
            });
        }

        // Cerrar modal al hacer clic fuera
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Cerrar con Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
                this.close();
            }
        });
    }

    open(recipeId) {
        this.recipeId = recipeId;
        this.selectedUsers = [];
        this.renderChips();
        this.updateShareButton();

        const recipe = window.dashboard ? window.dashboard.currentRecipes.find(r => r.id === recipeId) : null;
        if (recipe) {
            document.getElementById('share-modal-title').textContent = `Compartir "${recipe.name_es}"`;
            document.getElementById('share-modal-size').textContent = "1.56 KB";
        }

        this.modal.classList.remove('hidden');
        if (this.searchInput) {
            this.searchInput.value = '';
            this.searchInput.focus();
        }
        if (this.suggestionsContainer) this.suggestionsContainer.classList.add('hidden');
    }

    close() {
        this.modal.classList.add('hidden');
        if (this.searchInput) this.searchInput.value = '';
        if (this.suggestionsContainer) this.suggestionsContainer.classList.add('hidden');
        clearTimeout(this.searchTimeout);
    }

    async handleSearch(query) {
        // Mostrar spinner mientras busca
        this.suggestionsContainer.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #aaa; font-size: 13px;">
                Buscando...
            </div>
        `;
        this.suggestionsContainer.classList.remove('hidden');

        try {
            const currentAuthUser = window.authManager.currentUser;

            const { data: users, error } = await window.supabaseClient
                .rpc('search_users', {
                    query: query,
                    current_auth_user_id: currentAuthUser?.id || null
                });

            if (error) throw error;

            // Filtrar ya seleccionados
            const filtered = (users || []).filter(
                u => !this.selectedUsers.some(s => s.id === u.id)
            );

            this.renderSuggestions(filtered);

        } catch (err) {
            console.error('Error buscando usuarios:', err);
            this.suggestionsContainer.innerHTML = `
                <div style="padding: 16px; text-align: center; color: #aaa; font-size: 13px;">
                    Error al buscar usuarios
                </div>
            `;
        }
    }

    async getCurrentProfileId(authUserId) {
        // Usar maybeSingle() para evitar error 406 si no existe el perfil
        const { data, error } = await window.supabaseClient
            .from('users')
            .select('id')
            .eq('auth_user_id', authUserId)
            .maybeSingle();
        if (error) console.warn('getCurrentProfileId error:', error);
        return data?.id ?? null;
    }

    renderSuggestions(users) {
        if (users.length === 0) {
            this.suggestionsContainer.innerHTML = `
                <div style="padding: 16px; text-align: center; color: #aaa; font-size: 13px;">
                    No se encontraron usuarios
                </div>
            `;
            this.suggestionsContainer.classList.remove('hidden');
            return;
        }

        this.suggestionsContainer.innerHTML = users.map(user => {
            const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Usuario';
            const initials = (user.first_name?.[0] || '') + (user.last_name?.[0] || '') || user.email?.[0]?.toUpperCase() || '?';
            return `
                <div class="suggestion-item" onclick="window.shareModal.addUser('${user.id}', '${name.replace(/'/g, "\\'")}', '${user.email}', '${initials}')">
                    <div class="suggestion-avatar">${initials}</div>
                    <div class="suggestion-info">
                        <span class="suggestion-name">${name}</span>
                        <span class="suggestion-email">${user.email || ''}</span>
                    </div>
                </div>
            `;
        }).join('');

        this.suggestionsContainer.classList.remove('hidden');
    }

    addUser(userId, name, email, initials) {
        if (!this.selectedUsers.some(u => u.id === userId)) {
            this.selectedUsers.push({ id: userId, name, email, avatar: initials });
            this.renderChips();
            this.updateShareButton();
            if (this.searchInput) {
                this.searchInput.value = '';
                this.searchInput.focus();
            }
            this.suggestionsContainer.classList.add('hidden');
        }
    }

    removeUser(userId) {
        this.selectedUsers = this.selectedUsers.filter(u => u.id !== userId);
        this.renderChips();
        this.updateShareButton();
    }

    renderChips() {
        if (!this.chipsContainer) return;
        this.chipsContainer.innerHTML = this.selectedUsers.map(user => `
            <div class="user-chip">
                <span>${user.name}</span>
                <span class="material-symbols-outlined remove-chip" onclick="window.shareModal.removeUser('${user.id}')">close</span>
            </div>
        `).join('');
    }

    updateShareButton() {
        if (this.btnShare) {
            this.btnShare.disabled = this.selectedUsers.length === 0;
        }
    }

    async share() {
        if (this.selectedUsers.length === 0) return;

        const btnShare = this.btnShare;
        const permissionEl = document.getElementById('share-permission');
        const permissionValue = permissionEl ? permissionEl.value : 'view';
        // Mapear al valor que acepta la BD
        const dbPermission = permissionValue === 'add' ? 'view_and_copy' : 'view';

        const names = this.selectedUsers.map(u => u.name).join(', ');

        try {
            window.setButtonLoading(btnShare, true, 'Compartiendo...');

            // Intentar recuperar el perfil si no está disponible (puede ser una sesión expirada o no cargada)
            if (!window.authManager.currentUser) {
                console.log('Perfil no encontrado en memoria, intentando checkAuth...');
                await window.authManager.checkAuth();
            }

            const ownerProfileId = window.authManager.currentUser?.id;
            if (!ownerProfileId) {
                console.error('No se pudo determinar el ID del propietario');
                window.showSnackbar('No se pudo obtener tu perfil. Cerramos e intentamos de nuevo...', 4000);
                setTimeout(() => this.close(), 2000);
                window.setButtonLoading(btnShare, false);
                return;
            }

            // Guardar en shared_recipes para cada destinatario
            const insertions = this.selectedUsers.map(user => ({
                owner_user_id: ownerProfileId,
                recipe_id: this.recipeId,
                recipient_user_id: user.id,
                permission: dbPermission,
                status: 'pending'
            }));

            const { error } = await window.supabaseClient
                .from('shared_recipes')
                .insert(insertions);

            if (error) throw error;

            // 2. Crear notificaciones en la BD para cada receptor
            const notifications = this.selectedUsers.map(user => ({
                user_id: user.id,
                type: 'recipe_shared',
                recipe_id: this.recipeId,
                from_user_id: ownerProfileId,
                leido: false
            }));

            await window.supabaseClient
                .from('notifications')
                .insert(notifications);

            window.showSnackbar(`✅ Compartido con ${names}`, 4000);

            // Si estamos en la vista de compartidos, recargar
            if (window.dashboard && window.dashboard.currentView === 'shared') {
                window.dashboard.fetchCompartidas();
            }

            if (recipe && window.notificationManager) {
                window.notificationManager.simulateNotificationReceived(recipe, permissionValue);
            }

            window.showSnackbar(`✅ Compartido con ${names}`, 4000);

            // Pequeño retraso antes de cerrar para que el usuario lea el mensaje o vea el estado
            setTimeout(() => {
                this.close();
                window.setButtonLoading(btnShare, false);
            }, 800);

        } catch (error) {
            console.error('Error compartiendo:', error);
            window.showSnackbar('Error al compartir la receta', 4000);
            window.setButtonLoading(btnShare, false);
        }
    }

    copyLink() {
        if (!this.recipeId) return;

        const url = `${window.location.origin}/recipe-detail.html?id=${this.recipeId}`;
        const btnText = this.btnCopy.querySelector('.btn-text');
        const originalText = "Copiar enlace";

        navigator.clipboard.writeText(url).then(() => {
            this.btnCopy.classList.add('copied');
            if (btnText) btnText.textContent = "✅ Enlace copiado";

            setTimeout(() => {
                this.btnCopy.classList.remove('copied');
                if (btnText) btnText.textContent = originalText;
            }, 2000);
        });
    }
}

// Inicializar
window.addEventListener('DOMContentLoaded', () => {
    window.shareModal = new ShareModalManager();
});
