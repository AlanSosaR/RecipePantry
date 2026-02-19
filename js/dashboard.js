// js/dashboard.js
// Lógica específica del Dashboard

class DashboardManager {
    constructor() {
        this.currentRecipes = [];
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

        // 2. Cargar datos iniciales
        await this.loadRecipes();
        this.loadCategories();
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
        // En este nuevo diseño, el dashboard tiene secciones fijas. 
        // Si hay búsqueda, mostramos un "Search Results" global.
        // Si no, mostramos las secciones del mockup.

        const result = await window.db.getMyRecipes(filters);

        if (!result.success) {
            console.error('Error cargando recetas:', result.error);
            return;
        }

        this.currentRecipes = result.recipes;

        if (filters.search) {
            this.renderSearchResults(this.currentRecipes);
        } else {
            this.renderDashboardSections(this.currentRecipes);
        }
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

        container.innerHTML = recipes.map(recipe => `
            <div class="card-recipe animate-fade-in group cursor-pointer" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                <div class="card-recipe__img relative overflow-hidden">
                    <img src="${recipe.primaryImage || 'assets/placeholder-recipe.jpg'}" alt="${recipe.name_es}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
                    <button class="absolute top-2 right-2 p-1.5 bg-white/90 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white text-gray-600 hover:text-red-500" 
                        onclick="event.stopPropagation(); window.dashboard.toggleFavorite('${recipe.id}')">
                        <span class="material-symbols-outlined text-[20px]">favorite_border</span>
                    </button>
                     <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
                         <span class="text-white text-xs font-medium flex items-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">visibility</span>
                             Ver
                         </span>
                    </div>
                </div>
                <div class="card-recipe__content p-3">
                    <div class="flex items-start justify-between gap-2 mb-1">
                        <h4 class="font-medium text-gray-900 text-sm line-clamp-1" title="${recipe.name_es}">${recipe.name_es}</h4>
                        <span class="material-symbols-outlined text-gray-400 text-[18px]">more_vert</span>
                    </div>
                    <div class="card-recipe__meta flex items-center gap-3 text-xs text-gray-500">
                        <div class="flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">schedule</span>
                            <span>${recipe.prep_time_minutes || '20'} min</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">local_fire_department</span>
                            <span>${recipe.calories || '150'} kcal</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Métodos renderFeatured y renderMore eliminados por redundancia en diseño Drive

    renderSearchResults(recipes) {
        const resultsGrid = document.getElementById('recipesGrid');
        if (!resultsGrid) return;

        document.getElementById('main-dashboard-content').classList.add('hidden');
        document.getElementById('search-results-content').classList.remove('hidden');

        if (recipes.length === 0) {
            resultsGrid.innerHTML = '<p class="empty-msg">No se encontraron recetas.</p>';
            return;
        }

        resultsGrid.innerHTML = recipes.map(recipe => `
            <div class="card-recipe animate-fade-in" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                <div class="card-recipe__img">
                    <img src="${recipe.primaryImage || 'assets/placeholder-recipe.jpg'}" alt="${recipe.name_es}">
                </div>
                <div class="card-recipe__content">
                    <h4>${recipe.name_es}</h4>
                    <div class="card-recipe__meta">
                        <div>
                            <span class="material-symbols-outlined">schedule</span>
                            <span>${recipe.prep_time_minutes || '20'} min</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async loadCategories() {
        const chipsContainer = document.getElementById('categoryChips');
        if (!chipsContainer) return;

        const result = await window.db.getMyCategories();
        if (result.success) {
            const categories = result.categories;
            chipsContainer.innerHTML = `
                <div class="flex items-center gap-3 p-4 card-hover" onclick="window.dashboard.handleCategory('all', this)" style="min-width: 200px; background: #F9FAFB; border: 1px solid #F1F5F9; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: all 0.2s ease;">
                    <span class="material-symbols-outlined fill-1" style="color: #94A3B8;">folder</span>
                    <span style="font-size: 14px; font-weight: 500; color: #374151;">Todas</span>
                </div>
                ${categories.map(cat => `
                    <div class="flex items-center gap-3 p-4 card-hover" onclick="window.dashboard.handleCategory('${cat.id}', this)" style="min-width: 200px; background: #F9FAFB; border: 1px solid #F1F5F9; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: all 0.2s ease;">
                        <span class="material-symbols-outlined fill-1" style="color: #94A3B8;">folder</span>
                        <span style="font-size: 14px; font-weight: 500; color: #374151;">${cat.name_es}</span>
                    </div>
                `).join('')}
            `;
        }
    }

    handleCategory(categoryId, chipEl) {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chipEl.classList.add('active');
        const filters = categoryId === 'all' ? {} : { categoryId };
        this.loadRecipes(filters);
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
