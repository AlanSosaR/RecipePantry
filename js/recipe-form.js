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

            // Ingredientes
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
        document.getElementById('btnOCR').addEventListener('click', () => {
            window.location.href = `ocr.html${this.isEditing ? '?id=' + this.recipeId : ''}`;
        });

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
        placeholder.classList.add('hidden');
        removeBtn.classList.remove('hidden');
    }

    removeImage() {
        this.selectedImage = null;
        document.getElementById('imagePreview').classList.add('hidden');
        document.querySelector('.upload-placeholder').classList.remove('hidden');
        document.getElementById('btnRemoveImage').classList.add('hidden');
        document.getElementById('imageInput').value = '';
    }

    // --- Listas Dinámicas ---
    addIngredient(data = null) {
        const container = document.getElementById('ingredientsList');
        const id = Date.now() + Math.random();

        const item = document.createElement('div');
        item.className = 'dynamic-item animate-fade-in';
        item.innerHTML = `
            <input type="text" class="ingredient-input" placeholder="Ej: 500g de harina" value="${data ? data.raw_text || data.name_es : ''}" required>
            <button type="button" class="btn-remove-small">
                <span class="material-symbols-outlined">delete</span>
            </button>
        `;

        item.querySelector('.btn-remove-small').addEventListener('click', () => item.remove());
        container.appendChild(item);
    }

    addStep(data = null) {
        const container = document.getElementById('stepsList');

        const item = document.createElement('div');
        item.className = 'dynamic-item step-form-item animate-fade-in';
        item.innerHTML = `
            <div class="step-num-badge"></div>
            <textarea class="step-input" placeholder="Describe el paso..." rows="2" required>${data ? data.instruction_es : ''}</textarea>
            <button type="button" class="btn-remove-small">
                <span class="material-symbols-outlined">delete</span>
            </button>
        `;

        item.querySelector('.btn-remove-small').addEventListener('click', () => item.remove());
        container.appendChild(item);
        this.updateStepNumbers();
    }

    updateStepNumbers() {
        // Opcional: Re-enumerar pasos si se desea visualmente
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
