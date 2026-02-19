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
            <div class="card-featured animate-fade-in" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                <div class="card-featured__img-box">
                    <img src="${recipe.primaryImage || 'assets/placeholder-recipe.jpg'}" alt="${recipe.name_es}">
                </div>
                <div class="card-featured__content">
                    <h3>${recipe.name_es}</h3>
                    <p>${recipe.calories || '150'} kcal</p>
                    
                    <div class="card-featured__tags">
                        <div class="tag-item">
                            <span class="material-symbols-outlined">leaf</span>
                            <span>VEG</span>
                        </div>
                        <div class="tag-item">
                            <span class="material-symbols-outlined">nutrition</span>
                            <span>TOM</span>
                        </div>
                    </div>

                    <div class="card-featured__footer">
                        <button class="btn-watch">
                            <span class="material-symbols-outlined">play_circle</span>
                            Watch
                        </button>
                        <span class="time-label">
                            <span class="material-symbols-outlined">schedule</span>
                            ${recipe.prep_time_minutes || '15'} mins
                        </span>
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

        container.innerHTML = recipes.map(recipe => `
            <div class="card-compact animate-fade-in" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                <div class="card-compact__img">
                    <img src="${recipe.primaryImage || 'assets/placeholder-recipe.jpg'}" alt="${recipe.name_es}">
                </div>
                <div class="card-compact__info">
                    <h4>${recipe.name_es}</h4>
                    <p>${recipe.description_es || 'Una deliciosa receta casera...'}</p>
                    <span class="card-compact__time">
                        <span class="material-symbols-outlined">play_circle</span>
                        ${recipe.prep_time_minutes || '15'} mins
                    </span>
                </div>
            </div>
        `).join('');
    }

    renderSearchResults(recipes) {
        // Si el usuario busca, ocultamos las secciones y mostramos un grid normal
        const mainContent = document.getElementById('main-dashboard-content');
        const resultsContent = document.getElementById('search-results-content');

        if (recipes.length === 0) {
            // Mostrar empty state
        }
        // TODO: Implementar toggle de vistas de búsqueda
    }

    async loadCategories() {
        const chipsContainer = document.getElementById('categoryChips');
        if (!chipsContainer) return;

        const result = await window.db.getMyCategories();
        if (result.success) {
            const categories = result.categories;
            chipsContainer.innerHTML = `
                <button class="chip active" onclick="window.dashboard.handleCategory('all', this)">
                    All Recipes
                </button>
                ${categories.slice(0, 4).map(cat => `
                    <button class="chip" onclick="window.dashboard.handleCategory('${cat.id}', this)">
                        <span class="material-symbols-outlined">${cat.icon}</span>
                        ${cat.name_es}
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
}

// Inicializar y exponer
window.dashboard = new DashboardManager();
window.addEventListener('load', () => window.dashboard.init());
