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
            sidebarGreeting.textContent = `Chef ${user.first_name || ''}`;
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
                titleEl.textContent = `Resultados para "${filters.search}"`;
            } else if (filters.favorite) {
                titleEl.textContent = 'Favoritos';
            } else if (filters.shared) {
                titleEl.textContent = 'Compartidas';
            } else {
                titleEl.textContent = 'Mis Recetas';
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
            const header = `
                <div class="list-header-m3 hidden-mobile-lg">
                    <div class="col-icon"></div>
                    <div class="col-name">NOMBRE</div>
                    <div class="col-category">CATEGORÍA</div>
                    <div class="col-access">ACCESO</div>
                    <div class="col-date">ÚLTIMA MODIFICACIÓN</div>
                    <div class="col-actions"></div>
                </div>
            `;
            const rows = recipes.map(recipe => this.renderRecipeRow(recipe)).join('');
            container.innerHTML = header + rows;
        }
    }

    renderRecipeRow(recipe) {
        const date = new Date(recipe.updated_at).toLocaleDateString('es-ES', {
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
                    <span class="recipe-name">${recipe.name_es}</span>
                </div>
                <div class="col-category">
                    <span class="badge-tag">General</span>
                </div>
                <div class="col-access">
                    ${recipe.sharingContext === 'received' ? '<span style="color: var(--secondary); font-weight: 600;">Recibida</span>' :
                recipe.sharingContext === 'sent' ? '<span style="color: var(--primary); font-weight: 600;">Compartida</span>' : 'Solo tú'}
                </div>
                <div class="col-date">${date}</div>
                <div class="col-actions">
                    <div class="row-actions-dropbox">
                        <button class="btn-share-highlight" onclick="event.stopPropagation(); window.dashboard.shareRecipe('${recipe.id}')">
                            Compartir
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
        const date = new Date(recipe.updated_at).toLocaleDateString('es-ES', {
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
                    <h4 class="recipe-card-title">${recipe.name_es}</h4>
                    <div class="recipe-card-meta">
                        <span>General</span>
                        <span>${date}</span>
                    </div>
                </div>
            </div>
        `;
    }

    handleRecipeClick(recipeId) {
        // Navegación directa al detalle según solicitud del usuario
        window.location.href = `recipe-detail.html?id=${recipeId}`;
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

        const date = new Date(recipe.updated_at).toLocaleTimeString('es-ES', {
            hour: '2-digit', minute: '2-digit'
        }) + ' ' + new Date(recipe.updated_at).toLocaleDateString('es-ES');

        detailsContent.innerHTML = `
            <div class="details-preview">
                ${recipe.image_url ? `<img src="${recipe.image_url}" alt="${recipe.name_es}">` : `<div class="no-image-placeholder"><span class="material-symbols-outlined" style="font-size: 48px;">restaurant</span></div>`}
            </div>
            <div class="details-info-list" style="padding: 24px;">
                <h3 style="margin-bottom: 8px;">${recipe.name_es}</h3>
                <div class="details-meta-m3">
                    <span class="badge-tag">General</span>
                    <span class="badge-tag">Solo tú</span>
                </div>
                <div class="details-section" style="margin-top: 24px;">
                    <label style="font-size: 12px; color: var(--on-surface-variant); font-weight: 600;">Última modificación</label>
                    <p style="font-size: 14px; margin-top: 4px;">${date}</p>
                </div>
                <div class="details-section" style="margin-top: 16px;">
                    <label style="font-size: 12px; color: var(--on-surface-variant); font-weight: 600;">Tipo</label>
                    <p style="font-size: 14px; margin-top: 4px;">Receta personal</p>
                </div>
            </div>
        `;

        const sidebar = document.getElementById('details-sidebar');
        if (sidebar) sidebar.classList.add('active');
    }

    async toggleFavorite(recipeId, currentStatus) {
        const result = await window.db.toggleFavorite(recipeId, currentStatus);
        if (result.success) {
            window.utils.showToast(result.isFavorite ? 'Añadido a favoritos' : 'Eliminado de favoritos', 'success');
            const recipe = this.currentRecipes.find(r => r.id === recipeId);
            if (recipe) {
                recipe.is_favorite = result.isFavorite;
                this.renderRecipesGrid(this.currentRecipes);
            }
        } else {
            window.utils.showToast('Error al actualizar favoritos', 'error');
        }
    }

    shareRecipe(recipeId) {
        if (window.shareModal) {
            window.shareModal.open(recipeId);
        } else {
            window.utils.showToast('Funcionalidad de compartir no disponible', 'error');
        }
    }

    copyLink(recipeId) {
        const url = `${window.location.origin}/recipe-detail.html?id=${recipeId}`;
        navigator.clipboard.writeText(url).then(() => {
            window.utils.showToast('Enlace copiado al portapapeles', 'success');
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

        menu.innerHTML = `
            <div class="dropbox-menu-header">
                <h4>${recipe.name_es}</h4>
            </div>
            <button class="context-menu-item" onclick="window.dashboard.downloadRecipe('${recipe.id}')">
                <span class="material-symbols-outlined">download</span>
                Descargar
            </button>
            <button class="context-menu-item" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                <span class="material-symbols-outlined">open_in_new</span>
                Abrir en...
            </button>
            <div class="context-menu-divider"></div>
            <button class="context-menu-item" onclick="window.dashboard.copyLink('${recipe.id}')">
                <span class="material-symbols-outlined">link</span>
                Copiar enlace
            </button>
            <button class="context-menu-item" onclick="window.dashboard.shareRecipe('${recipe.id}')">
                <span class="material-symbols-outlined">share</span>
                Compartir
            </button>
            <button class="context-menu-item">
                <span class="material-symbols-outlined">manage_accounts</span>
                Administrar permisos
            </button>
            <div class="context-menu-divider"></div>
            <button class="context-menu-item" onclick="window.location.href='recipe-form.html?id=${recipe.id}'">
                <span class="material-symbols-outlined">edit</span>
                Editar receta
            </button>
            <button class="context-menu-item">
                <span class="material-symbols-outlined">drive_file_rename_outline</span>
                Renombrar
            </button>
            <button class="context-menu-item" onclick="window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite})">
                <span class="material-symbols-outlined">${recipe.is_favorite ? 'star' : 'star_border'}</span>
                ${recipe.is_favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            </button>
            <div class="context-menu-divider"></div>
            <button class="context-menu-item" style="color: var(--md-error);" onclick="window.dashboard.confirmDelete('${recipe.id}')">
                <span class="material-symbols-outlined">delete</span>
                Eliminar receta
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
        window.utils.showToast('Descarga iniciada...', 'success');
        // Lógica de descarga real aquí
    }

    async confirmDelete(recipeId) {
        window.showActionSnackbar('¿Seguro que desea eliminar la receta?', 'ELIMINAR', async () => {
            const result = await window.db.deleteRecipe(recipeId);
            if (result.success) {
                window.utils.showToast('Receta eliminada correctamente', 'success');
                // Quitar de la lista local y re-renderizar
                this.currentRecipes = this.currentRecipes.filter(r => r.id !== recipeId);
                this.renderRecipesGrid(this.currentRecipes);

                // Si el sidebar de detalles estaba abierto con esta receta, cerrarlo
                if (this.selectedRecipeId === recipeId) {
                    this.toggleDetailsSidebar(false);
                }
            } else {
                window.utils.showToast('Error al eliminar la receta', 'error');
            }
        });
    }
}

// Inicializar y exponer
window.dashboard = new DashboardManager();
window.addEventListener('DOMContentLoaded', () => window.dashboard.init());
