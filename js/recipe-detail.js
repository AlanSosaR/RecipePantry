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
            window.location.replace('index.html');
            return;
        }

        this.init();
    }

    async init() {
        // 1. Verificar autenticación
        const isAuth = await window.authManager.checkAuth();
        if (!isAuth) {
            window.location.replace('index.html');
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
                window.showToast(window.i18n ? window.i18n.t('noRecipesTitle') : 'Receta no encontrada', 'error');
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
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        // Update Title and Description
        document.getElementById('recipeTitle').textContent = isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es;
        document.getElementById('recipeDescription').textContent = isEn ? (recipe.description_en || recipe.description_es) : (recipe.description_es || recipe.description_en);

        // Favorite State
        const favBtn = document.getElementById('btnFavorite');
        if (recipe.is_favorite && favBtn) {
            favBtn.classList.add('active');
            favBtn.querySelector('span').style.fontVariationSettings = "'FILL' 1";
        }

        // --- Permission Logic ---
        const btnEdit = document.getElementById('btnEdit');
        const btnDelete = document.getElementById('btnDelete');
        const currentUserId = window.authManager.currentUser?.id;
        const isOwner = recipe.user_id === currentUserId;

        if (!isOwner && this.permission) {
            if (btnEdit) btnEdit.style.display = 'none';
            if (btnDelete) btnDelete.style.display = 'none';
        }

        this.renderIngredients();
        this.renderSteps();
    }

    renderIngredients() {
        const listEl = document.getElementById('ingredientsList');
        const countEl = document.getElementById('ingredientsCount');
        const ingredients = this.currentRecipe.ingredients || [];
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        if (countEl) countEl.textContent = `${ingredients.length} items`;

        if (ingredients.length === 0) {
            listEl.innerHTML = `<p class="text-on-surface-variant dark:text-zinc-500 text-sm italic pl-2">${window.i18n ? window.i18n.t('ocrNoIngredients') : 'No hay ingredientes'}</p>`;
            return;
        }

        listEl.innerHTML = ingredients.map(ing => {
            const unit = isEn ? (ing.unit_en || ing.unit_es) : ing.unit_es;
            const name = isEn ? (ing.name_en || ing.name_es) : ing.name_es;
            const text = `${ing.quantity || ''} ${unit || ''} ${name}`.trim();

            return `
                <div class="flex items-center gap-5 group cursor-pointer py-1" onclick="const cb = this.querySelector('.cb-visual'); const inp = this.querySelector('input'); inp.checked = !inp.checked; this.querySelector('.ing-text').classList.toggle('strikethrough', inp.checked); this.querySelector('.ing-text').classList.toggle('text-zinc-400', inp.checked); cb.classList.toggle('bg-primary', inp.checked); cb.classList.toggle('border-primary', inp.checked); cb.classList.toggle('scale-90', inp.checked); cb.innerHTML = inp.checked ? '<span class=&quot;material-symbols-outlined text-white text-[14px] font-black&quot;>check</span>' : '';">
                    <input type="checkbox" class="hidden">
                    <div class="cb-visual w-6 h-6 rounded-lg border-2 border-slate-200 dark:border-zinc-800 group-hover:border-primary transition-all duration-300 flex items-center justify-center shrink-0 bg-white dark:bg-zinc-900 shadow-sm"></div>
                    <span class="ing-text text-zinc-700 dark:text-zinc-300 text-[17px] font-medium transition-all duration-300">${text}</span>
                </div>
            `;
        }).join('');
    }

    renderSteps() {
        const stepsEl = document.getElementById('stepsList');
        const steps = this.currentRecipe.steps || [];
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        if (steps.length === 0) {
            stepsEl.innerHTML = `<p class="text-on-surface-variant dark:text-zinc-500 text-sm italic pl-2">${window.i18n ? window.i18n.t('ocrNoSteps') : 'No hay pasos'}</p>`;
            return;
        }

        const stepsHtml = steps.map((step, index) => {
            const instruction = isEn ? (step.instruction_en || step.instruction_es) : step.instruction_es;
            // Extract a possible title (first sentence or first few words)
            const parts = instruction.split(/[.:\n]/);
            const title = parts.length > 1 ? parts[0] : `Paso ${index + 1}`;
            const body = parts.length > 1 ? instruction.substring(parts[0].length + 1).trim() : instruction;

            return `
                <div class="flex gap-8 relative group">
                    <div class="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shrink-0 font-black text-xl z-10 ring-8 ring-white dark:ring-[#0c1210] shadow-m3-l1 group-hover:scale-110 transition-transform duration-500">
                        ${index + 1}
                    </div>
                    <div class="pt-2">
                        <h3 class="font-black text-xl mb-3 text-zinc-900 dark:text-white transition-colors group-hover:text-primary leading-tight tracking-tight">
                            ${title}
                        </h3>
                        <p class="text-zinc-500 dark:text-zinc-400 text-[17px] leading-relaxed font-medium">
                            ${body}
                        </p>
                    </div>
                </div>
            `;
        }).join('');

        // Add the vertical connector line (positioned precisely behind the 56px/w-14 circles)
        const timelineLine = `<div class="absolute left-[26px] top-12 bottom-12 w-[3px] bg-slate-100 dark:bg-zinc-800/50 rounded-full"></div>`;
        stepsEl.innerHTML = timelineLine + stepsHtml;
    }

    setupEventListeners() {
        // Favorite Button
        document.getElementById('btnFavorite')?.addEventListener('click', (e) => {
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

        // Eventos básicos omitidos o simplificados para el nuevo diseño premium
    }

    async confirmDelete() {
        const confirmMsg = window.i18n ? window.i18n.t('deleteConfirm') : '¿Seguro que desea eliminar la receta?';
        const deleteBtnTxt = window.i18n ? window.i18n.t('deleteBtn') : 'ELIMINAR';

        window.showActionSnackbar(confirmMsg, deleteBtnTxt, async () => {
            const result = await window.db.deleteRecipe(this.recipeId);
            if (result.success) {
                window.showToast(window.i18n ? window.i18n.t('deleteSuccess') : 'Receta eliminada correctamente', 'success');
                setTimeout(() => {
                    window.location.replace('index.html');
                }, 1000);
            } else {
                window.showToast(window.i18n ? window.i18n.t('deleteError') : 'Error al eliminar la receta', 'error');
            }
        });
    }

    async copyRecipe() {
        const recipe = this.currentRecipe;
        try {
            window.showToast(window.i18n ? window.i18n.t('saving') : 'Guardando copia...', 'info');

            const { name_es, name_en, description_es, description_en, pantry_es, pantry_en, category_id } = recipe;
            const res = await window.db.createRecipe({
                name_es, name_en,
                description_es, description_en,
                pantry_es, pantry_en,
                category_id,
                is_favorite: false,
                is_active: true
            });

            if (!res.success) throw new Error(res.error);
            const newId = res.recipe.id;

            if (recipe.ingredients?.length > 0) await window.db.addIngredients(newId, recipe.ingredients);
            if (recipe.steps?.length > 0) await window.db.addSteps(newId, recipe.steps);

            window.showToast(window.i18n ? window.i18n.t('saveSuccess') : '¡Copiada a tus recetas!', 'success');
            setTimeout(() => window.location.href = `recipe-detail.html?id=${newId}`, 1500);
        } catch (err) {
            console.error('Error al copiar:', err);
            window.showToast('Error al copiar receta', 'error');
        }
    }

    async toggleFavorite() {
        const isCurrentlyFavorite = this.currentRecipe.is_favorite;
        const result = await window.db.toggleFavorite(this.recipeId, isCurrentlyFavorite);

        if (result.success) {
            const addedMsg = window.i18n ? window.i18n.t('favAdded') : 'Añadido a favoritos';
            const removedMsg = window.i18n ? window.i18n.t('favRemoved') : 'Eliminado de favoritos';
            window.showToast(result.isFavorite ? addedMsg : removedMsg, 'success');
            this.currentRecipe.is_favorite = result.isFavorite;
            this.updateFavoriteButtonUI(result.isFavorite);
        } else {
            window.showToast(window.i18n ? window.i18n.t('favError') : 'Error al actualizar favoritos', 'error');
        }
    }

    updateFavoriteButtonUI(isFavorite) {
        const favBtn = document.getElementById('btnFavorite');
        if (!favBtn) return;
        const span = favBtn.querySelector('span');
        if (isFavorite) {
            favBtn.classList.add('active');
            if (span) span.style.fontVariationSettings = "'FILL' 1";
        } else {
            favBtn.classList.remove('active');
            if (span) span.style.fontVariationSettings = "'FILL' 0";
        }
    }
}
