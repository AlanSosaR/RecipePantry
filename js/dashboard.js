// Lógica específica del Dashboard - v473
console.log('📄 [File] js/dashboard.js loaded (v473)');

class DashboardManager {
    constructor() {
        this.currentFilters = {};
        this.displayMode = 'list'; // Forzado a lista por solicitud de diseño
        this.currentView = localStorage.getItem('recipe_pantry_current_view') || 'recipes';
        this.currentRecipes = [];
        this.selectedRecipeId = null;
        this.selectedRecipes = new Set();
        this.isSelectionMode = false;

        this.longPressTimer = null;
        this.ignoreNextClick = false;
        this.lastSelectedIndex = undefined;
        this.selectedSafeExclusions = new Set();
        this.activeDietaryProfile = null;
        this.showExcludedRecipes = false;
        this.safeFilterDropdownOpen = false;
        this.safeRecipesDropdownOpen = false;
        this.excludedRecipesDropdownOpen = false;

        // Cierre de dropdowns y selección al hacer click fuera
        document.addEventListener('click', (e) => {
            const allergenSplit = document.getElementById('allergenFilterSplitWrapper');
            if (allergenSplit && !allergenSplit.contains(e.target)) {
                const dd = document.getElementById('safeAllergenDropdown');
                if (dd && !dd.classList.contains('hidden')) {
                    dd.classList.add('hidden');
                    this.safeFilterDropdownOpen = false;
                    const arrow = allergenSplit.querySelector('.arrow-icon');
                    if (arrow) arrow.classList.remove('open');
                }
            }
            const safeSplit = document.getElementById('safeRecipesSplitWrapper');
            if (safeSplit && !safeSplit.contains(e.target)) {
                const dd = document.getElementById('safeRecipesDropdown');
                if (dd && !dd.classList.contains('hidden')) {
                    dd.classList.add('hidden');
                    this.safeRecipesDropdownOpen = false;
                }
            }
            const excludedSplit = document.getElementById('excludedRecipesSplitWrapper');
            if (excludedSplit && !excludedSplit.contains(e.target)) {
                const dd = document.getElementById('excludedRecipesDropdown');
                if (dd && !dd.classList.contains('hidden')) {
                    dd.classList.add('hidden');
                    this.excludedRecipesDropdownOpen = false;
                }
            }

            if (!this.isSelectionMode) return;

            // Si el click es fuera de cualquier fila de receta y fuera de la barra de acciones
            const isClickInsideRow = e.target.closest('.file-row-m3');
            const isClickInsideBar = e.target.closest('.selection-action-bar');
            const isClickInsideMenu = e.target.closest('.selection-overflow-menu');
            const isClickInsideFab = e.target.closest('#fab-container');

            if (!isClickInsideRow && !isClickInsideBar && !isClickInsideMenu && !isClickInsideFab) {
                this.clearSelection();
            }
        });
    }

    // Mantener para compatibilidad con cachés viejas que aún llamen a esta función
    prefetchRecipe(id) {
        // No-op - El nuevo SyncManager maneja esto de forma global
    }

    setupOfflineIndicator() {
        // No-op - El indicador global ahora se gestiona de forma pasiva o se ha eliminado
    }

    async init() {
        try {
            console.log('%c🚀 Dashboard Inicializado (Recipe Pantry Premium v473)', 'color: #10B981; font-weight: bold; font-size: 14px;');

            // 1. Verificar autenticación silenciosamente
            const isAuthenticated = await window.authManager.checkAuth();

            // Inicializar notificaciones en paralelo (no bloquea recetas)
            if (isAuthenticated && window.notificationManager) {
                window.notificationManager.init(); // fire-and-forget
            }

            const landingEl = document.getElementById('landing-section');
            const dashboardEl = document.getElementById('dashboard-app');

            if (!isAuthenticated) {
                console.log('💡 Modo Landing: Usuario no detectado');
                if (landingEl) landingEl.classList.remove('hidden');
                if (dashboardEl) dashboardEl.classList.add('hidden');
                return;
            }

            const appVersionString = 'v473';
            console.log(`%cRecipe Pantry Dashboard init - ${appVersionString} - stable release`, 'color: #10B981; font-weight: bold;');
            document.documentElement.setAttribute('data-auth-likely', 'true');
            if (landingEl) landingEl.classList.add('hidden');
            if (dashboardEl) dashboardEl.classList.remove('hidden');

            // Actualizar datos de usuario en la UI
            this.updateUserUI();


            // 2. Cargar datos iniciales según la vista guardada, URL o hash
            const urlParams = new URLSearchParams(window.location.search);
            let viewParam = urlParams.get('view');
            const rawHash = (window.location.hash || '').replace('#', '').toLowerCase();
            if (!viewParam && ['help', 'settings', 'shared', 'favorites', 'allergens', 'menu'].includes(rawHash)) {
                viewParam = rawHash;
            }
            if (viewParam === 'settings') viewParam = 'help';
            if (viewParam && ['recipes', 'favorites', 'shared', 'help', 'allergens', 'menu'].includes(viewParam)) {
                this.currentView = viewParam;
            }
            this.currentOffset = 0;
            if (!this.selectedRecipes) this.selectedRecipes = new Set();
            this.isSelectionMode = false;

            console.log(`📦 Cargando vista: ${this.currentView}...`);
            const activeNavItem = document.querySelector(`.nav-item[data-view="${this.currentView}"]`);
            this.switchView(this.currentView, activeNavItem);

            console.log('✨ Dashboard listo');

            this.setupEventListeners();

            // Check for deep link in hash
            this.checkDeepLink();

            // 3. Persistencia de almacenamiento (Evitar que el navegador limpie caches)
            this.requestPersistence();

            // 4. Pull to Refresh (v225)
            this.initPullToRefresh();
        } catch (error) {
            console.error('❌ Error crítico en Dashboard.init:', error);
            const landingEl = document.getElementById('landing-section');
            if (landingEl) landingEl.classList.remove('hidden');
        }
    }

    initPullToRefresh() {
        // Container must be the scrollable main content
        const container = document.querySelector('.main-content');
        if (!container) return;

        let startY = 0;
        let pulling = false;
        const threshold = 70;
        
        // Remove old ptr-indicator if exists
        const oldPtr = document.getElementById('ptr-indicator');
        if (oldPtr) oldPtr.remove();

        // Create new visual indicator (Circular Spinner v208/209)
        const ptrIndicator = document.createElement('div');
        ptrIndicator.id = 'ptr-indicator';
        ptrIndicator.innerHTML = `
            <div class="ptr-circle" style="transform: scale(0); opacity: 0;">
                <div class="ptr-spinner"></div>
            </div>
        `;
        ptrIndicator.style.cssText = `
            position: absolute;
            top: -40px;
            left: 0;
            width: 100%;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease;
            z-index: 1000;
            opacity: 0;
            pointer-events: none;
        `;
        container.prepend(ptrIndicator);

        container.addEventListener('touchstart', (e) => {
            // STRICT START AT TOP v209
            if (container.scrollTop === 0) {
                startY = e.touches[0].pageY;
                pulling = true;
            } else {
                pulling = false;
            }
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (!pulling) return;
            const y = e.touches[0].pageY;
            const diff = y - startY;

            // Only pull if moving down and STRICTLY at top
            if (diff > 0 && container.scrollTop === 0) {
                // Resistance logic
                const translateY = Math.min(diff * 0.4, threshold + 30);
                const scale = Math.min(diff / threshold, 1);
                const rotation = diff * 2;

                ptrIndicator.style.transform = `translateY(${translateY}px)`;
                ptrIndicator.style.opacity = Math.min(diff / 30, 1);
                
                const circle = ptrIndicator.querySelector('.ptr-circle');
                const spinner = ptrIndicator.querySelector('.ptr-spinner');
                if (circle) {
                    circle.style.transform = `scale(${scale})`;
                    circle.style.opacity = Math.min(diff / 20, 1);
                }
                if (spinner) spinner.style.transform = `rotate(${rotation}deg)`;
            } else {
                pulling = false;
                this.resetPTR(ptrIndicator);
            }
        }, { passive: true });

        container.addEventListener('touchend', async (e) => {
            if (!pulling) return;
            const y = e.changedTouches[0].pageY;
            const diff = y - startY;

            if (diff > threshold) {
                // Trigger Silent Sync & Update Check v209
                console.log('🔄 Pull to Refresh: Sync & Update Check');
                ptrIndicator.classList.add('ptr-loading');
                ptrIndicator.style.transform = `translateY(${threshold}px)`;
                ptrIndicator.style.opacity = 1;

                try {
                    // 1. Silent Recipe Sync
                    if (window.syncManager) {
                        await window.syncManager.syncQueue({ silent: true });
                    }
                    await window.db.getMyRecipes({ forceRefresh: true });

                    // 2. Manual App Update Check (v209)
                    if (window.checkAppUpdate) {
                        await window.checkAppUpdate();
                    }
                } catch (err) {
                    console.error('Error in pull-to-refresh action:', err);
                } finally {
                    setTimeout(() => this.resetPTR(ptrIndicator), 600);
                }
            } else {
                this.resetPTR(ptrIndicator);
            }
            pulling = false;
        }, { passive: true });
    }

    resetPTR(indicator) {
        if (!indicator) return;
        indicator.classList.remove('ptr-loading');
        indicator.style.transform = `translateY(0)`;
        indicator.style.opacity = 0;
        const circle = indicator.querySelector('.ptr-circle');
        if (circle) {
            circle.style.transform = `scale(0)`;
            circle.style.opacity = 0;
        }
    }

    updateUserUI() {
        if (window.updateGlobalUserUI) {
            window.updateGlobalUserUI();
        }
    }

    setupEventListeners() {
        // Buscador
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');
        const searchWrapper = document.getElementById('searchWrapper');

        if (searchInput) {
            this.searchHistory = new SearchHistory(this);

            let timeout;
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();

                // Toggle clear button visibility
                if (clearBtn) {
                    clearBtn.classList.toggle('hidden', query.length === 0);
                }

                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    if (this.currentView === 'allergens') {
                        this.handleAllergenSearch(query);
                    } else {
                        this.loadRecipes({ search: query });
                        if (query.length > 2) {
                            this.searchHistory.save(query);
                        }
                    }
                }, 200);

