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

            // Restaurar estado de URL al inicializar (soporte para F5 dentro de un proveedor)
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const supplierParam = urlParams.get('supplier');
                if (supplierParam) {
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

        /** Carga instantánea de caché local */
        loadCache() {
            try {
                const s = localStorage.getItem('recipe_pantry_suppliers_cache');
                if (s) this.suppliers = JSON.parse(s);
                const it = localStorage.getItem('recipe_pantry_supplier_items_cache');
                if (it) this.items = JSON.parse(it);
                const cart = localStorage.getItem('recipe_pantry_supplier_cart');
                if (cart) this.orderCart = JSON.parse(cart);
            } catch (e) {
                console.warn('⚠️ Error al leer caché de proveedores:', e);
            }
        }

        /** Guarda datos en caché local */
        saveCache() {
            try {
                localStorage.setItem('recipe_pantry_suppliers_cache', JSON.stringify(this.suppliers));
                localStorage.setItem('recipe_pantry_supplier_items_cache', JSON.stringify(this.items));
                localStorage.setItem('recipe_pantry_supplier_cart', JSON.stringify(this.orderCart));
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
         * Confirmación de acciones destructivas.
         * Usa el Snackbar con acciones (showActionToast) del proyecto para mantener la
         * identidad M3 Expressive y evitar alert()/confirm() nativos. Si no está
         * disponible, cae a un diálogo modal M3 interno.
         * @param {string} title - Título del diálogo
         * @param {string} body - Mensaje descriptivo
         * @param {Function} onConfirm - Callback a ejecutar si el usuario confirma
         */
        _showConfirmDialog(title, body, onConfirm) {
            const isEn = this.isEnglish();
            const triggerAction = window.showActionToast || window.utils?.showActionToast;

            if (typeof triggerAction === 'function') {
                triggerAction({
                    message: `${title} ${body}`,
                    actionText: isEn ? 'Delete' : 'Eliminar',
                    cancelText: isEn ? 'Cancel' : 'Cancelar',
                    actionColor: 'var(--error)',
                    type: 'error',
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
                            background: color-mix(in srgb, var(--error) 14%, transparent);
                            color: var(--error);
                            display: flex; align-items: center; justify-content: center;
                            flex-shrink: 0;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 26px;">warning</span>
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
                            background: var(--error);
                            color: var(--on-primary, #fff);
                            font-weight: 700; font-size: 14px;
                            font-family: var(--font-display);
                            cursor: pointer;
                            transition: transform 0.15s var(--m3-easing, cubic-bezier(0.34, 1.56, 0.64, 1)), filter 0.15s ease;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                            <span>${isEn ? 'Delete' : 'Eliminar'}</span>
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

            const check = () => {
                this.updateVisibility();
                const currentView = document.documentElement.getAttribute('data-current-view') || 
                                    window.dashboard?.currentView;
                if (currentView === 'suppliers' && this.canAccessSuppliers()) {
                    this.render();
                }
            };

            window.addEventListener('auth-changed', check);
            window.addEventListener('auth-ready', check);
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', check);
            } else {
                check();
            }

            if (window.supabaseClient?.auth?.onAuthStateChange) {
                try {
                    window.supabaseClient.auth.onAuthStateChange(() => setTimeout(check, 80));
                } catch (e) {}
            }

            // Polling suave inicial para reaccionar inmediatamente en cuanto termine la autenticación
            let attempts = 0;
            const authPoll = setInterval(() => {
                attempts++;
                check();
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

                // 1. Cargar proveedores
                const { data: supData, error: supErr } = await sb
                    .from('suppliers')
                    .select('*')
                    .order('order_index', { ascending: true })
                    .order('name', { ascending: true });

                if (supErr) throw supErr;
                if (supData) this.suppliers = supData;

                // 2. Cargar productos
                const { data: itemData, error: itemErr } = await sb
                    .from('supplier_items')
                    .select('*')
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

            this.renderListPage();
        }

        /**
         * Renderiza el listado principal de proveedores en formato de lista M3 (igual al formato de recetas)
         */
        renderListPage() {
            if (!this.container) return;
            const isEn = this.isEnglish();

            this.container.innerHTML = `
                <div class="suppliers-view-container" style="max-width: 1200px; margin: 0 auto; padding: 20px 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Header Principal Plano (Sin caja, igual a Recetas) -->
                    <div class="suppliers-header-flat" style="margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="material-symbols-outlined" style="font-size: 26px; color: var(--primary-dark);">local_shipping</span>
                            <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em;">
                                ${isEn ? 'Suppliers & Orders' : 'Proveedores y Órdenes'}
                            </h2>
                        </div>
                        <p style="margin: 4px 0 0 0; font-size: 13.5px; color: var(--text-secondary);">
                            ${isEn ? 'Restaurant wholesale suppliers directory, delivery days, cutoff hours and catalog.' : 'Directorio de proveedores mayoristas, días de reparto, horario de corte y catálogo de productos.'}
                        </p>
                    </div>

                    <!-- Barra de Filtros Rápidos M3 y Estado de Búsqueda Global -->
                    <div class="suppliers-filters-container" style="
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        margin-bottom: 16px;
                    ">
                        <!-- Filtros tipo Pills M3 y Filtro por Tipo/Categoría -->
                        <div class="suppliers-filter-bar" style="display: flex; align-items: center; gap: 8px;">
                            <button type="button" class="supplier-filter-pill ${this.activeFilter === 'all' ? 'active' : ''}" 
                                onclick="window.suppliersManager.setFilter('all')">
                                <span class="material-symbols-outlined" style="font-size: 18px;">apps</span>
                                <span>${isEn ? 'All' : 'Todos'} (${this.suppliers.length})</span>
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

                        <!-- Indicador si hay búsqueda global activa -->
                        <div id="supplierSearchGlobalTag" style="${this.searchQuery ? 'display: inline-flex;' : 'display: none;'} align-items: center; gap: 6px; background: var(--secondary-light); border: 1px solid var(--border); color: var(--on-secondary); padding: 6px 14px; border-radius: var(--radius-full); font-size: 13px; font-weight: 700;">
                            <span class="material-symbols-outlined" style="font-size: 16px;">search</span>
                            <span>${isEn ? 'Searching:' : 'Buscando:'} "${this.searchQuery}"</span>
                            <button type="button" onclick="window.suppliersManager.clearSearch()" style="background: none; border: none; color: var(--on-secondary); cursor: pointer; font-size: 14px; padding: 0 0 0 4px; display: flex; align-items: center;" title="${isEn ? 'Clear' : 'Limpiar'}">✕</button>
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
                mount.innerHTML = `
                    <div style="
                        background: var(--bg);
                        border: 1.5px dashed var(--border);
                        border-radius: var(--radius-xl);
                        padding: 60px 20px;
                        text-align: center;
                    ">
                        <div style="
                            width: 68px;
                            height: 68px;
                            border-radius: 50%;
                            background: var(--secondary-light);
                            color: var(--primary-dark);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 16px auto;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 36px;">storefront</span>
                        </div>
                        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: var(--text-main);">
                            ${isEn ? 'No suppliers found' : 'No se encontraron proveedores'}
                        </h3>
                        <p style="margin: 0 0 20px 0; color: var(--text-secondary); font-size: 14px; max-width: 440px; margin-left: auto; margin-right: auto;">
                            ${this.searchQuery 
                                ? (isEn ? 'Try another search term or clear the filter.' : 'Prueba con otro término de búsqueda o limpia los filtros.')
                                : (isEn ? 'Register your first restaurant supplier to start organizing delivery days, products and orders.' : 'Registra tu primer proveedor para organizar los días de reparto, catálogo de productos con fotos y pedidos rápidos.')}
                        </p>
                        <button type="button" class="btn-supplier-save" onclick="window.suppliersManager.openSupplierForm()" style="
                            display: inline-flex;
                            align-items: center;
                            gap: 8px;
                            height: 42px;
                            padding: 0 22px;
                            border-radius: var(--radius-full);
                            font-weight: 700;
                            font-size: 14px;
                            cursor: pointer;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 20px;">add_business</span>
                            <span>${isEn ? 'Add First Supplier' : 'Crear Primer Proveedor'}</span>
                        </button>
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

                    <!-- 2. Sección del Proveedor (Nombre, Tipo y Menú de 3 puntos - Sin número de productos) -->
                    <div class="col-sup-info">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                                <span class="sup-primary-name" style="font-size: 16px; font-weight: 700; color: var(--text-main); letter-spacing: -0.01em;">${supplier.name}</span>
                            </div>

                            <!-- Botón de 3 puntos integrado dentro de esta sección -->
                            <button type="button" 
                                    class="btn-icon-m3 supplier-integrated-more-btn" 
                                    onclick="event.stopPropagation(); window.suppliersManager.showMoreOptions('${supplier.id}', event);"
                                    title="${isEn ? 'Options' : 'Opciones'}"
                                    style="flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; color: var(--text-secondary); display: inline-flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">more_vert</span>
                            </button>
                        </div>

                        <!-- Metadatos visibles en móvil (Tipo y Días con Círculos) -->
                        <div class="sup-mobile-meta">
                            <span class="supplier-type-pill-mobile" style="background: ${cat.bg}; color: ${cat.color};">
                                <span class="material-symbols-outlined" style="font-size: 12px;">${cat.icon}</span>
                                <span>${cat.displayLabel}</span>
                            </span>
                            ${activeDaysList.length > 0 ? `
                                <div class="supplier-days-pill-group" style="display: inline-flex; align-items: center; gap: 3px;">
                                    ${activeDaysList.map(d => `
                                        <div class="supplier-day-dot active" title="${isEn ? d.labelEn : d.label}: ${isEn ? 'Delivery' : 'Hace entrega'}">
                                            ${d.short}
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>

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

            let sheetHTML = `
                <div class="m3-sheet-drag-handle" title="${isEn ? 'Swipe or tap to expand' : 'Toca o desliza para expandir'}"></div>
                <div class="m3-sheet-header">
                    <h4>${supplier.name}</h4>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="display: inline-flex; align-items: center; gap: 4px; background: ${cat.bg}; color: ${cat.color}; padding: 2px 8px; border-radius: var(--radius-full); font-weight: 600;">
                            <span class="material-symbols-outlined" style="font-size: 13px;">${cat.icon}</span>
                            <span>${cat.displayLabel}</span>
                        </span>
                        <span>·</span>
                        ${activeDaysList.length > 0 ? `
                            <span>·</span>
                            <div class="supplier-days-pill-group" style="display: inline-flex; align-items: center; gap: 3px;">
                                ${activeDaysList.map(d => `
                                    <div class="supplier-day-dot active" style="width: 20px; height: 20px; font-size: 10px;" title="${isEn ? d.labelEn : d.label}: ${isEn ? 'Delivery' : 'Hace entrega'}">
                                        ${d.short}
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="m3-sheet-quick-row">
                    <button type="button" class="m3-quick-pill" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.openSupplierDetail('${supplier.id}');">
                        <span class="material-symbols-outlined">inventory_2</span>
                        <span>${isEn ? 'Products' : 'Productos'}</span>
                    </button>
                    <button type="button" class="m3-quick-pill" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.openOrderForm('${supplier.id}');">
                        <span class="material-symbols-outlined">shopping_cart_checkout</span>
                        <span>${isEn ? 'Order' : 'Pedido'}</span>
                    </button>
                    ${this.isSuperAdmin() ? `
                        <button type="button" class="m3-quick-pill" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.openSupplierForm('${supplier.id}');">
                            <span class="material-symbols-outlined">edit</span>
                            <span>${isEn ? 'Edit' : 'Editar'}</span>
                        </button>
                    ` : ''}
                </div>

                <button type="button" class="context-menu-item" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.openSupplierDetail('${supplier.id}');">
                    <span class="material-symbols-outlined">inventory_2</span>
                    <span>${isEn ? 'View Products & Catalog' : 'Ver Catálogo de Productos'}</span>
                </button>

                <button type="button" class="context-menu-item" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.openOrderForm('${supplier.id}');">
                    <span class="material-symbols-outlined">shopping_cart_checkout</span>
                    <span>${isEn ? 'Create Order' : 'Armar Pedido'} ${cartCount > 0 ? `(${cartCount})` : ''}</span>
                </button>

                ${this.isSuperAdmin() ? `
                    <button type="button" class="context-menu-item" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.openSupplierForm('${supplier.id}');">
                        <span class="material-symbols-outlined">edit</span>
                        <span>${isEn ? 'Edit Supplier' : 'Editar Proveedor'}</span>
                    </button>
                ` : ''}

                ${whatsappUrl ? `
                    <button type="button" class="context-menu-item" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.open('${whatsappUrl}', '_blank');">
                        <span class="material-symbols-outlined" style="color: #25D366;">chat</span>
                        <span>WhatsApp (${supplier.phone})</span>
                    </button>
                ` : ''}

                ${this.isSuperAdmin() ? `
                    <div class="context-menu-divider"></div>

                    <button type="button" class="context-menu-item danger" onclick="window.suppliersManager.closeSupplierBottomSheet(); window.suppliersManager.deleteSupplier('${supplier.id}');">
                        <span class="material-symbols-outlined">delete</span>
                        <span>${isEn ? 'Delete Supplier' : 'Eliminar Proveedor'}</span>
                    </button>
                ` : ''}
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

                    <!-- Tarjeta M3 Detalles de Entrega (Exacto al diseño móvil solicitado) -->
                    <div class="supplier-delivery-card-m3" style="
                        background: #e8f3ed;
                        border-radius: 20px;
                        padding: 18px 20px;
                        margin-bottom: 24px;
                    ">
                        <!-- Header de la tarjeta -->
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                            <span class="material-symbols-outlined" style="font-size: 18px; color: #1e7a46;">local_shipping</span>
                            <span style="font-size: 11.5px; font-weight: 800; color: #1b4d2e; text-transform: uppercase; letter-spacing: 0.06em;">
                                ${isEn ? 'DELIVERY DETAILS' : 'DETALLES DE ENTREGA'}
                            </span>
                        </div>

                        <!-- Fila Responsive: Días de reparto a la izquierda, Hora límite a la derecha en PC -->
                        <div style="display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px 28px; margin-bottom: 14px;">
                            <!-- Columna Izquierda: Días de reparto -->
                            <div style="flex: 1; min-width: 230px;">
                                <div style="font-size: 13px; font-weight: 700; color: #1e2922; margin-bottom: 8px;">
                                    ${isEn ? 'Delivery days' : 'Días de reparto'}
                                </div>
                                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                    ${this.DAYS.map(d => {
                                        const isActive = activeDays.includes(d.id);
                                        return `
                                            <div style="
                                                width: 26px;
                                                height: 26px;
                                                border-radius: 50%;
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                font-size: 11.5px;
                                                font-weight: 800;
                                                background: ${isActive ? '#1e7a46' : '#ffffff'};
                                                color: ${isActive ? '#ffffff' : '#9ca3af'};
                                                box-shadow: 0 1px 2px rgba(0,0,0,0.04);
                                            ">
                                                ${d.short}
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>

                            <!-- Columna Derecha: Hora límite y Próxima entrega (a la derecha en PC) -->
                            <div style="flex: 1; min-width: 260px;">
                                <div style="font-size: 13px; font-weight: 700; color: #1e2922; margin-bottom: 8px;">
                                    ${isEn ? 'Cut-off time:' : 'Hora límite:'}
                                </div>
                                <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                                    <!-- Pill Hora límite -->
                                    <div style="
                                        display: inline-flex;
                                        align-items: center;
                                        gap: 6px;
                                        background: #ffffff;
                                        padding: 6px 14px;
                                        border-radius: var(--radius-full);
                                        font-size: 13px;
                                        font-weight: 700;
                                        color: #1e2922;
                                        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
                                    ">
                                        <span class="material-symbols-outlined" style="font-size: 16px; color: #5a6660;">schedule</span>
                                        <span>${status.cutoffFormatted} hrs</span>
                                    </div>

                                    <!-- Pill Próxima entrega -->
                                    <div style="
                                        display: inline-flex;
                                        align-items: center;
                                        gap: 6px;
                                        background: #1e7a46;
                                        color: #ffffff;
                                        padding: 6px 14px;
                                        border-radius: var(--radius-full);
                                        font-size: 13px;
                                        font-weight: 700;
                                        box-shadow: 0 1px 3px rgba(30,122,70,0.25);
                                    ">
                                        <span class="material-symbols-outlined" style="font-size: 16px; color: #ffffff;">calendar_month</span>
                                        <span>${isEn ? 'Next delivery:' : 'Próxima entrega:'} ${nextDayName}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Notas / Instrucciones -->
                        <div>
                            <div style="font-size: 13px; font-weight: 700; color: #1e2922; margin-bottom: 4px;">
                                ${isEn ? 'Notes / Instructions:' : 'Notas / Instrucciones:'}
                            </div>
                            <div style="font-size: 13px; color: #3d4a42; line-height: 1.45;">
                                ${displayNotes}
                            </div>
                        </div>
                    </div>

                    <!-- Línea divisoria abajo de Detalles de Entrega -->
                    <hr style="border: none; border-top: 1px solid var(--border); margin: 0 0 24px 0;" />

                    <!-- Sección: Catálogo de Productos del Proveedor (Plano, sin caja y sin botón redundante) -->
                    <div style="margin: 0 0 12px 0;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="material-symbols-outlined" style="font-size: 22px; color: var(--primary-dark);">inventory_2</span>
                            <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--text-main); letter-spacing: -0.01em;">
                                ${isEn ? 'Product Catalog' : 'Catálogo de Productos'}
                            </h2>
                            <span style="font-size: 12px; font-weight: 700; color: var(--primary-dark); background: var(--primary-light); padding: 2px 8px; border-radius: var(--radius-full); border: 1px solid var(--border);">${supItems.length}</span>
                        </div>
                        <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
                            ${isEn ? 'Products available from this supplier with packaging and rapid order quantities.' : 'Insumos disponibles de este proveedor con formato y cantidades para pedido.'}
                        </p>
                    </div>

                    ${supItems.length === 0 ? `
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
                    ` : `
                        <div class="products-list-view">
                            <!-- Filas de productos M3 Expressive limpias con menú de 3 puntos -->
                            <div class="products-list-body" style="display: flex; flex-direction: column; gap: 4px;">
                                ${supItems.map(item => this.renderProductRow(item, supplier.id)).join('')}
                            </div>
                        </div>
                    `}
                </div>
            `;
        }

        /**
         * Renderiza una fila individual de producto limpia con menú de 3 puntos (sin stepper de más y menos)
         */
        renderProductRow(item, supplierId) {
            const isEn = this.isEnglish();

            return `
                <div class="product-row-dropbox" id="product-row-${item.id}">
                    <!-- 1. Foto / Avatar Circular Protagónico del Producto (Sin caja ni marco cuadrado) -->
                    <div style="width: 48px; height: 48px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: transparent;">
                        ${item.image_url ? `
                            <img src="${item.image_url}" 
                                 alt="${item.name}" 
                                 style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; box-shadow: 0 1px 4px rgba(0,0,0,0.12);" 
                                 loading="lazy" 
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div style="display: none; width: 100%; height: 100%; border-radius: 50%; background: var(--primary-light); color: var(--primary-dark); align-items: center; justify-content: center; font-weight: 800; font-size: 16px;">
                                ${item.name.substring(0, 2).toUpperCase()}
                            </div>
                        ` : `
                            <div style="width: 100%; height: 100%; border-radius: 50%; background: var(--primary-light); color: var(--primary-dark); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px;">
                                ${item.name.substring(0, 2).toUpperCase()}
                            </div>
                        `}
                    </div>

                    <!-- 2. Nombre del Producto y Formato / Categoría -->
                    <div class="col-sup-info" style="flex: 1; min-width: 0; padding-left: 4px;">
                        <span class="sup-primary-name" style="font-size: 15.5px; font-weight: 700; color: var(--text-main); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</span>
                        <div style="font-size: 12.5px; color: var(--text-secondary); margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            ${item.package_format || item.unit ? `<span style="font-weight: 600; color: var(--text-main);">${item.package_format || item.unit}</span>` : ''}
                            ${(item.package_format || item.unit) && item.category ? `<span>·</span>` : ''}
                            ${item.category ? `<span>${item.category}</span>` : ''}
                        </div>
                    </div>

                    <!-- 3. Acciones: En PC barra flotante en HOVER (como en Recetas), en Móvil botón de 3 puntos -->
                    <div class="product-row-actions-container" style="position: relative; display: flex; align-items: center; justify-content: flex-end;">
                        <!-- Barra de acciones en PC (aparece al pasar el ratón) -->
                        <div class="product-hover-actions">
                            <button type="button" 
                                    class="btn-icon-m3" 
                                    title="${isEn ? 'Edit Product' : 'Editar Producto'}" 
                                    onclick="event.stopPropagation(); window.suppliersManager.openItemModal('${item.id}', '${item.supplier_id}')"
                                    style="width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); color: var(--text-main); cursor: pointer; transition: all 0.15s ease;">
                                <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                            </button>
                            <button type="button" 
                                    class="btn-icon-m3" 
                                    title="${isEn ? 'Delete Product' : 'Eliminar Producto'}" 
                                    onclick="event.stopPropagation(); window.suppliersManager.deleteItem('${item.id}')"
                                    style="width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); color: var(--error); cursor: pointer; transition: all 0.15s ease;">
                                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                            </button>
                        </div>

                        <!-- Botón de 3 puntos (solo en móvil) -->
                        <button type="button" 
                                class="btn-icon-m3 product-mobile-more-btn" 
                                onclick="event.stopPropagation(); window.suppliersManager.showProductMoreOptions('${item.id}', event);"
                                title="${isEn ? 'Options' : 'Opciones'}"
                                style="width: 36px; height: 36px; border-radius: 50%; color: var(--text-secondary); align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; flex-shrink: 0;">
                            <span class="material-symbols-outlined" style="font-size: 20px;">more_vert</span>
                        </button>
                    </div>
                </div>
            `;
        }

        /**
         * Menú de 3 puntos para productos: abre Bottom Sheet M3 Expressive
         * Contiene opciones de "Editar Producto" y "Eliminar Producto"
         */
        showProductMoreOptions(itemId, event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }

            const trigger = (event && event.currentTarget) ? event.currentTarget : ((event?.target?.closest('button')) || event?.target);

            // Debounce / Toggle off si se vuelve a pulsar el mismo trigger
            if (this._lastMenuClosedItemId === String(itemId) && (Date.now() - (this._lastMenuClosedTime || 0)) < 350) {
                this._lastMenuClosedItemId = null;
                return;
            }

            const existingMenu = document.querySelector('.m3-modal-bottom-sheet, .dropbox-menu-m3');
            const existingBackdrop = document.getElementById('m3SheetBackdrop');
            if (existingMenu) {
                const isSameItem = existingMenu.dataset.itemId === String(itemId);
                existingMenu.remove();
                if (existingBackdrop) existingBackdrop.remove();
                if (isSameItem) return;
            }
            if (existingBackdrop) existingBackdrop.remove();

            const item = this.items.find(it => String(it.id) === String(itemId));
            if (!item) return;

            const isDesktop = window.innerWidth > 768;
            const isEn = this.isEnglish();

            // Modal Bottom Sheet M3 Expressive
            const menu = document.createElement('div');
            menu.className = 'm3-modal-bottom-sheet';
            menu.dataset.itemId = String(itemId);

            let sheetHTML = `
                <div class="m3-sheet-drag-handle" title="${isEn ? 'Swipe or tap to close' : 'Toca o desliza para cerrar'}"></div>
                <div class="m3-sheet-header" style="display: flex; align-items: center; gap: 12px;">
                    ${item.image_url ? `
                        <img src="${item.image_url}" alt="${item.name}" style="width: 44px; height: 44px; border-radius: 12px; object-fit: cover; flex-shrink: 0;" onerror="this.style.display='none';" />
                    ` : `
                        <div style="width: 44px; height: 44px; border-radius: 12px; background: var(--primary-light); color: var(--primary-dark); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <span class="material-symbols-outlined" style="font-size: 24px;">restaurant</span>
                        </div>
                    `}
                    <div style="min-width: 0; flex: 1;">
                        <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</h4>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            ${item.package_format || item.unit ? `<span>${item.package_format || item.unit}</span>` : ''}
                            ${(item.package_format || item.unit) && item.category ? `<span>·</span>` : ''}
                            ${item.category ? `<span>${item.category}</span>` : ''}
                        </div>
                    </div>
                </div>

                <div class="m3-sheet-quick-row">
                    <button type="button" class="m3-quick-pill" onclick="window.suppliersManager.closeProductBottomSheet(); window.suppliersManager.openItemModal('${item.id}', '${item.supplier_id}');">
                        <span class="material-symbols-outlined">edit</span>
                        <span>${isEn ? 'Edit' : 'Editar'}</span>
                    </button>
                    <button type="button" class="m3-quick-pill" style="color: var(--error);" onclick="window.suppliersManager.closeProductBottomSheet(); window.suppliersManager.deleteItem('${item.id}');">
                        <span class="material-symbols-outlined" style="color: var(--error);">delete</span>
                        <span>${isEn ? 'Delete' : 'Eliminar'}</span>
                    </button>
                </div>

                <button type="button" class="context-menu-item" onclick="window.suppliersManager.closeProductBottomSheet(); window.suppliersManager.openItemModal('${item.id}', '${item.supplier_id}');">
                    <span class="material-symbols-outlined">edit</span>
                    <span>${isEn ? 'Edit Product' : 'Editar Producto'}</span>
                </button>

                <div class="context-menu-divider"></div>

                <button type="button" class="context-menu-item danger" onclick="window.suppliersManager.closeProductBottomSheet(); window.suppliersManager.deleteItem('${item.id}');">
                    <span class="material-symbols-outlined">delete</span>
                    <span>${isEn ? 'Delete Product' : 'Eliminar Producto'}</span>
                </button>
            `;

            menu.innerHTML = sheetHTML;

            const backdrop = document.createElement('div');
            backdrop.className = 'm3-sheet-backdrop';
            backdrop.id = 'm3SheetBackdrop';
            backdrop.onclick = (e) => dismiss(e);
            document.body.appendChild(backdrop);
            document.body.appendChild(menu);

            // Control táctil de arrastre para cerrar
            let touchStartY = 0;
            let touchDiffY = 0;
            let initialHeight = 0;
            const smoothCurve = 'height 0.35s cubic-bezier(0.25, 1, 0.5, 1), transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';

            const measureBaseHeight = () => {
                if (menu.offsetHeight > 50) {
                    initialHeight = menu.offsetHeight;
                    menu.style.height = `${initialHeight}px`;
                }
            };
            requestAnimationFrame(measureBaseHeight);

            const dragHandle = menu.querySelector('.m3-sheet-drag-handle');
            if (dragHandle) {
                dragHandle.onclick = (e) => {
                    e.stopPropagation();
                    dismiss(e);
                };
            }

            menu.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
                touchDiffY = 0;
                if (!initialHeight) initialHeight = menu.offsetHeight || 260;
            }, { passive: true });

            menu.addEventListener('touchmove', (e) => {
                touchDiffY = e.touches[0].clientY - touchStartY;
                if (touchDiffY > 0) {
                    menu.style.transition = 'none';
                    menu.style.transform = isDesktop ? `translate(-50%, ${touchDiffY}px)` : `translateY(${touchDiffY}px)`;
                }
            }, { passive: true });

            menu.addEventListener('touchend', () => {
                menu.style.transition = smoothCurve;
                if (touchDiffY > 70) {
                    dismiss();
                } else {
                    menu.style.transform = isDesktop ? 'translateX(-50%)' : 'translateY(0)';
                }
                touchDiffY = 0;
            });

            const dismiss = (e) => {
                if (trigger && e && trigger.contains(e.target)) {
                    this._lastMenuClosedTime = Date.now();
                    this._lastMenuClosedItemId = String(itemId);
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

        closeProductBottomSheet() {
            const sheet = document.querySelector('.m3-modal-bottom-sheet, .dropbox-menu-m3');
            const backdrop = document.getElementById('m3SheetBackdrop');
            if (sheet) sheet.remove();
            if (backdrop) backdrop.remove();
        }

        /**
         * Alias para retrocompatibilidad
         */
        renderItemCard(item, supplierId) {
            return this.renderProductRow(item, supplierId);
        }

        /** Manejador de búsqueda sincronizado con el buscador global */
        handleSearch(val) {
            this.searchQuery = val ? val.trim() : '';
            const tag = document.getElementById('supplierSearchGlobalTag');
            if (tag) {
                if (this.searchQuery) {
                    const isEn = this.isEnglish();
                    tag.innerHTML = `
                        <span class="material-symbols-outlined" style="font-size: 16px;">search</span>
                        <span>${isEn ? 'Searching:' : 'Buscando:'} "${this.searchQuery}"</span>
                        <button type="button" onclick="window.suppliersManager.clearSearch()" style="background: none; border: none; color: var(--on-secondary); cursor: pointer; font-size: 14px; padding: 0 0 0 4px; display: flex; align-items: center;" title="${isEn ? 'Clear' : 'Limpiar'}">✕</button>
                    `;
                    tag.style.display = 'inline-flex';
                } else {
                    tag.style.display = 'none';
                }
            }
            this.renderContent();
        }

        /** Limpia la búsqueda global */
        clearSearch() {
            this.searchQuery = '';
            const searchInput = document.getElementById('searchInput');
            const clearBtn = document.getElementById('clearSearch');
            if (searchInput) searchInput.value = '';
            if (clearBtn) clearBtn.classList.add('hidden');
            const tag = document.getElementById('supplierSearchGlobalTag');
            if (tag) tag.style.display = 'none';
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
            }
        }

        // ==========================================
        // SUBVISTAS DE PÁGINA COMPLETA: Proveedor, Producto y Orden
        // (Adaptado al sistema como recipe-form, sin modales flotantes)
        // ==========================================

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
        openOrderForm(supplierId) {
            this.activeOrderSupplierId = supplierId;
            this.currentSubView = 'order-form';
            this.render();
        }

        /** Regresa a la vista de listado de proveedores */
        backToList() {
            this.currentSubView = 'list';
            this.selectedSupplierDetailId = null;
            this.editingSupplierId = null;
            this.editingItemId = null;
            this.activeOrderSupplierId = null;
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
                <div class="suppliers-subview-page" style="max-width: 760px; margin: 0 auto; padding: 16px 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Top Bar: Solo botón circular de volver atrás (Botones repetidos eliminados) -->
                    <div style="display: flex; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                        <button type="button" 
                                onclick="window.suppliersManager.backToList()" 
                                class="btn-icon-m3" 
                                title="${isEn ? 'Back to Suppliers' : 'Volver a Proveedores'}" 
                                style="width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-main); transition: all 0.2s var(--m3-easing);">
                            <span class="material-symbols-outlined" style="font-size: 22px;">arrow_back</span>
                        </button>
                    </div>

                    <!-- Cabecera Plana del Formulario (Sin tarjeta ni caja) -->
                    <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
                        <div style="width: 48px; height: 48px; border-radius: 14px; background: var(--primary-light); color: var(--primary-dark); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <span class="material-symbols-outlined" style="font-size: 28px;">add_business</span>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em;">
                                ${isEditing ? (isEn ? 'Edit Supplier' : 'Editar Proveedor') : (isEn ? 'New Supplier' : 'Nuevo Proveedor')}
                            </h2>
                            <p style="margin: 3px 0 0 0; font-size: 13px; color: var(--text-secondary); line-height: 1.4;">
                                ${isEn ? 'Configure supplier details, photo/logo, category type, delivery schedules, and cut-off deadline.' : 'Configura los datos del proveedor, foto/logo, tipo, días de reparto y horario de corte.'}
                            </p>
                        </div>
                    </div>

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

                                    <input type="text" id="supImageUrl" value="${supplier?.image_url || ''}" placeholder="${isEn ? 'Or paste image URL (https://...)' : 'O pega la URL de la imagen (https://...)'}" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 38px; font-size: 12.5px;" oninput="document.getElementById('supPhotoImg').src = this.value; document.getElementById('supPhotoImg').style.display = this.value ? 'block' : 'none'; document.getElementById('supPhotoIcon').style.display = this.value ? 'none' : 'block';" />
                                </div>
                            </div>
                        </div>

                        <!-- 2. Nombre del Proveedor y Categoría (Plano) -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px;">
                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                    ${isEn ? 'Supplier Name / Company *' : 'Nombre del Proveedor o Empresa *'}
                                </label>
                                <input type="text" id="supName" required value="${supplier?.name || ''}" placeholder="Ej. Frutas y Verduras Hermanos López" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 44px; font-size: 14.5px;" />
                            </div>

                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                    ${isEn ? 'Supplier Type / Category *' : 'Tipo de Proveedor (Categoría) *'}
                                </label>
                                <select id="supCategory" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 44px; font-size: 14px; font-weight: 700; cursor: pointer;">
                                    ${this.CATEGORIES.map(c => `
                                        <option value="${c.id}" ${supCategory.toLowerCase() === c.id ? 'selected' : ''}>
                                            ${c.displayLabel || c.label}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>

                        <!-- 3. Teléfono y Contacto (Plano) -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px;">
                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                    ${isEn ? 'WhatsApp / Phone Number (Optional)' : 'Teléfono o WhatsApp (Opcional)'}
                                </label>
                                <input type="tel" id="supPhone" value="${supplier?.phone || ''}" placeholder="Ej. +34 612 345 678" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 44px; font-size: 14.5px;" />
                            </div>

                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                    ${isEn ? 'Contact Person Name (Optional)' : 'Persona de Contacto (Opcional)'}
                                </label>
                                <input type="text" id="supContact" value="${supplier?.contact_name || ''}" placeholder="Ej. Juan López (Comercial)" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 44px; font-size: 14.5px;" />
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

                        <!-- 5. Hora Límite de Pedido (Plano) -->
                        <div>
                            <label style="display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: var(--primary-dark);">alarm</span>
                                <span>${isEn ? 'Order Cut-off Time' : 'Hora Límite de Pedido'}</span>
                            </label>
                            <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
                                <input type="time" id="supCutoff" value="${cutoff}" required class="folder-modal-input" style="width: 140px; height: 42px; font-size: 15px; font-weight: 800; color: var(--text-main); text-align: center;" />
                                <span style="font-size: 12.5px; color: var(--text-secondary);">${isEn ? '(e.g. 18:00)' : '(ej. 18:00)'}</span>
                            </div>
                        </div>

                        <!-- 6. Notas / Instrucciones (Plano) -->
                        <div>
                            <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                ${isEn ? 'Notes / Delivery Instructions (Optional)' : 'Notas / Instrucciones de Pedido (Opcional)'}
                            </label>
                            <textarea id="supNotes" rows="3" placeholder="Ej. Pedido mínimo 60€, llamar al llegar, facturación a final de mes..." class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: auto; resize: vertical; font-size: 14px;">${supplier?.notes || ''}</textarea>
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
                delivery_days,
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

        /** Elimina proveedor con diálogo de confirmación M3 (sin alert nativo) */
        deleteSupplier(supplierId) {
            const isEn = this.isEnglish();
            const sup = this.suppliers.find(s => s.id === supplierId);
            if (!sup) return;

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
            });
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
                <div class="suppliers-subview-page" style="max-width: 760px; margin: 0 auto; padding: 16px 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Top Bar: Solo botón circular de volver atrás (Botones duplicados eliminados) -->
                    <div style="display: flex; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                        <button type="button" 
                                onclick="window.suppliersManager.backToList()" 
                                class="btn-icon-m3" 
                                title="${isEn ? 'Back' : 'Volver'}" 
                                style="width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-main); transition: all 0.2s var(--m3-easing);">
                            <span class="material-symbols-outlined" style="font-size: 22px;">arrow_back</span>
                        </button>
                    </div>

                    <!-- Cabecera Plana del Formulario de Producto (Sin tarjeta ni caja) -->
                    <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
                        <div style="width: 48px; height: 48px; border-radius: 14px; background: var(--primary-light); color: var(--primary-dark); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <span class="material-symbols-outlined" style="font-size: 28px;">add_photo_alternate</span>
                        </div>
                        <div>
                            <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: var(--text-main); letter-spacing: -0.02em;">
                                ${isEditing ? (isEn ? 'Edit Product' : 'Editar Producto') : (isEn ? 'New Product' : 'Nuevo Producto')}
                            </h2>
                            <p style="margin: 3px 0 0 0; font-size: 13px; color: var(--text-secondary); line-height: 1.4;">
                                ${isEn ? 'Register product with its photograph, name, format and assign it to a supplier.' : 'Registra el producto con su fotografía, nombre, formato y asígnalo a un proveedor.'}
                            </p>
                        </div>
                    </div>

                    <!-- Formulario Plano y Adaptable a Móvil (Sin tarjeta ni contenedor restrictivo) -->
                    <form id="itemFullForm" onsubmit="window.suppliersManager.saveItem(event, '${itemId || ''}')" style="display: flex; flex-direction: column; gap: 20px;">
                        
                        <!-- Proveedor Asignado y Nombre -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px;">
                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                    ${isEn ? 'Assigned Supplier *' : 'Proveedor Asignado *'}
                                </label>
                                <select id="itemSupplierId" required class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 44px; font-size: 14.5px;">
                                    ${this.suppliers.length === 0 ? `
                                        <option value="">${isEn ? 'No suppliers available - create one first' : 'Sin proveedores - crea uno primero'}</option>
                                    ` : this.suppliers.map(s => `
                                        <option value="${s.id}" ${s.id === supId ? 'selected' : ''}>${s.name}</option>
                                    `).join('')}
                                </select>
                            </div>

                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                    ${isEn ? 'Product Name *' : 'Nombre del Producto *'}
                                </label>
                                <input type="text" id="itemName" required value="${item?.name || ''}" placeholder="Ej. Tomate Pera Especial, Salmón Fresco Noruego" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 44px; font-size: 14.5px;" />
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

                        <!-- Categoría y Formato / Unidad -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px;">
                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                    ${isEn ? 'Category' : 'Categoría'}
                                </label>
                                <select id="itemCategory" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 44px; font-size: 14px;">
                                    ${this.CATEGORIES.map(c => `
                                        <option value="${c.label}" ${item?.category === c.label ? 'selected' : ''}>${c.displayLabel || c.label}</option>
                                    `).join('')}
                                </select>
                            </div>

                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                    ${isEn ? 'Packaging Format / Unit' : 'Formato de Presentación / Unidad'}
                                </label>
                                <input type="text" id="itemFormat" value="${item?.package_format || item?.unit || ''}" placeholder="Ej. Caja 10kg, Bolsa 2kg, Manojo, Botella 750ml, Kg" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 44px; font-size: 14px;" />
                            </div>
                        </div>

                        <!-- Notas del Producto -->
                        <div>
                            <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                ${isEn ? 'Product Notes (Optional)' : 'Notas u Observaciones del Producto (Opcional)'}
                            </label>
                            <input type="text" id="itemNotes" value="${item?.notes || ''}" placeholder="Ej. Calibre grande, pedir fresco del día, marca preferida..." class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 44px; font-size: 14px;" />
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
         * Renderiza la página completa para Armar Pedido Rápido a Proveedor
         */
        renderOrderPage() {
            if (!this.container) return;
            const isEn = this.isEnglish();
            const supplierId = this.activeOrderSupplierId;
            const sup = this.suppliers.find(s => s.id === supplierId);
            if (!sup) {
                this.backToList();
                return;
            }

            const status = this.getDeliveryStatus(sup);

            this.container.innerHTML = `
                <div class="suppliers-subview-page" style="max-width: 900px; margin: 0 auto; padding: 20px 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Top Bar de la Página (Volver y Acciones) -->
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap;">
                        <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-back">
                            <span class="material-symbols-outlined" style="font-size: 20px;">arrow_back</span>
                            <span>${isEn ? 'Back to Suppliers' : 'Volver a Proveedores'}</span>
                        </button>

                        <div style="display: flex; align-items: center; gap: 10px;">
                            <button type="button" onclick="window.suppliersManager.copyOrderText('${supplierId}')" style="
                                display: inline-flex;
                                align-items: center;
                                gap: 6px;
                                height: 40px;
                                padding: 0 16px;
                                border-radius: var(--radius-full);
                                font-weight: 700;
                                font-size: 13.5px;
                                background: var(--surface);
                                color: var(--text-main);
                                border: 1px solid var(--border);
                                cursor: pointer;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px;">content_copy</span>
                                <span>${isEn ? 'Copy' : 'Copiar'}</span>
                            </button>

                            <button type="button" onclick="window.suppliersManager.sendOrderByWhatsApp('${supplierId}')" class="btn-supplier-save" style="
                                display: inline-flex;
                                align-items: center;
                                gap: 8px;
                                height: 40px;
                                padding: 0 20px;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 20px;">chat</span>
                                <span>${isEn ? 'Send WhatsApp' : 'Enviar WhatsApp'}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Tarjeta Principal del Pedido -->
                    <div style="background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 32px 28px; box-shadow: var(--shadow-subtle);">
                        <!-- Cabecera Proveedor y Estado -->
                        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid var(--border);">
                            <div>
                                <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: var(--text-main);">
                                    ${isEn ? 'Order for' : 'Pedido para'} ${sup.name}
                                </h2>
                                <div style="font-size: 13.5px; color: var(--text-secondary); margin-top: 4px;">
                                    ${status.statusTitle} · ${status.statusSub}
                                </div>
                            </div>
                            <button type="button" onclick="window.suppliersManager.clearSupplierOrder('${supplierId}')" style="
                                font-size: 13px;
                                color: var(--error);
                                background: none;
                                border: none;
                                cursor: pointer;
                                font-weight: 700;
                            ">
                                ${isEn ? 'Clear all quantities' : 'Limpiar cantidades'}
                            </button>
                        </div>

                        <!-- Lista de Productos y Steppers -->
                        <div id="order-modal-items-list" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                        </div>

                        <!-- Observaciones del Pedido -->
                        <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; margin-bottom: 24px;">
                            <label style="display: block; font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                                ${isEn ? 'Order Notes (Optional)' : 'Observaciones del Pedido (Opcional)'}
                            </label>
                            <input type="text" id="orderNotesInput" value="${this.orderNotes[supplierId] || ''}" placeholder="Ej. Entregar antes de las 11:00 AM, factura a nombre de..." class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 42px; font-size: 14px;" oninput="window.suppliersManager.orderNotes['${supplierId}'] = this.value" />
                        </div>

                        <!-- Acciones Finales -->
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding-top: 18px; border-top: 1px solid var(--border);">
                            <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-cancel">
                                ${isEn ? 'Back' : 'Volver'}
                            </button>
                            <button type="button" onclick="window.suppliersManager.copyOrderText('${supplierId}')" style="
                                display: inline-flex;
                                align-items: center;
                                gap: 6px;
                                height: 44px;
                                padding: 0 18px;
                                border-radius: var(--radius-full);
                                font-weight: 700;
                                font-size: 14px;
                                background: var(--surface);
                                color: var(--text-main);
                                border: 1px solid var(--border);
                                cursor: pointer;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px;">content_copy</span>
                                <span>${isEn ? 'Copy Order' : 'Copiar Pedido'}</span>
                            </button>
                            <button type="button" onclick="window.suppliersManager.sendOrderByWhatsApp('${supplierId}')" class="btn-supplier-save" style="
                                display: inline-flex;
                                align-items: center;
                                gap: 8px;
                                height: 44px;
                                padding: 0 24px;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 20px;">chat</span>
                                <span>${isEn ? 'Send via WhatsApp' : 'Enviar por WhatsApp'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            this.renderOrderModalItems(supplierId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        /** Renderiza la lista de ítems dentro del modal de orden */
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
        }

        clearSupplierOrder(supplierId) {
            delete this.orderCart[supplierId];
            this.saveCache();
            this.renderOrderModalItems(supplierId);
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

        /** Abre WhatsApp con la orden precargada */
        sendOrderByWhatsApp(supplierId) {
            const isEn = this.isEnglish();
            const sup = this.suppliers.find(s => s.id === supplierId);
            const text = this.buildOrderSummary(supplierId);

            if (!text) {
                this.notify(isEn ? 'Please add quantities to at least 1 product' : 'Indica la cantidad de al menos 1 producto', 'warning');
                return;
            }

            const cleanPhone = (sup?.phone || '').replace(/[^0-9]/g, '');
            const encoded = encodeURIComponent(text);
            const waUrl = cleanPhone 
                ? `https://wa.me/${cleanPhone}?text=${encoded}` 
                : `https://wa.me/?text=${encoded}`;

            window.open(waUrl, '_blank');
        }

        /** Cierra modal */
        closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) modal.classList.add('hidden');
        }
    }

    window.suppliersManager = new SuppliersManager();
})();
