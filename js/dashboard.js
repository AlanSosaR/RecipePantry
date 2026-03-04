// js/dashboard.js
// Lógica específica del Dashboard

class DashboardManager {
    constructor() {
        this.currentFilters = {};
        this.displayMode = localStorage.getItem('recipe_pantry_display_mode') || 'list';
        this.currentView = localStorage.getItem('recipe_pantry_current_view') || 'recipes';
        this.currentRecipes = [];
        this.selectedRecipeId = null;
        this.selectedRecipes = new Set();
        this.isSelectionMode = false;

        // Cierre de menús al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#selectionActionBar') && !e.target.closest('#selectionMoreBtn')) {
                this.hideSelectionMenu();
            }
        });
    }

    async init() {
        try {
            console.log('🚀 Inicializando Recipe Pantry Premium...');

            // 1. Verificar autenticación silenciosamente
            const isAuthenticated = await window.authManager.checkAuth();

            // Inicializar notificaciones en paralelo (no bloquea recetas)
            if (isAuthenticated && window.notificationManager) {
                window.notificationManager.init(); // fire-and-forget
            }

            const landingEl = document.getElementById('landing-section');
            const dashboardEl = document.getElementById('dashboard-app');

            if (!isAuthenticated) {
                console.log('💡 Modo Landing: Usuario no detectado');
                if (landingEl) landingEl.classList.remove('hidden');
                if (dashboardEl) dashboardEl.classList.add('hidden');
                return;
            }

            console.log('✅ Modo Dashboard: Usuario detectado:', window.authManager.currentUser);
            document.documentElement.setAttribute('data-auth-likely', 'true');
            if (landingEl) landingEl.classList.add('hidden');
            if (dashboardEl) dashboardEl.classList.remove('hidden');

            // Actualizar datos de usuario en la UI
            this.updateUserUI();


            // 2. Cargar datos iniciales según la vista guardada o URL
            const urlParams = new URLSearchParams(window.location.search);
            const viewParam = urlParams.get('view');
            if (viewParam && ['recipes', 'favorites', 'shared'].includes(viewParam)) {
                this.currentView = viewParam;
            }
            this.currentOffset = 0;
            if (!this.selectedRecipes) this.selectedRecipes = new Set();
            this.isSelectionMode = false;

            console.log(`📦 Cargando vista: ${this.currentView}...`);
            const activeNavItem = document.querySelector(`.nav-item[data-view="${this.currentView}"]`);
            this.switchView(this.currentView, activeNavItem);

            console.log('✨ Dashboard listo');

            this.setupEventListeners();

            // Check for deep link in hash
            this.checkDeepLink();
        } catch (error) {
            console.error('❌ Error crítico en Dashboard.init:', error);
            const landingEl = document.getElementById('landing-section');
            if (landingEl) landingEl.classList.remove('hidden');
        }
    }

    updateUserUI() {
        if (window.updateGlobalUserUI) {
            window.updateGlobalUserUI();
        }
    }

    setupEventListeners() {
        // Buscador
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let timeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.loadRecipes({ search: e.target.value }), 300);
            });
        }

        // Navegación Sidebar Desktop
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const view = item.dataset.view;
                if (view) {
                    e.preventDefault();
                    this.switchView(view, item);
                    if (window.innerWidth < 1024) {
                        this.toggleSidebar(false);
                    }
                }
            });
        });

        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.toggleSidebar(false));
        }

    }

    toggleSidebar(forceState = null) {
        const sidebar = document.getElementById('main-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (!sidebar || !overlay) return;

        const isOpen = sidebar.classList.contains('active');
        const shouldOpen = forceState !== null ? forceState : !isOpen;

        if (shouldOpen) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    toggleSlimSidebar() {
        if (window.toggleSlimSidebar) {
            window.toggleSlimSidebar();
        } else {
            const sidebar = document.getElementById('main-sidebar');
            if (sidebar) {
                sidebar.classList.toggle('sidebar--slim');
            }
        }
    }

    toggleViewMenu() {
        const menu = document.getElementById('view-mode-menu');
        if (menu) {
            menu.classList.toggle('hidden');
        }
    }

    toggleDetailsSidebar(forceState = null) {
        const sidebar = document.getElementById('details-sidebar');
        if (!sidebar) return;

        const isOpen = sidebar.classList.contains('active');
        const shouldOpen = forceState !== null ? forceState : !isOpen;

        if (shouldOpen) {
            sidebar.classList.add('active');
        } else {
            sidebar.classList.remove('active');
            this.selectedRecipeId = null;
            this.updateSelectionUI();
        }
    }

    switchDisplayMode(mode, element) {
        this.displayMode = mode;
        localStorage.setItem('recipe_pantry_display_mode', mode);

        // Update current view icon in trigger
        const iconSpan = document.getElementById('current-view-icon');
        if (iconSpan) {
            if (mode === 'list') iconSpan.textContent = 'view_list';
            else if (mode === 'grid') iconSpan.textContent = 'grid_view';
            else if (mode === 'grid-large') iconSpan.textContent = 'view_module';
        }

        // Update active state in menu
        document.querySelectorAll('.menu-item-m3').forEach(item => {
            item.classList.remove('active');
        });
        if (element) element.classList.add('active');

        // Close menu
        this.toggleViewMenu();

        this.renderRecipesGrid(this.currentRecipes);
    }

    switchView(view, activeItem) {
        this.currentView = view;

        // Limpiar selección actual si cambia de pestaña
        if (this.selectedRecipes) {
            this.selectedRecipes.clear();
            this.updateActionBar();
        }
        localStorage.setItem('recipe_pantry_current_view', view);

        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        if (activeItem) activeItem.classList.add('active');

        if (view === 'favorites') {
            this.loadRecipes({ favorite: true, orderBy: 'name_es', ascending: true });
        } else if (view === 'recipes') {
            this.loadRecipes({ orderBy: 'name_es', ascending: true });
        } else if (view === 'shared') {
            this.loadRecipes({ shared: true });
        }
    }

    async fetchCompartidas() {
        return this.loadRecipes({ shared: true });
    }

    async loadRecipes(filters = {}) {
        this.lastFilters = filters;
        const result = await window.db.getMyRecipes(filters);

        if (!result.success) {
            console.error('Error cargando recetas:', result.error);
            return;
        }

        this.currentRecipes = result.recipes;

        const titleEl = document.getElementById('view-title');
        if (titleEl) {
            if (filters.search) {
                titleEl.textContent = window.i18n ? window.i18n.t('searchResults', { search: filters.search }) : `Resultados para "${filters.search}"`;
            } else if (filters.favorite) {
                titleEl.textContent = window.i18n ? window.i18n.t('navFavorites') : 'Favoritos';
            } else if (filters.shared) {
                titleEl.textContent = window.i18n ? window.i18n.t('navShared') : 'Compartidas';
            } else {
                titleEl.textContent = window.i18n ? window.i18n.t('myRecipes') : 'Mis Recetas';
            }
        }

        this.renderRecipesGrid(this.currentRecipes);
    }

    // --- Multi-Selection Logic ---
    toggleSelection(recipeId) {
        if (this.selectedRecipes.has(recipeId)) {
            this.selectedRecipes.delete(recipeId);
        } else {
            this.selectedRecipes.add(recipeId);
        }
        this.isSelectionMode = this.selectedRecipes.size > 0;
        this.updateActionBar();
        this.renderRecipesGrid(this.currentRecipes);
    }

    toggleSelectAll(e) {
        const isChecked = e.target.checked;
        if (isChecked) {
            this.currentRecipes.forEach(r => this.selectedRecipes.add(r.id));
        } else {
            this.selectedRecipes.clear();
        }
        this.isSelectionMode = this.selectedRecipes.size > 0;
        this.updateActionBar();
        this.renderRecipesGrid(this.currentRecipes);
    }

    clearSelection() {
        this.selectedRecipes.clear();
        this.isSelectionMode = false;
        this.hideSelectionMenu();
        this.updateActionBar();
        this.renderRecipesGrid(this.currentRecipes);
    }

    updateActionBar() {
        const actionBar = document.getElementById('selectionActionBar');
        const countText = document.getElementById('selectionCount');
        if (!actionBar) return;

        if (this.selectedRecipes.size > 0) {
            actionBar.classList.remove('hidden');
            const count = this.selectedRecipes.size;
            const text = window.i18n && window.i18n.getLang() === 'en'
                ? `${count} selected`
                : `${count} seleccionado${count > 1 ? 's' : ''}`;
            if (countText) countText.textContent = text;
        } else {
            actionBar.classList.add('hidden');
        }
    }

    toggleSelectionMenu(event) {
        if (event) event.stopPropagation();
        const menu = document.getElementById('selectionOverflowMenu');
        const header = document.getElementById('selectionMenuHeader');
        const titleEl = document.getElementById('menuRecipeTitle');
        const subtitleEl = document.getElementById('menuRecipeSubtitle');

        if (!menu) return;

        if (this.selectedRecipes.size === 1) {
            const recipeId = Array.from(this.selectedRecipes)[0];
            const recipe = this.currentRecipes.find(r => r.id === recipeId);
            if (recipe) {
                if (header) header.style.display = 'block';
                if (titleEl) titleEl.textContent = recipe.name;
                if (subtitleEl) {
                    const isShared = recipe.sharingContext === 'sent' || recipe.sharingContext === 'received';
                    subtitleEl.innerHTML = `
                        <span class="material-symbols-outlined" style="font-size:14px;">${isShared ? 'groups' : 'person'}</span>
                        ${isShared ? 'Compartida con...' : 'Solo tú'}
                    `;
                    subtitleEl.style.color = isShared ? '#00A676' : '#aaa';
                }
            }
        } else {
            if (header) header.style.display = 'none';
        }

        menu.classList.toggle('show');
    }

    hideSelectionMenu() {
        const menu = document.getElementById('selectionOverflowMenu');
        if (menu) menu.classList.remove('show');
    }

    // --- Dropbox Selection Bridge Methods ---
    downloadSelected() {
        alert('Funcionalidad de descarga en desarrollo...');
    }

    copyLinkSelected() {
        if (this.selectedRecipes.size === 0) return;
        const recipeId = Array.from(this.selectedRecipes).sort()[0];
        this.copyLink(recipeId);
    }

    editSelected() {
        if (this.selectedRecipes.size === 0) return;
        const recipeId = Array.from(this.selectedRecipes).sort()[0];
        window.location.href = `/recipe-form?id=${recipeId}`;
    }

    renameSelected() {
        if (this.selectedRecipes.size === 0) return;
        const recipeId = Array.from(this.selectedRecipes).sort()[0];
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        const newName = prompt('Ingrese el nuevo nombre:', recipe ? recipe.name : '');
        if (newName && newName.trim()) {
            // Implementation for rename can be added here
            alert('Cambiando nombre a: ' + newName);
        }
    }


    updateSelectAllCheckbox() {
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb && this.currentRecipes.length > 0) {
            // Verificar si todos los visibles están seleccionados
            const allSelected = this.currentRecipes.every(r => this.selectedRecipes.has(r.id));
            selectAllCb.checked = allSelected && this.selectedRecipes.size > 0;
            selectAllCb.indeterminate = this.selectedRecipes.size > 0 && !allSelected;
        }
    }

    async deleteSelected() {
        if (this.selectedRecipes.size === 0) return;
        const confirmMsg = window.i18n && window.i18n.getLang() === 'en'
            ? `Are you sure you want to delete ${this.selectedRecipes.size} recipes?`
            : `¿Seguro que desea eliminar ${this.selectedRecipes.size} recetas?`;

        window.showActionSnackbar(confirmMsg, 'ELIMINAR', async () => {
            window.showToast('Eliminando...', 'info');
            const ids = Array.from(this.selectedRecipes);
            let successCount = 0;

            for (const id of ids) {
                const res = await window.db.deleteRecipe(id);
                if (res.success) successCount++;
            }

            this.clearSelection();
            this.loadRecipes({ forceRefresh: true }); // Reload
            window.showToast(`${successCount} recetas eliminadas`, 'success');
        });
    }

    async favoriteSelected() {
        if (this.selectedRecipes.size === 0) return;
        const ids = Array.from(this.selectedRecipes);

        // Determinar si vamos a marcar o desmarcar (si el primero es fav, desmarcamos todos?)
        // Drive style: Si hay mezcla, usualmente se marcan todos.
        const firstId = ids[0];
        const firstRecipe = this.currentRecipes.find(r => r.id === firstId);
        const newStatus = firstRecipe ? !firstRecipe.is_favorite : true;

        window.showToast(newStatus ? 'Marcando como favoritos...' : 'Quitando de favoritos...', 'info');

        for (const id of ids) {
            await window.db.toggleFavorite(id, !newStatus); // toggleFavorite espera el estado ACTUAL
        }

        this.clearSelection();
        this.loadRecipes({ forceRefresh: true });
    }

    async moveSelected() {
        if (this.selectedRecipes.size === 0) return;

        const categories = [...new Set(this.currentRecipes.map(r => r.category).filter(Boolean))];
        const categoriesStr = categories.join(', ') || 'Principal';

        const newCategory = prompt(
            window.i18n && window.i18n.getLang() === 'en'
                ? `Enter new category (Existing: ${categoriesStr}):`
                : `Ingrese la nueva categoría (Existentes: ${categoriesStr}):`
        );

        if (newCategory) {
            window.showToast('Moviendo recetas...', 'info');
            const ids = Array.from(this.selectedRecipes);
            for (const id of ids) {
                await window.db.updateRecipe(id, { category: newCategory });
            }
            this.clearSelection();
            this.loadRecipes({ forceRefresh: true });
            window.showToast('Recetas movidas con éxito', 'success');
        }
    }

    shareSelected() {
        if (this.selectedRecipes.size === 0) return;
        // Asume que shareModal asume múltiples IDs o simplemente mapea el primero como prueba si el diseño no lo prevé
        const ids = Array.from(this.selectedRecipes);
        if (ids.length === 1) {
            this.shareRecipe(ids[0]);
        } else {
            // Para múltiples, lo ideal sería abrir un modal especial o enviar múltiples links.
            // Puesto que la API de Vercel y el modal actual de compartir están atados a 1 receta a la vez, 
            // podemos simplemente avisar que esta función requiere iterar el modal o iterar los permisos.
            window.showToast('La compartición múltiple abrirá las configuraciones una por una', 'info');
            this.shareRecipe(ids[0]);
            // Podríamos iterar, pero bloquearía la UI. Dejemos el ID [0] como placeholder temporal o implementemos un multi-share
        }
    }
    // ----------------------------

    renderRecipesGrid(recipes) {
        const container = document.getElementById('recipesGrid');
        if (!container) return;

        const emptyState = document.getElementById('emptyState');

        if (recipes.length === 0) {
            container.innerHTML = '';
            if (emptyState) {
                // Actualizar contenido del empty state según la vista
                const imgGroup = document.getElementById('emptyStateImgGroup');
                const icon = document.getElementById('emptyStateIcon');
                const title = document.getElementById('emptyStateTitle');
                const desc = document.getElementById('emptyStateDesc');
                const btn = document.getElementById('emptyStateBtn');

                if (this.currentView === 'shared') {
                    if (imgGroup) imgGroup.innerHTML = '<img src="assets/compartir.svg" style="width: 120px; height: auto; opacity: 0.9; margin: 0 auto; display: block;" alt="Shared">';
                    if (title) {
                        title.textContent = window.i18n ? window.i18n.t('noSharedRecipesTitle') : 'Tu despensa compartida está vacía';
                        title.style.color = '#10B981';
                    }
                    if (desc) {
                        desc.textContent = window.i18n ? window.i18n.t('noSharedRecipesDesc') : 'En Recipe Pantry, cocinar es mejor en compañía. Aquí aparecerán todos los secretos de cocina que otras personas compartan contigo.';
                        desc.style.color = '#000000';
                        desc.style.opacity = '1';
                    }
                    if (btn) btn.classList.add('hidden');
                } else {
                    // Estado por defecto (Mis Recetas / Favoritos)
                    if (imgGroup) imgGroup.innerHTML = '<img src="assets/recipe.svg" style="width: 120px; height: auto; opacity: 0.9; margin: 0 auto; display: block;" alt="Recipes">';
                    if (title) {
                        title.textContent = window.i18n ? window.i18n.t('noRecipesTitle') : 'Tu despensa de recetas está vacía';
                        title.style.color = '#10B981';
                    }
                    if (desc) {
                        desc.textContent = window.i18n ? window.i18n.t('noRecipesDesc') : 'Digitaliza o agrega tus preparaciones favoritas para que nunca se pierdan.';
                        desc.style.color = '#000000';
                        desc.style.opacity = '1';
                    }
                    if (btn) {
                        btn.classList.remove('hidden');
                        // M3 Expressive Green Button styling
                        btn.style.setProperty('--md-filled-button-container-color', '#10B981');
                        btn.style.setProperty('--md-filled-button-label-text-color', 'white');
                        btn.style.setProperty('--md-filled-button-icon-color', 'white');
                        btn.style.marginTop = '24px';
                    }
                }

                emptyState.classList.remove('hidden');
            }
            return;
        }
        if (emptyState) emptyState.classList.add('hidden');

        if (this.displayMode.startsWith('grid')) {
            container.className = `recipes-grid ${this.displayMode === 'grid-large' ? 'grid-view--large' : 'grid-view'}`;
            container.innerHTML = recipes.map(recipe => this.renderRecipeCard(recipe)).join('');
        } else {
            container.className = 'recipes-grid list-view-m3';
            const colName = window.i18n ? window.i18n.t('colName') : 'NOMBRE';
            const colCategory = window.i18n ? window.i18n.t('colCategory') : 'CATEGORÍA';
            const colAccess = window.i18n ? window.i18n.t('colAccess') : 'ACCESO';
            const colDate = window.i18n ? window.i18n.t('colLastModified') : 'ÚLTIMA MODIFICACIÓN';

            const header = `
                <div class="list-header-m3 hidden-mobile-lg">
                    <div class="col-checkbox">
                        <label class="m3-checkbox-wrapper">
                            <input type="checkbox" id="selectAllCheckbox" class="m3-checkbox-input" onchange="window.dashboard.toggleSelectAll(event)">
                            <span class="m3-checkbox-visual"></span>
                        </label>
                    </div>
                    <div class="col-icon"></div>
                    <div class="col-name">${colName}</div>
                    <div class="col-category">${colCategory}</div>
                    <div class="col-access">${colAccess}</div>
                    <div class="col-date">${colDate}</div>
                    <div class="col-actions"></div>
                </div>
            `;
            const rows = recipes.map(recipe => this.renderRecipeRow(recipe)).join('');
            container.innerHTML = header + `<div class="recipe-list-body">${rows}</div>`;
            this.updateSelectAllCheckbox();
        }
    }

    renderRecipeRow(recipe) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const date = new Date(recipe.updated_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const isSelected = this.selectedRecipes.has(recipe.id);

        return `
            <div class="file-row-m3 ${isSelected ? 'selected' : ''}" 
                 onclick="window.dashboard.handleRecipeClick('${recipe.id}')">
                <div class="col-checkbox" onclick="event.stopPropagation()">
                    <label class="m3-checkbox-wrapper">
                        <input type="checkbox" class="m3-checkbox-input" ${isSelected ? 'checked' : ''} onchange="window.dashboard.toggleSelection('${recipe.id}')">
                        <span class="m3-checkbox-visual"></span>
                    </label>
                </div>
                <div class="col-icon">
                    <span class="material-symbols-outlined" style="font-size: 24px; color: var(--secondary);">description</span>
                </div>

                <div class="col-name text-ellipsis">
                    <span class="recipe-name">${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</span>
                </div>
                <div class="col-category">
                    <span class="badge-tag">General</span>
                </div>
                <div class="col-access">
                    ${recipe.sharingContext === 'received'
                ? (recipe.sharedPermission === 'view_and_copy'
                    ? `<span style="color:#c7a44b;display:flex;align-items:center;gap:4px">
                            <span class="material-symbols-outlined" style="font-size:18px;font-variation-settings:'FILL' 1,'wght' 400">file_copy</span>
                            ${window.i18n ? window.i18n.t('canCopy') : 'Puede copiar'}</span>`
                    : `<span style="color:#00A676;display:flex;align-items:center;gap:4px">
                            <span class="material-symbols-outlined" style="font-size:18px;font-variation-settings:'FILL' 1,'wght' 400">visibility</span>
                            ${window.i18n ? window.i18n.t('canView') : 'Solo ver'}</span>`)
                : recipe.sharingContext === 'sent' ? `<span style="color: var(--primary); font-weight: 600;">${window.i18n ? window.i18n.t('accessShared') : 'Compartida'}</span>` : (window.i18n ? window.i18n.t('accessPrivate') : 'Solo tú')}
                </div>
                <div class="col-date">${date}</div>
                <div class="col-actions">
                    <div class="row-actions-dropbox">
                        <button class="btn-share-highlight" onclick="event.stopPropagation(); window.dashboard.shareRecipe('${recipe.id}')">
                            ${window.i18n ? window.i18n.t('shareBtn') : 'Compartir'}
                        </button>
                        <button class="btn-icon-m3" title="Copiar enlace" onclick="event.stopPropagation(); window.dashboard.copyLink('${recipe.id}')">
                            <span class="material-symbols-outlined">link</span>
                        </button>
                        <button class="btn-icon-m3" title="Editar" onclick="event.stopPropagation(); window.location.href='/recipe-form?id=${recipe.id}'">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button class="btn-icon-m3" title="Eliminar" style="color: var(--md-error);" onclick="event.stopPropagation(); window.dashboard.confirmDelete('${recipe.id}')">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                        <button class="btn-icon-m3 ${recipe.is_favorite ? 'active' : ''}" 
                            title="Favorito"
                            onclick="event.stopPropagation(); window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite})">
                            <span class="material-symbols-outlined" style="${recipe.is_favorite ? 'color: #EAB308; font-variation-settings: \'FILL\' 1;' : ''}">
                                ${recipe.is_favorite ? 'star' : 'star_border'}
                            </span>
                        </button>
                        <button class="btn-icon-m3" title="Más opciones" onclick="window.dashboard.showMoreOptions('${recipe.id}', event)">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                    </div>
                    <!-- Mobile Actions (only visible in mobile media query) -->
                    <button class="btn-icon-m3 mobile-action-btn" onclick="event.stopPropagation(); window.dashboard.showMoreOptions('${recipe.id}', event)">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
                </div>
            </div>
        `;
    }

    renderRecipeCard(recipe) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const date = new Date(recipe.updated_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES', {
            day: '2-digit', month: '2-digit'
        });
        const isSelected = this.selectedRecipes.has(recipe.id);

        return `
            <div class="recipe-card-m3 ${isSelected ? 'selected' : ''}" 
                 onclick="window.dashboard.handleRecipeClick('${recipe.id}')"
                 style="position:relative;">
                <div class="col-checkbox" onclick="event.stopPropagation()" style="position: absolute; top: 8px; left: 8px; z-index: 2;">
                    <label class="m3-checkbox-wrapper">
                        <input type="checkbox" class="m3-checkbox-input" ${isSelected ? 'checked' : ''} onchange="window.dashboard.toggleSelection('${recipe.id}')">
                        <span class="m3-checkbox-visual"></span>
                    </label>
                </div>
                <div class="recipe-card-image">
                    <span class="material-symbols-outlined">restaurant</span>
                </div>
                <div class="recipe-card-content">
                    <h4 class="recipe-card-title">${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h4>
                    <div class="recipe-card-meta">
                        <span>General</span>
                        <span>${date}</span>
                    </div>
                </div>
            </div>
        `;
    }

    handleRecipeClick(recipeId) {
        // En modo selección, el click en la fila togglea la selección
        if (this.selectedRecipes.size > 0) {
            this.toggleSelection(recipeId);
            return;
        }

        // Navegación directa al detalle pasando permiso si existe (para compartidas)
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        const permission = recipe?.sharedPermission;
        const url = permission
            ? `/recipe-detail?id=${recipeId}&permission=${permission}`
            : `/recipe-detail?id=${recipeId}`;

        window.location.href = url;
    }

    updateSelectionUI() {
        document.querySelectorAll('.file-row, .recipe-card-m3').forEach(el => {
            el.classList.remove('selected');
        });
        const activeItem = document.querySelector(`[onclick*="${this.selectedRecipeId}"]`);
        if (activeItem) activeItem.classList.add('selected');
    }

    async showRecipeDetails(recipeId) {
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        if (!recipe) return;

        this.toggleDetailsSidebar(true);
        const detailsContent = document.getElementById('details-content');
        if (!detailsContent) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const date = new Date(recipe.updated_at).toLocaleTimeString(isEn ? 'en-US' : 'es-ES', {
            hour: '2-digit', minute: '2-digit'
        }) + ' ' + new Date(recipe.updated_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES');

        const isShared = recipe.sharingContext === 'received';
        const accessLabel = isShared
            ? (window.i18n ? window.i18n.t('navShared') : 'Compartida')
            : (window.i18n ? window.i18n.t('accessPrivate') : 'Solo tú');

        detailsContent.innerHTML = `
            <div class="details-preview">
                <div class="no-image-placeholder"><span class="material-symbols-outlined" style="font-size: 48px;">restaurant</span></div>
            </div>
            <div class="details-info-list" style="padding: 24px;">
                <h3 style="margin-bottom: 8px;">${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h3>
                ${isShared ? `
                    <div style="font-size: 13px; color: var(--on-surface-variant); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 18px;">person</span>
                        <span>${window.i18n ? window.i18n.t('sharedBy') : 'Compartida por'}: <strong>${recipe.senderName || 'Chef'}</strong></span>
                    </div>
                ` : recipe.sharingContext === 'sent' && recipe.sharedWith ? `
                    <div style="font-size: 13px; color: var(--primary); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 18px;">group</span>
                        <span>${window.i18n ? window.i18n.t('sharedWith') : 'Compartida con'}: <strong>${recipe.sharedWith}</strong></span>
                    </div>
                ` : ''}
                <div class="details-meta-m3">
                    <span class="badge-tag">General</span>
                    <span class="badge-tag">${accessLabel}</span>
                </div>
                
                ${isShared ? `
                <div style="margin-top: 24px;">
                    <md-filled-button onclick="window.dashboard.saveSharedRecipe('${recipe.id}')" style="width: 100%;">
                        <span slot="icon" class="material-symbols-outlined">library_add</span>
                        ${window.i18n ? window.i18n.t('addToMyRecipes') : 'Agregar a mis recetas'}
                    </md-filled-button>
                </div>
                ` : ''}

                <div class="details-section" style="margin-top: 24px;">
                    <label style="font-size: 12px; color: var(--on-surface-variant); font-weight: 600;">${window.i18n ? window.i18n.t('detailLastModified') : 'Última modificación'}</label>
                    <p style="font-size: 14px; margin-top: 4px;">${date}</p>
                </div>
                <div class="details-section" style="margin-top: 16px;">
                    <label style="font-size: 12px; color: var(--on-surface-variant); font-weight: 600;">${window.i18n ? window.i18n.t('recipeType') : 'Tipo'}</label>
                    <p style="font-size: 14px; margin-top: 4px;">${isShared ? (window.i18n ? window.i18n.t('recipeShared') : 'Receta compartida') : (window.i18n ? window.i18n.t('recipePersonal') : 'Receta personal')}</p>
                </div>
            </div>
        `;

        const sidebar = document.getElementById('details-sidebar');
        if (sidebar) sidebar.classList.add('active');
    }

    async toggleFavorite(recipeId, currentStatus) {
        const result = await window.db.toggleFavorite(recipeId, currentStatus);
        if (result.success) {
            const addedMsg = window.i18n ? window.i18n.t('favAdded') : 'Añadido a favoritos';
            const removedMsg = window.i18n ? window.i18n.t('favRemoved') : 'Eliminado de favoritos';
            window.utils.showToast(result.isFavorite ? addedMsg : removedMsg, 'success');
            const recipe = this.currentRecipes.find(r => r.id === recipeId);
            if (recipe) {
                recipe.is_favorite = result.isFavorite;
                this.renderRecipesGrid(this.currentRecipes);
            }
        } else {
            window.utils.showToast(window.i18n ? window.i18n.t('favError') : 'Error al actualizar favoritos', 'error');
        }
    }

    shareRecipe(recipeId) {
        if (window.shareModal) {
            window.shareModal.open(recipeId);
        } else {
            window.utils.showToast(window.i18n ? window.i18n.t('shareNotAvailable') : 'Funcionalidad de compartir no disponible', 'error');
        }
    }

    copyLink(recipeId) {
        const url = `${window.location.origin}/recipe-detail?id=${recipeId}`;
        navigator.clipboard.writeText(url).then(() => {
            window.utils.showToast(window.i18n ? '🔗 Enlace copiado' : '🔗 Link copied', 'success');
        });
    }

    showMoreOptions(recipeId, event) {
        if (event) event.stopPropagation();

        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        if (!recipe) return;

        const existingMenu = document.querySelector('.dropbox-menu-m3');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'dropbox-menu-m3';

        const isShared = recipe.sharingContext === 'received';
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        const sharedLabelHTML = recipe.sharingContext === 'received' ? `
            <div style="font-size: 12px; color: var(--on-surface-variant); padding: 0 16px 8px 16px; margin-top: -4px;">
                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">person</span>
                ${window.i18n ? window.i18n.t('sharedBy') : 'Compartida por'}: ${recipe.senderName || 'Chef'}
            </div>
        ` : recipe.sharingContext === 'sent' && recipe.sharedWith ? `
            <div style="font-size: 12px; color: var(--primary); padding: 0 16px 8px 16px; margin-top: -4px;">
                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">group</span>
                ${window.i18n ? window.i18n.t('sharedWith') : 'Compartida con'}: ${recipe.sharedWith}
            </div>
        ` : '';

        if (isShared) {
            menu.innerHTML = `
                <div class="dropbox-menu-header">
                    <h4>${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h4>
                </div>
                ${sharedLabelHTML}
                <button class="context-menu-item" onclick="window.dashboard.saveSharedRecipe('${recipe.id}')">
                    <span class="material-symbols-outlined">library_add</span>
                    ${window.i18n ? window.i18n.t('addToMyRecipes') : 'Agregar a mis recetas'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" onclick="window.dashboard.copyLink('${recipe.id}')">
                    <span class="material-symbols-outlined">link</span>
                    ${window.i18n ? window.i18n.t('copyLinkLabel') : 'Copiar enlace'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" style="color: var(--md-error);" onclick="window.dashboard.confirmDelete('${recipe.id}')">
                    <span class="material-symbols-outlined">delete</span>
                    ${window.i18n ? window.i18n.t('deleteBtn') : 'Eliminar'}
                </button>
            `;
        } else {
            menu.innerHTML = `
                <div class="dropbox-menu-header">
                    <h4>${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h4>
                </div>
                ${sharedLabelHTML}
                <button class="context-menu-item" onclick="window.dashboard.copyLink('${recipe.id}')">
                    <span class="material-symbols-outlined">link</span>
                    ${window.i18n ? window.i18n.t('copyLinkLabel') : 'Copiar enlace'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.shareRecipe('${recipe.id}')">
                    <span class="material-symbols-outlined">share</span>
                    ${window.i18n ? window.i18n.t('shareBtn') : 'Compartir'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" onclick="window.location.href='/recipe-form?id=${recipe.id}'">
                    <span class="material-symbols-outlined">edit</span>
                    ${window.i18n ? window.i18n.t('formEditRecipe') : 'Editar receta'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.startRename('${recipe.id}', event)">
                    <span class="material-symbols-outlined">edit_square</span>
                    ${window.i18n ? window.i18n.t('rename') : 'Renombrar'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite})">
                    <span class="material-symbols-outlined">${recipe.is_favorite ? 'star' : 'star_border'}</span>
                    ${recipe.is_favorite ? (window.i18n ? window.i18n.t('removeFav') : 'Quitar de favoritos') : (window.i18n ? window.i18n.t('addFav') : 'Añadir a favoritos')}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" style="color: var(--md-error);" onclick="window.dashboard.confirmDelete('${recipe.id}')">
                    <span class="material-symbols-outlined">delete</span>
                    ${window.i18n ? window.i18n.t('deleteBtn') : 'Eliminar receta'}
                </button>
            `;
        }

        document.body.appendChild(menu);

        const rect = event.target.getBoundingClientRect();
        const menuWidth = 220;
        const menuHeight = menu.offsetHeight;

        let top = rect.bottom + 8;
        let left = rect.right - menuWidth;

        if (top + menuHeight > window.innerHeight) {
            top = rect.top - menuHeight - 8;
        }
        if (left < 0) left = 8;

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('mousedown', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeMenu), 10);
    }

    downloadRecipe(recipeId) {
        window.utils.showToast(window.i18n ? window.i18n.t('downloading') : 'Descarga iniciada...', 'success');
    }

    async confirmDelete(recipeId) {
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        const isReceived = recipe && recipe.sharingContext === 'received';

        const confirmMsg = isReceived
            ? (window.i18n ? window.i18n.t('deleteSharedConfirm') : '¿Deseas eliminar esta receta compartida?')
            : (window.i18n ? window.i18n.t('deleteConfirm') : '¿Seguro que desea eliminar la receta?');

        const deleteBtnTxt = window.i18n ? window.i18n.t('deleteBtn') : 'ELIMINAR';

        window.showActionSnackbar(confirmMsg, deleteBtnTxt, async () => {
            const result = isReceived
                ? await window.db.deleteSharedRecipe(window.authManager.currentUser.id, recipeId)
                : await window.db.deleteRecipe(recipeId);

            if (result.success) {
                window.utils.showToast(window.i18n ? window.i18n.t('deleteSuccess') : 'Eliminada correctamente', 'success');
                this.currentRecipes = this.currentRecipes.filter(r => r.id !== recipeId);
                this.renderRecipesGrid(this.currentRecipes);
                if (this.selectedRecipeId === recipeId) {
                    this.toggleDetailsSidebar(false);
                }
            } else {
                window.utils.showToast(window.i18n ? window.i18n.t('deleteError') : 'Error al eliminar la receta', 'error');
            }
        });
    }

    startRename(recipeId, event) {
        if (event) event.stopPropagation();

        const menu = document.querySelector('.dropbox-menu-m3');
        if (menu) menu.remove();

        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        if (!recipe) return;

        const selector = `[onclick*="${recipeId}"]`;
        const container = document.querySelector(selector);
        if (!container) return;

        const nameEl = container.querySelector('.recipe-name, .recipe-card-title');
        if (!nameEl) return;

        const original = nameEl.textContent;
        const input = document.createElement('input');
        input.value = original;
        input.style.cssText = `
            border: 2px solid #1a73e8;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: inherit;
            font-weight: 500;
            width: 100%;
            background: var(--bg);
            color: var(--on-surface);
            outline: none;
            box-sizing: border-box;
        `;

        const save = async () => {
            if (input.parentNode === null) return;
            const newName = input.value.trim() || original;
            const spanOrH4 = document.createElement(nameEl.tagName);
            spanOrH4.className = nameEl.className;
            spanOrH4.textContent = newName;
            input.replaceWith(spanOrH4);

            if (newName !== original) {
                const result = await window.db.updateRecipe(recipeId, { name_es: newName });
                if (result.success) {
                    recipe.name_es = newName;
                    window.utils.showToast(window.i18n ? window.i18n.t('renameSuccess') : 'Nombre actualizado', 'success');
                } else {
                    spanOrH4.textContent = original;
                    window.utils.showToast(window.i18n ? window.i18n.t('renameError') : 'Error al renombrar', 'error');
                }
            }
        };

        const cancel = () => {
            if (input.parentNode === null) return;
            const spanOrH4 = document.createElement(nameEl.tagName);
            spanOrH4.className = nameEl.className;
            spanOrH4.textContent = original;
            input.replaceWith(spanOrH4);
        };

        nameEl.replaceWith(input);
        input.focus();
        input.select();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        input.addEventListener('blur', save);
    }

    async checkDeepLink() {
        const hash = window.location.hash;
        if (hash.startsWith('#/recipe/')) {
            const recipeId = hash.split('/').pop();
            if (recipeId) {
                const isAuthenticated = await window.authManager.checkAuth();
                if (!isAuthenticated) {
                    localStorage.setItem('redirect_after_login', hash);
                    window.location.href = '/login';
                } else {
                    window.location.href = `/recipe-detail?id=${recipeId}`;
                }
            }
        }
    }

    async saveSharedRecipe(recipeId) {
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        const recipeName = recipe ? (window.i18n.getLang() === 'en' ? (recipe.name_en || recipe.name_es) : recipe.name_es) : '';

        // Cerrar menú inmediatamente
        const existingMenu = document.querySelector('.dropbox-menu-m3');
        if (existingMenu) existingMenu.remove();

        try {
            window.utils.showToast(window.i18n ? window.i18n.t('savingRecipe') : 'Guardando receta...', 'info');
            const result = await window.db.duplicateRecipe(recipeId, window.authManager.currentUser.id);
            if (result.success) {
                const successMsg = window.i18n
                    ? window.i18n.t('recipeAddedToCollection', { name: recipeName })
                    : `✅ Receta ${recipeName} agregada a tu colección`;
                window.utils.showToast(successMsg, 'success');

                // Switch back to "My Recipes" tab to show the newly saved recipe
                setTimeout(() => {
                    const recipesNavItem = document.querySelector('.nav-item[data-view="recipes"]');
                    this.switchView('recipes', recipesNavItem);
                    this.toggleDetailsSidebar(false);
                }, 100);
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error('Save shared recipe error:', err);
            window.utils.showToast(window.i18n ? window.i18n.t('saveError') : 'Error al guardar la receta', 'error');
        }
    }
}

// Inicializar y exponer
window.dashboard = new DashboardManager();
window.addEventListener('DOMContentLoaded', () => window.dashboard.init());
