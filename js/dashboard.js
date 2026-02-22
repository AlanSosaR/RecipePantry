// js/dashboard.js
// Lógica específica del Dashboard

class DashboardManager {
    constructor() {
        this.currentFilters = {};
        this.viewMode = 'list'; // Enforce list view
        this.currentFilter = 'all';
    }

    async init() {
        console.log('🚀 Inicializando RecipeHub Premium...');

        // 1. Verificar autenticación silenciosamente
        const isAuthenticated = await window.authManager.checkAuth();

        const landingEl = document.getElementById('landing-section');
        const dashboardEl = document.getElementById('dashboard-app'); // Nuevo ID contenedor principal

        if (!isAuthenticated) {
            console.log('💡 Mostrando modo landing');
            document.body.classList.add('mode-landing');
            if (landingEl) landingEl.classList.remove('hidden');
            if (dashboardEl) dashboardEl.classList.add('hidden');
            return;
        }

        console.log('✅ Usuario logueado, preparando dashboard premium');
        document.body.classList.remove('mode-landing');
        if (landingEl) landingEl.classList.add('hidden');
        if (dashboardEl) dashboardEl.classList.remove('hidden');

        // Actualizar datos de usuario en la UI
        this.updateUserUI();

        // 2. Cargar datos iniciales (Paralelo para mejor UX)
        // Cargar categorías primero o en paralelo para que siempre se vean
        this.loadCategories();
        await this.loadRecipes(); // Esperamos este porque define el estado vacío/grid

        this.setupEventListeners();

        // 3. Inicializar menú móvil
        if (window.setupMobileMenu) window.setupMobileMenu();
    }

