import { supabase } from './supabase-client.js';
import { auth } from './auth.js';
import { initTheme } from './ui.js';

// ── Estado global ──────────────────────────────────────────────────────────
let pendingOcrText = '';

// ── Inicialización ─────────────────────────────────────────────────────────
async function initApp() {
    initTheme();

    const { data: { session } } = await supabase.auth.getSession();
    navigateTo(session ? 'dashboard' : 'login');

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') navigateTo('dashboard');
        if (event === 'SIGNED_OUT') navigateTo('login');
    });
}

// ── Router ─────────────────────────────────────────────────────────────────
async function navigateTo(screenId) {
    const app = document.getElementById('app');
    showLoading(app);

    try {
        const response = await fetch(`reference_html/${screenId}.html`);
        if (!response.ok) throw new Error(`Pantalla no encontrada: ${screenId}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        app.innerHTML = `<div class="screen-wrapper fade-in">${doc.body.innerHTML}</div>`;
        setupScreenLogic(screenId);
    } catch (error) {
        console.error('[navigateTo]', error);
        app.innerHTML = `
            <div class="error-state">
                <span class="material-symbols-outlined text-5xl">error_outline</span>
                <p>Error al cargar la pantalla</p>
                <small>${error.message}</small>
            </div>`;
    }
}

function showLoading(container) {
    container.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Cargando...</p>
        </div>`;
}

// ── Lógica por pantalla ────────────────────────────────────────────────────
function setupScreenLogic(screenId) {
    switch (screenId) {
        case 'login': setupLoginScreen(); break;
        case 'dashboard': setupDashboardScreen(); break;
        case 'ocr-scanner': setupOCRScreen(); break;
        case 'add-recipe': setupAddRecipeScreen(); break;
        case 'recipe-details': setupRecipeDetailsScreen(); break;
        case 'profile': setupProfileScreen(); break;
        case 'cooking-mode': setupCookingModeScreen(); break;
    }
}

// ── PANTALLA: Login / Registro ─────────────────────────────────────────────
// ── PANTALLA: Login / Registro ─────────────────────────────────────────────
function setupLoginScreen() {
    const app = document.getElementById('app');

    const renderUnifiedAuth = (isRegister = false) => {
        const title = isRegister ? 'Únete a Recipe Pantry' : 'Bienvenido a tu Recetario';
        const primaryAction = isRegister ? 'Registrarse' : 'Ingresar';
        const switchText = isRegister ? 'Ya tengo cuenta, ingresar' : 'Crear cuenta con email';

        app.innerHTML = `
            <div class="auth-bg fade-in">
                <div class="login-card">
                    <div class="icon-container">
                        <span class="material-symbols-outlined" style="color: var(--primary); font-size: 48px;">menu_book</span>
                    </div>

                    <h1>${title}</h1>
                    <p class="subtitle">Tu colección privada de recetas, escaneadas y organizadas.</p>

                    <form id="unified-form">
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" id="email" class="form-input" placeholder="ejemplo@correo.com" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Contraseña</label>
                            <input type="password" id="password" class="form-input" placeholder="••••••••" required>
                        </div>
                        <button type="submit" class="btn-main" id="btn-submit">${primaryAction}</button>
                    </form>

                    <div class="divider">o continuar con</div>

                    <div class="social-buttons">
                        <button class="btn-social" id="btn-google">
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18">
                            Iniciar sesión con Google
                        </button>
                        <button class="btn-social btn-apple" id="btn-apple">
                            <i class="fa-brands fa-apple" style="font-size: 18px"></i>
                            Iniciar sesión con Apple
                        </button>
                    </div>

                    <a class="create-account-link" id="auth-toggle">
                        <span class="material-symbols-outlined" style="font-size: 18px">mail</span>
                        <span>${switchText}</span>
                    </a>

                    <div class="footer-legal">
                        Al continuar, aceptas nuestros <a href="#">Términos de Servicio</a> y <a href="#">Política de Privacidad</a>.
                    </div>
                </div>
            </div>
        `;

        // Event Listeners
        document.getElementById('auth-toggle')?.addEventListener('click', () => {
            renderUnifiedAuth(!isRegister);
        });

        document.getElementById('btn-google')?.addEventListener('click', () => {
            if (window.utils?.showToast) window.utils.showToast('Google disponible pronto');
            else if (typeof showToast === 'function') showToast('Google disponible pronto');
        });

        document.getElementById('btn-apple')?.addEventListener('click', () => {
            if (window.utils?.showToast) window.utils.showToast('Apple disponible pronto');
            else if (typeof showToast === 'function') showToast('Apple disponible pronto');
        });

        document.getElementById('unified-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btn = document.getElementById('btn-submit');
            const showT = window.utils?.showToast || (typeof showToast === 'function' ? showToast : console.log);
            const setL = window.utils?.setButtonLoading || (typeof setButtonLoading === 'function' ? setButtonLoading : () => { });

            setL(btn, true, isRegister ? 'Creando...' : 'Ingresando...');

            try {
                if (isRegister) {
                    const result = await auth.signUp(email, password, 'Chef');
                    if (result.error) throw result.error;
                    showT('¡Cuenta creada! Revisa tu email.', 'success');
                    setTimeout(() => renderUnifiedAuth(false), 3000);
                } else {
                    const result = await auth.signIn(email, password);
                    if (result.error) throw result.error;
                    // El cambio de estado de sesión debería disparar navigateTo('dashboard') en initApp
                }
            } catch (err) {
                showT(err.message, 'error');
            } finally {
                setL(btn, false, primaryAction);
            }
        });
    };

    renderUnifiedAuth(false);
}

// ── PANTALLA: Dashboard ────────────────────────────────────────────────────
async function setupDashboardScreen() {
    // Cargar datos del usuario
    try {
        const user = await auth.getUser();
        if (!user) { navigateTo('login'); return; }

        const { data: profile } = await supabase
            .from('users')
            .select('first_name, last_name, avatar_url, collection_name')
            .eq('auth_user_id', user.id)
            .single();

        if (profile) {
            const nameEl = document.getElementById('user-name');
            if (nameEl) nameEl.textContent = profile.first_name || 'Chef';
            const avatarEl = document.getElementById('user-avatar');
            if (avatarEl && profile.avatar_url) avatarEl.src = profile.avatar_url;
        }
    } catch (err) {
        console.warn('[setupDashboardScreen] perfil:', err);
    }

    // Cargar recetas
    await renderRecipeGrid();

    // Cargar categorías
    await renderCategories();

    // Binding de botones de navegación
    const ocrBtn = document.getElementById('btn-ocr');
    if (ocrBtn) ocrBtn.addEventListener('click', () => navigateTo('ocr-scanner'));

    const addBtn = document.getElementById('btn-add-recipe');
    if (addBtn) addBtn.addEventListener('click', () => navigateTo('add-recipe'));

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await auth.signOut();
        });
    }

    // Búsqueda
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            filterRecipeCards(e.target.value);
        }, 300));
    }

    // Navegación a perfil
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.addEventListener('click', () => navigateTo('profile'));

    // --- Offline Status UI (Dashboard) ---
    const offlineIndicator = document.getElementById('offline-indicator');
    const toggleOfflineUI = () => {
        if (offlineIndicator) {
            if (navigator.onLine) offlineIndicator.classList.add('hidden');
            else offlineIndicator.classList.remove('hidden');
        }
    };

    toggleOfflineUI(); / Set initial state
    window.addEventListener('online', toggleOfflineUI);
    window.addEventListener('offline', toggleOfflineUI);

    // Escuchar cuando el syncManager termina de vaciar la cola o cambian cosas
    window.addEventListener('sync-completed', () => {
        renderRecipeGrid();
    });

    window.addEventListener('recipes-updated-background', () => {
        renderRecipeGrid();
    });
}

