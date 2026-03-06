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
        this.currentScale = 1;
        this.baseServings = 1;
        this.currentPortions = 1;

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
            const params = new URLSearchParams(window.location.search);
            const forceRefresh = params.get('f') === '1';

            const result = await window.db.getRecipeById(this.recipeId, forceRefresh);

            if (!result.success) {
                console.error('Error cargando receta:', result.error);
                window.showToast(window.i18n ? window.i18n.t('noRecipesTitle') : 'Receta no encontrada', 'error');
                return;
            }

            // Si fue forzado, limpiar la URL de forma silenciosa para que un refresh posterior use caché
            if (forceRefresh) {
                console.log('✅ Sincronización instantánea activada. Cargando datos frescos...');
                const newUrl = window.location.pathname + '?id=' + this.recipeId + (this.permission ? '&permission=' + this.permission : '');
                window.history.replaceState({}, '', newUrl);
            }

            this.currentRecipe = result.recipe;
            this.baseServings = this.currentRecipe.servings || 2;
            this.currentPortions = this.baseServings;
            this.currentScale = 1;

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

        // La insignia "Compartida por" fue removida por diseño.

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
        this.updateScalingUI();
    }

    updateScalingUI() {
        const selector = document.getElementById('servingSelector');
        const portionDisplay = document.getElementById('currentPortionDisplay');
        const portionText = document.getElementById('recipePortionText');

        if (!selector) return;
        selector.classList.remove('hidden');

        // Calcular porciones finales basándose en baseServings * escala
        const totalPortions = Math.max(0.1, this.baseServings * this.currentScale);

        // El número grande en el centro es el total de porciones/raciones
        // Si es decimal (ej: 0.5 porciones), mostrar con un decimal
        if (portionDisplay) {
            portionDisplay.textContent = totalPortions % 1 === 0 ? totalPortions : totalPortions.toFixed(2).replace(/\.?0+$/, '');
        }

        if (portionText) {
            // El texto abajo indica el factor de escala: "Receta por 0.5x"
            let scaleLabel = '';
            if (this.currentScale === 0.125) scaleLabel = '1/8';
            else if (this.currentScale === 0.25) scaleLabel = '1/4';
            else if (this.currentScale === 0.5) scaleLabel = '1/2';
            else if (this.currentScale === 0.75) scaleLabel = '3/4';
            else scaleLabel = this.currentScale % 1 === 0 ? this.currentScale : this.currentScale.toFixed(2).replace(/\.?0+$/, '');

            portionText.textContent = `Receta por ${scaleLabel}x`;
        }
    }

    updateScale(newScale) {
        if (newScale < 0.125) return;
        this.currentScale = newScale;

        // Forzar actualización de la UI y re-renderizado de ingredientes
        this.updateScalingUI();
        this.renderIngredients();
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

            // Scaling logic (v36.5.0)
            const scaledQty = ing.quantity ? (ing.quantity * this.currentScale) : null;
            const formattedQty = window.utils && window.utils.formatQuantity
                ? window.utils.formatQuantity(scaledQty, unit)
                : (scaledQty || '');

            const text = `${formattedQty} ${unit || ''} ${name}`.trim();

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

        stepsEl.innerHTML = steps.map((step, idx) => {
            const instruction = isEn ? (step.instruction_en || step.instruction_es) : step.instruction_es;
            const num = idx + 1;
            return `
                <label class="m3-step-item m3-step-checkable">
                    <input class="hidden" type="checkbox" onchange="this.closest('.m3-step-checkable').classList.toggle('step-done',this.checked)"/>
                    <div class="m3-step-badge">
                        <span class="step-num">${num}</span>
                        <span class="step-check material-symbols-outlined">check</span>
                    </div>
                    <p class="m3-step-text">${instruction}</p>
                </label>
            `;
        }).join('');
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

        // Listener para actualizaciones en segundo plano (Cache-First Revalidation)
        window.addEventListener('recipe-detail-updated', (e) => {
            const freshRecipe = e.detail;
            if (freshRecipe && freshRecipe.id === this.recipeId) {
                console.log('🔄 Detalle de receta actualizado en segundo plano');
                this.currentRecipe = freshRecipe;
                this.renderRecipe();
                window.showToast(window.i18n ? window.i18n.t('recipeUpdated') : 'Receta actualizada', 'info');
            }
        });

        // Eventos de Escala (Portions Stepper v36.9.1)
        const btnInc = document.getElementById('btnIncrease');
        const btnDec = document.getElementById('btnDecrease');

        const fractionalSteps = [0.125, 0.25, 0.5, 0.75, 1];

        if (btnInc) {
            btnInc.onclick = () => {
                let nextScale;
                if (this.currentScale < 1) {
                    // Buscar siguiente paso fraccional
                    nextScale = fractionalSteps.find(s => s > this.currentScale + 0.001) || 2;
                } else {
                    // Incrementar de 1 en 1
                    nextScale = Math.floor(this.currentScale) + 1;
                }
                this.updateScale(nextScale);
            };
        }

        if (btnDec) {
            btnDec.onclick = () => {
                let prevScale;
                if (this.currentScale <= 1) {
                    // Buscar paso fraccional anterior
                    prevScale = [...fractionalSteps].reverse().find(s => s < this.currentScale - 0.001) || 0.125;
                } else {
                    // Decrementar de 1 en 1
                    prevScale = Math.ceil(this.currentScale) - 1;
                }
                this.updateScale(prevScale);
            };
        }
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