    updateUserUI() {
        if (!window.authManager.currentUser) return;
        const user = window.authManager.currentUser;

        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.textContent = `Chef ${user.first_name || 'User'}`;

        // El saludo del banner hero si existe
        const heroGreeting = document.getElementById('hero-greeting');
        if (heroGreeting) heroGreeting.textContent = `Hola, ${user.first_name || 'Chef'}`;
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

        // Navegación Sidebar Desktop y Mobile
        document.querySelectorAll('.nav-item, .nav-item-mobile').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                if (view) {
                    this.switchView(view, item);
                    // Si es mobile, cerramos el drawer
                    if (window.innerWidth < 1024 || item.classList.contains('nav-item-mobile')) {
                        this.toggleMobileMenu(false);
                    }
                }
            });
        });

        const overlay = document.getElementById('mobile-drawer-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.toggleMobileMenu(false));
        }
    }


    toggleMobileMenu(forceState = null) {
        const drawer = document.getElementById('mobile-drawer');
        const overlay = document.getElementById('mobile-drawer-overlay');

        if (!drawer || !overlay) return;

        const isOpen = drawer.classList.contains('active');
        const shouldOpen = forceState !== null ? forceState : !isOpen;

        if (shouldOpen) {
            drawer.classList.add('active');
            overlay.classList.add('active');
        } else {
            drawer.classList.remove('active');
            overlay.classList.remove('active');
        }
    }

    handleMobileNav(view, itemElement) {
        // Cerrar menú primero
        this.toggleMobileMenu(false);

        // Sincronizar con desktop sidebar si es posible
        const desktopItem = document.querySelector(`.nav-item[data-view="${view}"]`);
        if (desktopItem) {
            this.switchView(view, desktopItem);
        } else {
            // Fallback si no hay item de escritorio (raro)
            this.loadRecipes(view === 'favorites' ? { favorite: true } : {});
        }
    }

    switchView(view, activeItem) {
        console.log('Cambiando a vista:', view);

        // Actualizar desktop
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        // Encontrar el item desktop correspondiente a la vista si no se pasó
        if (!activeItem || activeItem.classList.contains('nav-item-mobile')) {
            const desktopItem = document.querySelector(`.nav-item[data-view="${view}"]`);
            if (desktopItem) desktopItem.classList.add('active');
        } else {
            activeItem.classList.add('active');
        }

        // Actualizar mobile
        document.querySelectorAll('.nav-item-mobile').forEach(i => {
            i.classList.remove('active');
            // Remover clases de color específicas si se usaban antes
            i.classList.remove('bg-emerald-light', 'text-primary');
            if (i.dataset.view === view) i.classList.add('active');
        });

        // Lógica de filtrado rápido según la vista
        if (view === 'favorites') {
            this.loadRecipes({ favorite: true, orderBy: 'name_es', ascending: true });
        } else if (view === 'recipes' || view === 'overview') {
            this.loadRecipes({ orderBy: 'name_es', ascending: true });
        } else if (view === 'recent') {
            this.loadRecipes({ orderBy: 'updated_at', ascending: false });
        }
    }

    // handleNav Legacy removido o mantenido por compatibilidad si es necesario
    handleNav(view) {
        this.handleMobileNav(view, null);
    }

    async loadRecipes(filters = {}) {
        // Guardar filtros actuales para re-renders (cambio de modo vista)
        this.lastFilters = filters;

        const result = await window.db.getMyRecipes(filters);

        if (!result.success) {
            console.error('Error cargando recetas:', result.error);
            return;
        }

        this.currentRecipes = result.recipes;

        // Actualizar título de la vista si es una búsqueda
        const titleEl = document.getElementById('view-title');
        if (titleEl) {
            if (filters.search) {
                titleEl.textContent = `Resultados para "${filters.search}"`;
            } else if (filters.favorite) {
                titleEl.textContent = 'Favoritos';
            } else if (filters.categoryId) {
                // El título se actualiza en handleCategory, pero por si acaso:
                if (!this.lastCategoryName) {
                    const cat = document.querySelector(`[data-category-id="${filters.categoryId}"]`);
                    if (cat) this.lastCategoryName = cat.querySelector('span:last-child').textContent;
                }
                titleEl.textContent = this.lastCategoryName || 'Categoría';
            } else {
                titleEl.textContent = 'Mis Recetas';
            }
        }

        this.renderDashboardSections(this.currentRecipes);
    }

    renderDashboardSections(recipes) {
        // En diseño Drive, mostramos un grid unificado de "Archivos"
        const container = document.getElementById('recipesGrid');
        if (!container) {
            console.error('No se encontró el contenedor recipesGrid');
            return;
        }

        if (recipes.length === 0) {
            // Mostrar estado vacío si no es búsqueda (búsqueda tiene su propia lógica)
            container.innerHTML = '';
            const emptyState = document.getElementById('emptyState');
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        // Ocultar estado vacío si hay recetas
        const emptyState = document.getElementById('emptyState');
        if (emptyState) emptyState.classList.add('hidden');

        // Toggle container classes
        container.classList.add('list-view');
        container.classList.remove('recipes-grid');

        const header = `
            <div class="list-header hidden-mobile-lg">
                <div class="icon-cell"></div>
                <div class="title-cell">NOMBRE</div>
                <div class="meta-cell">CATEGORÍA</div>
                <div class="meta-cell">ACCESO</div>
                <div class="meta-cell">ÚLTIMA MODIFICACIÓN</div>
                <div class="action-cell"></div>
            </div>
        `;
        const rows = recipes.map(recipe => {
            const date = new Date(recipe.updated_at).toLocaleDateString('es-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
            return `
                <div class="file-row group" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                    <div class="icon-cell">
                        <span class="material-symbols-outlined" style="font-size: 24px; color: #9CA3AF;">description</span>
                    </div>
                    <div class="title-cell">
                        <span class="title">${recipe.name_es}</span>
                    </div>
                    <div class="meta-cell">
                        <span class="badge-tag">General</span>
                    </div>
                    <div class="meta-cell">Solo tú</div>
                    <div class="meta-cell">${date}</div>
                    <div class="action-cell">
                        <div class="row-actions">
                            <button class="btn-action-icon" title="Editar" onclick="event.stopPropagation(); window.location.href='recipe-form.html?id=${recipe.id}'">
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            <button class="btn-favorite-m3 ${recipe.is_favorite ? 'active' : ''}" 
                                onclick="event.stopPropagation(); window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite})">
                                <span class="material-symbols-outlined">
                                    ${recipe.is_favorite ? 'star' : 'star_border'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = header + rows;
    }

    // Métodos renderFeatured y renderMore eliminados por redundancia en diseño Drive

    async loadCategories() {
        // Render in Sidebar (Desktop & Mobile)
        const sidebarContainer = document.getElementById('sidebar-categories');
        const mobileContainer = document.getElementById('mobile-categories');

        const result = await window.db.getMyCategories();
        if (result.success) {
            const categories = result.categories;

            const renderCategoryItem = (cat, isMobile) => `
                <a href="#" class="${isMobile ? 'nav-item-mobile' : 'nav-item'}" 
                   onclick="window.dashboard.handleCategory('${cat.id}', this)"
                   data-category-id="${cat.id}">
                    <span class="material-symbols-outlined" style="font-size: 20px; color: ${cat.color || '#666'}">folder</span>
                    <span style="font-size: 14px;">${cat.name_es}</span>
                </a>
            `;

            // Inject into Desktop Sidebar
            if (sidebarContainer) {
                sidebarContainer.innerHTML = categories.map(cat => renderCategoryItem(cat, false)).join('');
                // Add "New Folder" button if desired, or keep it manageable
            }

            // Inject into Mobile Drawer
            if (mobileContainer) {
                mobileContainer.innerHTML = categories.map(cat => renderCategoryItem(cat, true)).join('');
            }
        }
    }

    handleCategory(categoryId, element) {
        // Update Active State
        document.querySelectorAll('.nav-item, .nav-item-mobile').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');

        // Close Mobile Menu if open
        this.toggleMobileMenu(false);

        // Update Title
        const titleEl = document.getElementById('view-title');
        if (titleEl && element) {
            titleEl.textContent = element.querySelector('span:last-child').textContent;
        }

        // Load Recipes for this category
        this.lastCategoryName = element ? element.querySelector('span:last-child').textContent : null;
        this.loadRecipes({ categoryId: categoryId });
    }

    async toggleFavorite(recipeId, currentStatus) {
        const result = await window.db.toggleFavorite(recipeId, currentStatus);
        if (result.success) {
            window.utils.showToast(result.isFavorite ? 'Añadido a favoritos' : 'Eliminado de favoritos', 'success');

            // Actualizar estado local y re-renderizar
            const recipe = this.currentRecipes.find(r => r.id === recipeId);
            if (recipe) {
                recipe.is_favorite = result.isFavorite;
                this.renderDashboardSections(this.currentRecipes);
            }
        } else {
            window.utils.showToast('Error al actualizar favoritos', 'error');
        }
    }

    openNewRecipeModal() {
        // Redirigir o abrir modal de creación
        window.location.href = '#create';
        window.utils.showToast('Funcionalidad de edición próximamente');
    }
}

// Inicializar y exponer
window.dashboard = new DashboardManager();
window.addEventListener('load', () => window.dashboard.init());
