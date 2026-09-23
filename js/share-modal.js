/**
 * ShareModalManager - Recipe Pantry
 * Modal de Compartir idéntico a Dropbox (Screenshots).
 * Permite buscar usuarios por correo o nombre con autocompletado y tolerancia a errores,
 * selector de permiso "pueden ver" / "pueden editar", mensaje opcional y lista de colaboradores.
 */
class ShareModalManager {
    constructor() {
        this.targetId = null; // recipeId o folderName
        this.targetType = 'recipe'; // 'recipe' | 'folder'
        this.selectedUsers = []; // [{ id, name, email, prefix, avatar_url }]
        this.allUsers = []; // Cache local de usuarios de Supabase
        this.currentShares = [];
        this.selectedPermission = 'view_and_copy'; // 'view' | 'view_and_copy' (default "pueden editar")
        this.searchTimeout = null;

        this.init();
    }

    init() {
        this.modal = document.getElementById('share-modal');
        this.searchInput = document.getElementById('user-search-input');
        this.suggestionsContainer = document.getElementById('search-suggestions');
        this.chipsContainer = document.getElementById('selected-users-chips');
        this.btnShare = document.getElementById('btn-share-submit');
        this.sharesList = document.getElementById('current-shares-list');
        this.sharesCount = document.getElementById('current-shares-count');
        this.messageInput = document.getElementById('share-message-input');

        if (!this.modal) return;

        // Búsqueda en tiempo real con debounce
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                const query = e.target.value;
                this.searchTimeout = setTimeout(() => this.handleSearch(query), 120);
            });

            // Al hacer clic o focus en el input, mostrar sugerencias si está vacío o con texto
            this.searchInput.addEventListener('focus', () => {
                this.handleSearch(this.searchInput.value);
            });
        }

        // Cerrar sugerencias o dropdown de permisos al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropbox-share-row')) {
                this.hideSuggestions();
            }
            if (!e.target.closest('.dropbox-perm-picker')) {
                this.closePermDropdown();
            }
        });

        // Cerrar modal al hacer clic en el backdrop
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Cerrar con Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
                this.close();
            }
        });
    }

    async loadAllUsers() {
        try {
            if (!window.supabaseClient) return;
            const { data: users, error } = await window.supabaseClient
                .from('users')
                .select('id, auth_user_id, email, first_name, last_name, prefix, avatar_url')
                .order('first_name', { ascending: true });

            if (error) throw error;
            const myAuthId = window.authManager?.currentUser?.auth_user_id;
            const myId = window.authManager?.currentUser?.id;

            // Filtrar al propio usuario actual
            this.allUsers = (users || []).filter(u => u.id !== myId && u.auth_user_id !== myAuthId);
        } catch (err) {
            console.error('Error loading users for share modal:', err);
        }
    }

    async open(targetId, targetType = 'recipe') {
        this.targetId = targetId;
        this.targetType = targetType;
        this.selectedUsers = [];
        this.selectedPermission = 'view_and_copy';

        if (!this.modal) return;
        this.modal.classList.remove('hidden');

        // Reset UI
        if (this.searchInput) this.searchInput.value = '';
        if (this.messageInput) this.messageInput.value = '';
        this.hideSuggestions();
        this.closePermDropdown();
        this.renderChips();
        this.updateShareButton();
        this.selectPermission('view_and_copy');

        // Cerrar drawer de colaboradores al abrir
        const drawer = document.getElementById('collaboratorsDrawer');
        const chevron = document.getElementById('collaboratorsChevron');
        if (drawer) drawer.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';

        // Títulos e información del header estilo Dropbox
        const titleElem = document.getElementById('dropbox-share-title');
        const subElem = document.getElementById('dropbox-share-target-name');
        const iconElem = document.getElementById('dropbox-share-type-icon');
        const myMiniAvatar = document.getElementById('myMiniAvatar');

        const myUser = window.authManager?.currentUser;
        const myInitial = (myUser?.first_name?.[0] || myUser?.email?.[0] || 'A').toUpperCase();
        if (myMiniAvatar) myMiniAvatar.textContent = myInitial;

        if (this.targetType === 'folder') {
            if (titleElem) titleElem.textContent = 'Compartir carpeta';
            if (iconElem) iconElem.textContent = 'folder';
            const folderRecipes = (window.dashboard?.currentRecipes || []).filter(
                r => (r.pantry_es || '').trim().toLowerCase() === String(targetId).toLowerCase()
            );
            const count = folderRecipes.length;
            if (subElem) subElem.textContent = `${targetId} • ${count} ${count === 1 ? 'elemento' : 'elementos'}`;
        } else {
            const recipe = window.dashboard?.currentRecipes?.find(r => r.id === targetId);
            const recipeName = recipe ? (recipe.name_es || recipe.name_en || 'Receta') : 'Receta';
            if (titleElem) titleElem.textContent = 'Compartir receta';
            if (iconElem) iconElem.textContent = 'description';
            if (subElem) subElem.textContent = `${recipeName} • 1 elemento`;
        }

        // Cargar usuarios en caché de manera asíncrona
        await this.loadAllUsers();

        // Cargar personas con acceso
        await this.loadExistingShares();
    }

    close() {
        if (!this.modal) return;
        this.modal.classList.add('hidden');
        this.selectedUsers = [];
        this.hideSuggestions();
        this.closePermDropdown();
        this.renderChips();
        this.updateShareButton();
    }

    // --- Selector de Permisos Dropdown estilo Dropbox ---
    togglePermDropdown(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        const menu = document.getElementById('permDropdownMenu');
        if (menu) menu.classList.toggle('hidden');
    }

    closePermDropdown() {
        const menu = document.getElementById('permDropdownMenu');
        if (menu) menu.classList.add('hidden');
    }

    selectPermission(type) {
        this.selectedPermission = type;
        const label = document.getElementById('currentPermLabel');
        const checkView = document.getElementById('checkPermView');
        const checkEdit = document.getElementById('checkPermEdit');
        const optView = document.getElementById('permOptionView');
        const optEdit = document.getElementById('permOptionEdit');

        if (label) {
            label.textContent = type === 'view' ? 'pueden ver' : 'pueden editar';
        }
        if (checkView) checkView.textContent = type === 'view' ? '✓' : '';
        if (checkEdit) checkEdit.textContent = type === 'view_and_copy' ? '✓' : '';
        if (optView) optView.classList.toggle('active', type === 'view');
        if (optEdit) optEdit.classList.toggle('active', type === 'view_and_copy');

        this.closePermDropdown();
    }

    toggleCollaboratorsList() {
        const drawer = document.getElementById('collaboratorsDrawer');
        const chevron = document.getElementById('collaboratorsChevron');
        if (!drawer) return;
        const isHidden = drawer.classList.contains('hidden');
        if (isHidden) {
            drawer.classList.remove('hidden');
            if (chevron) chevron.style.transform = 'rotate(90deg)';
        } else {
            drawer.classList.add('hidden');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
    }

    hideSuggestions() {
        if (this.suggestionsContainer) {
            this.suggestionsContainer.classList.add('hidden');
            this.suggestionsContainer.innerHTML = '';
        }
    }

    // --- Búsqueda Inteligente de Usuarios ---
    normalizeText(str) {
        return (str || '')
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    isMatch(user, queryNorm) {
        if (!queryNorm) return true;
        const firstName = this.normalizeText(user.first_name);
        const lastName = this.normalizeText(user.last_name);
        const fullName = `${firstName} ${lastName}`.trim();
        const email = this.normalizeText(user.email);

        // 1. Coincidencia directa
        if (fullName.includes(queryNorm) || email.includes(queryNorm)) return true;

        // 2. Tolerancia a vocales intercambiables (ej. wildri vs wildryn)
        const qYtoI = queryNorm.replace(/y/g, 'i');
        const qItoY = queryNorm.replace(/i/g, 'y');
        if (fullName.includes(qItoY) || fullName.includes(qYtoI)) return true;
        if (email.includes(qItoY) || email.includes(qYtoI)) return true;

        // 3. Prefijo común
        if (queryNorm.length >= 3) {
            const prefix = queryNorm.substring(0, 3);
            if (firstName.startsWith(prefix) || lastName.startsWith(prefix) || email.startsWith(prefix)) {
                return true;
            }
        }

        return false;
    }

    async handleSearch(query) {
        if (!this.suggestionsContainer) return;

        if (!this.allUsers || this.allUsers.length === 0) {
            await this.loadAllUsers();
        }

        const qNorm = this.normalizeText(query);
        const filtered = (this.allUsers || []).filter(u => this.isMatch(u, qNorm));

        this.renderSuggestions(filtered, qNorm);
    }

    renderSuggestions(users, query) {
        if (!this.suggestionsContainer) return;

        if (!users || users.length === 0) {
            this.suggestionsContainer.innerHTML = `
                <div style="padding: 14px 16px; text-align: center; color: #9ca3af; font-size: 13px;">
                    No se encontraron usuarios para "<strong>${query.replace(/</g, '&lt;')}</strong>"
                </div>
            `;
            this.suggestionsContainer.classList.remove('hidden');
            return;
        }

        const html = users.map(user => {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Usuario';
            const prefix = user.prefix || 'Chef';
            const initials = (user.first_name?.[0] || fullName[0] || 'U').toUpperCase();
            const isShared = this.currentShares.some(s => s.recipient?.id === user.id);
            const isSelected = this.selectedUsers.some(u => u.id === user.id);

            const avatarContent = user.avatar_url 
                ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                : initials;

            if (isShared) {
                return `
                    <div class="suggestion-item is-disabled" title="Ya tiene acceso">
                        <div class="suggestion-avatar">${avatarContent}</div>
                        <div class="suggestion-info">
                            <span class="suggestion-name">${prefix} ${fullName}</span>
                            <span class="suggestion-email">${user.email}</span>
                        </div>
                        <span class="suggestion-badge badge-shared">Ya tiene acceso</span>
                    </div>
                `;
            }

            if (isSelected) {
                return `
                    <div class="suggestion-item is-selected" onclick="window.shareModal.removeUser('${user.id}')" title="Clic para quitar">
                        <div class="suggestion-avatar">${avatarContent}</div>
                        <div class="suggestion-info">
                            <span class="suggestion-name">${prefix} ${fullName}</span>
                            <span class="suggestion-email">${user.email}</span>
                        </div>
                        <span class="suggestion-badge badge-selected">✓ Seleccionado</span>
                    </div>
                `;
            }

            const safeName = fullName.replace(/'/g, "\\'");
            const safeEmail = (user.email || '').replace(/'/g, "\\'");
            const safePrefix = prefix.replace(/'/g, "\\'");
            const safeAvatar = (user.avatar_url || '').replace(/'/g, "\\'");

            return `
                <div class="suggestion-item" onclick="window.shareModal.addUser('${user.id}', '${safeName}', '${safeEmail}', '${safePrefix}', '${safeAvatar}')">
                    <div class="suggestion-avatar">${avatarContent}</div>
                    <div class="suggestion-info">
                        <span class="suggestion-name">${prefix} ${fullName}</span>
                        <span class="suggestion-email">${user.email}</span>
                    </div>
                    <span class="material-symbols-outlined suggestion-add-icon">add</span>
                </div>
            `;
        }).join('');

        this.suggestionsContainer.innerHTML = html;
        this.suggestionsContainer.classList.remove('hidden');
    }

    // --- Chips (Usuarios seleccionados) ---
    addUser(userId, name, email, prefix, avatarUrl) {
        if (this.selectedUsers.some(u => u.id === userId)) return;

        this.selectedUsers.push({
            id: userId,
            name: name,
            email: email,
            prefix: prefix || 'Chef',
            avatar_url: avatarUrl || ''
        });

        if (this.searchInput) this.searchInput.value = '';
        this.hideSuggestions();
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
        this.chipsContainer.innerHTML = this.selectedUsers.map(user => {
            const initials = (user.name?.[0] || 'U').toUpperCase();
            return `
                <div class="dropbox-chip">
                    <span class="dropbox-chip-avatar">${initials}</span>
                    <span class="dropbox-chip-name">${user.name}</span>
                    <button type="button" class="dropbox-chip-remove" onclick="event.stopPropagation(); window.shareModal.removeUser('${user.id}')" title="Quitar">×</button>
                </div>
            `;
        }).join('');
    }

    updateShareButton() {
        if (!this.btnShare) return;
        const count = this.selectedUsers.length;

        if (count > 0) {
            this.btnShare.disabled = false;
            this.btnShare.classList.add('ready');
            this.btnShare.textContent = 'Compartir';
        } else {
            this.btnShare.disabled = true;
            this.btnShare.classList.remove('ready');
            this.btnShare.textContent = 'Compartir';
        }
    }

    // --- Personas con Acceso Existentes ---
    async loadExistingShares() {
        if (!this.sharesList) return;
        this.sharesList.innerHTML = '<div style="text-align:center; padding: 12px; color: #8e8e8e; font-size: 13px;">Cargando personas...</div>';

        try {
            let shares = [];
            if (this.targetType === 'folder') {
                const folderRecipes = (window.dashboard?.currentRecipes || []).filter(
                    r => (r.pantry_es || '').trim().toLowerCase() === String(this.targetId).toLowerCase()
                );
                const recipeIds = folderRecipes.map(r => r.id);

                if (recipeIds.length > 0 && window.supabaseClient) {
                    const { data, error } = await window.supabaseClient
                        .from('shared_recipes')
                        .select(`
                            id,
                            permission,
                            recipient:recipient_user_id (
                                id,
                                first_name,
                                last_name,
                                email,
                                avatar_url,
                                prefix
                            )
                        `)
                        .in('recipe_id', recipeIds);

                    if (!error && data) {
                        const map = new Map();
                        data.forEach(s => {
                            if (s.recipient?.id && !map.has(s.recipient.id)) {
                                map.set(s.recipient.id, s);
                            }
                        });
                        shares = Array.from(map.values());
                    }
                }
            } else {
                if (window.supabaseClient && this.targetId) {
                    const { data, error } = await window.supabaseClient
                        .from('shared_recipes')
                        .select(`
                            id,
                            permission,
                            recipient:recipient_user_id (
                                id,
                                first_name,
                                last_name,
                                email,
                                avatar_url,
                                prefix
                            )
                        `)
                        .eq('recipe_id', this.targetId);

                    if (!error && data) {
                        shares = data;
                    }
                }
            }

            this.currentShares = shares || [];
            this.renderShares();

        } catch (err) {
            console.error('Error loading existing shares:', err);
            this.sharesList.innerHTML = '<div style="color: #ef4444; font-size: 13px; text-align: center; padding: 10px;">Error al cargar personas con acceso.</div>';
        }
    }

    renderShares() {
        if (!this.sharesList) return;
        const count = this.currentShares.length;
        if (this.sharesCount) this.sharesCount.textContent = count;

        if (count === 0) {
            this.sharesList.innerHTML = `
                <div class="no-shares-box">
                    <span class="material-symbols-outlined" style="font-size: 20px; color: #52525b;">group_off</span>
                    <span>Nadie tiene acceso aún.</span>
                </div>
            `;
            return;
        }

        this.sharesList.innerHTML = this.currentShares.map(share => {
            const user = share.recipient;
            if (!user) return '';
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Usuario';
            const initials = (user.first_name?.[0] || fullName[0] || 'U').toUpperCase();
            const permLabel = share.permission === 'view_and_copy' ? 'pueden editar' : 'pueden ver';

            const avatarContent = user.avatar_url 
                ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                : initials;

            return `
                <div class="share-row" id="share-row-${share.id}">
                    <div class="share-avatar">${avatarContent}</div>
                    <div class="share-info">
                        <span class="share-name">${user.prefix || 'Chef'} ${fullName}</span>
                        <span class="share-email">${user.email || ''}</span>
                    </div>
                    <div class="share-actions">
                        <span class="permission-tag">${permLabel}</span>
                        <button type="button" class="btn-remove-access" onclick="window.shareModal.changePermission('${share.id}', 'remove')" title="Quitar acceso">
                            Quitar
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async changePermission(shareId, newPermiso) {
        try {
            if (newPermiso === 'remove') {
                if (window.supabaseClient) {
                    await window.supabaseClient.from('shared_recipes').delete().eq('id', shareId);
                }
                this.currentShares = this.currentShares.filter(s => s.id !== shareId);
                this.renderShares();
                if (window.utils?.showToast) {
                    window.utils.showToast('Acceso eliminado', 'success');
                } else if (window.showToast) {
                    window.showToast('Acceso eliminado', 'success');
                }
            }
        } catch (err) {
            console.error('Error changing permission:', err);
            if (window.showToast) window.showToast('Error al actualizar permiso', 'error');
        }
    }

    // --- Enviar Compartir ---
    async submitShare() {
        if (this.selectedUsers.length === 0) return;

        const btn = this.btnShare;
        const originalText = btn ? btn.textContent : 'Compartir';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Compartiendo...';
        }

        try {
            const currentUserId = window.authManager?.currentUser?.id;
            const permission = this.selectedPermission || 'view_and_copy';
            const optionalMessage = (this.messageInput?.value || '').trim();

            let recipeIds = [];
            if (this.targetType === 'folder') {
                const folderRecipes = (window.dashboard?.currentRecipes || []).filter(
                    r => (r.pantry_es || '').trim().toLowerCase() === String(this.targetId).toLowerCase()
                );
                recipeIds = folderRecipes.map(r => r.id);
            } else if (this.targetId) {
                recipeIds = [this.targetId];
            }

            if (recipeIds.length > 0 && window.supabaseClient && currentUserId) {
                const inserts = [];
                const notifications = [];

                for (const user of this.selectedUsers) {
                    for (const rId of recipeIds) {
                        inserts.push({
                            recipe_id: rId,
                            owner_user_id: currentUserId,
                            recipient_user_id: user.id,
                            permission: permission,
                            status: 'pending'
                        });
                        notifications.push({
                            user_id: user.id,
                            from_user_id: currentUserId,
                            recipe_id: rId,
                            leido: false,
                            type: 'recipe_shared',
                            metadata: optionalMessage ? { message: optionalMessage } : {}
                        });
                    }
                }

                if (inserts.length > 0) {
                    const { error } = await window.supabaseClient.from('shared_recipes').insert(inserts);
                    if (error && error.code !== '23505') throw error;
                }

                if (notifications.length > 0) {
                    await window.supabaseClient.from('notifications').insert(notifications);
                }
            }

            const names = this.selectedUsers.map(u => `${u.prefix} ${u.name}`).join(', ');
            const successMsg = this.targetType === 'folder' 
                ? `✅ Carpeta "${this.targetId}" compartida con ${names}`
                : `✅ Compartido con ${names}`;

            if (window.utils?.showToast) {
                window.utils.showToast(successMsg, 'success');
            } else if (window.showToast) {
                window.showToast(successMsg, 'success');
            }

            // Limpiar y cerrar
            this.selectedUsers = [];
            if (this.searchInput) this.searchInput.value = '';
            if (this.messageInput) this.messageInput.value = '';
            this.renderChips();
            this.updateShareButton();
            this.close();

        } catch (err) {
            console.error('Error submitting share:', err);
            if (window.showToast) window.showToast('Error al compartir', 'error');
        } finally {
            if (btn) {
                btn.textContent = originalText;
                this.updateShareButton();
            }
        }
    }

    shareWithSelected() {
        return this.submitShare();
    }
}

// Inicializar y registrar globalmente
window.addEventListener('DOMContentLoaded', () => {
    window.shareModal = new ShareModalManager();
});
