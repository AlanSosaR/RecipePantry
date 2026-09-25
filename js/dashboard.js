// Lógica específica del Dashboard - v646
console.log('📄 [File] js/dashboard.js loaded (v646)');

class DashboardManager {
    constructor() {
        this.currentFilters = {};
        this.displayMode = 'list'; // Forzado a lista por solicitud de diseño
        this.currentView = localStorage.getItem('recipe_pantry_current_view') || 'recipes';
        this.currentRecipes = [];
        this.selectedRecipeId = null;
        this.selectedRecipes = new Set();
        this.isSelectionMode = false;
        this.currentFolder = null;

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
            console.log('%c🚀 Dashboard Inicializado (Recipe Pantry Premium)', 'color: #10B981; font-weight: bold;');

            // 0. Parsear vista y carpeta de inmediato (sincrónicamente antes de cualquier await)
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

            if (this.currentView === 'recipes') {
                // SOLO usar el parámetro de la URL — nunca sessionStorage como fallback
                // para evitar que una carpeta anterior «contamine» la navegación al root.
                const folderParam = urlParams.get('folder');
                if (folderParam) {
                    this.currentFolder = decodeURIComponent(folderParam).trim();
                } else {
                    this.currentFolder = null; // siempre resetear al root si no hay param
                }
            }

            // Aplicar de inmediato el estado visual de la carpeta (oculta header general "Mis Recetas" y muestra el breadcrumb)
            this.renderFolders();

            // 1. Verificar autenticación silenciosamente
            const isAuthenticated = await window.authManager.checkAuth();

            // Inicializar notificaciones en paralelo (no bloquea recetas)
            if (isAuthenticated && window.notificationManager) {
                window.notificationManager.init(); // fire-and-forget
            }

            // Sincronizar restaurante con el usuario validado de inmediato
            if (isAuthenticated && window.restaurantMenu) {
                window.restaurantMenu.syncFromSupabase();
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

            this.currentOffset = 0;
            if (!this.selectedRecipes) this.selectedRecipes = new Set();
            this.isSelectionMode = false;

            console.log(`📦 Cargando vista: ${this.currentView}...`);
            const activeNavItem = document.querySelector(`.nav-item[data-view="${this.currentView}"]`);
            this.switchView(this.currentView, activeNavItem);

            console.log('✨ Dashboard listo');

            this.setupEventListeners();

            // Sincronizar navegación atrás/adelante del navegador
            window.addEventListener('popstate', () => {
                const p = new URLSearchParams(window.location.search);
                const v = p.get('view') || 'recipes';
                // Usar SOLO la URL — sin sessionStorage para evitar carpetas fantasma
                const f = p.get('folder') ? decodeURIComponent(p.get('folder')).trim() : null;
                if (v && v !== this.currentView) {
                    const nav = document.querySelector(`.nav-item[data-view="${v}"]`);
                    this.switchView(v, nav);
                }
                if (this.currentView === 'recipes' && this.currentFolder !== f) {
                    this.currentFolder = f;
                    this.clearSelection();
                    this.renderFolders();
                    this.renderRecipesGrid(this.currentRecipes);
                }
            });

            // Al restaurar la página desde la caché del navegador (bfcache en móviles)
            window.addEventListener('pageshow', async (event) => {
                const p = new URLSearchParams(window.location.search);
                const f = p.get('folder') ? decodeURIComponent(p.get('folder')).trim() : null;
                if (this.currentView === 'recipes') {
                    if (this.currentFolder !== f) {
                        this.currentFolder = f || null;
                        this.clearSelection();
                        this.renderFolders();
                    }
                    if (event.persisted) {
                        console.log('⚡ Retorno desde bfcache (pageshow): recargando caché local a 0ms');
                        await this.loadRecipes({ orderBy: 'name_es', ascending: true });
                    }
                }
            });

            // Sincronización instantánea ante mutaciones en otras pestañas o páginas (0ms)
            window.addEventListener('storage', async (e) => {
                if (e.key === 'rp_recipe_mutation') {
                    console.log('⚡ Mutación de receta detectada en storage, recargando a 0ms');
                    await this.loadRecipes(this.lastFilters || { orderBy: 'name_es', ascending: true });
                }
            });

            document.addEventListener('visibilitychange', async () => {
                if (document.visibilityState === 'visible') {
                    const lastMutation = localStorage.getItem('rp_recipe_mutation');
                    if (lastMutation && (!this._lastRenderMutation || this._lastRenderMutation < lastMutation)) {
                        this._lastRenderMutation = lastMutation;
                        console.log('⚡ Visibilidad activa con mutación pendiente, recargando a 0ms');
                        await this.loadRecipes(this.lastFilters || { orderBy: 'name_es', ascending: true });
                    }
                }
            });

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
                    } else if (this.currentView === 'menu') {
                        if (window.restaurantMenu) {
                            window.restaurantMenu.setSearchQuery(query);
                        }
                    } else {
                        this.loadRecipes({ search: query });
                        if (query.length > 2) {
                            this.searchHistory.save(query);
                        }
                    }
                }, 200);

                if (this.currentView !== 'allergens' && this.currentView !== 'menu') {
                    // Update suggestions only for recipes
                    this.searchHistory.showSuggestions(query);
                } else {
                    this.searchHistory.hideSuggestions();
                }
            });

            searchInput.addEventListener('focus', () => {
                if (this.currentView !== 'allergens' && this.currentView !== 'menu') {
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
                    } else if (this.currentView === 'menu') {
                        if (window.restaurantMenu) {
                            window.restaurantMenu.setSearchQuery('');
                        }
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

        // Listener para actualizaciones (Cache-First Revalidation & Mutaciones 0ms)
        window.addEventListener('recipes-index-updated', async (e) => {
            console.log('🔄 Índice de recetas actualizado');
            if (e.detail && Array.isArray(e.detail) && e.detail.length > 0) {
                if (e.detail.length > 1 || !this.currentRecipes) {
                    this.currentRecipes = e.detail;
                } else {
                    const single = e.detail[0];
                    if (this.currentRecipes) {
                        const idx = this.currentRecipes.findIndex(r => r.id === single.id);
                        if (idx >= 0) {
                            this.currentRecipes[idx] = { ...this.currentRecipes[idx], ...single };
                        } else {
                            this.currentRecipes.unshift(single);
                        }
                    } else {
                        this.currentRecipes = [single];
                    }
                }
            } else if (window.localDB) {
                this.currentRecipes = await window.localDB.getAll('recipes_index') || [];
            }
            if (['recipes', 'favorites', 'shared'].includes(this.currentView)) {
                this.renderFolders();
                this.renderRecipesGrid(this.currentRecipes);
            }
        });

        // Listener para cambios de carpetas privadas
        window.addEventListener('folders-updated', () => {
            if (this.currentView === 'recipes') {
                this.renderFolders();
            }
        });

        // Cerrar menú estilo Dropbox o FAB menu al hacer click fuera
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('newDropboxMenu');
            if (menu && !menu.classList.contains('hidden')) {
                const wrapper = document.querySelector('.dropbox-new-wrapper');
                if (!wrapper || !wrapper.contains(e.target)) {
                    menu.classList.add('hidden');
                }
            }
            if (!e.target.closest('#m3FabMenuContainer')) {
                this.closeFabMenu();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeFabMenu();
                this.closeNewDropboxMenu();
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
        if (this.closeFabMenu) this.closeFabMenu();
        if (this.selectedRecipes) {
            this.selectedRecipes.clear();
            if (this.updateActionBar) this.updateActionBar();
        }
        localStorage.setItem('recipe_pantry_current_view', view);

        // Sincronizar URL para que al refrescar (F5) permanezca exactamente en esta vista
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('view', view);
            if (view !== 'recipes' || !this.currentFolder) {
                url.searchParams.delete('folder');
            } else if (this.currentFolder) {
                url.searchParams.set('folder', this.currentFolder);
            }
            window.history.replaceState({ view, folder: this.currentFolder }, '', url.toString());
        } catch (e) {
            console.warn('[Dashboard] Could not update URL state:', e);
        }

        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        if (activeItem) {
            activeItem.classList.add('active');
        } else {
            const navEl = document.querySelector(`.nav-item[data-view="${view}"]`);
            if (navEl) navEl.classList.add('active');
        }

        document.documentElement.setAttribute('data-current-view', view);
        document.body.setAttribute('data-current-view', view);

        const carousel = document.getElementById('suggestedCarouselSection');
        const breadcrumb = document.getElementById('folderBreadcrumb');
        const dashHeader = document.querySelector('.dashboard-header');

        if (view !== 'recipes') {
            this.currentFolder = null;
            if (carousel) {
                carousel.classList.add('hidden');
                carousel.style.display = 'none';
            }
            if (breadcrumb) {
                breadcrumb.classList.add('hidden');
                breadcrumb.style.display = 'none';
            }
        }

        if (['allergens', 'menu', 'help', 'settings'].includes(view)) {
            if (dashHeader) {
                dashHeader.classList.add('hidden');
                dashHeader.style.display = 'none';
            }
        }

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

        // Actualizar botón "+ Nuevo" en la barra superior según la vista
        const btnNew = document.getElementById('btnNewRecipeTop');
        if (btnNew) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            if (view === 'menu') {
                btnNew.innerHTML = `
                    <span class="material-symbols-outlined">add</span>
                    <span>${isEn ? 'Add Dish' : 'Agregar Plato'}</span>
                `;
                btnNew.onclick = () => {
                    if (window.restaurantMenu) {
                        window.restaurantMenu.showAddDishForm();
                    }
                };
                btnNew.title = isEn ? 'Add dish to menu' : 'Agregar plato a la carta';
            } else {
                btnNew.innerHTML = `
                    <span class="material-symbols-outlined">add</span>
                    <span data-i18n="newRecipeBtn">${(window.i18n && window.i18n.t) ? window.i18n.t('newRecipeBtn', 'Nuevo') : 'Nuevo'}</span>
                `;
                btnNew.onclick = (e) => { this.toggleNewDropboxMenu(e); };
                btnNew.title = (window.i18n && window.i18n.t) ? window.i18n.t('newRecipe', 'Crear') : 'Crear';
            }
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
        this.currentView = 'help';
        document.documentElement.setAttribute('data-current-view', 'help');
        document.body.setAttribute('data-current-view', 'help');

        const grid = document.getElementById('recipesGrid');
        const empty = document.getElementById('emptyState');
        const help = document.getElementById('helpView');
        const allergensView = document.getElementById('allergensView');
        const menuView = document.getElementById('menuView');
        const titleEl = document.getElementById('view-title');
        const dashHeader = document.querySelector('.dashboard-header');
        const carousel = document.getElementById('suggestedCarouselSection');
        const breadcrumb = document.getElementById('folderBreadcrumb');

        if (grid) grid.classList.add('hidden');
        if (empty) empty.classList.add('hidden');
        if (allergensView) allergensView.classList.add('hidden');
        if (menuView) menuView.classList.add('hidden');
        if (dashHeader) {
            dashHeader.classList.add('hidden');
            dashHeader.style.display = 'none';
        }
        if (carousel) {
            carousel.classList.add('hidden');
            carousel.style.display = 'none';
        }
        if (breadcrumb) {
            breadcrumb.classList.add('hidden');
            breadcrumb.style.display = 'none';
        }
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
        document.documentElement.setAttribute('data-current-view', 'menu');
        document.body.setAttribute('data-current-view', 'menu');

        const grid = document.getElementById('recipesGrid');
        const empty = document.getElementById('emptyState');
        const help = document.getElementById('helpView');
        const allergensView = document.getElementById('allergensView');
        const menuView = document.getElementById('menuView');
        const titleEl = document.getElementById('view-title');
        const dashHeader = document.querySelector('.dashboard-header');
        const carousel = document.getElementById('suggestedCarouselSection');
        const breadcrumb = document.getElementById('folderBreadcrumb');

        if (grid) grid.classList.add('hidden');
        if (empty) empty.classList.add('hidden');
        if (help) help.classList.add('hidden');
        if (allergensView) allergensView.classList.add('hidden');
        if (dashHeader) {
            dashHeader.classList.add('hidden');
            dashHeader.style.display = 'none';
        }
        if (carousel) {
            carousel.classList.add('hidden');
            carousel.style.display = 'none';
        }
        if (breadcrumb) {
            breadcrumb.classList.add('hidden');
            breadcrumb.style.display = 'none';
        }
        const fab = document.querySelector('.fab-m3');
        if (fab) fab.classList.add('hidden');

        if (this.isSelectionMode) this.clearSelection();

        if (menuView) {
            menuView.classList.remove('hidden');
            if (window.restaurantMenu) {
                window.restaurantMenu.isAddingDish = false;
                window.restaurantMenu.isViewingDocument = false;
                window.restaurantMenu.render();
                // Si no tiene menú o está cargando, asegurar sincronización
                if (!window.restaurantMenu.hasMenu || window.restaurantMenu.isLoading) {
                    window.restaurantMenu.syncFromSupabase();
                }
            }
        }

        if (titleEl) {
            titleEl.textContent = (window.i18n && window.i18n.t) ? (window.i18n.t('navMenu') || 'Menú') : 'Menú';
        }

        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');
        if (searchInput) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            searchInput.placeholder = isEn 
                ? 'Search any dish, roast, burger, pizza or ingredient...' 
                : 'Buscar plato, pizza, asado, hamburguesa o ingrediente...';
            searchInput.value = (window.restaurantMenu && window.restaurantMenu.searchQuery) || '';
            if (clearBtn) {
                clearBtn.classList.toggle('hidden', !searchInput.value);
            }
        }
    }

    async fetchCompartidas() {
        return this.loadRecipes({ shared: true });
    }

    updateTitleHeader(forcedCount = null) {
        const titleEl = document.getElementById('view-title');
        if (!titleEl || this.isSelectionMode) return;

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const baseTitle = window.i18n ? (window.i18n.t('navRecipes') || window.i18n.t('myRecipes')) : 'Recetas';
        const isSearching = !!(this.lastFilters && this.lastFilters.search && this.lastFilters.search.trim());

        const isRootFolder = (f) => {
            if (!f || typeof f !== 'string') return true;
            return !f.trim();
        };

        if (this.currentView === 'recipes') {
            if (this.currentFolder) {
                // Dentro de una carpeta: cuenta sólo las recetas de esa carpeta
                const folderCount = forcedCount !== null ? forcedCount : (this.currentRecipes || []).filter(r => 
                    (r.pantry_es || '').trim().toLowerCase() === this.currentFolder.toLowerCase()
                ).length;
                titleEl.textContent = `${this.currentFolder} (${folderCount})`;
            } else if (isSearching) {
                const s = this.lastFilters.search.trim().toLowerCase();
                const searchCount = forcedCount !== null ? forcedCount : (this.currentRecipes || []).filter(r => {
                    const isRoot = isRootFolder(r.pantry_es);
                    if (!isRoot) return false;
                    return (r.name_es && r.name_es.toLowerCase().includes(s)) || (r.name_en && r.name_en.toLowerCase().includes(s));
                }).length;
                titleEl.textContent = `${this.lastFilters.search.trim()} (${searchCount})`;
            } else {
                // En la raíz (Despensa Principal): SÓLO cuenta recetas sin carpeta asignada
                const rootCount = forcedCount !== null ? forcedCount : (this.currentRecipes || []).filter(r => 
                    isRootFolder(r.pantry_es)
                ).length;
                titleEl.textContent = `${baseTitle} (${rootCount})`;
            }
        } else if (this.currentView === 'favorites') {
            const favCount = forcedCount !== null ? forcedCount : (this.currentRecipes || []).filter(r => r.is_favorite).length;
            titleEl.textContent = `${window.i18n ? window.i18n.t('navFavorites') : 'Favoritos'} (${favCount})`;
        } else if (this.currentView === 'shared') {
            const sharedCount = forcedCount !== null ? forcedCount : (this.currentRecipes || []).length;
            titleEl.textContent = `${window.i18n ? window.i18n.t('navShared') : 'Compartidas'} (${sharedCount})`;
        }
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

        this.updateTitleHeader();

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


    getVisibleRecipes() {
        if (!Array.isArray(this.currentRecipes) || this.currentRecipes.length === 0) return [];

        const isRootFolder = (f) => {
            if (!f || typeof f !== 'string') return true;
            return !f.trim();
        };

        const isSearching = !!(this.lastFilters && this.lastFilters.search && this.lastFilters.search.trim());

        if (this.currentView === 'recipes') {
            if (this.currentFolder) {
                // Dentro de una carpeta: solo recetas pertenecientes a esa carpeta
                return this.currentRecipes.filter(r => (r.pantry_es || '').trim().toLowerCase() === this.currentFolder.toLowerCase());
            } else if (isSearching) {
                const s = this.lastFilters.search.trim().toLowerCase();
                return this.currentRecipes.filter(r => {
                    const isRoot = isRootFolder(r.pantry_es);
                    if (!isRoot) return false;
                    return (r.name_es && r.name_es.toLowerCase().includes(s)) || (r.name_en && r.name_en.toLowerCase().includes(s));
                });
            } else {
                // En la raíz (Despensa Principal): recetas sueltas sin carpeta asignada
                return this.currentRecipes.filter(r => isRootFolder(r.pantry_es));
            }
        } else if (this.currentView === 'favorites') {
            return this.currentRecipes.filter(r => r.is_favorite);
        } else if (this.currentView === 'shared') {
            return this.currentRecipes.filter(r => r.sharingContext === 'received');
        }
        return this.currentRecipes;
    }

    handleSelectAll(e) {
        const visibleRecipes = this.getVisibleRecipes();
        if (!visibleRecipes || visibleRecipes.length === 0) return;

        if (e) {
            e.stopPropagation();
        }

        if (this._selectAllTimeout) return;
        this._selectAllTimeout = true;
        setTimeout(() => this._selectAllTimeout = false, 150);

        // Comprobar si todas las recetas visibles están seleccionadas (compatible con string y number)
        const isSelected = (id) => this.selectedRecipes.has(id) || this.selectedRecipes.has(String(id)) || this.selectedRecipes.has(Number(id));
        const allVisibleSelected = visibleRecipes.every(r => isSelected(r.id));

        if (allVisibleSelected) {
            // Si ya están seleccionadas, deseleccionar todo y salir del modo selección
            this.clearSelection();
            return;
        } else {
            // Si falta alguna o ninguna, seleccionamos todos los visibles
            visibleRecipes.forEach(r => this.selectedRecipes.add(r.id));
        }

        // Haptic feedback if available
        if (navigator.vibrate) try { navigator.vibrate(10); } catch(e){}

        this.isSelectionMode = this.selectedRecipes.size > 0;
        this.updateActionBar();
        this.renderRecipesGrid(this.currentRecipes);
        this.updateSelectAllCheckbox();
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
                // En móvil: el menú de 3 puntos (⋮) a la derecha
                if (window.innerWidth <= 768) {
                    moreBtn.style.setProperty('display', 'flex', 'important');
                    moreBtn.classList.remove('hidden');
                } else {
                    moreBtn.style.setProperty('display', 'none', 'important');
                    moreBtn.classList.add('hidden');
                }
            }
            const moreBtnHeader = document.getElementById('selectionMoreBtnHeader');
            if (moreBtnHeader) {
                // En PC: el menú junto al checkbox en el encabezado de la tabla
                if (window.innerWidth > 768) {
                    moreBtnHeader.style.setProperty('display', 'inline-flex', 'important');
                } else {
                    moreBtnHeader.style.setProperty('display', 'none', 'important');
                }
            }
            // Force PC selection header alignment leftwards next to title
            const dashHeader = document.querySelector('.dashboard-header');
            if (dashHeader) {
                dashHeader.classList.remove('hidden');
                if (window.innerWidth > 800) {
                    dashHeader.style.setProperty('justify-content', 'space-between', 'important');
                    dashHeader.style.setProperty('gap', '12px', 'important');
                }
            }

        } else {
            // Exit Selection Mode
            this.isSelectionMode = false;
            document.body.classList.remove('selection-mode-active');
            if (recipesGrid) recipesGrid.classList.remove('selection-mode-active');

            // Restore original title count via centralized updateTitleHeader
            this.updateTitleHeader();
            if (title) {
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
            if (dashHeader) {
                if (this.currentFolder && this.currentView === 'recipes') {
                    dashHeader.classList.add('hidden');
                } else {
                    dashHeader.classList.remove('hidden');
                }
                if (window.innerWidth > 800) {
                    dashHeader.style.setProperty('justify-content', 'space-between', 'important');
                    dashHeader.style.setProperty('gap', '8px', 'important');
                }
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

        const isEn = window.i18n && window.i18n.getLang() === 'en';
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

            const isFavorite = recipe.is_favorite;

            menu.innerHTML = `
                <div class="dropbox-menu-header">
                    <h4>${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</h4>
                </div>
                ${sharedLabelHTML}
                <button class="context-menu-item" onclick="window.dashboard.copyLinkSelected(); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">link</span>
                    ${window.i18n ? window.i18n.t('copyLinkLabel') : 'Copiar enlace'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.shareSelected(); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">share</span>
                    ${window.i18n ? window.i18n.t('shareSelection') : 'Compartir'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.moveSelected(); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">drive_file_move</span>
                    ${isEn ? 'Move to folder' : 'Mover a carpeta'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" onclick="window.dashboard.editSelected(); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">edit</span>
                    ${window.i18n ? window.i18n.t('formEditRecipe') : 'Editar receta'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.startRename('${recipe.id}', event); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">edit_square</span>
                    ${window.i18n ? window.i18n.t('rename') : 'Renombrar'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite}); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">${isFavorite ? 'star' : 'star_border'}</span>
                    ${isFavorite ? (window.i18n ? window.i18n.t('removeFav') : 'Quitar de favoritos') : (window.i18n ? window.i18n.t('addFav') : 'Añadir a favoritos')}
                </button>
                <div class="context-menu-divider"></div>
                ${isReceived ? `
                    <button class="context-menu-item" onclick="window.dashboard.saveSharedRecipe('${recipe.id}'); this.closest('.dropbox-menu-m3')?.remove();">
                        <span class="material-symbols-outlined">library_add</span>
                        ${window.i18n ? window.i18n.t('addToMyRecipes') : 'Agregar a mis recetas'}
                    </button>
                ` : ''}
                <button class="context-menu-item danger" onclick="window.dashboard.deleteSelected(); this.closest('.dropbox-menu-m3')?.remove();">
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
                <button class="context-menu-item" onclick="window.dashboard.copyLinkSelected(); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">link</span>
                    ${window.i18n ? (count === 1 ? window.i18n.t('copyLinkLabel') : 'Copiar enlaces') : 'Copiar enlaces'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.shareSelected(); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">share</span>
                    ${window.i18n ? (count === 1 ? window.i18n.t('shareSelection') : 'Compartir selección') : 'Compartir selección'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.moveSelected(); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">drive_file_move</span>
                    ${isEn ? 'Move to folder' : 'Mover a carpeta'}
                </button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item danger" onclick="window.dashboard.deleteSelected(); this.closest('.dropbox-menu-m3')?.remove();">
                    <span class="material-symbols-outlined">delete</span>
                    ${window.i18n ? window.i18n.t('deleteBtn') : 'Eliminar'}
                </button>
            `;
        }

        document.body.appendChild(menu);

        // Position menu
        const targetBtn = (event && event.currentTarget) ? event.currentTarget : (event?.target?.closest('button') || event?.target || document.body);
        const rect = targetBtn.getBoundingClientRect();

        if (window.innerWidth < 600) {
            // MOBILE: Bottom Sheet Style (v205)
            menu.classList.add('mobile-bottom-sheet');
            menu.style.position = 'fixed';
            menu.style.bottom = '40%';
            menu.style.left = '5%';
            menu.style.width = '90%';
            menu.style.top = 'auto';
            menu.style.transform = 'none';
            menu.style.borderRadius = '24px';
            menu.style.animation = 'm3-sheet-up 0.3s cubic-bezier(0, 0, 0.2, 1)';
            menu.style.zIndex = '3000';
        } else {
            let left = rect.left;
            // Si el botón está hacia la mitad derecha de la pantalla, alinear a la derecha
            if (rect.right > window.innerWidth / 2) {
                left = rect.right - 220;
            }
            // Clamping para asegurar que nunca quede fuera de la pantalla
            const menuWidth = 230;
            if (left < 16) left = 16;
            if (left + menuWidth > window.innerWidth - 16) {
                left = window.innerWidth - menuWidth - 16;
            }

            let top = rect.bottom + 8;
            if (top + 280 > window.innerHeight) {
                top = Math.max(16, rect.top - 280);
            }

            menu.style.top = `${top}px`;
            menu.style.left = `${left}px`;
        }

        // Close menu on outside click
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && !targetBtn.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 50);

        // Ensure menu closes when an action button is clicked
        menu.addEventListener('click', (e) => {
            if (e.target.closest('button')) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
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

    editRecipe(recipeId) {
        const recipe = this.currentRecipes?.find(r => r.id === recipeId);
        const folder = this.currentFolder || recipe?.pantry_es || '';
        const folderParam = folder ? `&folder=${encodeURIComponent(folder)}&returnTo=folder` : '';
        window.location.href = `/recipe-form?id=${recipeId}${folderParam}`;
    }

    editSelected() {
        if (this.selectedRecipes.size === 0) return;
        const recipeId = Array.from(this.selectedRecipes).sort()[0];
        this.editRecipe(recipeId);
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

        const visibleRecipes = this.getVisibleRecipes();
        const hasVisible = visibleRecipes && visibleRecipes.length > 0;
        const allSelected = hasVisible && visibleRecipes.every(r => this.selectedRecipes.has(r.id));
        const isAnySelected = hasVisible && visibleRecipes.some(r => this.selectedRecipes.has(r.id));
        const isIndeterminate = isAnySelected && !allSelected;

        const applyState = (cb) => {
            if (!cb) return;
            cb.checked = allSelected;
            cb.indeterminate = isIndeterminate;
            if (allSelected) {
                cb.setAttribute('checked', 'checked');
            } else {
                cb.removeAttribute('checked');
            }
        };

        [selectAllTop, selectAllList].forEach(applyState);

        // Refuerzo en siguiente frame para garantizar sincronía total con eventos de render
        requestAnimationFrame(() => {
            const top = document.getElementById('selectAllCheckboxTop');
            const list = document.getElementById('selectAllCheckboxList');
            [top, list].forEach(applyState);
        });
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

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const confirmMsg = isEn
            ? (count === 1 ? 'Are you sure you want to delete 1 recipe?' : `Are you sure you want to delete ${count} recipes?`)
            : (count === 1 ? '¿Seguro que desea eliminar 1 receta?' : `¿Seguro que desea eliminar ${count} recetas?`);

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
        this.openMoveModal(Array.from(this.selectedRecipes));
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
    // ─── Menú "Crear" Estilo Dropbox (Desktop) ──────────────────
    toggleNewDropboxMenu(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        const menu = document.getElementById('newDropboxMenu');
        if (!menu) return;
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
            menu.classList.remove('hidden');
        } else {
            menu.classList.add('hidden');
        }
    }

    closeNewDropboxMenu(e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('newDropboxMenu');
        if (menu) menu.classList.add('hidden');
    }

    // ─── Material 3 FAB Menu / Speed Dial (Móvil) ────────────────
    toggleFabMenu(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        const fab = document.getElementById('mainFabBtn') || document.querySelector('.fab-m3');
        if (fab && fab.classList.contains('fab-menu-open')) {
            this.closeFabMenu();
        } else {
            this.openFabMenu();
        }
    }

    openFabMenu() {
        const fab = document.getElementById('mainFabBtn') || document.querySelector('.fab-m3');
        const actions = document.getElementById('m3FabActions');
        const scrim = document.getElementById('m3FabScrim');

        if (fab) {
            fab.classList.add('fab-menu-open');
            fab.setAttribute('aria-expanded', 'true');
        }
        if (scrim) {
            scrim.classList.remove('hidden');
            void scrim.offsetHeight;
            scrim.classList.add('active');
        }
        if (actions) {
            actions.classList.remove('hidden');
            void actions.offsetHeight;
            actions.classList.add('active');
        }
    }

    closeFabMenu() {
        const fab = document.getElementById('mainFabBtn') || document.querySelector('.fab-m3');
        const actions = document.getElementById('m3FabActions');
        const scrim = document.getElementById('m3FabScrim');

        if (fab) {
            fab.classList.remove('fab-menu-open');
            fab.setAttribute('aria-expanded', 'false');
        }
        if (actions) {
            actions.classList.remove('active');
            setTimeout(() => {
                const currentFab = document.getElementById('mainFabBtn') || document.querySelector('.fab-m3');
                if (!currentFab?.classList.contains('fab-menu-open')) {
                    actions.classList.add('hidden');
                }
            }, 240);
        }
        if (scrim) {
            scrim.classList.remove('active');
            setTimeout(() => {
                const currentFab = document.getElementById('mainFabBtn') || document.querySelector('.fab-m3');
                if (!currentFab?.classList.contains('fab-menu-open')) {
                    scrim.classList.add('hidden');
                }
            }, 240);
        }
    }

    handleDropboxOption(option) {
        this.closeNewDropboxMenu();
        this.closeFabMenu();
        if (option === 'folder') {
            this.promptNewFolder();
        } else if (option === 'document') {
            const folderParam = this.currentFolder ? `?folder=${encodeURIComponent(this.currentFolder)}&returnTo=folder` : '';
            window.location.href = `/recipe-form${folderParam}`;
        } else if (option === 'scan') {
            const folderParam = this.currentFolder ? `?folder=${encodeURIComponent(this.currentFolder)}&returnTo=folder` : '';
            window.location.href = `/ocr${folderParam}`;
        }
    }

    // ─── Gestión de Carpetas Privadas ────────────────────────────
    renderFolders() {
        const breadcrumb = document.getElementById('folderBreadcrumb');
        const folderLabel = document.getElementById('currentFolderNameLabel');
        const dashHeader = document.querySelector('.dashboard-header');

        if (this.currentView !== 'recipes') {
            if (breadcrumb) {
                breadcrumb.classList.add('hidden');
                breadcrumb.style.display = 'none';
            }
            const carouselSection = document.getElementById('suggestedCarouselSection');
            if (carouselSection) {
                carouselSection.classList.add('hidden');
                carouselSection.style.display = 'none';
            }
            if (['allergens', 'menu', 'help', 'settings'].includes(this.currentView)) {
                if (dashHeader) {
                    dashHeader.classList.add('hidden');
                    dashHeader.style.display = 'none';
                }
            } else if (dashHeader && !this.isSelectionMode) {
                dashHeader.classList.remove('hidden');
                dashHeader.style.display = '';
            }
            return;
        }

        if (this.currentFolder) {
            document.documentElement.setAttribute('data-active-folder', this.currentFolder);
            // Vista dentro de una carpeta: ocultar cabecera superior "Recetas" y carrusel
            if (dashHeader && !this.isSelectionMode) {
                dashHeader.classList.add('hidden');
            }

            const carouselSection = document.getElementById('suggestedCarouselSection');
            if (carouselSection) {
                carouselSection.classList.add('hidden');
            }

            if (breadcrumb) {
                breadcrumb.classList.remove('hidden');
                breadcrumb.style.display = 'flex';
                // Contar recetas dentro de esta carpeta (si ya cargaron)
                const hasRecs = this.currentRecipes && this.currentRecipes.length > 0;
                const folderCount = hasRecs
                    ? (this.currentRecipes || []).filter(r => (r.pantry_es || '').trim().toLowerCase() === this.currentFolder.toLowerCase()).length
                    : null;
                if (folderLabel) folderLabel.textContent = folderCount !== null ? `${this.currentFolder} (${folderCount})` : this.currentFolder;
            }
        } else {
            document.documentElement.removeAttribute('data-active-folder');
            // Vista raíz de Mis Recetas: mostrar cabecera "Recetas"
            if (breadcrumb) {
                breadcrumb.classList.add('hidden');
                breadcrumb.style.display = 'none';
            }
            if (dashHeader) {
                dashHeader.classList.remove('hidden');
            }
        }
    }

    renderFolderRow(folderName, count) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const safeF = folderName.replace(/'/g, "\\'");
        return `
            <div class="file-row-m3 folder-row-dropbox" 
                 data-folder="${safeF}"
                 role="option"
                 tabindex="0"
                 onclick="window.dashboard.openFolder('${safeF}')"
                 style="cursor: pointer; background: #FAFDFB; border-bottom: 1.5px solid #F0FDF4;">
                
                <div class="col-checkbox" onclick="event.stopPropagation()">
                    <span class="material-symbols-outlined" style="font-size: 20px; color: #D1D5DB;">folder</span>
                </div>

                <div class="col-icon">
                    <span class="material-symbols-outlined" style="font-size: 26px; color: #10B981; font-variation-settings: 'FILL' 1;">folder</span>
                </div>

                <div class="col-name text-ellipsis" style="display: flex; align-items: center; gap: 8px;">
                    <span class="recipe-name" style="font-weight: 700; color: #111827;">${folderName}</span>
                    <span style="font-size: 11.5px; color: #059669; font-weight: 600; background: #ECFDF5; padding: 1px 7px; border-radius: 6px;">${count} ${count === 1 ? (isEn ? 'receta' : 'receta') : (isEn ? 'recetas' : 'recetas')}</span>
                </div>

                <div class="col-access">
                    <span style="color: #6B7280; font-size: 13px;">${window.i18n ? window.i18n.t('accessPrivate') : 'Solo tú'}</span>
                </div>

                <div class="col-date">—</div>

                <div class="col-actions">
                    <div class="row-actions-dropbox">
                        <button type="button" class="btn-icon-m3 row-folder-action-btn" title="Compartir carpeta" onclick="event.stopPropagation(); window.dashboard.openShareFolderModal('${safeF}')">
                            <span class="material-symbols-outlined" style="font-size: 18px;">share</span>
                        </button>
                        <button type="button" class="btn-icon-m3 row-folder-action-btn" title="Copiar enlace" onclick="event.stopPropagation(); window.dashboard.copyFolderLink('${safeF}')">
                            <span class="material-symbols-outlined" style="font-size: 18px;">link</span>
                        </button>
                        <button type="button" class="btn-icon-m3 row-folder-action-btn" title="Más opciones" onclick="event.stopPropagation(); window.dashboard.toggleFolderCardMenu(event, '${safeF}')">
                            <span class="material-symbols-outlined" style="font-size: 18px;">more_vert</span>
                        </button>
                        <button type="button" class="btn-icon-m3" title="Abrir carpeta" onclick="event.stopPropagation(); window.dashboard.openFolder('${safeF}')">
                            <span class="material-symbols-outlined">chevron_right</span>
                        </button>
                    </div>
                    <button type="button" class="btn-icon-m3 mobile-action-btn" onclick="event.stopPropagation(); window.dashboard.toggleFolderCardMenu(event, '${safeF}')">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
                </div>
            </div>
        `;
    }

    renderSuggestedCarousel(folders = [], counts = {}) {
        const section = document.getElementById('suggestedCarouselSection');
        const track = document.getElementById('suggestedCarouselTrack');
        if (!section || !track) return;

        folders = (folders || []).filter(f => f && f.trim().toLowerCase() !== 'prueba 2');

        if (this.currentView !== 'recipes' || this.currentFolder || folders.length === 0) {
            section.classList.add('hidden');
            section.style.display = 'none';
            track.innerHTML = '';
            return;
        }

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const folderCards = folders.map(f => {
            const safeF = f.replace(/'/g, "\\'");
            const count = counts[f] || 0;
            const countLabel = `${count} ${count === 1 ? (isEn ? 'receta' : 'receta') : (isEn ? 'recetas' : 'recetas')}`;

            return `
                <div class="dropbox-carousel-card" data-folder="${safeF}" onclick="window.dashboard.openFolder('${safeF}')">
                    <div class="card-media">
                        <span class="material-symbols-outlined folder-icon">folder</span>
                    </div>
                    <div class="card-meta">
                        <span class="card-title" title="${f}">${f}</span>
                        <span class="card-subtitle">Carpeta • ${countLabel}</span>
                    </div>
                    <div class="card-hover-actions" onclick="event.stopPropagation()">
                        <button type="button" class="card-action-btn" title="Compartir" onclick="window.dashboard.openShareFolderModal('${safeF}')">
                            <span class="material-symbols-outlined">share</span>
                        </button>
                        <button type="button" class="card-action-btn" title="Copiar enlace" onclick="window.dashboard.copyFolderLink('${safeF}')">
                            <span class="material-symbols-outlined">link</span>
                        </button>
                        <button type="button" class="card-action-btn" title="Más opciones" onclick="window.dashboard.toggleFolderCardMenu(event, '${safeF}')">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        track.innerHTML = folderCards;
        section.classList.remove('hidden');
        section.style.display = '';

        // Restaurar estado de visibilidad del ojo (recordar preferencia)
        const isCollapsed = localStorage.getItem('suggested_carousel_collapsed') === 'true';
        this.updateSuggestedCarouselState(isCollapsed);
    }

    toggleSuggestedCarousel() {
        const track = document.getElementById('suggestedCarouselTrack');
        const isCurrentlyHidden = track ? track.classList.contains('hidden') : false;
        const willCollapse = !isCurrentlyHidden;
        if (willCollapse) {
            localStorage.setItem('suggested_carousel_collapsed', 'true');
        } else {
            localStorage.removeItem('suggested_carousel_collapsed');
        }
        this.updateSuggestedCarouselState(willCollapse);
    }

    updateSuggestedCarouselState(isCollapsed) {
        const track = document.getElementById('suggestedCarouselTrack');
        const navButtons = document.getElementById('carouselNavButtons');
        const eyeIcon = document.getElementById('suggestedEyeIcon');

        if (isCollapsed) {
            if (track) track.classList.add('hidden');
            if (navButtons) navButtons.classList.add('hidden');
            if (eyeIcon) eyeIcon.textContent = 'visibility_off';
        } else {
            if (track) track.classList.remove('hidden');
            if (navButtons) navButtons.classList.remove('hidden');
            if (eyeIcon) eyeIcon.textContent = 'visibility';
        }
    }

    scrollCarousel(direction) {
        const track = document.getElementById('suggestedCarouselTrack');
        if (track) {
            track.scrollBy({ left: direction * 280, behavior: 'smooth' });
        }
    }

    openShareFolderModal(folderName) {
        this.closeFolderCardMenu();
        if (window.shareModal) {
            window.shareModal.open(folderName, 'folder');
        }
    }

    copyFolderLink(folderName) {
        this.closeFolderCardMenu();
        const url = `${window.location.origin}${window.location.pathname}?folder=${encodeURIComponent(folderName)}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                window.showToast('Enlace de la carpeta copiado al portapapeles', 'success');
            });
        } else {
            window.showToast('Enlace copiado', 'success');
        }
    }

    toggleFolderCardMenu(event, folderName) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const menu = document.getElementById('folderCardMenu');
        if (!menu) return;

        if (this._activeFolderMenuName === folderName && !menu.classList.contains('hidden')) {
            this.closeFolderCardMenu();
            return;
        }

        this._activeFolderMenuName = folderName;
        const safeF = folderName.replace(/'/g, "\\'");
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        menu.className = 'dropbox-folder-popover';
        menu.innerHTML = `
            <div class="folder-popover-header">
                <span class="folder-popover-title">${folderName}</span>
            </div>
            <div class="folder-popover-items">
                <button type="button" class="folder-popover-item" onclick="window.dashboard.closeFolderCardMenu(); window.dashboard.openFolder('${safeF}')">
                    <span class="material-symbols-outlined">folder_open</span>
                    <span>${isEn ? 'Open folder' : 'Abrir carpeta'}</span>
                </button>
                <button type="button" class="folder-popover-item" onclick="window.dashboard.closeFolderCardMenu(); window.dashboard.openShareFolderModal('${safeF}')">
                    <span class="material-symbols-outlined">share</span>
                    <span>${isEn ? 'Share' : 'Compartir'}</span>
                </button>
                <button type="button" class="folder-popover-item" onclick="window.dashboard.closeFolderCardMenu(); window.dashboard.copyFolderLink('${safeF}')">
                    <span class="material-symbols-outlined">link</span>
                    <span>${isEn ? 'Copy link' : 'Copiar enlace'}</span>
                </button>
                <div class="folder-popover-divider"></div>
                <button type="button" class="folder-popover-item" onclick="window.dashboard.closeFolderCardMenu(); window.dashboard.renameFolderByName('${safeF}')">
                    <span class="material-symbols-outlined">edit</span>
                    <span>${isEn ? 'Rename' : 'Cambiar nombre'}</span>
                </button>
                <button type="button" class="folder-popover-item item-danger" onclick="window.dashboard.closeFolderCardMenu(); window.dashboard.deleteFolderByName('${safeF}')">
                    <span class="material-symbols-outlined">delete</span>
                    <span>${isEn ? 'Delete' : 'Eliminar'}</span>
                </button>
            </div>
        `;

        const card = event.currentTarget.closest('.dropbox-carousel-card') || event.currentTarget;
        const cardRect = card.getBoundingClientRect();
        const menuWidth = 220;
        const menuHeight = 220;

        menu.style.position = 'fixed';
        let topPos = cardRect.bottom + 6;
        if (topPos + menuHeight > window.innerHeight - 10) {
            topPos = Math.max(10, cardRect.top - menuHeight - 6);
        }
        menu.style.top = `${topPos}px`;

        // Ubicar exactamente debajo de la tarjeta de la carpeta que lo abre
        let leftPos = cardRect.left;
        if (leftPos + menuWidth > window.innerWidth - 12) {
            leftPos = Math.max(12, cardRect.right - menuWidth);
        }
        menu.style.left = `${leftPos}px`;
        menu.classList.remove('hidden');
    }

    toggleCurrentFolderMenu(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        if (!this.currentFolder) return;

        const menu = document.getElementById('folderCardMenu');
        if (!menu) return;

        if (this._activeFolderMenuName === '__current_folder__' && !menu.classList.contains('hidden')) {
            this.closeFolderCardMenu();
            return;
        }

        this._activeFolderMenuName = '__current_folder__';
        const safeF = this.currentFolder.replace(/'/g, "\\'");
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        menu.className = 'm3-expressive-menu';
        menu.innerHTML = `
            <div class="m3-menu-header">
                <span class="m3-menu-title">${this.currentFolder}</span>
            </div>
            <div class="m3-menu-items">
                <button type="button" class="m3-menu-item" onclick="window.dashboard.closeFolderCardMenu(); window.dashboard.renameCurrentFolder()">
                    <span class="material-symbols-outlined">edit</span>
                    <span>${isEn ? 'Edit name' : 'Editar'}</span>
                </button>
                <button type="button" class="m3-menu-item" onclick="window.dashboard.closeFolderCardMenu(); window.dashboard.openShareFolderModal('${safeF}')">
                    <span class="material-symbols-outlined">share</span>
                    <span>${isEn ? 'Share' : 'Compartir'}</span>
                </button>
                <div class="m3-menu-divider"></div>
                <button type="button" class="m3-menu-item m3-item-danger" onclick="window.dashboard.closeFolderCardMenu(); window.dashboard.deleteCurrentFolder()">
                    <span class="material-symbols-outlined">delete</span>
                    <span>${isEn ? 'Delete folder' : 'Eliminar'}</span>
                </button>
            </div>
        `;

        const btn = event.currentTarget;
        const rect = btn.getBoundingClientRect();
        const menuWidth = 190;
        menu.style.position = 'fixed';
        menu.style.width = `${menuWidth}px`;
        menu.style.top = `${rect.bottom + 6}px`;
        let leftPos = rect.right - menuWidth;
        if (leftPos < 10) leftPos = 10;
        menu.style.left = `${leftPos}px`;
        menu.classList.remove('hidden');
    }

    closeFolderCardMenu() {
        const menu = document.getElementById('folderCardMenu');
        if (menu) menu.classList.add('hidden');
        this._activeFolderMenuName = null;
    }

    renameFolderByName(folderName) {
        if (!folderName) return;
        this.closeFolderCardMenu();
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        // 1. Localizar el elemento que contiene el nombre de la carpeta
        let targetEl = null;
        let cardContainer = null;

        // Intentar en el carrusel de carpetas
        const carouselCards = document.querySelectorAll('.dropbox-carousel-card');
        for (const card of carouselCards) {
            if (card.getAttribute('data-folder') === folderName) {
                targetEl = card.querySelector('.card-title');
                cardContainer = card;
                break;
            }
        }

        // Si no está en el carrusel, intentar en las filas de carpetas
        if (!targetEl) {
            const folderRows = document.querySelectorAll('.folder-row-dropbox');
            for (const row of folderRows) {
                if (row.getAttribute('data-folder') === folderName) {
                    targetEl = row.querySelector('.recipe-name');
                    cardContainer = row;
                    break;
                }
            }
        }

        // Si estamos dentro de la carpeta (breadcrumb)
        if (!targetEl && this.currentFolder === folderName) {
            targetEl = document.getElementById('currentFolderNameLabel');
            cardContainer = document.getElementById('currentFolderNameText');
        }

        if (!targetEl) {
            console.warn('[Dashboard] Could not locate folder element for inline rename:', folderName);
            return;
        }

        // Evitar múltiples inputs simultáneos
        if (targetEl.tagName === 'INPUT' || targetEl.querySelector?.('.folder-inline-rename-input')) {
            return;
        }

        const originalText = folderName;
        if (cardContainer) cardContainer.classList.add('is-renaming');

        // Crear input inline estilo Dropbox
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'folder-inline-rename-input';
        input.value = originalText;
        input.spellcheck = false;
        input.autocomplete = 'off';

        // Evitar que clicks en el input activen abrir carpeta
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('dblclick', (e) => e.stopPropagation());

        let finished = false;

        const restore = (textToRestore) => {
            if (cardContainer) {
                cardContainer.classList.remove('is-renaming');
                if (cardContainer.classList.contains('dropbox-carousel-card')) {
                    cardContainer.setAttribute('data-folder', textToRestore);
                }
            }
            targetEl.textContent = textToRestore;
            targetEl.title = textToRestore;
            if (input.parentNode) {
                input.replaceWith(targetEl);
            }
        };

        const commit = async () => {
            if (finished) return;
            finished = true;

            const newName = input.value.trim();
            if (!newName) {
                restore(originalText);
                return;
            }

            if (newName && newName !== originalText) {
                try {
                    // Actualizar texto temporalmente mientras guarda
                    targetEl.textContent = newName;
                    if (input.parentNode) input.replaceWith(targetEl);
                    if (cardContainer) cardContainer.classList.remove('is-renaming');

                    // Actualizar inmediatamente en memoria las recetas para que el carrusel y conteos no queden desfasados
                    if (this.currentRecipes && Array.isArray(this.currentRecipes)) {
                        this.currentRecipes.forEach(r => {
                            if ((r.pantry_es || '').trim().toLowerCase() === originalText.trim().toLowerCase()) {
                                r.pantry_es = newName;
                                r.pantry_en = newName;
                            }
                        });
                    }

                    await window.db.renameFolder(originalText, newName);
                    if (this.currentFolder === originalText) {
                        this.currentFolder = newName;
                        try {
                            const u = new URL(window.location.href);
                            u.searchParams.set('folder', newName);
                            window.history.replaceState({ view: 'recipes', folder: newName }, '', u.toString());
                        } catch (e) {}
                    }
                    await this.loadRecipes({ ...this.lastFilters, forceRefresh: true });
                    window.showToast(isEn ? 'Folder renamed' : 'Nombre de carpeta actualizado', 'success');
                } catch (err) {
                    console.error('[renameFolderByName] Error:', err);
                    window.showToast(isEn ? 'Error renaming folder' : 'Error al cambiar nombre', 'error');
                    restore(originalText);
                }
            } else {
                restore(originalText);
            }
        };

        const cancel = () => {
            if (finished) return;
            finished = true;
            restore(originalText);
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancel();
            }
        });

        input.addEventListener('blur', () => {
            commit();
        });

        // Reemplazar el título con el input y seleccionar texto
        targetEl.replaceWith(input);
        setTimeout(() => {
            input.focus();
            input.select();
        }, 50);
    }

    async deleteFolderByName(folderName) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        window.showActionToast({
            message: isEn
                ? `Delete folder <strong>"${folderName}"</strong> and all its recipes? This action cannot be undone.`
                : `¿Eliminar la carpeta <strong>"${folderName}"</strong> y todas sus recetas? Esta acción no se puede deshacer.`,
            actionText: isEn ? 'Delete' : 'Eliminar',
            cancelText: isEn ? 'Cancel' : 'Cancelar',
            type: 'error',
            actionColor: '#EF4444',
            onConfirm: async () => {
                // Actualizar inmediatamente en memoria eliminando las recetas de la carpeta
                if (this.currentRecipes && Array.isArray(this.currentRecipes)) {
                    this.currentRecipes = this.currentRecipes.filter(r => 
                        (r.pantry_es || '').trim().toLowerCase() !== folderName.trim().toLowerCase()
                    );
                }
                await window.db.deleteFolder(folderName);
                if (this.currentFolder === folderName) this.currentFolder = null;
                await this.loadRecipes({ ...this.lastFilters, forceRefresh: true });
                window.showToast(isEn ? 'Folder and recipes deleted' : 'Carpeta y recetas eliminadas', 'success');
            }
        });
    }

    openFolder(folderName, replaceUrl = false) {
        this.currentFolder = folderName ? folderName.trim() : null;
        this.clearSelection();

        try {
            if (this.currentFolder) {
                sessionStorage.setItem('rp_current_folder', this.currentFolder);
            } else {
                sessionStorage.removeItem('rp_current_folder');
            }
            const url = new URL(window.location.href);
            url.searchParams.set('view', 'recipes');
            if (this.currentFolder) {
                url.searchParams.set('folder', this.currentFolder);
            } else {
                url.searchParams.delete('folder');
            }
            if (replaceUrl) {
                window.history.replaceState({ view: 'recipes', folder: this.currentFolder }, '', url.toString());
            } else {
                window.history.pushState({ view: 'recipes', folder: this.currentFolder }, '', url.toString());
            }
        } catch (e) {
            console.warn('[Dashboard] Could not update URL state for folder:', e);
        }

        this.renderRecipesGrid(this.currentRecipes);
    }

    promptNewFolder() {
        this.openFolderModal();
    }

    openFolderModal() {
        this.closeNewDropboxMenu();
        const modal = document.getElementById('createFolderModal');
        const input = document.getElementById('newFolderModalInput');
        this.setFolderAccessType('only_me');
        if (modal) {
            modal.classList.remove('hidden');
            if (input) {
                input.value = 'Nueva carpeta';
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 50);
            }
        }
    }

    closeFolderModal() {
        const modal = document.getElementById('createFolderModal');
        if (modal) modal.classList.add('hidden');
    }

    setFolderAccessType(type) {
        const cardOnlyMe = document.getElementById('accessCardOnlyMe');
        const cardSpecific = document.getElementById('accessCardSpecific');
        const iconOnlyMe = document.getElementById('accessIconOnlyMe');
        const iconSpecific = document.getElementById('accessIconSpecific');
        const radioOnlyMe = document.getElementById('folderAccessOnlyMe');
        const radioSpecific = document.getElementById('folderAccessSpecific');

        if (type === 'only_me') {
            if (cardOnlyMe) cardOnlyMe.classList.add('active');
            if (cardSpecific) cardSpecific.classList.remove('active');
            if (iconOnlyMe) {
                iconOnlyMe.style.display = 'inline-flex';
                iconOnlyMe.textContent = 'check_circle';
            }
            if (iconSpecific) {
                iconSpecific.style.display = 'none';
            }
            if (radioOnlyMe) radioOnlyMe.checked = true;
        } else {
            if (cardSpecific) cardSpecific.classList.add('active');
            if (cardOnlyMe) cardOnlyMe.classList.remove('active');
            if (iconSpecific) {
                iconSpecific.style.display = 'inline-flex';
                iconSpecific.textContent = 'check_circle';
            }
            if (iconOnlyMe) {
                iconOnlyMe.style.display = 'none';
            }
            if (radioSpecific) radioSpecific.checked = true;
        }
    }

    async submitFolderModal() {
        const input = document.getElementById('newFolderModalInput');
        const name = input ? input.value.trim() : '';
        if (!name) {
            window.showToast(window.i18n && window.i18n.getLang() === 'en' ? 'Folder name is required' : 'El nombre de la carpeta es obligatorio', 'warning');
            return;
        }

        const isSpecific = document.getElementById('folderAccessSpecific')?.checked;
        this.closeFolderModal();

        const created = await window.db.createFolder(name);
        await this.renderFolders();
        this.renderRecipesGrid(this.currentRecipes);

        window.showToast(
            window.i18n && window.i18n.getLang() === 'en' 
                ? `Folder "${created}" created` 
                : `Carpeta "${created}" creada con éxito`, 
            'success'
        );

        if (isSpecific && window.shareModal) {
            window.shareModal.open(created, 'folder');
        }
    }

    renameCurrentFolder() {
        if (!this.currentFolder) return;
        this.renameFolderByName(this.currentFolder);
    }

    async deleteCurrentFolder() {
        if (!this.currentFolder) return;
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const folderName = this.currentFolder;
        window.showActionToast({
            message: isEn
                ? `Delete folder <strong>"${folderName}"</strong> and all its recipes? This action cannot be undone.`
                : `¿Eliminar la carpeta <strong>"${folderName}"</strong> y todas sus recetas? Esta acción no se puede deshacer.`,
            actionText: isEn ? 'Delete' : 'Eliminar',
            cancelText: isEn ? 'Cancel' : 'Cancelar',
            type: 'error',
            actionColor: '#EF4444',
            onConfirm: async () => {
                if (this.currentRecipes && Array.isArray(this.currentRecipes)) {
                    this.currentRecipes = this.currentRecipes.filter(r => 
                        (r.pantry_es || '').trim().toLowerCase() !== folderName.trim().toLowerCase()
                    );
                }
                await window.db.deleteFolder(folderName);
                this.currentFolder = null;
                try {
                    const u = new URL(window.location.href);
                    u.searchParams.delete('folder');
                    window.history.replaceState({ view: 'recipes', folder: null }, '', u.toString());
                } catch (e) {}
                await this.loadRecipes({ ...this.lastFilters, forceRefresh: true });
                window.showToast(isEn ? 'Folder and recipes deleted' : 'Carpeta y recetas eliminadas', 'success');
            }
        });
    }

    async shareCurrentFolder() {
        if (!this.currentFolder) return;
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const folderRecipes = (this.currentRecipes || []).filter(r => (r.pantry_es || '').trim().toLowerCase() === this.currentFolder.toLowerCase());
        const count = folderRecipes.length;
        
        const shareText = isEn 
            ? `Folder: ${this.currentFolder} (${count} recipes in RecipePantry)`
            : `Carpeta: ${this.currentFolder} (${count} recetas en RecipePantry)`;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: this.currentFolder,
                    text: shareText,
                    url: window.location.href
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
                    window.showToast(isEn ? 'Share info copied to clipboard' : 'Enlace copiado al portapapeles', 'success');
                }
            }
        } else {
            navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
            window.showToast(isEn ? 'Share info copied to clipboard' : 'Enlace copiado al portapapeles', 'success');
        }
    }

    async promptMoveSingle(recipeId) {
        this.openMoveModal([recipeId]);
    }

    async openMoveModal(recipeIds = []) {
        if (!recipeIds || recipeIds.length === 0) return;
        this.pendingMoveRecipeIds = recipeIds;
        this.selectedMoveTargetFolder = null;

        // Cerrar cualquier menú contextual abierto
        document.querySelectorAll('.recipe-context-menu').forEach(m => m.remove());

        const modal = document.getElementById('moveRecipeModal');
        const titleEl = document.getElementById('moveModalTitle');
        const listEl = document.getElementById('moveModalFolderList');
        const confirmBtn = document.getElementById('btnConfirmMoveModal');
        const newFolderRow = document.getElementById('moveModalNewFolderRow');
        const newFolderInput = document.getElementById('moveModalNewFolderInput');

        if (!modal || !listEl) return;

        // Reset inline new folder row
        if (newFolderRow) newFolderRow.classList.add('hidden');
        if (newFolderInput) newFolderInput.value = '';
        if (confirmBtn) confirmBtn.disabled = true;

        const isEn = window.i18n && window.i18n.getLang() === 'en';
        if (titleEl) {
            titleEl.textContent = recipeIds.length === 1
                ? (isEn ? 'Move 1 item to...' : 'Mover 1 elemento a...')
                : (isEn ? `Move ${recipeIds.length} items to...` : `Mover ${recipeIds.length} elementos a...`);
        }

        // Helper para raíz
        const isRoot = (f) => !f || typeof f !== 'string' || !f.trim() || (window.db && window.db._isRootFolderName && window.db._isRootFolderName(f));

        // Obtener todas las recetas disponibles para conteos fiables
        let allRecs = [];
        if (window.localDB) {
            try {
                allRecs = await window.localDB.getAll('recipes_index') || [];
            } catch (e) {}
        }
        if (!allRecs || allRecs.length === 0) {
            allRecs = Array.isArray(this.currentRecipes) ? this.currentRecipes : [];
        }

        // Determinar carpeta actual si es un solo elemento o si estamos dentro de una carpeta
        let currentFolderOfItem = null;
        if (recipeIds.length === 1) {
            const rec = allRecs.find(r => r.id === recipeIds[0]) || (this.currentRecipes || []).find(r => r.id === recipeIds[0]);
            currentFolderOfItem = (rec && rec.pantry_es) ? rec.pantry_es.trim() : '';
        } else if (this.currentFolder) {
            currentFolderOfItem = this.currentFolder.trim();
        } else {
            currentFolderOfItem = '';
        }

        // Obtener carpetas disponibles (registro + recetas) con nombres canónicos
        const dbFolders = await window.db.getMyFolders();
        const folderMap = new Map();

        // 1. Desde registro de carpetas
        (dbFolders || []).forEach(f => {
            if (f && !isRoot(f)) {
                folderMap.set(f.trim().toLowerCase(), f.trim());
            }
        });

        // 2. Desde recetas en índice o memoria
        allRecs.forEach(r => {
            const f = (r.pantry_es || '').trim();
            if (f && !isRoot(f) && f.toLowerCase() !== 'prueba 2') {
                if (!folderMap.has(f.toLowerCase())) {
                    folderMap.set(f.toLowerCase(), f);
                }
            }
        });

        const folders = Array.from(folderMap.values())
            .filter(f => f && f.trim().toLowerCase() !== 'prueba 2')
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        // Contar recetas por carpeta de forma insensible a mayúsculas/minúsculas
        const countMap = new Map();
        allRecs.forEach(r => {
            const f = (r.pantry_es || '').trim();
            if (f && !isRoot(f)) {
                const key = f.toLowerCase();
                countMap.set(key, (countMap.get(key) || 0) + 1);
            }
        });

        // Generar items de la lista
        let html = '';

        // Opción: Raíz (Mis Recetas / Sin carpeta)
        const isCurrentRoot = !currentFolderOfItem;
        html += `
            <div class="move-modal-folder-item ${isCurrentRoot ? 'current-location' : ''}" 
                 data-folder="" 
                 onclick="window.dashboard.selectMoveTarget('')" 
                 ondblclick="window.dashboard.selectAndExecuteMove('')">
                <div class="move-modal-item-icon">
                    <span class="material-symbols-outlined" style="font-size: 24px; color: #10B981; font-variation-settings: 'FILL' 1;">inventory_2</span>
                </div>
                <div class="move-modal-item-info">
                    <div class="move-modal-item-name">${isEn ? 'Main Pantry (Root)' : 'Despensa Principal (Raíz)'}</div>
                    <div class="move-modal-item-sub">${isCurrentRoot ? (isEn ? 'Current location' : 'Ubicación actual') : (isEn ? 'Main location' : 'Ubicación principal')}</div>
                </div>
                <div class="move-modal-item-access">${isEn ? 'Only you' : 'Solo tú'}</div>
            </div>
        `;

        // Opciones: Cada carpeta
        folders.forEach(f => {
            const safeF = f.replace(/'/g, "\\'");
            const isCurrent = currentFolderOfItem !== null && currentFolderOfItem.toLowerCase() === f.toLowerCase();
            const count = countMap.get(f.toLowerCase()) || 0;
            const countLabel = `${count} ${count === 1 ? (isEn ? 'recipe' : 'receta') : (isEn ? 'recipes' : 'recetas')}`;

            html += `
                <div class="move-modal-folder-item ${isCurrent ? 'current-location' : ''}" 
                     data-folder="${safeF}" 
                     onclick="window.dashboard.selectMoveTarget('${safeF}')" 
                     ondblclick="window.dashboard.selectAndExecuteMove('${safeF}')">
                    <div class="move-modal-item-icon">
                        <span class="material-symbols-outlined" style="font-size: 24px; color: #10B981; font-variation-settings: 'FILL' 1;">folder</span>
                    </div>
                    <div class="move-modal-item-info">
                        <div class="move-modal-item-name" title="${f}">${f}</div>
                        <div class="move-modal-item-sub">${isCurrent ? (isEn ? 'Current location' : 'Ubicación actual') : countLabel}</div>
                    </div>
                    <div class="move-modal-item-access">${isEn ? 'Only you' : 'Solo tú'}</div>
                </div>
            `;
        });

        listEl.innerHTML = html;
        modal.classList.remove('hidden');
    }

    closeMoveModal() {
        const modal = document.getElementById('moveRecipeModal');
        if (modal) modal.classList.add('hidden');
        this.pendingMoveRecipeIds = null;
        this.selectedMoveTargetFolder = null;
    }

    selectMoveTarget(folderName) {
        this.selectedMoveTargetFolder = folderName;
        const listEl = document.getElementById('moveModalFolderList');
        const confirmBtn = document.getElementById('btnConfirmMoveModal');

        if (listEl) {
            const items = listEl.querySelectorAll('.move-modal-folder-item');
            items.forEach(item => {
                if (item.getAttribute('data-folder') === folderName) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        }

        if (confirmBtn) {
            confirmBtn.disabled = false;
        }
    }

    async selectAndExecuteMove(folderName) {
        this.selectMoveTarget(folderName);
        await this.executeMoveModal();
    }

    async executeMoveModal() {
        if (this.selectedMoveTargetFolder === null || !this.pendingMoveRecipeIds || this.pendingMoveRecipeIds.length === 0) {
            return;
        }

        const targetFolder = this.selectedMoveTargetFolder.trim();
        const ids = [...this.pendingMoveRecipeIds];
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        // 1. CERRAR MODAL INMEDIATAMENTE
        this.closeMoveModal();

        // 2. ACTUALIZACIÓN OPTIMISTA INSTANTÁNEA EN MEMORIA (0 ms)
        const idSet = new Set(ids);
        if (Array.isArray(this.currentRecipes)) {
            this.currentRecipes.forEach(r => {
                if (idSet.has(r.id)) {
                    r.pantry_es = targetFolder;
                    r.pantry_en = targetFolder;
                }
            });
        }
        if (Array.isArray(this.allRecipes)) {
            this.allRecipes.forEach(r => {
                if (idSet.has(r.id)) {
                    r.pantry_es = targetFolder;
                    r.pantry_en = targetFolder;
                }
            });
        }

        // Si la carpeta destino es nueva, asegurar que esté registrada en local inmediatamente
        if (targetFolder && window.db && window.db.createFolder) {
            window.db.createFolder(targetFolder);
        }

        // 3. RE-RENDERIZAR INMEDIATAMENTE LA GRILLA Y CONTADORES (0 ms)
        this.clearSelection();
        this.renderRecipesGrid(this.currentRecipes);
        this.renderFolders();
        this.updateTitleHeader();

        // 4. NOTIFICACIÓN INMEDIATA DE ÉXITO
        const targetDesc = targetFolder ? `"${targetFolder}"` : (isEn ? 'Main Pantry' : 'Despensa Principal');
        const successMsg = ids.length === 1
            ? (isEn ? `Recipe moved to ${targetDesc}` : `Receta movida a ${targetDesc}`)
            : (isEn ? `${ids.length} recipes moved to ${targetDesc}` : `${ids.length} recetas movidas a ${targetDesc}`);
        window.showToast(successMsg, 'success');

        // 5. SINCRONIZACIÓN EN SEGUNDO PLANO (sin bloquear ni congelar la pantalla)
        (async () => {
            try {
                await Promise.all(ids.map(id => window.db.moveRecipeToFolder(id, targetFolder)));
            } catch (err) {
                console.error('[executeMoveModal] Error de persistencia en background:', err);
                window.showToast(isEn ? 'Error syncing with server' : 'Error al sincronizar con el servidor', 'error');
            }
        })();
    }

    toggleNewFolderInMoveModal() {
        const row = document.getElementById('moveModalNewFolderRow');
        const input = document.getElementById('moveModalNewFolderInput');
        if (row) {
            row.classList.remove('hidden');
            if (input) {
                input.value = '';
                setTimeout(() => input.focus(), 50);
            }
        }
    }

    cancelCreateFolderInMoveModal() {
        const row = document.getElementById('moveModalNewFolderRow');
        const input = document.getElementById('moveModalNewFolderInput');
        if (row) row.classList.add('hidden');
        if (input) input.value = '';
    }

    async confirmCreateFolderInMoveModal() {
        const input = document.getElementById('moveModalNewFolderInput');
        if (!input) return;
        const name = input.value.trim();
        if (!name) return;

        try {
            await window.db.createFolder(name);
            this.cancelCreateFolderInMoveModal();
            // Re-render move modal keeping current pendingMoveRecipeIds
            const currentPending = this.pendingMoveRecipeIds;
            await this.openMoveModal(currentPending);
            // Pre-seleccionar la carpeta recién creada
            this.selectMoveTarget(name);
        } catch (err) {
            console.error('[confirmCreateFolderInMoveModal] Error:', err);
        }
    }

    // ----------------------------

    renderRecipesGrid(recipes) {
        const container = document.getElementById('recipesGrid');
        if (!container) return;

        // Helper para identificar la raíz (recetas sin carpeta asignada)
        const isRootFolder = (f) => {
            if (!f || typeof f !== 'string') return true;
            return !f.trim();
        };

        // Filtrar por carpeta actual si estamos en la vista de recetas
        let displayRecipes = recipes;
        const isSearching = !!(this.lastFilters && this.lastFilters.search && this.lastFilters.search.trim());
        if (this.currentView === 'recipes' && !isSearching) {
            if (this.currentFolder) {
                // Dentro de una carpeta: solo recetas pertenecientes a esa carpeta
                displayRecipes = recipes.filter(r => (r.pantry_es || '').trim().toLowerCase() === this.currentFolder.toLowerCase());
            } else {
                // En la vista global (raíz): recetas sueltas sin carpeta asignada
                displayRecipes = recipes.filter(r => isRootFolder(r.pantry_es));
            }
        } else if (this.currentView === 'recipes' && this.currentFolder && isSearching) {
            displayRecipes = recipes.filter(r => (r.pantry_es || '').trim().toLowerCase() === this.currentFolder.toLowerCase());
        }

        // Renderizar sección de carpetas o breadcrumb
        this.renderFolders();

        // Sincronizar contador en cabecera con el número exacto de recetas mostradas
        this.updateTitleHeader(displayRecipes ? displayRecipes.length : null);

        // Renderizar o esconder carrusel de carpetas sugeridas
        if (this.currentView === 'recipes' && !this.currentFolder) {
            const savedFolders = (window.db && window.db.getMyFoldersSync) ? window.db.getMyFoldersSync() : [];
            const folderMap = new Map();

            // 1. Carpetas guardadas (excluyendo la raíz)
            savedFolders.forEach(f => {
                if (f && !isRootFolder(f)) {
                    folderMap.set(f.trim().toLowerCase(), f.trim());
                }
            });

            // 2. Carpetas presentes en recetas (excluyendo la raíz)
            (this.currentRecipes || []).forEach(r => {
                const f = (r.pantry_es || '').trim();
                if (f && !isRootFolder(f) && !folderMap.has(f.toLowerCase())) {
                    folderMap.set(f.toLowerCase(), f);
                }
            });

            // 3. Contar recetas por carpeta
            const counts = {};
            (this.currentRecipes || []).forEach(r => {
                const f = (r.pantry_es || '').trim();
                if (f && !isRootFolder(f)) {
                    const canonical = folderMap.get(f.toLowerCase()) || f;
                    counts[canonical] = (counts[canonical] || 0) + 1;
                }
            });

            // 4. Mostrar todas las carpetas (incluso vacías para poder gestionarlas o meterles recetas)
            const folders = Array.from(folderMap.values())
                .filter(f => !isRootFolder(f) && f.trim().toLowerCase() !== 'prueba 2')
                .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

            this.renderSuggestedCarousel(folders, counts);
        } else {
            this.renderSuggestedCarousel([], {});
        }

        const emptyState = document.getElementById('emptyState');

        if (displayRecipes.length === 0) {
            container.innerHTML = '';
            if (emptyState) {
                // Actualizar contenido del empty state según la vista
                const imgGroup = document.getElementById('emptyStateImgGroup');
                const icon = document.getElementById('emptyStateIcon');
                const title = document.getElementById('emptyStateTitle');
                const desc = document.getElementById('emptyStateDesc');
                const btn = document.getElementById('emptyStateBtn');

                if (this.currentFolder) {
                    const isEn = window.i18n && window.i18n.getLang() === 'en';
                    if (imgGroup) imgGroup.innerHTML = '<span class="material-symbols-outlined" style="font-size: 80px; color: #10B981; margin: 0 auto; display: block; opacity: 0.85;">folder_open</span>';
                    if (title) {
                        title.textContent = isEn ? `Folder "${this.currentFolder}" is empty` : `La carpeta "${this.currentFolder}" está vacía`;
                        title.style.color = '#111827';
                    }
                    if (desc) {
                        desc.textContent = isEn ? 'Move recipes to this folder or create a new one to keep your cooking organized.' : 'Mueve recetas a esta carpeta o crea una nueva para tener tus preparaciones organizadas.';
                        desc.style.color = '#6B7280';
                        desc.style.opacity = '1';
                    }
                    if (btn) btn.classList.add('hidden');
                } else if (!this.currentFolder && this.currentView === 'recipes' && recipes.length > 0) {
                    // Todas las recetas están organizadas dentro de carpetas
                    const isEn = window.i18n && window.i18n.getLang() === 'en';
                    if (imgGroup) imgGroup.innerHTML = '<span class="material-symbols-outlined" style="font-size: 64px; color: #10B981; margin: 0 auto; display: block;">folder</span>';
                    if (title) {
                        title.textContent = isEn ? 'All recipes are in folders' : 'Todas tus recetas están en carpetas';
                        title.style.color = '#10B981';
                    }
                    if (desc) {
                        desc.textContent = isEn ? 'Open any folder above to view its recipes.' : 'Abre cualquiera de las carpetas de arriba para ver sus recetas.';
                        desc.style.color = '#6B7280';
                        desc.style.opacity = '1';
                    }
                    if (btn) btn.classList.add('hidden');
                } else if (this.currentView === 'shared') {
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

        const rows = displayRecipes.map(recipe => this.renderRecipeRow(recipe)).join('');
        container.innerHTML = header + `<div class="recipe-list-body">${rows}</div>`;
        this.updateSelectAllCheckbox();
        this.updateActionBar(); // Asegurar que botones globales se actualicen tras el render
    }

    renderRecipeRow(recipe) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const date = new Date(recipe.updated_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const isSelected = this.selectedRecipes.has(recipe.id) || this.selectedRecipes.has(String(recipe.id));

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

                <div class="col-name text-ellipsis" style="display: flex; align-items: center; gap: 8px;">
                    <span class="recipe-name">${isEn ? (recipe.name_en || recipe.name_es) : recipe.name_es}</span>
                    ${(!this.currentFolder && recipe.pantry_es && recipe.pantry_es.trim()) ? `
                        <span class="badge-folder-pill" onclick="event.stopPropagation(); window.dashboard.openFolder('${recipe.pantry_es.trim().replace(/'/g, "\\'")}')" style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: #047857; background: #D1FAE5; padding: 2px 8px; border-radius: 6px; cursor: pointer; flex-shrink: 0;" title="Carpeta: ${recipe.pantry_es.trim()}">
                            <span class="material-symbols-outlined" style="font-size: 13px;">folder</span>
                            <span>${recipe.pantry_es.trim()}</span>
                        </span>
                    ` : ''}
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
                        <button class="btn-icon-m3" title="Editar" onclick="event.stopPropagation(); window.dashboard.editRecipe('${recipe.id}')">
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

    isRootFolder(f) {
        if (!f || typeof f !== 'string') return true;
        const trimmed = f.trim().toLowerCase();
        return !trimmed || trimmed === 'general' || trimmed === 'mis recetas' || trimmed === 'my recipes' || trimmed === 'todas las recetas' || trimmed === 'all recipes';
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

        // Móvil: navegación directa al detalle pasando permiso si existe y carpeta de origen
        const targetFolder = this.currentFolder || (recipe?.pantry_es && !this.isRootFolder(recipe.pantry_es) ? recipe.pantry_es.trim() : '');
        let url = `/recipe-detail?id=${encodeURIComponent(recipeId)}`;
        if (permission) {
            url += `&permission=${encodeURIComponent(permission)}`;
        }
        if (targetFolder) {
            url += `&folder=${encodeURIComponent(targetFolder)}`;
        }
        window.location.href = url;
    }

    async openDetailInPanel(recipeId, recipe, permission) {
        const container = document.getElementById('recipesGrid');
        const emptyState = document.getElementById('emptyState');

        if (!container) return;

        // Si la receta pertenece a una carpeta y no teníamos carpeta fijada, recordarla
        if (!this.currentFolder && recipe?.pantry_es && !this.isRootFolder(recipe.pantry_es)) {
            this.currentFolder = recipe.pantry_es.trim();
        }

        // Actualizar URL del navegador sin navegar (SPA style) preservando la carpeta si existe
        const panelUrl = this.currentFolder ? `/?view=recipes&folder=${encodeURIComponent(this.currentFolder)}` : '/?view=recipes';
        history.pushState({ panelRecipe: recipeId, folder: this.currentFolder }, '', panelUrl);

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

        // Ocultar barra/breadcrumb de carpeta si está abierta
        const breadcrumb = document.getElementById('folderBreadcrumb');
        if (breadcrumb) {
            breadcrumb.classList.add('hidden');
            breadcrumb.style.display = 'none';
        }

        const suggestedCarousel = document.getElementById('suggestedCarouselSection');
        if (suggestedCarousel) suggestedCarousel.classList.add('hidden');

        const fab = document.querySelector('.fab-m3');
        if (fab) fab.classList.add('hidden');
        if (this.closeFabMenu) this.closeFabMenu();

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
                    this.editRecipe(recipeId);
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
        const returnUrl = this.currentFolder ? `/?view=recipes&folder=${encodeURIComponent(this.currentFolder)}` : '/?view=recipes';
        history.pushState({ view: 'recipes', folder: this.currentFolder }, '', returnUrl);

        const panel = document.querySelector('.pc-detail-panel');
        if (panel) {
            panel.classList.add('closing');
            setTimeout(() => {
                this._closeDetailPanelInternal();
            }, 120);
        } else {
            this._closeDetailPanelInternal();
        }
    }

    _closeDetailPanelInternal() {
        // Restaurar el header del dashboard solo si no estamos dentro de una carpeta
        const dashHeader = document.querySelector('.dashboard-header');
        if (dashHeader && !this.currentFolder && !this.isSelectionMode) {
            dashHeader.classList.remove('hidden');
        }

        const fab = document.querySelector('.fab-m3');
        if (fab) fab.classList.remove('hidden');

        // Restaurar la lista de recetas y el breadcrumb de carpetas
        this.renderFolders();
        this.updateTitleHeader();
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
                <button class="context-menu-item" onclick="window.dashboard.editRecipe('${recipe.id}')">
                    <span class="material-symbols-outlined">edit</span>
                    ${window.i18n ? window.i18n.t('formEditRecipe') : 'Editar receta'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.startRename('${recipe.id}', event)">
                    <span class="material-symbols-outlined">edit_square</span>
                    ${window.i18n ? window.i18n.t('rename') : 'Renombrar'}
                </button>
                <button class="context-menu-item" onclick="window.dashboard.promptMoveSingle('${recipe.id}')">
                    <span class="material-symbols-outlined">drive_file_move</span>
                    <span>${window.i18n && window.i18n.getLang() === 'en' ? 'Move to folder...' : 'Mover a carpeta...'}</span>
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

        const trigger = (event.currentTarget || event.target).closest('button') || event.target;
        const rect = trigger.getBoundingClientRect();
        const menuWidth = 240;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const margin = 12;

        if (vw < 600) {
            // MOBILE: Center Sheet Style (v205)
            menu.classList.add('mobile-bottom-sheet');
            menu.style.position = 'fixed';
            menu.style.bottom = '40%';
            menu.style.left = '5%';
            menu.style.width = '90%';
            menu.style.top = 'auto';
            menu.style.transform = 'none';
            menu.style.borderRadius = '24px';
            menu.style.animation = 'm3-sheet-up 0.3s cubic-bezier(0, 0, 0.2, 1)';
        } else {
            // DESKTOP: Estilo Dropbox con límites de pantalla y scroll vertical
            menu.style.position = 'fixed';
            menu.style.width = `${menuWidth}px`;

            const spaceBelow = vh - rect.bottom - margin;
            const spaceAbove = rect.top - margin;

            let top;
            let maxH;

            // Si hay espacio suficiente abajo (al menos 260px) o hay más espacio abajo que arriba, abre hacia abajo
            if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
                top = rect.bottom + 6;
                maxH = Math.min(spaceBelow - 8, 420);
            } else {
                // Abre hacia arriba, asegurando que NUNCA suba de la pantalla (mínimo margin)
                maxH = Math.min(spaceAbove - 8, 420);
                top = Math.max(margin, rect.top - maxH - 6);
            }

            // Evitar que se desborde horizontalmente
            let left = rect.right - menuWidth;
            if (left + menuWidth > vw - margin) {
                left = vw - menuWidth - margin;
            }
            if (left < margin) {
                left = margin;
            }

            menu.style.top = `${top}px`;
            menu.style.left = `${left}px`;
            menu.style.maxHeight = `${maxH}px`;
            menu.style.overflowY = 'auto';
            menu.style.overflowX = 'hidden';
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
        document.documentElement.setAttribute('data-current-view', 'allergens');
        document.body.setAttribute('data-current-view', 'allergens');

        const grid = document.getElementById('recipesGrid');
        const empty = document.getElementById('emptyState');
        const help = document.getElementById('helpView');
        const allergensView = document.getElementById('allergensView');
        const menuView = document.getElementById('menuView');
        const titleEl = document.getElementById('view-title');
        const dashHeader = document.querySelector('.dashboard-header');
        const carousel = document.getElementById('suggestedCarouselSection');
        const breadcrumb = document.getElementById('folderBreadcrumb');

        if (grid) grid.classList.add('hidden');
        if (empty) empty.classList.add('hidden');
        if (help) help.classList.add('hidden');
        if (menuView) menuView.classList.add('hidden');
        if (dashHeader) {
            dashHeader.classList.add('hidden');
            dashHeader.style.display = 'none';
        }
        if (carousel) {
            carousel.classList.add('hidden');
            carousel.style.display = 'none';
        }
        if (breadcrumb) {
            breadcrumb.classList.add('hidden');
            breadcrumb.style.display = 'none';
        }
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
            if (this.currentAllergenTab === 'matrix') {
                searchInput.placeholder = isEn 
                    ? 'Search dish in allergen matrix (e.g. Chicken, Chips, Pizza...)' 
                    : 'Buscar plato en la matriz (ej: Chicken, Chips, Pizza...)';
                searchInput.value = this.matrixSearchQuery || '';
            } else {
                searchInput.placeholder = isEn 
                    ? 'Search allergen, hidden ingredient, or sauce...' 
                    : 'Buscar alérgeno, salsa o ingrediente oculto...';
                searchInput.value = this.allergenSearchQuery || '';
            }
            if (clearBtn) {
                clearBtn.classList.toggle('hidden', !(this.currentAllergenTab === 'matrix' ? this.matrixSearchQuery : this.allergenSearchQuery));
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
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        if (searchInput) {
            if (tabName === 'matrix') {
                searchInput.placeholder = isEn 
                    ? 'Search dish in allergen matrix (e.g. Chicken, Chips, Pizza...)' 
                    : 'Buscar plato en la matriz (ej: Chicken, Chips, Pizza...)';
                searchInput.value = this.matrixSearchQuery || '';
            } else if (tabName === 'safe') {
                searchInput.placeholder = isEn 
                    ? 'Search allergen or dish...' 
                    : 'Buscar alérgeno o plato...';
                searchInput.value = '';
            } else {
                searchInput.placeholder = isEn 
                    ? 'Search allergen, hidden ingredient, or sauce...' 
                    : 'Buscar alérgeno, salsa o ingrediente oculto...';
                searchInput.value = this.allergenSearchQuery || '';
            }
            if (clearBtn) {
                clearBtn.classList.toggle('hidden', !searchInput.value);
            }
        }
        this.renderAllergensView();
    }

    renderAllergensView() {
        const container = document.getElementById('allergensView');
        if (!container) return;

        if (!this.currentAllergenTab) this.currentAllergenTab = 'safe';
        if (!this.selectedSafeExclusions) this.selectedSafeExclusions = new Set();
        if (this.allergenSearchQuery === undefined) this.allergenSearchQuery = '';

        const allergens = window.restaurantMenu ? window.restaurantMenu.getAllergens() : [];
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const t = (key, fallback) => (window.i18n && window.i18n.t ? window.i18n.t(key) : fallback) || fallback;

        container.innerHTML = `
            <div class="allergens-module">
                <!-- Hero Header Material 3 Expressive -->
                <div class="allergens-hero-m3">
                    <span class="m3-uk-fsa-badge hero-corner-badge">
                        <span class="material-symbols-outlined" style="font-size: 15px;">verified_user</span>
                        <span>${isEn ? 'Food Safety' : 'Seguridad Alimentaria'}</span>
                    </span>
                    <div class="allergens-hero-top-row">
                        <div class="allergens-hero-icon">
                            <span class="material-symbols-outlined">health_and_safety</span>
                        </div>
                        <div class="allergens-hero-heading-block">
                            <h2>${isEn ? 'Food Allergens & Cross-Contamination' : 'Alergias y Contaminación Cruzada'}</h2>
                            <p class="allergens-hero-desc">
                                ${isEn 
                                    ? 'Official allergen registry, hidden ingredients, and cross-contamination prevention adapted to your kitchen and country regulations.' 
                                    : 'Registro de alérgenos, ingredientes de riesgo y prevención de contaminación cruzada adaptado a tu cocina y normativa local.'}
                            </p>
                        </div>
                    </div>
                    <div class="allergens-hero-bottom-row">
                        <div class="allergens-meta-chips allergens-hero-badges">
                            <span class="m3-badge-pill">
                                <span class="material-symbols-outlined" style="font-size: 14px;">check_circle</span>
                                ${allergens.length} ${isEn ? 'Registered Allergens' : 'Alérgenos Registrados'}
                            </span>
                            <span class="m3-badge-pill">
                                <span class="material-symbols-outlined" style="font-size: 14px;">kitchen</span>
                                ${isEn ? 'Hidden Ingredients' : 'Ingredientes Ocultos'}
                            </span>
                            <span class="m3-badge-pill">
                                <span class="material-symbols-outlined" style="font-size: 14px;">warning</span>
                                ${isEn ? 'Cross-Contact Risks' : 'Protocolos Contaminación'}
                            </span>
                            ${(window.restaurantMenu && window.restaurantMenu.hasMenu) ? `
                                <span class="m3-badge-pill" style="background: #ECFDF5; color: #065F46; font-weight: 700;">
                                    <span class="material-symbols-outlined" style="font-size: 14px; color: #059669;">storefront</span>
                                    ${window.restaurantMenu.restaurantName || "Mi Restaurante"}
                                </span>
                                ${window.restaurantMenu.isShared ? `
                                    <button type="button" class="m3-badge-pill" onclick="window.restaurantMenu.leaveSharedMenu()" style="cursor: pointer; background: #FFF1F2; color: #E11D48; font-weight: 700; border: 1px solid #FECDD3; display: inline-flex; align-items: center; gap: 4px;" title="${isEn ? 'Leave shared restaurant' : 'Dejar de seguir este restaurante'}">
                                        <span class="material-symbols-outlined" style="font-size: 14px; color: #E11D48;">logout</span>
                                        ${isEn ? 'Leave' : 'Dejar de seguir'}
                                    </button>
                                ` : ''}
                            ` : ''}
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
                            <span>${isEn ? 'Allergens Guide' : 'Guía de Alérgenos'}</span>
                        </span>
                    </button>
                    <button class="m3-nav-tab ${this.currentAllergenTab === 'matrix' ? 'active' : ''}" onclick="window.dashboard.setAllergenTab('matrix')">
                        <span class="material-symbols-outlined">table_chart</span>
                        <span class="tab-label-text">
                            <span>${isEn ? 'Allergen Matrix' : 'Matriz de Alérgenos'}</span>
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

        const allergens = window.restaurantMenu ? window.restaurantMenu.getAllergens() : [];
        const hasMenu = window.restaurantMenu && window.restaurantMenu.hasMenu;
        const isOwner = window.restaurantMenu && window.restaurantMenu.isOwner;

        if (allergens.length === 0) {
            tabMount.innerHTML = `
                <div class="allergens-empty-state" style="padding: 56px 20px; text-align: center; background: #FFFFFF; border-radius: 24px; border: 1.5px solid #E2E8F0; margin-top: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
                    <div style="width: 76px; height: 76px; margin: 0 auto 18px auto; border-radius: 50%; background: #ECFDF5; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(16,185,129,0.15);">
                        <span class="material-symbols-outlined" style="font-size: 40px; color: #059669;">health_and_safety</span>
                    </div>
                    <h3 style="font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 8px 0;">
                        ${isEn ? 'No Allergens Configured' : 'No hay alérgenos registrados'}
                    </h3>
                    <p style="color: #64748B; max-width: 520px; margin: 0 auto 24px auto; font-size: 14.5px; line-height: 1.6;">
                        ${isEn 
                            ? 'Allergen regulations and lists vary depending on the country or culinary style. Register your kitchen allergens from scratch with their hidden risks and cross-contamination protocols.' 
                            : 'Las normativas de alérgenos varían según el país o tipo de cocina. Registra desde cero los alérgenos aplicables a tu restaurante, sus ingredientes ocultos y protocolos de contaminación cruzada.'}
                    </p>
                    ${hasMenu ? `
                        <button type="button" class="btn-primary" onclick="window.restaurantMenu.openAllergenModal()" style="border-radius: 999px; padding: 0 26px; height: 46px; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);">
                            <span class="material-symbols-outlined" style="font-size: 20px;">add_circle</span>
                            <span>${isEn ? 'Add Kitchen Allergen' : 'Registrar Nuevo Alérgeno'}</span>
                        </button>
                    ` : `
                        <button type="button" class="btn-primary" onclick="window.restaurantMenu.openCreateMenuModal()" style="border-radius: 999px; padding: 0 26px; height: 46px; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);">
                            <span class="material-symbols-outlined" style="font-size: 20px;">storefront</span>
                            <span>${isEn ? 'Create Restaurant Menu First' : 'Crear Carta de Restaurante Primero'}</span>
                        </button>
                    `}
                </div>
            `;
            return;
        }

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
            const nameEs = (a.name_es || a.name || '').toLowerCase();
            const nameEn = (a.name_en || '').toLowerCase();
            const desc = isEn ? (a.desc_en || '').toLowerCase() : (a.desc_es || '').toLowerCase();
            const hides = getStr(isEn ? a.whereItHides_en : (a.whereItHides_es || a.whereItHides));
            const risks = getStr(isEn ? a.contaminationRisks_en : (a.contaminationRisks_es || a.contaminationRisks));
            const kws = (a.keywords || []).join(' ').toLowerCase();
            return nameEs.includes(q) || nameEn.includes(q) || desc.includes(q) || hides.includes(q) || risks.includes(q) || kws.includes(q);
        });

        tabMount.innerHTML = `
            <div class="guide-toolbar-m3" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap;">
                <div class="guide-stats-chip">
                    <span>${filtered.length} / ${allergens.length} ${isEn ? 'matching allergens' : 'alérgenos en tu cocina'}</span>
                </div>
                ${hasMenu ? `
                    <button type="button" class="btn-primary" onclick="window.restaurantMenu.openAllergenModal()" style="border-radius: 999px; height: 40px; padding: 0 20px; font-size: 13.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                        <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
                        <span>${isEn ? 'Add Allergen' : 'Añadir Alérgeno'}</span>
                    </button>
                ` : ''}
            </div>

            <div class="allergens-cards-grid">
                ${filtered.length === 0 ? `
                    <div class="allergens-empty-state">
                        <span class="material-symbols-outlined" style="font-size: 48px; color: var(--md-sys-color-outline);">search_off</span>
                        <p>${isEn ? 'No allergens or ingredients matched your search.' : 'No se encontraron alérgenos o ingredientes para esa búsqueda.'}</p>
                        <button class="btn-m3-tonal" onclick="window.dashboard.handleAllergenSearch('')">${isEn ? 'Clear search' : 'Limpiar búsqueda'}</button>
                    </div>
                ` : filtered.map(item => `
                    <div class="allergen-card-expressive" style="--allergen-accent: ${item.color || '#10B981'};">
                        <div class="allergen-card-header">
                            <div class="allergen-avatar" style="background: ${item.color || '#10B981'}18; color: ${item.color || '#10B981'};">
                                <span class="material-symbols-outlined">${item.icon || 'shield'}</span>
                            </div>
                            <div class="allergen-title-block" style="flex: 1;">
                                <h3>${item.name_es || item.name_en || item.name}</h3>
                                ${item.name_en && item.name_en !== (item.name_es || item.name) ? `
                                    <div class="allergen-official-name">
                                        <span>${item.name_en}</span>
                                    </div>
                                ` : ''}
                            </div>
                            ${isOwner ? `
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <button type="button" onclick="window.restaurantMenu.openAllergenModal('${item.id}')" title="Editar" style="background: none; border: none; cursor: pointer; color: #64748B; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: background 0.15s;" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='none'">
                                        <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                                    </button>
                                    <button type="button" onclick="window.restaurantMenu.confirmDeleteAllergen('${item.id}')" title="Eliminar" style="background: none; border: none; cursor: pointer; color: #EF4444; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: background 0.15s;" onmouseover="this.style.background='#FEE2E2'" onmouseout="this.style.background='none'">
                                        <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                                    </button>
                                </div>
                            ` : ''}
                        </div>

                        ${(item.desc_es || item.desc_en) ? `<p class="allergen-description">${isEn ? (item.desc_en || item.desc_es) : (item.desc_es || item.desc_en)}</p>` : ''}

                        <!-- Caja 1: Dónde se esconde (Ejemplos Reales) -->
                        <div class="allergen-hides-box">
                            <div class="box-title">
                                <span class="material-symbols-outlined">kitchen</span>
                                <span>${isEn ? 'Where it hides in daily cooking:' : '¿Dónde se esconde en la cocina diaria?'}</span>
                            </div>
                            <ul class="box-list">
                                ${toItems(isEn ? item.whereItHides_en : (item.whereItHides_es || item.whereItHides)).map(ex => `
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
                                ${toItems(isEn ? item.contaminationRisks_en : (item.contaminationRisks_es || item.contaminationRisks)).map(rk => `
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
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearch');
        if (searchInput && searchInput.value !== val) {
            searchInput.value = val;
        }
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', !val);
        }

        if (this.currentAllergenTab === 'matrix') {
            this.filterMatrixBySearch(val);
            return;
        }

        this.allergenSearchQuery = val;
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

    setMatrixSource(source) {
        this.matrixSource = source;
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const t = (key, fallback) => (window.i18n && window.i18n.t ? window.i18n.t(key) : fallback) || fallback;
        this.renderAllergenMatrixTab(isEn, t);
    }

    setMatrixSection(section) {
        this.matrixSelectedSection = section;
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const t = (key, fallback) => (window.i18n && window.i18n.t ? window.i18n.t(key) : fallback) || fallback;
        this.renderAllergenMatrixTab(isEn, t);
    }

    scrollMatrixChips(distance) {
        const container = document.getElementById('matrixCategoryChips');
        if (container) {
            container.scrollBy({ left: distance, behavior: 'smooth' });
        }
    }

    handleMatrixChipsWheel(e) {
        const container = document.getElementById('matrixCategoryChips');
        if (container && (e.deltaY !== 0 || e.deltaX !== 0)) {
            e.preventDefault();
            container.scrollLeft += (e.deltaY || e.deltaX);
        }
    }

    setupMatrixWhiteTooltips() {
        let tooltip = document.getElementById('m3WhiteMatrixTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'm3WhiteMatrixTooltip';
            tooltip.className = 'm3-white-matrix-tooltip hidden';
            document.body.appendChild(tooltip);
        }

        window._m3TooltipState = window._m3TooltipState || { currentTarget: null, lastTouchTime: 0 };

        const showTooltip = (el) => {
            const title = el.getAttribute('data-m3-tooltip-title') || '';
            const desc = el.getAttribute('data-m3-tooltip-desc') || '';
            const tag = el.getAttribute('data-m3-tooltip-tag') || '';
            const icon = el.getAttribute('data-m3-tooltip-icon') || '';
            const iconColor = el.getAttribute('data-m3-tooltip-color') || '#0F172A';

            if (!title && !desc) return;

            tooltip.innerHTML = `
                <div class="m3-wt-container">
                    <div class="m3-wt-top-row">
                        ${icon ? `<span class="material-symbols-outlined m3-wt-icon" style="color: ${iconColor};">${icon}</span>` : ''}
                        ${tag ? `<span class="m3-wt-tag" style="background: ${iconColor}16; color: ${iconColor}; border: 1px solid ${iconColor}33;">${tag}</span>` : ''}
                    </div>
                    <div class="m3-wt-title">${title}</div>
                    ${desc ? `<div class="m3-wt-desc">${desc}</div>` : ''}
                </div>
            `;

            tooltip.classList.remove('hidden');
            tooltip.classList.remove('arrow-top', 'arrow-bottom');

            const rect = el.getBoundingClientRect();
            const ttRect = tooltip.getBoundingClientRect();

            let left = rect.left + (rect.width / 2) - (ttRect.width / 2);
            left = Math.max(12, Math.min(window.innerWidth - ttRect.width - 12, left));

            let top = rect.top - ttRect.height - 9;
            let arrowClass = 'arrow-bottom';
            if (top < 10) {
                top = rect.bottom + 9;
                arrowClass = 'arrow-top';
            }

            const arrowLeft = Math.max(16, Math.min(ttRect.width - 16, (rect.left + rect.width / 2) - left));
            tooltip.style.setProperty('--arrow-left', `${arrowLeft}px`);
            tooltip.classList.add(arrowClass);
            tooltip.style.top = `${top}px`;
            tooltip.style.left = `${left}px`;
            window._m3TooltipState.currentTarget = el;
        };

        const hideTooltip = () => {
            if (tooltip) {
                tooltip.classList.add('hidden');
            }
            window._m3TooltipState.currentTarget = null;
        };

        if (document.body.dataset.m3TooltipBound !== 'true') {
            document.body.dataset.m3TooltipBound = 'true';

            // Track touch timestamps on mobile/touch screens
            document.addEventListener('touchstart', () => {
                window._m3TooltipState.lastTouchTime = Date.now();
            }, { passive: true });

            // Desktop hover
            document.addEventListener('mouseover', (e) => {
                // Disregard simulated mouseover right after a touch
                if (Date.now() - (window._m3TooltipState.lastTouchTime || 0) < 800) return;

                const target = e.target.closest('[data-m3-tooltip-title]');
                if (target) {
                    showTooltip(target);
                }
            });

            document.addEventListener('mouseout', (e) => {
                if (Date.now() - (window._m3TooltipState.lastTouchTime || 0) < 800) return;

                const target = e.target.closest('[data-m3-tooltip-title]');
                if (target) {
                    if (e.relatedTarget && target.contains(e.relatedTarget)) return;
                    hideTooltip();
                }
            });

            // Mobile & Click Toggle: Tap once to show, tap again to close, tap outside to close
            document.addEventListener('click', (e) => {
                const target = e.target.closest('[data-m3-tooltip-title]') || 
                              (e.target.classList && e.target.classList.contains('col-allergen-cell') ? e.target.querySelector('[data-m3-tooltip-title]') : null);

                if (target) {
                    const isVisible = tooltip && !tooltip.classList.contains('hidden');
                    if (isVisible && window._m3TooltipState.currentTarget === target) {
                        // Tapped the same element again -> close it
                        hideTooltip();
                    } else {
                        // Tapped on an element for the first time or switched element -> show it
                        showTooltip(target);
                    }
                } else {
                    // Tapped outside any tooltip item -> close if currently visible
                    if (tooltip && !tooltip.classList.contains('hidden')) {
                        hideTooltip();
                    }
                }
            });

            window.addEventListener('scroll', hideTooltip, { passive: true, capture: true });
        }
    }



    filterMatrixBySearch(query) {
        this.matrixSearchQuery = (query || '').trim().toLowerCase();
        const rows = document.querySelectorAll('.matrix-dish-row');
        const sectionHeaders = document.querySelectorAll('.matrix-section-row');
        
        if (!this.matrixSearchQuery) {
            rows.forEach(r => r.style.display = '');
            sectionHeaders.forEach(s => s.style.display = '');
            return;
        }

        const visibleSections = new Set();
        rows.forEach(r => {
            const name = (r.getAttribute('data-name') || '').toLowerCase();
            const raw = (r.getAttribute('data-raw') || '').toLowerCase();
            const sec = r.getAttribute('data-section') || '';
            if (name.includes(this.matrixSearchQuery) || raw.includes(this.matrixSearchQuery)) {
                r.style.display = '';
                visibleSections.add(sec);
            } else {
                r.style.display = 'none';
            }
        });

        sectionHeaders.forEach(s => {
            const sec = s.getAttribute('data-section') || '';
            if (visibleSections.has(sec)) {
                s.style.display = '';
            } else {
                s.style.display = 'none';
            }
        });
    }

    renderAllergenMatrixTab(isEn, t) {
        const tabMount = document.getElementById('allergenTabContent');
        if (!tabMount) return;

        if (!window.restaurantMenu || !window.restaurantMenu.hasMenu) {
            tabMount.innerHTML = `
                <div class="allergens-empty-state" style="padding: 56px 20px; text-align: center; background: #FFFFFF; border-radius: 20px; border: 1.5px solid #E2E8F0; margin-top: 16px;">
                    <div style="width: 72px; height: 72px; margin: 0 auto 16px auto; border-radius: 50%; background: #EFF6FF; display: flex; align-items: center; justify-content: center;">
                        <span class="material-symbols-outlined" style="font-size: 38px; color: #2563EB;">table_chart</span>
                    </div>
                    <h3 style="font-size: 19px; font-weight: 800; color: #0F172A; margin: 0 0 8px 0;">
                        ${isEn ? 'No Active Restaurant Menu' : 'No tienes una carta de restaurante activa'}
                    </h3>
                    <p style="color: #64748B; max-width: 480px; margin: 0 auto 20px auto; font-size: 14px; line-height: 1.5;">
                        ${isEn 
                            ? 'To view the allergen matrix and cross-contact risks, you must have a restaurant menu active or shared with you.' 
                            : 'Para consultar la matriz de alérgenos y riesgos de contaminación cruzada necesitas tener una carta creada o compartida por tu equipo.'}
                    </p>
                    <button class="btn-primary" onclick="window.dashboard.switchView('menu')" style="border-radius: 999px; padding: 0 24px; height: 42px; font-weight: 700;">
                        ${isEn ? 'Go to Menu Management' : 'Ir a Gestión de Menú'}
                    </button>
                </div>
            `;
            return;
        }

        const allergens = window.restaurantMenu ? window.restaurantMenu.getAllergens() : [];
        if (allergens.length === 0) {
            tabMount.innerHTML = `
                <div class="allergens-empty-state" style="padding: 56px 20px; text-align: center; background: #FFFFFF; border-radius: 20px; border: 1.5px solid #E2E8F0; margin-top: 16px;">
                    <div style="width: 72px; height: 72px; margin: 0 auto 16px auto; border-radius: 50%; background: #ECFDF5; display: flex; align-items: center; justify-content: center;">
                        <span class="material-symbols-outlined" style="font-size: 38px; color: #059669;">table_chart</span>
                    </div>
                    <h3 style="font-size: 19px; font-weight: 800; color: #0F172A; margin: 0 0 8px 0;">
                        ${isEn ? 'No Allergens Configured' : 'Sin alérgenos configurados para la matriz'}
                    </h3>
                    <p style="color: #64748B; max-width: 480px; margin: 0 auto 20px auto; font-size: 14px; line-height: 1.5;">
                        ${isEn 
                            ? 'To view the cross-contamination and allergen matrix, first add the allergens for your kitchen in the "Allergens Guide" tab.' 
                            : 'Para consultar la matriz de platos y alérgenos de tu cocina, primero registra tus alérgenos en la pestaña "Guía de Alérgenos".'}
                    </p>
                    <button class="btn-primary" onclick="window.dashboard.setAllergenTab('guide')" style="border-radius: 999px; padding: 0 24px; height: 42px; font-weight: 700;">
                        ${isEn ? 'Go to Allergens Guide' : 'Ir a Guía de Alérgenos'}
                    </button>
                </div>
            `;
            return;
        }

        const dishes = window.restaurantMenu.getOfficialAllergens();

        if (!this.matrixSelectedSection) {
            this.matrixSelectedSection = 'ALL';
        }

        const sectionsList = [
            { id: 'ALL', name: isEn ? 'All Sections' : 'Todas las secciones', count: dishes.length },
            { id: 'FINGER FOOD', name: 'Finger Food', count: dishes.filter(d => d.section === 'FINGER FOOD').length },
            { id: 'MAINS', name: 'Mains & Steaks', count: dishes.filter(d => d.section === 'MAINS').length },
            { id: 'FLAT BREADS', name: 'Flat Breads', count: dishes.filter(d => d.section === 'FLAT BREADS').length },
            { id: 'SOS PIZZA', name: 'SOS Pizza & Dips', count: dishes.filter(d => d.section === 'SOS PIZZA').length },
            { id: 'SIDES', name: 'Sides & Salads', count: dishes.filter(d => d.section === 'SIDES').length },
            { id: 'KIDS MENU', name: 'Kids Menu', count: dishes.filter(d => d.section === 'KIDS MENU').length },
            { id: 'SUNDAY ROAST', name: 'Sunday Roast', count: dishes.filter(d => d.section === 'SUNDAY ROAST').length },
            { id: 'DESSERTS', name: 'Desserts & Gelato', count: dishes.filter(d => d.section === 'DESSERTS').length }
        ];

        // Filter by section if not ALL
        let filteredDishes = dishes;
        if (this.matrixSelectedSection !== 'ALL') {
            filteredDishes = dishes.filter(d => d.section === this.matrixSelectedSection);
        }

        tabMount.innerHTML = `
            <!-- Legend Banner -->
            <div class="matrix-legend-banner">
                <div class="matrix-legend-items">
                    <div class="matrix-legend-item"
                        data-m3-tooltip-title="${isEn ? 'Direct Ingredient' : 'Ingrediente Directo'}"
                        data-m3-tooltip-icon="close"
                        data-m3-tooltip-color="#EF4444"
                        data-m3-tooltip-tag="X"
                        data-m3-tooltip-desc="${isEn ? 'The allergen is an intentional recipe ingredient.' : 'El alérgeno está presente directamente en los ingredientes de la receta.'}">
                        <span class="matrix-badge-x">X</span>
                        <span>${isEn ? 'Contains allergen (Direct ingredient)' : 'Contiene el alérgeno (Ingrediente directo)'}</span>
                    </div>
                    <div class="matrix-legend-item"
                        data-m3-tooltip-title="${isEn ? 'Cross-Contamination Risk' : 'Riesgo de Contaminación Cruzada'}"
                        data-m3-tooltip-icon="warning"
                        data-m3-tooltip-color="#D97706"
                        data-m3-tooltip-tag="O"
                        data-m3-tooltip-desc="${isEn ? 'Risk of traces due to shared fryers, grills or prep utensils.' : 'Riesgo de trazas por freidoras compartidas, plancha o utensilios de cocina.'}">
                        <span class="matrix-badge-o">O</span>
                        <span>${isEn ? 'Cross-contamination risk (Shared fryers/equipment)' : 'Riesgo de contaminación cruzada (Freidoras/utensilios compartidos)'}</span>
                    </div>
                    <div class="matrix-legend-item"
                        data-m3-tooltip-title="${isEn ? 'Free from Allergen' : 'Libre del Alérgeno'}"
                        data-m3-tooltip-icon="check_circle"
                        data-m3-tooltip-color="#10B981"
                        data-m3-tooltip-tag="-"
                        data-m3-tooltip-desc="${isEn ? 'Safe recipe with no declared presence or cross-contact.' : 'Receta segura sin presencia directa ni riesgos reportados.'}">
                        <span class="matrix-badge-dash" style="font-size: 20px; line-height: 1;">-</span>
                        <span>${isEn ? 'Safe / Free from allergen' : 'Libre del alérgeno'}</span>
                    </div>
                </div>
            </div>

            <!-- Horizontal Scrollable Section Chips Carousel -->
            <div class="menu-category-carousel-wrapper" style="margin-bottom: 16px;">
                <button type="button" class="menu-carousel-arrow left" onclick="window.dashboard.scrollMatrixChips(-260)" title="${isEn ? 'Previous sections' : 'Secciones anteriores'}">
                    <span class="material-symbols-outlined">chevron_left</span>
                </button>
                <div class="menu-category-chips" id="matrixCategoryChips" onwheel="window.dashboard.handleMatrixChipsWheel(event)">
                    ${sectionsList.map(s => `
                        <button 
                            class="menu-category-chip ${this.matrixSelectedSection === s.id ? 'active' : ''}"
                            onclick="window.dashboard.setMatrixSection('${s.id}')"
                            type="button"
                        >
                            <span>${s.name}</span>
                            <span class="chip-count">${s.count}</span>
                        </button>
                    `).join('')}
                </div>
                <button type="button" class="menu-carousel-arrow right" onclick="window.dashboard.scrollMatrixChips(260)" title="${isEn ? 'Next sections' : 'Siguientes secciones'}">
                    <span class="material-symbols-outlined">chevron_right</span>
                </button>
            </div>

            <!-- Table Card with Full Width on PC -->
            <div class="matrix-card-container">
                <div class="matrix-table-wrapper" id="officialMatrixTableWrapper">
                    <table class="fsa-matrix-table" id="officialFsaMatrixTable">
                        <thead>
                            <tr class="matrix-header-allergens-row">
                                <th class="col-recipe-name">${isEn ? 'Dish / Kitchen Preparation' : 'Plato / Preparación de Cocina'}</th>
                                ${allergens.map(a => `
                                    <th class="col-allergen"
                                        data-m3-tooltip-title="${a.name_es || a.name_en || a.name}"
                                        data-m3-tooltip-icon="${a.icon || 'shield'}"
                                        data-m3-tooltip-color="${a.color || '#10B981'}"
                                        data-m3-tooltip-tag="${isEn ? 'Allergen' : 'Alérgeno'}"
                                        data-m3-tooltip-desc="${isEn ? 'Registered kitchen allergen.' : 'Alérgeno registrado de tu cocina.'}">
                                        <div class="th-allergen-inner" style="color: ${a.color || '#10B981'};">
                                            <span class="material-symbols-outlined" style="font-size: 18px;">${a.icon || 'shield'}</span>
                                            <span class="th-name">${a.name_es || a.name_en || a.name}</span>
                                        </div>
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredDishes.length === 0 ? `
                                <tr>
                                    <td colspan="${allergens.length + 1}" style="text-align:center; padding: 36px; color: #64748B;">
                                        <span class="material-symbols-outlined" style="font-size: 36px; color: #94A3B8; display: block; margin-bottom: 8px;">search_off</span>
                                        ${isEn ? 'No dishes found matching this criteria.' : 'No se encontraron platos con los filtros seleccionados.'}
                                    </td>
                                </tr>
                            ` : this.renderMatrixTableRows(filteredDishes, allergens, isEn)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.setupMatrixWhiteTooltips();
    }

    renderMatrixTableRows(dishes, allergens, isEn) {
        let currentSection = null;
        const rowsHtml = [];

        dishes.forEach(item => {
            // Render section header if in ALL mode
            if (this.matrixSelectedSection === 'ALL' && item.section && item.section !== currentSection) {
                currentSection = item.section;
                const count = dishes.filter(d => d.section === currentSection).length;
                rowsHtml.push(`
                    <tr class="matrix-section-row" data-section="${currentSection}">
                        <td colspan="${allergens.length + 1}">
                            <div class="matrix-section-title-sticky">
                                <span>${currentSection}</span>
                                <span class="matrix-section-pill-tag">${count} ${isEn ? 'dishes' : 'platos'}</span>
                            </div>
                        </td>
                    </tr>
                `);
            }

            const directAllergens = item.allergens || (window.detectRecipeAllergens ? window.detectRecipeAllergens(item) : []);
            const directSet = new Set(directAllergens.map(d => (typeof d === 'object' ? d.id : d)));
            const crossAllergens = item.crossContamination || (window.detectRecipeCrossContamination ? window.detectRecipeCrossContamination(item) : []);
            const crossSet = new Set(crossAllergens.map(c => (typeof c === 'object' ? c.id : c)));

            // Primary dish name always in English as requested for official kitchen matrix
            const displayName = item.name_en || item.name || item.rawName || item.name_es;
            const subName = (item.name_es && item.name_es !== displayName) ? item.name_es : '';

            rowsHtml.push(`
                <tr class="matrix-dish-row" data-name="${(displayName + ' ' + (subName || '')).toLowerCase()}" data-raw="${(item.rawName || '').toLowerCase()}" data-section="${item.section || ''}">
                    <td class="col-recipe-name-cell" onclick="window.dashboard.openRecipeDetails('${item.id}')">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <strong style="color: #0F172A; font-size: 13.5px;">${displayName}</strong>
                            ${subName ? `<span style="font-size: 11px; color: #64748B; font-weight: normal;">${subName}</span>` : ''}
                            ${item.rawName ? `<span style="font-size: 10px; color: #94A3B8; font-family: monospace;">[${item.rawName}]</span>` : ''}
                        </div>
                    </td>
                    ${allergens.map(a => {
                        const hasX = directSet.has(a.id);
                        const hasO = crossSet.has(a.id);

                        if (hasX) {
                            return `
                                <td class="col-allergen-cell has-x">
                                    <span class="matrix-badge-x"
                                        data-m3-tooltip-title="${isEn ? `${a.name_en} (${a.name_es})` : `${a.name_es} (${a.name_en})`}"
                                        data-m3-tooltip-icon="close"
                                        data-m3-tooltip-color="#EF4444"
                                        data-m3-tooltip-tag="${isEn ? 'Direct Ingredient' : 'Ingrediente Directo'}"
                                        data-m3-tooltip-desc="${isEn ? `Direct ingredient in recipe for ${displayName}.` : `Ingrediente directo en la preparación de ${displayName}.`}">X</span>
                                </td>
                            `;
                        } else if (hasO) {
                            return `
                                <td class="col-allergen-cell has-o">
                                    <span class="matrix-badge-o"
                                        data-m3-tooltip-title="${isEn ? `${a.name_en} (${a.name_es})` : `${a.name_es} (${a.name_en})`}"
                                        data-m3-tooltip-icon="warning"
                                        data-m3-tooltip-color="#D97706"
                                        data-m3-tooltip-tag="${isEn ? 'Cross-Contamination' : 'Contacto Cruzado'}"
                                        data-m3-tooltip-desc="${isEn ? `Risk of traces in ${displayName} from fryers or utensils.` : `Riesgo de trazas en ${displayName} por freidoras compartidas o utensilios.`}">O</span>
                                </td>
                            `;
                        } else {
                            return `
                                <td class="col-allergen-cell">
                                    <span class="matrix-badge-dash"
                                        data-m3-tooltip-title="${isEn ? `${a.name_en} (${a.name_es})` : `${a.name_es} (${a.name_en})`}"
                                        data-m3-tooltip-icon="check_circle"
                                        data-m3-tooltip-color="#10B981"
                                        data-m3-tooltip-tag="${isEn ? 'Allergen Free' : 'Sin Alérgeno'}"
                                        data-m3-tooltip-desc="${isEn ? `Safe: No ${a.name_en} declared in ${displayName}.` : `Seguro: Sin ${a.name_es} declarado en ${displayName}.`}">-</span>
                                </td>
                            `;
                        }
                    }).join('')}
                </tr>
            `);
        });

        return rowsHtml.join('');
    }

    openRecipeDetails(recipeId) {
        if (!recipeId) return;

        // Check Stanley's official dishes
        const officialDishes = window.STANLEYS_OFFICIAL_ALLERGENS || [];
        const officialDish = officialDishes.find(d => d.id === recipeId);
        if (officialDish) {
            this.showOfficialDishModal(officialDish);
            return;
        }

        // Demo recipes fallback
        if (typeof recipeId === 'string' && recipeId.startsWith('demo-')) {
            const demoList = window.DEMO_UK_RECIPES || [];
            const dish = demoList.find(d => d.id === recipeId);
            if (dish) {
                this.showOfficialDishModal(dish);
                return;
            }
        }

        if (this.handleRecipeClick) {
            this.handleRecipeClick(recipeId);
        }
    }

    showOfficialDishModal(dish) {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const allergens = window.restaurantMenu ? window.restaurantMenu.getAllergens() : [];

        const directAllergens = dish.allergens || (window.detectRecipeAllergens ? window.detectRecipeAllergens(dish) : []);
        const directSet = new Set(directAllergens.map(d => (typeof d === 'object' ? d.id : d)));

        const crossAllergens = dish.crossContamination || (window.detectRecipeCrossContamination ? window.detectRecipeCrossContamination(dish) : []);
        const crossSet = new Set(crossAllergens.map(c => (typeof c === 'object' ? c.id : c)));

        const safeAllergens = allergens.filter(a => !directSet.has(a.id) && !crossSet.has(a.id));

        const existing = document.getElementById('demoRecipeModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'demoRecipeModal';
        modal.className = 'demo-recipe-modal-backdrop';
        modal.innerHTML = `
            <div class="demo-recipe-modal-card" style="max-width: 680px;">
                <div class="demo-modal-header" style="border-bottom: 1.5px solid #E2E8F0;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 44px; height: 44px; border-radius: 12px; background: #0F172A; color: #FFF; display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-outlined" style="font-size: 24px;">restaurant</span>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 19px; font-weight: 800; color: #0F172A;">
                                ${dish.name_en || dish.name || dish.name_es}
                            </h3>
                            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                                ${dish.name_es ? `<span style="font-size: 13px; color: #64748B;">${dish.name_es}</span>` : ''}
                                ${dish.section ? `<span class="matrix-section-pill-tag" style="background:#0F172A; color:#FFF;">${dish.section}</span>` : ''}
                                ${dish.rawName ? `<span style="font-size:11px; color:#94A3B8; font-family:monospace;">[${dish.rawName}]</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <button class="btn-close-modal-m3" onclick="document.getElementById('demoRecipeModal').remove()">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div class="demo-modal-body" style="padding: 20px; display:flex; flex-direction:column; gap:16px;">
                    <!-- Cross Contamination Warning if applicable -->
                    ${crossSet.size > 0 ? `
                        <div style="background: #FFFBEB; border: 1.5px solid #FDE68A; border-radius: 14px; padding: 12px 16px; display:flex; align-items:flex-start; gap:12px;">
                            <span class="material-symbols-outlined" style="color: #D97706; font-size: 22px; flex-shrink: 0; margin-top: 2px;">warning</span>
                            <div style="font-size: 13px; color: #92400E; line-height: 1.5;">
                                <strong>${isEn ? 'Kitchen Cross-Contamination Alert (O):' : 'Aviso de Contaminación Cruzada (O):'}</strong>
                                <div>${isEn 
                                    ? 'This dish is cooked or prepared using shared equipment (e.g. shared deep fat fryers, grill or preparation surfaces) with other allergen-containing items.'
                                    : 'Este plato se elabora o fríe en equipos compartidos (ej: freidoras compartidas, plancha o tablas de corte) donde se procesan otros alimentos con alérgenos.'}</div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 1. Direct Allergens (X) -->
                    <div>
                        <h4 style="font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #DC2626; margin: 0 0 8px 0; display:flex; align-items:center; gap:6px;">
                            <span class="matrix-badge-x" style="width:20px; height:20px; font-size:11px;">X</span>
                            <span>${isEn ? `Direct Allergens (${directSet.size})` : `Alérgenos Directos (${directSet.size})`}</span>
                        </h4>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            ${directSet.size === 0 ? `
                                <span style="font-size:13px; color:#059669; font-weight:600;">${isEn ? 'None (No direct allergens in ingredients)' : 'Ninguno (Sin alérgenos directos en los ingredientes)'}</span>
                            ` : Array.from(directSet).map(id => {
                                const a = allergens.find(x => x.id === id);
                                if (!a) return `<span class="matrix-badge-x" style="padding:4px 8px; width:auto; height:auto;">${id}</span>`;
                                const displayName = a.name_es || a.name_en || a.name || id;
                                return `
                                    <div style="display:inline-flex; align-items:center; gap:6px; background:#FEE2E2; border:1px solid #FECACA; color:#B91C1C; padding:6px 12px; border-radius:999px; font-size:12.5px; font-weight:700;">
                                        <span class="material-symbols-outlined" style="font-size:16px;">${a.icon || 'shield'}</span>
                                        <span>${displayName}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- 2. Cross Contamination (O) -->
                    <div>
                        <h4 style="font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #D97706; margin: 0 0 8px 0; display:flex; align-items:center; gap:6px;">
                            <span class="matrix-badge-o" style="width:20px; height:20px; font-size:11px;">O</span>
                            <span>${isEn ? `Cross-Contamination Risks (${crossSet.size})` : `Riesgos de Contaminación Cruzada (${crossSet.size})`}</span>
                        </h4>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            ${crossSet.size === 0 ? `
                                <span style="font-size:13px; color:#64748B;">${isEn ? 'None reported in kitchen protocol' : 'Sin riesgo reportado en protocolo de cocina'}</span>
                            ` : Array.from(crossSet).map(id => {
                                const a = allergens.find(x => x.id === id);
                                if (!a) return `<span class="matrix-badge-o" style="padding:4px 8px; width:auto; height:auto;">${id}</span>`;
                                const displayName = a.name_es || a.name_en || a.name || id;
                                return `
                                    <div style="display:inline-flex; align-items:center; gap:6px; background:#FEF3C7; border:1px solid #FDE68A; color:#B45309; padding:6px 12px; border-radius:999px; font-size:12.5px; font-weight:700;">
                                        <span class="material-symbols-outlined" style="font-size:16px;">${a.icon || 'shield'}</span>
                                        <span>${displayName}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- 3. Safe Allergens Checklist -->
                    <div>
                        <h4 style="font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #059669; margin: 0 0 8px 0; display:flex; align-items:center; gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:18px;">verified</span>
                            <span>${isEn ? `Free From (${safeAllergens.length})` : `Libre de (${safeAllergens.length})`}</span>
                        </h4>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            ${safeAllergens.map(a => `
                                <span style="font-size:11.5px; color:#047857; background:#ECFDF5; border:1px solid #A7F3D0; padding:3px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                                    <span class="material-symbols-outlined" style="font-size:13px;">check</span>
                                    <span>${isEn ? a.name_en : a.name_es}</span>
                                </span>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="demo-modal-footer" style="border-top: 1.5px solid #E2E8F0; padding: 14px 20px;">
                    <button class="btn-m3-tonal" onclick="document.getElementById('demoRecipeModal').remove()">
                        ${isEn ? 'Close' : 'Cerrar'}
                    </button>
                    <button class="btn-m3-filled" onclick="window.print()">
                        <span class="material-symbols-outlined">print</span>
                        <span>${isEn ? 'Print Technical Sheet' : 'Imprimir Ficha'}</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    toggleSafeAllergenExclusion(allergenId, event) {
        if (event) {
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (typeof event.preventDefault === 'function') event.preventDefault();
        }
        if (!this.selectedSafeExclusions) {
            this.selectedSafeExclusions = new Set();
        }
        if (this.selectedSafeExclusions.has(allergenId)) {
            this.selectedSafeExclusions.delete(allergenId);
        } else {
            this.selectedSafeExclusions.add(allergenId);
        }
        this.renderAllergensView();
    }

    clearSafeExclusions() {
        if (this.selectedSafeExclusions) {
            this.selectedSafeExclusions.clear();
        }
        this.renderAllergensView();
    }

    toggleSafeAllergenDropdown(event) {
        if (event) {
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (typeof event.preventDefault === 'function') event.preventDefault();
        }
        this.safeFilterDropdownOpen = !this.safeFilterDropdownOpen;
        const dropdown = document.getElementById('safeAllergenDropdown');
        const arrow = document.querySelector('.m3-split-btn-arrow .arrow-icon');
        if (dropdown) {
            dropdown.classList.toggle('hidden', !this.safeFilterDropdownOpen);
        }
        if (arrow) {
            arrow.classList.toggle('open', this.safeFilterDropdownOpen);
        }
    }

    toggleExcludedRecipesDropdown(event) {
        if (event) {
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (typeof event.preventDefault === 'function') event.preventDefault();
        }
        this.excludedRecipesDropdownOpen = !this.excludedRecipesDropdownOpen;
        const dropdown = document.getElementById('excludedRecipesDropdown');
        if (dropdown) {
            dropdown.classList.toggle('hidden', !this.excludedRecipesDropdownOpen);
        }
    }

    renderAllergenSafeTab(isEn, t) {
        const tabMount = document.getElementById('allergenTabContent');
        if (!tabMount) return;

        if (!window.restaurantMenu || !window.restaurantMenu.hasMenu) {
            tabMount.innerHTML = `
                <div class="allergens-empty-state" style="padding: 56px 20px; text-align: center; background: #FFFFFF; border-radius: 20px; border: 1.5px solid #E2E8F0; margin-top: 16px;">
                    <div style="width: 72px; height: 72px; margin: 0 auto 16px auto; border-radius: 50%; background: #EFF6FF; display: flex; align-items: center; justify-content: center;">
                        <span class="material-symbols-outlined" style="font-size: 38px; color: #2563EB;">shield_with_heart</span>
                    </div>
                    <h3 style="font-size: 19px; font-weight: 800; color: #0F172A; margin: 0 0 8px 0;">
                        ${isEn ? 'No Restaurant Dishes for Safe Diner' : 'Comensal Seguro sin carta activa'}
                    </h3>
                    <p style="color: #64748B; max-width: 480px; margin: 0 auto 20px auto; font-size: 14px; line-height: 1.5;">
                        ${isEn 
                            ? 'Create or link your restaurant menu to filter safe dishes according to multi-allergen exclusions.' 
                            : 'Crea tu menú o vincula la carta de tu restaurante para poder filtrar platos 100% seguros y avisos de contaminación para tus clientes.'}
                    </p>
                    <button class="btn-primary" onclick="window.dashboard.switchView('menu')" style="border-radius: 999px; padding: 0 24px; height: 42px; font-weight: 700;">
                        ${isEn ? 'Go to Menu Management' : 'Ir a Gestión de Menú'}
                    </button>
                </div>
            `;
            return;
        }

        const allergens = window.restaurantMenu ? window.restaurantMenu.getAllergens() : [];
        if (allergens.length === 0) {
            tabMount.innerHTML = `
                <div class="allergens-empty-state" style="padding: 56px 20px; text-align: center; background: #FFFFFF; border-radius: 20px; border: 1.5px solid #E2E8F0; margin-top: 16px;">
                    <div style="width: 72px; height: 72px; margin: 0 auto 16px auto; border-radius: 50%; background: #ECFDF5; display: flex; align-items: center; justify-content: center;">
                        <span class="material-symbols-outlined" style="font-size: 38px; color: #059669;">shield_with_heart</span>
                    </div>
                    <h3 style="font-size: 19px; font-weight: 800; color: #0F172A; margin: 0 0 8px 0;">
                        ${isEn ? 'No Allergens Configured' : 'Sin alérgenos para filtrar'}
                    </h3>
                    <p style="color: #64748B; max-width: 480px; margin: 0 auto 20px auto; font-size: 14px; line-height: 1.5;">
                        ${isEn 
                            ? 'Configure your kitchen allergens in the "Allergens Guide" tab to filter safe dishes for diners with intolerances.' 
                            : 'Configura los alérgenos de tu restaurante en la pestaña "Guía de Alérgenos" para filtrar platos seguros para tus comensales.'}
                    </p>
                    <button class="btn-primary" onclick="window.dashboard.setAllergenTab('guide')" style="border-radius: 999px; padding: 0 24px; height: 42px; font-weight: 700;">
                        ${isEn ? 'Go to Allergens Guide' : 'Ir a Guía de Alérgenos'}
                    </button>
                </div>
            `;
            return;
        }

        const dietaryProfiles = window.UK_DIETARY_PROFILES || [];
        const allRecipes = window.restaurantMenu.getOfficialAllergens();

        let safeRecipes = [];
        let warningRecipes = [];
        let excludedRecipes = [];

        if (this.selectedSafeExclusions && this.selectedSafeExclusions.size > 0) {
            allRecipes.forEach(recipe => {
                const direct = recipe.allergens || (window.detectRecipeAllergens ? window.detectRecipeAllergens(recipe) : []);
                const directIds = direct.map(d => (typeof d === 'object' ? d.id : d));
                const cross = recipe.crossContamination || (window.detectRecipeCrossContamination ? window.detectRecipeCrossContamination(recipe) : []);
                const crossIds = cross.map(c => (typeof c === 'object' ? c.id : c));

                const offendingDirect = directIds.filter(id => this.selectedSafeExclusions.has(id));
                const offendingCross = crossIds.filter(id => this.selectedSafeExclusions.has(id));

                if (offendingDirect.length > 0) {
                    excludedRecipes.push({ recipe, directIds, crossIds, offendingDirect });
                } else if (offendingCross.length > 0) {
                    warningRecipes.push({ recipe, directIds, crossIds, offendingCross });
                } else {
                    safeRecipes.push({ recipe, directIds, crossIds });
                }
            });
        }

        tabMount.innerHTML = `
            <div class="safe-filter-panel">
                <div class="safe-filter-header">
                    <div class="safe-filter-title">
                        <div class="safe-title-icon">
                            <span class="material-symbols-outlined">shield_with_heart</span>
                        </div>
                        <div>
                            <h3>${isEn ? 'Filter Dishes by Diner Allergies (Multiple)' : 'Filtro por Alergias del Comensal (Alergias Múltiples)'}</h3>
                            <p>${isEn 
                                ? 'Select allergens to exclude. Dishes are segregated into 100% Safe, Cross-Contamination Warning, and Excluded.'
                                : 'Marca los alérgenos a excluir. Los platos se clasifican en 100% Seguros, Aviso de Contaminación Cruzada y Excluidos.'}</p>
                        </div>
                    </div>
                </div>

                <!-- Direct Allergen Pills Selector Grid (Desktop PC Only) -->
                <div class="safe-pc-pills-container desktop-only">
                    <div class="safe-pc-pills-header">
                        <div class="safe-pc-pills-title">
                            <span class="material-symbols-outlined" style="color: #059669;">shield</span>
                            <span>${isEn ? 'Kitchen Allergens (Click to exclude)' : 'Alérgenos Registrados (Haz clic para excluir)'}</span>
                        </div>
                        ${this.selectedSafeExclusions && this.selectedSafeExclusions.size > 0 ? `
                            <button class="filter-clear-link" onclick="window.dashboard.clearSafeExclusions()" type="button">
                                <span class="material-symbols-outlined">restart_alt</span>
                                <span>${isEn ? 'Clear filters' : 'Limpiar filtros'}</span>
                            </button>
                        ` : ''}
                    </div>
                    <div class="allergen-chips-selector">
                        ${allergens.map(a => {
                            const isSelected = this.selectedSafeExclusions && this.selectedSafeExclusions.has(a.id);
                            const displayName = a.name_es || a.name_en || a.name;
                            return `
                                <button 
                                    type="button"
                                    class="allergen-toggle-chip ${isSelected ? 'selected' : ''}" 
                                    onclick="window.dashboard.toggleSafeAllergenExclusion('${a.id}', event)"
                                    title="${isSelected ? (isEn ? `Remove exclusion for ${displayName}` : `Quitar exclusión de ${displayName}`) : (isEn ? `Exclude ${displayName}` : `Excluir ${displayName}`)}"
                                >
                                    <span class="material-symbols-outlined" style="color: ${isSelected ? '#DC2626' : (a.color || '#10B981')}; font-size: 20px;">
                                        ${isSelected ? 'check_circle' : (a.icon || 'shield')}
                                    </span>
                                    <span>${displayName}</span>
                                    ${isSelected ? `<span class="chip-action-cross"><span class="material-symbols-outlined" style="font-size: 16px;">close</span></span>` : ''}
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- Split Buttons Bar (Mobile Only) -->
                <div class="safe-split-buttons-bar mobile-only">
                    <!-- Filter Split Button -->
                    <div class="m3-split-button-wrapper" id="allergenFilterSplitWrapper">
                        <div class="m3-split-button filter-split-button ${this.selectedSafeExclusions && this.selectedSafeExclusions.size > 0 ? 'has-active-filter' : ''}">
                            <button class="m3-split-btn-main" onclick="window.dashboard.toggleSafeAllergenDropdown(event)" type="button">
                                <span class="material-symbols-outlined">${this.selectedSafeExclusions && this.selectedSafeExclusions.size > 0 ? 'filter_alt' : 'tune'}</span>
                                <span class="split-btn-title">${isEn ? 'Filter by Allergens' : 'Filtro de Alérgenos'}</span>
                                ${this.selectedSafeExclusions && this.selectedSafeExclusions.size > 0 ? `
                                    <span class="split-count-badge">${this.selectedSafeExclusions.size}</span>
                                ` : ''}
                            </button>
                            <button class="m3-split-btn-arrow" onclick="window.dashboard.toggleSafeAllergenDropdown(event)" type="button" aria-label="${isEn ? 'Open allergen list' : 'Abrir lista de alérgenos'}">
                                <span class="material-symbols-outlined arrow-icon ${this.safeFilterDropdownOpen ? 'open' : ''}">expand_more</span>
                            </button>
                        </div>

                        <!-- Dropdown Allergens -->
                        <div id="safeAllergenDropdown" class="m3-split-dropdown allergen-list-dropdown ${this.safeFilterDropdownOpen ? '' : 'hidden'}">
                            <div class="m3-split-dropdown-header">
                                <div class="filter-header-left">
                                    <span class="material-symbols-outlined" style="color: #059669; font-size: 18px;">shield</span>
                                    <span>${isEn ? 'Kitchen Allergens' : 'Alérgenos Registrados'}</span>
                                </div>
                                ${this.selectedSafeExclusions && this.selectedSafeExclusions.size > 0 ? `
                                    <button class="filter-clear-link" onclick="window.dashboard.clearSafeExclusions()">
                                        <span class="material-symbols-outlined">restart_alt</span>
                                        <span>${isEn ? 'Clear' : 'Limpiar'}</span>
                                    </button>
                                ` : ''}
                            </div>

                            <div class="allergen-vertical-list">
                                ${allergens.map(a => {
                                    const isSelected = this.selectedSafeExclusions && this.selectedSafeExclusions.has(a.id);
                                    const displayName = a.name_es || a.name_en || a.name;
                                    return `
                                        <div 
                                            class="allergen-list-item ${isSelected ? 'selected' : ''}" 
                                            onclick="window.dashboard.toggleSafeAllergenExclusion('${a.id}', event)"
                                            role="button"
                                            tabindex="0"
                                        >
                                            <div class="allergen-list-item-left">
                                                <div class="allergen-list-icon-wrap" style="background: ${isSelected ? '#FEE2E2' : (a.color || '#10B981') + '18'}; color: ${isSelected ? '#DC2626' : (a.color || '#10B981')};">
                                                    <span class="material-symbols-outlined">${a.icon || 'shield'}</span>
                                                </div>
                                                <span class="allergen-list-name">${displayName}</span>
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
                                    ${!this.selectedSafeExclusions || this.selectedSafeExclusions.size === 0 
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

                    <!-- Excluded Count Split Button -->
                    ${excludedRecipes.length > 0 ? `
                        <div class="m3-split-button-wrapper" id="excludedRecipesSplitWrapper">
                            <div class="m3-split-button danger-split-button">
                                <button class="m3-split-btn-main" onclick="window.dashboard.toggleExcludedRecipesDropdown(event)" type="button">
                                    <span class="material-symbols-outlined" style="color: #DC2626; font-size: 20px;">warning</span>
                                    <span class="split-btn-title">${isEn ? `${excludedRecipes.length} Excluded Dishes` : `${excludedRecipes.length} Platos Excluidos`}</span>
                                </button>
                                <button class="m3-split-btn-arrow" onclick="window.dashboard.toggleExcludedRecipesDropdown(event)" type="button">
                                    <span class="material-symbols-outlined arrow-icon ${this.excludedRecipesDropdownOpen ? 'open' : ''}">expand_more</span>
                                </button>
                            </div>

                            <div id="excludedRecipesDropdown" class="m3-split-dropdown excluded-recipes-dropdown ${this.excludedRecipesDropdownOpen ? '' : 'hidden'}">
                                <div class="m3-split-dropdown-header danger-header">
                                    <div class="filter-header-left">
                                        <span class="material-symbols-outlined" style="color: #DC2626; font-size: 18px;">crisis_alert</span>
                                        <span>${isEn ? `${excludedRecipes.length} Excluded Dishes (Direct Allergen)` : `${excludedRecipes.length} Platos Excluidos (Alérgeno Directo)`}</span>
                                    </div>
                                </div>
                                <div class="split-recipes-scroll-list">
                                    ${excludedRecipes.map(({ recipe, offendingDirect }) => {
                                        const offendingNames = offendingDirect.map(id => {
                                            const found = allergens.find(a => a.id === id);
                                            return found ? found.name_en : id;
                                        });

                                        return `
                                            <div class="split-recipe-item danger-item" onclick="window.dashboard.openRecipeDetails('${recipe.id}')">
                                                <div class="split-recipe-item-info">
                                                    <div class="split-recipe-item-title-row">
                                                        <span class="split-recipe-name">${recipe.name_en || recipe.name || recipe.name_es}</span>
                                                        <span class="split-danger-badge">${isEn ? 'Contains' : 'Contiene'}</span>
                                                    </div>
                                                    <div class="split-offending-tags">
                                                        <span class="offending-label">${isEn ? 'Allergen(s):' : 'Alérgenos:'}</span>
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

                <!-- Active Filter Pills -->
                ${this.selectedSafeExclusions && this.selectedSafeExclusions.size > 0 ? `
                    <div class="active-exclusions-pills-row">
                        <div class="active-exclusions-left">
                            <span class="active-exclusions-label">
                                <span class="material-symbols-outlined">do_not_disturb_on</span>
                                <span>${isEn ? 'Excluding dishes with:' : 'Excluyendo platos con:'}</span>
                            </span>
                            <div class="active-exclusions-pills-list">
                                ${Array.from(this.selectedSafeExclusions).map(id => {
                                    const a = allergens.find(x => x.id === id);
                                    const name = a ? `${a.name_en} (${a.name_es})` : id;
                                    return `
                                        <button class="active-exclusion-pill" onclick="window.dashboard.toggleSafeAllergenExclusion('${id}', event)" title="${isEn ? 'Remove from filter' : 'Quitar del filtro'}">
                                            <span>${name}</span>
                                            <span class="material-symbols-outlined pill-remove-icon">close</span>
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        <button class="btn-clear-exclusions-m3" onclick="window.dashboard.clearSafeExclusions()" type="button">
                            <span class="material-symbols-outlined">restart_alt</span>
                            <span>${isEn ? `Clear (${this.selectedSafeExclusions.size})` : `Limpiar (${this.selectedSafeExclusions.size})`}</span>
                        </button>
                    </div>

                    <!-- 1. Recetas 100% Seguras -->
                    <div class="safe-recipes-section">
                        <div class="safe-section-header">
                            <div class="safe-header-left">
                                <span class="material-symbols-outlined" style="color: #059669; font-size: 22px;">verified</span>
                                <span class="safe-header-count">${isEn ? `${safeRecipes.length} Safe Dishes (100% Free)` : `${safeRecipes.length} Platos 100% Seguros`}</span>
                            </div>
                            <span class="safe-header-sub">${isEn ? 'No direct allergens and no cross-contamination risk' : 'Libres de ingredientes directos y sin riesgo de contaminación cruzada'}</span>
                        </div>

                        <div class="safe-recipes-list">
                            ${safeRecipes.length === 0 ? `
                                <div class="allergens-empty-state">
                                    <span class="material-symbols-outlined" style="font-size: 44px; color: #94A3B8;">no_meals</span>
                                    <p>${isEn ? 'No dishes match this safe criteria.' : 'No se encontraron platos completamente libres de estos alérgenos.'}</p>
                                </div>
                            ` : safeRecipes.map(({ recipe, directIds, crossIds }) => {
                                const displayName = isEn ? (recipe.name_en || recipe.name || recipe.name_es) : (recipe.name_es || recipe.name_en || recipe.name);
                                const subName = isEn ? recipe.name_es : recipe.name_en;

                                return `
                                    <div class="safe-recipe-card" onclick="window.dashboard.openRecipeDetails('${recipe.id}')">
                                        <div class="safe-recipe-info">
                                            <div class="safe-recipe-header-row">
                                                <h4 class="safe-recipe-title">${displayName}</h4>
                                                <span class="safe-tag-badge">
                                                    <span class="material-symbols-outlined">verified</span>
                                                    <span>${isEn ? 'Safe' : 'Seguro'}</span>
                                                </span>
                                                ${recipe.section ? `<span class="matrix-section-pill-tag">${recipe.section}</span>` : ''}
                                            </div>
                                            ${subName ? `<p style="font-size:12px; color:#64748B; margin:2px 0 6px 0;">${subName}</p>` : ''}
                                            <div class="split-clean-tag">
                                                <span class="material-symbols-outlined" style="font-size: 13px;">eco</span>
                                                <span>${isEn ? 'Free from selected allergens' : 'Libre de los alérgenos excluidos'}</span>
                                            </div>
                                        </div>
                                        <div class="safe-recipe-action">
                                            <button class="btn-m3-tonal" type="button">
                                                <span class="material-symbols-outlined">arrow_forward</span>
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- 2. Platos con Riesgo de Contaminación Cruzada (O) -->
                    ${warningRecipes.length > 0 ? `
                        <div class="safe-recipes-section" style="margin-top: 24px;">
                            <div class="safe-section-header" style="border-bottom-color: #FDE68A;">
                                <div class="safe-header-left">
                                    <span class="material-symbols-outlined" style="color: #D97706; font-size: 22px;">warning</span>
                                    <span class="safe-header-count" style="color: #B45309;">${isEn ? `${warningRecipes.length} Dishes with Cross-Contamination Risk (O)` : `${warningRecipes.length} Platos con Riesgo de Contaminación Cruzada (O)`}</span>
                                </div>
                                <span class="safe-header-sub" style="color: #92400E;">${isEn ? 'Ingredients are free, but prepared in shared fryers/surfaces' : 'No contienen el ingrediente, pero se elaboran en freidoras o zonas compartidas'}</span>
                            </div>

                            <div class="safe-recipes-list">
                                ${warningRecipes.map(({ recipe, offendingCross }) => {
                                    const offendingNames = offendingCross.map(id => {
                                        const found = allergens.find(a => a.id === id);
                                        return found ? (isEn ? found.name_en : found.name_es) : id;
                                    });
                                    const displayName = isEn ? (recipe.name_en || recipe.name || recipe.name_es) : (recipe.name_es || recipe.name_en || recipe.name);

                                    return `
                                        <div class="safe-recipe-card" style="border-color: #FDE68A; background: #FFFDF5;" onclick="window.dashboard.openRecipeDetails('${recipe.id}')">
                                            <div class="safe-recipe-info">
                                                <div class="safe-recipe-header-row">
                                                    <h4 class="safe-recipe-title">${displayName}</h4>
                                                    <span class="split-danger-badge" style="background:#FEF3C7; color:#B45309; border:1px solid #FDE68A;">
                                                        <span class="material-symbols-outlined" style="font-size:14px;">warning</span>
                                                        <span>${isEn ? 'Cross-Risk (O)' : 'Riesgo Cruzado (O)'}</span>
                                                    </span>
                                                    ${recipe.section ? `<span class="matrix-section-pill-tag">${recipe.section}</span>` : ''}
                                                </div>
                                                <div style="font-size: 12px; color: #92400E; margin-top: 4px;">
                                                    <strong>${isEn ? 'Shared equipment with:' : 'Equipo compartido con:'}</strong> ${offendingNames.join(', ')}
                                                </div>
                                            </div>
                                            <div class="safe-recipe-action">
                                                <button class="btn-m3-tonal" type="button" style="color: #B45309;">
                                                    <span class="material-symbols-outlined">arrow_forward</span>
                                                </button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                ` : `
                    <div class="safe-banner-prompt">
                        <span class="material-symbols-outlined" style="color: #059669;">tune</span>
                        <span>${isEn 
                            ? 'Select allergens above to inspect dishes and find safe menu options.' 
                            : 'Selecciona los alérgenos arriba para clasificar los platos y encontrar opciones seguras.'}</span>
                    </div>
                `}
            </div>
        `;
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
window.dashboardManager = window.dashboard;
window.addEventListener('DOMContentLoaded', () => window.dashboard.init());

document.addEventListener('click', (e) => {
    if (!e.target.closest('#folderCardMenu') && !e.target.closest('.card-action-btn') && !e.target.closest('.row-folder-action-btn') && !e.target.closest('.mobile-action-btn') && !e.target.closest('.folder-more-btn')) {
        window.dashboard?.closeFolderCardMenu();
    }
});
