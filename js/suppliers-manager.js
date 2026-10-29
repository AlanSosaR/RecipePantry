/**
 * Recipe Pantry - Suppliers & Orders Manager (Material 3 Expressive)
 * Panel de Gestión de Proveedores, Catálogo de Productos y Calendario de Pedidos.
 * Autorizado exclusivamente para Super Administrador: alansosa225@gmail.com
 */

(function () {
    class SuppliersManager {
        constructor() {
            this.SUPER_ADMIN_EMAIL = 'alansosa225@gmail.com';
            this.suppliers = [];
            this.items = [];
            this.selectedSupplierId = null;
            this.activeFilter = 'all'; // 'all' | 'delivery_tomorrow' | 'open_today'
            this.searchQuery = '';
            this.orderCart = {}; // { [supplierId]: { [itemId]: number } }
            this.orderNotes = {}; // { [supplierId]: string }
            try {
                const savedChecked = sessionStorage.getItem('rp_consolidated_checked');
                this.consolidatedCheckedItems = savedChecked ? JSON.parse(savedChecked) : {};
            } catch (e) {
                this.consolidatedCheckedItems = {};
            }
            this.isLoading = false;
            this.initialized = false;
            this._hasSyncedOnce = false;
            this._reactiveAuthInitialized = false;
            this._globalSearchBound = false;

            this.DAYS = [
                { id: 'mon', label: 'Lunes', labelEn: 'Monday', short: 'L', jsDay: 1 },
                { id: 'tue', label: 'Martes', labelEn: 'Tuesday', short: 'M', jsDay: 2 },
                { id: 'wed', label: 'Miércoles', labelEn: 'Wednesday', short: 'X', jsDay: 3 },
                { id: 'thu', label: 'Jueves', labelEn: 'Thursday', short: 'J', jsDay: 4 },
                { id: 'fri', label: 'Viernes', labelEn: 'Friday', short: 'V', jsDay: 5 },
                { id: 'sat', label: 'Sábado', labelEn: 'Saturday', short: 'S', jsDay: 6 },
                { id: 'sun', label: 'Domingo', labelEn: 'Sunday', short: 'D', jsDay: 0 }
            ];

            this.CATEGORIES = [
                { id: 'verduras', label: 'Frutas y Verduras', labelEn: 'Fruits & Veg', icon: 'nutrition', color: 'var(--primary-dark)', bg: 'var(--primary-light)' },
                { id: 'carnes', label: 'Carnes y Aves', labelEn: 'Meat & Poultry', icon: 'kebab_dining', color: 'var(--error)', bg: 'var(--surface)' },
                { id: 'pescados', label: 'Pescados y Mariscos', labelEn: 'Fish & Seafood', icon: 'set_meal', color: 'var(--primary)', bg: 'var(--surface)' },
                { id: 'lacteos', label: 'Lácteos y Huevos', labelEn: 'Dairy & Eggs', icon: 'egg', color: 'var(--warning)', bg: 'var(--surface)' },
                { id: 'panaderia', label: 'Panadería y Harinas', labelEn: 'Bakery & Flour', icon: 'bakery_dining', color: 'var(--warning)', bg: 'var(--surface)' },
                { id: 'secos', label: 'Secos y Abarrotes', labelEn: 'Dry & Pantry', icon: 'grain', color: 'var(--text-main)', bg: 'var(--surface)' },
                { id: 'bebidas', label: 'Bebidas y Licores', labelEn: 'Drinks & Spirits', icon: 'local_bar', color: 'var(--primary-dark)', bg: 'var(--surface)' },
                { id: 'limpieza', label: 'Limpieza y Desechables', labelEn: 'Cleaning & Supplies', icon: 'cleaning_services', color: 'var(--primary)', bg: 'var(--surface)' },
                { id: 'otros', label: 'Otros Insumos', labelEn: 'Other Supplies', icon: 'inventory_2', color: 'var(--text-secondary)', bg: 'var(--surface)' }
            ];
            this.currentSubView = 'list'; // 'list' | 'supplier-detail' | 'supplier-form' | 'item-form' | 'order-form'
            this.selectedSupplierDetailId = null;
            this.categoryFilter = 'all';
            this.editingSupplierId = null;
            this.editingItemId = null;
            this.preselectedSupplierId = null;
            this.activeOrderSupplierId = null;
            this.container = null;
            this._pendingImageBlob = null;
            this._pendingImageName = null;
            this._pendingSupplierImageBlob = null;
            this._pendingSupplierImageName = null;

            // Restaurar estado de URL al inicializar (soporte para F5 dentro de un proveedor, pedido o consolidado)
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const supplierParam = urlParams.get('supplier');
                const orderParam = urlParams.get('order');
                const subviewParam = urlParams.get('subview');
                if (subviewParam === 'consolidated' || orderParam === 'consolidated') {
                    this.currentSubView = 'order-consolidated';
                } else if (orderParam) {
                    this.activeOrderSupplierId = orderParam;
                    this.currentSubView = 'order-form';
                } else if (supplierParam) {
                    this.selectedSupplierDetailId = supplierParam;
                    this.currentSubView = 'supplier-detail';
                }
            } catch (e) { /* ignore */ }

            this.loadCache();
            this.initReactiveAuth();
            this.initGlobalSearch();

            this._lastMenuClosedSupplierId = null;
            this._lastMenuClosedTime = 0;
        }

        /** Determina si el idioma activo es inglés */
        isEnglish() {
            return Boolean(window.i18n && window.i18n.getLang && window.i18n.getLang() === 'en');
        }

        /** Obtiene objeto descriptivo de categoría con colores e iconos */
        getCategoryObj(catId) {
            const isEn = this.isEnglish();
            const found = this.CATEGORIES.find(c => c.id === (catId || '').toLowerCase());
            if (found) {
                return {
                    ...found,
                    displayLabel: isEn ? (found.labelEn || found.label) : found.label
                };
            }
            return {
                id: 'otros',
                label: 'Otros Insumos',
                labelEn: 'Other Supplies',
                displayLabel: isEn ? 'Other Supplies' : 'Otros Insumos',
                icon: 'inventory_2',
                color: 'var(--text-secondary)',
                bg: 'var(--surface)'
            };
        }

        /** Verifica si el usuario actual es el Super Administrador */
        isSuperAdmin() {
            const authEmail = (
                window.authManager?.currentUser?.email ||
                window.authManager?.session?.user?.email ||
                (JSON.parse(localStorage.getItem('recipe_pantry_user_profile') || '{}').email) ||
                ''
            ).toLowerCase().trim();
            return authEmail === this.SUPER_ADMIN_EMAIL;
        }

        /** Verifica si el usuario actual tiene acceso a la categoría de proveedores */
        canAccessSuppliers() {
            if (this.isSuperAdmin()) return true;
            try {
                const profile = window.authManager?.currentUser || 
                                JSON.parse(localStorage.getItem('recipe_pantry_user_profile') || '{}');
                return Boolean(profile && profile.can_access_suppliers === true);
            } catch (e) {
                return false;
            }
        }

        /** Obtiene el ID del usuario actual de manera segura */
        getCurrentUserId() {
            return window.authManager?.currentUser?.id || 
                   window.authManager?.session?.user?.id ||
                   (JSON.parse(localStorage.getItem('recipe_pantry_user_profile') || '{}').id) || 
                   'anon';
        }

        /** Lista de IDs de proveedores ocultados individualmente por el usuario */
        _getHiddenSuppliers() {
            try {
                const uid = this.getCurrentUserId();
                const raw = localStorage.getItem(`recipe_pantry_hidden_suppliers_${uid}`);
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        }

        /** Oculta un proveedor asignado para el usuario actual */
        _hideSupplierForUser(supplierId) {
            try {
                const uid = this.getCurrentUserId();
                const hidden = this._getHiddenSuppliers();
                if (!hidden.includes(supplierId)) {
                    hidden.push(supplierId);
                    localStorage.setItem(`recipe_pantry_hidden_suppliers_${uid}`, JSON.stringify(hidden));
                }
            } catch (e) {}
        }

        /** Desoculta todos los proveedores para el usuario */
        _unhideAllSuppliersForUser() {
            try {
                const uid = this.getCurrentUserId();
                localStorage.removeItem(`recipe_pantry_hidden_suppliers_${uid}`);
            } catch (e) {}
        }

        /** Obtiene el modo de proveedores configurado para el usuario actual ('shared' o 'empty') */
        getSuppliersMode() {
            if (this.isSuperAdmin()) return 'shared';
            try {
                const profile = window.authManager?.currentUser || 
                                JSON.parse(localStorage.getItem('recipe_pantry_user_profile') || '{}');
                return profile.suppliers_mode === 'empty' ? 'empty' : 'shared';
            } catch (e) {
                return 'shared';
            }
        }

        /** Cambia el modo de proveedores (directorio propio 'empty' o asignado 'shared') */
        async setSuppliersMode(mode) {
            const isEn = this.isEnglish();
            const uid = this.getCurrentUserId();
            try {
                if (window.authManager?.currentUser) {
                    window.authManager.currentUser.suppliers_mode = mode;
                    localStorage.setItem('recipe_pantry_user_profile', JSON.stringify(window.authManager.currentUser));
                }
                const sb = window.supabaseClient;
                if (sb && uid && uid !== 'anon') {
                    await sb.from('users').update({ suppliers_mode: mode }).eq('id', uid);
                }
                if (mode === 'shared') {
                    this._unhideAllSuppliersForUser();
                }
                this.loadCache();
                this.renderContent();
                await this.syncData();
                this.renderListPage();
                this.notify(
                    mode === 'empty' 
                        ? (isEn ? 'Custom directory activated. You can now create your own suppliers.' : 'Directorio propio activado. Ya puedes crear tus propios proveedores.') 
                        : (isEn ? 'Assigned suppliers restored' : 'Proveedores asignados restablecidos'),
                    'success'
                );
            } catch (err) {
                console.error('Error al cambiar modo de proveedores:', err);
                this.notify(err.message || 'Error al cambiar modo', 'error');
            }
        }

        /** Diálogo de confirmación para pasar a modo propio / quitar proveedores asignados */
        promptCustomSuppliersMode() {
            const isEn = this.isEnglish();
            const title = isEn ? 'Use custom suppliers?' : '¿Quitar proveedores asignados?';
            const body = isEn
                ? 'Assigned restaurant suppliers will be hidden so you can create and manage your own custom directory. You can restore them anytime.'
                : 'Se ocultarán los proveedores asignados para que tengas tu directorio limpio y puedas crear tus propios proveedores. Puedes volver a ver los asignados cuando quieras.';
            this._showConfirmDialog(
                title, 
                body, 
                () => this.setSuppliersMode('empty'),
                {
                    actionText: isEn ? 'Use Custom' : 'Quitar asignados',
                    actionColor: 'var(--primary-dark)',
                    actionIcon: 'inventory_2'
                }
            );
        }

        /** Diálogo de confirmación para restaurar proveedores asignados */
        promptRestoreSharedSuppliers() {
            const isEn = this.isEnglish();
            const title = isEn ? 'Restore assigned suppliers?' : '¿Ver proveedores asignados?';
            const body = isEn
                ? 'You will see the default restaurant suppliers again.'
                : 'Volverás a ver la lista de proveedores asignados por el restaurante.';
            this._showConfirmDialog(
                title, 
                body, 
                () => this.setSuppliersMode('shared'),
                {
                    actionText: isEn ? 'Restore' : 'Restablecer',
                    actionColor: 'var(--primary-dark)',
                    actionIcon: 'visibility'
                }
            );
        }

        /** Clave de caché para proveedores según usuario y modo */
        _getCacheKey(baseKey) {
            if (!this.isSuperAdmin() && this.getSuppliersMode() === 'empty') {
                const uid = this.getCurrentUserId();
                return `${baseKey}_user_${uid}`;
            }
            return baseKey;
        }

        /** Carga instantánea de caché local */
        loadCache() {
            try {
                const s = localStorage.getItem(this._getCacheKey('recipe_pantry_suppliers_cache'));
                if (s) {
                    const parsed = JSON.parse(s);
                    const hidden = this._getHiddenSuppliers();
                    this.suppliers = Array.isArray(parsed) ? parsed.filter(item => !hidden.includes(item.id)) : [];
                }
                const it = localStorage.getItem(this._getCacheKey('recipe_pantry_supplier_items_cache'));
                if (it) this.items = JSON.parse(it);
                const cart = localStorage.getItem(this._getCacheKey('recipe_pantry_supplier_cart'));
                if (cart) this.orderCart = JSON.parse(cart);
            } catch (e) {
                console.warn('⚠️ Error al leer caché de proveedores:', e);
            }
        }

        /** Guarda datos en caché local */
        saveCache() {
            try {
                localStorage.setItem(this._getCacheKey('recipe_pantry_suppliers_cache'), JSON.stringify(this.suppliers));
                localStorage.setItem(this._getCacheKey('recipe_pantry_supplier_items_cache'), JSON.stringify(this.items));
                localStorage.setItem(this._getCacheKey('recipe_pantry_supplier_cart'), JSON.stringify(this.orderCart));
            } catch (e) {}
        }

        /** Muestra notificación snackbar/toast */
        notify(msg, type = 'info', timeout = 3000) {
            if (window.utils?.showToast) {
                window.utils.showToast(msg, type, timeout);
            } else if (window.showToast) {
                window.showToast(msg, type);
            } else {
                console.log(`[Toast ${type}]`, msg);
            }
        }

        /**
         * Confirmación de acciones destructivas o modales informativos.
         * Usa el Snackbar con acciones (showActionToast) del proyecto para mantener la
         * identidad M3 Expressive y evitar alert()/confirm() nativos. Si no está
         * disponible, cae a un diálogo modal M3 interno.
         * @param {string} title - Título del diálogo
         * @param {string} body - Mensaje descriptivo
         * @param {Function} onConfirm - Callback a ejecutar si el usuario confirma
         * @param {Object} options - Configuración de textos, colores e iconos
         */
        _showConfirmDialog(title, body, onConfirm, { actionText = null, actionColor = 'var(--error)', actionIcon = 'delete' } = {}) {
            const isEn = this.isEnglish();
            const defaultActionText = actionText || (actionColor === 'var(--error)' ? (isEn ? 'Delete' : 'Eliminar') : (isEn ? 'Confirm' : 'Confirmar'));
            const triggerAction = window.showActionToast || window.utils?.showActionToast;

            if (typeof triggerAction === 'function') {
                triggerAction({
                    message: `${title} ${body}`,
                    actionText: defaultActionText,
                    cancelText: isEn ? 'Cancel' : 'Cancelar',
                    actionColor: actionColor,
                    type: actionColor === 'var(--error)' ? 'error' : 'info',
                    onConfirm: async () => {
                        try {
                            await onConfirm();
                        } catch (err) {
                            console.error('Error en confirmación:', err);
                        }
                    }
                });
                return;
            }

            const existing = document.getElementById('suppliersConfirmOverlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'suppliersConfirmOverlay';
            overlay.className = 'modal-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.innerHTML = `
                <div style="
                    background: var(--bg);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-xl, 24px);
                    box-shadow: 0 12px 40px rgba(0,0,0,0.22);
                    padding: 26px 24px 22px 24px;
                    width: 100%;
                    max-width: 400px;
                    font-family: var(--font-display);
                    animation: fadeInSubView 0.2s var(--m3-easing, cubic-bezier(0.34, 1.56, 0.64, 1));
                ">
                    <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                        <div style="
                            width: 46px; height: 46px; border-radius: 50%;
                            background: color-mix(in srgb, ${actionColor} 14%, transparent);
                            color: ${actionColor};
                            display: flex; align-items: center; justify-content: center;
                            flex-shrink: 0;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 26px;">${actionIcon === 'delete' ? 'warning' : actionIcon}</span>
                        </div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--text-main); letter-spacing: -0.01em;">${title}</h3>
                    </div>
                    <p style="margin: 0 0 22px 0; font-size: 14px; line-height: 1.5; color: var(--text-secondary);">${body}</p>
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button type="button" data-confirm-cancel class="btn-supplier-cancel" style="height: 42px; padding: 0 20px;">
                            ${isEn ? 'Cancel' : 'Cancelar'}
                        </button>
                        <button type="button" data-confirm-accept style="
                            height: 42px; padding: 0 22px;
                            display: inline-flex; align-items: center; gap: 8px;
                            border-radius: var(--radius-full);
                            border: none;
                            background: ${actionColor};
                            color: var(--on-primary, #fff);
                            font-weight: 700; font-size: 14px;
                            font-family: var(--font-display);
                            cursor: pointer;
                            transition: transform 0.15s var(--m3-easing, cubic-bezier(0.34, 1.56, 0.64, 1)), filter 0.15s ease;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 18px;">${actionIcon}</span>
                            <span>${defaultActionText}</span>
                        </button>
                    </div>
                </div>
            `;

            const close = () => {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 180);
                document.removeEventListener('keydown', onKey);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') close();
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
            overlay.querySelector('[data-confirm-cancel]').addEventListener('click', close);
            overlay.querySelector('[data-confirm-accept]').addEventListener('click', async () => {
                close();
                try {
                    await onConfirm();
                } catch (err) {
                    console.error('Error en confirmación:', err);
                }
            });
            document.addEventListener('keydown', onKey);

            document.body.appendChild(overlay);
        }

        /** Inicializa detección reactiva de autenticación */
        initReactiveAuth() {
            if (this._reactiveAuthInitialized) return;
            this._reactiveAuthInitialized = true;

            const check = (isAuthEvent = false) => {
                if (isAuthEvent) {
                    this.loadCache();
                }
                this.updateVisibility();
                const currentView = document.documentElement.getAttribute('data-current-view') || 
                                    window.dashboard?.currentView;
                if (currentView === 'suppliers' && this.canAccessSuppliers()) {
                    this.render();
                } else if (isAuthEvent && this.canAccessSuppliers()) {
                    this.syncData();
                }
            };

            window.addEventListener('auth-changed', () => check(true));
            window.addEventListener('auth-ready', () => check(true));
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => check(false));
            } else {
                check(false);
            }

            if (window.supabaseClient?.auth?.onAuthStateChange) {
                try {
                    window.supabaseClient.auth.onAuthStateChange(() => setTimeout(() => check(true), 80));
                } catch (e) {}
            }

            // Polling suave inicial para reaccionar inmediatamente en cuanto termine la autenticación
            let attempts = 0;
            const authPoll = setInterval(() => {
                attempts++;
                check(attempts === 1);
                if (this.canAccessSuppliers() || attempts > 15) {
                    clearInterval(authPoll);
                }
            }, 300);
        }

        /** Conecta el buscador global (#searchInput) con el gestor de proveedores */
        initGlobalSearch() {
            if (this._globalSearchBound) return;

            const bind = () => {
                const searchInput = document.getElementById('searchInput');
                if (searchInput && !this._globalSearchBound) {
                    this._globalSearchBound = true;
                    searchInput.addEventListener('input', (e) => {
                        const currentView = document.documentElement.getAttribute('data-current-view') || 
                                            (window.dashboard && window.dashboard.currentView);
                        if (currentView === 'suppliers' && this.canAccessSuppliers()) {
                            this.handleSearch(e.target.value);
                        }
                    });
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', bind);
            } else {
                bind();
            }
        }

        /** Muestra u oculta la opción en el sidebar según permisos de superadmin o usuario autorizado */
        updateVisibility() {
            const navEl = document.getElementById('navItemSuppliers');
            const hasAccess = this.canAccessSuppliers();
            if (navEl) {
                if (hasAccess) {
                    navEl.classList.remove('hidden');
                } else {
                    const hasAuthUser = Boolean(
                        window.authManager?.currentUser?.email ||
                        window.authManager?.session?.user?.email ||
                        localStorage.getItem('recipe_pantry_user_profile')
                    );
                    if (hasAuthUser) {
                        navEl.classList.add('hidden');
                    }
                }
            }
        }

        /** Sincroniza proveedores e ítems desde Supabase */
        async syncData() {
            if (!this.canAccessSuppliers()) return;
            this.isLoading = true;

            try {
                const sb = window.supabaseClient;
                if (!sb) return;

                let currentMode = this.getSuppliersMode();
                let currentUserId = window.authManager?.currentUser?.id || 
                                    window.authManager?.session?.user?.id ||
                                    (JSON.parse(localStorage.getItem('recipe_pantry_user_profile') || '{}').id);

                // Si no es superadmin y el perfil local tiene modo 'empty', verificar contra Supabase si el superadmin cambió a 'shared'
                if (!this.isSuperAdmin() && currentMode === 'empty' && currentUserId) {
                    try {
                        const { data: latestUser } = await sb
                            .from('users')
                            .select('can_access_suppliers, suppliers_mode')
                            .eq('id', currentUserId)
                            .maybeSingle();
                        if (latestUser) {
                            if (latestUser.suppliers_mode && latestUser.suppliers_mode !== currentMode) {
                                currentMode = latestUser.suppliers_mode;
                                if (window.authManager?.currentUser) {
                                    window.authManager.currentUser.suppliers_mode = currentMode;
                                    localStorage.setItem('recipe_pantry_user_profile', JSON.stringify(window.authManager.currentUser));
                                }
                            }
                        }
                    } catch (e) {
                        /* ignore network fallback */
                    }
                }

                // 1. Cargar proveedores
                let supQuery = sb.from('suppliers').select('*');
                if (!this.isSuperAdmin() && currentMode === 'empty') {
                    if (currentUserId) {
                        supQuery = supQuery.eq('user_id', currentUserId);
                    } else {
                        supQuery = supQuery.eq('user_id', '00000000-0000-0000-0000-000000000000');
                    }
                }

                const { data: supData, error: supErr } = await supQuery
                    .order('order_index', { ascending: true })
                    .order('name', { ascending: true });

                if (supErr) throw supErr;
                if (supData) {
                    const hidden = this._getHiddenSuppliers();
                    this.suppliers = supData.filter(item => !hidden.includes(item.id));
                }

                // 2. Cargar productos
                let itemQuery = sb.from('supplier_items').select('*');
                if (!this.isSuperAdmin() && currentMode === 'empty') {
                    if (currentUserId) {
                        itemQuery = itemQuery.eq('user_id', currentUserId);
                    } else {
                        itemQuery = itemQuery.eq('user_id', '00000000-0000-0000-0000-000000000000');
                    }
                }

                const { data: itemData, error: itemErr } = await itemQuery
                    .order('order_index', { ascending: true })
                    .order('name', { ascending: true });

                if (itemErr) throw itemErr;
                if (itemData) this.items = itemData;

                this.saveCache();
            } catch (err) {
                console.error('❌ Error sincronizando proveedores:', err);
            } finally {
                this._hasSyncedOnce = true;
                this.isLoading = false;
                const spinner = document.getElementById('suppliers-loading-spinner');
                if (spinner) spinner.style.display = 'none';

                // Actualizar contador del pill 'Todos' si existe en el DOM
                const allPillText = document.getElementById('supplierAllCountPill');
                if (allPillText) {
                    const isEn = this.isEnglish();
                    allPillText.textContent = `${isEn ? 'All' : 'Todos'} (${this.suppliers.length})`;
                }

                // Re-renderizar la subvista activa: la lista solo refresca el mount,
                // mientras que el detalle/formulario requiere re-render completo.
                if (this.currentSubView === 'list') {
                    this.renderContent();
                } else {
                    this.render();
                }
            }
        }

        /**
         * Calcula el estado de entrega y hora de corte de un proveedor en tiempo real
         */
        getDeliveryStatus(supplier) {
            const isEn = this.isEnglish();
            const days = Array.isArray(supplier.delivery_days) ? supplier.delivery_days : [];
            const cutoffTime = supplier.cutoff_time ? supplier.cutoff_time.substring(0, 5) : '18:00';

            if (!days || days.length === 0) {
                return {
                    isOpenToday: false,
                    isDeliveringTomorrow: false,
                    badgeType: 'neutral',
                    statusTitle: isEn ? 'No delivery days set' : 'Sin días configurados',
                    statusSub: isEn ? 'Edit supplier to configure schedule' : 'Edita para programar días de reparto',
                    nextDeliveryDay: null,
                    cutoffFormatted: cutoffTime
                };
            }

            const now = new Date();
            const currentJsDay = now.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
            const tomorrowJsDay = (currentJsDay + 1) % 7;

            // Encontrar si mañana es día de entrega
            const tomorrowDayObj = this.DAYS.find(d => d.jsDay === tomorrowJsDay);
            const isTomorrowDelivery = Boolean(tomorrowDayObj && days.includes(tomorrowDayObj.id));

            // Parsear hora de corte hoy
            const [cHour, cMin] = cutoffTime.split(':').map(Number);
            const cutoffDate = new Date();
            cutoffDate.setHours(cHour || 18, cMin || 0, 0, 0);

            const isBeforeCutoff = now < cutoffDate;
            const diffMs = cutoffDate.getTime() - now.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            // Caso 1: Mañana entrega y aún estamos antes del corte
            if (isTomorrowDelivery && isBeforeCutoff) {
                const tomorrowName = isEn ? tomorrowDayObj.labelEn : tomorrowDayObj.label;
                const isUrgent = diffHours < 2; // Menos de 2 horas

                let sub = '';
                if (diffHours > 0) {
                    sub = isEn ? `Quedan ${diffHours}h ${diffMinutes}m (Corte: ${cutoffTime})` : `Quedan ${diffHours}h ${diffMinutes}m (Corte: ${cutoffTime})`;
                } else {
                    sub = isEn ? `⚠️ Quedan solo ${diffMinutes} min (Corte: ${cutoffTime})` : `⚠️ Quedan solo ${diffMinutes} min (Corte: ${cutoffTime})`;
                }

                return {
                    isOpenToday: true,
                    isDeliveringTomorrow: true,
                    isUrgent,
                    badgeType: isUrgent ? 'warning' : 'success',
                    statusTitle: isEn ? `🟢 Delivery Tomorrow (${tomorrowName})` : `🟢 Entrega Mañana (${tomorrowName})`,
                    statusSub: sub,
                    nextDeliveryDay: tomorrowDayObj,
                    cutoffFormatted: cutoffTime
                };
            }

            // Caso 2: Mañana era día de entrega pero ya pasó la hora de corte
            // O mañana no entrega: buscar el próximo día de entrega
            let daysAhead = 1;
            let nextDayObj = null;
            let orderDeadlineDayObj = null;

            for (let i = 1; i <= 7; i++) {
                const checkJsDay = (currentJsDay + i) % 7;
                const dObj = this.DAYS.find(d => d.jsDay === checkJsDay);
                if (dObj && days.includes(dObj.id)) {
                    // Si es mañana pero el corte ya pasó, continuar buscando el siguiente día de reparto
                    if (i === 1 && !isBeforeCutoff) {
                        continue;
                    }
                    daysAhead = i;
                    nextDayObj = dObj;
                    // El pedido debe hacerse el día anterior
                    const prevJsDay = (checkJsDay + 6) % 7;
                    orderDeadlineDayObj = this.DAYS.find(d => d.jsDay === prevJsDay);
                    break;
                }
            }

            if (!nextDayObj) {
                // Si la única opción era mañana y ya pasó el corte, el próximo es dentro de una semana
                nextDayObj = tomorrowDayObj;
                const prevJsDay = (nextDayObj.jsDay + 6) % 7;
                orderDeadlineDayObj = this.DAYS.find(d => d.jsDay === prevJsDay);
            }

            const nextName = nextDayObj ? (isEn ? nextDayObj.labelEn : nextDayObj.label) : '';
            const deadlineDayName = orderDeadlineDayObj ? (isEn ? orderDeadlineDayObj.labelEn : orderDeadlineDayObj.label) : '';

            if (isTomorrowDelivery && !isBeforeCutoff) {
                return {
                    isOpenToday: false,
                    isDeliveringTomorrow: false,
                    badgeType: 'closed',
                    statusTitle: isEn ? `⏰ Cutoff closed today (was ${cutoffTime})` : `⏰ Corte de hoy cerrado (era ${cutoffTime})`,
                    statusSub: isEn ? `Next delivery: ${nextName} (Order ${deadlineDayName} before ${cutoffTime})` : `Próx. entrega: ${nextName} (Pedir ${deadlineDayName} antes de ${cutoffTime})`,
                    nextDeliveryDay: nextDayObj,
                    cutoffFormatted: cutoffTime
                };
            }

            return {
                isOpenToday: false,
                isDeliveringTomorrow: false,
                badgeType: 'upcoming',
                statusTitle: isEn ? `📅 Next delivery: ${nextName}` : `📅 Próxima entrega: ${nextName}`,
                statusSub: isEn ? `Order on ${deadlineDayName} before ${cutoffTime}` : `Pedir el ${deadlineDayName} antes de las ${cutoffTime}`,
                nextDeliveryDay: nextDayObj,
                cutoffFormatted: cutoffTime
            };
        }

        render(container) {
            if (container) {
                this.container = container;
            } else if (!this.container) {
                this.container = document.getElementById('suppliersView');
            }
            if (!this.container) return;

            const authEmail = (
                window.authManager?.currentUser?.email ||
                window.authManager?.session?.user?.email ||
                (JSON.parse(localStorage.getItem('recipe_pantry_user_profile') || '{}').email) ||
                ''
            );

            if (!this.canAccessSuppliers()) {
                if (!authEmail) {
                    this.container.innerHTML = `
                        <div style="padding: 60px 20px; text-align: center; font-family: var(--font-display);">
                            <span class="material-symbols-outlined" style="font-size: 36px; color: var(--primary); animation: spin 1s linear infinite;">sync</span>
                            <p style="color: var(--text-secondary); font-size: 14px; margin-top: 12px;">Cargando proveedores...</p>
                        </div>
                    `;
                    return;
                }

                const isEn = this.isEnglish();
                this.container.innerHTML = `
                    <div style="padding: 60px 20px; text-align: center; font-family: var(--font-display);">
                        <span class="material-symbols-outlined" style="font-size: 48px; color: var(--error);">lock</span>
                        <h2 style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 12px;">${isEn ? 'Restricted Access' : 'Acceso Restringido'}</h2>
                        <p style="color: var(--text-secondary); font-size: 14px; max-width: 440px; margin: 8px auto 20px auto;">
                            ${isEn ? 'You need authorization from the Administrator to access the Suppliers & Orders category.' : 'Necesitas autorización del Administrador para acceder a la categoría de Proveedores y Pedidos.'}
                        </p>
                        <button type="button" onclick="window.dashboard.switchView('recipes')" class="btn-primary" style="padding: 10px 24px; border-radius: var(--radius-full); font-weight: 700; cursor: pointer;">
                            ${isEn ? 'Back to Recipes' : 'Volver a Recetas'}
                        </button>
                    </div>
                `;
                return;
            }

            // Sincronizar estado en body para ocultar barra superior y FAB si estamos en formulario de producto o proveedor
            if (this.currentSubView === 'item-form' || this.currentSubView === 'supplier-form' || this.currentSubView === 'order-form' || this.currentSubView === 'order-consolidated') {
                document.body.classList.add('supplier-subview-item-active');
            } else {
                document.body.classList.remove('supplier-subview-item-active');
            }
            this.updateFabVisibility();

            if (this.currentSubView === 'supplier-detail') {
                this.renderSupplierDetailPage(this.selectedSupplierDetailId);
                return;
            }
            if (this.currentSubView === 'supplier-form') {
                this.renderSupplierFormPage();
                return;
            }
            if (this.currentSubView === 'item-form') {
                this.renderItemFormPage();
                return;
            }
            if (this.currentSubView === 'order-form') {
                this.renderOrderPage();
                return;
            }
            if (this.currentSubView === 'order-consolidated') {
                this.renderConsolidatedOrdersPage();
                return;
            }

            this.renderListPage();
        }

        /**
         * Renderiza el listado principal de proveedores en formato de lista M3 (igual al formato de recetas)
         */
        renderListPage() {
            if (!this.container) return;
            const isEn = this.isEnglish();
            const allSuppliers = this.suppliers || [];
            const orderedSuppliers = allSuppliers.filter(s => {
                const cart = this.orderCart[s.id] || {};
                return Object.values(cart).some(q => q > 0);
            });
            const totalSuppliersWithOrders = orderedSuppliers.length;

            this.container.innerHTML = `
                <div class="suppliers-view-container" style="max-width: 1200px; margin: 0 auto; padding: 0 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Header Principal y Filtros Fijos al Scroll (Sticky) -->
                    <div class="suppliers-sticky-header">
                        <div class="suppliers-header-flat">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span class="material-symbols-outlined" style="font-size: 26px; color: var(--primary-dark);">local_shipping</span>
                                <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em;">
                                    ${isEn ? 'Suppliers' : 'Proveedores'}
                                </h2>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button type="button" 
                                        class="btn-supplier-orders-nav" 
                                        onclick="window.suppliersManager.startMakingOrders()" 
                                        title="${isEn ? 'Create or view orders' : 'Ir a crear órdenes'}">
                                    <span class="material-symbols-outlined">receipt_long</span>
                                    <span>${isEn ? 'Orders' : 'Órdenes'}</span>
                                    ${totalSuppliersWithOrders > 0 ? `
                                        <span class="supplier-orders-badge">${totalSuppliersWithOrders}</span>
                                    ` : ''}
                                </button>
                                ${!this.isSuperAdmin() ? `
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        ${this.getSuppliersMode() === 'empty' ? `
                                            <button type="button" class="btn-m3-tonal" onclick="window.suppliersManager.promptRestoreSharedSuppliers()" style="
                                                display: inline-flex;
                                                align-items: center;
                                                gap: 6px;
                                                padding: 8px 14px;
                                                border-radius: var(--radius-full);
                                                border: 1px solid var(--border);
                                                background: var(--surface);
                                                color: var(--text-main);
                                                font-size: 12.5px;
                                                font-weight: 600;
                                                cursor: pointer;
                                                font-family: var(--font-display);
                                                transition: background var(--transition-fast);
                                            ">
                                                <span class="material-symbols-outlined" style="font-size: 18px; color: var(--primary);">visibility</span>
                                                <span>${isEn ? 'View assigned suppliers' : 'Ver proveedores asignados'}</span>
                                            </button>
                                        ` : `
                                            <button type="button" class="btn-m3-tonal" onclick="window.suppliersManager.promptCustomSuppliersMode()" style="
                                                display: inline-flex;
                                                align-items: center;
                                                gap: 6px;
                                                padding: 8px 14px;
                                                border-radius: var(--radius-full);
                                                border: 1px solid var(--border);
                                                background: var(--surface);
                                                color: var(--text-secondary);
                                                font-size: 12.5px;
                                                font-weight: 600;
                                                cursor: pointer;
                                                font-family: var(--font-display);
                                                transition: background var(--transition-fast);
                                            ">
                                                <span class="material-symbols-outlined" style="font-size: 18px; color: var(--primary-dark);">inventory_2</span>
                                                <span>${isEn ? 'Use custom directory' : 'Quitar proveedores asignados'}</span>
                                            </button>
                                        `}
                                    </div>
                                ` : ''}
                            </div>
                        </div>

                        <!-- Barra de Filtros Rápidos M3 y Estado de Búsqueda Global -->
                        <div class="suppliers-filters-container" style="
                            display: flex;
                            flex-wrap: wrap;
                            align-items: center;
                            justify-content: space-between;
                            gap: 12px;
                            margin-top: 10px;
                        ">
                            <!-- Filtros tipo Pills M3 y Filtro por Tipo/Categoría -->
                            <div class="suppliers-filter-bar" style="display: flex; align-items: center; gap: 8px;">
                                <button type="button" class="supplier-filter-pill ${this.activeFilter === 'all' ? 'active' : ''}" 
                                    onclick="window.suppliersManager.setFilter('all')">
                                    <span class="material-symbols-outlined" style="font-size: 18px;">apps</span>
                                    <span id="supplierAllCountPill">${isEn ? 'All' : 'Todos'} (${this.suppliers.length})</span>
                                </button>

                                <button type="button" class="supplier-filter-pill ${this.activeFilter === 'delivery_tomorrow' ? 'active' : ''}" 
                                    onclick="window.suppliersManager.setFilter('delivery_tomorrow')">
                                    <span class="material-symbols-outlined" style="font-size: 18px; color: var(--primary);">local_shipping</span>
                                    <span>${isEn ? 'Delivering Tomorrow' : 'Entregan Mañana'}</span>
                                </button>

                                <button type="button" class="supplier-filter-pill ${this.activeFilter === 'open_today' ? 'active' : ''}" 
                                    onclick="window.suppliersManager.setFilter('open_today')">
                                    <span class="material-symbols-outlined" style="font-size: 18px; color: var(--primary-dark);">schedule</span>
                                    <span>${isEn ? 'Order Open Today' : 'Corte Abierto Hoy'}</span>
                                </button>

                                <!-- Selector de Tipo de Proveedor (Carnes, Verduras, etc.) -->
                                <div style="display: inline-flex; align-items: center; gap: 6px; margin-left: 4px;">
                                    <select id="supplierCategoryFilter" onchange="window.suppliersManager.setCategoryFilter(this.value)" style="
                                        height: 38px;
                                        padding: 0 14px;
                                        border-radius: var(--radius-full);
                                        font-size: 13px;
                                        font-weight: 700;
                                        font-family: var(--font-display);
                                        color: var(--text-main);
                                        border: 1.5px solid var(--border);
                                        background: var(--bg);
                                        cursor: pointer;
                                        outline: none;
                                    ">
                                        <option value="all">${isEn ? 'All Types (Meat, Veggies...)' : 'Todos los Tipos (Carne, Verdura...)'}</option>
                                        ${this.CATEGORIES.map(c => `
                                            <option value="${c.id}" ${this.categoryFilter === c.id ? 'selected' : ''}>${c.displayLabel || c.label}</option>
                                        `).join('')}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Indicador de Carga / Spinner -->
                    <div id="suppliers-loading-spinner" style="text-align: center; padding: 30px; ${this.isLoading ? 'display: block;' : 'display: none;'}">
                        <div class="spinner-sm" style="margin: 0 auto 10px auto;"></div>
                        <p style="color: var(--text-secondary); font-size: 13px;">${isEn ? 'Synchronizing catalog...' : 'Sincronizando proveedores y productos...'}</p>
                    </div>

                    <!-- Contenedor Dinámico de la Lista de Proveedores -->
                    <div id="suppliers-cards-mount"></div>
                </div>
            `;

            this.renderContent();
            this.syncData();
        }

        /** Establece filtro por categoría/tipo de proveedor */
        setCategoryFilter(cat) {
            this.categoryFilter = cat || 'all';
            this.renderContent();
        }

        /** Filtra proveedores y renderiza la lista en formato tipo recetas */
        renderContent() {
            const mount = document.getElementById('suppliers-cards-mount');
            if (!mount) return;

            const isEn = this.isEnglish();
            let filtered = [...this.suppliers];

            // Búsqueda por texto (proveedor o nombre de producto)
            if (this.searchQuery.trim()) {
                const q = this.searchQuery.toLowerCase().trim();
                filtered = filtered.filter(sup => {
                    const matchSup = (sup.name && sup.name.toLowerCase().includes(q));
                    const supItems = this.items.filter(it => it.supplier_id === sup.id);
                    const matchItem = supItems.some(it => it.name && it.name.toLowerCase().includes(q));
                    return matchSup || matchItem;
                });
            }

            // Filtro por categoría/tipo
            if (this.categoryFilter && this.categoryFilter !== 'all') {
                filtered = filtered.filter(sup => (sup.category || 'otros').toLowerCase() === this.categoryFilter.toLowerCase());
            }

            // Filtros rápidos de estado
            if (this.activeFilter === 'delivery_tomorrow') {
                filtered = filtered.filter(sup => {
                    const status = this.getDeliveryStatus(sup);
                    return status.isDeliveringTomorrow;
                });
            } else if (this.activeFilter === 'open_today') {
                filtered = filtered.filter(sup => {
                    const status = this.getDeliveryStatus(sup);
                    return status.isOpenToday;
                });
            }

            if (filtered.length === 0) {
                if (this.isLoading && !this._hasSyncedOnce) {
                    mount.innerHTML = `
                        <div style="text-align: center; padding: 48px 20px;">
                            <div class="spinner-sm" style="margin: 0 auto 12px auto;"></div>
                            <p style="color: var(--text-secondary); font-size: 13.5px; font-family: var(--font-display);">
                                ${isEn ? 'Loading suppliers and catalog...' : 'Cargando proveedores y catálogo...'}
                            </p>
                        </div>
                    `;
                    return;
                }
                const isSearching = Boolean(this.searchQuery && this.searchQuery.trim());
                mount.innerHTML = `
                    <div style="
                        background: var(--bg);
                        border: 1.5px dashed var(--border);
                        border-radius: var(--radius-xl);
                        padding: 56px 20px;
                        text-align: center;
                    ">
                        <div style="
                            width: 64px;
                            height: 64px;
                            border-radius: 50%;
                            background: var(--secondary-light);
                            color: var(--primary-dark);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 16px auto;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 34px;">${isSearching ? 'person_search' : 'storefront'}</span>
                        </div>
                        <h3 style="margin: 0 0 8px 0; font-size: 17px; font-weight: 700; color: var(--text-main);">
                            ${isSearching
                                ? (isEn ? `No suppliers found for "${this.searchQuery}"` : `No se encontró a "${this.searchQuery}" en la lista de proveedores`)
                                : (this.getSuppliersMode() === 'empty'
                                    ? (isEn ? 'Your custom directory is ready' : 'Tu directorio propio está listo')
                                    : (isEn ? 'No suppliers found' : 'No hay proveedores registrados'))}
                        </h3>
                        <p style="margin: 0 0 16px 0; color: var(--text-secondary); font-size: 13.5px; max-width: 440px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                            ${isSearching
                                ? (isEn
                                    ? 'This supplier is not registered in your directory. You can add it using the floating (+) menu or try another search.'
                                    : 'Este proveedor no está en la lista. Si lo necesitas, deberías agregarlo desde el menú flotante (+).')
                                : (this.getSuppliersMode() === 'empty'
                                    ? (isEn
                                        ? 'Start creating your own suppliers using the button below or restore assigned ones anytime.'
                                        : 'Comienza creando tus propios proveedores con el botón de abajo, o restaura los asignados cuando desees.')
                                    : (isEn
                                        ? 'You can add suppliers using the floating (+) menu.'
                                        : 'Puedes registrar nuevos proveedores usando el menú flotante (+).'))}
                        </p>
                        ${!isSearching && this.getSuppliersMode() === 'empty' ? `
                            <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px;">
                                <button type="button" class="btn-primary" onclick="window.suppliersManager.openSupplierForm()" style="
                                    padding: 9px 20px;
                                    border-radius: var(--radius-full);
                                    font-size: 13px;
                                    font-weight: 700;
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 6px;
                                ">
                                    <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
                                    <span>${isEn ? 'Create First Supplier' : 'Crear mi primer proveedor'}</span>
                                </button>
                                <button type="button" class="btn-m3-tonal" onclick="window.suppliersManager.promptRestoreSharedSuppliers()" style="
                                    padding: 9px 18px;
                                    border-radius: var(--radius-full);
                                    border: 1px solid var(--border);
                                    background: var(--surface);
                                    color: var(--text-main);
                                    font-size: 13px;
                                    font-weight: 600;
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 6px;
                                ">
                                    <span class="material-symbols-outlined" style="font-size: 18px; color: var(--primary);">visibility</span>
                                    <span>${isEn ? 'Restore Assigned' : 'Ver proveedores asignados'}</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
                return;
            }

            // Renderizado en formato plano estilo recetas (sin caja)
            mount.innerHTML = `
                <div class="suppliers-list-view">
                    <div class="supplier-dropbox-header">
                        <div class="col-sup-thumb">${isEn ? 'FOTO' : 'FOTO'}</div>
                        <div class="col-sup-info">${isEn ? 'PROVEEDOR' : 'PROVEEDOR'}</div>
                        <div class="col-sup-type">${isEn ? 'TIPO' : 'TIPO'}</div>
                        <div class="col-sup-days">${isEn ? 'DÍAS DE REPARTO' : 'DÍAS DE REPARTO'}</div>
                    </div>
                    <div class="suppliers-list-body">
                        ${filtered.map(sup => this.renderSupplierRow(sup)).join('')}
                    </div>
                </div>
            `;
        }

        /**
         * Renderiza una fila individual de proveedor en formato lista estilo Dropbox (como en recetas)
         */
        renderSupplierRow(supplier) {
            const isEn = this.isEnglish();
            const status = this.getDeliveryStatus(supplier);
            const supItems = this.items.filter(it => it.supplier_id === supplier.id);
            const activeDays = Array.isArray(supplier.delivery_days) ? supplier.delivery_days : [];
            const cat = this.getCategoryObj(supplier.category);

            // Badge de estado basado en tokens
            let badgeBg = 'var(--surface)';
            let badgeColor = 'var(--text-secondary)';
            let badgeBorder = 'var(--border)';
            let badgeIcon = 'schedule';

            if (status.badgeType === 'success') {
                badgeBg = 'var(--secondary-light)';
                badgeColor = 'var(--on-secondary)';
                badgeBorder = 'var(--border)';
                badgeIcon = 'check_circle';
            } else if (status.badgeType === 'warning') {
                badgeBg = 'var(--surface)';
                badgeColor = 'var(--warning)';
                badgeBorder = 'var(--border)';
                badgeIcon = 'hourglass_top';
            } else if (status.badgeType === 'closed') {
                badgeBg = 'var(--surface)';
                badgeColor = 'var(--error)';
                badgeBorder = 'var(--border)';
                badgeIcon = 'event_busy';
            } else if (status.badgeType === 'upcoming') {
                badgeBg = 'var(--primary-light)';
                badgeColor = 'var(--primary-dark)';
                badgeBorder = 'var(--border)';
                badgeIcon = 'calendar_month';
            }

            const daysMap = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
            const activeDaysList = this.DAYS.filter(d => activeDays.includes(d.id));
            const activeDaysText = activeDaysList.map(d => d.short).join(' · ');

            return `
                <div class="supplier-row-dropbox" 
                     id="supplier-row-${supplier.id}"
                     onclick="window.suppliersManager.openSupplierDetail('${supplier.id}')"
                     title="${isEn ? 'Click to view products & details' : 'Clic para ver productos y detalles'}">
                    
                    <!-- 1. Foto / Avatar (Limpia, Circular con protagonismo, sin recuadro ni marco) -->
                    <div class="col-sup-logo" style="width: 50px; height: 50px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: transparent;">
                        ${supplier.image_url ? `
                            <img src="${supplier.image_url}" 
                                 alt="${supplier.name}" 
                                 style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; box-shadow: 0 1px 3px rgba(0,0,0,0.08);"
                                 loading="lazy"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div style="display: none; width: 100%; height: 100%; border-radius: 50%; background: ${cat.bg}; color: ${cat.color}; align-items: center; justify-content: center; font-weight: 800; font-size: 17px;">
                                ${supplier.name.substring(0, 2).toUpperCase()}
                            </div>
                        ` : `
                            <div style="width: 100%; height: 100%; border-radius: 50%; background: ${cat.bg}; color: ${cat.color}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 17px;">
                                ${supplier.name.substring(0, 2).toUpperCase()}
                            </div>
                        `}
                    </div>

                    <!-- 2. Sección del Proveedor (Nombre, Categoría y Días de reparto) -->
                    <div class="col-sup-info">
                        <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                            <span class="sup-primary-name" style="font-size: 16px; font-weight: 700; color: var(--text-main); letter-spacing: -0.01em;">${supplier.name}</span>
                        </div>

                        <!-- Metadatos visibles en móvil: Categoría arriba y Días en su propia fila abajo -->
                        <div class="sup-mobile-meta">
                            <div class="sup-mobile-cat-row">
                                <span class="supplier-type-pill-mobile" style="background: ${cat.bg}; color: ${cat.color};">
                                    <span class="material-symbols-outlined" style="font-size: 12px;">${cat.icon}</span>
                                    <span>${cat.displayLabel}</span>
                                </span>
                            </div>
                            ${activeDaysList.length > 0 ? `
                                <div class="sup-mobile-days-row">
                                    <div class="supplier-days-pill-group" style="display: inline-flex; align-items: center; gap: 3px;">
                                        ${activeDaysList.map(d => `
                                            <div class="supplier-day-dot active" title="${isEn ? d.labelEn : d.label}: ${isEn ? 'Delivery' : 'Hace entrega'}">
                                                ${d.short}
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Botón de 3 puntos móvil centrado verticalmente en la tarjeta -->
                    <button type="button" 
                            class="btn-icon-m3 supplier-integrated-more-btn" 
                            onclick="event.stopPropagation(); window.suppliersManager.showMoreOptions('${supplier.id}', event);"
                            title="${isEn ? 'Options' : 'Opciones'}"
                            aria-label="${isEn ? 'Options' : 'Opciones'}">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>

                    <!-- 3. Tipo de Proveedor (Carne, Verduras, Pescados...) -->
                    <div class="col-sup-type">
                        <span class="supplier-type-pill" style="background: ${cat.bg}; color: ${cat.color}; border: 1px solid var(--border);">
                            <span class="material-symbols-outlined" style="font-size: 14px;">${cat.icon}</span>
                            <span>${cat.displayLabel}</span>
                        </span>
                    </div>

                    <!-- 4. Días de Reparto (Solo días activos) -->
                    <div class="col-sup-days">
                        ${activeDaysList.length > 0 ? `
                            <div class="supplier-days-pill-group">
                                ${activeDaysList.map(d => `
                                    <div class="supplier-day-dot active"
                                         title="${isEn ? d.labelEn : d.label}: ${isEn ? 'Delivery' : 'Hace entrega'}">
                                        ${d.short}
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <span style="color: var(--text-secondary); font-size: 13px; font-weight: 500;">—</span>
                        `}
                    </div>

                    <!-- Acciones flotantes en Hover (Escritorio / PC) estilo Recetas -->
                    <div class="supplier-hover-actions" onclick="event.stopPropagation();">
                        <button type="button" 
                                class="btn-supplier-hover-pill" 
                                onclick="window.suppliersManager.openSupplierDetail('${supplier.id}')" 
                                title="${isEn ? 'View Products' : 'Ver Catálogo de Productos'}">
                            <span class="material-symbols-outlined">inventory_2</span>
                            <span>${isEn ? 'Products' : 'Productos'}</span>
                        </button>

                        <button type="button" 
                                class="btn-supplier-hover-pill" 
                                onclick="window.suppliersManager.openOrderForm('${supplier.id}')" 
                                title="${isEn ? 'Create Order' : 'Armar Pedido'}">
                            <span class="material-symbols-outlined">shopping_cart_checkout</span>
                            <span>${isEn ? 'Order' : 'Pedido'}</span>
                        </button>

                        <button type="button" 
                                class="btn-icon-m3" 
                                onclick="window.suppliersManager.openSupplierForm('${supplier.id}')" 
                                title="${isEn ? 'Edit Supplier' : 'Editar Proveedor'}">
                            <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
                        </button>

                        <button type="button" 
                                class="btn-icon-m3" 
                                title="${isEn ? 'More options' : 'Más opciones'}"
                                onclick="window.suppliersManager.showMoreOptions('${supplier.id}', event)">
                            <span class="material-symbols-outlined" style="font-size: 18px;">more_vert</span>
                        </button>
                    </div>
                </div>
            `;
        }

        /**
         * Abre la página de detalle de un proveedor específico estilo Rekki
         */
        openSupplierDetail(supplierId) {
            this.selectedSupplierDetailId = supplierId;
            this.currentSubView = 'supplier-detail';
            // Persistir estado en la URL para que F5 restaure la misma vista
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('supplier', supplierId);
                history.replaceState({ supplierDetailId: supplierId }, '', url.toString());
            } catch (e) { /* ignore */ }
            this.render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        /**
         * Sistema de 3 puntos unificado idéntico al de Recetas (showMoreOptions):
         * - En Móvil (< 600px): Abre el Bottom Sheet modal M3 Expressive expandible con física táctil.
         * - En Escritorio (>= 600px): Abre el menú popover anclado dropbox-menu-m3 con posicionamiento fixed.
         */
        showMoreOptions(supplierId, event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }

            const trigger = (event && event.currentTarget) ? event.currentTarget : ((event?.target?.closest('button')) || event?.target);

            // Debounce / Toggle off si se vuelve a pulsar el mismo trigger recién cerrado
            if (this._lastMenuClosedSupplierId === String(supplierId) && (Date.now() - (this._lastMenuClosedTime || 0)) < 350) {
                this._lastMenuClosedSupplierId = null;
                return;
            }

            const existingMenu = document.querySelector('.m3-modal-bottom-sheet, .dropbox-menu-m3');
            const existingBackdrop = document.getElementById('m3SheetBackdrop');
            if (existingMenu) {
                const isSameSupplier = existingMenu.dataset.supplierId === String(supplierId);
                existingMenu.remove();
                if (existingBackdrop) existingBackdrop.remove();
                if (isSameSupplier) {
                    return;
                }
            }
            if (existingBackdrop) existingBackdrop.remove();

            const supplier = this.suppliers.find(s => String(s.id) === String(supplierId));
            if (!supplier) return;

            const isDesktop = window.innerWidth > 768;
            const isEn = this.isEnglish();
            const cat = this.getCategoryObj(supplier.category);
            const supItems = this.items.filter(it => it.supplier_id === supplier.id);
            const activeDays = Array.isArray(supplier.delivery_days) ? supplier.delivery_days : [];
            const activeDaysList = this.DAYS.filter(d => activeDays.includes(d.id));
            const activeDaysText = activeDaysList.map(d => d.short).join(' · ');
            const phoneClean = supplier.phone ? String(supplier.phone).replace(/[^0-9+]/g, '') : '';
            const whatsappUrl = phoneClean ? `https://wa.me/${phoneClean.replace(/^\+/, '')}` : null;
            const cartItems = this.orderCart[supplier.id] || {};
            const cartCount = Object.values(cartItems).reduce((acc, qty) => acc + (qty > 0 ? 1 : 0), 0);

            // Modal Bottom Sheet M3 Expressive
            const menu = document.createElement('div');
            menu.className = 'm3-modal-bottom-sheet';
            menu.dataset.supplierId = String(supplierId);

            // Formateo de fecha de creación del proveedor
            let createdDateStr = '—';
            if (supplier.created_at) {
                try {
                    createdDateStr = typeof window.formatDate === 'function' 
                        ? window.formatDate(supplier.created_at) 
                        : new Date(supplier.created_at).toLocaleDateString(isEn ? 'en-US' : 'es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
                } catch (e) {
                    createdDateStr = String(supplier.created_at).substring(0, 10);
                }
            }

            let sheetHTML = `
                <div class="m3-sheet-drag-handle" title="${isEn ? 'Swipe or tap to expand' : 'Toca o desliza para expandir'}"></div>
                <div class="m3-sheet-header">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                        <h4 style="margin: 0; font-size: 19px; font-weight: 800; color: var(--text-main); line-height: 1.2;">${supplier.name}</h4>
                        ${activeDaysList.length > 0 ? `
                            <div class="supplier-days-pill-group" style="display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;">
                                ${activeDaysList.map(d => `
                                    <div class="supplier-day-dot active" style="width: 22px; height: 22px; font-size: 10.5px;" title="${isEn ? d.labelEn : d.label}: ${isEn ? 'Delivery' : 'Hace entrega'}">
                                        ${d.short}
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>

                    <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-flex; align-items: center; gap: 4px; background: ${cat.bg}; color: ${cat.color}; padding: 3px 10px; border-radius: var(--radius-full); font-weight: 700; font-size: 12px;">
                            <span class="material-symbols-outlined" style="font-size: 13px;">${cat.icon}</span>
                            <span>${cat.displayLabel}</span>
                        </span>
                    </div>
                </div>

                <!-- Sección Expandible al Deslizar hacia Arriba: Cantidad de Productos y Fecha de Creación -->
                <div class="m3-sheet-details-expanded">
                    <div class="m3-sheet-detail-row">
                        <span class="m3-sheet-detail-label">
                            <span class="material-symbols-outlined m3-sheet-detail-icon">inventory_2</span>
                            <span>${isEn ? 'Products in catalog' : 'Productos en catálogo'}</span>
                        </span>
                        <span class="m3-sheet-detail-val">${supItems.length} ${isEn ? (supItems.length === 1 ? 'product' : 'products') : (supItems.length === 1 ? 'producto' : 'productos')}</span>
                    </div>
                    <div class="m3-sheet-detail-row">
                        <span class="m3-sheet-detail-label">
                            <span class="material-symbols-outlined m3-sheet-detail-icon icon-time">calendar_today</span>
                            <span>${isEn ? 'Registration date' : 'Fecha de creación'}</span>
                        </span>
                        <span class="m3-sheet-detail-val">${createdDateStr}</span>
                    </div>
                    ${supplier.email ? `
                        <div class="m3-sheet-detail-row">
                            <span class="m3-sheet-detail-label">
                                <span class="material-symbols-outlined m3-sheet-detail-icon">mail</span>
                                <span>${isEn ? 'Email' : 'Correo'}</span>
                            </span>
                            <span class="m3-sheet-detail-val" style="font-size: 12.5px;">${supplier.email}</span>
                        </div>
                    ` : ''}
                </div>

                <!-- Fila Horizontal de Acciones Rápidas (Productos, Armar Pedido y Editar) -->
                <div class="m3-sheet-quick-row">
                    <button type="button" class="m3-quick-pill" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.openSupplierDetail('${supplier.id}');">
                        <span class="material-symbols-outlined">inventory_2</span>
                        <span>${isEn ? 'Products' : 'Productos'}</span>
                    </button>
                    <button type="button" class="m3-quick-pill" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.openOrderForm('${supplier.id}');">
                        <span class="material-symbols-outlined">shopping_cart_checkout</span>
                        <span>${isEn ? 'Order' : 'Pedido'}</span>
                    </button>
                    ${(this.isSuperAdmin() || supplier.user_id === this.getCurrentUserId() || !supplier.user_id) ? `
                        <button type="button" class="m3-quick-pill" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.openSupplierForm('${supplier.id}');">
                            <span class="material-symbols-outlined">edit</span>
                            <span>${isEn ? 'Edit' : 'Editar'}</span>
                        </button>
                    ` : ''}
                </div>

                ${whatsappUrl ? `
                    <button type="button" class="context-menu-item" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.open('${whatsappUrl}', '_blank');">
                        <span class="material-symbols-outlined" style="color: #25D366;">chat</span>
                        <span>WhatsApp (${supplier.phone})</span>
                    </button>
                ` : ''}

                <div class="context-menu-divider"></div>

                <button type="button" class="context-menu-item danger" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.deleteSupplier('${supplier.id}');">
                    <span class="material-symbols-outlined">${(this.isSuperAdmin() || supplier.user_id === this.getCurrentUserId()) ? 'delete' : 'visibility_off'}</span>
                    <span>${(this.isSuperAdmin() || supplier.user_id === this.getCurrentUserId()) ? (isEn ? 'Delete Supplier' : 'Eliminar Proveedor') : (isEn ? 'Remove from list' : 'Quitar de mi lista')}</span>
                </button>
            `;

            menu.innerHTML = sheetHTML;

            const backdrop = document.createElement('div');
            backdrop.className = 'm3-sheet-backdrop';
            backdrop.id = 'm3SheetBackdrop';
            backdrop.onclick = (e) => dismiss(e);
            document.body.appendChild(backdrop);
            document.body.appendChild(menu);

            // Control de arrastre y expansión idéntico a dashboard.js
            let touchStartY = 0;
            let touchDiffY = 0;
            let isExpanded = false;
            let initialHeight = 0;
            const smoothCurve = 'height 0.45s cubic-bezier(0.25, 1, 0.5, 1), transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)';

            const measureBaseHeight = () => {
                if (!isExpanded && menu.offsetHeight > 50) {
                    initialHeight = menu.offsetHeight;
                    menu.style.height = `${initialHeight}px`;
                }
            };

            requestAnimationFrame(measureBaseHeight);
            setTimeout(measureBaseHeight, 60);

            const dragHandle = menu.querySelector('.m3-sheet-drag-handle');
            if (dragHandle) {
                dragHandle.onclick = (e) => {
                    e.stopPropagation();
                    if (!initialHeight) initialHeight = menu.offsetHeight || 360;
                    isExpanded = !isExpanded;
                    menu.style.transition = smoothCurve;
                    void menu.offsetHeight;
                    menu.classList.toggle('is-expanded', isExpanded);
                    if (isExpanded) {
                        menu.style.height = '92vh';
                    } else {
                        menu.style.height = `${initialHeight}px`;
                    }
                    menu.style.transform = isDesktop ? 'translateX(-50%)' : '';
                };
            }

            menu.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
                touchDiffY = 0;
                if (!initialHeight && !isExpanded) initialHeight = menu.offsetHeight || 360;
            }, { passive: true });

            menu.addEventListener('touchmove', (e) => {
                touchDiffY = e.touches[0].clientY - touchStartY;
                if (!initialHeight && !isExpanded) initialHeight = menu.offsetHeight || 360;

                if (!isExpanded) {
                    if (touchDiffY < 0) {
                        const targetH = Math.min(window.innerHeight * 0.92, initialHeight - touchDiffY);
                        menu.style.transition = 'none';
                        menu.style.height = `${targetH}px`;
                        menu.style.transform = isDesktop ? 'translateX(-50%)' : '';
                    } else {
                        menu.style.transition = 'none';
                        menu.style.transform = isDesktop ? `translate(-50%, ${touchDiffY}px)` : `translateY(${touchDiffY}px)`;
                    }
                } else {
                    if (menu.scrollTop <= 2 && touchDiffY > 0) {
                        const startH = window.innerHeight * 0.92;
                        const targetH = Math.max(initialHeight, startH - touchDiffY);
                        menu.style.transition = 'none';
                        menu.style.height = `${targetH}px`;
                        menu.style.transform = isDesktop ? 'translateX(-50%)' : '';
                    }
                }
            }, { passive: true });

            menu.addEventListener('touchend', () => {
                if (!initialHeight && !isExpanded) initialHeight = menu.offsetHeight || 360;
                menu.style.transition = smoothCurve;
                void menu.offsetHeight;

                if (!isExpanded) {
                    if (touchDiffY < -35) {
                        isExpanded = true;
                        menu.classList.add('is-expanded');
                        menu.style.height = '92vh';
                        menu.style.transform = isDesktop ? 'translateX(-50%)' : '';
                    } else if (touchDiffY > 80) {
                        dismiss();
                    } else {
                        menu.style.height = `${initialHeight}px`;
                        menu.style.transform = isDesktop ? 'translateX(-50%)' : 'translateY(0)';
                    }
                } else {
                    if (touchDiffY > 40) {
                        isExpanded = false;
                        menu.classList.remove('is-expanded');
                        menu.style.height = `${initialHeight}px`;
                        menu.style.transform = isDesktop ? 'translateX(-50%)' : '';
                    } else {
                        menu.style.height = '92vh';
                        menu.style.transform = isDesktop ? 'translateX(-50%)' : '';
                    }
                }
                touchDiffY = 0;
            });

            const dismiss = (e) => {
                if (trigger && e && trigger.contains(e.target)) {
                    this._lastMenuClosedTime = Date.now();
                    this._lastMenuClosedSupplierId = String(supplierId);
                }
                menu.remove();
                if (backdrop) backdrop.remove();
                cleanup();
            };

            const onKeydown = (e) => {
                if (e.key === 'Escape') dismiss(e);
            };

            const cleanup = () => {
                document.removeEventListener('keydown', onKeydown);
            };

            document.addEventListener('keydown', onKeydown);
        }

        /** Aliases de retrocompatibilidad */
        openSupplierBottomSheet(supplierId, event) {
            return this.showMoreOptions(supplierId, event);
        }

        closeSupplierBottomSheet() {
            const sheet = document.querySelector('.m3-modal-bottom-sheet, .dropbox-menu-m3');
            const backdrop = document.getElementById('m3SheetBackdrop');
            if (sheet) sheet.remove();
            if (backdrop) backdrop.remove();
        }

        toggleDetailMenu(event) {
            if (this.selectedSupplierDetailId) {
                return this.showMoreOptions(this.selectedSupplierDetailId, event);
            }
        }

        closeDetailMenu() {
            this.closeSupplierBottomSheet();
        }

        /**
         * Renderiza la página de detalle del proveedor inspirada en Rekki
         * (https://rekki.com/gb/food-wholesalers/london-catering)
         * Muestra la cabecera del proveedor, detalles de entrega y el catálogo completo de productos
         */
        renderSupplierDetailPage(supplierId) {
            if (!this.container) return;
            const isEn = this.isEnglish();
            const supplier = this.suppliers.find(s => s.id === supplierId);

            if (!supplier) {
                // Si aún no se ha sincronizado (caché vacío tras un F5), esperar a los datos
                // en lugar de perder la vista y volver a la lista.
                if (!this._hasSyncedOnce) {
                    this.container.innerHTML = `
                        <div style="padding: 60px 20px; text-align: center; font-family: var(--font-display);">
                            <div class="spinner-sm" style="margin: 0 auto 10px auto;"></div>
                            <p style="color: var(--text-secondary); font-size: 13px;">${isEn ? 'Loading supplier...' : 'Cargando proveedor...'}</p>
                        </div>
                    `;
                    this.syncData();
                    return;
                }
                this.selectedSupplierDetailId = null;
                this.backToList();
                return;
            }

            const status = this.getDeliveryStatus(supplier);
            const supItems = this.items.filter(it => it.supplier_id === supplier.id);
            const activeDays = Array.isArray(supplier.delivery_days) ? supplier.delivery_days : [];
            const cat = this.getCategoryObj(supplier.category);
            const cartItems = this.orderCart[supplier.id] || {};
            const cartCount = Object.values(cartItems).reduce((acc, qty) => acc + (qty > 0 ? 1 : 0), 0);

            const nextDayObj = status.nextDeliveryDay;
            const nextDayName = nextDayObj ? (isEn ? nextDayObj.labelEn : nextDayObj.label) : (isEn ? 'Monday' : 'Lunes');

            // Formatear notas en el estilo amigable del diseño mostrado por el usuario
            const spanishDayMap = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };
            const englishDayMap = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
            const dayNames = activeDays.map(id => isEn ? (englishDayMap[id] || id) : (spanishDayMap[id] || id));
            
            let daysFormatted = '';
            if (dayNames.length === 1) {
                daysFormatted = dayNames[0];
            } else if (dayNames.length === 2) {
                daysFormatted = `${dayNames[0]} ${isEn ? 'and' : 'y'} ${dayNames[1]}`;
            } else if (dayNames.length > 2) {
                daysFormatted = `${dayNames.slice(0, -1).join(', ')} ${isEn ? 'and' : 'y'} ${dayNames[dayNames.length - 1]}`;
            }

            let displayNotes = '';
            if (supplier.notes && !supplier.notes.startsWith('Delivery:')) {
                displayNotes = supplier.notes;
            } else {
                displayNotes = isEn 
                    ? `Delivery: ${daysFormatted || 'Daily'}. Cut-off time: ${status.cutoffFormatted} hrs.` 
                    : `Entregas: ${daysFormatted || 'Todos los días'}. Hora límite de pedido: ${status.cutoffFormatted} hrs.`;
            }

            this.container.innerHTML = `
                <div class="suppliers-subview-page" style="max-width: 1200px; margin: 0 auto; padding: 20px 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Cabecera del Proveedor (Foto Circular como Botón Atrás, Nombre, Tipo y Menú 3 puntos) -->
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; margin-top: 4px;">
                        <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
                            <!-- Foto / Logo Circular interactivo: Actúa directamente como botón Atrás sin ninguna flecha visible -->
                            <button type="button" 
                                    onclick="window.suppliersManager.backToList()" 
                                    title="${isEn ? 'Back to Suppliers' : 'Volver a Proveedores'}" 
                                    class="btn-supplier-photo-back"
                                    style="
                                        width: 54px;
                                        height: 54px;
                                        border-radius: 50%;
                                        overflow: hidden;
                                        background: transparent;
                                        border: none;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        flex-shrink: 0;
                                        cursor: pointer;
                                        padding: 0;
                                        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                                        box-shadow: 0 1px 4px rgba(0,0,0,0.08);
                                    "
                                    onmouseenter="this.style.transform='scale(1.05)'"
                                    onmouseleave="this.style.transform='scale(1)'"
                                    onmousedown="this.style.transform='scale(0.95)'"
                                    onmouseup="this.style.transform='scale(1.05)'">
                                ${supplier.image_url ? `
                                    <img src="${supplier.image_url}" alt="${supplier.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                                    <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: ${cat.color}; background: ${cat.bg};">
                                        ${supplier.name.substring(0, 2).toUpperCase()}
                                    </div>
                                ` : `
                                    <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: ${cat.color}; background: ${cat.bg};">
                                        ${supplier.name.substring(0, 2).toUpperCase()}
                                    </div>
                                `}
                            </button>

                            <div style="flex: 1; min-width: 0;">
                                <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em; line-height: 1.2;">
                                    ${supplier.name}
                                </h1>
                                <div style="margin-top: 4px;">
                                    <span style="
                                        background: #eaf2ed;
                                        color: #1e4d30;
                                        font-size: 12px;
                                        font-weight: 700;
                                        padding: 3px 10px;
                                        display: inline-flex;
                                        align-items: center;
                                        gap: 5px;
                                        border-radius: var(--radius-full);
                                    ">
                                        <span class="material-symbols-outlined" style="font-size: 14px;">${cat.icon}</span>
                                        <span>${cat.displayLabel}</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Botón de Acciones de 3 Puntos alineado con el nombre -->
                        <button type="button" 
                                class="btn-icon-m3" 
                                id="supplierDetailMoreBtn" 
                                onclick="event.stopPropagation(); window.suppliersManager.showMoreOptions('${supplier.id}', event);" 
                                title="${isEn ? 'Options' : 'Opciones'}" 
                                style="width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-main); flex-shrink: 0;">
                            <span class="material-symbols-outlined" style="font-size: 22px;">more_vert</span>
                        </button>
                    </div>

                    <!-- Línea divisoria abajo del nombre del proveedor -->
                    <hr style="border: none; border-top: 1px solid var(--border); margin: 0 0 20px 0;" />

                    <!-- Tarjeta M3 Detalles de Entrega (Aprovechamiento completo de pantalla y línea unificada de horario) -->
                    <div class="supplier-delivery-card-m3">
                        <!-- Header de la tarjeta con Próxima Entrega en la esquina superior derecha -->
                        <div class="delivery-card-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #1e7a46;">local_shipping</span>
                                <span class="delivery-card-title">
                                    ${isEn ? 'DELIVERY DETAILS' : 'DETALLES DE ENTREGA'}
                                </span>
                            </div>

                            <!-- Pill Próxima entrega en la esquina superior derecha -->
                            <div class="delivery-timing-pill next-delivery" style="padding: 4px 10px; font-size: 11.5px; margin: 0; box-shadow: 0 1px 3px rgba(30, 122, 70, 0.2);" title="${isEn ? 'Next delivery day' : 'Día de la próxima entrega'}">
                                <span class="material-symbols-outlined icon" style="font-size: 14px;">calendar_month</span>
                                <span class="timing-value">${isEn ? 'Next:' : 'Próxima entrega:'} <strong>${nextDayName}</strong></span>
                            </div>
                        </div>

                        <!-- Fila Responsive: Días de reparto -->
                        <div class="delivery-card-grid" style="margin-bottom: 12px;">
                            <!-- Bloque Días de reparto -->
                            <div class="delivery-days-block">
                                <div class="delivery-block-label">
                                    ${isEn ? 'Delivery days' : 'Días de reparto'}
                                </div>
                                <div class="delivery-days-pills">
                                    ${this.DAYS.map(d => {
                                        const isActive = activeDays.includes(d.id);
                                        return `
                                            <div class="delivery-day-dot ${isActive ? 'active' : ''}">
                                                ${d.short}
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Notas / Instrucciones -->
                        <div class="delivery-notes-block">
                            <div class="delivery-notes-label">
                                ${isEn ? 'Notes / Instructions:' : 'Notas / Instrucciones:'}
                            </div>
                            <div class="delivery-notes-content">
                                ${displayNotes}
                            </div>
                        </div>
                    </div>

                    <!-- Línea divisoria abajo de Detalles de Entrega -->
                    <hr style="border: none; border-top: 1px solid var(--border); margin: 0 0 24px 0;" />

                    <!-- Sección: Catálogo de Productos del Proveedor (Plano, sin caja y sin botón redundante) -->
                    <div style="margin: 0 0 12px 0;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="material-symbols-outlined" style="font-size: 22px; color: var(--primary-dark);">inventory_2</span>
                                <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--text-main); letter-spacing: -0.01em;">
                                    ${isEn ? 'Product Catalog' : 'Catálogo de Productos'}
                                </h2>
                                <span id="supplierProductsCountBadge" style="font-size: 12px; font-weight: 700; color: var(--primary-dark); background: var(--primary-light); padding: 2px 8px; border-radius: var(--radius-full); border: 1px solid var(--border);">${supItems.length}</span>
                            </div>
                        </div>
                        <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
                            ${isEn ? 'Products available from this supplier with packaging and rapid order quantities.' : 'Insumos disponibles de este proveedor con formato y cantidades para pedido.'}
                        </p>
                    </div>

                    <!-- Layout dinámico con Catálogo y Side Sheet M3 Expressive -->
                    <div class="supplier-catalog-layout" id="supplierCatalogLayout">
                        <div id="supplier-products-mount" class="supplier-products-main-col">
                            ${this.renderSupplierProductsListHTML(supplier.id)}
                        </div>
                        <aside class="m3-product-side-sheet" id="productSideSheet" aria-hidden="true" role="dialog" aria-labelledby="sideSheetProductName">
                        </aside>
                    </div>
                    <div class="m3-side-sheet-backdrop" id="productSideSheetBackdrop" onclick="window.suppliersManager.closeProductSideSheet()"></div>
                </div>
            `;
        }

        /**
         * Genera el HTML de la lista de productos de un proveedor (con soporte de búsqueda instantánea)
         */
        renderSupplierProductsListHTML(supplierId) {
            const isEn = this.isEnglish();
            let supItems = this.items.filter(it => it.supplier_id === supplierId);

            if (this.searchQuery && this.searchQuery.trim()) {
                const q = this.searchQuery.toLowerCase().trim();
                supItems = supItems.filter(it => {
                    const matchName = it.name && it.name.toLowerCase().includes(q);
                    const matchCat = it.category && it.category.toLowerCase().includes(q);
                    const matchUnit = (it.package_format || it.unit) && (it.package_format || it.unit).toLowerCase().includes(q);
                    const matchNotes = it.notes && it.notes.toLowerCase().includes(q);
                    return matchName || matchCat || matchUnit || matchNotes;
                });
            }

            if (supItems.length === 0) {
                if (this.searchQuery && this.searchQuery.trim()) {
                    return `
                        <div style="
                            background: transparent;
                            border: 1.5px dashed var(--border);
                            border-radius: var(--radius-lg);
                            padding: 36px 16px;
                            text-align: center;
                            margin-top: 12px;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 36px; color: var(--text-secondary); margin-bottom: 8px;">search_off</span>
                            <h4 style="margin: 0 0 6px 0; font-size: 15px; font-weight: 700; color: var(--text-main);">
                                ${isEn ? 'No products match your search' : 'No se encontraron productos que coincidan'}
                            </h4>
                            <p style="margin: 0 0 14px 0; color: var(--text-secondary); font-size: 13px;">
                                ${isEn ? `No products found with "${this.searchQuery}"` : `No hay productos con el término "${this.searchQuery}"`}
                            </p>
                            <button type="button" onclick="window.suppliersManager.clearSearch()" class="btn-primary" style="padding: 6px 18px; border-radius: var(--radius-full); font-size: 12.5px; font-weight: 700; cursor: pointer;">
                                ${isEn ? 'Clear Search' : 'Limpiar Búsqueda'}
                            </button>
                        </div>
                    `;
                }

                return `
                    <div style="
                        background: transparent;
                        border: 1.5px dashed var(--border);
                        border-radius: var(--radius-lg);
                        padding: 48px 16px;
                        text-align: center;
                        margin-top: 12px;
                    ">
                        <span class="material-symbols-outlined" style="font-size: 40px; color: var(--text-secondary); margin-bottom: 8px;">inventory_2</span>
                        <h4 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: var(--text-main);">
                            ${isEn ? 'No products registered yet' : 'Aún no hay productos registrados'}
                        </h4>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 13.5px; max-width: 400px; margin-left: auto; margin-right: auto;">
                            ${isEn ? 'Add products using the "+ New" button at the top.' : 'Agrega insumos usando el botón "+ Nuevo" en la barra superior.'}
                        </p>
                    </div>
                `;
            }

            return `
                <div class="products-list-view">
                    <!-- Filas de productos M3 Expressive limpias con menú de 3 puntos -->
                    <div class="products-list-body" style="display: flex; flex-direction: column; gap: 4px;">
                        ${supItems.map(item => this.renderProductRow(item, supplierId)).join('')}
                    </div>
                </div>
            `;
        }

        /**
         * Renderiza una fila individual de producto limpia con avatar de 48x48px,
         * título en negrita, subtítulo [Unidad] · [Categoría], y click para abrir Side Sheet M3
         */
        renderProductRow(item, supplierId) {
            const isEn = this.isEnglish();
            const isActive = this.activeSideSheetProductId === String(item.id);
            const initials = (item.name || "??").trim().substring(0, 2).toUpperCase();
            const unit = item.package_format || item.unit || "";
            const category = item.category || "";

            return `
                <div class="product-row-dropbox ${isActive ? "active-product-row" : ""}" 
                     id="product-row-${item.id}"
                     onclick="window.suppliersManager.openProductSideSheet('${item.id}')"
                     role="button"
                     tabindex="0"
                     style="cursor: pointer; ${isActive ? "background: #e8f7f0;" : ""}">
                    <!-- 1. Foto / Avatar Circular Protagónico del Producto -->
                    <div class="product-avatar-wrap" style="width: 48px; height: 48px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; position: relative;">
                        ${item.image_url ? `
                            <img src="${item.image_url}" 
                                 alt="${item.name}" 
                                 class="product-avatar-img"
                                 style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; box-shadow: 0 1px 4px rgba(0,0,0,0.12);" 
                                 loading="lazy" 
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div class="product-avatar-initials" style="display: none; width: 100%; height: 100%; border-radius: 50%; background: #e8f7f0; color: #0d7a50; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; font-family: var(--font-display);">
                                ${initials}
                            </div>
                        ` : `
                            <div class="product-avatar-initials" style="width: 100%; height: 100%; border-radius: 50%; background: #e8f7f0; color: #0d7a50; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; font-family: var(--font-display);">
                                ${initials}
                            </div>
                        `}
                    </div>

                    <!-- 2. Nombre del Producto y Formato / Categoría -->
                    <div class="col-sup-info" style="flex: 1; min-width: 0; padding-left: 6px;">
                        <span class="sup-primary-name" style="font-size: 1rem; font-weight: 700; color: #1a1c19; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-display);">${item.name}</span>
                        <div style="font-size: 12.5px; color: #5f6368; margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-family: var(--font-display);">
                            ${unit ? `<strong style="font-weight: 700; color: #1a1c19;">${unit}</strong>` : ""}
                            ${unit && category ? `<span>·</span>` : ""}
                            ${category ? `<span>${category}</span>` : ""}
                        </div>
                    </div>

                    <!-- 3. Acciones: En PC barra flotante en HOVER, en Móvil botón de 3 puntos -->
                    <div class="product-row-actions-container" style="position: relative; display: flex; align-items: center; justify-content: flex-end;" onclick="event.stopPropagation();">
                        <!-- Barra de acciones en PC (aparece al pasar el ratón) -->
                        <div class="product-hover-actions">
                            <button type="button" 
                                    class="btn-icon-m3" 
                                    title="${isEn ? "Edit Product" : "Editar Producto"}" 
                                    onclick="event.stopPropagation(); window.suppliersManager.openItemModal('${item.id}', '${item.supplier_id}')"
                                    style="width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); color: var(--text-main); cursor: pointer; transition: all 0.15s ease;">
                                <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                            </button>
                            <button type="button" 
                                    class="btn-icon-m3" 
                                    title="${isEn ? "Delete Product" : "Eliminar Producto"}" 
                                    onclick="event.stopPropagation(); window.suppliersManager.deleteItem('${item.id}')"
                                    style="width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); color: var(--error); cursor: pointer; transition: all 0.15s ease;">
                                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                            </button>
                        </div>

                        <!-- Botón de 3 puntos M3 Expressive -->
                        <button type="button" 
                                class="product-more-btn" 
                                id="product-more-btn-${item.id}"
                                onclick="event.stopPropagation(); window.suppliersManager.showProductMoreOptions('${item.id}', event);"
                                title="${isEn ? "Options" : "Opciones"}"
                                aria-label="${isEn ? "Options" : "Opciones"}"
                                aria-haspopup="true">
                            <span class="material-symbols-outlined" style="font-size: 22px;">more_vert</span>
                        </button>
                    </div>
                </div>
            `;
        }

        /**
         * M3 Modal Bottom Sheet para Productos/Insumos (.m3-modal-bottom-sheet)
         * Formato oficial nativo idéntico al Bottom Sheet de Proveedores y Recetas,
         * con arrastre táctil (swipe down to dismiss), cabecera, píldoras y acciones completas.
         */
        showProductMoreOptions(itemId, event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }

            const trigger = (event && event.currentTarget) ? event.currentTarget : ((event?.target?.closest("button")) || event?.target);

            // Toggle off si se vuelve a presionar el mismo botón
            if (this._activeProductSheetItemId === String(itemId) && (Date.now() - (this._lastProductSheetClosedTime || 0)) < 350) {
                this._activeProductSheetItemId = null;
                return;
            }

            const existingMenu = document.querySelector(".m3-modal-bottom-sheet.product-bottom-sheet, .m3-modal-bottom-sheet[data-product-id]");
            const existingBackdrop = document.getElementById("m3SheetBackdrop");
            if (existingMenu) {
                const isSame = existingMenu.dataset.productId === String(itemId);
                existingMenu.remove();
                if (existingBackdrop) existingBackdrop.remove();
                if (isSame) return;
            }
            if (existingBackdrop) existingBackdrop.remove();

            const item = this.items.find(it => String(it.id) === String(itemId));
            if (!item) return;

            const isEn = this.isEnglish();
            this._activeProductSheetItemId = String(itemId);
            this._activeContextMenuTrigger = trigger;

            if (trigger) {
                trigger.classList.add("active-menu-trigger");
            }

            const isDesktop = window.innerWidth >= 768;
            const initials = (item.name || "??").trim().substring(0, 2).toUpperCase();
            const unit = item.package_format || item.unit || "";
            const category = item.category || "";
            const hasPhoto = !!item.image_url;

            const menu = document.createElement("div");
            menu.className = "m3-modal-bottom-sheet product-bottom-sheet";
            menu.dataset.productId = String(itemId);
            if (isDesktop) {
                menu.style.maxWidth = "460px";
                menu.style.left = "50%";
                menu.style.transform = "translateX(-50%)";
            }

            const sheetHTML = `
                <div class="m3-sheet-drag-handle" title="${isEn ? "Swipe down to close" : "Desliza para cerrar"}"></div>
                <div class="m3-sheet-header" style="margin-bottom: 12px; display: flex; align-items: center; gap: 14px;">
                    <!-- Avatar o Miniatura -->
                    <div style="width: 50px; height: 50px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #e8f7f0; position: relative;">
                        ${hasPhoto ? `
                            <img src="${item.image_url}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-weight: 700; color: #0d7a50; font-size: 16px;">${initials}</div>
                        ` : `
                            <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #0d7a50; font-size: 16px;">${initials}</div>
                        `}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h4 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--text-main); line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</h4>
                        <div style="margin-top: 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            ${unit ? `
                                <span style="display: inline-flex; align-items: center; gap: 4px; background: #f3f5f4; color: #1a1c19; padding: 2px 8px; border-radius: var(--radius-full); font-weight: 700; font-size: 12px; border: 1px solid var(--border);">
                                    <span>📦</span>
                                    <span>${unit}</span>
                                </span>
                            ` : ""}
                            ${category ? `
                                <span style="display: inline-flex; align-items: center; gap: 4px; background: #e8f7f0; color: #0d7a50; padding: 2px 8px; border-radius: var(--radius-full); font-weight: 700; font-size: 12px;">
                                    <span class="material-symbols-outlined" style="font-size: 13px;">category</span>
                                    <span>${category}</span>
                                </span>
                            ` : ""}
                        </div>
                    </div>
                </div>

                <!-- Fila Horizontal de Acciones Rápidas M3 -->
                <div class="m3-sheet-quick-row" style="margin-bottom: 8px;">
                    <button type="button" class="m3-quick-pill" id="btnSheetActionPhoto">
                        <span class="material-symbols-outlined">add_a_photo</span>
                        <span>${hasPhoto ? (isEn ? "Change Photo" : "Cambiar Foto") : (isEn ? "Add Photo" : "Subir Foto")}</span>
                    </button>
                    <button type="button" class="m3-quick-pill" id="btnSheetActionPreview">
                        <span class="material-symbols-outlined">visibility</span>
                        <span>${isEn ? "Detail" : "Detalle"}</span>
                    </button>
                    <button type="button" class="m3-quick-pill" id="btnSheetActionEdit">
                        <span class="material-symbols-outlined">edit</span>
                        <span>${isEn ? "Edit" : "Editar"}</span>
                    </button>
                </div>

                <div class="context-menu-divider" style="margin: 10px 0;"></div>

                <button type="button" class="context-menu-item danger" id="btnSheetActionDeleteRow">
                    <span class="material-symbols-outlined" style="color: #dc2626;">delete</span>
                    <span>${isEn ? "Delete product" : "Eliminar insumo del catálogo"}</span>
                </button>
            `;

            menu.innerHTML = sheetHTML;

            const backdrop = document.createElement("div");
            backdrop.className = "m3-sheet-backdrop";
            backdrop.id = "m3SheetBackdrop";
            backdrop.onclick = (e) => dismiss(e);
            backdrop.addEventListener("touchstart", (e) => dismiss(e), { passive: true });
            document.body.appendChild(backdrop);
            document.body.appendChild(menu);

            const dismiss = (e) => {
                if (trigger && e && trigger.contains(e.target)) {
                    this._lastProductSheetClosedTime = Date.now();
                    this._activeProductSheetItemId = String(itemId);
                } else {
                    this._activeProductSheetItemId = null;
                }
                if (trigger) trigger.classList.remove("active-menu-trigger");
                menu.remove();
                if (backdrop) backdrop.remove();
                document.removeEventListener("keydown", onKeydown);
            };

            const onKeydown = (e) => {
                if (e.key === "Escape") dismiss(e);
            };
            document.addEventListener("keydown", onKeydown);

            // Acciones asignadas
            const triggerPhoto = () => {
                dismiss();
                let input = document.getElementById("sideSheetPhotoInput");
                if (!input) {
                    input = document.createElement("input");
                    input.id = "sideSheetPhotoInput";
                    input.type = "file";
                    input.accept = "image/*";
                    input.capture = "environment";
                    input.style.display = "none";
                    document.body.appendChild(input);
                }
                input.onchange = (ev) => this.handleSideSheetPhotoSelected(ev, itemId);
                input.click();
            };

            const triggerPreview = () => {
                dismiss();
                this.openProductSideSheet(itemId);
            };

            const triggerEdit = () => {
                dismiss();
                this.openItemModal(item.id, item.supplier_id);
            };

            const triggerDelete = () => {
                dismiss();
                this.deleteItem(item.id);
            };

            menu.querySelector("#btnSheetActionPhoto")?.addEventListener("click", triggerPhoto);
            menu.querySelector("#btnSheetActionPreview")?.addEventListener("click", triggerPreview);
            menu.querySelector("#btnSheetActionEdit")?.addEventListener("click", triggerEdit);
            menu.querySelector("#btnSheetActionDeleteRow")?.addEventListener("click", triggerDelete);

            // Gesto táctil suave para deslizar y cerrar (drag to dismiss)
            let touchStartY = 0;
            let touchDiffY = 0;
            menu.addEventListener("touchstart", (e) => {
                touchStartY = e.touches[0].clientY;
                touchDiffY = 0;
            }, { passive: true });

            menu.addEventListener("touchmove", (e) => {
                touchDiffY = e.touches[0].clientY - touchStartY;
                if (touchDiffY > 0) {
                    menu.style.transition = "none";
                    menu.style.transform = isDesktop ? `translate(-50%, ${touchDiffY}px)` : `translateY(${touchDiffY}px)`;
                }
            }, { passive: true });

            menu.addEventListener("touchend", () => {
                menu.style.transition = "transform 0.3s cubic-bezier(0.2, 0, 0, 1)";
                if (touchDiffY > 80) {
                    dismiss();
                } else {
                    menu.style.transform = isDesktop ? "translateX(-50%)" : "translateY(0)";
                }
                touchDiffY = 0;
            });
        }

        /** Cierra el Bottom Sheet del producto */
        closeProductBottomSheet() {
            const sheet = document.querySelector(".m3-modal-bottom-sheet.product-bottom-sheet, .m3-modal-bottom-sheet[data-product-id]");
            const backdrop = document.getElementById("m3SheetBackdrop");
            if (sheet) sheet.remove();
            if (backdrop) backdrop.remove();
            if (this._activeContextMenuTrigger) {
                this._activeContextMenuTrigger.classList.remove("active-menu-trigger");
                this._activeContextMenuTrigger = null;
            }
            this._activeProductSheetItemId = null;
        }

        closeM3ContextMenu() {
            return this.closeProductBottomSheet();
        }

        /**
renderItemCard(item, supplierId) {
            return this.renderProductRow(item, supplierId);
        }

        /** Retorna los productos visibles del proveedor actual (considerando filtros y búsqueda) */
        getVisibleSupplierItems() {
            let supItems = this.items.filter(it => it.supplier_id === this.selectedSupplierDetailId);
            if (this.searchQuery && this.searchQuery.trim()) {
                const q = this.searchQuery.toLowerCase().trim();
                supItems = supItems.filter(it => {
                    const matchName = it.name && it.name.toLowerCase().includes(q);
                    const matchCat = it.category && it.category.toLowerCase().includes(q);
                    const matchUnit = (it.package_format || it.unit) && (it.package_format || it.unit).toLowerCase().includes(q);
                    const matchNotes = it.notes && it.notes.toLowerCase().includes(q);
                    return matchName || matchCat || matchUnit || matchNotes;
                });
            }
            return supItems;
        }

        /** Abre el Side Sheet (Panel Lateral) de detalle y gestión de fotos del producto */
        openProductSideSheet(productId) {
            const item = this.items.find(it => String(it.id) === String(productId));
            if (!item) return;

            this.activeSideSheetProductId = String(productId);
            this._isPhotoZoomed = false;

            let sheet = document.getElementById("productSideSheet");
            let backdrop = document.getElementById("productSideSheetBackdrop");
            const layout = document.getElementById("supplierCatalogLayout");

            if (!sheet) {
                sheet = document.createElement("aside");
                sheet.id = "productSideSheet";
                sheet.className = "m3-product-side-sheet";
                sheet.setAttribute("role", "dialog");
                sheet.setAttribute("aria-labelledby", "sideSheetProductName");
                if (layout) {
                    layout.appendChild(sheet);
                } else if (this.container) {
                    this.container.appendChild(sheet);
                }
            }

            if (!backdrop) {
                backdrop = document.createElement("div");
                backdrop.id = "productSideSheetBackdrop";
                backdrop.className = "m3-side-sheet-backdrop";
                backdrop.onclick = () => this.closeProductSideSheet();
                document.body.appendChild(backdrop);
            }

            this.renderSideSheetContent(productId);
            this.highlightActiveProductRow(productId);
            document.body.classList.add("product-side-sheet-open");
            this.updateFabVisibility();

            sheet.classList.add("active");
            sheet.setAttribute("aria-hidden", "false");
            if (layout) layout.classList.add("side-sheet-open");
            if (backdrop) backdrop.classList.add("active");

            const row = document.getElementById(`product-row-${productId}`);
            if (row && typeof row.scrollIntoView === "function") {
                row.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }

            if (!this._sideSheetKeyboardBound) {
                this._sideSheetKeyboardBound = true;
                document.addEventListener("keydown", (e) => {
                    if (!this.activeSideSheetProductId) return;
                    if (e.key === "Escape") {
                        this.closeProductSideSheet();
                    } else if (e.key === "ArrowLeft") {
                        this.navigateProductSideSheet(-1);
                    } else if (e.key === "ArrowRight") {
                        this.navigateProductSideSheet(1);
                    }
                });
            }
        }

        /** Cierra el Side Sheet y limpia la fila activa */
        closeProductSideSheet() {
            this.activeSideSheetProductId = null;
            this._isPhotoZoomed = false;
            document.body.classList.remove("product-side-sheet-open");
            this.updateFabVisibility();

            const sheet = document.getElementById("productSideSheet");
            const backdrop = document.getElementById("productSideSheetBackdrop");
            const layout = document.getElementById("supplierCatalogLayout");

            if (sheet) {
                sheet.classList.remove("active");
                sheet.setAttribute("aria-hidden", "true");
            }
            if (backdrop) {
                backdrop.classList.remove("active");
            }
            if (layout) {
                layout.classList.remove("side-sheet-open");
            }

            document.querySelectorAll(".product-row-dropbox.active-product-row").forEach(r => {
                r.classList.remove("active-product-row");
                r.style.background = "";
            });
        }

        /** Navega al producto anterior (-1) o siguiente (1) */
        navigateProductSideSheet(direction) {
            const list = this.getVisibleSupplierItems();
            if (!list || list.length === 0) return;
            const currentIndex = list.findIndex(it => String(it.id) === String(this.activeSideSheetProductId));
            if (currentIndex === -1) {
                this.openProductSideSheet(list[0].id);
                return;
            }
            const nextIndex = (currentIndex + direction + list.length) % list.length;
            this.openProductSideSheet(list[nextIndex].id);
        }

        /** Alterna zoom interactivo 1.6x en la fotografía */
        togglePhotoZoom() {
            const img = document.getElementById("sideSheetHeroImg");
            const badgeText = document.getElementById("zoomBadgeText");
            if (!img) return;

            this._isPhotoZoomed = !this._isPhotoZoomed;
            if (this._isPhotoZoomed) {
                img.classList.add("zoomed");
                img.style.cursor = "zoom-out";
                if (badgeText) badgeText.textContent = this.isEnglish() ? "Tap to reset" : "Toca para alejar";
            } else {
                img.classList.remove("zoomed");
                img.style.cursor = "zoom-in";
                if (badgeText) badgeText.textContent = this.isEnglish() ? "Tap to zoom" : "Toca para zoom";
            }
        }

        /** Renderiza el contenido interno del Side Sheet M3 */
        renderSideSheetContent(productId) {
            const isEn = this.isEnglish();
            const item = this.items.find(it => String(it.id) === String(productId));
            if (!item) return;

            const visibleItems = this.getVisibleSupplierItems();
            const currentIndex = visibleItems.findIndex(it => String(it.id) === String(productId));
            const totalItems = visibleItems.length || 1;
            const positionText = currentIndex !== -1 ? `${currentIndex + 1} / ${totalItems}` : `1 / ${totalItems}`;

            const initials = (item.name || "??").trim().substring(0, 2).toUpperCase();
            const unit = item.package_format || item.unit || "";
            const category = item.category || "";
            const currentCart = this.orderCart[item.supplier_id] || {};
            let currentQty = currentCart[item.id] || 0;

            const sheet = document.getElementById("productSideSheet");
            if (!sheet) return;

            sheet.innerHTML = `
                <!-- 1. Header del Side Sheet -->
                <div class="side-sheet-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: #ffffff; z-index: 10;">
                    <!-- Navegación: Flecha Izquierda + Nombre del Producto + Flecha Derecha -->
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                        <button type="button" 
                                class="btn-icon-m3 tonal" 
                                title="${isEn ? "Previous item" : "Insumo anterior"}"
                                onclick="window.suppliersManager.navigateProductSideSheet(-1)"
                                style="width: 34px; height: 34px; border-radius: 50%; background: #e8f7f0; color: #0d7a50; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: transform 0.15s ease;">
                            <span class="material-symbols-outlined" style="font-size: 20px;">chevron_left</span>
                        </button>
                        <div style="min-width: 0; flex: 1; text-align: center;">
                            <div id="sideSheetProductName" class="side-sheet-header-title" style="margin: 0; font-size: 15.5px; font-weight: 700; color: #1a1c19; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-display); line-height: 1.25;" title="${item.name}">
                                ${item.name}
                            </div>
                            ${positionText ? `
                                <div style="font-size: 11.5px; font-weight: 600; color: #5f6368; margin-top: 1px;">
                                    ${positionText}
                                </div>
                            ` : ""}
                        </div>
                        <button type="button" 
                                class="btn-icon-m3 tonal" 
                                title="${isEn ? "Next item" : "Insumo siguiente"}"
                                onclick="window.suppliersManager.navigateProductSideSheet(1)"
                                style="width: 34px; height: 34px; border-radius: 50%; background: #e8f7f0; color: #0d7a50; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: transform 0.15s ease;">
                            <span class="material-symbols-outlined" style="font-size: 20px;">chevron_right</span>
                        </button>
                    </div>

                    <!-- Botón Cerrar Panel -->
                    <button type="button" 
                            class="btn-icon-m3 close" 
                            title="${isEn ? "Close panel" : "Cerrar panel"}"
                            onclick="window.suppliersManager.closeProductSideSheet()"
                            style="width: 34px; height: 34px; border-radius: 50%; background: #f3f5f4; color: #1a1c19; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; margin-left: 4px; transition: transform 0.15s ease;">
                        <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
                    </button>
                </div>

                <!-- 2. Cuerpo del Side Sheet: Hero Image y Metadatos -->
                <div class="side-sheet-body" style="padding: 20px; display: flex; flex-direction: column; flex: 1;">
                    <!-- Input oculto para subida de fotos del producto -->
                    <input type="file" 
                           id="sideSheetPhotoInput" 
                           accept="image/*" 
                           capture="environment" 
                           style="display: none;" 
                           onchange="window.suppliersManager.handleSideSheetPhotoSelected(event, '${item.id}')" />

                    <!-- Contenedor Hero 1:1 -->
                    <div class="side-sheet-hero-wrap" id="sideSheetHeroContainer">
                        ${item.image_url ? `
                            <img src="${item.image_url}" 
                                 id="sideSheetHeroImg" 
                                 class="side-sheet-hero-img"
                                 alt="${item.name}" />
                            <!-- Botón Cambiar / Subir foto sobre la imagen -->
                            <button type="button" 
                                    class="photo-upload-badge-btn" 
                                    onclick="event.stopPropagation(); document.getElementById('sideSheetPhotoInput').click()" 
                                    style="position: absolute; bottom: 12px; left: 12px; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.25); font-size: 11.5px; font-weight: 600; padding: 5px 13px; border-radius: 999px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); user-select: none; z-index: 4; transition: transform 0.15s ease, background 0.15s ease;">
                                <span class="material-symbols-outlined" style="font-size: 15px;">photo_camera</span>
                                <span>${isEn ? "Change photo" : "Cambiar foto"}</span>
                            </button>
                        ` : `
                            <div class="side-sheet-empty-photo" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; width: 100%;">
                                <div style="width: 80px; height: 80px; border-radius: 50%; background: #e8f7f0; color: #0d7a50; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(20, 184, 122, 0.15);">
                                    ${initials}
                                </div>
                                <div style="font-size: 14px; font-weight: 600; color: #5f6368; margin-bottom: 12px;">
                                    ${isEn ? "No photo assigned" : "Sin fotografía asignada"}
                                </div>
                                <button type="button" 
                                        onclick="document.getElementById('sideSheetPhotoInput').click()" 
                                        style="background: #e8f7f0; color: #0d7a50; border: 1px solid rgba(20, 184, 122, 0.3); border-radius: 999px; padding: 8px 18px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: transform 0.15s ease;">
                                    <span class="material-symbols-outlined" style="font-size: 17px;">add_a_photo</span>
                                    ${isEn ? "Add photo" : "Agregar foto"}
                                </button>
                            </div>
                        `}
                        <!-- Spinner durante subida -->
                        <div id="sideSheetUploadOverlay" style="display: none; position: absolute; inset: 0; background: rgba(255,255,255,0.88); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); align-items: center; justify-content: center; flex-direction: column; gap: 10px; z-index: 5;">
                            <div class="spinner-sm" style="width: 28px; height: 28px; border: 3px solid #e8f7f0; border-top-color: #14b87a; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                            <span style="font-size: 12.5px; font-weight: 700; color: #0d7a50;">${isEn ? "Uploading photo..." : "Subiendo foto..."}</span>
                        </div>
                    </div>

                    <!-- Metadatos y Chips M3 -->
                    <div style="margin-top: 18px;">

                        <!-- Chips M3 Expressive -->
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;">
                            ${unit ? `
                                <div class="m3-meta-chip" style="display: inline-flex; align-items: center; gap: 6px; background: #f3f5f4; color: #1a1c19; padding: 6px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; border: 1px solid var(--border);">
                                    <span>📦</span>
                                    <span>${isEn ? "Unit:" : "Unidad:"} <strong style="font-weight: 700;">${unit}</strong></span>
                                </div>
                            ` : ""}
                            ${category ? `
                                <div class="m3-meta-chip" style="display: inline-flex; align-items: center; gap: 6px; background: #f3f5f4; color: #1a1c19; padding: 6px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; border: 1px solid var(--border);">
                                    <span>🏷️</span>
                                    <span>${category}</span>
                                </div>
                            ` : ""}
                        </div>

                        <!-- Tarjeta interactiva: Agregar a la lista de órdenes (Side Sheet) -->
                        <div class="m3-sheet-order-action-card" style="
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            padding: 12px 16px;
                            background: var(--surface-container-low, var(--bg));
                            border: 1.5px solid var(--border);
                            border-radius: var(--radius-lg);
                            margin-bottom: 12px;
                            gap: 12px;
                        ">
                            <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                                <span class="material-symbols-outlined" style="color: var(--primary-dark); font-size: 26px; flex-shrink: 0;">add_shopping_cart</span>
                                <div style="min-width: 0;">
                                    <div style="font-weight: 700; font-size: 14px; color: var(--text-main); line-height: 1.2;">
                                        ${isEn ? "Add to Order" : "Agregar a la orden"}
                                    </div>
                                    <div id="sideSheetOrderQtySubtitle" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                                        ${currentQty > 0 ? (isEn ? `${currentQty} in current order` : `${currentQty} en la orden actual`) : (isEn ? "Tap + to add" : "Toca + para agregar")}
                                    </div>
                                </div>
                            </div>

                            <!-- Stepper interactivo directo -->
                            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                                <button type="button" 
                                        id="btnSideSheetOrderMinus" 
                                        title="${isEn ? 'Decrease' : 'Disminuir'}"
                                        style="width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--text-main); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s ease; ${currentQty === 0 ? 'opacity: 0.35; pointer-events: none;' : ''}">
                                    <span class="material-symbols-outlined" style="font-size: 18px;">remove</span>
                                </button>
                                <span id="sideSheetOrderQtyValue" style="min-width: 24px; text-align: center; font-weight: 800; font-size: 15px; color: ${currentQty > 0 ? 'var(--primary-dark)' : 'var(--text-main)'}; font-family: var(--font-display);">
                                    ${currentQty}
                                </span>
                                <button type="button" 
                                        id="btnSideSheetOrderPlus" 
                                        title="${isEn ? 'Increase' : 'Aumentar'}"
                                        style="width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid var(--primary-dark); background: var(--primary-light); color: var(--primary-dark); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; transition: transform 0.1s ease;"
                                        onmousedown="this.style.transform='scale(0.92)'"
                                        onmouseup="this.style.transform='scale(1)'">
                                    <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
                                </button>
                            </div>
                        </div>

                        <!-- Botón de acceso directo a crear orden / ver pedido de este proveedor -->
                        <button type="button" class="context-menu-item" id="btnSideSheetGoToOrder" style="padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; width: 100%; border: 1px solid var(--border); background: var(--surface); cursor: pointer; border-radius: var(--radius-md); font-family: var(--font-display); transition: background 0.15s ease;">
                            <span class="material-symbols-outlined" style="color: var(--primary-dark); font-size: 20px;">shopping_cart_checkout</span>
                            <span style="flex: 1; text-align: left; font-weight: 600; font-size: 13.5px; color: var(--text-main);">${isEn ? "Go to order list" : "Ir a la lista de órdenes"}</span>
                            <span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-secondary);">chevron_right</span>
                        </button>

                        ${item.notes ? `
                            <div style="background: #f8faf9; border: 1px solid var(--border); border-radius: 16px; padding: 12px 14px; font-size: 13px; color: #5f6368; line-height: 1.45;">
                                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #0d7a50; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                                    <span class="material-symbols-outlined" style="font-size: 14px;">description</span>
                                    ${isEn ? "Notes" : "Notas"}
                                </div>
                                ${item.notes}
                            </div>
                        ` : ""}
                    </div>
                </div>


            `;

            // Eventos del bloque interactivo de agregar a la orden en el Side Sheet
            const orderPlusBtn = sheet.querySelector("#btnSideSheetOrderPlus");
            const orderMinusBtn = sheet.querySelector("#btnSideSheetOrderMinus");
            const orderQtyVal = sheet.querySelector("#sideSheetOrderQtyValue");
            const orderQtySubtitle = sheet.querySelector("#sideSheetOrderQtySubtitle");
            const goToOrderBtn = sheet.querySelector("#btnSideSheetGoToOrder");

            const updateSideSheetOrderQtyDisplay = (qty) => {
                if (orderQtyVal) {
                    orderQtyVal.textContent = qty;
                    orderQtyVal.style.color = qty > 0 ? "var(--primary-dark)" : "var(--text-main)";
                }
                if (orderQtySubtitle) {
                    orderQtySubtitle.textContent = qty > 0 
                        ? (isEn ? `${qty} in current order` : `${qty} en la orden actual`) 
                        : (isEn ? "Tap + to add" : "Toca + para agregar");
                }
                if (orderMinusBtn) {
                    if (qty === 0) {
                        orderMinusBtn.style.opacity = "0.35";
                        orderMinusBtn.style.pointerEvents = "none";
                    } else {
                        orderMinusBtn.style.opacity = "1";
                        orderMinusBtn.style.pointerEvents = "auto";
                    }
                }
            };

            if (orderPlusBtn) {
                orderPlusBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const supId = item.supplier_id;
                    if (!this.orderCart[supId]) this.orderCart[supId] = {};
                    const newQty = (this.orderCart[supId][item.id] || 0) + 1;
                    this.orderCart[supId][item.id] = newQty;
                    this.saveCache();
                    updateSideSheetOrderQtyDisplay(newQty);
                    this.notify(isEn ? `Added 1x ${item.name} to order (${newQty})` : `Agregado 1x ${item.name} a la orden (${newQty})`, 'success');
                    if (typeof this.updateOrderBadgesAndChips === 'function') {
                        this.updateOrderBadgesAndChips(supId);
                    }
                });
            }

            if (orderMinusBtn) {
                orderMinusBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const supId = item.supplier_id;
                    if (!this.orderCart[supId]) return;
                    const current = this.orderCart[supId][item.id] || 0;
                    if (current <= 1) {
                        delete this.orderCart[supId][item.id];
                        this.saveCache();
                        updateSideSheetOrderQtyDisplay(0);
                        this.notify(isEn ? `Removed ${item.name} from order` : `${item.name} removido de la orden`, 'info');
                    } else {
                        const newQty = current - 1;
                        this.orderCart[supId][item.id] = newQty;
                        this.saveCache();
                        updateSideSheetOrderQtyDisplay(newQty);
                        this.notify(isEn ? `Order: ${newQty}x ${item.name}` : `En orden: ${newQty}x ${item.name}`, 'info');
                    }
                    if (typeof this.updateOrderBadgesAndChips === 'function') {
                        this.updateOrderBadgesAndChips(supId);
                    }
                });
            }

            if (goToOrderBtn) {
                goToOrderBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.closeProductSideSheet();
                    this.openOrderForm(item.supplier_id);
                });
            }
        }

        /** Resalta la fila activa del producto en el catálogo */
        highlightActiveProductRow(itemId) {
            document.querySelectorAll(".product-row-dropbox").forEach(r => {
                r.classList.remove("active-product-row");
                r.style.background = "";
            });
            const activeRow = document.getElementById(`product-row-${itemId}`);
            if (activeRow) {
                activeRow.classList.add("active-product-row");
                activeRow.style.background = "#e8f7f0";
            }
        }

        /** Actualiza inmediatamente la miniatura y avatar de una fila en el DOM */
        updateProductRowInDOM(itemId) {
            const row = document.getElementById(`product-row-${itemId}`);
            if (!row) return;
            const item = this.items.find(it => String(it.id) === String(itemId));
            if (!item) return;

            const avatarWrap = row.querySelector(".product-avatar-wrap");
            if (!avatarWrap) return;

            const isEn = this.isEnglish();
            const initials = (item.name || "??").trim().substring(0, 2).toUpperCase();

            if (item.image_url) {
                avatarWrap.innerHTML = `
                    <img src="${item.image_url}" 
                         alt="${item.name}" 
                         class="product-avatar-img"
                         style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; box-shadow: 0 1px 4px rgba(0,0,0,0.12);" 
                         loading="lazy" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                    <div class="product-avatar-initials" style="display: none; width: 100%; height: 100%; border-radius: 50%; background: #e8f7f0; color: #0d7a50; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; font-family: var(--font-display);">
                        ${initials}
                    </div>
                `;
            } else {
                avatarWrap.innerHTML = `
                    <div class="product-avatar-initials" style="width: 100%; height: 100%; border-radius: 50%; background: #e8f7f0; color: #0d7a50; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; font-family: var(--font-display);">
                        ${initials}
                    </div>
                `;
            }
        }

        /** Manejador de selección y carga de foto para el producto */
        async handleSideSheetPhotoSelected(event, itemId) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;

            const overlay = document.getElementById("sideSheetUploadOverlay");
            if (overlay) overlay.style.display = "flex";

            const isEn = this.isEnglish();
            let publicUrl = null;

            try {
                const ext = file.name ? file.name.split(".").pop() : "jpg";
                const cleanExt = (ext.length > 5 || !/^[a-zA-Z0-9]+$/.test(ext)) ? "jpg" : ext;
                const fileName = `item-${itemId}-${Date.now()}.${cleanExt}`;
                const filePath = `supplier-items/${fileName}`;

                if (window.supabaseClient) {
                    const sb = window.supabaseClient;
                    const { error: upErr } = await sb.storage.from("menu-files").upload(filePath, file, { upsert: true });
                    if (!upErr) {
                        const { data } = sb.storage.from("menu-files").getPublicUrl(filePath);
                        if (data?.publicUrl) publicUrl = data.publicUrl;
                    } else {
                        console.warn("Storage upload notice, falling back to local reader:", upErr);
                    }
                }

                if (!publicUrl) {
                    publicUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.readAsDataURL(file);
                    });
                }

                if (window.supabaseClient && !publicUrl.startsWith("data:")) {
                    try {
                        await window.supabaseClient
                            .from("supplier_items")
                            .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
                            .eq("id", itemId);
                    } catch (dbErr) {
                        console.warn("DB update notice:", dbErr);
                    }
                }

                const item = this.items.find(it => String(it.id) === String(itemId));
                if (item) {
                    item.image_url = publicUrl;
                }
                this.saveCache();

                this.renderSideSheetContent(itemId);
                this.updateProductRowInDOM(itemId);

                this.notify(isEn ? "Photo updated successfully" : "Fotografía actualizada con éxito", "success");
            } catch (err) {
                console.error("Error procesando foto:", err);
                this.notify(err.message || "Error procesando foto", "error");
            } finally {
                if (overlay) overlay.style.display = "none";
                event.target.value = "";
            }
        }

        /** Manejador de búsqueda sincronizado con el buscador global */
        handleSearch(val) {
            this.searchQuery = val ? val.trim() : '';

            // Si estamos en la vista de detalle del proveedor:
            if (this.currentSubView === 'supplier-detail' && this.selectedSupplierDetailId) {
                const mount = document.getElementById('supplier-products-mount');
                if (mount) {
                    mount.innerHTML = this.renderSupplierProductsListHTML(this.selectedSupplierDetailId);
                } else {
                    this.render();
                }
                return;
            }

            // Si estamos en el listado general de proveedores:
            this.renderContent();
        }

        /** Limpia la búsqueda global */
        clearSearch() {
            this.searchQuery = '';
            const searchInput = document.getElementById('searchInput');
            const clearBtn = document.getElementById('clearSearch');
            if (searchInput) searchInput.value = '';
            if (clearBtn) clearBtn.classList.add('hidden');

            if (this.currentSubView === 'supplier-detail' && this.selectedSupplierDetailId) {
                const mount = document.getElementById('supplier-products-mount');
                if (mount) {
                    mount.innerHTML = this.renderSupplierProductsListHTML(this.selectedSupplierDetailId);
                } else {
                    this.render();
                }
                return;
            }

            this.renderContent();
        }

        /** Establece filtro */
        setFilter(filter) {
            this.activeFilter = filter;
            const container = document.getElementById('suppliersView');
            if (container) this.render(container);
        }

        /** Modifica cantidad de pedido de un producto */
        updateOrderQty(supplierId, itemId, delta) {
            if (!this.orderCart[supplierId]) this.orderCart[supplierId] = {};
            const current = this.orderCart[supplierId][itemId] || 0;
            const next = Math.max(0, current + delta);
            if (next === 0) {
                delete this.orderCart[supplierId][itemId];
            } else {
                this.orderCart[supplierId][itemId] = next;
            }
            this.saveCache();

            // Actualizar input del stepper Dropbox si existe
            const inputEl = document.getElementById(`item-qty-input-${supplierId}-${itemId}`);
            if (inputEl) {
                inputEl.value = next;
                if (next > 0) {
                    inputEl.classList.add('has-qty');
                } else {
                    inputEl.classList.remove('has-qty');
                }
            }

            // Actualizar etiqueta del contador si existe
            const qtyEl = document.getElementById(`item-qty-${supplierId}-${itemId}`);
            if (qtyEl) {
                qtyEl.textContent = next;
                qtyEl.style.color = next > 0 ? 'var(--primary-dark)' : 'var(--text-main)';
            }

            // Actualizar botón de la orden en la tarjeta
            const card = document.getElementById(`supplier-card-${supplierId}`);
            if (card) {
                const cartItems = this.orderCart[supplierId] || {};
                const cartCount = Object.values(cartItems).reduce((acc, qty) => acc + (qty > 0 ? 1 : 0), 0);
                const orderBtn = card.querySelector(`button[onclick*="openOrderModal('${supplierId}')"]`);
                if (orderBtn) {
                    const isEn = this.isEnglish();
                    orderBtn.innerHTML = `
                        <span class="material-symbols-outlined" style="font-size: 18px;">shopping_cart_checkout</span>
                        <span>${isEn ? 'Create Order' : 'Armar Pedido'} ${cartCount > 0 ? `(${cartCount})` : ''}</span>
                    `;
                    orderBtn.style.background = cartCount > 0 ? 'var(--primary)' : 'var(--secondary-light)';
                    orderBtn.style.color = cartCount > 0 ? 'var(--on-primary)' : 'var(--on-secondary)';
                }
            }

            // Si el modal de la orden está abierto, actualizar su vista
            const orderList = document.getElementById('order-modal-items-list');
            if (orderList) {
                this.renderOrderModalItems(supplierId);
            this.updateOrderBadgesAndChips(supplierId);
            }
        }

        // ==========================================
        // SUBVISTAS DE PÁGINA COMPLETA: Proveedor, Producto y Orden
        // (Adaptado al sistema como recipe-form, sin modales flotantes)
        // ==========================================

        /**
         * Controla la visibilidad del botón flotante (+ FAB) en la vista de proveedores.
         * Si estamos editando o creando un proveedor, producto u orden, se oculta completamente.
         */
        updateFabVisibility() {
            const fab = document.getElementById('mainFabBtn') || document.querySelector('.fab-m3');
            const fabContainer = document.getElementById('m3FabMenuContainer');
            const isSideSheetOpen = !!this.activeSideSheetProductId || document.body.classList.contains("product-side-sheet-open");
            const isEditingOrForm = (this.currentSubView === 'supplier-form' || this.currentSubView === 'item-form' || this.currentSubView === 'order-form' || isSideSheetOpen);

            if (isEditingOrForm) {
                if (window.dashboard?.closeFabMenu) window.dashboard.closeFabMenu();
                if (fab) {
                    fab.classList.add('hidden');
                    fab.style.setProperty('display', 'none', 'important');
                }
                if (fabContainer) {
                    fabContainer.classList.add('hidden');
                    fabContainer.style.setProperty('display', 'none', 'important');
                }
            } else {
                const currentView = document.documentElement.getAttribute('data-current-view') || window.dashboard?.currentView;
                if (currentView === 'suppliers') {
                    if (fab) {
                        fab.classList.remove('hidden');
                        fab.style.removeProperty('display');
                    }
                    if (fabContainer) {
                        fabContainer.classList.remove('hidden');
                        fabContainer.style.removeProperty('display');
                    }
                }
            }
        }

        /** Navega a la vista de formulario de proveedor (Crear o Editar) */
        openSupplierForm(supplierId = null) {
            if (window.dashboard && window.dashboard.currentView !== 'suppliers') {
                window.dashboard.switchView('suppliers');
            }
            this.editingSupplierId = supplierId;
            this.currentSubView = 'supplier-form';
            this.render();
        }

        /** Navega a la vista de formulario de producto (Crear o Editar con foto) */
        openItemForm(itemId = null, preselectedSupplierId = null) {
            if (window.dashboard && window.dashboard.currentView !== 'suppliers') {
                window.dashboard.switchView('suppliers');
            }
            this.editingItemId = itemId;
            this.preselectedSupplierId = preselectedSupplierId;
            this.currentSubView = 'item-form';
            this.render();
        }

        /** Navega a la vista dedicada para armar pedido rápido */
                /** Inicia el flujo de hacer órdenes / armar pedidos */
        startMakingOrders() {
            const supplierWithOrder = Object.keys(this.orderCart || {}).find(supId => {
                return Object.values(this.orderCart[supId] || {}).some(q => Number(q) > 0);
            });
            const targetSupplierId = supplierWithOrder || this.selectedSupplierDetailId || this.activeOrderSupplierId || (this.suppliers && this.suppliers[0]?.id);
            if (targetSupplierId) {
                this.openOrderForm(targetSupplierId);
            } else {
                if (window.toast) window.toast.show(this.isEnglish() ? 'Please add a supplier first' : 'Por favor agrega un proveedor primero', 'info');
            }
        }

