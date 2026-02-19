// js/dashboard.js
// Lógica específica del Dashboard

class DashboardManager {
    constructor() {
        this.currentRecipes = [];
        this.currentFilter = 'all';
    }

    async init() {
        console.log('🚀 Inicializando RecipeHub...');

        // 1. Verificar autenticación silenciosamente
        const isAuthenticated = await window.authManager.checkAuth();

        const landingEl = document.getElementById('landing-section');
        const dashboardEl = document.getElementById('dashboard-section');

        if (!isAuthenticated) {
            console.log('💡 Mostrando modo landing');
            if (landingEl) landingEl.classList.remove('hidden');
            if (dashboardEl) dashboardEl.classList.add('hidden');
            return;
        }

        console.log('✅ Usuario logueado, mostrando dashboard');
        if (landingEl) landingEl.classList.add('hidden');
        if (dashboardEl) dashboardEl.classList.remove('hidden');

        // Cargar datos del usuario para el saludo
        const name = window.authManager.currentUser.first_name || 'Chef';
        const greetingEl = document.getElementById('user-greeting');
        if (greetingEl) greetingEl.textContent = `Hola, ${name}`;

        // 2. Cargar datos iniciales
        await this.loadRecipes();
        this.loadStats();
        this.loadCategories();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let timeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.loadRecipes({ search: e.target.value }), 300);
            });
        }
    }

    async loadRecipes(filters = {}) {
        const loadingEl = document.getElementById('loadingState');
        const gridEl = document.getElementById('recipesGrid');
        const emptyEl = document.getElementById('emptyState');

        if (loadingEl) loadingEl.classList.remove('hidden');
        if (gridEl) gridEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');

        const result = await window.db.getMyRecipes(filters);

        if (loadingEl) loadingEl.classList.add('hidden');

        if (!result.success) {
            console.error('Error cargando recetas:', result.error);
            return;
        }

        this.currentRecipes = result.recipes;

        if (this.currentRecipes.length === 0) {
            if (emptyEl) emptyEl.classList.remove('hidden');
        } else {
            if (gridEl) {
                gridEl.classList.remove('hidden');
                this.renderRecipes(this.currentRecipes);
            }
        }
    }

    renderRecipes(recipes) {
        const gridEl = document.getElementById('recipesGrid');
        if (!gridEl) return;

        gridEl.innerHTML = recipes.map(recipe => `
            <div class="recipe-card animate-fade-in" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                <div class="recipe-card-actions" onclick="event.stopPropagation()">
                    <button 
                        class="icon-button favorite ${recipe.is_favorite ? 'active' : ''}" 
                        onclick="window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite})"
                    >
                        <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' ${recipe.is_favorite ? 1 : 0}">
                            favorite
                        </span>
                    </button>
                    <button class="icon-button" onclick="window.location.href='recipe-form.html?id=${recipe.id}'">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                </div>
                
                <div class="recipe-card-image ${!recipe.primaryImage ? 'no-image' : ''}">
                    ${recipe.primaryImage ?
                `<img src="${recipe.primaryImage}" alt="${recipe.name_es}" loading="lazy">` :
                `<span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.3">restaurant</span>`
            }
                </div>
                
                <div class="recipe-card-content">
                    <div class="recipe-card-category" style="background: ${recipe.category?.color}20; color: ${recipe.category?.color}">
                        <span class="material-symbols-outlined" style="font-size: 14px">${recipe.category?.icon || 'label'}</span>
                        ${recipe.category?.name_es || 'Sin categoría'}
                    </div>
                    <h3 class="recipe-card-title">${recipe.name_es}</h3>
                    <div class="recipe-card-meta">
                        <div class="meta-item">
                            <span class="material-symbols-outlined" style="font-size: 16px">schedule</span>
                            ${recipe.prep_time_minutes || 0}'
                        </div>
                        <div class="meta-item">
                            <span class="material-symbols-outlined" style="font-size: 16px">restaurant</span>
                            ${recipe.difficulty === 'easy' ? 'Fácil' : recipe.difficulty === 'medium' ? 'Media' : 'Difícil'}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async toggleFavorite(recipeId, currentStatus) {
        const result = await window.db.toggleFavorite(recipeId, currentStatus);
        if (result.success) {
            this.loadRecipes({ search: document.getElementById('searchInput')?.value });
        }
    }

    async loadStats() {
        const statsEl = document.getElementById('statsSection');
        if (!statsEl) return;

        const total = this.currentRecipes.length;
        const favs = this.currentRecipes.filter(r => r.is_favorite).length;

        statsEl.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Recetas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: var(--error)">${favs}</div>
                    <div class="stat-label">Favoritos</div>
                </div>
            </div>
        `;
    }

    async loadCategories() {
        const chipsContainer = document.getElementById('categoryChips');
        if (!chipsContainer) return;

        const result = await window.db.getMyCategories();
        if (result.success) {
            const categories = result.categories;
            chipsContainer.innerHTML = `
                <button class="chip active" onclick="window.dashboard.handleCategory('all', this)">
                    Todas
                </button>
                ${categories.map(cat => `
                    <button class="chip" onclick="window.dashboard.handleCategory('${cat.id}', this)">
                        <span class="material-symbols-outlined" style="font-size: 18px">${cat.icon}</span>
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
