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
        // 1. Verificar autenticación con redirección inteligente
        const isAuth = await window.authManager.checkAuth();
        if (!isAuth) {
            window.authManager.requireAuth(); // Esto maneja el redirectAfterLogin
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
        const titleEl = document.getElementById('recipeTitle');
        const descEl = document.getElementById('recipeDescription');
        const categoryEl = document.getElementById('recipeCategory'); // Assuming this element exists for category

        // Título: Primera palabra en color primario
        const name = isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es;
        const fullTitle = name || (window.i18n ? window.i18n.t('recipeNotFound') : 'Receta');
        const titleParts = fullTitle.split(' ');
        const firstWord = titleParts[0];
        const restOfTitle = titleParts.slice(1).join(' ');

        if (titleEl) {
            titleEl.innerHTML = `<span class="text-primary">${firstWord}</span> ${restOfTitle}`;
        }

        if (descEl) {
            descEl.textContent = isEn ? (recipe.description_en || recipe.description_es) : recipe.description_es;
            if (!descEl.textContent) {
                descEl.textContent = window.i18n ? window.i18n.t('noDescription') : 'No hay descripción disponible.';
            }
        }

        if (categoryEl) {
            const categoryName = isEn ? (recipe.category?.name_en || recipe.category?.name_es) : recipe.category?.name_es;
            categoryEl.textContent = categoryName || (window.i18n ? window.i18n.t('generalCategory') : 'General');
        }

        // --- Image Handling ---
        const imageEl = document.getElementById('recipeImage');
        if (imageEl) {
            const primaryImage = recipe.images?.find(img => img.is_primary) || recipe.images?.[0];
            const imageUrl = primaryImage?.image_url || recipe.image_url || window.DEFAULT_RECIPE_IMAGE;
            imageEl.src = imageUrl;
        }

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

        if (!listEl) return;

        if (ingredients.length === 0) {
            listEl.innerHTML = `<p class="text-on-surface-variant dark:text-zinc-500 text-sm italic pl-2">${window.i18n ? window.i18n.t('ocrNoIngredients') : 'No hay ingredientes'}</p>`;
            return;
        }

        listEl.innerHTML = ingredients.map(ing => {
            const unit = isEn ? (ing.unit_en || ing.unit_es) : ing.unit_es;
            const name = isEn ? (ing.name_en || ing.name_es) : ing.name_es;
            const text = `${ing.quantity || ''} ${unit || ''} ${name}`.trim();

            return `
                <label class="flex items-start gap-6 py-5 px-4 rounded-m3-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.05] cursor-pointer transition-colors group active:bg-black/[0.05] min-h-[72px]">
                    <input class="hidden peer" type="checkbox" onchange="this.nextElementSibling.nextElementSibling.classList.toggle('opacity-50'); this.nextElementSibling.nextElementSibling.classList.toggle('line-through')"/>
                    <div class="mt-0.5 w-10 h-10 rounded-full border-[3px] border-primary/40 group-hover:border-primary transition-all flex items-center justify-center shrink-0 bg-white dark:bg-zinc-900 shadow-sm peer-checked:bg-primary peer-checked:border-primary peer-checked:shadow-md">
                        <span class="material-symbols-outlined text-white text-[26px] font-bold opacity-0 peer-checked:opacity-100 transition-opacity scale-75 peer-checked:scale-100 duration-200">check</span>
                    </div>
                    <span class="flex-1 text-on-surface dark:text-zinc-200 text-[19px] leading-[1.6] font-medium transition-all pt-1">
                        ${text}
                    </span>
                </label>
            `;


        }).join('');
    }

    renderSteps() {
        const stepsEl = document.getElementById('stepsList');
        const steps = this.currentRecipe.steps || [];
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        if (!stepsEl) return;

        if (steps.length === 0) {
            stepsEl.innerHTML = `<p class="text-on-surface-variant dark:text-zinc-500 text-sm italic pl-2">${window.i18n ? window.i18n.t('ocrNoSteps') : 'No hay pasos'}</p>`;
            return;
        }

        const stepsHtml = steps.map((step, idx) => {
            const instruction = isEn ? (step.instruction_en || step.instruction_es) : step.instruction_es;
            return `
                <div class="flex gap-6 relative">
                    <div class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shrink-0 font-bold text-sm z-10 ring-4 ring-surface dark:ring-[#0c1210] shadow-md">${idx + 1}</div>
                    <div>
                        <p class="text-on-surface-variant dark:text-zinc-400 text-lg leading-relaxed">${instruction}</p>
                    </div>
                </div>
            `;
        }).join('');

        const timelineLine = `<div class="absolute left-[20px] top-10 bottom-10 w-[2px] bg-primary/10 dark:bg-primary/20"></div>`;
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

// Inicializar y exponer instancia global
window.recipeDetailManager = new RecipeDetailManager();