                if (this.currentView !== 'allergens') {
                    // Update suggestions only for recipes
                    this.searchHistory.showSuggestions(query);
                } else {
                    this.searchHistory.hideSuggestions();
                }
            });

            searchInput.addEventListener('focus', () => {
                if (this.currentView !== 'allergens') {
                    this.searchHistory.showSuggestions(searchInput.value.trim());
                }
            });

            // Close suggestions when clicking outside
            document.addEventListener('click', (e) => {
                if (searchWrapper && !searchWrapper.contains(e.target)) {
                    this.searchHistory.hideSuggestions();
                }
            });

            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    searchInput.value = '';
                    clearBtn.classList.add('hidden');
                    if (this.currentView === 'allergens') {
                        this.handleAllergenSearch('');
                    } else {
                        this.loadRecipes({ search: '' });
                    }
                    searchInput.focus();
                });
            }
        }

        // Navegación Sidebar Desktop
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const view = item.dataset.view;
                console.log(`🖱️ Click en nav-item: ${view}`);
                if (view) {
                    e.preventDefault();
                    this.switchView(view, item);
                    if (window.innerWidth < 1024) {
                        this.toggleSidebar(false);
                    }
                }
            });
        });

        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.toggleSidebar(false));
        }

        // Listener para actualizaciones en segundo plano (Cache-First Revalidation)
        window.addEventListener('recipes-index-updated', (e) => {
            console.log('🔄 Índice de recetas actualizado en segundo plano');
            this.currentRecipes = e.detail;
            if (['recipes', 'favorites', 'shared'].includes(this.currentView)) {
                this.renderRecipesGrid(this.currentRecipes);
            }
        });
    }

    toggleSidebar(forceState = null) {
        const isOpen = document.getElementById('main-sidebar')?.classList.contains('active');
        const shouldOpen = forceState !== null ? forceState : !isOpen;
        if (window.toggleSidebar) {
            window.toggleSidebar(shouldOpen);
        }
    }

    toggleSlimSidebar() {
        if (window.toggleSlimSidebar) {
            window.toggleSlimSidebar();
        } else {
            const sidebar = document.getElementById('main-sidebar');
            if (sidebar) {
                sidebar.classList.toggle('sidebar--slim');
            }
        }
    }


    toggleDetailsSidebar(forceState = null) {
        const sidebar = document.getElementById('details-sidebar');
        if (!sidebar) return;

        const isOpen = sidebar.classList.contains('active');
        const shouldOpen = forceState !== null ? forceState : !isOpen;

        if (shouldOpen) {
            sidebar.classList.add('active');
        } else {
            sidebar.classList.remove('active');
            this.selectedRecipeId = null;
            this.updateSelectionUI();
        }
    }


    switchView(view, activeItem) {
        console.log(`[Dashboard] switchView triggered: ${view}`);
        this.currentView = view;

        // Limpiar selección actual si cambia de pestaña
        if (this.selectedRecipes) {
            this.selectedRecipes.clear();
            if (this.updateActionBar) this.updateActionBar();
        }
        localStorage.setItem('recipe_pantry_current_view', view);

        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        if (activeItem) activeItem.classList.add('active');

        if (view === 'favorites') {
            this.loadRecipes({ favorite: true, orderBy: 'name_es', ascending: true });
        } else if (view === 'recipes') {
            this.loadRecipes({ orderBy: 'name_es', ascending: true });
        } else if (view === 'shared') {
            this.loadRecipes({ shared: true });
        } else if (view === 'help' || view === 'settings') {
            this.showHelpView();
        } else if (view === 'allergens') {
            this.showAllergensView();
        } else if (view === 'menu') {
            this.showMenuView();
        }

        if (view !== 'allergens' && view !== 'menu') {
            this.allergenSearchQuery = '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.placeholder = (window.i18n && window.i18n.t) 
                    ? window.i18n.t('searchPlaceholder', 'Buscar en mi recetario...') 
                    : 'Buscar en mi recetario...';
            }
        }
    }

    showHelpView() {
        console.log('[Dashboard] Executing showHelpView');
        const grid = document.getElementById('recipesGrid');
        const empty = document.getElementById('emptyState');
        const help = document.getElementById('helpView');
        const allergensView = document.getElementById('allergensView');
        const menuView = document.getElementById('menuView');
        const titleEl = document.getElementById('view-title');

        if (grid) grid.classList.add('hidden');
        if (empty) empty.classList.add('hidden');
        if (allergensView) allergensView.classList.add('hidden');
        if (menuView) menuView.classList.add('hidden');
        const fab = document.querySelector('.fab-m3');
        if (fab) fab.classList.add('hidden');

        if (help) {
            console.log('[Dashboard] Showing helpView container');
            help.classList.remove('hidden');
            if (window.helpModal) {
                console.log('[Dashboard] Calling helpModal.render()');
                window.helpModal.render();
            } else {
                console.error('[Dashboard] window.helpModal is NOT defined!');
                help.innerHTML = '<div style="padding:40px;text-align:center;">Cargando ayuda...</div>';
            }
        } else {
            console.error('[Dashboard] #helpView element NOT found in DOM!');
        }

        if (titleEl) {
            titleEl.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('navHelp', 'Configuración') : 'Configuración';
        }
    }

    showMenuView() {
        console.log('[Dashboard] Executing showMenuView');
        this.currentView = 'menu';
        const grid = document.getElementById('recipesGrid');
        const empty = document.getElementById('emptyState');
        const help = document.getElementById('helpView');
        const allergensView = document.getElementById('allergensView');
        const menuView = document.getElementById('menuView');
        const titleEl = document.getElementById('view-title');

        if (grid) grid.classList.add('hidden');
        if (empty) empty.classList.add('hidden');
        if (help) help.classList.add('hidden');
        if (allergensView) allergensView.classList.add('hidden');
        const fab = document.querySelector('.fab-m3');
        if (fab) fab.classList.add('hidden');

        if (this.isSelectionMode) this.clearSelection();

        if (menuView) {
            menuView.classList.remove('hidden');
            if (window.restaurantMenu) {
                window.restaurantMenu.render();
            }
        }

        if (titleEl) {
            titleEl.textContent = (window.i18n && window.i18n.t) ? (window.i18n.t('navMenu') || 'Menú') : 'Menú';
        }
    }

    async fetchCompartidas() {
        return this.loadRecipes({ shared: true });
    }

    async loadRecipes(filters = {}) {
        this.lastFilters = filters;
        // Si se solicita forceRefresh, asegurar que se pase a db.js
        const result = await window.db.getMyRecipes(filters);

        if (!result.success) {
            console.error('Error cargando recetas:', result.error);
            return;
        }

        this.currentRecipes = result.recipes;

        const isRecipeView = ['recipes', 'favorites', 'shared'].includes(this.currentView);
        if (!isRecipeView) return;

        const titleEl = document.getElementById('view-title');
        if (titleEl && !this.isSelectionMode) {
            const count = this.currentRecipes.length;
            let baseTitle = '';

            if (filters.search) {
                baseTitle = filters.search;
            } else if (filters.favorite) {
                baseTitle = window.i18n ? window.i18n.t('navFavorites') : 'Favoritos';
            } else if (filters.shared) {
                baseTitle = window.i18n ? window.i18n.t('navShared') : 'Compartidas';
            } else {
                baseTitle = window.i18n ? (window.i18n.t('navRecipes') || window.i18n.t('myRecipes')) : 'Recetas';
            }

            titleEl.textContent = `${baseTitle} (${count})`;
        }

        const helpView = document.getElementById('helpView');
        if (helpView) helpView.classList.add('hidden');

        const allergensView = document.getElementById('allergensView');
        if (allergensView) allergensView.classList.add('hidden');

        const menuView = document.getElementById('menuView');
        if (menuView) menuView.classList.add('hidden');

        const fab = document.querySelector('.fab-m3');
        if (fab) fab.classList.remove('hidden');

        const recipesGrid = document.getElementById('recipesGrid');
        if (recipesGrid) recipesGrid.classList.remove('hidden');

        this.renderRecipesGrid(this.currentRecipes);
    }

    // --- Multi-Selection Logic (v13.7.0) ---
    toggleSelection(recipeId, isShift = false) {
        if (isShift && this.lastSelectedIndex !== undefined && this.currentRecipes) {
            const currentIndex = this.currentRecipes.findIndex(r => r.id === recipeId);
            const start = Math.min(this.lastSelectedIndex, currentIndex);
            const end = Math.max(this.lastSelectedIndex, currentIndex);

            for (let i = start; i <= end; i++) {
                this.selectedRecipes.add(this.currentRecipes[i].id);
            }
        } else {
            if (this.selectedRecipes.has(recipeId)) {
                this.selectedRecipes.delete(recipeId);
            } else {
                this.selectedRecipes.add(recipeId);
            }
            this.lastSelectedIndex = this.currentRecipes.findIndex(r => r.id === recipeId);
        }

        this.isSelectionMode = this.selectedRecipes.size > 0;
        this.updateSelectionModeClass();
        this.updateActionBar();
        this.renderRecipesGrid(this.currentRecipes);
    }

    updateSelectionModeClass() {
        const body = document.body;
        if (this.selectedRecipes.size > 0 || this.isSelectionMode) {
            body.classList.add('selection-mode-active');
        } else {
            body.classList.remove('selection-mode-active');
        }

        const container = document.getElementById('recipesGrid');
        if (container) {
            if (this.selectedRecipes.size > 0 || this.isSelectionMode) {
                container.classList.add('selection-mode-active');
            } else {
                container.classList.remove('selection-mode-active');
            }
        }
    }


    handleSelectAll(e) {
        if (!this.currentRecipes || this.currentRecipes.length === 0) return;

        // v197: Prevent default and stop propagation for mobile stability
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (this._selectAllTimeout) return;
        this._selectAllTimeout = true;
        setTimeout(() => this._selectAllTimeout = false, 400); // 400ms buffer

        // Determinar si todos los visibles ya están seleccionados
        const allVisibleSelected = this.currentRecipes.every(r => this.selectedRecipes.has(r.id));

        if (allVisibleSelected) {
            // Si ya están TODOS seleccionados, deseleccionamos todos
            this.selectedRecipes.clear();
        } else {
            // Si falta alguno (incluyendo estado indeterminado), los seleccionamos todos
            this.currentRecipes.forEach(r => this.selectedRecipes.add(r.id));
        }

        // Haptic feedback if available
        if (navigator.vibrate) try { navigator.vibrate(10); } catch(e){}

        this.isSelectionMode = this.selectedRecipes.size > 0;
        this.updateActionBar();
        this.renderRecipesGrid(this.currentRecipes);
    }

    clearSelection() {
        this.selectedRecipes.clear();
        this.isSelectionMode = false;
        this.lastSelectedIndex = undefined;
        this.hideSelectionMenu();
        this.updateSelectionModeClass();
        this.updateActionBar();
        this.renderRecipesGrid(this.currentRecipes);
    }


    updateActionBar() {
        const title = document.getElementById('view-title');
        const countText = document.getElementById('selectionCountText');
        const countGroup = document.getElementById('selectionActionsGroup');
        const recipesGrid = document.getElementById('recipesGrid');

        if (this.selectedRecipes.size > 0) {
            // Enter Selection Mode (v20.2.2 Refined)
            this.isSelectionMode = true;
            document.body.classList.add('selection-mode-active');
            if (recipesGrid) recipesGrid.classList.add('selection-mode-active');

            if (title) {
                const count = this.selectedRecipes.size;
                const label = count === 1 ? 'seleccionado' : 'seleccionados';
                // Format: "seleccionado(s)" (black) + "(count)" (green)
                title.innerHTML = `${label} <span style="color: var(--primary); font-weight: 800;">(${count})</span>`;
                title.style.color = '#1B1B1F'; // Dark text
            }
            if (countText) {
                countText.innerHTML = ''; 
                countText.classList.add('hidden');
            }

            if (countGroup) countGroup.classList.remove('hidden');
            const moreBtn = document.getElementById('selectionMoreBtn');
            if (moreBtn) {
                // v289: Mantener siempre visible el de la cabecera global para mayor claridad
                moreBtn.style.setProperty('display', 'flex', 'important');
                moreBtn.classList.remove('hidden');
            }
            const moreBtnHeader = document.getElementById('selectionMoreBtnHeader');
            if (moreBtnHeader) {
                moreBtnHeader.style.setProperty('display', 'inline-flex', 'important');
            }
            // Force PC selection header alignment leftwards next to title
            const dashHeader = document.querySelector('.dashboard-header');
            if (dashHeader && window.innerWidth > 800) {
                dashHeader.style.setProperty('justify-content', 'space-between', 'important');
                dashHeader.style.setProperty('gap', '12px', 'important');
            }

        } else {
            // Exit Selection Mode
            this.isSelectionMode = false;
            document.body.classList.remove('selection-mode-active');
            if (recipesGrid) recipesGrid.classList.remove('selection-mode-active');

            // Restore original title count
            if (title) {
                const total = this.currentRecipes ? this.currentRecipes.length : 0;
                let base = window.i18n ? (window.i18n.t('navRecipes') || window.i18n.t('myRecipes')) : 'Recetas';
                if (this.currentView === 'favorites') base = window.i18n ? window.i18n.t('navFavorites') : 'Favoritos';
                if (this.currentView === 'shared') base = window.i18n ? window.i18n.t('navShared') : 'Compartidas';
                title.textContent = `${base} (${total})`;
                title.style.color = '';
            }
            if (countText) countText.classList.add('hidden');
            // Hide the group completely when no items are selected (user request)
            if (countGroup) countGroup.classList.add('hidden');

            const moreBtn = document.getElementById('selectionMoreBtn');
            if (moreBtn) {
                moreBtn.style.setProperty('display', 'none', 'important');
                moreBtn.classList.add('hidden');
            }
            const moreBtnHeader = document.getElementById('selectionMoreBtnHeader');
            if (moreBtnHeader) {
                moreBtnHeader.style.setProperty('display', 'none', 'important');
            }
            // Restore normal PC header alignment
            const dashHeader = document.querySelector('.dashboard-header');
            if (dashHeader && window.innerWidth > 800) {
                dashHeader.style.setProperty('justify-content', 'space-between', 'important');
                dashHeader.style.setProperty('gap', '8px', 'important');
            }
        }

        this.updateSelectionModeClass();
        this.updateSelectAllCheckbox();
    }




    toggleSelectionMenu(event) {
        if (event) event.stopPropagation();

        const existingMenu = document.querySelector('.dropbox-menu-m3');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }

        if (this.selectedRecipes.size === 0) return;

        const menu = document.createElement('div');
        menu.className = 'dropbox-menu-m3';
        if (this.selectedRecipes.size === 1) {
            // SINGLE SELECTION: Match row menu exactly
            const recipeId = Array.from(this.selectedRecipes)[0];
            const recipe = this.currentRecipes.find(r => r.id === recipeId);
            if (!recipe) return;

            const isReceived = recipe.sharingContext === 'received';
            const isSent = recipe.sharingContext === 'sent';

            const sharedLabelHTML = isReceived ? `
                <div style="font-size: 12px; color: #10B981; padding: 0 16px 8px 16px; margin-top: -4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">groups</span>
                    ${window.i18n ? window.i18n.t('sharedBy') : 'Compartida por'}: ${recipe.senderName || 'Chef'}
                </div>
            ` : isSent && recipe.sharedWith ? `
                <div style="font-size: 12px; color: var(--primary); padding: 0 16px 8px 16px; margin-top: -4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">group</span>
                    ${window.i18n ? window.i18n.t('sharedWith') : 'Compartida con'}: ${recipe.sharedWith}
                </div>
            ` : `
                <div style="font-size: 12px; color: #aaa; padding: 0 16px 8px 16px; margin-top: -4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">person</span>
                    Solo tú
                </div>
            `;

            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const isFavorite = recipe.is_favorite;

            menu.innerHTML = `
                <div class="dropbox-menu-header">
                    <h4>${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h4>
                </div>
                ${sharedLabelHTML}
                <button class="context-menu-item" onclick="window.dashboard.copyLinkSelected()">
                    <span class="material-symbols-outlined">link</span>
                    ${window.i18n ? window.i18n.t('copyLinkLabel') : 'Copiar enlace'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.shareSelected()">
                    <span class="material-symbols-outlined">share</span>
                    ${window.i18n ? window.i18n.t('shareSelection') : 'Compartir'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" onclick="window.dashboard.editSelected()">
                    <span class="material-symbols-outlined">edit</span>
                    ${window.i18n ? window.i18n.t('formEditRecipe') : 'Editar receta'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.startRename('${recipe.id}', event)">
                    <span class="material-symbols-outlined">edit_square</span>
                    ${window.i18n ? window.i18n.t('rename') : 'Renombrar'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite})">
                    <span class="material-symbols-outlined">${isFavorite ? 'star' : 'star_border'}</span>
                    ${isFavorite ? (window.i18n ? window.i18n.t('removeFav') : 'Quitar de favoritos') : (window.i18n ? window.i18n.t('addFav') : 'Añadir a favoritos')}
                </button>
                <div class="context-menu-divider"></div>
                ${isReceived ? `
                    <button class="context-menu-item" onclick="window.dashboard.saveSharedRecipe('${recipe.id}')">
                        <span class="material-symbols-outlined">library_add</span>
                        ${window.i18n ? window.i18n.t('addToMyRecipes') : 'Agregar a mis recetas'}
                    </button>
                ` : ''}
                <button class="context-menu-item danger" onclick="window.dashboard.deleteSelected()">
                    <span class="material-symbols-outlined">delete</span>
                    ${window.i18n ? window.i18n.t('deleteBtn') : 'Eliminar'}
                </button>
            `;
        } else {
            // MULTIPLE SELECTION: Batch actions
            const count = this.selectedRecipes.size;
            const headerText = count === 1 
                ? (window.i18n ? window.i18n.t('oneItemSelected') : '1 receta')
                : (window.i18n ? window.i18n.t('itemsSelected', { count }) : `${count} recetas`);

            menu.innerHTML = `
                <div class="dropbox-menu-header">
                    <h4>${headerText}</h4>
                </div>
                <button class="context-menu-item" onclick="window.dashboard.copyLinkSelected()">
                    <span class="material-symbols-outlined">link</span>
                    ${window.i18n ? (count === 1 ? window.i18n.t('copyLinkLabel') : 'Copiar enlaces') : 'Copiar enlaces'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.shareSelected()">
                    <span class="material-symbols-outlined">share</span>
                    ${window.i18n ? (count === 1 ? window.i18n.t('shareSelection') : 'Compartir selección') : 'Compartir selección'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item danger" onclick="window.dashboard.deleteSelected()">
                    <span class="material-symbols-outlined">delete</span>
                    ${window.i18n ? window.i18n.t('deleteBtn') : 'Eliminar'}
                </button>
            `;
        }

        document.body.appendChild(menu);

        // Position menu
        const rect = event.target.getBoundingClientRect();

        if (window.innerWidth < 600) {
            // MOBILE: Bottom Sheet Style (v205)
            menu.classList.add('mobile-bottom-sheet');
            menu.style.position = 'fixed';
            menu.style.bottom = '40%'; // Subir más hacia la mitad (v205)
            menu.style.left = '5%';
            menu.style.width = '90%';
            menu.style.top = 'auto';
            menu.style.transform = 'none';
            menu.style.borderRadius = '24px';
            menu.style.animation = 'm3-sheet-up 0.3s cubic-bezier(0, 0, 0.2, 1)';
            menu.style.zIndex = '3000';
        } else {
            menu.style.top = `${rect.bottom + 8}px`;
            menu.style.left = `${rect.right - 220}px`;
        }

        // Close menu on outside click
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== event.target) {
                menu.remove();
                document.removeEventListener('mousedown', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeMenu), 10);

        // Ensure menu closes when an action button is clicked
        menu.addEventListener('click', (e) => {
            if (e.target.closest('button')) {
                menu.remove();
                document.removeEventListener('mousedown', closeMenu);
            }
        });
    }


    hideSelectionMenu() {
        const menu = document.getElementById('selectionOverflowMenu');
        if (menu) menu.classList.remove('show');
    }

    // --- Dropbox Selection Bridge Methods ---
    downloadSelected() {
        alert('Funcionalidad de descarga en desarrollo...');
    }

    copyLinkSelected() {
        if (this.selectedRecipes.size === 0) return;
        const recipeId = Array.from(this.selectedRecipes).sort()[0];
        this.copyLink(recipeId);
    }

    // --- Device-Specific Interaction Handlers (v11.0) ---
    handleRowClick(event, recipeId) {
        // Ignorar si se hizo clic directamente en el checkbox o su wrapper
        if (event.target.closest('.col-checkbox')) return;

        // Si acabamos de activar selección por long press, ignorar este click
        if (this.ignoreNextClick) {
            this.ignoreNextClick = false;
            return;
        }

        if (this.isSelectionMode) {
            // En modo selección, cualquier clic alterna el estado
            event.preventDefault();
            this.toggleSelection(recipeId, event.shiftKey);
        } else {
            // Modo normal, abrir receta
            this.handleRecipeClick(recipeId);
        }
    }

    handleRowTouchStart(event, recipeId) {
        this.longPressTimer = setTimeout(() => {
            if (!this.isSelectionMode) {
                this.ignoreNextClick = true; // Ignorar el click que seguirá al touch
                this.toggleSelection(recipeId);
                try {
                    if (navigator.vibrate) navigator.vibrate(50);
                } catch (e) {
                    console.warn('Vibration blocked by browser intervention');
                }
            }
        }, 600); // 600ms para asegurar que es intencional
    }

    handleRowTouchEnd() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    editSelected() {
        if (this.selectedRecipes.size === 0) return;
        const recipeId = Array.from(this.selectedRecipes).sort()[0];
        window.location.href = `/recipe-form?id=${recipeId}`;
    }

    renameSelected() {
        if (this.selectedRecipes.size === 0) return;
        const recipeId = Array.from(this.selectedRecipes).sort()[0];
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        const newName = prompt('Ingrese el nuevo nombre:', recipe ? recipe.name : '');
        if (newName && newName.trim()) {
            // Implementation for rename can be added here
            alert('Cambiando nombre a: ' + newName);
        }
    }


    updateSelectAllCheckbox() {
        const selectAllTop = document.getElementById('selectAllCheckboxTop');
        const selectAllList = document.getElementById('selectAllCheckboxList');

        if (this.currentRecipes && this.currentRecipes.length > 0) {
            const allSelected = this.currentRecipes.every(r => this.selectedRecipes.has(r.id));
            const isAnySelected = this.selectedRecipes.size > 0;
            const isIndeterminate = isAnySelected && !allSelected;

            // v198: Usamos un pequeño delay para asegurar que el DOM refleje el estado tras preventDefault()
            setTimeout(() => {
                [selectAllTop, selectAllList].forEach(cb => {
                    if (cb) {
                        cb.checked = allSelected;
                        cb.indeterminate = isIndeterminate;
                        // Forzar refresco visual si es necesario
                        if (allSelected) cb.setAttribute('checked', 'checked');
                        else cb.removeAttribute('checked');
                    }
                });
            }, 50);
        }
    }



    async confirmDeleteSelected() {
        await this.deleteSelected();
    }

    async deleteSelected() {
        if (!this.selectedRecipes || this.selectedRecipes.size === 0) return;
        
        // v246: Capturar la selección INMEDIATAMENTE para evitar que se pierda 
        // mientras el usuario interactúa con el snackbar de confirmación.
        const selectedIdsArr = Array.from(this.selectedRecipes).map(id => id.toString());
        const selectedIdsSet = new Set(selectedIdsArr);
        const recipesToDelete = this.currentRecipes.filter(r => selectedIdsSet.has(r.id.toString()));
        
        const count = selectedIdsArr.length;
        console.log(`[Dashboard] Initializing deleteSelected for ${count} recipes. IDs:`, selectedIdsArr);

        const confirmMsg = window.i18n && window.i18n.getLang() === 'en'
            ? `Are you sure you want to delete ${count} recipes?`
            : `¿Seguro que desea eliminar ${count} recetas?`;

        window.showActionSnackbar(confirmMsg, 'ELIMINAR', async () => {
            try {
                window.showToast(window.i18n ? window.i18n.t('deleting') : 'Eliminando...', 'info');
                
                console.log('[Dashboard] Executing deletion for captured IDs:', selectedIdsArr);
                
                // --- Optimistic UI Update ---
                // Usamos la lista capturada para filtrar, no el estado actual que podría haber cambiado
                this.currentRecipes = this.currentRecipes.filter(r => !selectedIdsSet.has(r.id.toString()));
                this.clearSelection(); // Esto limpia el Set y refresca la interfaz visualmente
                
                const userId = window.authManager.currentUser?.id;
                
                // Si la lista de objetos está vacía por algún motivo, usamos los IDs crudos
                const targets = recipesToDelete.length > 0 
                    ? recipesToDelete 
                    : selectedIdsArr.map(id => ({ id }));

                const deletePromises = targets.map(async (recipe) => {
                    try {
                        const rId = recipe.id.toString();
                        // Nota: Si es fallback, sharingContext será undefined, irá por deleteRecipe normal
                        if (recipe.sharingContext === 'received') {
                            return await window.db.deleteSharedRecipe(userId, rId);
                        } else {
                            return await window.db.deleteRecipe(rId);
                        }
                    } catch (e) {
                        console.error(`[Dashboard] Error in promise for recipe ${recipe.id}:`, e);
                        return { success: false };
                    }
                });

                const results = await Promise.all(deletePromises);
                const successCount = results.filter(r => r && r.success).length;
                console.log(`[Dashboard] Deletion results: ${successCount}/${targets.length}`);

                // Refresco forzado tras la operación para estar en sincronía total
                await this.loadRecipes({ ...this.lastFilters, forceRefresh: true });
                
                const msg = (successCount === targets.length)
                    ? (window.i18n ? window.i18n.t('deleteSuccess') : 'Eliminadas correctamente')
                    : `${successCount} recetas eliminadas`;
                window.showToast(msg, 'success');

            } catch (err) {
                console.error('[Dashboard] Fatal error in deleteSelected callback:', err);
                window.utils.showToast('Error al procesar el borrado', 'error');
                this.loadRecipes({ ...this.lastFilters, forceRefresh: true });
            }
        });
    }

    async favoriteSelected() {
        if (this.selectedRecipes.size === 0) return;
        const ids = Array.from(this.selectedRecipes);
        const recipesToToggle = this.currentRecipes.filter(r => ids.includes(r.id));
        
        if (recipesToToggle.length === 0) return;

        // Determinar si vamos a marcar o desmarcar (usamos el primero como referencia)
        const firstRecipe = recipesToToggle[0];
        const newStatus = !firstRecipe.is_favorite;

        window.showToast(newStatus ? (window.i18n ? window.i18n.t('addingFavs') : 'Marcando como favoritos...') : (window.i18n ? window.i18n.t('removingFavs') : 'Quitando de favoritos...'), 'info');

        // Parallel update
        const togglePromises = ids.map(id => window.db.toggleFavorite(id, !newStatus));
        await Promise.all(togglePromises);

        this.clearSelection();
        await this.loadRecipes({ ...this.lastFilters, forceRefresh: true });
    }

    async moveSelected() {
        if (this.selectedRecipes.size === 0) return;

        const categories = [...new Set(this.currentRecipes.map(r => r.category).filter(Boolean))];
        const categoriesStr = categories.join(', ') || 'Principal';

        const newCategory = prompt(
            window.i18n && window.i18n.getLang() === 'en'
                ? `Enter new category (Existing: ${categoriesStr}):`
                : `Ingrese la nueva categoría (Existentes: ${categoriesStr}):`
        );

        if (newCategory) {
            window.showToast(window.i18n ? window.i18n.t('movingRecs') : 'Moviendo recetas...', 'info');
            const ids = Array.from(this.selectedRecipes);
            const movePromises = ids.map(id => window.db.updateRecipe(id, { category: newCategory }));
            await Promise.all(movePromises);
            
            this.clearSelection();
            await this.loadRecipes({ ...this.lastFilters, forceRefresh: true });
            window.showToast(window.i18n ? window.i18n.t('moveSuccess') : 'Recetas movidas con éxito', 'success');
        }
    }

    shareSelected() {
        if (this.selectedRecipes.size === 0) return;
        // Asume que shareModal asume múltiples IDs o simplemente mapea el primero como prueba si el diseño no lo prevé
        const ids = Array.from(this.selectedRecipes);
        if (ids.length === 1) {
            this.shareRecipe(ids[0]);
        } else {
            // Para múltiples, lo ideal sería abrir un modal especial o enviar múltiples links.
            // Puesto que la API de Vercel y el modal actual de compartir están atados a 1 receta a la vez, 
            // podemos simplemente avisar que esta función requiere iterar el modal o iterar los permisos.
            window.showToast('La compartición múltiple abrirá las configuraciones una por una', 'info');
            this.shareRecipe(ids[0]);
            // Podríamos iterar, pero bloquearía la UI. Dejemos el ID [0] como placeholder temporal o implementemos un multi-share
        }
    }
    // ----------------------------

    renderRecipesGrid(recipes) {
        const container = document.getElementById('recipesGrid');
        if (!container) return;

        // Sincronizar contador en cabecera (v69)
        const titleEl = document.getElementById('view-title');
        if (titleEl && !this.isSelectionMode) {
            const count = recipes.length;
            const currentText = titleEl.textContent || '';
            const baseTitle = currentText.includes(' (') ? currentText.split(' (')[0] : currentText;
            if (baseTitle) {
                titleEl.textContent = `${baseTitle} (${count})`;
            }
        }

        const emptyState = document.getElementById('emptyState');

        if (recipes.length === 0) {
            container.innerHTML = '';
            if (emptyState) {
                // Actualizar contenido del empty state según la vista
                const imgGroup = document.getElementById('emptyStateImgGroup');
                const icon = document.getElementById('emptyStateIcon');
                const title = document.getElementById('emptyStateTitle');
                const desc = document.getElementById('emptyStateDesc');
                const btn = document.getElementById('emptyStateBtn');

                if (this.currentView === 'shared') {
                    if (imgGroup) imgGroup.innerHTML = '<img src="assets/compartir.svg" style="width: 120px; height: auto; opacity: 0.9; margin: 0 auto; display: block;" alt="Shared">';
                    if (title) {
                        title.textContent = window.i18n ? window.i18n.t('noSharedRecipesTitle') : 'Tu despensa compartida está vacía';
                        title.style.color = '#10B981';
                    }
                    if (desc) {
                        desc.textContent = window.i18n ? window.i18n.t('noSharedRecipesDesc') : 'En Recipe Pantry, cocinar es mejor en compañía. Aquí aparecerán todos los secretos de cocina que otras personas compartan contigo.';
                        desc.style.color = '#000000';
                        desc.style.opacity = '1';
                    }
                    if (btn) btn.classList.add('hidden');
                } else if (this.currentView === 'favorites') {
                    // v247: Nueva imagen like.svg para favoritos
                    if (imgGroup) imgGroup.innerHTML = '<img src="assets/like.svg" style="width: 140px; height: auto; opacity: 1; margin: 0 auto; display: block;" alt="Favorites">';
                    if (title) {
                        title.textContent = window.i18n ? window.i18n.t('noFavoritesTitle') : 'Tu lista de favoritos está vacía';
                        title.style.color = '#10B981';
                    }
                    if (desc) {
                        desc.textContent = window.i18n ? window.i18n.t('noFavoritesDesc') : 'Guarda tus recetas preferidas aquí para tenerlas siempre a mano.';
                        desc.style.color = '#000000';
                        desc.style.opacity = '1';
                    }
                    if (btn) btn.classList.add('hidden');
                } else {
                    // Estado por defecto (Mis Recetas)
                    if (imgGroup) imgGroup.innerHTML = '<img src="assets/recipe.svg" style="width: 120px; height: auto; opacity: 0.9; margin: 0 auto; display: block;" alt="Recipes">';
                    if (title) {
                        title.textContent = window.i18n ? window.i18n.t('noRecipesTitle') : 'Tu despensa de recetas está vacía';
                        title.style.color = '#10B981';
                    }
                    if (desc) {
                        desc.textContent = window.i18n ? window.i18n.t('noRecipesDesc') : 'Digitaliza o agrega tus preparaciones favoritas para que nunca se pierdan.';
                        desc.style.color = '#000000';
                        desc.style.opacity = '1';
                    }
                    if (btn) {
                        btn.classList.remove('hidden');
                        // M3 Expressive Green Button styling
                        btn.style.setProperty('--md-filled-button-container-color', '#10B981');
                        btn.style.setProperty('--md-filled-button-label-text-color', 'white');
                        btn.style.setProperty('--md-filled-button-icon-color', 'white');
                        btn.style.marginTop = '24px';
                    }
                }

                emptyState.classList.remove('hidden');
            }
            return;
        }
        if (emptyState) emptyState.classList.add('hidden');

        // Solo renderizamos en modo lista (v34)
        container.className = 'recipes-grid list-view-m3';
        const colName = window.i18n ? window.i18n.t('colName') : 'NOMBRE';
        const colCategory = window.i18n ? window.i18n.t('colCategory') : 'CATEGORÍA';
        const colAccess = window.i18n ? window.i18n.t('colAccess') : 'ACCESO';
        const colDate = window.i18n ? window.i18n.t('colLastModified') : 'ÚLTIMA MODIFICACIÓN';

        const header = `
            <div class="list-header-m3">
                <div class="col-checkbox">
                    <label class="m3-checkbox-wrapper" style="pointer-events: auto !important; opacity: 1 !important;">
                        <input type="checkbox" id="selectAllCheckboxList" class="m3-checkbox-input" onchange="window.dashboard.handleSelectAll(event)">
                        <span class="m3-checkbox-visual"></span>
                    </label>
                </div>
                <div class="col-selection-menu">
                    <button class="btn-icon-m3" id="selectionMoreBtnHeader" onclick="window.dashboard.toggleSelectionMenu(event)" style="display: none;" title="Más opciones">
                        <span class="material-symbols-outlined" style="font-size: 24px;">more_vert</span>
                    </button>
                </div>
                <div class="col-name">${colName}</div>
                <div class="col-access">${colAccess}</div>
                <div class="col-date">${colDate}</div>
                <div class="col-actions"></div>
            </div>
        `;
        const rows = recipes.map(recipe => this.renderRecipeRow(recipe)).join('');
        container.innerHTML = header + `<div class="recipe-list-body">${rows}</div>`;
        this.updateSelectAllCheckbox();
        this.updateActionBar(); // Asegurar que botones globales se actualicen tras el render
    }

    renderRecipeRow(recipe) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const date = new Date(recipe.updated_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const isSelected = this.selectedRecipes.has(recipe.id);

        return `
            <div class="file-row-m3 ${isSelected ? 'selected' : ''}" 
                 id="recipe-${recipe.id}"
                 role="option"
                 aria-selected="${isSelected}"
                 tabindex="0"
                 onclick="window.dashboard.handleRowClick(event, '${recipe.id}')"
                 onmousedown="window.dashboard.handleRowTouchStart(event, '${recipe.id}')"
                 onmouseup="window.dashboard.handleRowTouchEnd(event)"
                 onmouseleave="window.dashboard.handleRowTouchEnd(event)"
                 ontouchstart="window.dashboard.handleRowTouchStart(event, '${recipe.id}')"
                 ontouchend="window.dashboard.handleRowTouchEnd(event)">
                
                <div class="col-checkbox" onclick="event.stopPropagation()">
                    <label class="m3-checkbox-wrapper">
                        <input type="checkbox" class="m3-checkbox-input" ${isSelected ? 'checked' : ''} onchange="window.dashboard.toggleSelection('${recipe.id}')">
                        <span class="m3-checkbox-visual"></span>
                    </label>
                </div>

                <div class="col-icon">
                    <span class="material-symbols-outlined" style="font-size: 24px; color: var(--secondary);">description</span>
                </div>

                <div class="col-name text-ellipsis">
                    <span class="recipe-name">${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</span>
                </div>

                <div class="col-access">
                    ${recipe.sharingContext === 'received'
                ? (recipe.sharedPermission === 'view_and_copy'
                    ? `<span style="color:#c7a44b;display:flex;align-items:center;gap:4px">
                            <span class="material-symbols-outlined" style="font-size:18px;font-variation-settings:'FILL' 1,'wght' 400">file_copy</span>
                            ${window.i18n ? window.i18n.t('canCopy') : 'Puede copiar'}</span>`
                    : `<span style="color:#10B981;display:flex;align-items:center;gap:4px">
                            <span class="material-symbols-outlined" style="font-size:18px;font-variation-settings:'FILL' 1,'wght' 400">visibility</span>
                            ${window.i18n ? window.i18n.t('canView') : 'Solo ver'}</span>`)
                : recipe.sharingContext === 'sent' ? `<span style="color: var(--primary); font-weight: 600;">${window.i18n ? window.i18n.t('accessShared') : 'Compartida'}</span>` : (window.i18n ? window.i18n.t('accessPrivate') : 'Solo tú')}
                </div>

                <div class="col-date">${date}</div>

                <div class="col-actions">
                    <div class="row-actions-dropbox">
                        <button class="btn-share-highlight" onclick="event.stopPropagation(); window.dashboard.shareRecipe('${recipe.id}')">
                            ${window.i18n ? window.i18n.t('shareBtn') : 'Compartir'}
                        </button>
                        <button class="btn-icon-m3" title="Copiar enlace" onclick="event.stopPropagation(); window.dashboard.copyLink('${recipe.id}')">
                            <span class="material-symbols-outlined">link</span>
                        </button>
                        <button class="btn-icon-m3" title="Editar" onclick="event.stopPropagation(); window.location.href='/recipe-form?id=${recipe.id}'">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button class="btn-icon-m3" title="Eliminar" style="color: var(--md-error);" onclick="event.stopPropagation(); window.dashboard.confirmDelete('${recipe.id}')">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                        <button class="btn-icon-m3 ${recipe.is_favorite ? 'active' : ''}" 
                            title="Favorito"
                            onclick="event.stopPropagation(); window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite})">
                            <span class="material-symbols-outlined" style="${recipe.is_favorite ? 'color: #EAB308; font-variation-settings: \'FILL\' 1;' : ''}">
                                ${recipe.is_favorite ? 'star' : 'star_border'}
                            </span>
                        </button>
                        <button class="btn-icon-m3" title="Más opciones" onclick="window.dashboard.showMoreOptions('${recipe.id}', event)">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                    </div>
                    <!-- Mobile Actions -->
                    <button class="btn-icon-m3 mobile-action-btn" onclick="event.stopPropagation(); window.dashboard.showMoreOptions('${recipe.id}', event)">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
                </div>
            </div>
        `;
    }

    renderRecipeCard(recipe) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const date = new Date(recipe.updated_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES', {
            day: '2-digit', month: '2-digit'
        });
        const isSelected = this.selectedRecipes.has(recipe.id);

        return `
            <div class="recipe-card-m3 ${isSelected ? 'selected' : ''}" 
                 id="recipe-card-${recipe.id}"
                 role="option"
                 aria-selected="${isSelected}"
                 tabindex="0"
                 onclick="window.dashboard.handleRowClick(event, '${recipe.id}')"
                 onmousedown="window.dashboard.handleRowTouchStart(event, '${recipe.id}')"
                 onmouseup="window.dashboard.handleRowTouchEnd(event)"
                 onmouseleave="window.dashboard.handleRowTouchEnd(event)"
                 ontouchstart="window.dashboard.handleRowTouchStart(event, '${recipe.id}')"
                 ontouchend="window.dashboard.handleRowTouchEnd(event)"
                 style="position:relative;">
                <!-- Image/Icon first -->
                <div class="recipe-card-image">
                    <span class="material-symbols-outlined">restaurant</span>
                </div>
                <div class="recipe-card-content">
                    <h4 class="recipe-card-title">${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h4>
                    <div class="recipe-card-meta">
                        <span>${date}</span>
                    </div>
                </div>

                <!-- Trailing elements (Right) -->
                <div class="recipe-card-actions">
                    <div class="col-checkbox" onclick="event.stopPropagation()">
                        <label class="m3-checkbox-wrapper">
                            <input type="checkbox" class="m3-checkbox-input" ${isSelected ? 'checked' : ''} onchange="window.dashboard.toggleSelection('${recipe.id}')">
                            <span class="m3-checkbox-visual"></span>
                        </label>
                    </div>
                    <button class="btn-icon-m3" onclick="event.stopPropagation(); window.dashboard.showMoreOptions('${recipe.id}', event)">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
                </div>
            </div>
        `;
    }

    handleRecipeClick(recipeId) {
        // En PC (viewport >= 768px) mostrar el detalle en el panel principal sin navegar
        const isDesktop = window.innerWidth >= 768;
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        const permission = recipe?.sharedPermission;

        if (isDesktop) {
            this.openDetailInPanel(recipeId, recipe, permission);
            return;
        }

        // Móvil: navegación directa al detalle pasando permiso si existe (para compartidas)
        const url = permission
            ? `/recipe-detail?id=${recipeId}&permission=${permission}`
            : `/recipe-detail?id=${recipeId}`;
        window.location.href = url;
    }

    async openDetailInPanel(recipeId, recipe, permission) {
        const container = document.getElementById('recipesGrid');
        const emptyState = document.getElementById('emptyState');

        if (!container) return;

        // Actualizar URL del navegador sin navegar (SPA style)
        // Esto evita que el botón Atrás del navegador vaya a recipe-detail?id=...
        history.pushState({ panelRecipe: recipeId }, '', '/');

        // Listener para el botón Atrás del navegador: cierra el panel
        this._panelPopstateHandler = () => {
            if (document.getElementById('panelDetailBody')) {
                this._closeDetailPanelInternal();
            }
        };
        window.addEventListener('popstate', this._panelPopstateHandler, { once: true });

        // Ocultar header de dashboard y empty state mientras se muestra detalle
        if (emptyState) emptyState.classList.add('hidden');
        const dashHeader = document.querySelector('.dashboard-header');
        if (dashHeader) dashHeader.classList.add('hidden');

        // Mostrar skeleton de carga en el panel
        container.innerHTML = `
            <div class="pc-detail-panel">
                <div class="pc-detail-topbar">
                    <button class="m3-icon-btn" id="btnPanelBack" onclick="window.dashboard.closeDetailPanel()" title="Volver">
                        <span class="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div style="display:flex; gap:10px;" id="panelActionBtns">
                        <button class="m3-icon-btn" id="panelBtnFavorite" title="Favorito">
                            <span class="material-symbols-outlined">favorite</span>
                        </button>
                        <button class="m3-icon-btn" id="panelBtnEdit" title="Editar">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button class="m3-icon-btn" id="panelBtnDelete" style="color:var(--error);" title="Eliminar">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                </div>
                <div class="pc-detail-body" id="panelDetailBody">
                    <div class="loading-inline"><div class="spinner-sm"></div><p>Cargando receta...</p></div>
                </div>
            </div>
        `;

        try {
            // Cargar datos completos de la receta (ingredientes + pasos)
            const result = await window.db.getRecipeById(recipeId);
            if (!result.success || !result.recipe) {
                document.getElementById('panelDetailBody').innerHTML = `<p style="padding:24px;color:var(--error);">No se pudo cargar la receta.</p>`;
                return;
            }

            const rec = result.recipe;
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const name = isEn ? (rec.name_en || rec.name_es) : rec.name_es;
            const description = isEn ? (rec.description_en || rec.description_es) : rec.description_es;
            const titleParts = (name || 'Receta').split(' ');
            const firstWord = titleParts[0];
            const restTitle = titleParts.slice(1).join(' ');

            const ingredients = rec.ingredients || [];
            const steps = rec.steps || rec.preparation_steps || [];
            const baseServings = rec.servings || 2;

            // Estado de escala para el panel
            this._panelScale = 1;
            this._panelRecipe = rec;
            this._panelRecipeId = recipeId;
            this._panelPermission = permission;

            const renderIngredients = (scale) => ingredients.map(ing => {
                const unit = isEn ? (ing.unit_en || ing.unit_es) : ing.unit_es;
                const ingName = isEn ? (ing.name_en || ing.name_es) : ing.name_es;
                const originalText = `${ing.quantity || ''} ${unit || ''} ${ingName}`.trim();
                const text = (window.utils?.scaleText) ? window.utils.scaleText(originalText, scale) : originalText;
                return `
                    <label class="m3-ingredient-item">
                        <input class="hidden" type="checkbox" onchange="this.parentElement.classList.toggle('checked')"/>
                        <div class="m3-checkbox-premium">
                            <span class="material-symbols-outlined">check</span>
                        </div>
                        <span class="m3-ingredient-text">${text}</span>
                    </label>`;
            }).join('');

            const renderSteps = () => steps.map((step, idx) => {
                const instruction = isEn ? (step.instruction_en || step.instruction_es) : step.instruction_es;
                return `
                    <label class="m3-step-item m3-step-checkable">
                        <input class="hidden" type="checkbox" onchange="this.closest('.m3-step-checkable').classList.toggle('step-done',this.checked)"/>
                        <div class="m3-step-badge">
                            <span class="step-num">${idx + 1}</span>
                            <span class="step-check material-symbols-outlined">check</span>
                        </div>
                        <p class="m3-step-text">${instruction}</p>
                    </label>`;
            }).join('');

            const isFav = rec.is_favorite;
            const currentUserId = window.authManager?.currentUser?.id;
            const isOwner = rec.user_id === currentUserId;

            document.getElementById('panelDetailBody').innerHTML = `
                <div class="pc-detail-scroll">
                    <header class="recipe-hero-header">
                        <h1 class="recipe-hero-title">
                            <span class="text-primary">${firstWord}</span> ${restTitle}
                        </h1>
                        <div class="m3-stepper-selector" id="panelServingSelector">
                            <div class="stepper-pill-horizontal">
                                <span class="stepper-label-text">SELECCIONAR PORCIONES</span>
                                <div class="stepper-controls">
                                    <button class="stepper-btn" id="panelBtnDecrease">
                                        <span class="material-symbols-outlined">remove</span>
                                    </button>
                                    <span id="panelPortionDisplay" class="portion-value">1</span>
                                    <button class="stepper-btn" id="panelBtnIncrease">
                                        <span class="material-symbols-outlined">add</span>
                                    </button>
                                </div>
                            </div>
                            <span id="panelPortionText" class="recipe-portion-text">Receta original</span>
                        </div>
                    </header>

                    <div class="content-sections">
                        ${description ? `
                        <section class="section-group">
                            <div class="section-header" style="justify-content:flex-start;">
                                <span class="material-symbols-outlined section-icon">description</span>
                                <h2 class="section-title">Description</h2>
                            </div>
                            <p class="recipe-story">${description}</p>
                        </section>` : ''}

                        ${ingredients.length > 0 ? `
                        <section class="section-group">
                            <div class="section-header" style="justify-content:flex-start;">
                                <span class="material-symbols-outlined section-icon">grocery</span>
                                <div style="display:flex;flex-direction:column;">
                                    <h2 class="section-title">Ingredients</h2>
                                    <span class="section-subtitle">${ingredients.length} ITEMS</span>
                                </div>
                            </div>
                            <div id="panelIngredientsList" style="display:flex;flex-direction:column;gap:8px;">
                                ${renderIngredients(1)}
                            </div>
                        </section>` : ''}

                        ${steps.length > 0 ? `
                        <section class="section-group">
                            <div class="section-header" style="justify-content:flex-start;">
                                <span class="material-symbols-outlined section-icon">format_list_numbered</span>
                                <h2 class="section-title">Preparation</h2>
                            </div>
                            <div id="panelStepsList" style="position:relative;display:flex;flex-direction:column;gap:48px;">
                                ${renderSteps()}
                            </div>
                        </section>` : ''}
                    </div>
                </div>
            `;

            // Botón favorito
            const favBtn = document.getElementById('panelBtnFavorite');
            if (favBtn) {
                if (isFav) {
                    favBtn.classList.add('active');
                    favBtn.querySelector('span').style.fontVariationSettings = "'FILL' 1";
                }
                favBtn.addEventListener('click', async () => {
                    const result = await window.db.toggleFavorite(recipeId, this._panelRecipe.is_favorite);
                    if (result.success) {
                        this._panelRecipe.is_favorite = result.isFavorite;
                        if (result.isFavorite) {
                            favBtn.classList.add('active');
                            favBtn.querySelector('span').style.fontVariationSettings = "'FILL' 1";
                        } else {
                            favBtn.classList.remove('active');
                            favBtn.querySelector('span').style.fontVariationSettings = "'FILL' 0";
                        }
                        window.utils?.showToast(result.isFavorite ? '❤️ Añadido a favoritos' : 'Eliminado de favoritos', 'success');
                    }
                });
            }

            // Botones editar y eliminar — solo para propietario
            const editBtn = document.getElementById('panelBtnEdit');
            const deleteBtn = document.getElementById('panelBtnDelete');
            if (!isOwner || permission) {
                if (editBtn) editBtn.style.display = 'none';
                if (deleteBtn) deleteBtn.style.display = 'none';
            } else {
                if (editBtn) editBtn.addEventListener('click', () => {
                    window.location.href = `/recipe-form?id=${recipeId}`;
                });
                if (deleteBtn) deleteBtn.addEventListener('click', async () => {
                    const confirmMsg = window.i18n ? window.i18n.t('deleteConfirm') : '¿Seguro que desea eliminar la receta?';
                    window.showActionSnackbar?.(confirmMsg, 'ELIMINAR', async () => {
                        const res = await window.db.deleteRecipe(recipeId);
                        if (res.success) {
                            window.utils?.showToast('Receta eliminada', 'success');
                            setTimeout(() => this.closeDetailPanel(), 800);
                        }
                    });
                });
            }

            // Escalado de porciones en el panel
            const fractionalSteps = [0.125, 0.25, 0.5, 0.75, 1];
            const updatePanelScale = (newScale) => {
                if (newScale < 0.125) return;
                this._panelScale = newScale;
                let label = '';
                if (newScale === 0.125) label = '1/8';
                else if (newScale === 0.25) label = '1/4';
                else if (newScale === 0.5) label = '1/2';
                else if (newScale === 0.75) label = '3/4';
                else label = newScale % 1 === 0 ? String(newScale) : newScale.toFixed(2).replace(/\.?0+$/, '');

                const portionDisplay = document.getElementById('panelPortionDisplay');
                const portionText = document.getElementById('panelPortionText');
                const ingList = document.getElementById('panelIngredientsList');
                if (portionDisplay) portionDisplay.textContent = label;
                if (portionText) {
                    if (newScale === 1) portionText.textContent = 'Receta original';
                    else if (newScale > 1) portionText.textContent = `Receta multiplicada × ${label}`;
                    else portionText.textContent = `Receta reducida ÷ ${Math.round(1/newScale)}`;
                }
                if (ingList) ingList.innerHTML = renderIngredients(newScale);
            };

            document.getElementById('panelBtnIncrease')?.addEventListener('click', () => {
                let next;
                if (this._panelScale < 1) next = fractionalSteps.find(s => s > this._panelScale + 0.001) || 2;
                else next = Math.floor(this._panelScale) + 1;
                updatePanelScale(next);
            });
            document.getElementById('panelBtnDecrease')?.addEventListener('click', () => {
                let prev;
                if (this._panelScale <= 1) prev = [...fractionalSteps].reverse().find(s => s < this._panelScale - 0.001) || 0.125;
                else prev = Math.ceil(this._panelScale) - 1;
                updatePanelScale(prev);
            });

        } catch (err) {
            console.error('Error cargando detalle en panel:', err);
            const body = document.getElementById('panelDetailBody');
            if (body) body.innerHTML = `<p style="padding:24px;color:var(--error);">Error al cargar la receta.</p>`;
        }
    }

    closeDetailPanel() {
        // Actualizar URL del navegador y limpiar listener
        if (this._panelPopstateHandler) {
            window.removeEventListener('popstate', this._panelPopstateHandler);
            this._panelPopstateHandler = null;
        }
        history.pushState({}, '', '/');
        this._closeDetailPanelInternal();
    }

    _closeDetailPanelInternal() {
        // Restaurar el header del dashboard
        const dashHeader = document.querySelector('.dashboard-header');
        if (dashHeader) dashHeader.classList.remove('hidden');
        // Restaurar la lista de recetas en el panel
        this.renderRecipesGrid(this.currentRecipes);
    }

    updateSelectionUI() {
        document.querySelectorAll('.file-row, .recipe-card-m3').forEach(el => {
            el.classList.remove('selected');
        });
        const activeItem = document.querySelector(`[onclick*="${this.selectedRecipeId}"]`);
        if (activeItem) activeItem.classList.add('selected');
    }

    async requestPersistence() {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`💾 Persistencia de almacenamiento: ${isPersisted ? 'Concedida' : 'Denegada'}`);
        }
    }



    async showRecipeDetails(recipeId) {
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        if (!recipe) return;

        this.toggleDetailsSidebar(true);
        const detailsContent = document.getElementById('details-content');
        if (!detailsContent) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const date = new Date(recipe.updated_at).toLocaleTimeString(isEn ? 'en-US' : 'es-ES', {
            hour: '2-digit', minute: '2-digit'
        }) + ' ' + new Date(recipe.updated_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES');

        const isShared = recipe.sharingContext === 'received';
        const accessLabel = isShared
            ? (window.i18n ? window.i18n.t('navShared') : 'Compartida')
            : (window.i18n ? window.i18n.t('accessPrivate') : 'Solo tú');

        detailsContent.innerHTML = `
            <div class="details-preview">
                <div class="no-image-placeholder"><span class="material-symbols-outlined" style="font-size: 48px;">restaurant</span></div>
            </div>
            <div class="details-info-list" style="padding: 24px;">
                <h3 style="margin-bottom: 8px;">${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h3>
                ${isShared ? `
                    <div style="font-size: 13px; color: var(--on-surface-variant); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 18px;">person</span>
                        <span>${window.i18n ? window.i18n.t('sharedBy') : 'Compartida por'}: <strong>${recipe.senderName || 'Chef'}</strong></span>
                    </div>
                ` : recipe.sharingContext === 'sent' && recipe.sharedWith ? `
                    <div style="font-size: 13px; color: var(--primary); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 18px;">group</span>
                        <span>${window.i18n ? window.i18n.t('sharedWith') : 'Compartida con'}: <strong>${recipe.sharedWith}</strong></span>
                    </div>
                ` : ''}
                <div class="details-meta-m3">
                    <span class="badge-tag">${accessLabel}</span>
                </div>
                
                ${isShared ? `
                <div style="margin-top: 24px;">
                    <md-filled-button onclick="window.dashboard.saveSharedRecipe('${recipe.id}')" style="width: 100%;">
                        <span slot="icon" class="material-symbols-outlined">library_add</span>
                        ${window.i18n ? window.i18n.t('addToMyRecipes') : 'Agregar a mis recetas'}
                    </md-filled-button>
                </div>
                ` : ''}

                <div class="details-section" style="margin-top: 24px;">
                    <label style="font-size: 12px; color: var(--on-surface-variant); font-weight: 600;">${window.i18n ? window.i18n.t('detailLastModified') : 'Última modificación'}</label>
                    <p style="font-size: 14px; margin-top: 4px;">${date}</p>
                </div>
                <div class="details-section" style="margin-top: 16px;">
                    <label style="font-size: 12px; color: var(--on-surface-variant); font-weight: 600;">${window.i18n ? window.i18n.t('recipeType') : 'Tipo'}</label>
                    <p style="font-size: 14px; margin-top: 4px;">${isShared ? (window.i18n ? window.i18n.t('recipeShared') : 'Receta compartida') : (window.i18n ? window.i18n.t('recipePersonal') : 'Receta personal')}</p>
                </div>
            </div>
        `;

        const sidebar = document.getElementById('details-sidebar');
        if (sidebar) sidebar.classList.add('active');
    }

    async toggleFavorite(recipeId, currentStatus) {
        const result = await window.db.toggleFavorite(recipeId, currentStatus);
        if (result.success) {
            const addedMsg = window.i18n ? window.i18n.t('favAdded') : 'Añadido a favoritos';
            const removedMsg = window.i18n ? window.i18n.t('favRemoved') : 'Eliminado de favoritos';
            window.utils.showToast(result.isFavorite ? addedMsg : removedMsg, 'success');
            const recipe = this.currentRecipes.find(r => r.id === recipeId);
            if (recipe) {
                recipe.is_favorite = result.isFavorite;
                this.renderRecipesGrid(this.currentRecipes);
            }
        } else {
            window.utils.showToast(window.i18n ? window.i18n.t('favError') : 'Error al actualizar favoritos', 'error');
        }
    }

    shareRecipe(recipeId) {
        if (window.shareModal) {
            window.shareModal.open(recipeId);
        } else {
            window.utils.showToast(window.i18n ? window.i18n.t('shareNotAvailable') : 'Funcionalidad de compartir no disponible', 'error');
        }
    }

    copyLink(recipeId) {
        const url = `${window.location.origin}/recipe-detail?id=${recipeId}`;
        navigator.clipboard.writeText(url).then(() => {
            window.utils.showToast(window.i18n ? '🔗 Enlace copiado' : '🔗 Link copied', 'success');
        });
    }

    showMoreOptions(recipeId, event) {
        if (event) event.stopPropagation();

        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        if (!recipe) return;

        const existingMenu = document.querySelector('.dropbox-menu-m3');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'dropbox-menu-m3';

        const isShared = recipe.sharingContext === 'received';
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        const sharedLabelHTML = recipe.sharingContext === 'received' ? `
            <div style="font-size: 12px; color: var(--on-surface-variant); padding: 0 16px 8px 16px; margin-top: -4px;">
                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">person</span>
                ${window.i18n ? window.i18n.t('sharedBy') : 'Compartida por'}: ${recipe.senderName || 'Chef'}
            </div>
        ` : recipe.sharingContext === 'sent' && recipe.sharedWith ? `
            <div style="font-size: 12px; color: var(--primary); padding: 0 16px 8px 16px; margin-top: -4px;">
                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">group</span>
                ${window.i18n ? window.i18n.t('sharedWith') : 'Compartida con'}: ${recipe.sharedWith}
            </div>
        ` : '';

        if (isShared) {
            menu.innerHTML = `
                <div class="dropbox-menu-header">
                    <h4>${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h4>
                </div>
                ${sharedLabelHTML}
                <button class="context-menu-item" onclick="window.dashboard.saveSharedRecipe('${recipe.id}')">
                    <span class="material-symbols-outlined">library_add</span>
                    ${window.i18n ? window.i18n.t('addToMyRecipes') : 'Agregar a mis recetas'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" onclick="window.dashboard.copyLink('${recipe.id}')">
                    <span class="material-symbols-outlined">link</span>
                    ${window.i18n ? window.i18n.t('copyLinkLabel') : 'Copiar enlace'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" style="color: var(--md-error);" onclick="window.dashboard.confirmDeleteFromMenu('${recipe.id}')">
                    <span class="material-symbols-outlined">delete</span>
                    ${window.i18n ? window.i18n.t('deleteBtn') : 'Eliminar'}
                </button>
            `;
        } else {
            menu.innerHTML = `
                <div class="dropbox-menu-header">
                    <h4>${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h4>
                </div>
                ${sharedLabelHTML}
                <button class="context-menu-item" onclick="window.dashboard.copyLink('${recipe.id}')">
                    <span class="material-symbols-outlined">link</span>
                    ${window.i18n ? window.i18n.t('copyLinkLabel') : 'Copiar enlace'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.shareRecipe('${recipe.id}')">
                    <span class="material-symbols-outlined">share</span>
                    ${window.i18n ? window.i18n.t('shareBtn') : 'Compartir'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" onclick="window.location.href='/recipe-form?id=${recipe.id}'">
                    <span class="material-symbols-outlined">edit</span>
                    ${window.i18n ? window.i18n.t('formEditRecipe') : 'Editar receta'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.startRename('${recipe.id}', event)">
                    <span class="material-symbols-outlined">edit_square</span>
                    ${window.i18n ? window.i18n.t('rename') : 'Renombrar'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite})">
                    <span class="material-symbols-outlined">${recipe.is_favorite ? 'star' : 'star_border'}</span>
                    ${recipe.is_favorite ? (window.i18n ? window.i18n.t('removeFav') : 'Quitar de favoritos') : (window.i18n ? window.i18n.t('addFav') : 'Añadir a favoritos')}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" style="color: var(--md-error);" onclick="window.dashboard.confirmDeleteFromMenu('${recipe.id}')">
                    <span class="material-symbols-outlined">delete</span>
                    ${window.i18n ? window.i18n.t('deleteBtn') : 'Eliminar receta'}
                </button>
            `;
        }

        document.body.appendChild(menu);

        const rect = event.target.getBoundingClientRect();
        const menuWidth = 220;
        const menuHeight = menu.offsetHeight;

        let top = rect.bottom + 8;
        let left = rect.right - menuWidth;

        if (top + menuHeight > window.innerHeight) {
            top = rect.top - menuHeight - 8;
        }
        if (left < 0) left = 8;

        if (window.innerWidth < 600) {
            // MOBILE: Center Sheet Style (v205)
            menu.classList.add('mobile-bottom-sheet');
            menu.style.position = 'fixed';
            menu.style.bottom = '40%'; // Subir más hacia la mitad (v205)
            menu.style.left = '5%';
            menu.style.width = '90%';
            menu.style.top = 'auto';
            menu.style.transform = 'none';
            menu.style.borderRadius = '24px';
            menu.style.animation = 'm3-sheet-up 0.3s cubic-bezier(0, 0, 0.2, 1)';
        } else {
            menu.style.top = `${top}px`;
            menu.style.left = `${left}px`;
        }

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('mousedown', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeMenu), 10);
    }

    downloadRecipe(recipeId) {
        window.utils.showToast(window.i18n ? window.i18n.t('downloading') : 'Descarga iniciada...', 'success');
    }

    // Nueva función puente para menús (v243)
    confirmDeleteFromMenu(recipeId) {
        // Seleccionamos solo esta receta para usar el flujo unificado deleteSelected
        this.selectedRecipes.clear();
        this.selectedRecipes.add(recipeId);
        this.deleteSelected();
    }

    async confirmDelete(recipeId) {
        // Redirigir al nuevo flujo unificado
        this.confirmDeleteFromMenu(recipeId);
    }

    startRename(recipeId, event) {
        if (event) event.stopPropagation();

        const menu = document.querySelector('.dropbox-menu-m3');
        if (menu) menu.remove();

        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        if (!recipe) return;

        const selector = `[onclick*="${recipeId}"]`;
        const container = document.querySelector(selector);
        if (!container) return;

        const nameEl = container.querySelector('.recipe-name, .recipe-card-title');
        if (!nameEl) return;

        const original = nameEl.textContent;
        const input = document.createElement('input');
        input.value = original;
        input.style.cssText = `
            border: 2px solid #1a73e8;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: inherit;
            font-weight: 500;
            width: 100%;
            background: var(--bg);
            color: var(--on-surface);
            outline: none;
            box-sizing: border-box;
        `;

        const save = async () => {
            if (input.parentNode === null) return;
            const newName = input.value.trim() || original;
            const spanOrH4 = document.createElement(nameEl.tagName);
            spanOrH4.className = nameEl.className;
            spanOrH4.textContent = newName;
            input.replaceWith(spanOrH4);

            if (newName !== original) {
                // Nuevo: Verificar unicidad de nombre
                const exists = await window.db.recipeNameExists(newName, { excludeId: recipeId });
                if (exists) {
                    const errorMsg = window.i18n 
                        ? window.i18n.t('recipeNameAlreadyExists', { name: newName }) 
                        : `"${newName}" ya existe en tus recetas, cámbialo para que puedas agregarla.`;
                    window.utils.showToast(errorMsg, 'error');
                    spanOrH4.textContent = original; // Revertir visualmente
                    return;
                }

                const result = await window.db.updateRecipe(recipeId, { name_es: newName });
                if (result.success) {
                    recipe.name_es = newName;
                    window.utils.showToast(window.i18n ? window.i18n.t('renameSuccess') : 'Nombre actualizado', 'success');
                } else {
                    spanOrH4.textContent = original;
                    window.utils.showToast(window.i18n ? window.i18n.t('renameError') : 'Error al renombrar', 'error');
                }
            }
        };

        const cancel = () => {
            if (input.parentNode === null) return;
            const spanOrH4 = document.createElement(nameEl.tagName);
            spanOrH4.className = nameEl.className;
            spanOrH4.textContent = original;
            input.replaceWith(spanOrH4);
        };

        nameEl.replaceWith(input);
        input.focus();
        input.select();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        input.addEventListener('blur', save);
    }

    async checkDeepLink() {
        const hash = window.location.hash;
        if (hash.startsWith('#/recipe/')) {
            const recipeId = hash.split('/').pop();
            if (recipeId) {
                const isAuthenticated = await window.authManager.checkAuth();
                if (!isAuthenticated) {
                    localStorage.setItem('redirect_after_login', hash);
                    window.location.href = '/login';
                } else {
                    window.location.href = `/recipe-detail?id=${recipeId}`;
                }
            }
        }
    }

    async saveSharedRecipe(recipeId) {
        const recipe = this.currentRecipes.find(r => r.id === recipeId);
        const recipeName = recipe ? (window.i18n.getLang() === 'en' ? (recipe.name_en || recipe.name_es) : recipe.name_es) : '';

        // Cerrar menú inmediatamente
        const existingMenu = document.querySelector('.dropbox-menu-m3');
        if (existingMenu) existingMenu.remove();

        try {
            // Nuevo: Verificar si el nombre ya existe antes de intentar duplicar
            // IMPORTANTE: Al mover de compartidas a mis recetas, solo bloqueamos si ya existe en MIS RECETAS
            const exists = await window.db.recipeNameExists(recipeName, { includeShared: false });
            if (exists) {
                const errorMsg = window.i18n 
                    ? window.i18n.t('recipeNameAlreadyExists', { name: recipeName }) 
                    : `"${recipeName}" ya existe en tus recetas, cámbialo para que puedas agregarla.`;
                window.utils.showToast(errorMsg, 'error');
                return;
            }

            window.utils.showToast(window.i18n ? window.i18n.t('savingRecipe') : 'Guardando receta...', 'info');
            const result = await window.db.duplicateRecipe(recipeId, window.authManager.currentUser.id);
            if (result.success) {
                const successMsg = window.i18n
                    ? window.i18n.t('recipeAddedToCollection', { name: recipeName })
                    : `✅ Receta ${recipeName} agregada a tu colección`;
                window.utils.showToast(successMsg, 'success');

                // Switch back to "My Recipes" tab to show the newly saved recipe
                setTimeout(() => {
                    const recipesNavItem = document.querySelector('.nav-item[data-view="recipes"]');
                    this.switchView('recipes', recipesNavItem);
                    this.toggleDetailsSidebar(false);
                }, 100);
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error('Save shared recipe error:', err);
            window.utils.showToast(window.i18n ? window.i18n.t('saveError') : 'Error al guardar la receta', 'error');
        }
    }

    // ==========================================
    // Módulo de Alergias (UK Food Standards Agency) - Material 3 Expressive
    // ==========================================

    showAllergensView() {
        console.log('[Dashboard] Executing showAllergensView');
        this.currentView = 'allergens';
        const grid = document.getElementById('recipesGrid');
        const empty = document.getElementById('emptyState');
        const help = document.getElementById('helpView');
        const allergensView = document.getElementById('allergensView');
        const menuView = document.getElementById('menuView');
        const titleEl = document.getElementById('view-title');

        if (grid) grid.classList.add('hidden');
        if (empty) empty.classList.add('hidden');
        if (help) help.classList.add('hidden');
        if (menuView) menuView.classList.add('hidden');
        const fab = document.querySelector('.fab-m3');
        if (fab) fab.classList.add('hidden');

        if (this.isSelectionMode) this.clearSelection();

        if (allergensView) {
            allergensView.classList.remove('hidden');
            this.renderAllergensView();
        }

        if (titleEl) {
            titleEl.textContent = (window.i18n && window.i18n.t) ? (window.i18n.t('navAllergies') || 'Alergias') : 'Alergias';
        }

        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');
        if (searchInput) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            searchInput.placeholder = isEn 
                ? 'Search allergen, hidden ingredient, or sauce...' 
                : 'Buscar alérgeno, salsa o ingrediente oculto...';
            searchInput.value = this.allergenSearchQuery || '';
            if (clearBtn) {
                clearBtn.classList.toggle('hidden', !this.allergenSearchQuery);
            }
        }

        // Cargar recetas en segundo plano si aún no se han cargado para alimentar comensal seguro y matriz
        if (!this.currentRecipes || this.currentRecipes.length === 0) {
            window.db.getMyRecipes({ orderBy: 'name_es', ascending: true }).then(res => {
                if (res.success && res.recipes) {
                    this.currentRecipes = res.recipes;
                    if (this.currentAllergenTab && this.currentAllergenTab !== 'guide') {
                        this.renderAllergensView();
                    }
                }
            }).catch(e => console.warn('No se pudieron precargar recetas para vista de alergias:', e));
        }
    }

    setAllergenTab(tabName) {
        this.currentAllergenTab = tabName;
        this.renderAllergensView();
    }

    renderAllergensView() {
        const container = document.getElementById('allergensView');
        if (!container) return;

        if (!this.currentAllergenTab) this.currentAllergenTab = 'safe';
        if (!this.selectedSafeExclusions) this.selectedSafeExclusions = new Set();
        if (this.allergenSearchQuery === undefined) this.allergenSearchQuery = '';

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const t = (key, fallback) => (window.i18n && window.i18n.t ? window.i18n.t(key) : fallback) || fallback;

        container.innerHTML = `
            <div class="allergens-module">
                <!-- Hero Header Material 3 Expressive -->
                <div class="allergens-hero-m3">
                    <span class="m3-uk-fsa-badge hero-corner-badge">
                        <span class="material-symbols-outlined" style="font-size: 15px;">verified</span>
                        <span>FSA UK Compliance</span>
                    </span>
                    <div class="allergens-hero-top-row">
                        <div class="allergens-hero-icon">
                            <span class="material-symbols-outlined">health_and_safety</span>
                        </div>
                        <div class="allergens-hero-heading-block">
                            <h2>${isEn ? 'Food Allergens & Cross-Contamination' : 'Alergias y Contaminación Cruzada'}</h2>
                            <p class="allergens-hero-desc">
                                ${isEn 
                                    ? 'Official guidance in accordance with UK FSA regulations. Learn about the 14 mandatory allergens, uncover hidden risks in stocks and sauces, and prevent cross-contact.' 
                                    : 'Guía oficial conforme a las normativas de la FSA de Reino Unido. Conoce los 14 alérgenos obligatorios, aprende dónde se esconden en salsas y caldos cotidianos, y previene la contaminación cruzada.'}
                            </p>
                        </div>
                    </div>
                    <div class="allergens-hero-bottom-row">
                        <div class="allergens-meta-chips allergens-hero-badges">
                            <span class="m3-badge-pill">
                                <span class="material-symbols-outlined" style="font-size: 14px;">check_circle</span>
                                ${isEn ? '14 UK Allergens' : '14 Alérgenos UK'}
                            </span>
                            <span class="m3-badge-pill">
                                <span class="material-symbols-outlined" style="font-size: 14px;">kitchen</span>
                                ${isEn ? 'Hidden Ingredients' : 'Ingredientes Ocultos'}
                            </span>
                            <span class="m3-badge-pill">
                                <span class="material-symbols-outlined" style="font-size: 14px;">warning</span>
                                ${isEn ? 'Cross-Contact Risks' : 'Protocolos Contaminación'}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Material 3 Expressive Segmented Tabs -->
                <div class="allergens-tabs-m3">
                    <button class="m3-nav-tab ${this.currentAllergenTab === 'safe' ? 'active' : ''}" onclick="window.dashboard.setAllergenTab('safe')">
                        <span class="material-symbols-outlined">shield</span>
                        <span class="tab-label-text">
                            <span>${isEn ? 'Safe Diner' : 'Comensal Seguro'}</span>
                        </span>
                        ${this.selectedSafeExclusions.size > 0 ? `<span class="tab-counter-badge">${this.selectedSafeExclusions.size}</span>` : ''}
                    </button>
                    <button class="m3-nav-tab ${this.currentAllergenTab === 'guide' ? 'active' : ''}" onclick="window.dashboard.setAllergenTab('guide')">
                        <span class="material-symbols-outlined">menu_book</span>
                        <span class="tab-label-text">
                            <span>${isEn ? 'Guide' : 'Guía'}</span><span class="tab-label-desktop">${isEn ? ' & Risks' : ' y Contaminación'}</span>
                        </span>
                    </button>
                    <button class="m3-nav-tab ${this.currentAllergenTab === 'matrix' ? 'active' : ''}" onclick="window.dashboard.setAllergenTab('matrix')">
                        <span class="material-symbols-outlined">table_chart</span>
                        <span class="tab-label-text">
                            <span>${isEn ? 'FSA Matrix' : 'Matriz FSA'}</span><span class="tab-label-desktop">${isEn ? ' (Official)' : ' Oficial'}</span>
                        </span>
                    </button>
                </div>

                <!-- Tab Mount Point -->
                <div id="allergenTabContent"></div>
            </div>
        `;

        if (this.currentAllergenTab === 'guide') {
            this.renderAllergenGuideTab(isEn, t);
        } else if (this.currentAllergenTab === 'safe') {
            this.renderAllergenSafeTab(isEn, t);
        } else if (this.currentAllergenTab === 'matrix') {
            this.renderAllergenMatrixTab(isEn, t);
        }
    }

    renderAllergenGuideTab(isEn, t) {
        const tabMount = document.getElementById('allergenTabContent');
        if (!tabMount) return;

        const allergens = window.UK_ALLERGENS || [];
        const q = (this.allergenSearchQuery || '').toLowerCase().trim();

        const getStr = (val) => {
            if (!val) return '';
            if (Array.isArray(val)) return val.join(' ').toLowerCase();
            return String(val).toLowerCase();
        };

        const toItems = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            return String(val).split(',').map(s => s.trim()).filter(Boolean);
        };

        const filtered = allergens.filter(a => {
            if (!q) return true;
            const nameEs = (a.name_es || '').toLowerCase();
            const nameEn = (a.name_en || '').toLowerCase();
            const desc = isEn ? (a.desc_en || '').toLowerCase() : (a.desc_es || '').toLowerCase();
            const hides = getStr(isEn ? a.whereItHides_en : a.whereItHides_es);
            const risks = getStr(isEn ? a.contaminationRisks_en : a.contaminationRisks_es);
            const kws = (a.keywords || []).join(' ').toLowerCase();
            return nameEs.includes(q) || nameEn.includes(q) || desc.includes(q) || hides.includes(q) || risks.includes(q) || kws.includes(q);
        });

        tabMount.innerHTML = `
            ${q ? `
                <div class="guide-toolbar-m3" style="justify-content: flex-end; margin-bottom: 14px;">
                    <div class="guide-stats-chip">
                        <span>${filtered.length} / ${allergens.length} ${isEn ? 'matching allergens' : 'alérgenos encontrados'}</span>
                    </div>
                </div>
            ` : ''}

            <div class="allergens-cards-grid">
                ${filtered.length === 0 ? `
                    <div class="allergens-empty-state">
                        <span class="material-symbols-outlined" style="font-size: 48px; color: var(--md-sys-color-outline);">search_off</span>
                        <p>${isEn ? 'No allergens or ingredients matched your search.' : 'No se encontraron alérgenos o ingredientes para esa búsqueda.'}</p>
                        <button class="btn-m3-tonal" onclick="window.dashboard.handleAllergenSearch('')">${isEn ? 'Clear search' : 'Limpiar búsqueda'}</button>
                    </div>
                ` : filtered.map(item => `
                    <div class="allergen-card-expressive" style="--allergen-accent: ${item.color};">
                        <div class="allergen-card-header">
                            <div class="allergen-avatar" style="background: ${item.color}18; color: ${item.color};">
                                <span class="material-symbols-outlined">${item.icon}</span>
                            </div>
                            <div class="allergen-title-block">
                                <h3>${item.name_en}</h3>
                                <div class="allergen-official-name">
                                    <span class="allergen-fsa-label">FSA UK</span>
                                    <span>${item.name_es}</span>
                                </div>
                            </div>
                        </div>

                        <p class="allergen-description">${isEn ? (item.desc_en || '') : (item.desc_es || '')}</p>

                        <!-- Caja 1: Dónde se esconde (Ejemplos Reales) -->
                        <div class="allergen-hides-box">
                            <div class="box-title">
                                <span class="material-symbols-outlined">kitchen</span>
                                <span>${isEn ? 'Where it hides in daily cooking:' : '¿Dónde se esconde en la cocina diaria?'}</span>
                            </div>
                            <ul class="box-list">
                                ${toItems(isEn ? item.whereItHides_en : item.whereItHides_es).map(ex => `
                                    <li>${ex}</li>
                                `).join('')}
                            </ul>
                        </div>

                        <!-- Caja 2: Riesgos de Contaminación Cruzada -->
                        <div class="allergen-risk-box">
                            <div class="box-title">
                                <span class="material-symbols-outlined">warning</span>
                                <span>${isEn ? 'Cross-contamination critical points:' : 'Puntos críticos de contaminación cruzada:'}</span>
                            </div>
                            <ul class="box-list">
                                ${toItems(isEn ? item.contaminationRisks_en : item.contaminationRisks_es).map(rk => `
                                    <li>${rk}</li>
                                `).join('')}
                            </ul>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    handleAllergenSearch(val) {
        this.allergenSearchQuery = val;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');
        if (searchInput && searchInput.value !== val) {
            searchInput.value = val;
        }
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', !val);
        }
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const t = (key, fallback) => (window.i18n && window.i18n.t ? window.i18n.t(key) : fallback) || fallback;
        this.renderAllergenGuideTab(isEn, t);
    }

    filterRecipesByAllergen(allergenId) {
        const allergen = (window.UK_ALLERGENS || []).find(a => a.id === allergenId);
        const name = allergen ? allergen.name_es : allergenId;
        const recipesNavItem = document.querySelector('.nav-item[data-view="recipes"]');
        this.switchView('recipes', recipesNavItem);
        this.loadRecipes({ search: name });
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = name;
            const clearBtn = document.getElementById('clearSearch');
            if (clearBtn) clearBtn.classList.remove('hidden');
        }
    }

    renderAllergenSafeTab(isEn, t) {
        const tabMount = document.getElementById('allergenTabContent');
        if (!tabMount) return;

        const allergens = window.UK_ALLERGENS || [];
        const dietaryProfiles = window.UK_DIETARY_PROFILES || [];
        const userRecipes = this.currentRecipes || [];
        const isUsingDemo = userRecipes.length === 0;
        const allRecipes = isUsingDemo ? (window.DEMO_UK_RECIPES || []) : userRecipes;

        const activeProfile = dietaryProfiles.find(p => p.id === this.activeDietaryProfile);

        let safeRecipes = [];
        let excludedRecipes = [];
        let excludedCount = 0;

        if (this.selectedSafeExclusions.size > 0) {
            allRecipes.forEach(recipe => {
                const detectedRaw = window.detectRecipeAllergens ? window.detectRecipeAllergens(recipe) : [];
                const detectedIds = detectedRaw.map(d => (typeof d === 'object' ? d.id : d));
                const offendingAllergens = detectedIds.filter(id => this.selectedSafeExclusions.has(id));
                if (offendingAllergens.length === 0) {
                    safeRecipes.push({ recipe, detectedIds });
                } else {
                    excludedCount++;
                    excludedRecipes.push({ recipe, detectedIds, offendingAllergens });
                }
            });
        }

        tabMount.innerHTML = `
            ${isUsingDemo ? `
                <div class="demo-notice-banner-m3">
                    <div class="demo-notice-left">
                        <div class="demo-notice-icon">
                            <span class="material-symbols-outlined">lightbulb</span>
                        </div>
                        <div>
                            <div class="demo-notice-title">${isEn ? 'Interactive Demonstration Mode' : 'Modo Demostración Interactivo'}</div>
                            <div class="demo-notice-sub">${isEn 
                                ? 'Testing safe diner exclusion with 7 classic UK menu dishes (Fish & Chips, Pad Thai, Minestrone...). Save your own recipes to filter your real menu.'
                                : 'Probando exclusión de comensal seguro con 7 platos de cocina británica e internacional (Fish & Chips, Pad Thai, Minestrone...). Guarda tus recetas para filtrar tus propios platos.'}</div>
                        </div>
                    </div>
                    <a href="recipe-form.html" class="btn-m3-tonal" style="text-decoration:none;">
                        <span class="material-symbols-outlined">add</span>
                        <span>${isEn ? 'New Recipe' : 'Crear Receta'}</span>
                    </a>
                </div>
            ` : ''}

            <div class="safe-filter-panel">
                <div class="safe-filter-header">
                    <div class="safe-filter-title">
                        <div class="safe-title-icon">
                            <span class="material-symbols-outlined">shield_with_heart</span>
                        </div>
                        <div>
                            <h3>${isEn ? 'Filter based on your saved recipes for (Multiple Allergies)' : 'Filtro en base a tus recetas guardadas sobre (Alergias Múltiples)'}</h3>
                            <p>${isEn 
                                ? 'Select diner allergies to inspect ingredients across recipes and show only 100% safe options.'
                                : 'Marca las alergias para examinar ingredientes y mostrar únicamente platos 100% libres de dichos alérgenos.'}</p>
                        </div>
                    </div>
                </div>

                <!-- Barra de Split Buttons: Filtro de Alergias (en lista) + Recetas Seguras + Recetas Excluidas -->
                <div class="safe-split-buttons-bar">
                    <!-- 1. Split Button: Filtro de Alergias en Lista -->
                    <div class="m3-split-button-wrapper" id="allergenFilterSplitWrapper">
                        <div class="m3-split-button filter-split-button ${this.selectedSafeExclusions.size > 0 ? 'has-active-filter' : ''}">
                            <button class="m3-split-btn-main" onclick="window.dashboard.toggleSafeAllergenDropdown(event)" type="button">
                                <span class="material-symbols-outlined">${this.selectedSafeExclusions.size > 0 ? 'filter_alt' : 'tune'}</span>
                                <span class="split-btn-title">${isEn ? 'Filter by Allergens' : 'Filtro en base a tus recetas'}</span>
                                ${this.selectedSafeExclusions.size > 0 ? `
                                    <span class="split-count-badge">${this.selectedSafeExclusions.size}</span>
                                ` : ''}
                            </button>
                            <button class="m3-split-btn-arrow" onclick="window.dashboard.toggleSafeAllergenDropdown(event)" type="button" aria-label="${isEn ? 'Open allergen list' : 'Abrir lista de alérgenos'}">
                                <span class="material-symbols-outlined arrow-icon ${this.safeFilterDropdownOpen ? 'open' : ''}">expand_more</span>
                            </button>
                        </div>

                        <!-- Dropdown con las 14 Alergias UK EN FORMATO LISTA -->
                        <div id="safeAllergenDropdown" class="m3-split-dropdown allergen-list-dropdown ${this.safeFilterDropdownOpen ? '' : 'hidden'}">
                            <div class="m3-split-dropdown-header">
                                <div class="filter-header-left">
                                    <span class="material-symbols-outlined" style="color: #059669; font-size: 18px;">shield</span>
                                    <span>${isEn ? 'The 14 UK Allergens' : 'Las 14 Alergias UK'}</span>
                                </div>
                                ${this.selectedSafeExclusions.size > 0 ? `
                                    <button class="filter-clear-link" onclick="window.dashboard.clearSafeExclusions()">
                                        <span class="material-symbols-outlined">restart_alt</span>
                                        <span>${isEn ? 'Clear' : 'Limpiar'}</span>
                                    </button>
                                ` : ''}
                            </div>

                            <!-- Lista vertical de las 14 alergias -->
                            <div class="allergen-vertical-list">
                                ${allergens.map(a => {
                                    const isSelected = this.selectedSafeExclusions.has(a.id);
                                    return `
                                        <div 
                                            class="allergen-list-item ${isSelected ? 'selected' : ''}" 
                                            onclick="window.dashboard.toggleSafeAllergenExclusion('${a.id}', event)"
                                            role="button"
                                            tabindex="0"
                                        >
                                            <div class="allergen-list-item-left">
                                                <div class="allergen-list-icon-wrap" style="background: ${isSelected ? '#FEE2E2' : a.color + '18'}; color: ${isSelected ? '#DC2626' : a.color};">
                                                    <span class="material-symbols-outlined">${a.icon}</span>
                                                </div>
                                                <span class="allergen-list-name">${a.name_en}</span>
                                            </div>
                                            <div class="allergen-list-checkbox ${isSelected ? 'checked' : ''}">
                                                <span class="material-symbols-outlined">${isSelected ? 'check' : ''}</span>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>

                            <div class="m3-filter-dropdown-footer">
                                <span class="footer-hint">
                                    ${this.selectedSafeExclusions.size === 0 
                                        ? (isEn ? 'Tap allergens to exclude' : 'Toca alérgenos para excluir')
                                        : (isEn ? `${this.selectedSafeExclusions.size} selected for exclusion` : `${this.selectedSafeExclusions.size} seleccionada(s)`)}
                                </span>
                                <button class="btn-close-filter" onclick="window.dashboard.toggleSafeAllergenDropdown(event)" type="button">
                                    <span class="material-symbols-outlined" style="font-size: 16px;">check</span>
                                    <span>${isEn ? 'Done' : 'Listo'}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 2. Split Button: Recetas con Alérgenos (Excluidas) si las hay -->
                    ${this.selectedSafeExclusions.size > 0 && excludedCount > 0 ? `
                        <div class="m3-split-button-wrapper" id="excludedRecipesSplitWrapper">
                            <div class="m3-split-button danger-split-button">
                                <button class="m3-split-btn-main" onclick="window.dashboard.toggleExcludedRecipesDropdown(event)" type="button">
                                    <span class="material-symbols-outlined" style="color: #DC2626; font-size: 20px;">warning</span>
                                    <span class="split-btn-title">${isEn ? `${excludedCount} Excluded Dishes` : `${excludedCount} Recetas con Alérgenos`}</span>
                                </button>
                                <button class="m3-split-btn-arrow" onclick="window.dashboard.toggleExcludedRecipesDropdown(event)" type="button" aria-label="${isEn ? 'Open excluded recipes' : 'Ver recetas con alérgenos'}">
                                    <span class="material-symbols-outlined arrow-icon ${this.excludedRecipesDropdownOpen ? 'open' : ''}">expand_more</span>
                                </button>
                            </div>

                            <!-- Dropdown con las Recetas Excluidas DENTRO del Split Button -->
                            <div id="excludedRecipesDropdown" class="m3-split-dropdown excluded-recipes-dropdown ${this.excludedRecipesDropdownOpen ? '' : 'hidden'}">
                                <div class="m3-split-dropdown-header danger-header">
                                    <div class="filter-header-left">
                                        <span class="material-symbols-outlined" style="color: #DC2626; font-size: 18px;">crisis_alert</span>
                                        <span>${isEn ? `${excludedCount} Excluded Dishes` : `${excludedCount} Recetas con Alérgenos`}</span>
                                    </div>
                                </div>
                                <div class="split-recipes-scroll-list">
                                    ${excludedRecipes.map(({ recipe, detectedIds, offendingAllergens }) => {
                                        const offendingNames = offendingAllergens.map(id => {
                                            const found = allergens.find(a => a.id === id);
                                            return found ? found.name_en : id;
                                        });

                                        return `
                                            <div class="split-recipe-item danger-item" onclick="window.dashboard.openRecipeDetails('${recipe.id}')">
                                                <div class="split-recipe-item-info">
                                                    <div class="split-recipe-item-title-row">
                                                        <span class="split-recipe-name">${recipe.name_es || recipe.name_en || (isEn ? 'Untitled Recipe' : 'Receta sin título')}</span>
                                                        <span class="split-danger-badge">${isEn ? 'Contains' : 'Contiene'}</span>
                                                    </div>
                                                    <div class="split-offending-tags">
                                                        <span class="offending-label">${isEn ? 'Contaminants:' : 'Alérgenos:'}</span>
                                                        ${offendingNames.map(n => `<span class="split-offending-pill">${n}</span>`).join('')}
                                                    </div>
                                                </div>
                                                <span class="material-symbols-outlined split-item-arrow">chevron_right</span>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Píldoras de exclusión activa con botón Limpiar a la par -->
                ${this.selectedSafeExclusions.size > 0 ? `
                    <div class="active-exclusions-pills-row">
                        <div class="active-exclusions-left">
                            <span class="active-exclusions-label">
                                <span class="material-symbols-outlined">do_not_disturb_on</span>
                                <span>${isEn ? 'Excluding recipes with:' : 'Excluyendo recetas con:'}</span>
                            </span>
                            <div class="active-exclusions-pills-list">
                                ${Array.from(this.selectedSafeExclusions).map(id => {
                                    const a = allergens.find(x => x.id === id);
                                    const name = a ? a.name_en : id;
                                    return `
                                        <button class="active-exclusion-pill" onclick="window.dashboard.toggleSafeAllergenExclusion('${id}', event)" title="${isEn ? 'Remove from filter' : 'Quitar del filtro'}">
                                            <span>${name}</span>
                                            <span class="material-symbols-outlined pill-remove-icon">close</span>
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        <button class="btn-clear-exclusions-m3" onclick="window.dashboard.clearSafeExclusions()" type="button" title="${isEn ? 'Clear all filters' : 'Limpiar filtro'}">
                            <span class="material-symbols-outlined">restart_alt</span>
                            <span>${isEn ? `Clear (${this.selectedSafeExclusions.size})` : `Limpiar (${this.selectedSafeExclusions.size})`}</span>
                        </button>
                    </div>

                    <!-- Recetas Seguras Directamente Visibles en la Página -->
                    <div class="safe-recipes-section">
                        <div class="safe-section-header">
                            <div class="safe-header-left">
                                <span class="material-symbols-outlined" style="color: #059669; font-size: 22px;">verified</span>
                                <span class="safe-header-count">${isEn ? `${safeRecipes.length} Safe Recipes Available` : `${safeRecipes.length} Recetas 100% Seguras`}</span>
                            </div>
                            <span class="safe-header-sub">${isEn ? 'Showing dishes completely free from your selected exclusions' : 'Platos 100% libres de los alérgenos marcados'}</span>
                        </div>

                        <div class="safe-recipes-list">
                            ${safeRecipes.length === 0 ? `
                                <div class="allergens-empty-state">
                                    <span class="material-symbols-outlined" style="font-size: 44px; color: #94A3B8;">no_meals</span>
                                    <p>${isEn ? 'No recipes in your pantry match this safe combination.' : 'No se encontraron recetas libres de los alérgenos marcados.'}</p>
                                </div>
                            ` : safeRecipes.map(({ recipe, detectedIds }) => {
                                const otherAllergens = (detectedIds || []).filter(id => !this.selectedSafeExclusions.has(id));
                                const otherNames = otherAllergens.map(id => {
                                    const found = allergens.find(a => a.id === id);
                                    return found ? found.name_en : id;
                                });
                                const firstIngredients = (recipe.ingredients || []).map(i => i.name || i).slice(0, 5).join(', ');

                                return `
                                    <div class="safe-recipe-card" onclick="window.dashboard.openRecipeDetails('${recipe.id}')">
                                        <div class="safe-recipe-info">
                                            <div class="safe-recipe-header-row">
                                                <h4 class="safe-recipe-title">${recipe.name_es || recipe.name_en || (isEn ? 'Untitled Recipe' : 'Receta sin título')}</h4>
                                                <span class="safe-tag-badge">
                                                    <span class="material-symbols-outlined">verified</span>
                                                    <span>${isEn ? 'Safe' : 'Segura'}</span>
                                                </span>
                                                ${recipe.is_demo ? `<span class="split-demo-tag">${isEn ? 'Demo' : 'Ejemplo'}</span>` : ''}
                                            </div>
                                            ${recipe.description ? `<p class="safe-recipe-desc">${recipe.description}</p>` : ''}
                                            <div class="safe-recipe-ingredients-preview">
                                                <strong>${isEn ? 'Ingredients: ' : 'Ingredientes: '}</strong>${firstIngredients}${(recipe.ingredients || []).length > 5 ? '...' : ''}
                                            </div>
                                            ${otherNames.length > 0 ? `
                                                <div class="split-other-allergens" style="margin-top: 8px;">
                                                    <span class="other-label">${isEn ? 'Other allergens:' : 'Otros alérgenos:'}</span>
                                                    ${otherNames.map(n => `<span class="split-sub-pill">${n}</span>`).join('')}
                                                </div>
                                            ` : `
                                                <div class="split-clean-tag" style="margin-top: 8px;">
                                                    <span class="material-symbols-outlined" style="font-size: 13px;">eco</span>
                                                    <span>${isEn ? 'Free from all 14 UK allergens' : 'Libre de los 14 alérgenos de UK'}</span>
                                                </div>
                                            `}
                                        </div>
                                        <div class="safe-recipe-action">
                                            <button class="btn-m3-tonal" title="${isEn ? 'View recipe' : 'Ver receta'}" type="button">
                                                <span class="material-symbols-outlined">arrow_forward</span>
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : `
                    <div class="safe-banner-prompt">
                        <span class="material-symbols-outlined" style="color: #059669;">tune</span>
                        <span>${isEn 
                            ? 'Open "Filter by Allergens" above to select allergens from the list and find 100% safe dishes.' 
                            : 'Abre "Filtro en base a tus recetas" arriba para seleccionar alérgenos en lista y encontrar platos 100% seguros.'}</span>
                    </div>
                `}
            </div>
        `;
    }

    toggleSafeRecipesDropdown(event) {
        if (event) event.stopPropagation();
        this.safeRecipesDropdownOpen = !this.safeRecipesDropdownOpen;
        this.safeFilterDropdownOpen = false;
        this.excludedRecipesDropdownOpen = false;
        const dd = document.getElementById('safeRecipesDropdown');
        if (dd) dd.classList.toggle('hidden', !this.safeRecipesDropdownOpen);
        const otherDd = document.getElementById('excludedRecipesDropdown');
        if (otherDd) otherDd.classList.add('hidden');
        const filterDd = document.getElementById('safeAllergenDropdown');
        if (filterDd) filterDd.classList.add('hidden');
        const filterArrow = document.querySelector('#allergenFilterSplitWrapper .arrow-icon');
        if (filterArrow) filterArrow.classList.remove('open');
    }

    toggleExcludedRecipesDropdown(event) {
        if (event) event.stopPropagation();
        this.excludedRecipesDropdownOpen = !this.excludedRecipesDropdownOpen;
        this.safeFilterDropdownOpen = false;
        this.safeRecipesDropdownOpen = false;
        const dd = document.getElementById('excludedRecipesDropdown');
        if (dd) dd.classList.toggle('hidden', !this.excludedRecipesDropdownOpen);
        const otherDd = document.getElementById('safeRecipesDropdown');
        if (otherDd) otherDd.classList.add('hidden');
        const filterDd = document.getElementById('safeAllergenDropdown');
        if (filterDd) filterDd.classList.add('hidden');
        const filterArrow = document.querySelector('#allergenFilterSplitWrapper .arrow-icon');
        if (filterArrow) filterArrow.classList.remove('open');
    }

    toggleSafeAllergenDropdown(event) {
        if (event) event.stopPropagation();
        this.safeFilterDropdownOpen = !this.safeFilterDropdownOpen;
        this.safeRecipesDropdownOpen = false;
        this.excludedRecipesDropdownOpen = false;
        const dropdown = document.getElementById('safeAllergenDropdown');
        if (dropdown) {
            dropdown.classList.toggle('hidden', !this.safeFilterDropdownOpen);
        }
        const arrow = document.querySelector('#allergenFilterSplitWrapper .arrow-icon');
        if (arrow) {
            arrow.classList.toggle('open', this.safeFilterDropdownOpen);
        }
        const safeDd = document.getElementById('safeRecipesDropdown');
        if (safeDd) safeDd.classList.add('hidden');
        const exclDd = document.getElementById('excludedRecipesDropdown');
        if (exclDd) exclDd.classList.add('hidden');
    }

    closeSafeAllergenDropdown(event) {
        if (event) event.stopPropagation();
        this.safeFilterDropdownOpen = false;
        const dropdown = document.getElementById('safeAllergenDropdown');
        if (dropdown) {
            dropdown.classList.add('hidden');
        }
        const arrow = document.querySelector('#allergenFilterSplitWrapper .arrow-icon');
        if (arrow) {
            arrow.classList.remove('open');
        }
    }

    toggleSafeAllergenExclusion(id, event) {
        if (event) event.stopPropagation();
        if (!this.selectedSafeExclusions) this.selectedSafeExclusions = new Set();
        if (this.selectedSafeExclusions.has(id)) {
            this.selectedSafeExclusions.delete(id);
        } else {
            this.selectedSafeExclusions.add(id);
        }

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const t = (key, fallback) => (window.i18n && window.i18n.t ? window.i18n.t(key) : fallback) || fallback;
        this.renderAllergenSafeTab(isEn, t);
    }

    clearSafeExclusions() {
        this.showExcludedRecipes = false;
        if (this.selectedSafeExclusions) this.selectedSafeExclusions.clear();
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const t = (key, fallback) => (window.i18n && window.i18n.t ? window.i18n.t(key) : fallback) || fallback;
        this.renderAllergenSafeTab(isEn, t);
    }

    setMatrixSource(source) {
        this.matrixShowDemo = (source === 'demo');
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const t = (key, fallback) => (window.i18n && window.i18n.t ? window.i18n.t(key) : fallback) || fallback;
        this.renderAllergenMatrixTab(isEn, t);
    }

    renderAllergenMatrixTab(isEn, t) {
        const tabMount = document.getElementById('allergenTabContent');
        if (!tabMount) return;

        const allergens = window.UK_ALLERGENS || [];
        const userRecipes = this.currentRecipes || [];
        const demoRecipes = window.DEMO_UK_RECIPES || [];

        // Si el usuario no especificó fuente, usar recetas de usuario si tiene, o de demostración si tiene 0
        const isDemoActive = this.matrixShowDemo !== undefined ? this.matrixShowDemo : (userRecipes.length === 0);
        const recipes = isDemoActive ? demoRecipes : userRecipes;

        const recipesWithAllergens = recipes.map(recipe => {
            const detected = window.detectRecipeAllergens ? window.detectRecipeAllergens(recipe) : [];
            const detectedIds = new Set(detected.map(d => (typeof d === 'object' ? d.id : d)));
            return {
                id: recipe.id,
                name: recipe.name_es || recipe.name_en || (isEn ? 'Untitled' : 'Sin nombre'),
                is_demo: !!recipe.is_demo,
                detectedIds
            };
        });

        tabMount.innerHTML = `
            ${isDemoActive ? `
                <div class="demo-notice-banner-m3">
                    <div class="demo-notice-left">
                        <div class="demo-notice-icon">
                            <span class="material-symbols-outlined">lightbulb</span>
                        </div>
                        <div>
                            <div class="demo-notice-title">${isEn ? 'Demonstration Kitchen Matrix (UK FSA Compliance)' : 'Matriz de Demostración (Cumplimiento UK FSA)'}</div>
                            <div class="demo-notice-sub">${isEn 
                                ? 'Showing 7 classic UK hospitality menu dishes (Fish & Chips, Carbonara, Pad Thai...) with 14 mandatory allergen declarations. When you save recipes, they will integrate here automatically.'
                                : 'Mostrando 7 platos estándar de hostelería británica (Fish & Chips, Carbonara, Pad Thai...) con la declaración de los 14 alérgenos obligatorios. Al guardar tus recetas, se integrarán aquí automáticamente.'}</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${userRecipes.length > 0 ? `
                            <button class="btn-m3-tonal" onclick="window.dashboard.setMatrixSource('user')">
                                <span class="material-symbols-outlined">restaurant_menu</span>
                                <span>${isEn ? `My Recipes (${userRecipes.length})` : `Mis Recetas (${userRecipes.length})`}</span>
                            </button>
                        ` : `
                            <a href="recipe-form.html" class="btn-m3-filled" style="text-decoration:none;">
                                <span class="material-symbols-outlined">add</span>
                                <span>${isEn ? 'Create Recipe' : 'Crear Receta'}</span>
                            </a>
                        `}
                    </div>
                </div>
            ` : `
                ${demoRecipes.length > 0 ? `
                    <div style="display:flex; justify-content:flex-end; margin-bottom: 12px;">
                        <button class="btn-m3-tonal" onclick="window.dashboard.setMatrixSource('demo')">
                            <span class="material-symbols-outlined">visibility</span>
                            <span>${isEn ? 'View UK Demo Dishes (7)' : 'Ver Platos de Ejemplo UK (7)'}</span>
                        </button>
                    </div>
                ` : ''}
            `}

            <div class="matrix-header-bar">
                <div class="matrix-title-block">
                    <h3>${isEn ? 'UK FSA 14 Allergen Declarations Matrix' : 'Matriz Oficial de Declaración de Alérgenos (FSA UK)'}</h3>
                    <p>${isEn 
                        ? 'Mandatory kitchen chart. Meets Food Standards Agency (FSA) compliance requirements for hospitality.' 
                        : 'Cuadro de control obligatorio de cocina. Cumple con los requisitos legales de la Food Standards Agency (FSA).'}</p>
                </div>
                <div class="matrix-actions">
                    <button class="btn-m3-tonal" onclick="window.print()">
                        <span class="material-symbols-outlined">print</span>
                        <span>${isEn ? 'Print Matrix' : 'Imprimir Matriz'}</span>
                    </button>
                </div>
            </div>

            <div class="matrix-table-wrapper">
                <table class="fsa-matrix-table">
                    <thead>
                        <tr>
                            <th class="col-recipe-name">${isEn ? 'Dish / Recipe Name' : 'Plato / Nombre de Receta'}</th>
                            ${allergens.map(a => `
                                <th class="col-allergen" title="${a.name_en}">
                                    <div class="th-allergen-inner" style="color: ${a.color};">
                                        <span class="material-symbols-outlined" style="font-size: 18px;">${a.icon}</span>
                                        <span class="th-name">${a.name_en}</span>
                                    </div>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${recipesWithAllergens.length === 0 ? `
                            <tr>
                                <td colspan="${allergens.length + 1}" style="text-align:center; padding: 32px;">
                                    ${isEn ? 'No recipes loaded. Save recipes to populate this matrix.' : 'No hay recetas cargadas en este momento.'}
                                </td>
                            </tr>
                        ` : recipesWithAllergens.map(item => `
                            <tr>
                                <td class="col-recipe-name-cell" onclick="window.dashboard.openRecipeDetails('${item.id}')">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <strong>${item.name}</strong>
                                        ${item.is_demo ? `<span class="demo-tag-pill-table">${isEn ? 'Demo' : 'Ejemplo'}</span>` : ''}
                                    </div>
                                </td>
                                ${allergens.map(a => {
                                    const hasIt = item.detectedIds.has(a.id);
                                    return `
                                        <td class="col-allergen-cell ${hasIt ? 'has-allergen' : 'free-allergen'}">
                                            ${hasIt 
                                                ? `<span class="allergen-dot-badge" style="background:${a.color};" title="${isEn ? `Contains ${a.name_en}` : `Contiene ${a.name_es}`}">●</span>` 
                                                : `<span class="allergen-none-dash">-</span>`}
                                        </td>
                                    `;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    openRecipeDetails(recipeId) {
        if (!recipeId) return;

        // Si es una receta de demostración, mostrar modal especial informativo
        if (typeof recipeId === 'string' && recipeId.startsWith('demo-')) {
            const demoList = window.DEMO_UK_RECIPES || [];
            const dish = demoList.find(d => d.id === recipeId);
            if (dish) {
                this.showDemoRecipeModal(dish);
                return;
            }
        }

        if (this.handleRecipeClick) {
            this.handleRecipeClick(recipeId);
        }
    }

    showDemoRecipeModal(dish) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const detected = window.detectRecipeAllergens ? window.detectRecipeAllergens(dish) : [];
        const detectedIds = detected.map(d => (typeof d === 'object' ? d.id : d));
        const allergens = window.UK_ALLERGENS || [];

        // Remover modal existente si hubiera
        const existing = document.getElementById('demoRecipeModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'demoRecipeModal';
        modal.className = 'demo-recipe-modal-backdrop';
        modal.innerHTML = `
            <div class="demo-recipe-modal-card">
                <div class="demo-modal-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="material-symbols-outlined" style="color: #059669; font-size: 28px;">restaurant</span>
                        <div>
                            <h3 style="margin: 0; font-size: 18px; color: #0F172A;">${isEn ? (dish.name_en || dish.name_es) : dish.name_es}</h3>
                            <span class="demo-tag-pill" style="margin-top: 4px; display: inline-block;">${isEn ? 'Demo Menu Dish (FSA UK)' : 'Plato de Demostración (FSA UK)'}</span>
                        </div>
                    </div>
                    <button class="btn-close-modal-m3" onclick="document.getElementById('demoRecipeModal').remove()">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div class="demo-modal-body">
                    <p style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 16px;">
                        ${isEn ? (dish.description_en || dish.description_es) : (dish.description_es || '')}
                    </p>

                    <div style="margin-bottom: 16px;">
                        <h4 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B; margin-bottom: 8px;">
                            ${isEn ? 'Ingredients:' : 'Ingredientes:'}
                        </h4>
                        <ul style="margin: 0; padding-left: 20px; font-size: 13.5px; color: #334155; line-height: 1.6;">
                            ${(dish.ingredients || []).map(i => `<li>${i.name || i}</li>`).join('')}
                        </ul>
                    </div>

                    <div>
                        <h4 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B; margin-bottom: 8px;">
                            ${isEn ? 'Detected UK Allergens:' : 'Alérgenos Detectados (FSA UK):'}
                        </h4>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            ${detectedIds.map(id => {
                                const found = allergens.find(a => a.id === id);
                                if (!found) return '';
                                return `
                                    <div class="allergen-pill-detected" style="background: ${found.bg}; border: 1px solid ${found.border}; color: ${found.color};">
                                        <span class="material-symbols-outlined" style="font-size: 16px;">${found.icon}</span>
                                        <span>${isEn ? found.name_en : found.name_es}</span>
                                    </div>
                                `;
                            }).join('')}
                            ${detectedIds.length === 0 ? `
                                <span style="color: #059669; font-weight: 700; font-size: 13px;">${isEn ? 'Free from all 14 UK allergens' : 'Libre de los 14 alérgenos de UK'}</span>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div class="demo-modal-footer">
                    <button class="btn-m3-tonal" onclick="document.getElementById('demoRecipeModal').remove()">
                        ${isEn ? 'Close' : 'Cerrar'}
                    </button>
                    <a href="recipe-form.html" class="btn-m3-filled" style="text-decoration:none;">
                        <span class="material-symbols-outlined">add</span>
                        <span>${isEn ? 'Create My Own Recipe' : 'Crear Mi Propia Receta'}</span>
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

class SearchHistory {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.storageKey = 'recipe_pantry_search_history';
        this.history = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        this.suggestionsEl = document.getElementById('searchSuggestions');
        this.inputEl = document.getElementById('searchInput');
    }

    save(query) {
        if (!query || query.length < 2) return;

        // Remove existing and add to front
        this.history = this.history.filter(h => h.toLowerCase() !== query.toLowerCase());
        this.history.unshift(query);

        // Keep only top 10
        this.history = this.history.slice(0, 10);
        localStorage.setItem(this.storageKey, JSON.stringify(this.history));
    }

    remove(query) {
        this.history = this.history.filter(h => h !== query);
        localStorage.setItem(this.storageKey, JSON.stringify(this.history));
        this.showSuggestions(this.inputEl.value.trim());
    }

    showSuggestions(query) {
        if (!this.suggestionsEl) return;

        let suggestions = [];
        let headerText = '';

        if (!query) {
            // Show recent history
            suggestions = this.history;
            headerText = window.i18n ? window.i18n.t('recentSearches') : 'Búsquedas recientes';
        } else {
            // Filter history or suggest from current recipes
            suggestions = this.history.filter(h => h.toLowerCase().includes(query.toLowerCase()));
            headerText = window.i18n ? window.i18n.t('suggestions') : 'Sugerencias';
        }

        if (suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }

        this.renderSuggestions(suggestions, headerText);
        this.suggestionsEl.classList.remove('hidden');
    }

    hideSuggestions() {
        if (this.suggestionsEl) {
            this.suggestionsEl.classList.add('hidden');
        }
    }

    renderSuggestions(items, header) {
        this.suggestionsEl.innerHTML = `
            <div class="suggestions-header">${header}</div>
            ${items.map(item => `
                <div class="suggestion-item" data-value="${item}">
                    <span class="material-symbols-outlined">history</span>
                    <span class="suggestion-text">${item}</span>
                    <span class="material-symbols-outlined suggestion-remove" data-remove="${item}">close</span>
                </div>
            `).join('')}
        `;

        // Event listeners for suggestion items
        this.suggestionsEl.querySelectorAll('.suggestion-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.dataset.remove) {
                    e.stopPropagation();
                    this.remove(e.target.dataset.remove);
                    return;
                }
                const value = el.dataset.value;
                this.inputEl.value = value;
                this.hideSuggestions();
                this.dashboard.loadRecipes({ search: value });

                // Show clear button
                const clearBtn = document.getElementById('clearSearch');
                if (clearBtn) clearBtn.classList.remove('hidden');
            });
        });
    }
}

// Inicializar y exponer
window.dashboard = new DashboardManager();
window.addEventListener('DOMContentLoaded', () => window.dashboard.init());
