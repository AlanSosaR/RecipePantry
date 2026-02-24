/**
 * RecipeDetailManager - RecipeHub Personal
 * Maneja la lógica de visualización de detalles de una receta,
 * incluyendo pestañas, carga de datos y acciones (favoritos, editar).
 */
class RecipeDetailManager {
    constructor() {
        const params = new URLSearchParams(window.location.search);
        this.recipeId = params.get('id');
        this.permission = params.get('permission'); // 'view' o 'view_and_copy'
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
            heroEl.style.display = 'block';
        } else {
            heroEl.style.backgroundImage = 'none';
            heroEl.classList.add('no-image');
            if (appEl) appEl.classList.add('no-image');
            heroEl.style.display = 'block';
        }

        setTimeout(() => {
            heroEl.style.opacity = '1';
        }, 50);

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

        // Date
        const date = new Date(recipe.created_at).toLocaleDateString();
        document.getElementById('recipeDate').textContent = date;

        // Favorite State
        const favBtn = document.getElementById('btnFavorite');
        if (recipe.is_favorite) {
            favBtn.classList.add('active');
            favBtn.querySelector('span').style.fontVariationSettings = "'FILL' 1";
        }

        // --- Lógica de Permisos UI ---
        const btnEdit = document.getElementById('btnEdit');
        const btnDelete = document.getElementById('btnDelete');
        const permissionContainer = document.getElementById('permissionContainer');
        const currentUserId = window.authManager.currentUser?.id;
        const isOwner = recipe.user_id === currentUserId;

        // Si es el dueño, no aplicamos restricciones de banner ni ocultamos botones
        if (isOwner) {
            if (btnEdit) btnEdit.style.display = 'flex';
            if (btnDelete) btnDelete.style.display = 'flex';
            if (permissionContainer) permissionContainer.innerHTML = '';
        } else if (this.permission) {
            // Si hay permiso de URL y NO es el dueño, aplicamos restricciones
            if (btnEdit) btnEdit.style.display = 'none';
            if (btnDelete) btnDelete.style.display = 'none';

            const isCopyable = this.permission === 'view_and_copy' || this.permission === 'copiar';

            if (this.permission === 'view') {
                permissionContainer.innerHTML = `
                    <div class="permission-banner">
                        <div class="permission-info-row">
                            <span class="material-symbols-outlined">visibility</span>
                            <span class="text">👁️ Solo puedes ver · Expira en 7 días</span>
                        </div>
                    </div>
                `;
            } else if (isCopyable) {
                permissionContainer.innerHTML = `
                    <div class="permission-banner">
                        <div class="permission-info-row">
                            <span class="material-symbols-outlined">content_copy</span>
                            <span class="text">📋 Puedes agregar a tus recetas</span>
                        </div>
                        <button class="btn-copy-recipe" id="btnCopyRecipe">
                            <span class="material-symbols-outlined">add_circle</span>
                            Añadir a mis recetas
                        </button>
                    </div>
                `;
                // Listener para el nuevo botón
                setTimeout(() => {
                    const copyBtn = document.getElementById('btnCopyRecipe');
                    if (copyBtn) copyBtn.onclick = () => this.copyRecipe();
                }, 100);
            }
        }

        this.renderIngredients();
        this.renderSteps();
    }

    async copyRecipe() {
        const recipe = this.currentRecipe;
        const btn = document.getElementById('btnCopyRecipe');

        try {
            window.setButtonLoading(btn, true, 'Guardando...');

            // 1. Crear copia de la receta base (Solo columnas que existen en la DB)
            const { name_es, description_es, pantry_es, category_id } = recipe;
            const res = await window.db.createRecipe({
                name_es,
                description_es,
                pantry_es,
                category_id,
                is_favorite: false,
                is_active: true
            });

            if (!res.success) throw new Error(res.error);
            const newRecipeId = res.recipe.id;

            // 2. Copiar ingredientes
            if (recipe.ingredients?.length > 0) {
                await window.db.addIngredients(newRecipeId, recipe.ingredients);
            }

            // 3. Copiar pasos
            if (recipe.steps?.length > 0) {
                await window.db.addSteps(newRecipeId, recipe.steps);
            }

            window.showToast('✅ ¡Receta guardada en tu recetario!', 'success');

            // 4. Redirigir a la copia propia
            setTimeout(() => {
                window.location.href = `recipe-detail.html?id=${newRecipeId}`;
            }, 1500);

        } catch (err) {
            console.error('Error al copiar receta:', err);
            window.showToast('Error al guardar la receta', 'error');
            window.setButtonLoading(btn, false);
        }
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
        // Favorite Button
        document.getElementById('btnFavorite').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFavorite();
        });

        // Edit Button
        const btnEdit = document.getElementById('btnEdit');
        if (btnEdit) {
            btnEdit.addEventListener('click', () => {
                window.location.href = `recipe-form.html?id=${this.recipeId}`;
            });
        }

        // Delete Button
        const btnDelete = document.getElementById('btnDelete');
        if (btnDelete) {
            btnDelete.addEventListener('click', () => {
                this.confirmDelete();
            });
        }
    }

    async confirmDelete() {
        window.showActionSnackbar('¿Seguro que desea eliminar la receta?', 'ELIMINAR', async () => {
            const result = await window.db.deleteRecipe(this.recipeId);
            if (result.success) {
                window.showToast('Receta eliminada correctamente', 'success');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } else {
                window.showToast('Error al eliminar la receta', 'error');
            }
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