openOrderForm(supplierId) {
            this.activeOrderSupplierId = supplierId;
            this.currentSubView = 'order-form';
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('view', 'suppliers');
                url.searchParams.set('order', supplierId);
                window.history.replaceState({}, '', url);
            } catch (e) {}
            this.render();
        }

        /** Cambia de proveedor activo dentro del flujo de pedido sin perder las cantidades seleccionadas */
        switchOrderSupplier(supplierId) {
            this.activeOrderSupplierId = supplierId;
            this.currentSubView = 'order-form';
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('view', 'suppliers');
                url.searchParams.set('order', supplierId);
                window.history.replaceState({}, '', url);
            } catch (e) {}
            this.renderOrderPage();
        }

        /** Regresa a la vista previa de proveedores o detalle */
        backToList() {
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('order');
                url.searchParams.delete('subview');
                window.history.replaceState({}, '', url);
            } catch (e) {}
            document.body.classList.remove('supplier-subview-item-active');
            if (this.currentSubView === 'item-form' && this.selectedSupplierDetailId) {
                this.editingItemId = null;
                this.currentSubView = 'supplier-detail';
                this.updateFabVisibility();
                this.render();
                return;
            }

            this.currentSubView = 'list';
            this.selectedSupplierDetailId = null;
            this.editingSupplierId = null;
            this.editingItemId = null;
            this.activeOrderSupplierId = null;
            this.updateFabVisibility();
            // Limpiar el parámetro de detalle de la URL para que F5 no reabra el proveedor
            try {
                const url = new URL(window.location.href);
                if (url.searchParams.has('supplier')) {
                    url.searchParams.delete('supplier');
                    history.replaceState({ view: 'suppliers' }, '', url.toString());
                }
            } catch (e) { /* ignore */ }
            this.render();
        }

        /** Alterna selección de chip de día de reparto */
        toggleDayChip(btn) {
            btn.classList.toggle('active');
            const isActive = btn.classList.contains('active');
            btn.style.borderColor = isActive ? 'var(--primary-dark)' : 'var(--border)';
            btn.style.background = isActive ? 'var(--primary-light)' : 'var(--bg)';
            btn.style.color = isActive ? 'var(--primary-dark)' : 'var(--text-secondary)';
        }

        // Aliases para compatibilidad hacia atrás
        openSupplierModal(supplierId = null) { return this.openSupplierForm(supplierId); }
        openItemModal(itemId = null, preselectedSupplierId = null) { return this.openItemForm(itemId, preselectedSupplierId); }
        openOrderModal(supplierId) { return this.openOrderForm(supplierId); }
        closeModal() { return this.backToList(); }
        ensureModals() {}

        /**
         * Renderiza la página completa para Nuevo / Editar Proveedor (con Fotografía y Tipo)
         */
        renderSupplierFormPage() {
            if (!this.container) return;
            const isEn = this.isEnglish();
            const supplierId = this.editingSupplierId;
            const supplier = supplierId ? this.suppliers.find(s => s.id === supplierId) : null;
            const isEditing = Boolean(supplier);

            const activeDays = supplier && Array.isArray(supplier.delivery_days) ? supplier.delivery_days : ['mon', 'wed', 'fri'];
            const cutoff = supplier?.cutoff_time ? supplier.cutoff_time.substring(0, 5) : '18:00';
            const supCategory = supplier?.category || 'otros';

            this.container.innerHTML = `
                <div class="suppliers-subview-page" style="max-width: 760px; margin: 0 auto; padding: 0 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Header en PC / Desktop: Título + Subtítulo con flujo natural M3 y salto de línea claro -->
                    <div class="supplier-form-desktop-header" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
                        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em; line-height: 1.2;">
                            ${isEditing ? (isEn ? 'Edit Supplier' : 'Editar Proveedor') : (isEn ? 'New Supplier' : 'Nuevo Proveedor')}
                        </h2>
                        <p style="margin: 0; font-size: 13.5px; color: var(--text-secondary); line-height: 1.4;">
                            ${isEn ? 'Configure logo, category, delivery schedule and cut-off' : 'Configura logo, tipo, días de reparto y horario de corte'}
                        </p>
                    </div>

                    <!-- Header Integrado Móvil (Reemplaza la barra superior en móvil) -->
                    <header class="supplier-item-form-header">
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                            <button type="button" 
                                    onclick="window.suppliersManager.backToList()" 
                                    class="btn-icon-m3 btn-back-green" 
                                    title="${isEn ? 'Back to Suppliers' : 'Volver a Proveedores'}" 
                                    style="width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--primary-dark); transition: all 0.2s var(--m3-easing); flex-shrink: 0;">
                                <span class="material-symbols-outlined" style="font-size: 22px; color: var(--primary-dark);">arrow_back</span>
                            </button>
                            <div style="min-width: 0; flex: 1;">
                                <h1 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--text-main); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">
                                    ${isEditing ? (isEn ? 'Edit Supplier' : 'Editar Proveedor') : (isEn ? 'New Supplier' : 'Nuevo Proveedor')}
                                </h1>
                                <p style="margin: 1px 0 0 0; font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">
                                    ${isEn ? 'Configure logo, category, delivery schedule and cut-off' : 'Configura logo, tipo, días de reparto y horario de corte'}
                                </p>
                            </div>
                        </div>
                    </header>

                    <!-- Formulario Plano y Adaptable a Móvil (Sin tarjeta ni contenedor restrictivo) -->
                    <form id="supplierFullForm" onsubmit="window.suppliersManager.saveSupplier(event, '${supplierId || ''}')" style="display: flex; flex-direction: column; gap: 20px;">
                        
                        <!-- 1. Fotografía / Logo del Proveedor (Plano) -->
                        <div style="padding-bottom: 18px; border-bottom: 1px solid var(--border);">
                            <label style="display: block; font-size: 13.5px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
                                ${isEn ? 'Supplier Photo / Logo (Optional)' : 'Foto o Logo del Proveedor (Opcional)'}
                            </label>
                            <p style="margin: 0 0 12px 0; font-size: 12.5px; color: var(--text-secondary);">
                                ${isEn ? 'Appears in the suppliers list and header banner.' : 'Aparece en la lista de proveedores y en la cabecera.'}
                            </p>

                            <div style="display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap;">
                                <div style="
                                    width: 68px;
                                    height: 68px;
                                    border-radius: 14px;
                                    background: var(--bg);
                                    border: 2px dashed var(--border);
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    overflow: hidden;
                                    position: relative;
                                    flex-shrink: 0;
                                ">
                                    <img id="supPhotoImg" src="${supplier?.image_url || ''}" alt="Preview" style="${supplier?.image_url ? 'display: block;' : 'display: none;'} width: 100%; height: 100%; object-fit: cover;" />
                                    <span id="supPhotoIcon" class="material-symbols-outlined" style="${supplier?.image_url ? 'display: none;' : 'display: block;'} font-size: 30px; color: var(--text-secondary);">storefront</span>
                                </div>

                                <div style="display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 220px;">
                                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                        <label class="btn-supplier-cancel" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; height: 36px; padding: 0 14px;">
                                            <span class="material-symbols-outlined" style="font-size: 17px;">upload_file</span>
                                            <span>${isEn ? 'Choose Photo' : 'Subir Foto'}</span>
                                            <input type="file" id="supPhotoFile" accept="image/*" style="display: none;" onchange="window.suppliersManager.handleSupplierPhotoSelected(this)" />
                                        </label>

                                        <label class="btn-supplier-cancel" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; height: 36px; padding: 0 14px;">
                                            <span class="material-symbols-outlined" style="font-size: 17px;">photo_camera</span>
                                            <span>${isEn ? 'Take Photo' : 'Tomar Foto'}</span>
                                            <input type="file" accept="image/*" capture="environment" style="display: none;" onchange="window.suppliersManager.handleSupplierPhotoSelected(this)" />
                                        </label>

                                        <button type="button" id="btnRemoveSupPhoto" onclick="window.suppliersManager.removeSupplierPhoto()" style="${supplier?.image_url ? 'display: inline-flex;' : 'display: none;'} align-items: center; gap: 4px; height: 36px; padding: 0 12px; border-radius: var(--radius-full); font-size: 12.5px; font-weight: 700; background: var(--surface); color: var(--error); border: 1px solid var(--border); cursor: pointer;">
                                            <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                                            <span>${isEn ? 'Remove' : 'Quitar'}</span>
                                        </button>
                                    </div>

                                    <div class="m3-field-container" style="margin-top: 6px;">
                                        <input type="text" id="supImageUrl" value="${supplier?.image_url || ''}" placeholder=" " class="m3-field-input" oninput="document.getElementById('supPhotoImg').src = this.value; document.getElementById('supPhotoImg').style.display = this.value ? 'block' : 'none'; document.getElementById('supPhotoIcon').style.display = this.value ? 'none' : 'block';" />
                                        <label for="supImageUrl" class="m3-field-label">${isEn ? 'Image URL (https://...)' : 'URL de la Imagen (https://...)'}</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 2. Nombre del Proveedor y Categoría (M3 Expressive Outlined) -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px;">
                            <div class="m3-field-container">
                                <input type="text" id="supName" required value="${supplier?.name || ''}" placeholder=" " class="m3-field-input" />
                                <label for="supName" class="m3-field-label">${isEn ? 'Supplier Name / Company *' : 'Nombre del Proveedor o Empresa *'}</label>
                            </div>

                            <div class="m3-field-container">
                                <select id="supCategory" class="m3-field-select">
                                    ${this.CATEGORIES.map(c => `
                                        <option value="${c.id}" ${supCategory.toLowerCase() === c.id ? 'selected' : ''}>
                                            ${c.displayLabel || c.label}
                                        </option>
                                    `).join('')}
                                </select>
                                <label for="supCategory" class="m3-field-label">${isEn ? 'Supplier Type / Category *' : 'Tipo de Proveedor (Categoría) *'}</label>
                            </div>
                        </div>

                        <!-- 3. Teléfono y Contacto (M3 Expressive Outlined) -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px;">
                            <div class="m3-field-container">
                                <input type="tel" id="supPhone" value="${supplier?.phone || ''}" placeholder=" " class="m3-field-input" />
                                <label for="supPhone" class="m3-field-label">${isEn ? 'WhatsApp / Phone Number (Optional)' : 'Teléfono o WhatsApp (Opcional)'}</label>
                            </div>

                            <div class="m3-field-container">
                                <input type="text" id="supContact" value="${supplier?.contact_name || ''}" placeholder=" " class="m3-field-input" />
                                <label for="supContact" class="m3-field-label">${isEn ? 'Contact Person Name (Optional)' : 'Persona de Contacto (Opcional)'}</label>
                            </div>
                        </div>

                        <!-- 4. Días de Reparto (Plano) -->
                        <div style="padding-top: 4px;">
                            <label style="display: block; font-size: 13.5px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
                                ${isEn ? 'Delivery Days' : 'Días de Reparto'}
                            </label>
                            <p style="margin: 0 0 10px 0; font-size: 12.5px; color: var(--text-secondary);">
                                ${isEn ? 'Select the days they deliver to the restaurant.' : 'Selecciona los días que hacen entrega en el restaurante.'}
                            </p>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap;" id="supplierDaysTogglesContainer">
                                ${this.DAYS.map(d => {
                                    const checked = activeDays.includes(d.id);
                                    return `
                                        <button type="button" 
                                            class="m3-day-chip-toggle ${checked ? 'active' : ''}" 
                                            data-day-id="${d.id}"
                                            onclick="window.suppliersManager.toggleDayChip(this)"
                                            style="
                                                padding: 8px 14px;
                                                border-radius: var(--radius-full);
                                                font-size: 13px;
                                                font-weight: 700;
                                                cursor: pointer;
                                                transition: all 0.2s ease;
                                                border: 1.5px solid ${checked ? 'var(--primary-dark)' : 'var(--border)'};
                                                background: ${checked ? 'var(--primary-light)' : 'var(--bg)'};
                                                color: ${checked ? 'var(--primary-dark)' : 'var(--text-secondary)'};
                                            "
                                        >
                                            ${isEn ? d.labelEn : d.label}
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <!-- 5. Hora Límite de Pedido (Material 3 Expressive Time Picker) -->
                        <div class="m3-field-container" style="max-width: 260px;">
                            <input type="hidden" id="supCutoff" value="${cutoff}" />
                            <div class="m3-field-input m3-timepicker-trigger-box" 
                                 tabindex="0"
                                 role="button"
                                 aria-label="${isEn ? 'Order Cut-off Time' : 'Hora Límite de Pedido'}"
                                 onclick="window.suppliersManager.openM3TimePicker('supCutoff')"
                                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); window.suppliersManager.openM3TimePicker('supCutoff');}">
                                <span id="supCutoffDisplay" style="font-size: 16px; font-weight: 700; color: var(--text-main); font-family: var(--font-display);">
                                    ${cutoff || '18:00'}
                                </span>
                                <span class="material-symbols-outlined" style="font-size: 22px; color: var(--text-secondary); pointer-events: none;">schedule</span>
                            </div>
                            <label class="m3-field-label" style="top: 0 !important; transform: translateY(-50%) scale(0.85); font-size: 13px; font-weight: 700; color: var(--primary-dark);">
                                ${isEn ? 'Order Cut-off Time *' : 'Hora Límite de Pedido *'}
                            </label>
                        </div>

                        <!-- 6. Notas / Instrucciones (M3 Expressive Outlined) -->
                        <div class="m3-field-container">
                            <textarea id="supNotes" rows="3" placeholder=" " class="m3-field-input">${supplier?.notes || ''}</textarea>
                            <label for="supNotes" class="m3-field-label">${isEn ? 'Notes / Delivery Instructions (Optional)' : 'Notas / Instrucciones de Pedido (Opcional)'}</label>
                        </div>

                        <!-- Botones inferiores de acción (Únicos botones de Guardar / Cancelar) -->
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 8px; padding-top: 18px; border-top: 1px solid var(--border); flex-wrap: wrap;">
                            <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-cancel" style="flex: 1; max-width: 140px; justify-content: center;">
                                ${isEn ? 'Cancel' : 'Cancelar'}
                            </button>
                            <button type="submit" id="btnSaveSupplier" class="btn-supplier-save" style="flex: 2; max-width: 220px; justify-content: center;">
                                ${isEditing ? (isEn ? 'Save Changes' : 'Guardar Cambios') : (isEn ? 'Create Supplier' : 'Crear Proveedor')}
                            </button>
                        </div>
                    </form>
                </div>
            `;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        /** Manejador de previsualización y compresión de imagen para proveedor */
        async handleSupplierPhotoSelected(input) {
            const file = input.files && input.files[0];
            if (!file) return;

            try {
                const blob = await this._toJpegBlob(file, 900, 0.82);
                const reader = new FileReader();
                reader.onload = (e) => {
                    const dataUrl = e.target.result;
                    const img = document.getElementById('supPhotoImg');
                    const icon = document.getElementById('supPhotoIcon');
                    const hiddenUrl = document.getElementById('supImageUrl');
                    const removeBtn = document.getElementById('btnRemoveSupPhoto');

                    if (img) {
                        img.src = dataUrl;
                        img.style.display = 'block';
                    }
                    if (icon) icon.style.display = 'none';
                    if (hiddenUrl) hiddenUrl.value = dataUrl;
                    if (removeBtn) removeBtn.style.display = 'inline-flex';
                };
                reader.readAsDataURL(blob);

                this._pendingSupplierImageBlob = blob;
                this._pendingSupplierImageName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            } catch (err) {
                console.warn('Error leyendo imagen del proveedor:', err);
            }
        }

        /** Quita la foto del proveedor del formulario */
        removeSupplierPhoto() {
            const img = document.getElementById('supPhotoImg');
            const icon = document.getElementById('supPhotoIcon');
            const hiddenUrl = document.getElementById('supImageUrl');
            const removeBtn = document.getElementById('btnRemoveSupPhoto');
            const fileInput = document.getElementById('supPhotoFile');

            if (img) { img.src = ''; img.style.display = 'none'; }
            if (icon) icon.style.display = 'block';
            if (hiddenUrl) hiddenUrl.value = '';
            if (removeBtn) removeBtn.style.display = 'none';
            if (fileInput) fileInput.value = '';
            this._pendingSupplierImageBlob = null;
        }

        /** Guarda o actualiza un proveedor en Supabase y localmente */
        async functionSaveSupplier(e, supplierId) {
            e.preventDefault();
            const btn = document.getElementById('btnSaveSupplier');
            const btnTop = document.getElementById('btnSaveSupplierTop');
            if (btn) btn.disabled = true;
            if (btnTop) btnTop.disabled = true;

            const isEn = this.isEnglish();
            const name = document.getElementById('supName').value.trim();
            const category = document.getElementById('supCategory')?.value || 'otros';
            const phone = document.getElementById('supPhone')?.value.trim() || '';
            const contact_name = document.getElementById('supContact')?.value.trim() || '';
            const cutoff_time = document.getElementById('supCutoff').value || '18:00';
            const notes = document.getElementById('supNotes').value.trim();
            let image_url = document.getElementById('supImageUrl')?.value || '';

            const userId = window.authManager?.currentUser?.id;

            // Subir a Supabase Storage si hay blob pendiente
            if (this._pendingSupplierImageBlob && window.supabaseClient) {
                try {
                    const sb = window.supabaseClient;
                    const filePath = `supplier-photos/${this._pendingSupplierImageName}`;
                    const { error: upErr } = await sb.storage.from('menu-files').upload(filePath, this._pendingSupplierImageBlob, { upsert: true });
                    if (!upErr) {
                        const { data } = sb.storage.from('menu-files').getPublicUrl(filePath);
                        if (data?.publicUrl) image_url = data.publicUrl;
                    }
                } catch (e) {
                    console.warn('⚠️ Error subiendo foto del proveedor a Storage:', e);
                }
            }

            const payload = {
                name,
                category,
                image_url,
                phone,
                contact_name,
                cutoff_time,
                notes,
                updated_at: new Date().toISOString()
            };
            if (userId) payload.user_id = userId;

            // Días seleccionados
            const dayChips = document.querySelectorAll('#supplierDaysTogglesContainer .m3-day-chip-toggle.active');
            payload.delivery_days = Array.from(dayChips).map(c => c.getAttribute('data-day-id'));

            try {
                const sb = window.supabaseClient;
                if (!sb) throw new Error('Supabase no inicializado');

                if (supplierId) {
                    const { error } = await sb.from('suppliers').update(payload).eq('id', supplierId);
                    if (error) throw error;
                    // Actualizar en memoria
                    const idx = this.suppliers.findIndex(s => s.id === supplierId);
                    if (idx !== -1) this.suppliers[idx] = { ...this.suppliers[idx], ...payload };
                    this.notify(isEn ? 'Supplier updated' : 'Proveedor actualizado', 'success');
                } else {
                    const { data, error } = await sb.from('suppliers').insert([payload]).select();
                    if (error) throw error;
                    if (data && data[0]) {
                        this.suppliers.unshift(data[0]);
                    }
                    this.notify(isEn ? 'Supplier created' : 'Proveedor creado exitosamente', 'success');
                }

                this._pendingSupplierImageBlob = null;
                this.saveCache();
                this.backToList();
            } catch (err) {
                console.error('Error guardando proveedor:', err);
                this.notify(err.message || 'Error guardando proveedor', 'error');
            } finally {
                if (btn) btn.disabled = false;
                if (btnTop) btnTop.disabled = false;
            }
        }

        saveSupplier(e, id) {
            return this.functionSaveSupplier(e, id);
        }

        /** Elimina proveedor o lo quita de la lista del usuario con diálogo de confirmación M3 */
        deleteSupplier(supplierId) {
            const isEn = this.isEnglish();
            const sup = this.suppliers.find(s => s.id === supplierId);
            if (!sup) return;

            const isOwnOrAdmin = this.isSuperAdmin() || (sup.user_id && sup.user_id === this.getCurrentUserId());

            if (isOwnOrAdmin) {
                const title = isEn ? 'Delete Supplier?' : '¿Eliminar proveedor?';
                const body = isEn
                    ? `"${sup.name}" and all its products will be permanently deleted.`
                    : `"${sup.name}" y todos sus productos asociados serán eliminados permanentemente.`;

                this._showConfirmDialog(title, body, async () => {
                    try {
                        const sb = window.supabaseClient;
                        if (sb) {
                            const { error } = await sb.from('suppliers').delete().eq('id', supplierId);
                            if (error) throw error;
                        }
                        this.suppliers = this.suppliers.filter(s => s.id !== supplierId);
                        this.items = this.items.filter(it => it.supplier_id !== supplierId);
                        delete this.orderCart[supplierId];
                        this.saveCache();
                        // Volver a la lista si estábamos en el detalle del proveedor eliminado
                        if (this.selectedSupplierDetailId === supplierId) {
                            this.backToList();
                        } else {
                            this.renderContent();
                        }
                        this.notify(isEn ? 'Supplier deleted' : 'Proveedor eliminado', 'info');
                    } catch (err) {
                        console.error('Error eliminando proveedor:', err);
                        this.notify(err.message || 'Error eliminando proveedor', 'error');
                    }
                }, {
                    actionText: isEn ? 'Delete' : 'Eliminar',
                    actionColor: 'var(--error)',
                    actionIcon: 'delete'
                });
            } else {
                // Proveedor asignado: el usuario no admin desea quitarlo de su vista
                const title = isEn ? 'Remove from list?' : '¿Quitar de mi lista?';
                const body = isEn
                    ? `"${sup.name}" will be hidden from your suppliers directory.`
                    : `"${sup.name}" dejará de aparecer en tu lista de proveedores.`;

                this._showConfirmDialog(title, body, () => {
                    this._hideSupplierForUser(supplierId);
                    this.suppliers = this.suppliers.filter(s => s.id !== supplierId);
                    this.items = this.items.filter(it => it.supplier_id !== supplierId);
                    delete this.orderCart[supplierId];
                    this.saveCache();
                    if (this.selectedSupplierDetailId === supplierId) {
                        this.backToList();
                    } else {
                        this.renderContent();
                    }
                    this.notify(isEn ? 'Supplier removed from your list' : 'Proveedor quitado de tu lista', 'info');
                }, {
                    actionText: isEn ? 'Remove' : 'Quitar',
                    actionColor: 'var(--error)',
                    actionIcon: 'visibility_off'
                });
            }
        }

        /**
         * Renderiza la página completa para Nuevo / Editar Producto con Fotografía
         */
        renderItemFormPage() {
            if (!this.container) return;
            const isEn = this.isEnglish();
            const itemId = this.editingItemId;
            const item = itemId ? this.items.find(it => it.id === itemId) : null;
            const isEditing = Boolean(item);
            const supId = item?.supplier_id || this.preselectedSupplierId || (this.suppliers[0]?.id || '');

            this.container.innerHTML = `
                <div class="suppliers-subview-page" style="max-width: 760px; margin: 0 auto; padding: 0 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Header en PC / Desktop: Título + Subtítulo con flujo natural M3 y salto de línea claro -->
                    <div class="supplier-form-desktop-header" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
                        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em; line-height: 1.2;">
                            ${isEditing ? (isEn ? 'Edit Product' : 'Editar Producto') : (isEn ? 'New Product' : 'Nuevo Producto')}
                        </h2>
                        <p style="margin: 0; font-size: 13.5px; color: var(--text-secondary); line-height: 1.4;">
                            ${isEn ? 'Assign photo, name, format and supplier' : 'Asigna foto, nombre, formato y proveedor'}
                        </p>
                    </div>

                    <!-- Header Integrado Móvil (Reemplaza la barra superior en móvil) -->
                    <header class="supplier-item-form-header">
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                            <button type="button" 
                                    onclick="window.suppliersManager.backToList()" 
                                    class="btn-icon-m3 btn-back-green" 
                                    title="${isEn ? 'Back' : 'Volver'}" 
                                    style="width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--primary-dark); transition: all 0.2s var(--m3-easing); flex-shrink: 0;">
                                <span class="material-symbols-outlined" style="font-size: 22px; color: var(--primary-dark);">arrow_back</span>
                            </button>
                            <div style="min-width: 0; flex: 1;">
                                <h1 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--text-main); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">
                                    ${isEditing ? (isEn ? 'Edit Product' : 'Editar Producto') : (isEn ? 'New Product' : 'Nuevo Producto')}
                                </h1>
                                <p style="margin: 1px 0 0 0; font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">
                                    ${isEn ? 'Assign photo, name, format and supplier' : 'Asigna foto, nombre, formato y proveedor'}
                                </p>
                            </div>
                        </div>
                    </header>

                    <!-- Formulario Plano y Adaptable a Móvil (Sin tarjeta ni contenedor restrictivo) -->
                    <form id="itemFullForm" onsubmit="window.suppliersManager.saveItem(event, '${itemId || ''}')" style="display: flex; flex-direction: column; gap: 20px;">
                        
                        <!-- Proveedor Asignado y Nombre (M3 Expressive Outlined) -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px;">
                            <div class="m3-field-container">
                                <select id="itemSupplierId" required class="m3-field-select">
                                    ${this.suppliers.length === 0 ? `
                                        <option value="">${isEn ? 'No suppliers available - create one first' : 'Sin proveedores - crea uno primero'}</option>
                                    ` : this.suppliers.map(s => `
                                        <option value="${s.id}" ${s.id === supId ? 'selected' : ''}>${s.name}</option>
                                    `).join('')}
                                </select>
                                <label for="itemSupplierId" class="m3-field-label">${isEn ? 'Assigned Supplier *' : 'Proveedor Asignado *'}</label>
                            </div>

                            <div class="m3-field-container">
                                <input type="text" id="itemName" required value="${item?.name || ''}" placeholder=" " class="m3-field-input" />
                                <label for="itemName" class="m3-field-label">${isEn ? 'Product Name *' : 'Nombre del Producto *'}</label>
                            </div>
                        </div>

                        <!-- Fotografía del Producto (Plana, sin caja contenedora) -->
                        <div style="padding-bottom: 18px; border-bottom: 1px solid var(--border);">
                            <label style="display: block; font-size: 13.5px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
                                ${isEn ? 'Product Photograph (Optional)' : 'Fotografía del Producto (Opcional)'}
                            </label>
                            <p style="margin: 0 0 12px 0; font-size: 12.5px; color: var(--text-secondary);">
                                ${isEn ? 'Add an image to identify the product quickly when creating orders.' : 'Sube o toma una foto para reconocer el producto al armar pedidos. Se optimiza automáticamente.'}
                            </p>

                            <div style="display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap;">
                                <div id="itemPhotoPreviewBox" style="
                                    width: 68px;
                                    height: 68px;
                                    border-radius: 14px;
                                    background: var(--bg);
                                    border: 2px dashed var(--border);
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    overflow: hidden;
                                    flex-shrink: 0;
                                    position: relative;
                                ">
                                    <img id="itemPhotoImg" src="${item?.image_url || ''}" style="${item?.image_url ? 'display: block;' : 'display: none;'} width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; document.getElementById('itemPhotoIcon').style.display='block';" />
                                    <span id="itemPhotoIcon" class="material-symbols-outlined" style="${item?.image_url ? 'display: none;' : 'display: block;'} font-size: 30px; color: var(--text-secondary);">photo_camera</span>
                                </div>

                                <div style="display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 220px;">
                                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                        <label class="btn-supplier-cancel" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; height: 36px; padding: 0 14px;">
                                            <span class="material-symbols-outlined" style="font-size: 17px;">upload</span>
                                            <span>${isEn ? 'Select Photo' : 'Seleccionar Foto'}</span>
                                            <input type="file" id="itemPhotoFile" accept="image/*" style="display: none;" onchange="window.suppliersManager.handleImageSelected(this)" />
                                        </label>

                                        <label class="btn-supplier-cancel" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; height: 36px; padding: 0 14px;">
                                            <span class="material-symbols-outlined" style="font-size: 17px;">photo_camera</span>
                                            <span>${isEn ? 'Take Photo' : 'Tomar Foto'}</span>
                                            <input type="file" accept="image/*" capture="environment" style="display: none;" onchange="window.suppliersManager.handleImageSelected(this)" />
                                        </label>

                                        <button type="button" id="btnRemovePhoto" onclick="window.suppliersManager.removePhoto()" style="${item?.image_url ? 'display: inline-flex;' : 'display: none;'} align-items: center; gap: 4px; height: 36px; padding: 0 12px; border-radius: var(--radius-full); font-size: 12.5px; font-weight: 700; background: var(--surface); color: var(--error); border: 1px solid var(--border); cursor: pointer;">
                                            <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                                            <span>${isEn ? 'Remove' : 'Quitar Foto'}</span>
                                        </button>
                                    </div>
                                    <input type="hidden" id="itemImageUrl" value="${item?.image_url || ''}" />
                                </div>
                            </div>
                        </div>

                        <!-- Categoría y Formato / Unidad (M3 Expressive Outlined) -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px;">
                            <div class="m3-field-container">
                                <select id="itemCategory" class="m3-field-select">
                                    ${this.CATEGORIES.map(c => `
                                        <option value="${c.label}" ${item?.category === c.label ? 'selected' : ''}>${c.displayLabel || c.label}</option>
                                    `).join('')}
                                </select>
                                <label for="itemCategory" class="m3-field-label">${isEn ? 'Category' : 'Categoría'}</label>
                            </div>

                            <div class="m3-field-container">
                                <input type="text" id="itemFormat" value="${item?.package_format || item?.unit || ''}" placeholder=" " class="m3-field-input" />
                                <label for="itemFormat" class="m3-field-label">${isEn ? 'Packaging Format / Unit' : 'Formato de Presentación / Unidad'}</label>
                            </div>
                        </div>

                        <!-- Notas del Producto (M3 Expressive Outlined) -->
                        <div class="m3-field-container">
                            <input type="text" id="itemNotes" value="${item?.notes || ''}" placeholder=" " class="m3-field-input" />
                            <label for="itemNotes" class="m3-field-label">${isEn ? 'Product Notes (Optional)' : 'Notas u Observaciones del Producto (Opcional)'}</label>
                        </div>

                        <!-- Botones inferiores de acción (Únicos botones de Guardar / Cancelar) -->
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 8px; padding-top: 18px; border-top: 1px solid var(--border); flex-wrap: wrap;">
                            <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-cancel" style="flex: 1; max-width: 140px; justify-content: center;">
                                ${isEn ? 'Cancel' : 'Cancelar'}
                            </button>
                            <button type="submit" id="btnSaveItem" class="btn-supplier-save" style="flex: 2; max-width: 220px; justify-content: center;">
                                ${isEditing ? (isEn ? 'Update Product' : 'Guardar Cambios') : (isEn ? 'Add Product' : 'Agregar Producto')}
                            </button>
                        </div>
                    </form>
                </div>
            `;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        /** Manejador de previsualización y compresión de imagen */
        async handleImageSelected(input) {
            const file = input.files && input.files[0];
            if (!file) return;

            try {
                // Compresión rápida mediante canvas
                const blob = await this._toJpegBlob(file, 900, 0.82);
                const reader = new FileReader();
                reader.onload = (e) => {
                    const dataUrl = e.target.result;
                    const img = document.getElementById('itemPhotoImg');
                    const icon = document.getElementById('itemPhotoIcon');
                    const hiddenUrl = document.getElementById('itemImageUrl');
                    const removeBtn = document.getElementById('btnRemovePhoto');

                    if (img) {
                        img.src = dataUrl;
                        img.style.display = 'block';
                    }
                    if (icon) icon.style.display = 'none';
                    if (hiddenUrl) hiddenUrl.value = dataUrl;
                    if (removeBtn) removeBtn.style.display = 'inline-block';
                };
                reader.readAsDataURL(blob);

                // Subir a Supabase Storage en segundo plano
                this._pendingImageBlob = blob;
                this._pendingImageName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            } catch (err) {
                console.warn('Error leyendo imagen:', err);
            }
        }

        removePhoto() {
            const img = document.getElementById('itemPhotoImg');
            const icon = document.getElementById('itemPhotoIcon');
            const hiddenUrl = document.getElementById('itemImageUrl');
            const removeBtn = document.getElementById('btnRemovePhoto');
            const fileInput = document.getElementById('itemPhotoFile');

            if (img) { img.src = ''; img.style.display = 'none'; }
            if (icon) icon.style.display = 'block';
            if (hiddenUrl) hiddenUrl.value = '';
            if (removeBtn) removeBtn.style.display = 'none';
            if (fileInput) fileInput.value = '';
            this._pendingImageBlob = null;
        }

        /** Compresión de imagen a JPEG usando canvas */
        _toJpegBlob(file, maxSize = 900, quality = 0.82) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const objUrl = URL.createObjectURL(file);
                img.onload = () => {
                    URL.revokeObjectURL(objUrl);
                    let { width, height } = img;
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = Math.round((height * maxSize) / width);
                            width = maxSize;
                        } else {
                            width = Math.round((width * maxSize) / height);
                            height = maxSize;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob falló')), 'image/jpeg', quality);
                };
                img.onerror = () => {
                    URL.revokeObjectURL(objUrl);
                    reject(new Error('No se pudo cargar la imagen'));
                };
                img.src = objUrl;
            });
        }

        /** Guarda o actualiza un producto */
        async saveItem(e, itemId) {
            e.preventDefault();
            const btn = document.getElementById('btnSaveItem');
            const btnTop = document.getElementById('btnSaveItemTop');
            if (btn) btn.disabled = true;
            if (btnTop) btnTop.disabled = true;

            const isEn = this.isEnglish();
            const supplier_id = document.getElementById('itemSupplierId').value;
            const name = document.getElementById('itemName').value.trim();
            const category = document.getElementById('itemCategory').value;
            const package_format = document.getElementById('itemFormat').value.trim();
            const notes = document.getElementById('itemNotes').value.trim();
            let image_url = document.getElementById('itemImageUrl').value;

            const userId = window.authManager?.currentUser?.id;

            // Si hay un blob pendiente por subir a Supabase Storage:
            if (this._pendingImageBlob && window.supabaseClient) {
                try {
                    const sb = window.supabaseClient;
                    const filePath = `supplier-items/${this._pendingImageName}`;
                    const { error: upErr } = await sb.storage.from('menu-files').upload(filePath, this._pendingImageBlob, { upsert: true });
                    if (!upErr) {
                        const { data } = sb.storage.from('menu-files').getPublicUrl(filePath);
                        if (data?.publicUrl) image_url = data.publicUrl;
                    }
                } catch (e) {
                    console.warn('⚠️ Error subiendo imagen a Storage, usando DataURL local:', e);
                }
            }

            const payload = {
                supplier_id,
                name,
                category,
                package_format,
                unit: package_format || 'unidad',
                notes,
                image_url,
                updated_at: new Date().toISOString()
            };
            if (userId) payload.user_id = userId;

            try {
                const sb = window.supabaseClient;
                if (!sb) throw new Error('Supabase no inicializado');

                if (itemId) {
                    const { error } = await sb.from('supplier_items').update(payload).eq('id', itemId);
                    if (error) throw error;
                    const idx = this.items.findIndex(it => it.id === itemId);
                    if (idx !== -1) this.items[idx] = { ...this.items[idx], ...payload };
                    this.notify(isEn ? 'Product updated' : 'Producto actualizado', 'success');
                } else {
                    const { data, error } = await sb.from('supplier_items').insert([payload]).select();
                    if (error) throw error;
                    if (data && data[0]) {
                        this.items.push(data[0]);
                    }
                    this.notify(isEn ? 'Product added' : 'Producto agregado con éxito', 'success');
                }

                this._pendingImageBlob = null;
                this.saveCache();
                this.backToList();
            } catch (err) {
                console.error('Error guardando producto:', err);
                this.notify(err.message || 'Error guardando producto', 'error');
            } finally {
                if (btn) btn.disabled = false;
                if (btnTop) btnTop.disabled = false;
            }
        }

        /** Elimina producto con diálogo de confirmación M3 (sin alert nativo) */
        deleteItem(itemId) {
            const isEn = this.isEnglish();
            const it = this.items.find(i => i.id === itemId);
            if (!it) return;

            const title = isEn ? 'Delete Product?' : '¿Eliminar producto?';
            const body = isEn
                ? `"${it.name}" will be permanently deleted.`
                : `"${it.name}" será eliminado permanentemente.`;

            this._showConfirmDialog(title, body, async () => {

                try {
                    const sb = window.supabaseClient;
                    if (sb) {
                        const { error } = await sb.from('supplier_items').delete().eq('id', itemId);
                        if (error) throw error;
                    }

                    this.items = this.items.filter(i => i.id !== itemId);
                    // Limpiar de pedidos
                    Object.keys(this.orderCart).forEach(supId => {
                        delete this.orderCart[supId][itemId];
                    });
                    this.saveCache();
                    this.renderContent();
                    this.notify(isEn ? 'Product deleted' : 'Producto eliminado', 'info');
                } catch (err) {
                    console.error('Error eliminando producto:', err);
                    this.notify(err.message || 'Error eliminando producto', 'error');
                }
            });
        }

        // ==========================================
        // MÓDULO DE ARMAR PEDIDOS / ÓRDENES RÁPIDAS
        // ==========================================

                /**
         * Renderiza la página completa para Armar Pedido Rápido a Proveedor (Formato Plano M3)
         */
        renderOrderPage() {
            if (!this.container) return;
            const isEn = this.isEnglish();
                        const supplierId = this.activeOrderSupplierId;
            const sup = this.suppliers && this.suppliers.find(s => s.id === supplierId);
            if (!sup) {
                if (!this.suppliers || this.suppliers.length === 0) {
                    this.container.innerHTML = `
                        <div style="padding: 60px 20px; text-align: center; font-family: var(--font-display);">
                            <span class="material-symbols-outlined" style="font-size: 36px; color: var(--primary); animation: spin 1s linear infinite;">sync</span>
                            <p style="color: var(--text-secondary); font-size: 14px; margin-top: 12px;">${isEn ? 'Loading order...' : 'Cargando pedido...'}</p>
                        </div>
                    `;
                    setTimeout(() => { if (this.currentSubView === 'order-form') this.renderOrderPage(); }, 300);
                    return;
                }
                this.backToList();
                return;
            }

            const status = this.getDeliveryStatus(sup);
            const allSuppliers = this.suppliers || [];

            // Calcular proveedores con pedidos activos en el carrito
            const activeSuppliersWithItems = allSuppliers.filter(s => {
                const c = this.orderCart[s.id] || {};
                return Object.values(c).some(q => q > 0);
            });
            const totalSuppliersWithOrders = activeSuppliersWithItems.length;

            this.container.innerHTML = `
                <div class="suppliers-subview-page suppliers-order-flat-page" style="max-width: 860px; margin: 0 auto; padding: 12px 16px 90px; font-family: var(--font-display);">
                    <!-- Cabecera con Jerarquía M3 Expressive Optimizada (Sticky) -->
                    <header class="order-page-header">
                        <!-- Fila Superior: Botón Volver Estándar M3, Título "Crear Orden" y Menú 3 Puntos Plano -->
                        <div class="order-header-title-row" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                                <button type="button" 
                                        onclick="window.suppliersManager.backToList()" 
                                        class="btn-back-circle-m3" 
                                        title="${isEn ? 'Back to Suppliers' : 'Volver a Proveedores'}"
                                        aria-label="${isEn ? 'Back to Suppliers' : 'Volver a Proveedores'}">
                                    <span class="material-symbols-outlined">arrow_back</span>
                                </button>
                                <div style="min-width: 0; flex: 1;">
                                    <h1 style="margin: 0; font-size: 19px; font-weight: 800; color: var(--text-main); line-height: 1.2;">
                                        ${isEn ? 'Create Order' : 'Crear Orden'}
                                    </h1>
                                </div>
                            </div>

                            <!-- Menú de 3 puntos M3 Expressive plano (sin círculo) que abre el Toolbar M3 -->
                            <button type="button" 
                                    id="btnOrderPageMore"
                                    onclick="window.suppliersManager.showOrderPageMoreMenu(event, '${supplierId}')" 
                                    title="${isEn ? 'More options' : 'Más opciones'}"
                                    aria-label="${isEn ? 'More options' : 'Más opciones'}"
                                    style="
                                        width: 36px;
                                        height: 36px;
                                        padding: 0;
                                        margin: 0;
                                        background: transparent;
                                        border: none;
                                        box-shadow: none;
                                        color: var(--text-main);
                                        display: inline-flex;
                                        align-items: center;
                                        justify-content: center;
                                        cursor: pointer;
                                        border-radius: var(--radius-full);
                                        flex-shrink: 0;
                                        transition: background 0.15s ease, transform 0.1s ease;
                                    "
                                    onmouseenter="this.style.background='rgba(0,0,0,0.05)'"
                                    onmouseleave="this.style.background='transparent'"
                                    onmousedown="this.style.transform='scale(0.92)'"
                                    onmouseup="this.style.transform='scale(1)'">
                                <span class="material-symbols-outlined" style="font-size: 24px; pointer-events: none;">more_vert</span>
                            </button>
                        </div>

                        <!-- Selector / Carrusel de Proveedores (Dentro del Header Sticky) -->
                        <div class="order-supplier-switcher-container" style="margin-top: 10px; margin-bottom: 6px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 8px;">
                                <span style="font-size: 11.5px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">
                                    ${isEn ? 'Switch Supplier:' : 'Cambiar de Proveedor:'}
                                </span>
                                <button type="button" 
                                            id="btnOrderSwitcherViewOrder"
                                            class="btn-supplier-orders-nav" 
                                            onclick="window.suppliersManager.renderConsolidatedOrdersPage()" 
                                            title="${isEn ? 'View consolidated order' : 'Ver pedido consolidado'}">
                                        <span class="material-symbols-outlined">receipt_long</span>
                                        <span>${isEn ? 'View Order' : 'Ver Pedido'}</span>
                                        ${totalSuppliersWithOrders > 0 ? `
                                            <span class="supplier-orders-badge" id="orderSwitcherViewOrderBadge">${totalSuppliersWithOrders}</span>
                                        ` : ''}
                                    </button>
                            </div>

                            <!-- Lista deslizante de Chips de Proveedor con padding vertical para no cortar sombras -->
                            <div class="order-supplier-chips-scroll" style="
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                overflow-x: auto;
                                padding-top: 6px;
                                padding-bottom: 6px;
                                -webkit-overflow-scrolling: touch;
                                scrollbar-width: none;
                            ">
                                ${allSuppliers.map(s => {
                                    const isCurrent = s.id === supplierId;
                                    const sCart = this.orderCart[s.id] || {};
                                    const sCount = Object.values(sCart).reduce((sum, q) => sum + (q > 0 ? 1 : 0), 0);
                                    return `
                                        <button type="button" 
                                                onclick="window.suppliersManager.switchOrderSupplier('${s.id}')"
                                                class="order-supplier-chip ${isCurrent ? 'active' : ''}"
                                                style="
                                                    display: inline-flex;
                                                    align-items: center;
                                                    gap: 6px;
                                                    height: 38px;
                                                    padding: 0 14px;
                                                    border-radius: var(--radius-full);
                                                    font-family: var(--font-display);
                                                    font-size: 13px;
                                                    font-weight: 700;
                                                    white-space: nowrap;
                                                    flex-shrink: 0;
                                                    cursor: pointer;
                                                    border: 1.5px solid ${isCurrent ? 'var(--primary-dark)' : 'var(--border)'};
                                                    background: ${isCurrent ? 'var(--primary-light)' : 'var(--surface)'};
                                                    color: ${isCurrent ? 'var(--primary-dark)' : 'var(--text-main)'};
                                                    transition: all 0.15s ease;
                                                ">
                                            <span>${s.name}</span>
                                            ${sCount > 0 ? `
                                                <span style="
                                                    display: inline-flex;
                                                    align-items: center;
                                                    justify-content: center;
                                                    min-width: 20px;
                                                    height: 20px;
                                                    padding: 0 5px;
                                                    border-radius: 10px;
                                                    font-size: 11px;
                                                    font-weight: 800;
                                                    background: ${isCurrent ? 'var(--primary-dark)' : 'var(--primary)'};
                                                    color: #ffffff;
                                                ">${sCount}</span>
                                            ` : ''}
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <!-- Fila Inferior: Banner Tonal con Info de Entrega (sin icono de calendario) -->
                        <div class="order-delivery-info-banner" style="
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            margin-top: 6px;
                            padding: 8px 12px;
                            background: var(--surface);
                            border: 1px solid var(--border);
                            border-radius: var(--radius-md);
                            font-size: 12.5px;
                            color: var(--text-secondary);
                        ">
                            <div style="min-width: 0; flex: 1; line-height: 1.35;">
                                <strong style="color: var(--text-main); font-weight: 700;">${status.statusTitle}</strong> · <span>${status.statusSub}</span>
                            </div>
                        </div>
                    </header>

                    <!-- Lista de Productos y Steppers (Formato Plano) -->
                    <div id="order-modal-items-list" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
                    </div>
                </div>
            `;
            this.renderOrderModalItems(supplierId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        renderOrderModalItems(supplierId) {
            const listEl = document.getElementById('order-modal-items-list');
            if (!listEl) return;

            const isEn = this.isEnglish();
            const supItems = this.items.filter(it => it.supplier_id === supplierId);
            const cart = this.orderCart[supplierId] || {};

            if (supItems.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                        ${isEn ? 'No products registered for this supplier.' : 'No hay productos registrados para este proveedor.'}
                    </div>
                `;
                return;
            }

            listEl.innerHTML = supItems.map(item => {
                const qty = cart[item.id] || 0;
                return `
                    <div style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 10px 14px;
                        background: ${qty > 0 ? 'var(--primary-light)' : 'var(--surface)'};
                        border: 1px solid ${qty > 0 ? 'var(--primary)' : 'var(--border)'};
                        border-radius: var(--radius-md);
                        gap: 12px;
                    ">
                        <!-- Foto y Nombre -->
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                            <div style="
                                width: 44px;
                                height: 44px;
                                border-radius: 10px;
                                background: var(--surface);
                                border: 1px solid var(--border);
                                overflow: hidden;
                                flex-shrink: 0;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">
                                ${item.image_url ? `
                                    <img src="${item.image_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';" />
                                ` : `
                                    <span class="material-symbols-outlined" style="font-size: 22px; color: var(--text-secondary);">photo_camera</span>
                                `}
                            </div>
                            <div style="min-width: 0;">
                                <div style="font-size: 14px; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${item.name}
                                </div>
                                <div style="font-size: 11.5px; color: var(--text-secondary);">
                                    ${item.package_format || item.unit || 'Unidad'}
                                </div>
                            </div>
                        </div>

                        <!-- Stepper (+ / -) -->
                        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                            <button type="button" onclick="window.suppliersManager.updateOrderQty('${supplierId}', '${item.id}', -1)" style="
                                width: 30px;
                                height: 30px;
                                border-radius: 50%;
                                border: 1px solid var(--border);
                                background: var(--bg);
                                font-weight: 800;
                                font-size: 16px;
                                color: var(--text-main);
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">-</button>

                            <input type="number" min="0" value="${qty}" onchange="window.suppliersManager.setOrderQty('${supplierId}', '${item.id}', this.value)" style="
                                width: 46px;
                                height: 32px;
                                text-align: center;
                                font-weight: 800;
                                font-size: 15px;
                                border: 1.5px solid ${qty > 0 ? 'var(--primary-dark)' : 'var(--border)'};
                                border-radius: 8px;
                                background: var(--bg);
                                color: ${qty > 0 ? 'var(--primary-dark)' : 'var(--text-main)'};
                            " />

                            <button type="button" onclick="window.suppliersManager.updateOrderQty('${supplierId}', '${item.id}', 1)" style="
                                width: 30px;
                                height: 30px;
                                border-radius: 50%;
                                border: 1px solid var(--primary-dark);
                                background: var(--primary-light);
                                color: var(--primary-dark);
                                font-weight: 800;
                                font-size: 16px;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">+</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        updateOrderBadgesAndChips(currentSupplierId) {
            const allSuppliers = this.suppliers || [];
            const activeSuppliersWithItems = allSuppliers.filter(s => {
                const c = this.orderCart[s.id] || {};
                return Object.values(c).some(q => q > 0);
            });
            const totalSuppliersWithOrders = activeSuppliersWithItems.length;

            // Actualizar badge del botón "Ver Pedido" fijo
            const viewOrderBtn = document.getElementById('btnOrderSwitcherViewOrder');
            if (viewOrderBtn) {
                let badgeEl = viewOrderBtn.querySelector('.supplier-orders-badge');
                if (totalSuppliersWithOrders > 0) {
                    if (!badgeEl) {
                        badgeEl = document.createElement('span');
                        badgeEl.className = 'supplier-orders-badge';
                        badgeEl.id = 'orderSwitcherViewOrderBadge';
                        viewOrderBtn.appendChild(badgeEl);
                    }
                    badgeEl.textContent = totalSuppliersWithOrders;
                } else if (badgeEl) {
                    badgeEl.remove();
                }
            }

            // Actualizar lista deslizante de Chips de Proveedor
            const chipsScroll = document.querySelector('.order-supplier-chips-scroll');
            if (chipsScroll) {
                chipsScroll.innerHTML = allSuppliers.map(s => {
                    const isCurrent = s.id === currentSupplierId;
                    const sCart = this.orderCart[s.id] || {};
                    const sCount = Object.values(sCart).reduce((sum, q) => sum + (q > 0 ? 1 : 0), 0);
                    return `
                        <button type="button" 
                                onclick="window.suppliersManager.switchOrderSupplier('${s.id}')"
                                class="order-supplier-chip ${isCurrent ? 'active' : ''}"
                                style="
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 6px;
                                    height: 38px;
                                    padding: 0 14px;
                                    border-radius: var(--radius-full);
                                    font-family: var(--font-display);
                                    font-size: 13px;
                                    font-weight: 700;
                                    white-space: nowrap;
                                    flex-shrink: 0;
                                    cursor: pointer;
                                    border: 1.5px solid ${isCurrent ? 'var(--primary-dark)' : 'var(--border)'};
                                    background: ${isCurrent ? 'var(--primary-light)' : 'var(--surface)'};
                                    color: ${isCurrent ? 'var(--primary-dark)' : 'var(--text-main)'};
                                    transition: all 0.15s ease;
                                ">
                            <span>${s.name}</span>
                            ${sCount > 0 ? `
                                <span style="
                                    display: inline-flex;
                                    align-items: center;
                                    justify-content: center;
                                    min-width: 20px;
                                    height: 20px;
                                    padding: 0 5px;
                                    border-radius: 10px;
                                    font-size: 11px;
                                    font-weight: 800;
                                    background: ${isCurrent ? 'var(--primary-dark)' : 'var(--primary)'};
                                    color: #ffffff;
                                ">${sCount}</span>
                            ` : ''}
                        </button>
                    `;
                }).join('');
            }
        }

        setOrderQty(supplierId, itemId, val) {
            const num = Math.max(0, parseInt(val, 10) || 0);
            if (!this.orderCart[supplierId]) this.orderCart[supplierId] = {};
            if (num === 0) {
                delete this.orderCart[supplierId][itemId];
            } else {
                this.orderCart[supplierId][itemId] = num;
            }
            this.saveCache();

            // Sincronizar input del catálogo Dropbox si existe
            const inputEl = document.getElementById(`item-qty-input-${supplierId}-${itemId}`);
            if (inputEl) {
                inputEl.value = num;
                if (num > 0) {
                    inputEl.classList.add('has-qty');
                } else {
                    inputEl.classList.remove('has-qty');
                }
            }

            this.renderOrderModalItems(supplierId);
            this.updateOrderBadgesAndChips(supplierId);
        }

        clearAllOrdersFromOrderPage(supplierId) {
            this.orderCart = {};
            this.orderNotes = {};
            this.consolidatedCheckedItems = {};
            try { sessionStorage.removeItem('rp_consolidated_checked'); } catch (e) {}
            this.saveCache();
            this.renderOrderPage(supplierId);
            this.notify(this.isEnglish() ? 'All orders cleared' : 'Se limpiaron todos los pedidos y cantidades', 'info');
        }

        clearSupplierOrder(supplierId) {
            delete this.orderCart[supplierId];
            if (this.orderNotes) delete this.orderNotes[supplierId];
            this.saveCache();
            this.renderOrderModalItems(supplierId);
            this.updateOrderBadgesAndChips(supplierId);
            this.notify(this.isEnglish() ? 'Quantities reset' : 'Cantidades reiniciadas', 'info');
        }

        /** Construye el texto formateado de la orden */
        buildOrderSummary(supplierId) {
            const sup = this.suppliers.find(s => s.id === supplierId);
            if (!sup) return '';

            const isEn = this.isEnglish();
            const status = this.getDeliveryStatus(sup);
            const cart = this.orderCart[supplierId] || {};
            const supItems = this.items.filter(it => it.supplier_id === supplierId);

            const selectedLines = [];
            supItems.forEach(it => {
                const qty = cart[it.id];
                if (qty && qty > 0) {
                    const unitStr = it.package_format || it.unit ? ` (${it.package_format || it.unit})` : '';
                    selectedLines.push(`▫️ *${qty}x* ${it.name}${unitStr}`);
                }
            });

            if (selectedLines.length === 0) return null;

            const nowStr = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const notes = this.orderNotes[supplierId] || '';

            return `📦 *${isEn ? 'ORDER FOR' : 'PEDIDO PARA'} ${sup.name.toUpperCase()}*\n` +
                   `📅 ${isEn ? 'Date' : 'Fecha'}: ${nowStr}\n` +
                   `🚚 ${isEn ? 'Schedule' : 'Reparto'}: ${status.statusTitle}\n` +
                   `------------------------------------\n` +
                   `*${isEn ? 'PRODUCTS REQUESTED:' : 'PRODUCTOS SOLICITADOS:'}*\n` +
                   selectedLines.join('\n') +
                   `\n------------------------------------\n` +
                   (notes ? `📝 *${isEn ? 'Note:' : 'Nota:'}* ${notes}\n\n` : '\n') +
                   `*Recipe Pantry Restaurant*`;
        }

        /** Copia texto de la orden al portapapeles */
        async copyOrderText(supplierId) {
            const isEn = this.isEnglish();
            const text = this.buildOrderSummary(supplierId);
            if (!text) {
                this.notify(isEn ? 'Please add quantities to at least 1 product' : 'Indica la cantidad de al menos 1 producto', 'warning');
                return;
            }

            try {
                await navigator.clipboard.writeText(text);
                this.notify(isEn ? '📋 Order copied to clipboard!' : '📋 ¡Pedido copiado al portapapeles!', 'success');
            } catch (e) {
                this.notify('No se pudo copiar automáticamente', 'error');
            }
        }

        /** Abre WhatsApp con la orden en formato Recibo PDF */
        sendOrderByWhatsApp(supplierId) {
            this.shareConsolidatedOrdersPDF(supplierId);
        }


        /**
         * Renderiza la página consolidada / resumen general con todos los proveedores que tienen productos pedidos
         */
        renderConsolidatedOrdersPage() {
            if (!this.container) return;
            this.currentSubView = 'order-consolidated';
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('view', 'suppliers');
                url.searchParams.set('subview', 'consolidated');
                window.history.replaceState({}, '', url);
            } catch (e) {}
                        const isEn = this.isEnglish();
            if (!this.suppliers || this.suppliers.length === 0) {
                this.container.innerHTML = `
                    <div style="padding: 60px 20px; text-align: center; font-family: var(--font-display);">
                        <span class="material-symbols-outlined" style="font-size: 36px; color: var(--primary); animation: spin 1s linear infinite;">sync</span>
                        <p style="color: var(--text-secondary); font-size: 14px; margin-top: 12px;">${isEn ? 'Loading orders...' : 'Cargando pedidos...'}</p>
                    </div>
                `;
                setTimeout(() => { if (this.currentSubView === 'order-consolidated') this.renderConsolidatedOrdersPage(); }, 300);
                return;
            }
            const allSuppliers = this.suppliers || [];

            // Obtener proveedores que tienen al menos un producto pedido
            const orderedSuppliers = allSuppliers.filter(s => {
                const cart = this.orderCart[s.id] || {};
                return Object.values(cart).some(q => q > 0);
            });

            const totalSuppliersCount = orderedSuppliers.length;
            let totalProductsCount = 0;
            orderedSuppliers.forEach(s => {
                const cart = this.orderCart[s.id] || {};
                totalProductsCount += Object.values(cart).reduce((sum, q) => sum + (q > 0 ? 1 : 0), 0);
            });

            const nowStr = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            this.container.innerHTML = `
                <div class="suppliers-subview-page suppliers-consolidated-flat-page" style="max-width: 900px; margin: 0 auto; padding: 12px 16px 100px; font-family: var(--font-display);">
                    <!-- Header Consolidado con Jerarquía M3 Ajustada -->
                    <header class="consolidated-header-m3" style="margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                        <!-- Fila Superior: Back Estándar M3, Título y Menú 3 Puntos Plano -->
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                            <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                                <button type="button" 
                                        onclick="window.suppliersManager.backToOrderForm()" 
                                        class="btn-back-circle-m3" 
                                        title="${isEn ? 'Back to Order Form' : 'Volver a Armar Pedido'}" 
                                        aria-label="${isEn ? 'Back to Order Form' : 'Volver a Armar Pedido'}">
                                    <span class="material-symbols-outlined">arrow_back</span>
                                </button>
                                <div style="min-width: 0; flex: 1;">
                                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--primary-dark); line-height: 1.2;">
                                        ${isEn ? 'Summary' : 'Resumen Consolidado'}
                                    </div>
                                    <h1 style="margin: 0; font-size: 19px; font-weight: 800; color: var(--text-main); line-height: 1.2; word-break: break-word;">
                                        ${isEn ? 'Orders by Supplier' : 'Pedidos por Proveedor'}
                                    </h1>
                                </div>
                            </div>

                            <!-- Botón 3 puntos M3 plano para Opciones del Pedido Consolidado -->
                            ${totalSuppliersCount > 0 ? `
                                <button type="button" 
                                        id="btnConsolidatedMore"
                                        onclick="window.suppliersManager.showConsolidatedMoreMenu(event)" 
                                        title="${isEn ? 'More options' : 'Más opciones'}"
                                        aria-label="${isEn ? 'More options' : 'Más opciones'}"
                                        style="
                                            width: 36px; 
                                            height: 36px; 
                                            padding: 0; 
                                            margin: 0; 
                                            background: transparent; 
                                            border: none; 
                                            box-shadow: none; 
                                            color: var(--text-main); 
                                            display: inline-flex; 
                                            align-items: center; 
                                            justify-content: center; 
                                            cursor: pointer; 
                                            border-radius: var(--radius-full); 
                                            flex-shrink: 0;
                                            transition: background 0.15s ease;
                                        "
                                        onmouseenter="this.style.background='rgba(0,0,0,0.05)'"
                                        onmouseleave="this.style.background='transparent'">
                                    <span class="material-symbols-outlined" style="font-size: 24px; pointer-events: none;">more_vert</span>
                                </button>
                            ` : ''}
                        </div>
                    </header>

                    <!-- Estado Vacío Si no hay ningún producto pedido -->
                    ${totalSuppliersCount === 0 ? `
                        <div style="text-align: center; padding: 60px 20px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius-xl); margin-top: 20px;">
                            <span class="material-symbols-outlined" style="font-size: 48px; color: var(--text-secondary); opacity: 0.6; margin-bottom: 12px;">shopping_basket</span>
                            <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 800; color: var(--text-main);">
                                ${isEn ? 'No products ordered yet' : 'No has agregado productos a ningún pedido'}
                            </h3>
                            <p style="margin: 0 0 20px 0; font-size: 13.5px; color: var(--text-secondary); max-width: 440px; margin-left: auto; margin-right: auto;">
                                ${isEn ? 'Select quantities in any supplier and they will automatically appear here consolidated.' : 'Selecciona cantidades en cualquier proveedor y aparecerán organizadas aquí automáticamente.'}
                            </p>
                            <button type="button" onclick="window.suppliersManager.backToOrderForm()" class="btn-supplier-save" style="display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 24px; font-weight: 700;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">add_shopping_cart</span>
                                <span>${isEn ? 'Add products now' : 'Ir a seleccionar productos'}</span>
                            </button>
                        </div>
                    ` : `
                        <!-- Listado de Proveedores con Pedidos (Tarjetas Planas M3) -->
                        <div style="display: flex; flex-direction: column; gap: 18px;">
                            ${orderedSuppliers.map(sup => {
                                const status = this.getDeliveryStatus(sup);
                                const cart = this.orderCart[sup.id] || {};
                                const supItems = this.items.filter(it => it.supplier_id === sup.id && (cart[it.id] || 0) > 0);
                                const notes = this.orderNotes[sup.id] || '';
                                const cat = this.getCategoryObj(sup.category);

                                return `
                                    <div class="consolidated-supplier-card" style="
                                        position: relative;
                                        background: var(--surface);
                                        border: 1px solid var(--border);
                                        border-radius: var(--radius-lg);
                                        padding: 18px;
                                        display: flex;
                                        flex-direction: column;
                                        gap: 14px;
                                    ">
                                        <!-- Botón Editar posicionado exactamente en la esquina superior derecha de la tarjeta -->
                                        <button type="button" 
                                                onclick="window.suppliersManager.switchOrderSupplier('${sup.id}')" 
                                                title="${isEn ? 'Edit quantities' : 'Editar cantidades'}"
                                                aria-label="${isEn ? 'Edit quantities' : 'Editar cantidades'}"
                                                style="
                                                    position: absolute;
                                                    top: 16px;
                                                    right: 16px;
                                                    width: 36px;
                                                    height: 36px;
                                                    padding: 0;
                                                    margin: 0;
                                                    border-radius: var(--radius-full);
                                                    background: var(--bg);
                                                    border: 1px solid var(--border);
                                                    color: var(--text-main);
                                                    display: inline-flex;
                                                    align-items: center;
                                                    justify-content: center;
                                                    cursor: pointer;
                                                    flex-shrink: 0;
                                                    z-index: 2;
                                                    transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
                                                "
                                                onmouseenter="this.style.background='var(--primary-light)'; this.style.color='var(--primary-dark)';"
                                                onmouseleave="this.style.background='var(--bg)'; this.style.color='var(--text-main)';"
                                                onmousedown="this.style.transform='scale(0.93)';"
                                                onmouseup="this.style.transform='scale(1)';">
                                            <span class="material-symbols-outlined" style="font-size: 20px;">edit</span>
                                        </button>

                                        <!-- Encabezado de la Tarjeta del Proveedor con espacio para el botón de editar -->
                                        <div style="display: flex; align-items: flex-start; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); padding-right: 44px;">
                                            <div style="
                                                width: 44px;
                                                height: 44px;
                                                border-radius: 50%;
                                                background: var(--surface);
                                                border: 1px solid var(--border);
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                overflow: hidden;
                                                flex-shrink: 0;
                                            ">
                                                ${sup.image_url ? `
                                                    <img src="${sup.image_url}" alt="${sup.name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';" />
                                                ` : `
                                                    <div style="font-weight: 800; font-size: 15px; color: ${cat.color};">
                                                        ${sup.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                `}
                                            </div>
                                            <div style="min-width: 0; flex: 1;">
                                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                                    <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: var(--text-main); line-height: 1.2;">
                                                        ${sup.name}
                                                    </h3>
                                                    <span style="font-size: 11px; padding: 2px 8px; border-radius: var(--radius-full); background: ${cat.bg}; color: ${cat.color}; font-weight: 700; border: 1px solid var(--border);">
                                                        ${cat.displayLabel}
                                                    </span>
                                                </div>
                                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 3px;">
                                                    <strong>${status.statusTitle}</strong> · <span>${status.statusSub}</span>
                                                    ${sup.phone ? ` · 📞 ${sup.phone}` : ''}
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Tabla / Lista de Productos del Proveedor -->
                                        <div style="display: flex; flex-direction: column; gap: 8px;">
                                            ${supItems.map(item => {
                                                const qty = cart[item.id] || 0;
                                                const unitStr = item.package_format || item.unit || 'Unidad';
                                                const key = `${sup.id}_${item.id}`;
                                                const isChecked = Boolean(this.consolidatedCheckedItems && this.consolidatedCheckedItems[key]);
                                                return `
                                                    <div id="consolidated-item-${key}"
                                                         onclick="window.suppliersManager.toggleConsolidatedItemCheck('${sup.id}', '${item.id}')"
                                                         title="${isEn ? 'Click to toggle done / checked' : 'Toca para marcar o tachar como completado'}"
                                                         style="
                                                             display: flex;
                                                             align-items: center;
                                                             justify-content: space-between;
                                                             padding: 9px 12px;
                                                             background: ${isChecked ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg)'};
                                                             border: 1px solid ${isChecked ? 'rgba(16, 185, 129, 0.35)' : 'var(--border)'};
                                                             border-radius: var(--radius-md);
                                                             gap: 10px;
                                                             cursor: pointer;
                                                             user-select: none;
                                                             opacity: ${isChecked ? '0.62' : '1'};
                                                             transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                                                         "
                                                         onmouseenter="if (!${isChecked}) this.style.background='rgba(0,0,0,0.02)';"
                                                         onmouseleave="if (!${isChecked}) this.style.background='var(--bg)';">
                                                        
                                                        <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                                                            <!-- Checkbox / Checkmark Circular Interactivo -->
                                                            <span class="material-symbols-outlined consolidated-check-icon" style="
                                                                font-size: 22px;
                                                                color: ${isChecked ? 'var(--primary)' : 'var(--border)'};
                                                                flex-shrink: 0;
                                                                transition: color 0.15s ease, transform 0.15s ease;
                                                            ">${isChecked ? 'check_circle' : 'radio_button_unchecked'}</span>

                                                            <div style="
                                                                width: 32px;
                                                                height: 32px;
                                                                border-radius: 8px;
                                                                background: var(--surface);
                                                                border: 1px solid var(--border);
                                                                display: flex;
                                                                align-items: center;
                                                                justify-content: center;
                                                                overflow: hidden;
                                                                flex-shrink: 0;
                                                            ">
                                                                ${item.image_url ? `
                                                                    <img src="${item.image_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';" />
                                                                ` : `
                                                                    <span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-secondary);">photo_camera</span>
                                                                `}
                                                            </div>
                                                            <div style="min-width: 0; flex: 1;">
                                                                <span class="consolidated-item-name" style="
                                                                    font-size: 13.5px;
                                                                    font-weight: 700;
                                                                    color: var(--text-main);
                                                                    text-decoration: ${isChecked ? 'line-through' : 'none'};
                                                                    transition: text-decoration 0.15s ease;
                                                                ">${item.name}</span>
                                                                <span class="consolidated-item-unit" style="
                                                                    font-size: 11.5px;
                                                                    color: var(--text-secondary);
                                                                    margin-left: 6px;
                                                                    text-decoration: ${isChecked ? 'line-through' : 'none'};
                                                                ">(${unitStr})</span>
                                                            </div>
                                                        </div>

                                                        <div class="consolidated-item-badge" style="
                                                            font-size: 13px;
                                                            font-weight: 800;
                                                            color: var(--primary-dark);
                                                            background: var(--primary-light);
                                                            padding: 4px 10px;
                                                            border-radius: var(--radius-full);
                                                            white-space: nowrap;
                                                            display: inline-flex;
                                                            align-items: center;
                                                            gap: 4px;
                                                            opacity: ${isChecked ? '0.7' : '1'};
                                                            text-decoration: ${isChecked ? 'line-through' : 'none'};
                                                            transition: opacity 0.15s ease;
                                                            flex-shrink: 0;
                                                        ">
                                                            <span>${qty}</span> <span style="font-size: 11px; font-weight: 600; opacity: 0.85;">${isEn ? 'ordered' : 'solicitados'}</span>
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>

                                        <!-- Notas del Proveedor si existen -->
                                        ${notes ? `
                                            <div style="font-size: 12.5px; color: var(--text-secondary); background: var(--bg); padding: 8px 12px; border-radius: var(--radius-md); border-left: 3px solid var(--primary);">
                                                <strong>${isEn ? 'Note:' : 'Nota:'}</strong> ${notes}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>


                    `}
                </div>
            `;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        /** Regresa desde el consolidado a la pantalla de armar pedido del proveedor activo o del primero disponible */
        backToOrderForm() {
            if (!this.activeOrderSupplierId && this.suppliers.length > 0) {
                this.activeOrderSupplierId = this.suppliers[0].id;
            }
            this.currentSubView = 'order-form';
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('view', 'suppliers');
                url.searchParams.delete('subview');
                if (this.activeOrderSupplierId) {
                    url.searchParams.set('order', this.activeOrderSupplierId);
                }
                window.history.replaceState({}, '', url);
            } catch (e) {}
            this.renderOrderPage();
        }

        /** Construye un texto general formateado con los pedidos de TODOS los proveedores */
        buildAllOrdersSummary() {
            const isEn = this.isEnglish();
            const activeSuppliers = this.suppliers.filter(s => {
                const cart = this.orderCart[s.id] || {};
                return Object.values(cart).some(q => q > 0);
            });

            if (activeSuppliers.length === 0) return null;

            const nowStr = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            let text = `🛒 *${isEn ? 'GENERAL ORDER SUMMARY - RECIPE PANTRY' : 'RESUMEN GENERAL DE PEDIDOS - RECIPE PANTRY'}*\n` +
                       `📅 ${isEn ? 'Date' : 'Fecha'}: ${nowStr}\n` +
                       `🏢 ${isEn ? 'Suppliers' : 'Proveedores con pedido'}: ${activeSuppliers.length}\n` +
                       `====================================\n\n`;

            activeSuppliers.forEach((sup, idx) => {
                const status = this.getDeliveryStatus(sup);
                const cart = this.orderCart[sup.id] || {};
                const supItems = this.items.filter(it => it.supplier_id === sup.id && (cart[it.id] || 0) > 0);
                const notes = this.orderNotes[sup.id] || '';

                text += `📦 *${idx + 1}. ${sup.name.toUpperCase()}*\n`;
                text += `🚚 ${status.statusTitle} (${status.statusSub})\n`;
                if (sup.phone) text += `📞 Tel: ${sup.phone}\n`;
                text += `------------------------------------\n`;
                supItems.forEach(it => {
                    const qty = cart[it.id];
                    const unitStr = it.package_format || it.unit ? ` (${it.package_format || it.unit})` : '';
                    text += `▫️ *${qty}x* ${it.name}${unitStr}\n`;
                });
                if (notes) {
                    text += `📝 *${isEn ? 'Notes' : 'Nota'}*: ${notes}\n`;
                }
                text += `\n`;
            });

            text += `====================================\n*Recipe Pantry Management*`;
            return text;
        }

        /** Copia el consolidado de todos los pedidos al portapapeles */
        async copyAllOrdersText() {
            const isEn = this.isEnglish();
            const text = this.buildAllOrdersSummary();
            if (!text) {
                this.notify(isEn ? 'No products selected in any order' : 'No hay productos seleccionados en ningún pedido', 'warning');
                return;
            }

            try {
                await navigator.clipboard.writeText(text);
                this.notify(isEn ? '📋 Consolidated orders copied to clipboard!' : '📋 ¡Pedido consolidado de todos los proveedores copiado!', 'success');
            } catch (e) {
                this.notify('No se pudo copiar automáticamente', 'error');
            }
        }

        /** Vacía todos los pedidos del carrito tras confirmación */
        
        /**
         * Marca o desmarca un ítem como tachado / completado en la lista consolidada
         */
        toggleConsolidatedItemCheck(supplierId, itemId) {
            if (!this.consolidatedCheckedItems) this.consolidatedCheckedItems = {};
            const key = `${supplierId}_${itemId}`;
            const isChecked = !this.consolidatedCheckedItems[key];
            this.consolidatedCheckedItems[key] = isChecked;

            try {
                sessionStorage.setItem('rp_consolidated_checked', JSON.stringify(this.consolidatedCheckedItems));
            } catch (e) {}

            const rowEl = document.getElementById(`consolidated-item-${key}`);
            if (rowEl) {
                const checkIcon = rowEl.querySelector('.consolidated-check-icon');
                const nameEl = rowEl.querySelector('.consolidated-item-name');
                const unitEl = rowEl.querySelector('.consolidated-item-unit');
                const qtyBadge = rowEl.querySelector('.consolidated-item-badge');

                if (isChecked) {
                    rowEl.style.background = 'rgba(16, 185, 129, 0.05)';
                    rowEl.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                    rowEl.style.opacity = '0.62';
                    if (checkIcon) {
                        checkIcon.textContent = 'check_circle';
                        checkIcon.style.color = 'var(--primary)';
                        checkIcon.style.transform = 'scale(1.15)';
                        setTimeout(() => { if (checkIcon) checkIcon.style.transform = 'scale(1)'; }, 150);
                    }
                    if (nameEl) nameEl.style.textDecoration = 'line-through';
                    if (unitEl) unitEl.style.textDecoration = 'line-through';
                    if (qtyBadge) {
                        qtyBadge.style.opacity = '0.7';
                        qtyBadge.style.textDecoration = 'line-through';
                    }
                } else {
                    rowEl.style.background = 'var(--bg)';
                    rowEl.style.borderColor = 'var(--border)';
                    rowEl.style.opacity = '1';
                    if (checkIcon) {
                        checkIcon.textContent = 'radio_button_unchecked';
                        checkIcon.style.color = 'var(--border)';
                    }
                    if (nameEl) nameEl.style.textDecoration = 'none';
                    if (unitEl) unitEl.style.textDecoration = 'none';
                    if (qtyBadge) {
                        qtyBadge.style.opacity = '1';
                        qtyBadge.style.textDecoration = 'none';
                    }
                }
            }
        }

        clearAllOrders() {
            const isEn = this.isEnglish();
            if (!confirm(isEn ? 'Clear all orders for all suppliers?' : '¿Deseas vaciar los pedidos de todos los proveedores?')) {
                return;
            }
            this.orderCart = {};
            this.orderNotes = {};
            this.consolidatedCheckedItems = {};
            try { sessionStorage.removeItem('rp_consolidated_checked'); } catch (e) {}
            this.saveCache();
            this.renderConsolidatedOrdersPage();
            this.notify(isEn ? 'All orders cleared' : 'Todos los pedidos fueron vaciados', 'info');
        }


        /**
         * Menú de 3 puntos M3 Expressive para el Pedido Consolidado
         * Muestra opciones para Copiar Todo y Vaciar en Bottom Sheet táctil en móvil
         * o Menú emergente M3 en escritorio.
         */
                closeConsolidatedMoreMenu() {
            const existingMenu = document.getElementById('consolidatedMoreMenu');
            const existingBackdrop = document.getElementById('consolidatedMenuBackdrop');
            if (existingMenu) existingMenu.remove();
            if (existingBackdrop) existingBackdrop.remove();
        }

        /**
         * Barra Flotante de Herramientas (Floating Toolbar) M3 Expressive para el Pedido Consolidado
         * (WhatsApp, Descargar PDF, Copiar Texto, Vaciar)
         */
        showConsolidatedMoreMenu(event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }

            const existingMenu = document.getElementById('consolidatedMoreMenu');
            if (existingMenu) {
                this.closeConsolidatedMoreMenu();
                return;
            }

            this.closeConsolidatedMoreMenu();

            const isEn = this.isEnglish();
            const openTime = Date.now();

            const backdrop = document.createElement('div');
            backdrop.id = 'consolidatedMenuBackdrop';
            backdrop.className = 'm3-sheet-backdrop';
            backdrop.style.cssText = `
                position: fixed;
                inset: 0;
                z-index: 2990;
                background: rgba(15, 23, 42, 0.45);
                animation: fadeIn 0.2s ease;
            `;
            backdrop.onclick = (e) => {
                if (Date.now() - openTime < 200) return;
                this.closeConsolidatedMoreMenu();
            };
            document.body.appendChild(backdrop);

            const sheet = document.createElement('div');
            sheet.id = 'consolidatedMoreMenu';
            sheet.className = 'm3-modal-bottom-sheet';
            sheet.style.cssText = `
                position: fixed !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                width: 100% !important;
                max-width: 520px !important;
                margin: 0 auto !important;
                z-index: 3005 !important;
                background: var(--surface, #ffffff) !important;
                border-radius: 28px 28px 0 0 !important;
                padding: 12px 20px calc(24px + env(safe-area-inset-bottom, 0px)) 20px !important;
                box-shadow: 0 -8px 36px rgba(0, 0, 0, 0.22) !important;
                font-family: var(--font-display);
                animation: slideUpM3 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                box-sizing: border-box;
            `;

            sheet.innerHTML = `
                <div style="width: 38px; height: 4px; background: var(--border); border-radius: 2px; margin: 4px auto 16px auto;"></div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
                        ${isEn ? 'Consolidated Order Options' : 'Opciones del Pedido Consolidado'}
                    </div>
                    <button type="button" 
                            onclick="window.suppliersManager.closeConsolidatedMoreMenu()" 
                            style="width: 32px; height: 32px; background: transparent; border: none; border-radius: var(--radius-full); cursor: pointer; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; padding: 0;">
                        <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
                    </button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button type="button" 
                            onclick="window.suppliersManager.closeConsolidatedMoreMenu(); window.suppliersManager.shareConsolidatedOrdersPDF();"
                            style="
                                width: 100%;
                                display: flex;
                                align-items: center;
                                gap: 14px;
                                padding: 12px 14px;
                                border-radius: var(--radius-lg);
                                border: 1px solid var(--border);
                                background: var(--bg);
                                color: var(--text-main);
                                font-size: 14px;
                                font-weight: 700;
                                cursor: pointer;
                                transition: background 0.15s ease;
                                font-family: var(--font-display);
                                text-align: left;
                            "
                            onmouseenter="this.style.background='var(--primary-light)'"
                            onmouseleave="this.style.background='var(--bg)'">
                        <span class="material-symbols-outlined" style="font-size: 24px; color: #10b981;">chat</span>
                        <div style="flex: 1;">
                            <div style="line-height: 1.2;">${isEn ? 'Send via WhatsApp' : 'Enviar por WhatsApp'}</div>
                            <div style="font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-top: 2px;">${isEn ? 'Official PDF receipt with all orders' : 'Recibo PDF oficial con todos los pedidos'}</div>
                        </div>
                    </button>

                    <button type="button" 
                            onclick="window.suppliersManager.closeConsolidatedMoreMenu(); window.suppliersManager.downloadConsolidatedOrdersPDF();"
                            style="
                                width: 100%;
                                display: flex;
                                align-items: center;
                                gap: 14px;
                                padding: 12px 14px;
                                border-radius: var(--radius-lg);
                                border: 1px solid var(--border);
                                background: var(--bg);
                                color: var(--text-main);
                                font-size: 14px;
                                font-weight: 700;
                                cursor: pointer;
                                transition: background 0.15s ease;
                                font-family: var(--font-display);
                                text-align: left;
                            "
                            onmouseenter="this.style.background='var(--primary-light)'"
                            onmouseleave="this.style.background='var(--bg)'">
                        <span class="material-symbols-outlined" style="font-size: 24px; color: #ef4444;">picture_as_pdf</span>
                        <div style="flex: 1;">
                            <div style="line-height: 1.2;">${isEn ? 'Download PDF' : 'Descargar Recibo en PDF'}</div>
                            <div style="font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-top: 2px;">${isEn ? 'Formatted printable orders ticket' : 'Ticket imprimible con productos agrupados'}</div>
                        </div>
                    </button>

                    <button type="button" 
                            onclick="window.suppliersManager.closeConsolidatedMoreMenu(); window.suppliersManager.copyAllOrdersText();"
                            style="
                                width: 100%;
                                display: flex;
                                align-items: center;
                                gap: 14px;
                                padding: 12px 14px;
                                border-radius: var(--radius-lg);
                                border: 1px solid var(--border);
                                background: var(--bg);
                                color: var(--text-main);
                                font-size: 14px;
                                font-weight: 700;
                                cursor: pointer;
                                transition: background 0.15s ease;
                                font-family: var(--font-display);
                                text-align: left;
                            "
                            onmouseenter="this.style.background='var(--primary-light)'"
                            onmouseleave="this.style.background='var(--bg)'">
                        <span class="material-symbols-outlined" style="font-size: 24px; color: var(--primary-dark);">content_copy</span>
                        <div style="flex: 1;">
                            <div style="line-height: 1.2;">${isEn ? 'Copy Orders Text' : 'Copiar Texto del Pedido'}</div>
                            <div style="font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-top: 2px;">${isEn ? 'Plain text to clipboard' : 'Copia la lista al portapapeles'}</div>
                        </div>
                    </button>

                    <button type="button" 
                            onclick="window.suppliersManager.closeConsolidatedMoreMenu(); window.suppliersManager.clearAllOrders();"
                            style="
                                width: 100%;
                                display: flex;
                                align-items: center;
                                gap: 14px;
                                padding: 12px 14px;
                                border-radius: var(--radius-lg);
                                border: 1px solid rgba(239, 68, 68, 0.25);
                                background: rgba(239, 68, 68, 0.05);
                                color: #dc2626;
                                font-size: 14px;
                                font-weight: 700;
                                cursor: pointer;
                                transition: background 0.15s ease;
                                font-family: var(--font-display);
                                text-align: left;
                            "
                            onmouseenter="this.style.background='rgba(239, 68, 68, 0.12)'"
                            onmouseleave="this.style.background='rgba(239, 68, 68, 0.05)'">
                        <span class="material-symbols-outlined" style="font-size: 24px; color: #dc2626;">delete_sweep</span>
                        <div style="flex: 1;">
                            <div style="line-height: 1.2;">${isEn ? 'Clear All Orders' : 'Vaciar Todos los Pedidos'}</div>
                            <div style="font-size: 12px; font-weight: 500; color: #ef4444; opacity: 0.9; margin-top: 2px;">${isEn ? 'Reset all quantities to zero' : 'Pone a cero las cantidades de todos los proveedores'}</div>
                        </div>
                    </button>
                </div>
            `;

            document.body.appendChild(sheet);
        }

        closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) modal.classList.add('hidden');
        }

        /**
         * Genera un documento PDF formateado como recibo / ticket oficial con todos los productos pedidos
         * @param {string|null} targetSupplierId Si se especifica, genera el recibo solo para este proveedor
         * @returns {Object} { blob, filename, doc }
         */
        buildOrdersReceiptPDF(targetSupplierId = null) {
            const jsPDFClass = window.jspdf ? window.jspdf.jsPDF : null;
            if (!jsPDFClass) {
                console.error('[SuppliersManager] jsPDF library is not loaded');
                return null;
            }

            const isEn = this.isEnglish();
            const doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const marginX = 14;
            const pageWidth = 210;
            const contentWidth = pageWidth - (marginX * 2);
            let y = 18;

            // Obtener todos los IDs de proveedores que tienen productos en el carrito
            let supplierIdsInCart = Object.keys(this.orderCart || {}).filter(sId => {
                const c = this.orderCart[sId] || {};
                return Object.values(c).some(q => (parseInt(q, 10) || 0) > 0);
            });

            if (targetSupplierId) {
                supplierIdsInCart = supplierIdsInCart.filter(sId => String(sId).toLowerCase() === String(targetSupplierId).toLowerCase());
            }

            if (supplierIdsInCart.length === 0) {
                this.notify(isEn ? 'No products selected in order' : 'No hay productos seleccionados en el pedido', 'warning');
                return null;
            }

            const now = new Date();
            const dateStr = now.toLocaleDateString(isEn ? 'en-US' : 'es-ES', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            const timeStr = now.toLocaleTimeString(isEn ? 'en-US' : 'es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });

            // Contar total de unidades y líneas
            let grandTotalUnits = 0;
            let grandTotalLines = 0;
            supplierIdsInCart.forEach(sId => {
                const c = this.orderCart[sId] || {};
                Object.values(c).forEach(q => {
                    const num = parseInt(q, 10) || 0;
                    if (num > 0) {
                        grandTotalUnits += num;
                        grandTotalLines += 1;
                    }
                });
            });

            // 1. Encabezado Oficial Estilo Recibo / Ticket
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(13, 122, 80); // #0d7a50 Brand Green
            doc.text('RECIPE PANTRY', marginX, y);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(100, 100, 100);
            doc.text(isEn ? 'WHOLESALE SUPPLIERS ORDER RECEIPT' : 'RECIBO DE PEDIDO A PROVEEDORES', pageWidth - marginX, y, { align: 'right' });

            y += 7;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(26, 28, 25);
            doc.text(targetSupplierId ? (isEn ? 'PURCHASE ORDER RECEIPT' : 'RECIBO DE PEDIDO A PROVEEDOR') : (isEn ? 'CONSOLIDATED ORDERS SUMMARY' : 'RESUMEN CONSOLIDADO DE PEDIDOS'), marginX, y);

            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(80, 80, 80);
            doc.text(`${isEn ? 'Date' : 'Fecha'}: ${dateStr} - ${timeStr}`, marginX, y);
            doc.text(`${supplierIdsInCart.length} ${isEn ? 'Supplier(s)' : 'Proveedor(es)'}  |  ${grandTotalLines} ${isEn ? 'Products' : 'Productos'} (${grandTotalUnits} ${isEn ? 'units' : 'uds.'})`, pageWidth - marginX, y, { align: 'right' });

            y += 4;
            doc.setDrawColor(200, 200, 200);
            doc.setLineDash([2, 1.5], 0);
            doc.line(marginX, y, pageWidth - marginX, y);
            doc.setLineDash([], 0);

            y += 8;

            // 2. Secciones por Proveedor
            supplierIdsInCart.forEach((supId, idx) => {
                const sup = (this.suppliers || []).find(s => String(s.id).toLowerCase() === String(supId).toLowerCase()) || {
                    id: supId,
                    name: isEn ? 'Supplier' : 'Proveedor',
                    category: 'otros',
                    phone: ''
                };

                const status = this.getDeliveryStatus(sup);
                const cart = this.orderCart[supId] || {};
                const notes = this.orderNotes[supId] || '';
                const cat = this.getCategoryObj(sup.category);

                // Extraer de forma directa y garantizada todos los items con cantidad > 0
                const selectedItems = [];
                for (const [itemId, rawQty] of Object.entries(cart)) {
                    const qty = parseInt(rawQty, 10) || 0;
                    if (qty > 0) {
                        const it = (this.items || []).find(i => String(i.id).toLowerCase() === String(itemId).toLowerCase());
                        selectedItems.push({
                            id: itemId,
                            name: it?.name || `Producto (${itemId.substring(0, 8)})`,
                            unit: it?.package_format || it?.unit || (isEn ? 'Unit' : 'Unidad'),
                            qty: qty
                        });
                    }
                }

                if (selectedItems.length === 0) return;

                if (y > 235) {
                    doc.addPage();
                    y = 18;
                }

                // Tarjeta / Barra del Proveedor
                doc.setFillColor(242, 247, 244);
                doc.roundedRect(marginX, y, contentWidth, 12, 2, 2, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10.5);
                doc.setTextColor(13, 122, 80);
                const supTitle = `${idx + 1}. ${sup.name.toUpperCase()} (${cat.displayLabel || cat.label || 'Proveedor'})`;
                doc.text(supTitle, marginX + 4, y + 7.5);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(80, 80, 80);
                const supInfo = `${sup.phone ? 'Tel: ' + sup.phone + ' | ' : ''}${status.statusTitle} (${status.statusSub})`;
                doc.text(supInfo, pageWidth - marginX - 4, y + 7.5, { align: 'right' });

                y += 15;

                // Encabezados de Tabla de Productos
                doc.setFillColor(232, 237, 234);
                doc.rect(marginX, y, contentWidth, 6, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(60, 60, 60);
                doc.text(isEn ? 'QTY' : 'CANT.', marginX + 4, y + 4.2);
                doc.text(isEn ? 'PRODUCT' : 'PRODUCTO', marginX + 26, y + 4.2);
                doc.text(isEn ? 'UNIT / FORMAT' : 'UNIDAD / FORMATO', pageWidth - marginX - 4, y + 4.2, { align: 'right' });

                y += 7;

                // Lista de Productos garantizada
                selectedItems.forEach((item, itemIdx) => {
                    if (y > 265) {
                        doc.addPage();
                        y = 18;
                    }

                    if (itemIdx % 2 === 1) {
                        doc.setFillColor(249, 251, 250);
                        doc.rect(marginX, y - 1, contentWidth, 7, 'F');
                    }

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(9);
                    doc.setTextColor(13, 122, 80);
                    doc.text(`${item.qty}x`, marginX + 4, y + 3.8);

                    // Truncado defensivo del nombre para evitar colisión con unidad
                    let displayName = item.name;
                    const maxNameWidth = contentWidth - 48;
                    if (doc.getTextWidth(displayName) > maxNameWidth) {
                        while (displayName.length > 5 && doc.getTextWidth(displayName + '...') > maxNameWidth) {
                            displayName = displayName.substring(0, displayName.length - 1);
                        }
                        displayName += '...';
                    }

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(9);
                    doc.setTextColor(30, 30, 30);
                    doc.text(displayName, marginX + 26, y + 3.8);

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8.5);
                    doc.setTextColor(100, 100, 100);
                    doc.text(item.unit, pageWidth - marginX - 4, y + 3.8, { align: 'right' });

                    y += 7.5;
                });

                // Nota al Proveedor si existe
                if (notes) {
                    if (y > 265) {
                        doc.addPage();
                        y = 18;
                    }
                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(8.5);
                    doc.setTextColor(80, 80, 80);
                    doc.text(`${isEn ? 'Order Note' : 'Nota al proveedor'}: ${notes}`, marginX + 4, y + 4);
                    y += 7;
                }

                y += 5;
            });

            // Pie de Página del Documento
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(130, 130, 130);
            doc.text(isEn ? 'Generated automatically by Recipe Pantry · Official Order Receipt' : 'Documento generado automáticamente por Recipe Pantry · Recibo de pedido oficial', pageWidth / 2, 287, { align: 'center' });

            const blob = doc.output('blob');
            const dateISO = now.toISOString().split('T')[0];
            const filename = targetSupplierId ? `Recibo_Pedido_${dateISO}.pdf` : `Recibo_Pedidos_${dateISO}.pdf`;

            return { blob, filename, doc };
        }

        /**
         * Envía el pedido en formato Recibo PDF a través de WhatsApp (con Web Share API o descarga)
         * @param {string|null} targetSupplierId Si se especifica, envía solo el recibo de este proveedor
         */
        async shareConsolidatedOrdersPDF(targetSupplierId = null) {
            const isEn = this.isEnglish();
            const res = this.buildOrdersReceiptPDF(targetSupplierId);
            if (!res) return;

            const { blob, filename } = res;
            const file = new File([blob], filename, { type: 'application/pdf' });

            // 1. Si el dispositivo soporta compartir archivos nativamente (móviles Android e iOS)
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: isEn ? 'Order Receipt' : 'Recibo de Pedido',
                        text: isEn ? 'Attached is the wholesale order receipt (PDF).' : 'Adjunto el recibo de pedido a proveedores en formato PDF.',
                        files: [file]
                    });
                    this.notify(isEn ? 'Order receipt shared!' : '¡Recibo de pedido compartido!', 'success');
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return; // Cancelado por el usuario
                    console.warn('[SuppliersManager] navigator.share error:', err);
                }
            }

            // 2. Si no soporta compartir archivos directamente (PC / Escritorio):
            // Descarga automáticamente el PDF del recibo
            this.downloadBlob(blob, filename);

            // Abre WhatsApp con mensaje descriptivo y enlace
            const textMsg = encodeURIComponent(
                isEn 
                    ? `📄 *ORDER RECEIPT - RECIPE PANTRY*\n\nThe order receipt has been generated in PDF format (${filename}). Please find it attached.` 
                    : `📄 *RECIBO DE PEDIDO - RECIPE PANTRY*\n\nHe generado el recibo oficial de pedidos en formato PDF (${filename}) con el desglose de todos los productos y cantidades solicitadas.`
            );
            const waUrl = `https://wa.me/?text=${textMsg}`;
            window.open(waUrl, '_blank');

            this.notify(
                isEn ? 'PDF Receipt downloaded! Attach it to your WhatsApp chat.' : '¡Recibo PDF descargado! Adjúntalo en tu chat de WhatsApp.', 
                'success'
            );
        }

        /** Descarga directa del archivo PDF del recibo */
        downloadConsolidatedOrdersPDF(targetSupplierId = null) {
            const isEn = this.isEnglish();
            const res = this.buildOrdersReceiptPDF(targetSupplierId);
            if (!res) return;
            this.downloadBlob(res.blob, res.filename);
            this.notify(isEn ? 'PDF Receipt downloaded!' : '¡Recibo PDF descargado correctamente!', 'success');
        }

        /** Helper para descargar cualquier Blob en el navegador */
        downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 1000);
        }
                /** Barra Flotante de Herramientas (Floating Toolbar) M3 Expressive para opciones del pedido */
        showOrderPageMoreMenu(event, supplierId) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            // Toggle: si ya está abierta, cerrarla
            const existingMenu = document.getElementById('orderMoreMenuDropdown');
            if (existingMenu) {
                this.closeOrderPageMoreMenu();
                return;
            }

            this.closeOrderPageMoreMenu();

            const isEn = this.isEnglish();
            const trigger = event?.currentTarget || document.getElementById('btnOrderPageMore');
            const rect = trigger?.getBoundingClientRect() || { bottom: 60, right: window.innerWidth - 16 };

            const openTime = Date.now();
            let backdrop = document.getElementById('orderMoreMenuBackdrop');
            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.id = 'orderMoreMenuBackdrop';
                backdrop.style.cssText = 'position: fixed; inset: 0; z-index: 9999; background: transparent;';
                backdrop.onclick = (e) => {
                    if (Date.now() - openTime < 200) return;
                    this.closeOrderPageMoreMenu();
                };
                document.body.appendChild(backdrop);
            } else {
                backdrop.style.display = 'block';
            }

            let menu = document.createElement('div');
            menu.id = 'orderMoreMenuDropdown';
            menu.className = 'm3-floating-toolbar order-floating-toolbar';

            // Posicionar como Toolbar Flotante M3 directamente anclada a los 3 puntos
            const topPos = Math.round(rect.bottom + 6);
            const rightPos = Math.max(12, Math.round(window.innerWidth - rect.right));

            menu.style.top = `${topPos}px`;
            menu.style.right = `${rightPos}px`;
            menu.style.maxWidth = 'calc(100vw - 24px)';

            menu.innerHTML = `
                <button type="button" 
                        class="m3-toolbar-item-btn danger" 
                        onclick="event.stopPropagation(); window.suppliersManager.closeOrderPageMoreMenu(); window.suppliersManager.clearAllOrdersFromOrderPage('${supplierId}');" 
                        title="${isEn ? 'Clear Quantities' : 'Limpiar Cantidades'}">
                    <span class="material-symbols-outlined" style="pointer-events: none;">restart_alt</span>
                    <span>${isEn ? 'Clear' : 'Limpiar'}</span>
                </button>
                
                <div class="m3-toolbar-divider"></div>
                <button type="button" 
                        class="m3-toolbar-item-btn" 
                        onclick="event.stopPropagation(); window.suppliersManager.closeOrderPageMoreMenu();" 
                        title="${isEn ? 'Close' : 'Cerrar'}"
                        style="padding: 0 8px; min-width: 32px;">
                    <span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-secondary); pointer-events: none;">close</span>
                </button>
            `;

            document.body.appendChild(menu);
        }

        closeOrderPageMoreMenu() {
            const backdrop = document.getElementById('orderMoreMenuBackdrop');
            if (backdrop) backdrop.remove();
            const menu = document.getElementById('orderMoreMenuDropdown');
            if (menu) menu.remove();
        }
    }

    window.suppliersManager = new SuppliersManager();
    window.openProductSideSheet = (productId) => window.suppliersManager?.openProductSideSheet(productId);
})();
