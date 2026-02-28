/**
 * RecipeDetailManager - Recipe Pantry Personal
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
            window.location.replace('/');
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

            // Check if this recipe was shared with the current user
            this.sharedBy = null;
            const currentUserId = window.authManager.currentUser?.id;
            if (currentUserId && this.currentRecipe.user_id !== currentUserId) {
                try {
                    const { data: shareData } = await window.supabaseClient
                        .from('shared_recipes')
                        .select('owner_user_id')
                        .eq('recipe_id', this.recipeId)
                        .eq('recipient_user_id', currentUserId)
                        .limit(1)
                        .maybeSingle();

                    if (shareData?.owner_user_id) {
                        const { data: ownerData } = await window.supabaseClient
                            .from('users')
                            .select('first_name, last_name')
                            .eq('id', shareData.owner_user_id)
                            .maybeSingle();
                        if (ownerData) {
                            this.sharedBy = [ownerData.first_name, ownerData.last_name].filter(Boolean).join(' ') || 'Alguien';
                        }
                    }
                } catch (e) {
                    console.warn('Could not check share info:', e);
                }
            }

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

        // Show "Compartida por" badge in the header nav bar
        const existingBadge = document.getElementById('shared-by-badge');
        if (existingBadge) existingBadge.remove();

        if (this.sharedBy) {
            const nav = document.querySelector('.premium-nav');
            if (nav) {
                const badge = document.createElement('div');
                badge.id = 'shared-by-badge';
                badge.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:6px 14px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); border-radius:99px; font-size:12px; font-weight:600; color:#10B981; white-space:nowrap;';
                badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">share</span> Compartida por ${this.sharedBy}`;
                // Insert between back button and action buttons
                const actionsDiv = nav.querySelector('div');
                if (actionsDiv) {
                    nav.insertBefore(badge, actionsDiv);
                } else {
                    nav.appendChild(badge);
                }
            }
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
                <label class="m3-ingredient-item">
                    <input class="hidden" type="checkbox" onchange="this.parentElement.classList.toggle('checked')"/>
                    <div class="m3-checkbox-premium">
                        <span class="material-symbols-outlined">check</span>
                    </div>
                    <span class="m3-ingredient-text">
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
                <div class="m3-step-item">
                    <div class="m3-step-badge">${idx + 1}</div>
                    <p class="m3-step-text">${instruction}</p>
                </div>
            `;
        }).join('');

        const timelineLine = `<div class="m3-steps-timeline"></div>`;
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
                window.location.href = `/recipe-form?id=${this.recipeId}`;
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
                    window.location.replace('/');
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

            const { name_es, name_en, description_es, description_en, category_id } = recipe;
            const res = await window.db.createRecipe({
                name_es, name_en,
                description_es, description_en,
                category_id,
                is_favorite: false,
                is_active: true
            });

            if (!res.success) throw new Error(res.error);
            const newId = res.recipe.id;

            if (recipe.ingredients?.length > 0) await window.db.addIngredients(newId, recipe.ingredients);
            if (recipe.steps?.length > 0) await window.db.addSteps(newId, recipe.steps);

            window.showToast(window.i18n ? window.i18n.t('saveSuccess') : '¡Copiada a tus recetas!', 'success');
            setTimeout(() => window.location.href = `/recipe-detail?id=${newId}`, 1500);
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
