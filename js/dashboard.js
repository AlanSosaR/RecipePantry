// js/dashboard.js
// Lógica específica del Dashboard

class DashboardManager {
    constructor() {
        this.currentFilters = {};
        this.viewMode = 'grid'; // Default view mode
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
            if (landingEl) landingEl.classList.remove('hidden');
            if (dashboardEl) dashboardEl.classList.add('hidden');
            return;
        }

        console.log('✅ Usuario logueado, preparando dashboard premium');
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

        // Listener para cerrar drawer al hacer click fuera
        const overlay = document.getElementById('mobile-drawer-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.toggleMobileMenu(false));
        }

        // View Toggles
        const btnList = document.getElementById('view-list');
        const btnGrid = document.getElementById('view-grid');
        if (btnList) btnList.addEventListener('click', () => this.toggleView('list'));
        if (btnGrid) btnGrid.addEventListener('click', () => this.toggleView('grid'));
    }

    toggleView(mode) {
        this.viewMode = mode;

        // Update buttons
        const btnList = document.getElementById('view-list');
        const btnGrid = document.getElementById('view-grid');

        if (mode === 'list') {
            if (btnList) {
                btnList.style.background = 'var(--primary-light)';
                btnList.style.color = 'var(--primary)';
            }
            if (btnGrid) {
                btnGrid.style.background = 'transparent';
                btnGrid.style.color = '#94A3B8';
            }
        } else {
            if (btnGrid) {
                btnGrid.style.background = 'var(--primary-light)';
                btnGrid.style.color = 'var(--primary)';
            }
            if (btnList) {
                btnList.style.background = 'transparent';
                btnList.style.color = '#94A3B8';
            }
        }

        // Re-render
        if (this.currentRecipes) {
            this.renderDashboardSections(this.currentRecipes);
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
            this.loadRecipes({ favorite: true });
        } else if (view === 'recipes' || view === 'overview') {
            this.loadRecipes();
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
        if (this.viewMode === 'list') {
            container.classList.add('list-view');
            container.classList.remove('recipes-grid');
        } else {
            container.classList.remove('list-view');
            container.classList.add('recipes-grid');
        }

        if (this.viewMode === 'list') {
            const header = `
                <div class="list-header hidden-mobile-lg">
                    <div class="icon-cell"></div>
                    <div class="title-cell">Nombre</div>
                    <div class="meta-cell">Categoría</div>
                    <div class="meta-cell">Modificado</div>
                    <div class="meta-cell">Tiempo</div>
                    <div class="action-cell"></div>
                </div>
            `;
            const rows = recipes.map(recipe => {
                const date = new Date(recipe.updated_at).toLocaleDateString();
                return `
                    <div class="file-row group" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                        <div class="icon-cell">
                            <span class="material-symbols-outlined" style="font-size: 24px; color: #9CA3AF;">description</span>
                        </div>
                        <div class="title-cell">
                            <span class="title">${recipe.name_es}</span>
                            <div class="meta-mobile">General • ${date}</div>
                        </div>
                        <div class="meta-cell"><span class="badge-tag">General</span></div>
                        <div class="meta-cell">${date}</div>
                        <div class="meta-cell">--</div>
                        <div class="action-cell flex justify-end">
                             <button class="p-2 rounded-full hover:bg-gray-100 transition-colors" 
                                onclick="event.stopPropagation(); window.dashboard.toggleFavorite('${recipe.id}')">
                                <span class="material-symbols-outlined text-[20px] ${recipe.is_favorite ? 'fill-1 text-primary' : ''}">
                                    ${recipe.is_favorite ? 'star' : 'star_border'}
                                </span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
            container.innerHTML = header + rows;
        } else {
            container.innerHTML = recipes.map(recipe => `
                <div class="card-recipe animate-fade-in group cursor-pointer" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                    <div class="card-recipe__img relative overflow-hidden flex items-center justify-center bg-gray-50" style="aspect-ratio: 1/1;">
                        ${recipe.primaryImage ?
                    `<img src="${recipe.primaryImage}" alt="${recipe.name_es}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">` :
                    `<span class="material-symbols-outlined text-[48px] text-gray-300">description</span>`
                }
                        <div class="card-recipe__favorite absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button class="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-400 hover:text-primary"
                                onclick="event.stopPropagation(); window.dashboard.toggleFavorite('${recipe.id}')">
                                <span class="material-symbols-outlined text-[18px] ${recipe.is_favorite ? 'fill-1 text-primary' : ''}">
                                    ${recipe.is_favorite ? 'star' : 'star_border'}
                                </span>
                            </button>
                        </div>
                    </div>
                    <div class="card-recipe__info p-3">
                        <h3 class="text-sm font-medium text-gray-900 truncate mb-1">${recipe.name_es}</h3>
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] text-gray-500 font-medium px-2 py-0.5 bg-gray-100 rounded-full">General</span>
                            <span class="text-[11px] text-gray-400">${new Date(recipe.updated_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            `).join('');
        }
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

    async toggleFavorite(recipeId) {
        console.log('Toggle favorite:', recipeId);
        // Lógica de Supabase vendrá aquí
        window.utils.showToast('Receta guardada en favoritos');
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
