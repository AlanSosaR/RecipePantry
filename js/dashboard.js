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

        // Navegación Sidebar Desktop
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.switchView(view, item);
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

        const isHidden = drawer.classList.contains('-translate-x-full');
        const shouldOpen = forceState !== null ? forceState : isHidden;

        if (shouldOpen) {
            drawer.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.remove('opacity-0'), 10); // Fade in
        } else {
            drawer.classList.add('-translate-x-full');
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 300); // Wait for transition
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
        if (activeItem) activeItem.classList.add('active');

        // Actualizar mobile (si existe)
        document.querySelectorAll('.nav-item-mobile').forEach(i => {
            if (i.dataset.view === view) i.classList.add('bg-emerald-light', 'text-primary');
            else i.classList.remove('bg-emerald-light', 'text-primary');
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
        // 1. "Based on the food you like" (primeras 3)
        const featured = recipes.slice(0, 3);
        this.renderFeatured(featured);

        // 2. "More Recipes" (el resto)
        const more = recipes.slice(3);
        this.renderMore(more);
    }

    renderFeatured(recipes) {
        container.innerHTML = recipes.map(recipe => `
            <div class="group cursor-pointer card-hover animate-fade-in" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'" style="border-radius: 16px; overflow: hidden; border: 1px solid #F1F5F9; background: white; transition: all 0.3s ease;">
                <div style="aspect-ratio: 1/1; overflow: hidden; position: relative; background: #F8FAFC; border-bottom: 1px solid #F1F5F9;">
                    <img src="${recipe.primaryImage || 'assets/placeholder-recipe.jpg'}" alt="${recipe.name_es}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;">
                    <div style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.9); padding: 4px; border-radius: 8px; opacity: 0; transition: opacity 0.2s ease;" class="card-more-btn">
                        <span class="material-symbols-outlined" style="font-size: 18px; color: #4B5563;">more_vert</span>
                    </div>
                </div>
                <div style="padding: 12px; display: flex; align-items: flex-start; gap: 8px;">
                    <span class="material-symbols-outlined" style="color: var(--primary); font-size: 20px; margin-top: 2px;">description</span>
                    <div style="flex: 1; min-width: 0;">
                        <h3 style="font-size: 14px; font-weight: 500; color: #111827; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${recipe.name_es}</h3>
                        <p style="font-size: 12px; color: #94A3B8; margin: 2px 0 0;">${recipe.prep_time_minutes || '20'} min • ${recipe.category_name || 'Receta'}</p>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderMore(recipes) {
        const container = document.getElementById('moreRecipesList');
        if (!container) return;

        if (recipes.length === 0) {
            container.innerHTML = '<p class="empty-msg">Explora más recetas pronto.</p>';
            return;
        }

        // En móvil usamos el mismo estilo de tarjeta premium pero tal vez en un grid diferente
        container.innerHTML = recipes.map(recipe => `
            <div class="card-recipe animate-fade-in" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                <div class="card-recipe__img">
                    <img src="${recipe.primaryImage || 'assets/placeholder-recipe.jpg'}" alt="${recipe.name_es}">
                    <button class="card-recipe__save" onclick="event.stopPropagation(); window.dashboard.toggleFavorite('${recipe.id}')">
                        <span class="material-symbols-outlined">favorite_border</span>
                    </button>
                </div>
                <div class="card-recipe__content">
                    <h4>${recipe.name_es}</h4>
                    <div class="card-recipe__meta">
                        <div>
                            <span class="material-symbols-outlined">schedule</span>
                            <span>${recipe.prep_time_minutes || '20'} min</span>
                        </div>
                        <div>
                            <span class="material-symbols-outlined">electric_bolt</span>
                            <span>${recipe.calories || '150'} kcal</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

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
