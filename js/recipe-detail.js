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

    isRootFolder(f) {
        if (!f || typeof f !== 'string') return true;
        const trimmed = f.trim().toLowerCase();
        return !trimmed || trimmed === 'general' || trimmed === 'mis recetas' || trimmed === 'my recipes' || trimmed === 'todas las recetas' || trimmed === 'all recipes';
    }

    async goBack() {
        if (this._isGoingBack) return;
        this._isGoingBack = true;

        const params = new URLSearchParams(window.location.search);
        let folder = params.get('folder');

        // Si no vino en el parámetro URL, verificar si la receta pertenece a una carpeta
        if (!folder && this.currentRecipe) {
            const rawFolder = this.currentRecipe.pantry_es || this.currentRecipe.pantry_en;
            if (rawFolder && !this.isRootFolder(rawFolder)) {
                folder = rawFolder.trim();
            }
        }

        // Si aún no se resolvió, consultar sessionStorage como respaldo
        if (!folder) {
            try {
                const sess = sessionStorage.getItem('rp_current_folder');
                if (sess && !this.isRootFolder(sess)) {
                    folder = sess.trim();
                }
            } catch (e) {}
        }

        if (folder && folder.trim()) {
            const cleanFolder = folder.trim();
            try {
                sessionStorage.setItem('rp_current_folder', cleanFolder);
                if (window.localDB && this.currentRecipe) {
                    const idx = (await window.localDB.get('recipes_index', this.currentRecipe.id)) || {};
                    idx.id = this.currentRecipe.id;
                    idx.pantry_es = cleanFolder;
                    idx.pantry_en = cleanFolder;
                    const rName = this.currentRecipe.name_es || this.currentRecipe.name_en;
                    if (rName) {
                        idx.name_es = rName;
                        idx.name_en = rName;
                    }
                    await window.localDB.put('recipes_index', idx);
                }
            } catch (e) {}
            window.location.href = `/?view=recipes&folder=${encodeURIComponent(cleanFolder)}`;
        } else {
            try { sessionStorage.removeItem('rp_current_folder'); } catch (e) {}
            window.location.href = '/?view=recipes';
        }
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
        console.log('🔍 loadRecipeData: Iniciando carga para ID:', this.recipeId);
        const titleEl = document.getElementById('recipeTitle');
        const descEl = document.getElementById('recipeDescription');

        try {
            // ⚡ 0ms INMEDIATO: Renderizar primero desde caché local (IndexedDB) para visualización instantánea
            if (window.localDB) {
                try {
                    const cached = await window.localDB.get('recipes_full', this.recipeId);
                    if (cached && (cached.name_es || cached.name_en)) {
                        console.log('⚡ Renderizando receta instantánea (0ms) desde localDB:', cached.name_es || cached.name_en);
                        this.currentRecipe = cached;
                        this.currentRecipe.ingredients = this.currentRecipe.ingredients || [];
                        this.currentRecipe.steps = this.currentRecipe.steps || this.currentRecipe.preparation_steps || [];
                        this.baseServings = this.currentRecipe.servings || 2;
                        this.currentPortions = this.baseServings;
                        this.currentScale = 1;
                        this.renderRecipe();
                    }
                } catch (e) {
                    console.warn('Error leyendo localDB antes de fetch:', e);
                }
            }

            const params = new URLSearchParams(window.location.search);
            const forceRefresh = params.get('f') === '1';

            console.log('🔍 loadRecipeData: Llamando a db.getRecipeById...');
            const result = await window.db.getRecipeById(this.recipeId, forceRefresh);
            console.log('🔍 loadRecipeData: Resultado de db.getRecipeById:', result.success ? 'Success' : 'Fail', result.fromCache ? '(Cache)' : '(Network)');

            if (!result.success || !result.recipe) {
                if (!this.currentRecipe) {
                    console.error('Error cargando receta:', result.error);
                    if (titleEl) titleEl.textContent = window.i18n ? window.i18n.t('recipeNotFound') : 'Receta no encontrada';
                    const navTitleEl = document.getElementById('navRecipeTitle');
                    if (navTitleEl) navTitleEl.textContent = window.i18n ? window.i18n.t('recipeNotFound') : 'Receta no encontrada';
                    if (descEl) descEl.textContent = window.i18n ? window.i18n.t('noRecipesTitle') : 'No pudimos cargar esta receta. Verifica tu conexión.';
                    window.showToast?.(window.i18n ? window.i18n.t('noRecipesTitle') : 'Receta no encontrada', 'error');
                }
                return;
            }

            // Si fue forzado, limpiar la URL de forma silenciosa para que un refresh posterior use caché (manteniendo folder)
            if (forceRefresh) {
                console.log('✅ Sincronización instantánea activada. Cargando datos frescos...');
                const folderParam = params.get('folder');
                const newUrl = window.location.pathname + '?id=' + this.recipeId + 
                    (this.permission ? '&permission=' + this.permission : '') + 
                    (folderParam ? '&folder=' + encodeURIComponent(folderParam) : '');
                window.history.replaceState({}, '', newUrl);
            }

            // Si la receta local en memoria es más reciente que el resultado de red, no degradar
            const currentTs = new Date(this.currentRecipe?.updated_at || 0).getTime();
            const resultTs = new Date(result.recipe.updated_at || 0).getTime();
            if (resultTs >= currentTs || !this.currentRecipe) {
                this.currentRecipe = {
                    ...this.currentRecipe,
                    ...result.recipe,
                    ingredients: result.recipe.ingredients || this.currentRecipe?.ingredients || [],
                    steps: result.recipe.steps || this.currentRecipe?.steps || []
                };
            }
            this.currentRecipe.ingredients = this.currentRecipe.ingredients || [];
            this.currentRecipe.steps = this.currentRecipe.steps || this.currentRecipe.preparation_steps || [];
            this.baseServings = this.currentRecipe.servings || 2;
            this.currentPortions = this.baseServings;
            this.currentScale = 1;
            this.renderRecipe();

            // Check if this recipe was shared with the current user
            this.sharedBy = null;
            const currentUserId = window.authManager.currentUser?.id;
            
            // Solo verificar autorías compartidas si estamos online y tenemos receta
            if (currentUserId && this.currentRecipe.user_id !== currentUserId) {
                if (navigator.onLine) {
                    try {
                        const sharedQuery = window.supabaseClient
                            .from('shared_recipes')
                            .select('owner_user_id')
                            .eq('recipe_id', this.recipeId)
                            .eq('recipient_user_id', currentUserId)
                            .limit(1)
                            .maybeSingle();

                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SHARED')), 2000));
                        const { data: shareData } = await Promise.race([sharedQuery, timeoutPromise]);

                        if (shareData?.owner_user_id) {
                            const ownerQuery = window.supabaseClient
                                .from('users')
                                .select('first_name, last_name')
                                .eq('id', shareData.owner_user_id)
                                .maybeSingle();

                            const { data: ownerData } = await Promise.race([ownerQuery, timeoutPromise]);
                            if (ownerData) {
                                this.sharedBy = [ownerData.first_name, ownerData.last_name].filter(Boolean).join(' ') || 'Alguien';
                            }
                        }
                    } catch (e) {
                        console.warn('Could not check share info or timeout reached:', e.message || e);
                    }
                }
            }

            this.renderRecipe();

            // Solo mostrar aviso si realmente estamos offline y los datos son parciales
            if (this.currentRecipe.isPartial && !navigator.onLine) {
                const bannerMsg = window.i18n ? window.i18n.t('limitedData') : 'Modo sin conexión: Datos limitados.';
                window.showToast?.(bannerMsg, 'info');
            }

        } catch (error) {
            console.error('Error crítico en loadRecipeData:', error);
            if (titleEl) titleEl.textContent = 'Error';
            if (descEl) descEl.textContent = 'Ocurrió un error al cargar los datos.';
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
        const name = isEn ? (recipe.name_en || recipe.name_es) : (recipe.name_es || recipe.name_en);
        const fullTitle = name || (window.i18n ? window.i18n.t('recipeNotFound') : 'Receta');
        const titleParts = fullTitle.split(' ');
        const firstWord = titleParts[0];
        const restOfTitle = titleParts.slice(1).join(' ');

        if (titleEl) {
            titleEl.innerHTML = `<span class="text-primary">${firstWord}</span> ${restOfTitle}`;
        }
        const navTitleEl = document.getElementById('navRecipeTitle');
        if (navTitleEl) {
            navTitleEl.innerHTML = `<span class="text-primary">${firstWord}</span> ${restOfTitle}`;
            this.adaptTitleFontSize(navTitleEl, fullTitle);
        }

        // La insignia "Compartida por" fue removida por diseño.

        if (descEl) {
            descEl.textContent = isEn ? (recipe.description_en || recipe.description_es) : (recipe.description_es || recipe.description_en);
            if (!descEl.textContent) {
                descEl.textContent = window.i18n ? window.i18n.t('noDescription') : 'No hay descripción disponible.';
            }
        }

        if (categoryEl) {
            const categoryName = isEn ? (recipe.category?.name_en || recipe.category?.name_es) : recipe.category?.name_es;
            categoryEl.textContent = categoryName || (window.i18n ? window.i18n.t('generalCategory') : 'General');
        }



        // Favorite State (M3 Expressive Menu & Button)
        this.updateFavoriteButtonUI(!!recipe.is_favorite);

        // --- Permission Logic ---
        const btnEdit = document.getElementById('btnEdit');
        const btnDelete = document.getElementById('btnDelete');
        const menuDivider = document.querySelector('.recipe-menu-divider');
        const currentUserId = window.authManager.currentUser?.id;
        const isOwner = recipe.user_id === currentUserId;

        if (!isOwner && this.permission) {
            if (btnEdit) btnEdit.style.display = 'none';
            if (btnDelete) btnDelete.style.display = 'none';
            if (menuDivider) menuDivider.style.display = 'none';
        }

        this.renderIngredients();
        this.renderSteps();
        this.updateScalingUI();
    }

    updateScalingUI() {
        const selector = document.getElementById('servingSelector');
        const portionDisplay = document.getElementById('currentPortionDisplay');
        const portionText = document.getElementById('recipePortionText');
        const btnDec = document.getElementById('btnDecrease');
        const btnInc = document.getElementById('btnIncrease');

        if (!selector) return;
        selector.classList.remove('hidden');

        // El número grande en el centro: al reducir muestra signo entre (÷2, ÷3, ÷4), al aumentar muestra multiplicador entero (2, 3, 4...)
        let mainDisplay = '';
        if (this.currentScale < 1) {
            const divFactor = Math.round(1 / this.currentScale);
            mainDisplay = `÷${divFactor}`;
        } else if (this.currentScale % 1 === 0) {
            mainDisplay = String(this.currentScale);
        } else {
            mainDisplay = parseFloat(this.currentScale.toFixed(2)).toString();
        }

        if (portionDisplay) {
            portionDisplay.textContent = mainDisplay;
            if (this.currentScale < 1) {
                portionDisplay.style.color = '#e55b43';
            } else if (this.currentScale > 1) {
                portionDisplay.style.color = '#10B981';
            } else {
                portionDisplay.style.color = '#1B1B1F';
            }
        }

        // Acentos de halo en botones según estado de escala
        if (btnDec) {
            if (this.currentScale < 1) {
                btnDec.classList.add('active-halo');
            } else {
                btnDec.classList.remove('active-halo');
            }
        }

        if (btnInc) {
            if (this.currentScale > 1) {
                btnInc.classList.add('active-halo');
            } else {
                btnInc.classList.remove('active-halo');
            }
        }

        if (portionText) {
            if (this.currentScale === 1) {
                portionText.textContent = 'Receta original';
                portionText.style.color = '#6B7280';
                portionText.style.display = 'block';
            } else {
                portionText.textContent = '';
                portionText.style.display = 'none';
            }
        }
    }

    updateScale(newScale) {
        if (newScale < 0.24) return;
        this.currentScale = newScale;

        // Forzar actualización de la UI y re-renderizado de ingredientes
        this.updateScalingUI();
        this.renderIngredients();
    }

    adaptTitleFontSize(navTitleEl, titleText) {
        if (!navTitleEl) return;
        const len = (titleText || '').trim().length;

        // Base adaptativa generosa para aprovechar al máximo el espacio horizontal sin desbordar
        let baseSize;
        if (len <= 12) baseSize = 27;
        else if (len <= 18) baseSize = 23;
        else if (len <= 24) baseSize = 20.5;
        else if (len <= 31) baseSize = 18.5; // p.ej. "Stanleys hot fried chicken kfc" (29 chars)
        else if (len <= 40) baseSize = 16;
        else if (len <= 50) baseSize = 14;
        else baseSize = 12.5;

        navTitleEl.style.fontSize = `${baseSize}px`;
        navTitleEl.style.fontWeight = '800';
        navTitleEl.style.whiteSpace = 'nowrap';
        navTitleEl.style.textOverflow = 'ellipsis';
        navTitleEl.style.overflow = 'hidden';

        // Ajuste fino dinámico si el texto supera el ancho real disponible del contenedor
        requestAnimationFrame(() => {
            let currentSize = baseSize;
            while (navTitleEl.scrollWidth > navTitleEl.clientWidth && currentSize > 12) {
                currentSize -= 0.5;
                navTitleEl.style.fontSize = `${currentSize}px`;
            }
        });
    }

    renderIngredients() {
        const listEl = document.getElementById('ingredientsList');
        const ingredients = this.currentRecipe.ingredients || [];
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        const isSubrecipeItem = (ing) => {
            if (window.isSubrecipeItem) return window.isSubrecipeItem(ing);
            const unit = (isEn ? (ing.unit_en || ing.unit_es) : ing.unit_es) || '';
            const name = (isEn ? (ing.name_en || ing.name_es) : ing.name_es) || '';
            const originalQty = (ing.quantity !== undefined && ing.quantity !== null && String(ing.quantity).trim() !== 'null' && String(ing.quantity).trim() !== 'undefined')
                ? String(ing.quantity).trim()
                : '';
            if (originalQty && parseFloat(originalQty) > 0) return false;
            const text = `${unit || ''} ${name || ''}`.replace(/\s+/g, ' ').trim();
            if (!text) return false;
            if (/^[-*#(\[\s]*(for\b|para\b|to serve\b|para servir\b)/i.test(text)) return true;
            if (/^[-*#(\[\s]*(?:\d+[\.\)\-\s]+)?[^:]{2,80}:\s*(\([^)]+\))?$/i.test(text)) return true;
            if (/\b(dredge|dip|sauce|glaze|marinade|topping|filling|batter|crust|rub|frosting|dressing|syrup|dough|salsa|relleno|masa|adobo|cobertura|marinado|crema|base)\b/i.test(text) && /[:\)]\s*$/.test(text)) return true;
            return false;
        };


        if (!listEl) return;

        if (ingredients.length === 0) {
            listEl.innerHTML = `<p class="text-on-surface-variant dark:text-zinc-500 text-sm italic pl-2">${window.i18n ? window.i18n.t('ocrNoIngredients') : 'No hay ingredientes'}</p>`;
            return;
        }

        const scale = this.currentScale;
        const isReduced = scale < 1;
        const isIncreased = scale > 1;
        const pillClass = isReduced ? 'qty-reduced' : (isIncreased ? 'qty-increased' : '');

        listEl.innerHTML = ingredients.map(ing => {
            const unit = (isEn ? (ing.unit_en || ing.unit_es) : ing.unit_es) || '';
            const name = (isEn ? (ing.name_en || ing.name_es) : ing.name_es) || '';
            const originalQty = (ing.quantity !== undefined && ing.quantity !== null && String(ing.quantity).trim() !== 'null' && String(ing.quantity).trim() !== 'undefined')
                ? String(ing.quantity).trim()
                : '';

            // Si es un indicador de sub-receta (ej. "For the potato topping", "Para la salsa")
            if (isSubrecipeItem(ing)) {
                let cleanTitle = `${unit} ${name}`.replace(/^[:\s\-*#]+|[:\s\-*#]+$/g, '').trim();
                cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
                return `
                    <div class="m3-subrecipe-header-container">
                        <div class="m3-subrecipe-pill">
                            <span class="material-symbols-outlined subrecipe-pill-icon" style="font-size: 16px;">bookmark</span>
                            <span>${cleanTitle}</span>
                        </div>
                    </div>
                `;
            }

            let renderedContent = '';

            if (scale === 1) {
                // Modo Normal: números e indicadores/unidades (g, lb, etc.) resaltados en el verde oficial de la app
                const originalQty = (ing.quantity !== undefined && ing.quantity !== null && String(ing.quantity).trim() !== 'null' && String(ing.quantity).trim() !== 'undefined')
                    ? String(ing.quantity).trim()
                    : '';
                const unitList = 'g|gr|grs|gramos?|kg|kilos?|kilogramos?|ml|mls|mililitros?|l|lt|lts|litros?|oz|lb|lbs|libras?|tbsp|cda|cdas|cucharadas?|tsp|cdita|cditas|cucharaditas?|taza|tazas|cup|cups|ud|uds|pz|pza|pzas|piezas?|clove|cloves|dientes?|pinch|pizca|pizcas';
                const qtyUnitRegex = new RegExp(`(^|[\\s(\\[])((\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+[.,]\\d+|\\d+)(\\s*(?:${unitList})\\b)?)`, 'i');

                if (originalQty) {
                    const qtyUnit = `${originalQty} ${unit}`.trim();
                    renderedContent = `<span class="ingredient-num-normal">${qtyUnit}</span> <span class="ingredient-name-text">${name}</span>`;
                } else {
                    const rawText = `${unit} ${name}`.replace(/\s+/g, ' ').trim();
                    let hasMatched = false;
                    renderedContent = rawText.replace(qtyUnitRegex, (match, prefix, fullQty) => {
                        if (hasMatched) return match;
                        hasMatched = true;
                        return `${prefix}<span class="ingredient-num-normal">${fullQty.trim()}</span> `;
                    }).replace(/\s+/g, ' ').trim();
                }
            } else {
                // Modo Escalado: Píldora Terracota al reducir (#e55b43), Píldora Verde al aumentar (#10B981)
                const originalQty = (ing.quantity !== undefined && ing.quantity !== null && String(ing.quantity).trim() !== 'null' && String(ing.quantity).trim() !== 'undefined')
                    ? String(ing.quantity).trim()
                    : '';

                if (originalQty) {
                    const val = window.utils ? window.utils.parseToDecimal(originalQty) : parseFloat(originalQty);
                    if (val !== null && !isNaN(val) && val > 0) {
                        const scaled = val * scale;
                        const formattedQty = window.utils && window.utils.formatAmount
                            ? window.utils.formatAmount(scaled, unit)
                            : (window.utils ? window.utils.formatQuantity(scaled) : scaled.toString());
                        const pillText = `${formattedQty} ${unit}`.trim();
                        renderedContent = `
                            <span class="ingredient-qty-pill ${pillClass}">${pillText}</span>
                            <span class="ingredient-name-text">${name}</span>
                        `.trim();
                    } else {
                        // Si no tiene número válido, no agregar píldora
                        renderedContent = `${originalQty} ${unit} ${name}`.replace(/\s+/g, ' ').trim();
                    }
                } else {
                    // Si no viene cantidad separada, buscar si el texto contiene algún número para escalar
                    const rawText = `${unit} ${name}`.trim();
                    const regex = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+[\.,]\d+|\d+)(\s*(?:g|gr|grs|gramos?|kg|kilos?|kilogramos?|ml|mls|mililitros?|l|lt|lts|litros?|oz|lb|tbsp|tsp|cda|cdita|taza|cup|ud|pz|pza|piezas?|clove|cloves|dientes?)\b)?/i;
                    let hasMatched = false;

                    const scaledText = rawText.replace(regex, (match, numStr, unitStr, offset, fullStr) => {
                        const prevChar = offset > 0 ? fullStr[offset - 1] : '';
                        if (/[a-zA-Z]/.test(prevChar)) return match;
                        if (hasMatched) return match;

                        const val = window.utils ? window.utils.parseToDecimal(numStr) : parseFloat(numStr);
                        if (val === null || isNaN(val) || val <= 0) return match;
                        hasMatched = true;

                        const scaled = val * scale;
                        const matchedUnit = (unitStr || '').trim();
                        const formattedQty = window.utils && window.utils.formatAmount
                            ? window.utils.formatAmount(scaled, matchedUnit)
                            : (window.utils ? window.utils.formatQuantity(scaled) : scaled.toString());
                        const pillText = `${formattedQty}${matchedUnit ? ' ' + matchedUnit : ''}`.trim();
                        return `<span class="ingredient-qty-pill ${pillClass}">${pillText}</span>`;
                    });

                    if (hasMatched) {
                        renderedContent = scaledText;
                    } else {
                        // Si no tiene número, no le agregues nada (ni al reducir ni al aumentar)
                        renderedContent = rawText;
                    }
                }
            }

            return `
                <label class="m3-ingredient-item">
                    <input class="hidden" type="checkbox" onchange="this.parentElement.classList.toggle('checked')"/>
                    <div class="m3-checkbox-premium">
                        <span class="material-symbols-outlined">check</span>
                    </div>
                    <span class="m3-ingredient-text">
                        ${renderedContent}
                    </span>
                </label>
            `;
        }).join('');
    }

    renderSteps() {
        const stepsEl = document.getElementById('stepsList');
        const sectionSteps = document.getElementById('sectionSteps') || (stepsEl ? stepsEl.closest('.section-group') : null);
        const steps = this.currentRecipe.steps || [];
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        if (!stepsEl) return;

        if (steps.length === 0) {
            if (sectionSteps) sectionSteps.style.display = 'none';
            stepsEl.innerHTML = '';
            return;
        }

        if (sectionSteps) sectionSteps.style.display = '';

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
        // Redimensionamiento de ventana para mantener título en 1 sola línea
        window.addEventListener('resize', () => {
            const navTitleEl = document.getElementById('navRecipeTitle');
            if (navTitleEl && this.currentRecipe) {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                const name = isEn ? (this.currentRecipe.name_en || this.currentRecipe.name_es) : (this.currentRecipe.name_es || this.currentRecipe.name_en);
                if (name) this.adaptTitleFontSize(navTitleEl, name);
            }
        });

        // Back Button
        const btnBack = document.getElementById('btn-back');
        if (btnBack) {
            btnBack.style.touchAction = 'manipulation';
            btnBack.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.goBack();
            });
        }

        // Overflow Menu (3-dots button)
        const btnMenu = document.getElementById('btnRecipeMenu');
        const menuDropdown = document.getElementById('recipeDetailMenu');
        if (btnMenu && menuDropdown) {
            btnMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleOverflowMenu();
            });

            // Close on click outside
            document.addEventListener('click', (e) => {
                if (!menuDropdown.contains(e.target) && !btnMenu.contains(e.target)) {
                    this.closeOverflowMenu();
                }
            });

            // Close on Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeOverflowMenu();
                }
            });
        }

        // Favorite Button
        document.getElementById('btnFavorite')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeOverflowMenu();
            this.toggleFavorite();
        });

        // Edit Button
        const btnEdit = document.getElementById('btnEdit');
        if (btnEdit) {
            btnEdit.addEventListener('click', () => {
                this.closeOverflowMenu();
                const params = new URLSearchParams(window.location.search);
                const folder = params.get('folder') || this.currentRecipe?.pantry_es || this.currentRecipe?.pantry_en || sessionStorage.getItem('rp_current_folder') || '';
                const folderParam = folder && !this.isRootFolder(folder) ? `&folder=${encodeURIComponent(folder.trim())}` : '';
                window.location.href = `/recipe-form?id=${this.recipeId}${folderParam}`;
            });
        }

        // Delete Button
        const btnDelete = document.getElementById('btnDelete');
        if (btnDelete) {
            btnDelete.addEventListener('click', () => {
                this.closeOverflowMenu();
                this.confirmDelete();
            });
        }

        // Sincronización instantánea ante mutaciones (0ms)
        window.addEventListener('storage', async (e) => {
            if (e.key === 'rp_recipe_mutation') {
                try {
                    const data = JSON.parse(e.newValue || '{}');
                    if (data.recipeId === this.recipeId) {
                        console.log('⚡ Mutación detectada en storage para esta receta, recargando a 0ms');
                        await this.loadRecipeData();
                    }
                } catch(err) {}
            }
        });

        // Sincronización al restaurar desde caché del navegador (bfcache)
        window.addEventListener('pageshow', async () => {
            console.log('⚡ pageshow en recipe-detail: sincronizando a 0ms');
            await this.loadRecipeData();
        });

        // Listener para actualizaciones en segundo plano (Cache-First Revalidation)
        window.addEventListener('recipe-detail-updated', (e) => {
            const freshRecipe = e.detail;
            if (freshRecipe && freshRecipe.id === this.recipeId) {
                console.log('🔄 Detalle de receta actualizado en segundo plano');
                this.currentRecipe = freshRecipe;
                this.renderRecipe();
            }
        });

        // Eventos de Escala (Portions Stepper v36.9.1)
        const btnInc = document.getElementById('btnIncrease');
        const btnDec = document.getElementById('btnDecrease');

        // 4 pasos de reducción: ÷4 (0.25), ÷3 (1/3), ÷2 (0.5), 1 (original)
        const fractionalSteps = [0.25, 1 / 3, 0.5, 1];

        if (btnInc) {
            btnInc.onclick = () => {
                let nextScale;
                if (this.currentScale < 1) {
                    nextScale = fractionalSteps.find(s => s > this.currentScale + 0.001) || 2;
                } else {
                    nextScale = Math.floor(this.currentScale) + 1;
                }
                this.updateScale(nextScale);
            };
        }

        if (btnDec) {
            btnDec.onclick = () => {
                let prevScale;
                if (this.currentScale <= 1) {
                    prevScale = [...fractionalSteps].reverse().find(s => s < this.currentScale - 0.001) || 0.25;
                } else {
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

    openOverflowMenu() {
        const btnMenu = document.getElementById('btnRecipeMenu');
        const menuDropdown = document.getElementById('recipeDetailMenu');
        if (!menuDropdown || !btnMenu) return;
        menuDropdown.classList.remove('hidden');
        btnMenu.setAttribute('aria-expanded', 'true');
    }

    closeOverflowMenu() {
        const btnMenu = document.getElementById('btnRecipeMenu');
        const menuDropdown = document.getElementById('recipeDetailMenu');
        if (!menuDropdown || !btnMenu) return;
        menuDropdown.classList.add('hidden');
        btnMenu.setAttribute('aria-expanded', 'false');
    }

    toggleOverflowMenu() {
        const btnMenu = document.getElementById('btnRecipeMenu');
        if (!btnMenu) return;
        const isExpanded = btnMenu.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
            this.closeOverflowMenu();
        } else {
            this.openOverflowMenu();
        }
    }

    updateFavoriteButtonUI(isFavorite) {
        const favBtn = document.getElementById('btnFavorite');
        if (!favBtn) return;
        const span = favBtn.querySelector('.menu-item-icon') || favBtn.querySelector('span');
        const textSpan = document.getElementById('favMenuText');
        if (isFavorite) {
            favBtn.classList.add('active');
            if (span) span.style.fontVariationSettings = "'FILL' 1";
            if (textSpan) {
                textSpan.textContent = window.i18n ? (window.i18n.t('removeFav') || 'Quitar de favoritos') : 'Quitar de favoritos';
            }
        } else {
            favBtn.classList.remove('active');
            if (span) span.style.fontVariationSettings = "'FILL' 0";
            if (textSpan) {
                textSpan.textContent = window.i18n ? (window.i18n.t('addFav') || 'Agregar a favoritos') : 'Agregar a favoritos';
            }
        }
    }
}

// Inicializar y exponer instancia global
window.recipeDetailManager = new RecipeDetailManager();
