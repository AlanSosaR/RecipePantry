/**
 * ShareModalManager - Recipe Pantry
 * Maneja la lógica del modal de compartir y administración de permisos
 */
class ShareModalManager {
    constructor() {
        this.recipeId = null;
        this.selectedUsers = [];
        this.searchTimeout = null;
        this.currentShares = [];

        this.init();
    }

    init() {
        this.modal = document.getElementById('share-modal');
        this.searchInput = document.getElementById('user-search-input');
        this.suggestionsContainer = document.getElementById('search-suggestions');
        this.chipsContainer = document.getElementById('selected-users-chips');
        this.btnShare = document.getElementById('btn-share-submit');
        this.sharesList = document.getElementById('shares-list');

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
                this.searchTimeout = setTimeout(() => this.handleSearch(value), 300);
            });
        }

        // Cerrar modal al hacer clic fuera
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
    }

    async open(recipeId) {
        this.recipeId = recipeId;
        this.selectedUsers = [];
        this.renderChips();
        this.updateShareButton();
        this.modal.classList.remove('hidden');

        // Reset UI
        if (this.searchInput) this.searchInput.value = '';
        if (this.suggestionsContainer) this.suggestionsContainer.classList.add('hidden');

        // Load existing shares
        await this.loadExistingShares();

        this.currentRecipe = window.dashboard ? window.dashboard.currentRecipes.find(r => r.id === recipeId) : null;
        if (this.currentRecipe) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const recipeName = isEn ? (this.currentRecipe.name_en || this.currentRecipe.name_es) : this.currentRecipe.name_es;
            document.getElementById('share-modal-title').textContent = window.i18n ? window.i18n.t('managePermsTitle', { recipe: recipeName }) : `Administrar permisos — ${recipeName}`;
            document.getElementById('share-modal-size').textContent = "";
        }
    }

    async loadExistingShares() {
        if (!this.sharesList) return;
        this.sharesList.innerHTML = '<div style="text-align:center; padding:12px; opacity:0.6;">Cargando personas...</div>';

        try {
            const { data: shares, error } = await window.supabaseClient
                .from('shared_recipes')
                .select(`
                    id,
                    permission,
                    recipient:recipient_user_id (
                        id,
                        first_name,
                        last_name,
                        email
                    )
                `)
                .eq('recipe_id', this.recipeId);

            if (error) throw error;

            this.currentShares = shares || [];
            this.renderShares();

        } catch (err) {
            console.error('Error loading shares:', err);
            this.sharesList.innerHTML = '<div class="no-shares-msg">Error al cargar personas con acceso.</div>';
        }
    }

    renderShares() {
        if (!this.sharesList) return;

        if (this.currentShares.length === 0) {
            this.sharesList.innerHTML = '<p class="no-shares-msg">Aún no has compartido esta receta con nadie.</p>';
            return;
        }

        const isEn = window.i18n && window.i18n.getLang() === 'en';

        this.sharesList.innerHTML = this.currentShares.map(share => {
            const user = share.recipient;
            if (!user) return '';
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Usuario';
            const initials = (user.first_name?.[0] || '') + (fullName.split(' ').pop()?.[0] || '');

            return `
                <div class="share-row" id="share-row-${share.id}">
                    <div class="share-avatar">${initials}</div>
                    <div class="share-info">
                        <span class="share-name">${fullName}</span>
                        <span class="share-email">${user.email}</span>
                    </div>
                    <select class="share-perm-select" onchange="window.shareModal.changePermission('${share.id}', this.value)">
                        <option value="view" ${share.permission === 'view' ? 'selected' : ''}>👁️ Solo ver</option>
                        <option value="view_and_copy" ${share.permission === 'view_and_copy' ? 'selected' : ''}>📋 Puede copiar</option>
                        <option value="remove">🚫 Eliminar acceso</option>
                    </select>
                </div>
            `;
        }).join('');
    }

    async changePermission(shareId, newPermiso) {
        try {
            if (newPermiso === 'remove') {
                const { error } = await window.supabaseClient
                    .from('shared_recipes')
                    .delete()
                    .eq('id', shareId);

                if (error) throw error;

                // Remove from UI
                this.currentShares = this.currentShares.filter(s => s.id !== shareId);
                this.renderShares();
                window.utils.showToast('Acceso eliminado', 'success');
            } else {
                const { error } = await window.supabaseClient
                    .from('shared_recipes')
                    .update({ permission: newPermiso })
                    .eq('id', shareId);

                if (error) throw error;

                // Update local state
                const share = this.currentShares.find(s => s.id === shareId);
                if (share) share.permission = newPermiso;

                window.utils.showToast('Permiso actualizado', 'success');
            }
        } catch (err) {
            console.error('Error updating permission:', err);
            window.utils.showToast('Error al actualizar permiso', 'error');
            this.loadExistingShares(); // Reload to fix UI
        }
    }

    close() {
        this.modal.classList.add('hidden');
    }

    // --- Search and Add Logic (Simplified but functional) ---
    async handleSearch(query) {
        if (!this.suggestionsContainer) return;
        this.suggestionsContainer.classList.remove('hidden');
        this.suggestionsContainer.innerHTML = '<div style="padding:16px; opacity:0.6; font-size:12px;">Buscando...</div>';

        try {
            const { data: users, error } = await window.supabaseClient
                .rpc('search_users', {
                    query: query,
                    current_auth_user_id: window.authManager.currentUser?.auth_user_id || null
                });

            if (error) throw error;

            // Filter already shared or selected
            const filtered = (users || []).filter(u =>
                !this.selectedUsers.some(s => s.id === u.id) &&
                !this.currentShares.some(s => s.recipient?.id === u.id)
            );

            this.renderSuggestions(filtered);
        } catch (err) {
            this.suggestionsContainer.innerHTML = '<div style="padding:16px; color:red; font-size:12px;">Error al buscar</div>';
        }
    }

    renderSuggestions(users) {
        if (users.length === 0) {
            this.suggestionsContainer.innerHTML = '<div style="padding:16px; opacity:0.6; font-size:12px;">No se encontraron usuarios</div>';
            return;
        }

        this.suggestionsContainer.innerHTML = users.map(user => {
            const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
            return `
                <div class="suggestion-item" onclick="window.shareModal.addUser('${user.id}', '${name}', '${user.email}')">
                    <div class="suggestion-avatar">${name[0]}</div>
                    <div class="suggestion-info">
                        <span class="suggestion-name">${name}</span>
                        <span class="suggestion-email">${user.email}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    addUser(userId, name, email) {
        this.selectedUsers.push({ id: userId, name, email });
        this.renderChips();
        this.updateShareButton();
        this.searchInput.value = '';
        this.suggestionsContainer.classList.add('hidden');
    }

    removeUser(userId) {
        this.selectedUsers = this.selectedUsers.filter(u => u.id !== userId);
        this.renderChips();
        this.updateShareButton();
    }

    renderChips() {
        if (!this.chipsContainer) return;
        this.chipsContainer.innerHTML = this.selectedUsers.map(u => `
            <div class="user-chip">
                <span>${u.name}</span>
                <span class="material-symbols-outlined remove-chip" onclick="window.shareModal.removeUser('${u.id}')">close</span>
            </div>
        `).join('');
    }

    updateShareButton() {
        if (this.btnShare) this.btnShare.disabled = this.selectedUsers.length === 0;
    }

    async share() {
        if (this.selectedUsers.length === 0) return;
        const permission = document.querySelector('input[name="share-permission"]:checked')?.value || 'view';
        const dbPerm = permission === 'add' ? 'view_and_copy' : 'view';

        try {
            const insertions = this.selectedUsers.map(user => ({
                recipe_id: this.recipeId,
                owner_user_id: window.authManager.currentUser.id,
                recipient_user_id: user.id,
                permission: dbPerm,
                status: 'pending'
            }));

            const { error: shareError } = await window.supabaseClient.from('shared_recipes').insert(insertions);
            if (shareError) throw shareError;

            // 2. Crear notificaciones para que aparezcan en tiempo real al destinatario
            const notifications = this.selectedUsers.map(user => ({
                user_id: user.id, // El destinatario (quien recibe la campana)
                from_user_id: window.authManager.currentUser.id, // El dueño (tú)
                recipe_id: this.recipeId,
                leido: false,
                type: 'recipe_shared'
            }));

            console.log('✉️ Intentando crear registros en "notifications":', notifications);

            const { error: notifError } = await window.supabaseClient.from('notifications').insert(notifications);
            if (notifError) {
                console.warn('⚠️ Error al crear notificaciones (detalles):', notifError.message, notifError.details, notifError);
                console.log('💡 Sugerencia: Asegúrate de habilitar la política RLS de INSERT en la tabla notifications.');
            } else {
                console.log('🚀 Notificaciones creadas exitosamente');
            }

            const namesList = this.selectedUsers.map(u => u.name).join(', ');
            const successMsg = window.i18n ? window.i18n.t('sharedWith', { names: namesList }) : `✅ Compartido con ${namesList}`;
            window.utils.showToast(successMsg, 'success');
            this.selectedUsers = [];
            this.renderChips();
            this.updateShareButton();

            // Reload list
            await this.loadExistingShares();
        } catch (err) {
            console.error('Share error:', err);
            window.utils.showToast('Error al compartir', 'error');
        }
    }
}

// Inicializar
window.addEventListener('DOMContentLoaded', () => {
    window.shareModal = new ShareModalManager();
});
