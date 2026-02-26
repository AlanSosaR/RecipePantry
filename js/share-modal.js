/**
 * ShareModalManager - Recipe Pantry
 * Maneja la lógica del modal de compartir y administración de permisos
 * Flujo: Buscar → Seleccionar (chips) → Compartir (botón)
 */
class ShareModalManager {
    constructor() {
        this.recipeId = null;
        this.selectedUsers = []; // {id, name, email}
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

        // Botón compartir
        if (this.btnShare) {
            this.btnShare.addEventListener('click', () => this.submitShare());
        }

        // Cerrar modal al hacer clic fuera
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
    }

    async open(recipeId) {
        this.recipeId = recipeId;
        this.selectedUsers = [];
        this.modal.classList.remove('hidden');

        // Reset UI
        if (this.searchInput) this.searchInput.value = '';
        if (this.suggestionsContainer) this.suggestionsContainer.classList.add('hidden');
        this.renderChips();
        this.updateShareButton();

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

                this.currentShares = this.currentShares.filter(s => s.id !== shareId);
                this.renderShares();
                window.utils.showToast('Acceso eliminado', 'success');
            } else {
                const { error } = await window.supabaseClient
                    .from('shared_recipes')
                    .update({ permission: newPermiso })
                    .eq('id', shareId);

                if (error) throw error;

                const share = this.currentShares.find(s => s.id === shareId);
                if (share) share.permission = newPermiso;

                window.utils.showToast('Permiso actualizado', 'success');
            }
        } catch (err) {
            console.error('Error updating permission:', err);
            window.utils.showToast('Error al actualizar permiso', 'error');
            this.loadExistingShares();
        }
    }

    close() {
        this.modal.classList.add('hidden');
        this.selectedUsers = [];
        this.renderChips();
        this.updateShareButton();
    }

    // --- Search Logic ---
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

            if (!users || users.length === 0) {
                this.suggestionsContainer.innerHTML = '<div style="padding:16px; opacity:0.6; font-size:12px;">No se encontraron usuarios</div>';
                return;
            }

            // Separate already-shared users from available ones
            const alreadyShared = [];
            const available = [];

            for (const u of users) {
                const isShared = this.currentShares.some(s => s.recipient?.id === u.id);
                const isSelected = this.selectedUsers.some(s => s.id === u.id);
                if (isShared) {
                    alreadyShared.push(u);
                } else if (isSelected) {
                    // Already selected as chip, show as selected
                    alreadyShared.push({ ...u, _isSelected: true });
                } else {
                    available.push(u);
                }
            }

            this.renderSuggestions(available, alreadyShared);
        } catch (err) {
            this.suggestionsContainer.innerHTML = '<div style="padding:16px; color:red; font-size:12px;">Error al buscar</div>';
        }
    }

    renderSuggestions(available, alreadyShared = []) {
        let html = '';

        // Render available users (clickable to add as chip)
        html += available.map(user => {
            const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
            return `
                <div class="suggestion-item" onclick="window.shareModal.addUser('${user.id}', '${name.replace(/'/g, "\\'")}', '${user.email}')">
                    <div class="suggestion-avatar">${name[0]}</div>
                    <div class="suggestion-info">
                        <span class="suggestion-name">${name}</span>
                        <span class="suggestion-email">${user.email}</span>
                    </div>
                </div>
            `;
        }).join('');

        // Render already-shared or already-selected users with badge
        html += alreadyShared.map(user => {
            const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
            const badgeText = user._isSelected
                ? `✅ Seleccionado para compartir`
                : `✅ Ya compartiste esta receta con ${name}`;
            return `
                <div class="suggestion-item" style="opacity:0.6; cursor:default; pointer-events:none;">
                    <div class="suggestion-avatar">${name[0]}</div>
                    <div class="suggestion-info">
                        <span class="suggestion-name">${name}</span>
                        <span class="suggestion-email" style="color:#10B981; font-weight:600;">${badgeText}</span>
                    </div>
                </div>
            `;
        }).join('');

        if (!html) {
            html = '<div style="padding:16px; opacity:0.6; font-size:12px;">No se encontraron usuarios</div>';
        }

        this.suggestionsContainer.innerHTML = html;
    }

    // --- Chip-based selection ---
    addUser(userId, name, email) {
        // Don't add duplicates
        if (this.selectedUsers.some(u => u.id === userId)) return;

        this.selectedUsers.push({ id: userId, name, email });

        // Clear search
        if (this.searchInput) this.searchInput.value = '';
        if (this.suggestionsContainer) this.suggestionsContainer.classList.add('hidden');

        this.renderChips();
        this.updateShareButton();
    }

    removeUser(userId) {
        this.selectedUsers = this.selectedUsers.filter(u => u.id !== userId);
        this.renderChips();
        this.updateShareButton();
    }

    renderChips() {
        if (!this.chipsContainer) return;

        if (this.selectedUsers.length === 0) {
            this.chipsContainer.innerHTML = '';
            this.chipsContainer.style.display = 'none';
            return;
        }

        this.chipsContainer.style.display = 'flex';
        this.chipsContainer.innerHTML = this.selectedUsers.map(user => `
            <div class="share-chip" style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; background:rgba(16,185,129,0.15); border:1px solid #10B981; border-radius:99px; font-size:13px; font-weight:600; color:#10B981;">
                <span>${user.name}</span>
                <button onclick="window.shareModal.removeUser('${user.id}')" style="background:none; border:none; color:#10B981; cursor:pointer; font-size:16px; padding:0; line-height:1; display:flex; align-items:center;">×</button>
            </div>
        `).join('');
    }

    updateShareButton() {
        if (!this.btnShare) return;
        if (this.selectedUsers.length > 0) {
            this.btnShare.style.display = 'flex';
            const names = this.selectedUsers.map(u => u.name).join(', ');
            this.btnShare.textContent = `Compartir con ${names}`;
        } else {
            this.btnShare.style.display = 'none';
        }
    }

    // --- Submit: share with all selected users ---
    async submitShare() {
        if (this.selectedUsers.length === 0) return;

        const btn = this.btnShare;
        const originalText = btn.textContent;
        btn.textContent = 'Compartiendo...';
        btn.disabled = true;

        try {
            const currentUserId = window.authManager.currentUser.id;
            const inserts = this.selectedUsers.map(user => ({
                recipe_id: this.recipeId,
                owner_user_id: currentUserId,
                recipient_user_id: user.id,
                permission: 'permanent',
                status: 'pending'
            }));

            const { error: shareError } = await window.supabaseClient
                .from('shared_recipes')
                .insert(inserts);

            if (shareError) {
                if (shareError.code === '23505') {
                    window.utils.showToast('Algunos usuarios ya tienen acceso a esta receta.', 'info');
                } else {
                    throw shareError;
                }
            }

            // Create notifications for each recipient
            const notifications = this.selectedUsers.map(user => ({
                user_id: user.id,
                from_user_id: currentUserId,
                recipe_id: this.recipeId,
                leido: false,
                type: 'recipe_shared'
            }));

            await window.supabaseClient.from('notifications').insert(notifications);

            const names = this.selectedUsers.map(u => u.name).join(', ');
            const successMsg = window.i18n ? window.i18n.t('sharedWith', { names }) : `✅ Compartido con ${names}`;
            window.utils.showToast(successMsg, 'success');

            // Reset chips and refresh shares list
            this.selectedUsers = [];
            this.renderChips();
            this.updateShareButton();
            await this.loadExistingShares();

        } catch (err) {
            console.error('Share Error:', err);
            window.utils.showToast('Error al compartir la receta', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
            this.updateShareButton();
        }
    }
}

// Inicializar
window.addEventListener('DOMContentLoaded', () => {
    window.shareModal = new ShareModalManager();
});
