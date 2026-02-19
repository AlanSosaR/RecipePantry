/**
 * RecipeDetailManager - RecipeHub Personal
 * Maneja la lógica de visualización de detalles de una receta,
 * incluyendo pestañas, carga de datos y acciones (favoritos, editar).
 */
class RecipeDetailManager {
    constructor() {
        this.recipeId = new URLSearchParams(window.location.search).get('id');
        this.currentRecipe = null;

        if (!this.recipeId) {
            window.location.href = 'index.html';
            return;
        }

        this.init();
    }

    async init() {
        // 1. Verificar autenticación
        const isAuth = await window.authManager.checkAuth();
        if (!isAuth) {
            window.location.href = 'index.html';
            return;
        }

        // 2. Cargar datos
        await this.loadRecipeData();

        // 3. Setup de la interfaz
        this.setupEventListeners();
    }

    async loadRecipeData() {
        try {
            const result = await window.db.getRecipeById(this.recipeId);

            if (!result.success) {
                console.error('Error cargando receta:', result.error);
                window.ui.showToast('No se pudo encontrar la receta', 'error');
                return;
            }

            this.currentRecipe = result.recipe;
            this.renderRecipe();

        } catch (error) {
            console.error('Error en loadRecipeData:', error);
        }
    }

    renderRecipe() {
        const recipe = this.currentRecipe;

        // Hero Background
        const heroEl = document.getElementById('recipeHero');
        if (recipe.primaryImage) {
            heroEl.style.backgroundImage = `url(${recipe.primaryImage})`;
        } else {
            heroEl.classList.add('no-image');
        }

        // Text data
        document.getElementById('recipeTitle').textContent = recipe.name_es;
        document.getElementById('recipeCategory').textContent = recipe.category?.name_es || 'Sin categoría';
        document.getElementById('recipeDescription').textContent = recipe.description_es || 'Sin descripción';
        document.getElementById('recipeTime').textContent = `${recipe.prep_time_minutes || 0}'`;
        document.getElementById('recipeServings').textContent = recipe.servings || '--';

        // Difficulty
        const difficultyMap = {
            'easy': 'Fácil',
            'medium': 'Media',
            'hard': 'Difícil'
        };
        document.getElementById('recipeDifficulty').textContent = difficultyMap[recipe.difficulty] || 'Fácil';

        // Date
        const date = new Date(recipe.created_at).toLocaleDateString();
        document.getElementById('recipeDate').textContent = date;

        // Favorite State
        const favBtn = document.getElementById('btnFavorite');
        if (recipe.is_favorite) {
            favBtn.classList.add('active');
            favBtn.querySelector('span').style.fontVariationSettings = "'FILL' 1";
        }

        this.renderIngredients();
        this.renderSteps();
    }

    renderIngredients() {
        const listEl = document.getElementById('ingredientsList');
        const ingredients = this.currentRecipe.ingredients || [];

        if (ingredients.length === 0) {
            listEl.innerHTML = '<p class="empty-text">No hay ingredientes registrados.</p>';
            return;
        }

        listEl.innerHTML = ingredients.map(ing => `
            <li class="ingredient-item">
                <input type="checkbox" id="ing-${ing.id}">
                <label for="ing-${ing.id}">
                    <span class="custom-checkbox"></span>
                    <span class="ing-text">${ing.raw_text}</span>
                </label>
            </li>
        `).join('');
    }

    renderSteps() {
        const stepsEl = document.getElementById('stepsList');
        const steps = this.currentRecipe.steps || [];

        if (steps.length === 0) {
            stepsEl.innerHTML = '<p class="empty-text">No hay pasos registrados.</p>';
            return;
        }

        stepsEl.innerHTML = steps.map((step, index) => `
            <div class="step-item">
                <div class="step-number">${index + 1}</div>
                <div class="step-text">${step.instruction_es}</div>
            </div>
        `).join('');
    }

    setupEventListeners() {
        // Tab Switching
        const tabs = document.querySelectorAll('.tab-item');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');
                this.switchTab(target);
            });
        });

        // Favorite Button
        document.getElementById('btnFavorite').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFavorite();
        });

        // Edit Button
        document.getElementById('btnEdit').addEventListener('click', () => {
            window.location.href = `recipe-form.html?id=${this.recipeId}`;
        });
    }

    switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab-item[data-tab="${tabId}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tabId}`).classList.add('active');
    }

    async toggleFavorite() {
        const favBtn = document.getElementById('btnFavorite');
        const isCurrentlyFavorite = this.currentRecipe.is_favorite;

        const result = await window.db.toggleFavorite(this.recipeId, isCurrentlyFavorite);

        if (result.success) {
            this.currentRecipe.is_favorite = !isCurrentlyFavorite;
            favBtn.classList.toggle('active');
            favBtn.querySelector('span').style.fontVariationSettings = `'FILL' ${this.currentRecipe.is_favorite ? 1 : 0}`;

            window.ui.showToast(
                this.currentRecipe.is_favorite ? 'Agregado a favoritos' : 'Eliminado de favoritos',
                'success'
            );
        } else {
            window.ui.showToast('Error al actualizar favoritos', 'error');
        }
    }
}
