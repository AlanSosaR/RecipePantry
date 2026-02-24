// js/dashboard.js
// Lógica específica del Dashboard

class DashboardManager {
    constructor() {
        this.currentFilters = {};
        this.displayMode = localStorage.getItem('recipehub_display_mode') || 'list';
        this.currentView = localStorage.getItem('recipehub_current_view') || 'recipes';
        this.currentRecipes = [];
        this.selectedRecipeId = null;
    }

    async init() {
        try {
            console.log('🚀 Inicializando RecipeHub Premium...');

            // 1. Verificar autenticación silenciosamente
            const isAuthenticated = await window.authManager.checkAuth();

            // Inicializar notificaciones si hay autenticación
            if (isAuthenticated && window.notificationManager) {
                await window.notificationManager.init();
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

            // Aplicar tema guardado y actualizar icono
            if (window.initTheme) window.initTheme();

            // 2. Cargar datos iniciales según la vista guardada
            console.log(`📦 Cargando vista: ${this.currentView}...`);
            const activeNavItem = document.querySelector(`.nav-item[data-view="${this.currentView}"]`);
            this.switchView(this.currentView, activeNavItem);

            console.log('✨ Dashboard listo');

            this.setupEventListeners();
        } catch (error) {
            console.error('❌ Error crítico en Dashboard.init:', error);
            const landingEl = document.getElementById('landing-section');
            if (landingEl) landingEl.classList.remove('hidden');
        }
    }

    updateUserUI() {
        if (!window.authManager.currentUser) return;
        const user = window.authManager.currentUser;

        // Actualizar saludo en sidebar
        const sidebarGreeting = document.getElementById('sidebar-user-greeting');
        if (sidebarGreeting) {
            const chefText = window.i18n ? window.i18n.t('chefGreeting') : 'Chef';
            sidebarGreeting.textContent = `${chefText} ${user.first_name || ''}`;
        }

        // Actualizar iniciales
        const sidebarInitials = document.getElementById('sidebar-user-initials');
        if (sidebarInitials) {
            const initials = (user.first_name?.[0] || 'C') + (user.last_name?.[0] || 'H');
            sidebarInitials.textContent = initials.toUpperCase();
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

        // Tema (Dark Mode)
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                if (window.toggleDarkMode) window.toggleDarkMode();
            });
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
        const sidebar = document.getElementById('main-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('sidebar--slim');
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
        localStorage.setItem('recipehub_display_mode', mode);

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
        localStorage.setItem('recipehub_current_view', view);

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

    renderRecipesGrid(recipes) {
        const container = document.getElementById('recipesGrid');
        if (!container) return;

        const emptyState = document.getElementById('emptyState');

        if (recipes.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
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
        }
    }

    renderRecipeRow(recipe) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const date = new Date(recipe.updated_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const isSelected = this.selectedRecipeId === recipe.id;

        return `
            <div class="file-row-m3 ${isSelected ? 'selected' : ''}" 
                 onclick="window.dashboard.handleRecipeClick('${recipe.id}')">
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
                        <button class="btn-icon-m3" title="Editar" onclick="event.stopPropagation(); window.location.href='recipe-form.html?id=${recipe.id}'">
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
                </div>
                <!-- Mobile Actions -->
                <button class="btn-icon-m3 mobile-action-btn" onclick="window.dashboard.showMoreOptions('${recipe.id}', event)">
                    <span class="material-symbols-outlined">more_vert</span>
                </button>
            </div>
        `;
    }

    renderRecipeCard(recipe) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const date = new Date(recipe.updated_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES', {
            day: '2-digit', month: '2-digit'
        });
        const isSelected = this.selectedRecipeId === recipe.id;

        return `
            <div class="recipe-card-m3 ${isSelected ? 'selected' : ''}" 
                 onclick="window.dashboard.handleRecipeClick('${recipe.id}')">
                <div class="recipe-card-image">
                    ${recipe.image_url ? `<img src="${recipe.image_url}" alt="${recipe.name_es}">` : `<span class="material-symbols-outlined">restaurant</span>`}
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
        // Navegación directa al detalle pasando permiso si existe (para compartidas)
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        const permission = recipe?.sharedPermission;
        const url = permission
            ? `recipe-detail.html?id=${recipeId}&permission=${permission}`
            : `recipe-detail.html?id=${recipeId}`;

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

        detailsContent.innerHTML = `
            <div class="details-preview">
                ${recipe.image_url ? `<img src="${recipe.image_url}" alt="${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}">` : `<div class="no-image-placeholder"><span class="material-symbols-outlined" style="font-size: 48px;">restaurant</span></div>`}
            </div>
            <div class="details-info-list" style="padding: 24px;">
                <h3 style="margin-bottom: 8px;">${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h3>
                <div class="details-meta-m3">
                    <span class="badge-tag">General</span>
                    <span class="badge-tag">${window.i18n ? window.i18n.t('accessPrivate') : 'Solo tú'}</span>
                </div>
                <div class="details-section" style="margin-top: 24px;">
                    <label style="font-size: 12px; color: var(--on-surface-variant); font-weight: 600;">${window.i18n ? window.i18n.t('detailLastModified') : 'Última modificación'}</label>
                    <p style="font-size: 14px; margin-top: 4px;">${date}</p>
                </div>
                <div class="details-section" style="margin-top: 16px;">
                    <label style="font-size: 12px; color: var(--on-surface-variant); font-weight: 600;">${window.i18n ? window.i18n.t('recipeType') : 'Tipo'}</label>
                    <p style="font-size: 14px; margin-top: 4px;">${window.i18n ? window.i18n.t('recipePersonal') : 'Receta personal'}</p>
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
        const url = `${window.location.origin}/recipe-detail.html?id=${recipeId}`;
        navigator.clipboard.writeText(url).then(() => {
            window.utils.showToast(window.i18n ? window.i18n.t('linkCopied') : 'Enlace copiado al portapapeles', 'success');
        });
    }

    showMoreOptions(recipeId, event) {
        if (event) event.stopPropagation();

        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        if (!recipe) return;

        // Limpiar cualquier menú existente
        const existingMenu = document.querySelector('.dropbox-menu-m3');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'dropbox-menu-m3';

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        menu.innerHTML = `
            <div class="dropbox-menu-header">
                <h4>${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h4>
            </div>
            <button class="context-menu-item" onclick="window.dashboard.downloadRecipe('${recipe.id}')">
                <span class="material-symbols-outlined">download</span>
                ${window.i18n ? window.i18n.t('downloading') : 'Descargar'}
            </button>
            <button class="context-menu-item" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                <span class="material-symbols-outlined">open_in_new</span>
                ${window.i18n ? window.i18n.t('openIn') : 'Abrir en...'}
            </button>
            <div class="context-menu-divider"></div>
            <button class="context-menu-item" onclick="window.dashboard.copyLink('${recipe.id}')">
                <span class="material-symbols-outlined">link</span>
                ${window.i18n ? window.i18n.t('copyLinkLabel') : 'Copiar enlace'}
            </button>
            <button class="context-menu-item" onclick="window.dashboard.shareRecipe('${recipe.id}')">
                <span class="material-symbols-outlined">share</span>
                ${window.i18n ? window.i18n.t('shareBtn') : 'Compartir'}
            </button>
            <button class="context-menu-item">
                <span class="material-symbols-outlined">manage_accounts</span>
                ${window.i18n ? window.i18n.t('managePerms') : 'Administrar permisos'}
            </button>
            <div class="context-menu-divider"></div>
            <button class="context-menu-item" onclick="window.location.href='recipe-form.html?id=${recipe.id}'">
                <span class="material-symbols-outlined">edit</span>
                ${window.i18n ? window.i18n.t('formEditRecipe') : 'Editar receta'}
            </button>
            <button class="context-menu-item">
                <span class="material-symbols-outlined">drive_file_rename_outline</span>
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

        document.body.appendChild(menu);

        // Posicionamiento dinámico
        const rect = event.target.getBoundingClientRect();
        const menuWidth = 220;
        const menuHeight = menu.offsetHeight;

        let top = rect.bottom + 8;
        let left = rect.right - menuWidth;

        // Ajustar si se sale de la pantalla
        if (top + menuHeight > window.innerHeight) {
            top = rect.top - menuHeight - 8;
        }
        if (left < 0) left = 8;

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;

        // Cerrar al hacer clic fuera
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
        // Lógica de descarga real aquí
    }

    async confirmDelete(recipeId) {
        const confirmMsg = window.i18n ? window.i18n.t('deleteConfirm') : '¿Seguro que desea eliminar la receta?';
        const deleteBtnTxt = window.i18n ? window.i18n.t('deleteBtn') : 'ELIMINAR';

        window.showActionSnackbar(confirmMsg, deleteBtnTxt, async () => {
            const result = await window.db.deleteRecipe(recipeId);
            if (result.success) {
                window.utils.showToast(window.i18n ? window.i18n.t('deleteSuccess') : 'Receta eliminada correctamente', 'success');
                // Quitar de la lista local y re-renderizar
                this.currentRecipes = this.currentRecipes.filter(r => r.id !== recipeId);
                this.renderRecipesGrid(this.currentRecipes);

                // Si el sidebar de detalles estaba abierto con esta receta, cerrarlo
                if (this.selectedRecipeId === recipeId) {
                    this.toggleDetailsSidebar(false);
                }
            } else {
                window.utils.showToast(window.i18n ? window.i18n.t('deleteError') : 'Error al eliminar la receta', 'error');
            }
        });
    }
}

// Inicializar y exponer
window.dashboard = new DashboardManager();
window.addEventListener('DOMContentLoaded', () => window.dashboard.init());