async function renderRecipeGrid() {
    const { getRecipes } = await import('./recipes.js');
    const grid = document.getElementById('recipe-grid');
    if (!grid) return;

    grid.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div></div>`;

    const { data: recipes, error } = await getRecipes();

    if (error) {
        console.error('[renderRecipeGrid]', error);
        grid.innerHTML = `<p class="empty-msg">Error al cargar recetas.</p>`;
        return;
    }

    if (!recipes || recipes.length === 0) {
        grid.innerHTML = `
            <div class="empty-state col-span-2">
                <span class="material-symbols-outlined text-5xl">restaurant</span>
                <p>Aún no tienes recetas</p>
                <button class="btn-primary" onclick="window.navigateTo('add-recipe')">
                    <span class="material-symbols-outlined">add</span>
                    Crear primera receta
                </button>
            </div>`;
        return;
    }

    grid.innerHTML = recipes.map(r => createRecipeCard(r)).join('');

    // Bind clicks
    grid.querySelectorAll('[data-recipe-id]').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-favorite')) return;
            const id = card.dataset.recipeId;
            window.currentRecipeId = id;
            navigateTo('recipe-details');
        });
    });

    // Bind favoritos
    grid.querySelectorAll('.btn-favorite').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.recipeId;
            const isFav = btn.dataset.isFav === 'true';
            const icon = btn.querySelector('.material-symbols-outlined');
            const { toggleFavorite } = await import('./recipes.js');
            const { error } = await toggleFavorite(id, isFav);
            if (!error) {
                btn.dataset.isFav = String(!isFav);
                icon.textContent = !isFav ? 'favorite' : 'favorite_border';
                icon.classList.toggle('text-red-500', !isFav);
            }
        });
    });
}

function createRecipeCard(recipe) {
    const imageUrl = recipe.recipe_images?.[0]?.image_url || null;
    const categoryName = recipe.categories?.name_es || 'General';
    const time = (recipe.cook_time_minutes || 0) + (recipe.prep_time_minutes || 0);
    const isFav = recipe.is_favorite;

    return `
        <div class="recipe-card" data-recipe-id="${recipe.id}">
            <div class="recipe-card__img-wrap">
                ${imageUrl
            ? `<img src="${imageUrl}" alt="${escapeHtml(recipe.name_es)}" class="recipe-card__img">`
            : `<div class="recipe-card__img-placeholder"><span class="material-symbols-outlined">restaurant</span></div>`
        }
            </div>
            <h3 class="recipe-card__name">${escapeHtml(recipe.name_es || 'Sin nombre')}</h3>
            <p class="recipe-card__category">${escapeHtml(categoryName)}</p>
            <div class="recipe-card__footer">
                <span class="recipe-card__time">
                    <span class="material-symbols-outlined text-sm">schedule</span>
                    ${time > 0 ? `${time}m` : '—'}
                </span>
                <button class="btn-favorite" data-recipe-id="${recipe.id}" data-is-fav="${isFav}">
                    <span class="material-symbols-outlined ${isFav ? 'text-red-500' : ''}">${isFav ? 'favorite' : 'favorite_border'}</span>
                </button>
            </div>
        </div>`;
}

async function renderCategories() {
    const { data: categories } = await supabase
        .from('categories')
        .select('*')
        .order('order_index');

    const container = document.getElementById('categories-container');
    if (!container || !categories) return;

    container.innerHTML = categories.map((cat, i) => `
        <button class="category-chip ${i === 0 ? 'category-chip--active' : ''}"
                data-category-id="${cat.id}"
                onclick="window.filterByCategory('${cat.id}', this)">
            <span class="text-xl">${cat.icon || '🍽️'}</span>
            <span>${cat.name_es}</span>
        </button>`).join('');
}

function filterRecipeCards(query) {
    const cards = document.querySelectorAll('[data-recipe-id]');
    const q = query.toLowerCase();
    cards.forEach(card => {
        const name = card.querySelector('.recipe-card__name')?.textContent?.toLowerCase() || '';
        card.style.display = name.includes(q) ? '' : 'none';
    });
}

window.filterByCategory = async (categoryId, btn) => {
    document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('category-chip--active'));
    btn.classList.add('category-chip--active');

    const grid = document.getElementById('recipe-grid');
    if (!grid) return;

    const { getRecipesByCategory } = await import('./recipes.js');
    const { data: recipes } = await getRecipesByCategory(categoryId);
    if (recipes) grid.innerHTML = recipes.map(r => createRecipeCard(r)).join('');
};

// ── PANTALLA: OCR Scanner ──────────────────────────────────────────────────
async function setupOCRScreen() {
    const { scanImage } = await import('./ocr.js');

    const uploadArea = document.getElementById('ocr-upload-area');
    const resultArea = document.getElementById('ocr-result-text');
    const useTextBtn = document.getElementById('btn-use-text');
    const backBtn = document.getElementById('btn-ocr-back');

    if (backBtn) backBtn.addEventListener('click', () => navigateTo('dashboard'));

    if (!uploadArea) return;

    const fileInput = Object.assign(document.createElement('input'), {
        type: 'file',
        accept: 'image/*',
        className: 'hidden'
    });
    document.body.appendChild(fileInput);

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) processOCRFile(file, uploadArea, resultArea, useTextBtn, scanImage);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) processOCRFile(file, uploadArea, resultArea, useTextBtn, scanImage);
    });

    if (useTextBtn) {
        useTextBtn.addEventListener('click', () => {
            const text = resultArea?.innerText || '';
            if (text && text !== 'Aquí aparecerá el texto detectado...') {
                pendingOcrText = text;
                navigateTo('add-recipe');
            } else {
                showToast('Primero escanea una imagen.');
            }
        });
    }
}

async function processOCRFile(file, uploadArea, resultArea, useTextBtn, scanImage) {
    if (!file.type.startsWith('image/')) {
        showToast('Por favor selecciona una imagen.');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.className = 'ocr-preview-img';

        uploadArea.innerHTML = '';
        uploadArea.appendChild(img);

        if (resultArea) {
            resultArea.innerHTML = '<span class="ocr-analyzing">Analizando imagen<span class="dots">...</span></span>';
        }

        img.onload = async () => {
            const { text, confidence, error } = await scanImage(img);
            if (resultArea) {
                if (error) {
                    resultArea.innerHTML = `<span class="text-red-500">Error: ${escapeHtml(error)}</span>`;
                } else if (!text?.trim()) {
                    resultArea.innerHTML = '<em>No se detectó texto legible.</em>';
                } else {
                    resultArea.textContent = text;
                    if (useTextBtn) {
                        useTextBtn.disabled = false;
                        useTextBtn.classList.remove('opacity-50');
                    }
                    console.log(`[OCR] Confianza: ${confidence?.toFixed(1)}%`);
                }
            }
        };
    };
    reader.readAsDataURL(file);
}

// ── PANTALLA: Agregar Receta ───────────────────────────────────────────────
async function setupAddRecipeScreen() {
    const backBtn = document.getElementById('btn-add-back');
    const ocrBtn = document.getElementById('btn-ocr-inline');
    const saveBtn = document.getElementById('btn-save-recipe');
    const addIngBtn = document.getElementById('btn-add-ingredient');
    const addStepBtn = document.getElementById('btn-add-step');

    if (backBtn) backBtn.addEventListener('click', () => navigateTo('dashboard'));
    if (ocrBtn) ocrBtn.addEventListener('click', () => navigateTo('ocr-scanner'));
    if (saveBtn) saveBtn.addEventListener('click', saveRecipe);
    if (addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
    if (addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());

    // Cargar categorías en selector
    const categorySelect = document.getElementById('recipe-category');
    if (categorySelect) {
        const { data: cats } = await supabase.from('categories').select('*').order('order_index');
        if (cats) {
            categorySelect.innerHTML = '<option value="">Seleccionar categoría...</option>' +
                cats.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name_es}</option>`).join('');
        }
    }

    // Filas iniciales
    addIngredientRow();
    addStepRow();

    // Pre-llenar desde OCR
    if (pendingOcrText) {
        prefillFromOCR(pendingOcrText);
        pendingOcrText = '';
    }
}

