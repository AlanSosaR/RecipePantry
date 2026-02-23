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
                window.showToast('Receta no encontrada', 'error');
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
        const appEl = document.getElementById('app');

        if (recipe.primaryImage) {
            heroEl.style.backgroundImage = `url(${recipe.primaryImage})`;
            heroEl.classList.remove('no-image');
            if (appEl) appEl.classList.remove('no-image');
        } else {
            heroEl.style.backgroundImage = 'none';
            heroEl.classList.add('no-image');
            if (appEl) appEl.classList.add('no-image');
        }

        // Text data
        const titleMobile = document.getElementById('recipeTitleMobile');
        const titleDesktop = document.getElementById('recipeTitleDesktop');

        if (titleMobile) titleMobile.textContent = recipe.name_es;
        if (titleDesktop) titleDesktop.textContent = recipe.name_es;
        document.getElementById('recipeDescription').textContent = recipe.description_es || 'Sin descripción';

        // Pantry Content
        const pantrySection = document.getElementById('pantrySection');
        const pantryEl = document.getElementById('recipePantry');
        if (recipe.pantry_es) {
            pantrySection.style.display = 'block';
            pantryEl.textContent = recipe.pantry_es;
        } else {
            pantrySection.style.display = 'none';
        }

        // Difficulty removed from UI

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

        listEl.innerHTML = ingredients.map(ing => {
            const text = `${ing.quantity || ''} ${ing.unit_es || ''} ${ing.name_es}`.trim();
            return `
                <li class="ingredient-item">
                    <input type="checkbox" id="ing-${ing.id}">
                    <label for="ing-${ing.id}">
                        <span class="custom-checkbox"></span>
                        <span class="ing-text">${text}</span>
                    </label>
                </li>
            `;
        }).join('');
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
        // Tabs removed - All content shown at once

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

    // switchTab removed - No longer needed for unified view

    async toggleFavorite() {
        const favBtn = document.getElementById('btnFavorite');
        const isCurrentlyFavorite = this.currentRecipe.is_favorite;

        const result = await window.db.toggleFavorite(this.recipeId, isCurrentlyFavorite);

        if (result.success) {
            window.showToast(
                result.isFavorite ? 'Añadido a favoritos' : 'Eliminado de favoritos',
                'success'
            );
            this.currentRecipe.is_favorite = result.isFavorite;
            this.updateFavoriteButtonUI(result.isFavorite);
        } else {
            window.showToast('Error al actualizar favoritos', 'error');
        }
    }

    updateFavoriteButtonUI(isFavorite) {
        const favBtn = document.getElementById('btnFavorite');
        if (!favBtn) return;

        if (isFavorite) {
            favBtn.classList.add('active');
            favBtn.querySelector('span').style.fontVariationSettings = "'FILL' 1";
        } else {
            favBtn.classList.remove('active');
            favBtn.querySelector('span').style.fontVariationSettings = "'FILL' 0";
        }
    }
}
