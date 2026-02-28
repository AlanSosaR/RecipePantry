/**
 * RecipeFormManager - Recipe Pantry Personal
 * Maneja la creación y edición de recetas, incluyendo listas dinámicas
 * de ingredientes y pasos, y carga de imágenes.
 */
class RecipeFormManager {
    constructor() {
        this.recipeId = new URLSearchParams(window.location.search).get('id');
        this.isEditing = !!this.recipeId;
        this.currentRecipe = null;
        this.selectedImage = null;

        this.ingredients = [];
        this.steps = [];

        this.init();
    }

    async init() {
        // 1. Verificar auth
        const isAuth = await window.authManager.checkAuth();
        if (!isAuth) {
            window.location.replace('/');
            return;
        }

        // 2. No cargar categorías (usaremos General por defecto)

        // 3. Si es edición, cargar datos de la receta
        if (this.isEditing) {
            await this.loadRecipeData();
        } else {
            // Inicializar con un campo vacío de cada uno
            this.addIngredient();
            this.addStep();
        }

        // Limpiar error del nombre al escribir
        const nameInput = document.getElementById('name');
        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                const group = e.target.closest('.m3-field-container');
                if (group && group.classList.contains('has-error')) {
                    group.classList.remove('has-error');
                }
            });
        }

        this.setupEventListeners();
    }

    // Categorías ya no se cargan dinámicamente en el select

    async loadRecipeData() {
        document.getElementById('formTitle').textContent = window.i18n ? window.i18n.t('formEditRecipe') : 'Editar Receta';
        const result = await window.db.getRecipeById(this.recipeId);

        if (result.success) {
            const r = result.recipe;
            this.currentRecipe = r;

            // Llenar campos básicos (prefiriendo el idioma actual si existe, sino fallback a ES)
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const form = document.getElementById('recipeForm');
            form.name.value = isEn ? (r.name_en || r.name_es) : r.name_es;
            form.description.value = isEn ? (r.description_en || r.description_es || '') : (r.description_es || '');


            // Trigger has-value for all inputs/selects loaded
            form.querySelectorAll('input, select, textarea').forEach(el => {
                if (el.value) el.classList.add('has-value');
            });

            // Ingredients
            r.ingredients.forEach(ing => this.addIngredient(ing));
            if (r.ingredients.length === 0) this.addIngredient();

            // Pasos
            r.steps.forEach(step => this.addStep(step));
            if (r.steps.length === 0) this.addStep();
        }
    }

    setupEventListeners() {


        // Botones Agregar
        document.getElementById('btnAddIngredient').addEventListener('click', () => this.addIngredient());
        document.getElementById('btnAddStep').addEventListener('click', () => this.addStep());

        // OCR
        const btnOCROpen = document.getElementById('btnOCROpen');
        if (btnOCROpen) {
            btnOCROpen.addEventListener('click', () => {
                if (window.ocr) window.ocr.openModal();
            });
        }

        // Form Submit
        const btnSaveDirectOCR = document.getElementById('btnSaveDirectOCR');
        if (btnSaveDirectOCR) {
            btnSaveDirectOCR.addEventListener('click', () => {
                const name = document.getElementById('ocrRecipeName').value.trim();
                const res = window.currentOCRResults || {};
                this.saveProcessedRecipe(name, res.ingredientes || [], res.pasos || []);
            });
        }

        document.getElementById('recipeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRecipe();
        });
    }

    // --- Gestión de UI de Imagen ---


    // --- Listas Dinámicas ---
    addIngredient(data = null) {
        const container = document.getElementById('ingredientsList');
        // Usar clases del nuevo diseño (components.css form components)

        const item = document.createElement('div');
        item.className = 'flex items-center gap-3 group animate-fade-in mb-4';
        const labelTxt = window.i18n ? window.i18n.t('formIngredientsLabel') : 'Ingrediente';
        const delBtnTxt = window.i18n ? window.i18n.t('deleteBtn') : 'Eliminar';
        const msgError = window.i18n && window.i18n.getLang() === 'en' ? 'Ingredient cannot be empty' : 'El ingrediente no puede estar vacío';
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        item.innerHTML = `
            <span class="material-symbols-outlined text-gray-300 cursor-move">drag_indicator</span>
            <div class="m3-field m3-field-container flex-1 mb-0 has-action" style="margin-bottom:24px">
                <input type="text" class="ingredient-input m3-field-input" placeholder=" " value="${data ? (isEn ? (data.name_en || data.name_es) : data.name_es) : ''}">
                <label class="m3-field-label">${labelTxt}</label>
                <button type="button" class="m3-field-action del-btn" title="${delBtnTxt}">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <span class="m3-field-error">${msgError}</span>
            </div>
        `;

        const input = item.querySelector('input');
        input.addEventListener('input', (e) => {
            if (input.value) input.classList.add('has-value');
            else input.classList.remove('has-value');

            const group = e.target.closest('.m3-field-container');
            if (group && group.classList.contains('has-error')) {
                group.classList.remove('has-error');
            }
        });
        if (data) input.classList.add('has-value');

        item.querySelector('.del-btn').addEventListener('click', () => item.remove());
        container.appendChild(item);
    }

    addStep(data = null) {
        const container = document.getElementById('stepsList');
        const stepNum = container.children.length + 1;

        const item = document.createElement('div');
        item.className = 'flex gap-4 group animate-fade-in mb-4';
        const labelTxt = window.i18n ? window.i18n.t('formStepsLabel') : 'Descripción del paso';
        const delBtnTxt = window.i18n ? window.i18n.t('deleteBtn') : 'Eliminar';
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        item.innerHTML = `
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-sm flex items-center justify-center mt-3 step-number">${stepNum}</div>
            <div class="m3-field textarea flex-1 mb-0 has-action" style="margin-bottom:0">
                <textarea class="step-textarea block w-full resize-none" placeholder=" " rows="2">${data ? (isEn ? (data.instruction_en || data.instruction_es) : data.instruction_es) : ''}</textarea>
                <label>${labelTxt}</label>
                <button type="button" class="m3-field-action del-btn" title="${delBtnTxt}">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        `;

        const textarea = item.querySelector('textarea');
        textarea.addEventListener('input', () => {
            if (textarea.value) textarea.classList.add('has-value');
            else textarea.classList.remove('has-value');
        });
        if (data) textarea.classList.add('has-value');

        item.querySelector('.del-btn').addEventListener('click', () => {
            item.remove();
            this.updateStepNumbers();
        });
        container.appendChild(item);
    }

    updateStepNumbers() {
        const steps = document.getElementById('stepsList').querySelectorAll('.step-number');
        steps.forEach((badge, index) => {
            badge.textContent = index + 1;
        });
    }

    // --- Persistencia ---
    async saveRecipe() {
        const form = document.getElementById('recipeForm');
        const btnSave = document.getElementById('btnSave');

        try {
            const isEn = window.i18n && window.i18n.getLang() === 'en';

            // 1. Validaciones previas
            let hasError = false;
            const nameGroup = document.getElementById('recipe-name-group');

            const recipeName = form.name.value.trim();
            if (!recipeName) {
                if (nameGroup) nameGroup.classList.add('has-error');
                hasError = true;
            } else {
                if (nameGroup) nameGroup.classList.remove('has-error');
            }

            const ingredientInputs = document.querySelectorAll('.ingredient-input');
            let hasValidIngredient = false;
            ingredientInputs.forEach(input => {
                const group = input.closest('.m3-field-container');
                if (input.value.trim() === '') {
                    if (group) group.classList.add('has-error');
                    hasError = true;
                } else {
                    if (group) group.classList.remove('has-error');
                    hasValidIngredient = true;
                }
            });

            if (ingredientInputs.length === 0) {
                const msg = isEn ? "At least one ingredient is required" : "Debes agregar al menos un ingrediente";
                window.showToast(msg, 'error');
                hasError = true;
            }

            if (hasError) return;

            btnSave.disabled = true;
            const savingTxt = window.i18n ? window.i18n.t('saving') : 'Guardando...';
            btnSave.innerHTML = `<span class="spinner-small"></span> ${savingTxt}`;

            // Obtener ID de categoría 'General'
            const catsResult = await window.db.getMyCategories();
            const generalCat = catsResult.categories.find(c => (isEn ? (c.name_en || c.name_es) : c.name_es) === 'General') || catsResult.categories[0];

            const recipeData = {};
            if (isEn) {
                recipeData.name_en = form.name.value;
                recipeData.description_en = form.description.value;
            } else {
                recipeData.name_es = form.name.value;
                recipeData.description_es = form.description.value;
            }
            recipeData.category_id = generalCat ? generalCat.id : null;

            let recipeId = this.recipeId;
            let result;

            if (this.isEditing) {
                result = await window.db.updateRecipe(this.recipeId, recipeData);
            } else {
                result = await window.db.createRecipe(recipeData);
                recipeId = result.recipe?.id;
            }

            if (!result.success) {
                console.error('❌ Error de creación/actualización:', result.error);
                throw new Error(result.error);
            }



            // 2. Recolectar y Guardar Ingredientes
            const ingredientsData = Array.from(ingredientInputs)
                .map(input => {
                    const data = {};
                    if (isEn) data.name_en = input.value.trim();
                    else data.name_es = input.value.trim();
                    return data;
                })
                .filter(ing => (isEn ? ing.name_en : ing.name_es) !== '');

            if (this.isEditing) {
                await window.db.deleteIngredients(recipeId);
            }
            if (ingredientsData.length > 0) {
                await window.db.addIngredients(recipeId, ingredientsData);
            }

            // 3. Recolectar y Guardar Pasos
            const stepTextareas = document.querySelectorAll('.step-textarea');
            const stepsData = Array.from(stepTextareas)
                .map(textarea => {
                    const data = {};
                    if (isEn) data.instruction_en = textarea.value.trim();
                    else data.instruction_es = textarea.value.trim();
                    return data;
                })
                .filter(step => (isEn ? step.instruction_en : step.instruction_es) !== '');

            if (this.isEditing) {
                await window.db.deleteSteps(recipeId);
            }
            if (stepsData.length > 0) {
                await window.db.addSteps(recipeId, stepsData);
            }

            window.showToast(window.i18n ? window.i18n.t('saveSuccess') : '¡Receta guardada con éxito!', 'success');

            setTimeout(() => {
                window.location.href = `/recipe-detail?id=${recipeId}`;
            }, 1000);

        } catch (err) {
            console.error(err);
            window.showToast(window.i18n ? window.i18n.t('saveError') : 'Error al guardar la receta', 'error');
            btnSave.disabled = false;
            btnSave.textContent = window.i18n ? window.i18n.t('ocrSave') : 'Guardar Receta';
        }
    }

    /**
     * Guarda una receta directamente desde el OCR.
     */
    async saveProcessedRecipe(name, ingredients, steps) {
        const btnSaveOCR = document.getElementById('btnSaveDirectOCR');
        const ocrLoading = document.getElementById('ocrLoading');

        try {
            btnSaveOCR.disabled = true;
            const savingTxt = window.i18n ? window.i18n.t('saving') : 'Guardando...';
            btnSaveOCR.innerHTML = `<span class="spinner-small"></span> ${savingTxt}`;

            // 1. Obtener ID de categoría 'General'
            const catsResult = await window.db.getMyCategories();
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const generalCat = catsResult.categories.find(c => (isEn ? (c.name_en || c.name_es) : c.name_es) === 'General') || catsResult.categories[0];

            const recipeData = {};
            if (isEn) {
                recipeData.name_en = name;
                recipeData.description_en = window.i18n.t('ocrScanning');
            } else {
                recipeData.name_es = name;
                recipeData.description_es = 'Receta escaneada con OCR';
            }
            recipeData.category_id = generalCat ? generalCat.id : null;

            const result = await window.db.createRecipe(recipeData);
            const recipeId = result.recipe?.id;

            if (!result.success) throw new Error(result.error);

            // 2. Guardar Ingredientes
            if (ingredients.length > 0) {
                const ingredientsData = ingredients.map(ing => {
                    // Si ya es un objeto (formato nuevo/IA)
                    if (typeof ing === 'object' && ing !== null) {
                        const data = { quantity: ing.quantity || '' };
                        if (isEn) {
                            data.name_en = ing.name || '';
                            data.unit_en = ing.unit || '';
                        } else {
                            data.name_es = ing.name || '';
                            data.unit_es = ing.unit || '';
                        }
                        return data;
                    }
                    // Si es un string (formato legacy/Tesseract directo)
                    const data = { quantity: '' };
                    if (isEn) {
                        data.name_en = ing;
                        data.unit_en = '';
                    } else {
                        data.name_es = ing;
                        data.unit_es = '';
                    }
                    return data;
                });
                const ingResult = await window.db.addIngredients(recipeId, ingredientsData);
                if (!ingResult.success) console.warn('Error guardando ingredientes:', ingResult.error);
            }

            // 3. Guardar Pasos
            if (steps.length > 0) {
                const stepsData = steps.map((step, index) => {
                    // Si ya es un objeto
                    if (typeof step === 'object' && step !== null) {
                        const data = { step_number: step.number || (index + 1) };
                        if (isEn) data.instruction_en = step.instruction || '';
                        else data.instruction_es = step.instruction || '';
                        return data;
                    }
                    // Si es un string
                    const data = { step_number: index + 1 };
                    if (isEn) data.instruction_en = step;
                    else data.instruction_es = step;
                    return data;
                });
                const stepResult = await window.db.addSteps(recipeId, stepsData);
                if (!stepResult.success) console.warn('Error guardando pasos:', stepResult.error);
            }

            window.showToast(window.i18n ? window.i18n.t('saveSuccess') : '¡Receta creada con éxito!', 'success');

            if (window.ocr) window.ocr.close();

            setTimeout(() => {
                window.location.href = `/recipe-detail?id=${recipeId}`;
            }, 800);

        } catch (error) {
            console.error('Error salvando receta desde OCR:', error);
            window.showToast(window.i18n ? window.i18n.t('saveError') : 'Error al crear la receta', 'error');
            btnSaveOCR.disabled = false;
            const btnTxt = window.i18n ? window.i18n.t('ocrCreatingRecipe') : 'Crear Receta Ahora';
            btnSaveOCR.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px">cloud_upload</span> ${btnTxt}`;
        }
    }
}

// Inicializar
window.recipeForm = new RecipeFormManager();