function addIngredientRow(name = '', qty = '', unit = '') {
    const container = document.getElementById('ingredients-list');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
        <input class="input-field flex-[3]" type="text" placeholder="Ingrediente" value="${escapeHtml(name)}"/>
        <input class="input-field w-16" type="text" placeholder="Cant." value="${escapeHtml(qty)}"/>
        <input class="input-field w-20" type="text" placeholder="Unidad" value="${escapeHtml(unit)}"/>
        <button type="button" class="btn-icon-danger" onclick="this.closest('.ingredient-row').remove()">
            <span class="material-symbols-outlined">delete</span>
        </button>`;
    container.appendChild(row);
}

function addStepRow(instruction = '') {
    const container = document.getElementById('steps-list');
    if (!container) return;

    const stepNum = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'step-row';
    row.innerHTML = `
        <div class="step-num">${stepNum}</div>
        <textarea class="input-field flex-1 resize-none" rows="2" placeholder="Describe el paso...">${escapeHtml(instruction)}</textarea>
        <button type="button" class="btn-icon-danger" onclick="this.closest('.step-row').remove(); window.reorderSteps();">
            <span class="material-symbols-outlined">delete</span>
        </button>`;
    container.appendChild(row);
}

window.reorderSteps = () => {
    document.querySelectorAll('.step-num').forEach((el, i) => {
        el.textContent = i + 1;
    });
};

function prefillFromOCR(rawText) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;

    const nameField = document.getElementById('recipe-name');
    if (nameField && lines[0]) nameField.value = lines[0];

    // Resto del texto como primer paso
    const stepsContainer = document.getElementById('steps-list');
    if (stepsContainer && lines.length > 1) {
        stepsContainer.innerHTML = '';
        addStepRow(lines.slice(1).join('\n'));
    }
}

async function saveRecipe() {
    const name = document.getElementById('recipe-name')?.value?.trim();
    const categoryId = document.getElementById('recipe-category')?.value;
    const difficulty = document.getElementById('recipe-difficulty')?.value || 'easy';
    const prepTime = parseInt(document.getElementById('recipe-prep-time')?.value) || 0;
    const cookTime = parseInt(document.getElementById('recipe-cook-time')?.value) || 0;
    const servings = parseInt(document.getElementById('recipe-servings')?.value) || 1;
    const desc = document.getElementById('recipe-description')?.value?.trim() || '';
    const saveBtn = document.getElementById('btn-save-recipe');

    if (!name) {
        showToast('El nombre de la receta es obligatorio.');
        return;
    }

    setButtonLoading(saveBtn, true, 'Guardando...');

    try {
        const { getUserPublicId, createRecipeComplete } = await import('./recipes.js');
        const publicUserId = await getUserPublicId();

        if (!publicUserId) {
            showToast('Debes iniciar sesión para guardar recetas.');
            navigateTo('login');
            return;
        }

        // Recopilar ingredientes
        const ingredients = Array.from(document.querySelectorAll('.ingredient-row')).map(row => {
            const inputs = row.querySelectorAll('input');
            return {
                name_es: inputs[0]?.value?.trim() || '',
                quantity: parseFloat(inputs[1]?.value) || null,
                unit_es: inputs[2]?.value?.trim() || ''
            };
        }).filter(i => i.name_es);

        // Recopilar pasos
        const steps = Array.from(document.querySelectorAll('.step-row')).map((row, idx) => ({
            step_number: idx + 1,
            instruction_es: row.querySelector('textarea')?.value?.trim() || ''
        })).filter(s => s.instruction_es);

        const recipePayload = {
            user_id: publicUserId,
            name_es: name,
            description_es: desc,
            category_id: categoryId || null,
            difficulty,
            prep_time_minutes: prepTime,
            cook_time_minutes: cookTime,
            servings,
            created_from_ocr: pendingOcrText !== ''
        };

        const { error } = await createRecipeComplete(recipePayload, ingredients, steps);

        if (error) throw error;

        showToast('¡Receta guardada con éxito! 🎉');
        setTimeout(() => navigateTo('dashboard'), 1200);

    } catch (err) {
        console.error('[saveRecipe]', err);
        showToast(`Error: ${err.message}`);
    } finally {
        setButtonLoading(saveBtn, false, 'Guardar Receta');
    }
}

// ── PANTALLA: Detalles de Receta ───────────────────────────────────────────
async function setupRecipeDetailsScreen() {
    const backBtn = document.getElementById('btn-details-back');
    if (backBtn) backBtn.addEventListener('click', () => navigateTo('dashboard'));

    const deleteBtn = document.getElementById('btn-delete-recipe');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!confirm('¿Eliminar esta receta?')) return;
            const { deleteRecipe } = await import('./recipes.js');
            const { error } = await deleteRecipe(window.currentRecipeId);
            if (!error) navigateTo('dashboard');
            else showToast('Error al eliminar la receta.');
        });
    }

    if (!window.currentRecipeId) { navigateTo('dashboard'); return; }

    const { getRecipeById } = await import('./recipes.js');
    const { data: recipe, error } = await getRecipeById(window.currentRecipeId);

    if (error || !recipe) {
        showToast('No se pudo cargar la receta.');
        navigateTo('dashboard');
        return;
    }

    // Binding de botones de acción
    const cookBtn = document.getElementById('btn-cook-now');
    if (cookBtn) {
        cookBtn.addEventListener('click', () => {
            navigateTo('cooking-mode');
        });
    }

    const shareBtn = document.getElementById('btn-share-recipe');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            const shareData = {
                title: recipe.name_es,
                text: recipe.description_es,
                url: window.location.href
            };
            if (navigator.share) {
                navigator.share(shareData).catch(err => console.error('Error al compartir:', err));
            } else {
                navigator.clipboard.writeText(window.location.href);
                showToast('Enlace copiado al portapapeles');
            }
        });
    }

    // Rellenar datos en la pantalla
    const image = recipe.recipe_images?.[0]?.image_url;
    const imgEl = document.getElementById('detail-img');
    if (imgEl) {
        if (image) { imgEl.src = image; }
        else { imgEl.parentElement?.classList.add('no-img'); }
    }

    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '—';
    };

    setEl('detail-name', recipe.name_es);
    setEl('detail-category', recipe.categories?.name_es);
    setEl('detail-difficulty', { easy: 'Fácil', medium: 'Medio', hard: 'Difícil' }[recipe.difficulty] || '—');
    setEl('detail-prep-time', recipe.prep_time_minutes ? `${recipe.prep_time_minutes} min` : '—');
    setEl('detail-cook-time', recipe.cook_time_minutes ? `${recipe.cook_time_minutes} min` : '—');
    setEl('detail-servings', recipe.servings ? `${recipe.servings} porciones` : '—');
    setEl('detail-description', recipe.description_es);

    // Ingredientes
    const ingList = document.getElementById('detail-ingredients');
    if (ingList && recipe.ingredients?.length) {
        ingList.innerHTML = recipe.ingredients.map(i =>
            `<li class="ingredient-item">
                <span class="material-symbols-outlined text-sm text-primary">fiber_manual_record</span>
                <span>${escapeHtml(i.name_es)}${i.quantity ? ` — ${i.quantity} ${i.unit_es || ''}` : ''}</span>
            </li>`
        ).join('');
    }

    // Pasos
    const stepsList = document.getElementById('detail-steps');
    if (stepsList && recipe.preparation_steps?.length) {
        stepsList.innerHTML = recipe.preparation_steps
            .sort((a, b) => a.step_number - b.step_number)
            .map(s => `
                <li class="step-item">
                    <div class="step-item__num">${s.step_number}</div>
                    <p class="step-item__text">${escapeHtml(s.instruction_es)}</p>
                </li>`).join('');
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showFormError(form, message) {
    let errEl = form.querySelector('.form-error');
    if (!errEl) {
        errEl = Object.assign(document.createElement('p'), { className: 'form-error' });
        form.prepend(errEl);
    }
    errEl.textContent = message;
    errEl.style.display = 'block';
    setTimeout(() => { errEl.style.display = 'none'; }, 5000);
}

function showFormSuccess(form, message) {
    let el = form.querySelector('.form-success');
    if (!el) {
        el = Object.assign(document.createElement('p'), { className: 'form-success' });
        form.prepend(el);
    }
    el.textContent = message;
}

function setButtonLoading(btn, loading, text) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = text;
}

function showToast(message) {
    const existing = document.getElementById('toast');
    if (existing) existing.remove();
    const toast = Object.assign(document.createElement('div'), {
        id: 'toast',
        className: 'toast',
        textContent: message
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function translateAuthError(msg) {
    const errors = {
        'Invalid login credentials': 'Email o contraseña incorrectos.',
        'Email not confirmed': 'Por favor confirma tu email antes de ingresar.',
        'User already registered': 'Este email ya está registrado.',
        'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.'
    };
    return errors[msg] || msg;
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ── PANTALLA: Perfil ───────────────────────────────────────────────────────
async function setupProfileScreen() {
    const { initProfile } = await import('./profile.js');
    initProfile();
}

// ── PANTALLA: Modo Cocina ──────────────────────────────────────────────────
async function setupCookingModeScreen() {
    const { initCooking } = await import('./cooking.js');
    initCooking();
}

// ── Iniciar ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);
window.navigateTo = navigateTo;
