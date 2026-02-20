/**
 * RecipeFormManager - RecipeHub Personal
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
            window.location.href = 'index.html';
            return;
        }

        // 2. Cargar categorías en el select
        await this.loadCategories();

        // 3. Si es edición, cargar datos de la receta
        if (this.isEditing) {
            await this.loadRecipeData();
        } else {
            // Inicializar con un campo vacío de cada uno
            this.addIngredient();
            this.addStep();
        }

        this.setupEventListeners();
    }

    async loadCategories() {
        const select = document.getElementById('category');
        const result = await window.db.getMyCategories();

        if (result.success) {
            select.innerHTML = result.categories.map(cat => `
                <option value="${cat.id}">${cat.name_es}</option>
            `).join('');

            // Trigger has-value logic
            if (select.value) select.classList.add('has-value');
            select.addEventListener('change', () => {
                if (select.value) select.classList.add('has-value');
                else select.classList.remove('has-value');
            });
        }
    }

    async loadRecipeData() {
        document.getElementById('formTitle').textContent = 'Editar Receta';
        const result = await window.db.getRecipeById(this.recipeId);

        if (result.success) {
            const r = result.recipe;
            this.currentRecipe = r;

            // Llenar campos básicos
            const form = document.getElementById('recipeForm');
            form.name.value = r.name_es;
            form.description.value = r.description_es || '';
            form.category_id.value = r.category_id;
            form.difficulty.value = r.difficulty;
            form.prep_time_minutes.value = r.prep_time_minutes;
            form.servings.value = r.servings;

            // Imagen
            if (r.images && r.images.length > 0) {
                const primary = r.images.find(img => img.is_primary) || r.images[0];
                this.showPreview(primary.image_url);
            }

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
        // Imagen
        const uploadArea = document.getElementById('imageUploadArea');
        const imageInput = document.getElementById('imageInput');

        uploadArea.addEventListener('click', () => imageInput.click());
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.selectedImage = file;
                const reader = new FileReader();
                reader.onload = (e) => this.showPreview(e.target.result);
                reader.readAsDataURL(file);
            }
        });

        document.getElementById('btnRemoveImage').addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeImage();
        });

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
        document.getElementById('recipeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRecipe();
        });
    }

    // --- Gestión de UI de Imagen ---
    showPreview(url) {
        const preview = document.getElementById('imagePreview');
        const placeholder = document.querySelector('.upload-placeholder');
        const removeBtn = document.getElementById('btnRemoveImage');

        preview.src = url;
        preview.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
        if (removeBtn) removeBtn.classList.remove('hidden');
    }

    removeImage() {
        this.selectedImage = null;
        document.getElementById('imagePreview').classList.add('hidden');
        const placeholder = document.querySelector('.upload-placeholder');
        if (placeholder) placeholder.classList.remove('hidden');
        const removeBtn = document.getElementById('btnRemoveImage');
        if (removeBtn) removeBtn.classList.add('hidden');
        document.getElementById('imageInput').value = '';
    }

    // --- Listas Dinámicas ---
    addIngredient(data = null) {
        const container = document.getElementById('ingredientsList');
        // Usar clases del nuevo diseño (components.css form components)

        const item = document.createElement('div');
        item.className = 'flex items-center gap-3 group animate-fade-in mb-4';
        item.innerHTML = `
            <span class="material-symbols-outlined text-gray-300 cursor-move">drag_indicator</span>
            <div class="m3-field flex-1 mb-0" style="margin-bottom:0">
                <input type="text" class="ingredient-input" placeholder=" " value="${data ? data.raw_text || data.name_es : ''}" required>
                <label>Ingrediente</label>
            </div>
            <button type="button" class="del-btn text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1">
                <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
        `;

        const input = item.querySelector('input');
        input.addEventListener('input', () => {
            if (input.value) input.classList.add('has-value');
            else input.classList.remove('has-value');
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
        item.innerHTML = `
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-sm flex items-center justify-center mt-3 step-number">${stepNum}</div>
            <div class="m3-field textarea flex-1 mb-0" style="margin-bottom:0">
                <textarea class="step-textarea block w-full resize-none" placeholder=" " rows="2" required>${data ? data.instruction_es : ''}</textarea>
                <label>Descripción del paso</label>
            </div>
            <button type="button" class="del-btn text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all self-start mt-3 p-1">
                <span class="material-symbols-outlined text-[20px]">delete</span>
            </button>
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
            btnSave.disabled = true;
            btnSave.innerHTML = '<span class="spinner-small"></span> Guardando...';

            const recipeData = {
                name_es: form.name.value,
                description_es: form.description.value,
                category_id: form.category_id.value,
                difficulty: form.difficulty.value,
                prep_time_minutes: parseInt(form.prep_time_minutes.value) || 0,
                servings: parseInt(form.servings.value) || 0
            };

            let recipeId = this.recipeId;
            let result;

            if (this.isEditing) {
                result = await window.db.updateRecipe(this.recipeId, recipeData);
            } else {
                result = await window.db.createRecipe(recipeData);
                recipeId = result.recipe?.id;
            }

            if (!result.success) throw new Error(result.error);

            // 1. Guardar Imagen si hay una nueva
            if (this.selectedImage) {
                await window.db.uploadImage(this.selectedImage, recipeId);
            }

            // 2. Guardar Ingredientes (Lógica simplificada: borrar y recrear o actualizar)
            // Para simplicidad en este MVP, asumiremos que el backend maneja la relación o lo haremos manual post-MVP
            // window.ui.showToast('¡Receta guardada con éxito!', 'success');

            setTimeout(() => {
                window.location.href = `recipe-detail.html?id=${recipeId}`;
            }, 1000);

        } catch (error) {
            console.error('Error salvando receta:', error);
            window.ui.showToast('Error al guardar la receta', 'error');
            btnSave.disabled = false;
            btnSave.textContent = 'Guardar Receta';
        }
    }
}

// Inicializar
window.recipeForm = new RecipeFormManager();
