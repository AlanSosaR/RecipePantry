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
                { id: 'verduras', label: 'Frutas y Verduras', icon: 'nutrition' },
                { id: 'carnes', label: 'Carnes y Aves', icon: 'kebab_dining' },
                { id: 'pescados', label: 'Pescados y Mariscos', icon: 'set_meal' },
                { id: 'lacteos', label: 'Lácteos y Huevos', icon: 'egg' },
                { id: 'secos', label: 'Secos y Abarrotes', icon: 'grain' },
                { id: 'bebidas', label: 'Bebidas y Licores', icon: 'local_bar' },
                { id: 'panaderia', label: 'Panadería y Harinas', icon: 'bakery_dining' },
                { id: 'limpieza', label: 'Limpieza y Desechables', icon: 'cleaning_services' },
                { id: 'otros', label: 'Otros Insumos', icon: 'inventory_2' }
            ];
            this.currentSubView = 'list'; // 'list' | 'supplier-form' | 'item-form' | 'order-form'
            this.editingSupplierId = null;
            this.editingItemId = null;
            this.preselectedSupplierId = null;
            this.activeOrderSupplierId = null;
            this.container = null;
            this._pendingImageBlob = null;
            this._pendingImageName = null;

            this.loadCache();
            this.initReactiveAuth();
            this.initGlobalSearch();
        }

        /** Determina si el idioma activo es inglés */
        isEnglish() {
            return Boolean(window.i18n && window.i18n.getLang && window.i18n.getLang() === 'en');
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

        /** Inicializa detección reactiva de autenticación */
        initReactiveAuth() {
            if (this._reactiveAuthInitialized) return;
            this._reactiveAuthInitialized = true;

            const check = () => {
                this.updateVisibility();
                if (window.dashboard?.currentView === 'suppliers' && this.isSuperAdmin()) {
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
                    window.supabaseClient.auth.onAuthStateChange(() => setTimeout(check, 60));
                } catch (e) {}
            }
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
                        if (currentView === 'suppliers' && this.isSuperAdmin()) {
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

        /** Muestra u oculta la opción en el sidebar según permisos de superadmin */
        updateVisibility() {
            const navEl = document.getElementById('navItemSuppliers');
            const isSuper = this.isSuperAdmin();
            if (navEl) {
                if (isSuper) {
                    navEl.classList.remove('hidden');
                } else {
                    navEl.classList.add('hidden');
                    // Si intentaba ver esta sección sin ser admin, regresar a recetas
                    if (window.dashboard?.currentView === 'suppliers') {
                        window.dashboard.switchView('recipes');
                    }
                }
            }
        }

        /** Sincroniza proveedores e ítems desde Supabase */
        async syncData() {
            if (!this.isSuperAdmin()) return;
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
                this.renderContent();
            } catch (err) {
                console.error('❌ Error sincronizando proveedores:', err);
            } finally {
                this.isLoading = false;
                const spinner = document.getElementById('suppliers-loading-spinner');
                if (spinner) spinner.style.display = 'none';
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

            if (!this.isSuperAdmin()) {
                this.container.innerHTML = `
                    <div style="padding: 48px 20px; text-align: center; font-family: var(--font-display);">
                        <span class="material-symbols-outlined" style="font-size: 48px; color: #EF4444;">lock</span>
                        <h2 style="font-size: 20px; font-weight: 700; color: #1E293B; margin-top: 12px;">Acceso Restringido</h2>
                        <p style="color: #64748B; font-size: 14px;">Esta sección está reservada exclusivamente para el Super Administrador.</p>
                    </div>
                `;
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
         * Renderiza el listado principal de proveedores y catálogo
         */
        renderListPage() {
            if (!this.container) return;
            const isEn = this.isEnglish();

            this.container.innerHTML = `
                <div class="suppliers-view-container" style="max-width: 1280px; margin: 0 auto; padding: 24px 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Header Principal M3 Expressive (Limpio, sin botones redundantes) -->
                    <div class="suppliers-header-card" style="
                        background: #FFFFFF;
                        border: 1px solid var(--border);
                        border-radius: var(--radius-xl);
                        padding: 24px;
                        margin-bottom: 24px;
                        box-shadow: var(--shadow-subtle);
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        justify-content: space-between;
                        gap: 16px;
                    ">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div style="
                                width: 56px;
                                height: 56px;
                                border-radius: 16px;
                                background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                                color: #FFFFFF;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                flex-shrink: 0;
                                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
                            ">
                                <span class="material-symbols-outlined" style="font-size: 32px;">local_shipping</span>
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #0F172A; letter-spacing: -0.02em;">
                                        ${isEn ? 'Suppliers & Orders' : 'Proveedores y Órdenes'}
                                    </h1>
                                    <span style="
                                        background: var(--primary-light);
                                        color: var(--primary-dark);
                                        font-size: 11px;
                                        font-weight: 800;
                                        padding: 3px 8px;
                                        border-radius: var(--radius-full);
                                        border: 1px solid rgba(16, 185, 129, 0.2);
                                    ">
                                        Super Admin
                                    </span>
                                </div>
                                <p style="margin: 4px 0 0 0; font-size: 13.5px; color: #64748B;">
                                    ${isEn ? 'Manage restaurant suppliers, product catalog with photos, delivery schedules and fast WhatsApp orders.' : 'Gestiona proveedores, catálogo de productos con fotos, días de reparto y pedidos rápidos.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Barra de Filtros Rápidos M3 y Estado de Búsqueda Global -->
                    <div style="
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        margin-bottom: 20px;
                    ">
                        <!-- Filtros tipo Pills M3 -->
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <button type="button" class="supplier-filter-pill ${this.activeFilter === 'all' ? 'active' : ''}" 
                                onclick="window.suppliersManager.setFilter('all')">
                                <span class="material-symbols-outlined" style="font-size: 18px;">apps</span>
                                <span>${isEn ? 'All' : 'Todos'} (${this.suppliers.length})</span>
                            </button>

                            <button type="button" class="supplier-filter-pill ${this.activeFilter === 'delivery_tomorrow' ? 'active' : ''}" 
                                onclick="window.suppliersManager.setFilter('delivery_tomorrow')">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #10B981;">local_shipping</span>
                                <span>${isEn ? 'Delivering Tomorrow' : 'Entregan Mañana'}</span>
                            </button>

                            <button type="button" class="supplier-filter-pill ${this.activeFilter === 'open_today' ? 'active' : ''}" 
                                onclick="window.suppliersManager.setFilter('open_today')">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #059669;">schedule</span>
                                <span>${isEn ? 'Order Open Today' : 'Corte Abierto Hoy'}</span>
                            </button>
                        </div>

                        <!-- Indicador si hay búsqueda global activa -->
                        <div id="supplierSearchGlobalTag" style="${this.searchQuery ? 'display: inline-flex;' : 'display: none;'} align-items: center; gap: 6px; background: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46; padding: 6px 14px; border-radius: var(--radius-full); font-size: 13px; font-weight: 700;">
                            <span class="material-symbols-outlined" style="font-size: 16px;">search</span>
                            <span>${isEn ? 'Searching:' : 'Buscando:'} "${this.searchQuery}"</span>
                            <button type="button" onclick="window.suppliersManager.clearSearch()" style="background: none; border: none; color: #065F46; cursor: pointer; font-size: 14px; padding: 0 0 0 4px; display: flex; align-items: center;" title="${isEn ? 'Clear' : 'Limpiar'}">✕</button>
                        </div>
                    </div>

                    <!-- Indicador de Carga / Spinner -->
                    <div id="suppliers-loading-spinner" style="text-align: center; padding: 30px; ${this.isLoading ? 'display: block;' : 'display: none;'}">
                        <div class="spinner-sm" style="margin: 0 auto 10px auto;"></div>
                        <p style="color: #64748B; font-size: 13px;">${isEn ? 'Synchronizing catalog...' : 'Sincronizando proveedores y productos...'}</p>
                    </div>

                    <!-- Contenedor Dinámico de Tarjetas -->
                    <div id="suppliers-cards-mount"></div>
                </div>
            `;

            this.renderContent();
            this.syncData();
        }

        /** Filtra proveedores y renderiza las tarjetas */
        renderContent() {
            const mount = document.getElementById('suppliers-cards-mount');
            if (!mount) return;

            const isEn = this.isEnglish();
            let filtered = [...this.suppliers];

            // Búsqueda por texto (proveedor o nombre de producto de ese proveedor)
            if (this.searchQuery.trim()) {
                const q = this.searchQuery.toLowerCase().trim();
                filtered = filtered.filter(sup => {
                    const matchSup = (sup.name && sup.name.toLowerCase().includes(q));
                    // Buscar si tiene algún producto que coincida
                    const supItems = this.items.filter(it => it.supplier_id === sup.id);
                    const matchItem = supItems.some(it => it.name && it.name.toLowerCase().includes(q));
                    return matchSup || matchItem;
                });
            }

            // Filtros rápidos
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
                        background: #FFFFFF;
                        border: 1.5px dashed #CBD5E1;
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
                        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #1E293B;">
                            ${isEn ? 'No suppliers found' : 'No se encontraron proveedores'}
                        </h3>
                        <p style="margin: 0 0 20px 0; color: #64748B; font-size: 14px; max-width: 440px; margin-left: auto; margin-right: auto;">
                            ${this.searchQuery 
                                ? (isEn ? 'Try another search term or clear the filter.' : 'Prueba con otro término de búsqueda o limpia los filtros.')
                                : (isEn ? 'Register your first restaurant supplier to start organizing delivery days, products and orders.' : 'Registra tu primer proveedor para organizar los días de reparto, catálogo de productos con fotos y pedidos rápidos.')}
                        </p>
                        <button type="button" class="btn-primary" onclick="window.suppliersManager.openSupplierModal()" style="
                            display: inline-flex;
                            align-items: center;
                            gap: 8px;
                            height: 42px;
                            padding: 0 22px;
                            border-radius: var(--radius-full);
                            font-weight: 700;
                            font-size: 14px;
                            background: var(--primary-dark);
                            color: #FFFFFF;
                            border: none;
                            cursor: pointer;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 20px;">add_business</span>
                            <span>${isEn ? 'Add First Supplier' : 'Crear Primer Proveedor'}</span>
                        </button>
                    </div>
                `;
                return;
            }

            mount.innerHTML = `
                <div class="suppliers-grid" style="display: flex; flex-direction: column; gap: 24px;">
                    ${filtered.map(sup => this.renderSupplierCard(sup)).join('')}
                </div>
            `;
        }

        /**
         * Renderiza la tarjeta de un proveedor individual con su estado y catálogo de productos
         */
        renderSupplierCard(supplier) {
            const isEn = this.isEnglish();
            const status = this.getDeliveryStatus(supplier);
            const supItems = this.items.filter(it => it.supplier_id === supplier.id);
            const activeDays = Array.isArray(supplier.delivery_days) ? supplier.delivery_days : [];
            const cartItems = this.orderCart[supplier.id] || {};
            const cartCount = Object.values(cartItems).reduce((acc, qty) => acc + (qty > 0 ? 1 : 0), 0);

            // Colores e icono de badge según estado
            let badgeBg = '#F1F5F9';
            let badgeColor = '#475569';
            let badgeBorder = '#E2E8F0';
            let badgeIcon = 'schedule';

            if (status.badgeType === 'success') {
                badgeBg = '#ECFDF5';
                badgeColor = '#065F46';
                badgeBorder = '#A7F3D0';
                badgeIcon = 'check_circle';
            } else if (status.badgeType === 'warning') {
                badgeBg = '#FFFBEB';
                badgeColor = '#92400E';
                badgeBorder = '#FDE68A';
                badgeIcon = 'hourglass_top';
            } else if (status.badgeType === 'closed') {
                badgeBg = '#FEF2F2';
                badgeColor = '#991B1B';
                badgeBorder = '#FECACA';
                badgeIcon = 'event_busy';
            } else if (status.badgeType === 'upcoming') {
                badgeBg = '#F0FDF4';
                badgeColor = '#166534';
                badgeBorder = '#BBF7D0';
                badgeIcon = 'calendar_month';
            }

            return `
                <div class="supplier-card" id="supplier-card-${supplier.id}" style="
                    background: #FFFFFF;
                    border: 1px solid var(--border);
                    border-radius: var(--radius-xl);
                    padding: 24px;
                    box-shadow: var(--shadow-subtle);
                    transition: transform 0.2s, box-shadow 0.2s;
                ">
                    <!-- Fila Superior: Datos del Proveedor y Estado -->
                    <div style="display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px;">
                        <div style="display: flex; align-items: flex-start; gap: 14px; min-width: 240px;">
                            <div style="
                                width: 50px;
                                height: 50px;
                                border-radius: 14px;
                                background: #ECFDF5;
                                color: #047857;
                                font-weight: 800;
                                font-size: 20px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                flex-shrink: 0;
                                border: 1px solid #A7F3D0;
                            ">
                                ${supplier.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <h2 style="margin: 0; font-size: 19px; font-weight: 800; color: #0F172A;">
                                        ${supplier.name}
                                    </h2>
                                </div>
                                <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 4px; font-size: 13px; color: #64748B;">
                                    <span style="display: inline-flex; align-items: center; gap: 4px;">
                                        <span class="material-symbols-outlined" style="font-size: 16px; color: #94A3B8;">inventory_2</span>
                                        ${supItems.length} ${isEn ? 'products' : 'productos'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Badge Inteligente de Delivery & Horario de Corte -->
                        <div style="
                            background: ${badgeBg};
                            border: 1px solid ${badgeBorder};
                            color: ${badgeColor};
                            border-radius: var(--radius-md);
                            padding: 10px 14px;
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            max-width: 380px;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 24px; flex-shrink: 0;">${badgeIcon}</span>
                            <div>
                                <div style="font-size: 13.5px; font-weight: 800;">
                                    ${status.statusTitle}
                                </div>
                                <div style="font-size: 11.5px; opacity: 0.9; margin-top: 2px;">
                                    ${status.statusSub}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Fila Intermedia: Días de Entrega (Chips interactivos M3) y Hora Límite -->
                    <div style="
                        background: #F8FAFC;
                        border-radius: var(--radius-md);
                        padding: 12px 16px;
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        margin-bottom: 20px;
                        border: 1px solid #E2E8F0;
                    ">
                        <!-- Chips de Días -->
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 4px;">
                                ${isEn ? 'Delivery Days:' : 'Días de Reparto:'}
                            </span>
                            <div style="display: flex; gap: 4px;">
                                ${this.DAYS.map(d => {
                                    const isActive = activeDays.includes(d.id);
                                    return `
                                        <div title="${isEn ? d.labelEn : d.label}: ${isActive ? (isEn ? 'Delivery Day' : 'Hace entrega') : (isEn ? 'No delivery' : 'Sin reparto')}" style="
                                            width: 28px;
                                            height: 28px;
                                            border-radius: 50%;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            font-size: 11px;
                                            font-weight: 800;
                                            ${isActive 
                                                ? 'background: #059669; color: #FFFFFF; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.3);' 
                                                : 'background: #E2E8F0; color: #94A3B8; opacity: 0.6;'}
                                        ">
                                            ${d.short}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <!-- Hora límite de pedido para recibir al día siguiente -->
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #1E293B;">
                            <span class="material-symbols-outlined" style="font-size: 18px; color: #059669;">alarm</span>
                            <span>${isEn ? 'Order Cut-off:' : 'Hora Límite de Pedido:'}</span>
                            <strong style="color: #0F172A; font-weight: 800; background: #FFFFFF; padding: 2px 8px; border-radius: 6px; border: 1px solid #CBD5E1;">
                                ${status.cutoffFormatted} hrs
                            </strong>
                        </div>

                        <!-- Botones de Acción Proveedor -->
                        <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
                            <button type="button" class="btn-icon-subtle" onclick="window.suppliersManager.openOrderModal('${supplier.id}')" title="${isEn ? 'Build Order' : 'Armar Pedido'}" style="
                                display: inline-flex;
                                align-items: center;
                                gap: 6px;
                                height: 36px;
                                padding: 0 14px;
                                border-radius: var(--radius-full);
                                font-weight: 700;
                                font-size: 13px;
                                background: ${cartCount > 0 ? '#10B981' : '#ECFDF5'};
                                color: ${cartCount > 0 ? '#FFFFFF' : '#047857'};
                                border: 1px solid #A7F3D0;
                                cursor: pointer;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px;">shopping_cart_checkout</span>
                                <span>${isEn ? 'Create Order' : 'Armar Pedido'} ${cartCount > 0 ? `(${cartCount})` : ''}</span>
                            </button>

                            <button type="button" class="btn-icon-subtle" onclick="window.suppliersManager.openSupplierModal('${supplier.id}')" title="${isEn ? 'Edit Supplier' : 'Editar Proveedor'}" style="
                                width: 36px;
                                height: 36px;
                                border-radius: 50%;
                                background: #FFFFFF;
                                border: 1px solid #E2E8F0;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: #475569;
                                cursor: pointer;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                            </button>

                            <button type="button" class="btn-icon-subtle" onclick="window.suppliersManager.deleteSupplier('${supplier.id}')" title="${isEn ? 'Delete Supplier' : 'Eliminar Proveedor'}" style="
                                width: 36px;
                                height: 36px;
                                border-radius: 50%;
                                background: #FFFFFF;
                                border: 1px solid #FEE2E2;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: #EF4444;
                                cursor: pointer;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                            </button>
                        </div>
                    </div>

                    <!-- Fila Inferior: Catálogo de Productos con Nombre y Fotografía -->
                    <div class="supplier-products-section">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #1E293B; display: flex; align-items: center; gap: 8px;">
                                <span class="material-symbols-outlined" style="font-size: 20px; color: #059669;">category</span>
                                <span>${isEn ? 'Product Catalog' : 'Catálogo de Productos'}</span>
                                <span style="font-size: 12px; font-weight: 600; color: #64748B;">(${supItems.length})</span>
                            </h3>

                            <button type="button" onclick="window.suppliersManager.openItemModal(null, '${supplier.id}')" style="
                                display: inline-flex;
                                align-items: center;
                                gap: 6px;
                                height: 32px;
                                padding: 0 12px;
                                border-radius: var(--radius-full);
                                font-weight: 700;
                                font-size: 12.5px;
                                background: #F0FDF4;
                                color: #047857;
                                border: 1px solid #A7F3D0;
                                cursor: pointer;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 16px;">add</span>
                                <span>${isEn ? 'Add Product' : 'Agregar Producto'}</span>
                            </button>
                        </div>

                        ${supItems.length === 0 ? `
                            <div style="
                                background: #F8FAFC;
                                border: 1.5px dashed #CBD5E1;
                                border-radius: var(--radius-lg);
                                padding: 28px 16px;
                                text-align: center;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 32px; color: #94A3B8; margin-bottom: 6px;">add_photo_alternate</span>
                                <p style="margin: 0 0 10px 0; color: #64748B; font-size: 13.5px;">
                                    ${isEn ? 'No products registered for this supplier yet.' : 'Aún no hay productos registrados para este proveedor.'}
                                </p>
                                <button type="button" onclick="window.suppliersManager.openItemModal(null, '${supplier.id}')" style="
                                    font-size: 12.5px;
                                    font-weight: 700;
                                    color: #059669;
                                    background: none;
                                    border: none;
                                    cursor: pointer;
                                    text-decoration: underline;
                                ">
                                    ${isEn ? '+ Add first product with photo' : '+ Agregar primer producto con foto y nombre'}
                                </button>
                            </div>
                        ` : `
                            <div class="supplier-items-grid" style="
                                display: grid;
                                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                                gap: 14px;
                            ">
                                ${supItems.map(item => this.renderItemCard(item, supplier.id)).join('')}
                            </div>
                        `}
                    </div>
                </div>
            `;
        }

        /**
         * Renderiza la tarjeta de un producto individual (con foto y nombre)
         */
        renderItemCard(item, supplierId) {
            const isEn = this.isEnglish();
            const qty = (this.orderCart[supplierId] && this.orderCart[supplierId][item.id]) || 0;

            return `
                <div class="supplier-item-card" id="item-card-${item.id}" style="
                    background: #FFFFFF;
                    border: 1px solid #E2E8F0;
                    border-radius: var(--radius-md);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.03);
                    position: relative;
                ">
                    <!-- Foto del Producto -->
                    <div style="
                        position: relative;
                        width: 100%;
                        height: 140px;
                        background: #F1F5F9;
                        overflow: hidden;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                        ${item.image_url ? `
                            <img src="${item.image_url}" alt="${item.name}" loading="lazy" style="
                                width: 100%;
                                height: 100%;
                                object-fit: cover;
                                transition: transform 0.3s ease;
                            " onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; color: #94A3B8;">
                                <span class="material-symbols-outlined" style="font-size: 36px;">image_not_supported</span>
                            </div>
                        ` : `
                            <div style="
                                display: flex;
                                flex-direction: column;
                                align-items: center;
                                justify-content: center;
                                color: #94A3B8;
                                gap: 4px;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 36px; color: #CBD5E1;">photo_camera</span>
                                <span style="font-size: 11px;">${isEn ? 'No photo' : 'Sin foto'}</span>
                            </div>
                        `}

                        <!-- Badge de Unidad / Empaque -->
                        ${item.package_format || item.unit ? `
                            <div style="
                                position: absolute;
                                bottom: 8px;
                                left: 8px;
                                background: rgba(15, 23, 42, 0.75);
                                backdrop-filter: blur(4px);
                                color: #FFFFFF;
                                font-size: 11px;
                                font-weight: 700;
                                padding: 2px 7px;
                                border-radius: 6px;
                            ">
                                ${item.package_format || item.unit}
                            </div>
                        ` : ''}

                        <!-- Menú rápido: Editar / Eliminar -->
                        <div style="
                            position: absolute;
                            top: 6px;
                            right: 6px;
                            display: flex;
                            gap: 4px;
                        ">
                            <button type="button" onclick="window.suppliersManager.openItemModal('${item.id}', '${supplierId}')" title="${isEn ? 'Edit Product' : 'Editar Producto'}" style="
                                width: 28px;
                                height: 28px;
                                border-radius: 50%;
                                background: rgba(255,255,255,0.9);
                                border: none;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: #475569;
                                cursor: pointer;
                                box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                            ">
                                <span class="material-symbols-outlined" style="font-size: 15px;">edit</span>
                            </button>
                            <button type="button" onclick="window.suppliersManager.deleteItem('${item.id}')" title="${isEn ? 'Delete Product' : 'Eliminar Producto'}" style="
                                width: 28px;
                                height: 28px;
                                border-radius: 50%;
                                background: rgba(255,255,255,0.9);
                                border: none;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: #EF4444;
                                cursor: pointer;
                                box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                            ">
                                <span class="material-symbols-outlined" style="font-size: 15px;">delete</span>
                            </button>
                        </div>
                    </div>

                    <!-- Datos del Producto -->
                    <div style="padding: 12px; display: flex; flex-direction: column; flex: 1; justify-content: space-between;">
                        <div>
                            <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: #1E293B; line-height: 1.3;">
                                ${item.name}
                            </h4>
                            ${item.category ? `
                                <span style="font-size: 11.5px; color: #64748B; margin-top: 2px; display: block;">
                                    ${item.category}
                                </span>
                            ` : ''}
                        </div>

                        <!-- Stepper de Pedido Rápido (+ / -) -->
                        <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #F1F5F9; padding-top: 8px;">
                            <span style="font-size: 11.5px; font-weight: 600; color: #64748B;">
                                ${isEn ? 'Order qty:' : 'Pedir:'}
                            </span>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <button type="button" onclick="window.suppliersManager.updateOrderQty('${supplierId}', '${item.id}', -1)" style="
                                    width: 26px;
                                    height: 26px;
                                    border-radius: 50%;
                                    border: 1px solid #CBD5E1;
                                    background: #FFFFFF;
                                    font-weight: 800;
                                    font-size: 14px;
                                    color: #475569;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                ">-</button>
                                
                                <span id="item-qty-${supplierId}-${item.id}" style="
                                    font-size: 13.5px;
                                    font-weight: 800;
                                    min-width: 20px;
                                    text-align: center;
                                    color: ${qty > 0 ? '#059669' : '#1E293B'};
                                ">
                                    ${qty}
                                </span>

                                <button type="button" onclick="window.suppliersManager.updateOrderQty('${supplierId}', '${item.id}', 1)" style="
                                    width: 26px;
                                    height: 26px;
                                    border-radius: 50%;
                                    border: 1px solid #059669;
                                    background: #ECFDF5;
                                    font-weight: 800;
                                    font-size: 14px;
                                    color: #047857;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                ">+</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
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
                        <button type="button" onclick="window.suppliersManager.clearSearch()" style="background: none; border: none; color: #065F46; cursor: pointer; font-size: 14px; padding: 0 0 0 4px; display: flex; align-items: center;" title="${isEn ? 'Clear' : 'Limpiar'}">✕</button>
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

            // Actualizar etiqueta del contador si existe
            const qtyEl = document.getElementById(`item-qty-${supplierId}-${itemId}`);
            if (qtyEl) {
                qtyEl.textContent = next;
                qtyEl.style.color = next > 0 ? '#059669' : '#1E293B';
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
                    orderBtn.style.background = cartCount > 0 ? '#10B981' : '#ECFDF5';
                    orderBtn.style.color = cartCount > 0 ? '#FFFFFF' : '#047857';
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
            this.editingSupplierId = null;
            this.editingItemId = null;
            this.activeOrderSupplierId = null;
            this.render();
        }

        /** Alterna selección de chip de día de reparto */
        toggleDayChip(btn) {
            btn.classList.toggle('active');
            const isActive = btn.classList.contains('active');
            btn.style.borderColor = isActive ? '#059669' : '#CBD5E1';
            btn.style.background = isActive ? '#ECFDF5' : '#FFFFFF';
            btn.style.color = isActive ? '#047857' : '#64748B';
        }

        // Aliases para compatibilidad hacia atrás
        openSupplierModal(supplierId = null) { return this.openSupplierForm(supplierId); }
        openItemModal(itemId = null, preselectedSupplierId = null) { return this.openItemForm(itemId, preselectedSupplierId); }
        openOrderModal(supplierId) { return this.openOrderForm(supplierId); }
        closeModal() { return this.backToList(); }
        ensureModals() {}

        /**
         * Renderiza la página completa para Nuevo / Editar Proveedor
         */
        renderSupplierFormPage() {
            if (!this.container) return;
            const isEn = this.isEnglish();
            const supplierId = this.editingSupplierId;
            const supplier = supplierId ? this.suppliers.find(s => s.id === supplierId) : null;
            const isEditing = Boolean(supplier);

            const activeDays = supplier && Array.isArray(supplier.delivery_days) ? supplier.delivery_days : ['mon', 'wed', 'fri'];
            const cutoff = supplier?.cutoff_time ? supplier.cutoff_time.substring(0, 5) : '18:00';

            this.container.innerHTML = `
                <div class="suppliers-subview-page" style="max-width: 860px; margin: 0 auto; padding: 20px 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Top Bar de la Página (Volver y Acciones) -->
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap;">
                        <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-back">
                            <span class="material-symbols-outlined" style="font-size: 20px;">arrow_back</span>
                            <span>${isEn ? 'Back to Suppliers' : 'Volver a Proveedores'}</span>
                        </button>

                        <div style="display: flex; align-items: center; gap: 10px;">
                            <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-cancel">
                                ${isEn ? 'Cancel' : 'Cancelar'}
                            </button>
                            <button type="submit" form="supplierFullForm" id="btnSaveSupplierTop" class="btn-supplier-save">
                                <span class="material-symbols-outlined" style="font-size: 18px;">save</span>
                                <span>${isEditing ? (isEn ? 'Save Changes' : 'Guardar Cambios') : (isEn ? 'Create Supplier' : 'Crear Proveedor')}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Tarjeta Principal del Formulario M3 Expressive -->
                    <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 32px 28px; box-shadow: var(--shadow-subtle);">
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid #F1F5F9;">
                            <div style="width: 50px; height: 50px; border-radius: 14px; background: #ECFDF5; color: #047857; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <span class="material-symbols-outlined" style="font-size: 30px;">add_business</span>
                            </div>
                            <div>
                                <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #0F172A;">
                                    ${isEditing ? (isEn ? 'Edit Supplier' : 'Editar Proveedor') : (isEn ? 'New Supplier' : 'Nuevo Proveedor')}
                                </h2>
                                <p style="margin: 4px 0 0 0; font-size: 13.5px; color: #64748B;">
                                    ${isEn ? 'Configure supplier details, delivery schedules, and next-day cutoff deadline.' : 'Configura los datos del proveedor, días que hace delivery y horario límite para pedidos.'}
                                </p>
                            </div>
                        </div>

                        <form id="supplierFullForm" onsubmit="window.suppliersManager.saveSupplier(event, '${supplierId || ''}')" style="display: flex; flex-direction: column; gap: 22px;">
                            <!-- Nombre del Proveedor -->
                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                    ${isEn ? 'Supplier Name / Company *' : 'Nombre del Proveedor o Empresa *'}
                                </label>
                                <input type="text" id="supName" required value="${supplier?.name || ''}" placeholder="Ej. Frutas y Verduras Hermanos López" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 46px; font-size: 15px;" />
                            </div>


                            <!-- Días de Delivery (Chips M3 Toggles) -->
                            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: var(--radius-lg); padding: 18px;">
                                <label style="display: block; font-size: 14px; font-weight: 800; color: #0F172A; margin-bottom: 4px;">
                                    ${isEn ? 'Delivery Days (Check the days they deliver to the restaurant)' : 'Días de Reparto (Selecciona los días que hacen entrega)'}
                                </label>
                                <p style="margin: 0 0 12px 0; font-size: 12.5px; color: #64748B;">
                                    ${isEn ? 'These days determine the real-time next delivery and cutoff countdown.' : 'Estos días alimentan el indicador en vivo de próxima entrega y cuenta regresiva de corte.'}
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
                                                    padding: 10px 16px;
                                                    border-radius: var(--radius-full);
                                                    font-size: 13.5px;
                                                    font-weight: 700;
                                                    cursor: pointer;
                                                    transition: all 0.2s ease;
                                                    border: 1.5px solid ${checked ? '#059669' : '#CBD5E1'};
                                                    background: ${checked ? '#ECFDF5' : '#FFFFFF'};
                                                    color: ${checked ? '#047857' : '#64748B'};
                                                "
                                            >
                                                ${isEn ? d.labelEn : d.label}
                                            </button>
                                        `;
                                    }).join('')}
                                </div>
                            </div>

                            <!-- Hora Límite de Pedido (Cutoff Time) -->
                            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: var(--radius-lg); padding: 18px;">
                                <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; color: #0F172A; margin-bottom: 4px;">
                                    <span class="material-symbols-outlined" style="font-size: 20px; color: #059669;">alarm</span>
                                    <span>${isEn ? 'Order Cut-off Time for Next-Day Delivery' : 'Hora Límite de Pedido para Entrega al Día Siguiente'}</span>
                                </label>
                                <p style="margin: 0 0 12px 0; font-size: 12.5px; color: #64748B;">
                                    ${isEn ? 'Up to what time can you send the order today so it arrives tomorrow (or on their next delivery day)?' : '¿Hasta qué hora puedes enviar el pedido para que llegue en el siguiente reparto programado?'}
                                </p>
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <input type="time" id="supCutoff" value="${cutoff}" required class="folder-modal-input" style="width: 160px; height: 44px; font-size: 16px; font-weight: 800; color: #0F172A; text-align: center;" />
                                    <span style="font-size: 13px; color: #64748B;">${isEn ? 'e.g. 18:00 (6:00 PM)' : 'ej. 18:00 (6:00 PM)'}</span>
                                </div>
                            </div>

                            <!-- Notas / Condiciones de Pedido -->
                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                    ${isEn ? 'Notes / Delivery Instructions (Optional)' : 'Notas / Instrucciones de Pedido (Opcional)'}
                                </label>
                                <textarea id="supNotes" rows="3" placeholder="Ej. Pedido mínimo 60€, llamar al llegar, facturación a final de mes..." class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: auto; resize: vertical; font-size: 14px;">${supplier?.notes || ''}</textarea>
                            </div>

                            <!-- Botones inferiores -->
                            <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; padding-top: 18px; border-top: 1px solid #F1F5F9;">
                                <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-cancel">
                                    ${isEn ? 'Cancel' : 'Cancelar'}
                                </button>
                                <button type="submit" id="btnSaveSupplier" class="btn-supplier-save">
                                    ${isEditing ? (isEn ? 'Update Supplier' : 'Guardar Cambios') : (isEn ? 'Create Supplier' : 'Crear Proveedor')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
            const phone = document.getElementById('supPhone')?.value.trim() || '';
            const contact_name = document.getElementById('supContact')?.value.trim() || '';
            const cutoff_time = document.getElementById('supCutoff').value || '18:00';
            const notes = document.getElementById('supNotes').value.trim();

            // Días seleccionados
            const dayChips = document.querySelectorAll('#supplierDaysTogglesContainer .m3-day-chip-toggle.active');
            const delivery_days = Array.from(dayChips).map(c => c.getAttribute('data-day-id'));

            const userId = window.authManager?.currentUser?.id;

            const payload = {
                name,
                phone,
                contact_name,
                delivery_days,
                cutoff_time,
                notes,
                updated_at: new Date().toISOString()
            };
            if (userId) payload.user_id = userId;

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

        /** Elimina proveedor con confirmación */
        async deleteSupplier(supplierId) {
            const isEn = this.isEnglish();
            const sup = this.suppliers.find(s => s.id === supplierId);
            if (!sup) return;

            const confirmMsg = isEn 
                ? `Delete supplier "${sup.name}" and all its products?` 
                : `¿Eliminar al proveedor "${sup.name}" y todos sus productos asociados?`;

            if (!confirm(confirmMsg)) return;

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
                this.renderContent();
                this.notify(isEn ? 'Supplier deleted' : 'Proveedor eliminado', 'info');
            } catch (err) {
                console.error('Error eliminando proveedor:', err);
                this.notify(err.message || 'Error eliminando proveedor', 'error');
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
                <div class="suppliers-subview-page" style="max-width: 860px; margin: 0 auto; padding: 20px 16px 80px 16px; font-family: var(--font-display);">
                    <!-- Top Bar de la Página (Volver y Acciones) -->
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap;">
                        <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-back">
                            <span class="material-symbols-outlined" style="font-size: 20px;">arrow_back</span>
                            <span>${isEn ? 'Back to Suppliers' : 'Volver a Proveedores'}</span>
                        </button>

                        <div style="display: flex; align-items: center; gap: 10px;">
                            <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-cancel">
                                ${isEn ? 'Cancel' : 'Cancelar'}
                            </button>
                            <button type="submit" form="itemFullForm" id="btnSaveItemTop" class="btn-supplier-save">
                                <span class="material-symbols-outlined" style="font-size: 18px;">save</span>
                                <span>${isEditing ? (isEn ? 'Save Product' : 'Guardar Producto') : (isEn ? 'Add Product' : 'Agregar Producto')}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Tarjeta Principal del Formulario M3 Expressive -->
                    <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 32px 28px; box-shadow: var(--shadow-subtle);">
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid #F1F5F9;">
                            <div style="width: 50px; height: 50px; border-radius: 14px; background: #ECFDF5; color: #047857; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <span class="material-symbols-outlined" style="font-size: 30px;">add_photo_alternate</span>
                            </div>
                            <div>
                                <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #0F172A;">
                                    ${isEditing ? (isEn ? 'Edit Product' : 'Editar Producto') : (isEn ? 'New Product' : 'Nuevo Producto')}
                                </h2>
                                <p style="margin: 4px 0 0 0; font-size: 13.5px; color: #64748B;">
                                    ${isEn ? 'Register product with its photograph, name, format and assign it to a supplier.' : 'Registra el producto con su fotografía, nombre, formato y asígnalo a un proveedor.'}
                                </p>
                            </div>
                        </div>

                        <form id="itemFullForm" onsubmit="window.suppliersManager.saveItem(event, '${itemId || ''}')" style="display: flex; flex-direction: column; gap: 22px;">
                            <!-- Proveedor Asignado -->
                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                    ${isEn ? 'Assigned Supplier *' : 'Proveedor Asignado *'}
                                </label>
                                <select id="itemSupplierId" required class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 46px; font-size: 15px;">
                                    ${this.suppliers.length === 0 ? `
                                        <option value="">${isEn ? 'No suppliers available - create one first' : 'Sin proveedores - crea uno primero'}</option>
                                    ` : this.suppliers.map(s => `
                                        <option value="${s.id}" ${s.id === supId ? 'selected' : ''}>${s.name}</option>
                                    `).join('')}
                                </select>
                            </div>

                            <!-- Nombre del Producto -->
                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                    ${isEn ? 'Product Name *' : 'Nombre del Producto *'}
                                </label>
                                <input type="text" id="itemName" required value="${item?.name || ''}" placeholder="Ej. Tomate Pera Especial, Salmón Fresco Noruego, Harina Fuerza 00" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 46px; font-size: 15px;" />
                            </div>

                            <!-- Fotografía del Producto (Cámara / Subida) -->
                            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: var(--radius-lg); padding: 20px;">
                                <label style="display: block; font-size: 14px; font-weight: 800; color: #0F172A; margin-bottom: 4px;">
                                    ${isEn ? 'Product Photograph' : 'Fotografía del Producto'}
                                </label>
                                <p style="margin: 0 0 14px 0; font-size: 12.5px; color: #64748B;">
                                    ${isEn ? 'Add an image to identify the product quickly when creating orders. Automatically optimized and compressed.' : 'Sube o toma una foto para reconocer el producto al armar pedidos. Se optimiza y comprime automáticamente.'}
                                </p>

                                <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                                    <div id="itemPhotoPreviewBox" style="
                                        width: 110px;
                                        height: 110px;
                                        border-radius: var(--radius-lg);
                                        background: #F1F5F9;
                                        border: 2px dashed #CBD5E1;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        overflow: hidden;
                                        flex-shrink: 0;
                                        position: relative;
                                    ">
                                        <img id="itemPhotoImg" src="${item?.image_url || ''}" style="${item?.image_url ? 'display: block;' : 'display: none;'} width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; document.getElementById('itemPhotoIcon').style.display='block';" />
                                        <span id="itemPhotoIcon" class="material-symbols-outlined" style="${item?.image_url ? 'display: none;' : 'display: block;'} font-size: 40px; color: #94A3B8;">photo_camera</span>
                                    </div>

                                    <div style="display: flex; flex-direction: column; gap: 10px;">
                                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                            <label style="
                                                display: inline-flex;
                                                align-items: center;
                                                gap: 8px;
                                                height: 40px;
                                                padding: 0 18px;
                                                border-radius: var(--radius-full);
                                                font-weight: 700;
                                                font-size: 13.5px;
                                                background: var(--surface);
                                                color: var(--primary-dark);
                                                border: 1.5px solid var(--primary);
                                                cursor: pointer;
                                                transition: all 0.2s;
                                            ">
                                                <span class="material-symbols-outlined" style="font-size: 20px;">upload</span>
                                                <span>${isEn ? 'Select Photo' : 'Seleccionar Foto'}</span>
                                                <input type="file" id="itemPhotoFile" accept="image/*" style="display: none;" onchange="window.suppliersManager.handleImageSelected(this)" />
                                            </label>

                                            <label style="
                                                display: inline-flex;
                                                align-items: center;
                                                gap: 8px;
                                                height: 40px;
                                                padding: 0 18px;
                                                border-radius: var(--radius-full);
                                                font-weight: 700;
                                                font-size: 13.5px;
                                                background: var(--surface);
                                                color: #334155;
                                                border: 1.5px solid #CBD5E1;
                                                cursor: pointer;
                                            ">
                                                <span class="material-symbols-outlined" style="font-size: 20px;">photo_camera</span>
                                                <span>${isEn ? 'Take Photo' : 'Tomar Foto'}</span>
                                                <input type="file" accept="image/*" capture="environment" style="display: none;" onchange="window.suppliersManager.handleImageSelected(this)" />
                                            </label>

                                            <button type="button" id="btnRemovePhoto" onclick="window.suppliersManager.removePhoto()" style="
                                                display: ${item?.image_url ? 'inline-flex' : 'none'};
                                                align-items: center;
                                                gap: 6px;
                                                height: 40px;
                                                padding: 0 14px;
                                                border-radius: var(--radius-full);
                                                font-weight: 700;
                                                font-size: 13px;
                                                background: #FEE2E2;
                                                color: #DC2626;
                                                border: none;
                                                cursor: pointer;
                                            ">
                                                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                                                <span>${isEn ? 'Remove' : 'Quitar Foto'}</span>
                                            </button>
                                        </div>
                                        <input type="hidden" id="itemImageUrl" value="${item?.image_url || ''}" />
                                    </div>
                                </div>
                            </div>

                            <!-- Categoría y Formato / Unidad -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
                                <div>
                                    <label style="display: block; font-size: 13.5px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                        ${isEn ? 'Category' : 'Categoría'}
                                    </label>
                                    <select id="itemCategory" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 46px; font-size: 15px;">
                                        ${this.CATEGORIES.map(c => `
                                            <option value="${c.label}" ${item?.category === c.label ? 'selected' : ''}>${c.label}</option>
                                        `).join('')}
                                    </select>
                                </div>

                                <div>
                                    <label style="display: block; font-size: 13.5px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                        ${isEn ? 'Packaging Format / Unit' : 'Formato de Presentación / Unidad'}
                                    </label>
                                    <input type="text" id="itemFormat" value="${item?.package_format || item?.unit || ''}" placeholder="Ej. Caja 10kg, Bolsa 2kg, Manojo, Botella 750ml, Kg" class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 46px; font-size: 15px;" />
                                </div>
                            </div>

                            <!-- Notas del Producto -->
                            <div>
                                <label style="display: block; font-size: 13.5px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                    ${isEn ? 'Product Notes (Optional)' : 'Notas u Observaciones del Producto (Opcional)'}
                                </label>
                                <input type="text" id="itemNotes" value="${item?.notes || ''}" placeholder="Ej. Calibre grande, pedir fresco del día, marca preferida..." class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 46px; font-size: 14px;" />
                            </div>

                            <!-- Botones inferiores -->
                            <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; padding-top: 18px; border-top: 1px solid #F1F5F9;">
                                <button type="button" onclick="window.suppliersManager.backToList()" class="btn-supplier-cancel">
                                    ${isEn ? 'Cancel' : 'Cancelar'}
                                </button>
                                <button type="submit" id="btnSaveItem" class="btn-supplier-save">
                                    ${isEditing ? (isEn ? 'Update Product' : 'Guardar Cambios') : (isEn ? 'Add Product' : 'Agregar Producto')}
                                </button>
                            </div>
                        </form>
                    </div>
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

        /** Elimina producto con confirmación */
        async deleteItem(itemId) {
            const isEn = this.isEnglish();
            const it = this.items.find(i => i.id === itemId);
            if (!it) return;

            if (!confirm(isEn ? `Delete product "${it.name}"?` : `¿Eliminar producto "${it.name}"?`)) return;

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
                                background: #F1F5F9;
                                color: #334155;
                                border: 1px solid #CBD5E1;
                                cursor: pointer;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px;">content_copy</span>
                                <span>${isEn ? 'Copy' : 'Copiar'}</span>
                            </button>

                            <button type="button" onclick="window.suppliersManager.sendOrderByWhatsApp('${supplierId}')" style="
                                display: inline-flex;
                                align-items: center;
                                gap: 8px;
                                height: 40px;
                                padding: 0 20px;
                                border-radius: var(--radius-full);
                                font-weight: 700;
                                font-size: 13.5px;
                                background: #25D366;
                                color: #FFFFFF;
                                border: none;
                                cursor: pointer;
                                box-shadow: 0 2px 8px rgba(37, 211, 102, 0.35);
                            ">
                                <span class="material-symbols-outlined" style="font-size: 20px;">chat</span>
                                <span>${isEn ? 'Send WhatsApp' : 'Enviar WhatsApp'}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Tarjeta Principal del Pedido -->
                    <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 32px 28px; box-shadow: var(--shadow-subtle);">
                        <!-- Cabecera Proveedor y Estado -->
                        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid #F1F5F9;">
                            <div>
                                <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #0F172A;">
                                    ${isEn ? 'Order for' : 'Pedido para'} ${sup.name}
                                </h2>
                                <div style="font-size: 13.5px; color: #64748B; margin-top: 4px;">
                                    ${status.statusTitle} · ${status.statusSub}
                                </div>
                            </div>
                            <button type="button" onclick="window.suppliersManager.clearSupplierOrder('${supplierId}')" style="
                                font-size: 13px;
                                color: #EF4444;
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
                        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: var(--radius-lg); padding: 18px; margin-bottom: 24px;">
                            <label style="display: block; font-size: 13.5px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Order Notes (Optional)' : 'Observaciones del Pedido (Opcional)'}
                            </label>
                            <input type="text" id="orderNotesInput" value="${this.orderNotes[supplierId] || ''}" placeholder="Ej. Entregar antes de las 11:00 AM, factura a nombre de..." class="folder-modal-input" style="width: 100%; box-sizing: border-box; height: 42px; font-size: 14px;" oninput="window.suppliersManager.orderNotes['${supplierId}'] = this.value" />
                        </div>

                        <!-- Acciones Finales -->
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding-top: 18px; border-top: 1px solid #F1F5F9;">
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
                                background: #F1F5F9;
                                color: #334155;
                                border: 1px solid #CBD5E1;
                                cursor: pointer;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px;">content_copy</span>
                                <span>${isEn ? 'Copy Order' : 'Copiar Pedido'}</span>
                            </button>
                            <button type="button" onclick="window.suppliersManager.sendOrderByWhatsApp('${supplierId}')" style="
                                display: inline-flex;
                                align-items: center;
                                gap: 8px;
                                height: 44px;
                                padding: 0 24px;
                                border-radius: var(--radius-full);
                                font-weight: 700;
                                font-size: 14px;
                                background: #25D366;
                                color: #FFFFFF;
                                border: none;
                                cursor: pointer;
                                box-shadow: 0 2px 8px rgba(37, 211, 102, 0.35);
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
                    <div style="text-align: center; padding: 30px; color: #94A3B8;">
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
                        background: ${qty > 0 ? '#F0FDF4' : '#F8FAFC'};
                        border: 1px solid ${qty > 0 ? '#BBF7D0' : '#E2E8F0'};
                        border-radius: var(--radius-md);
                        gap: 12px;
                    ">
                        <!-- Foto y Nombre -->
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                            <div style="
                                width: 44px;
                                height: 44px;
                                border-radius: 10px;
                                background: #E2E8F0;
                                overflow: hidden;
                                flex-shrink: 0;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">
                                ${item.image_url ? `
                                    <img src="${item.image_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';" />
                                ` : `
                                    <span class="material-symbols-outlined" style="font-size: 22px; color: #94A3B8;">photo_camera</span>
                                `}
                            </div>
                            <div style="min-width: 0;">
                                <div style="font-size: 14px; font-weight: 700; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${item.name}
                                </div>
                                <div style="font-size: 11.5px; color: #64748B;">
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
                                border: 1px solid #CBD5E1;
                                background: #FFFFFF;
                                font-weight: 800;
                                font-size: 16px;
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
                                border: 1.5px solid ${qty > 0 ? '#10B981' : '#CBD5E1'};
                                border-radius: 8px;
                                background: #FFFFFF;
                                color: ${qty > 0 ? '#059669' : '#1E293B'};
                            " />

                            <button type="button" onclick="window.suppliersManager.updateOrderQty('${supplierId}', '${item.id}', 1)" style="
                                width: 30px;
                                height: 30px;
                                border-radius: 50%;
                                border: 1px solid #059669;
                                background: #ECFDF5;
                                color: #047857;
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
