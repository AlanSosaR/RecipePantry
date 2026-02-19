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

        // Navegación Sidebar
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.switchView(view, item);
            });
        });
    }

    switchView(view, activeItem) {
        console.log('Cambiando a vista:', view);
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        activeItem.classList.add('active');

        // Lógica de filtrado rápido según la vista
        if (view === 'favorites') {
            this.loadRecipes({ favorite: true });
        } else if (view === 'recipes' || view === 'overview') {
            this.loadRecipes();
        }
    }

    handleNav(view) {
        // Encontrar el item correspondiente en el sidebar para mantener sincronía
        const sidebarItem = document.querySelector(`.nav-item[data-view="${view}"]`);
        if (sidebarItem) {
            this.switchView(view, sidebarItem);
        } else {
            console.log('Navegando vía Bottom Nav:', view);
            if (view === 'saved') {
                this.loadRecipes({ favorite: true });
            } else {
                this.loadRecipes();
            }
        }

        // Actualizar estado activo en bottom-nav
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        if (event && event.currentTarget && event.currentTarget.classList.contains('nav-btn')) {
            event.currentTarget.classList.add('active');
        }
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
        const container = document.getElementById('featuredGrid');
        if (!container) return;

        if (recipes.length === 0) {
            container.innerHTML = '<p class="empty-msg">No hay sugerencias aún.</p>';
            return;
        }

        container.innerHTML = recipes.map(recipe => `
            <div class="card-recipe animate-fade-in" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                <div class="card-recipe__img">
                    <img src="${recipe.primaryImage || 'assets/placeholder-recipe.jpg'}" alt="${recipe.name_es}">
                    <button class="card-recipe__save" onclick="event.stopPropagation(); window.dashboard.toggleFavorite('${recipe.id}')">
                        <span class="material-symbols-outlined">${recipe.isFavorited ? 'favorite' : 'favorite_border'}</span>
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
                <button class="chip active" onclick="window.dashboard.handleCategory('all', this)">
                    <span class="material-symbols-outlined">grid_view</span>
                    <span>Todos</span>
                </button>
                ${categories.map(cat => `
                    <button class="chip" onclick="window.dashboard.handleCategory('${cat.id}', this)">
                        <span class="material-symbols-outlined">${cat.icon || 'restaurant'}</span>
                        <span>${cat.name_es}</span>
                    </button>
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
