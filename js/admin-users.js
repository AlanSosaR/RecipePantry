/**
 * Recipe Pantry - AdminUsersManager (Material 3 Expressive - Green Theme)
 * Panel de Gestión de Usuarios y Control de Acceso exclusivo para Super Administrador.
 * Autorizado exclusivamente para: alansosa225@gmail.com
 * Tarjeta limpia blanca, acentos verdes Material 3, integración con buscador global,
 * conteo real de notas/recetas, eliminación definitiva de usuarios y notificaciones snackbar.
 */

(function () {
    class AdminUsersManager {
        constructor() {
            this.SUPER_ADMIN_EMAIL = 'alansosa225@gmail.com';
            this.users = [];
            this.filteredUsers = [];
            this.selectedUser = null;
            this.searchQuery = '';
            this.isLoading = false;
            this.initialized = false;
            this._keyboardInitialized = false;
            this._reactiveAuthInitialized = false;
            this._globalSearchBound = false;

            this.initKeyboardEvents();
            this.initReactiveAuth();
            this.initGlobalSearch();
        }

        /**
         * Inicializa el cierre del modal con tecla Escape
         */
        initKeyboardEvents() {
            if (this._keyboardInitialized) return;
            this._keyboardInitialized = true;

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' || e.key === 'Esc') {
                    const modal = document.getElementById('admin-user-detail-modal');
                    if (modal && !modal.classList.contains('hidden')) {
                        this.closeUserModal();
                    }
                }
            });
        }

        /**
         * Detección reactiva de autenticación para enlaces directos (?view=help)
         * cuando el perfil termine de resolverse en segundo plano.
         */
        initReactiveAuth() {
            if (this._reactiveAuthInitialized) return;
            this._reactiveAuthInitialized = true;

            const checkAndRender = () => {
                if (typeof document === 'undefined' || !document.getElementById) return;
                const adminSection = document.getElementById('superadmin-users-section');
                if (adminSection && this.isSuperAdmin() && adminSection.children.length === 0) {
                    console.log('⚡ [AdminUsersManager] Autenticación reactiva detectada: renderizando panel Super Admin');
                    this.render(adminSection);
                }
            };

            window.addEventListener('auth-changed', checkAndRender);
            window.addEventListener('auth-ready', checkAndRender);

            if (window.supabaseClient?.auth?.onAuthStateChange) {
                try {
                    window.supabaseClient.auth.onAuthStateChange(() => {
                        setTimeout(checkAndRender, 60);
                    });
                } catch (e) {}
            }

            if (typeof window !== 'undefined' && window.location) {
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('view') === 'help') {
                    let attempts = 0;
                    const interval = setInterval(() => {
                        attempts++;
                        checkAndRender();
                        if (this.isSuperAdmin() || attempts > 15) {
                            clearInterval(interval);
                        }
                    }, 350);
                }
            }
        }

        /**
         * Conecta el buscador global existente (#searchInput) con este módulo
         */
        initGlobalSearch() {
            if (this._globalSearchBound) return;

            const bindSearch = () => {
                const searchInput = document.getElementById('searchInput');
                if (searchInput && !this._globalSearchBound) {
                    this._globalSearchBound = true;
                    searchInput.addEventListener('input', (e) => {
                        const currentView = document.documentElement.getAttribute('data-current-view') || 
                                            (window.dashboard && window.dashboard.currentView);
                        if (currentView === 'help' && this.isSuperAdmin()) {
                            this.handleSearch(e.target.value);
                        }
                    });
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', bindSearch);
            } else {
                bindSearch();
            }
        }

        /**
         * Muestra una notificación snackbar sin bloqueo modal
         */
        notify(message, type = 'info', timeout = 3000) {
            if (window.utils?.showToast) {
                window.utils.showToast(message, type, timeout);
            } else if (window.showToast) {
                window.showToast(message, type);
            } else {
                console.log(`[Toast ${type}]`, message);
            }
        }

        /**
         * Determina si el idioma activo es inglés
         */
        isEnglish() {
            return Boolean(window.i18n && window.i18n.getLang && window.i18n.getLang() === 'en');
        }

        /**
         * Verifica si el usuario actual es el Super Administrador
         */
        isSuperAdmin() {
            const authEmail = (
                window.authManager?.currentUser?.email ||
                window.authManager?.session?.user?.email ||
                ''
            ).toLowerCase().trim();
            return authEmail === this.SUPER_ADMIN_EMAIL;
        }

        /**
         * Renderiza el contenedor principal en la vista de configuración/help
         * Tarjeta completamente blanca sin difuminados, acentos verdes Material 3.
         */
        async render(container) {
            if (!container) return;

            // Restricción estricta de seguridad en cliente
            if (!this.isSuperAdmin()) {
                container.innerHTML = '';
                return;
            }

            const isEn = this.isEnglish();

            container.innerHTML = `
                <div class="admin-m3-section" style="position: relative; display: flex; flex-direction: column; gap: 16px;">
                    <!-- Estilos para Carrusel de Métricas M3 (Móvil) y Grid (Desktop) -->
                    <style>
                        .admin-metrics-carousel-wrapper {
                            position: relative;
                            margin-bottom: 20px;
                        }
                        .admin-metrics-carousel-track {
                            display: flex;
                            gap: 12px;
                            overflow-x: auto;
                            scroll-snap-type: x mandatory;
                            scroll-behavior: smooth;
                            -webkit-overflow-scrolling: touch;
                            padding: 4px 2px 8px 2px;
                            scrollbar-width: none;
                        }
                        .admin-metrics-carousel-track::-webkit-scrollbar {
                            display: none;
                        }
                        .admin-metric-card {
                            flex: 0 0 76%;
                            min-width: 200px;
                            max-width: 280px;
                            scroll-snap-align: start;
                            background: #FFFFFF;
                            border: 1px solid #E2E8F0;
                            border-radius: 18px;
                            padding: 16px;
                            display: flex;
                            align-items: center;
                            gap: 14px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.02);
                            transition: transform 0.2s, box-shadow 0.2s;
                            box-sizing: border-box;
                        }
                        .admin-metric-card:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 6px 14px rgba(0,0,0,0.05);
                        }
                        @media (min-width: 640px) {
                            .admin-metrics-carousel-track {
                                display: grid !important;
                                grid-template-columns: repeat(3, 1fr) !important;
                                overflow-x: visible !important;
                                padding-bottom: 0 !important;
                            }
                            .admin-metric-card {
                                flex: 1 1 0 !important;
                                max-width: none !important;
                                min-width: 0 !important;
                            }
                            .admin-metrics-carousel-dots {
                                display: none !important;
                            }
                        }
                        .admin-metrics-carousel-dots {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            gap: 6px;
                            margin-top: 6px;
                        }
                        .admin-metrics-dot {
                            width: 7px;
                            height: 7px;
                            border-radius: 50%;
                            background: #CBD5E1;
                            transition: all 0.25s ease;
                            cursor: pointer;
                        }
                        .admin-metrics-dot.active {
                            width: 20px;
                            border-radius: 10px;
                            background: #10B981;
                        }

                        /* Modal (PC) y Bottom Sheet (Móvil) M3 Expressive para Detalle de Usuario */
                        .admin-detail-backdrop {
                            position: fixed;
                            inset: 0;
                            background: rgba(15, 23, 42, 0.45);
                            backdrop-filter: blur(4px);
                            -webkit-backdrop-filter: blur(4px);
                            z-index: 99999;
                            display: flex;
                            opacity: 0;
                            pointer-events: none;
                            transition: opacity 0.3s ease;
                        }
                        .admin-detail-sheet {
                            background: var(--surface, #FFFFFF);
                            box-sizing: border-box;
                            overflow-y: auto;
                            -webkit-overflow-scrolling: touch;
                            font-family: var(--font-display, 'Poppins', sans-serif);
                            will-change: transform, opacity;
                        }

                        /* Desktop: Modal Card centrado */
                        @media (min-width: 641px) {
                            .admin-detail-backdrop {
                                align-items: center;
                                justify-content: center;
                                padding: 24px;
                            }
                            .admin-detail-sheet {
                                border-radius: var(--radius-xl, 28px);
                                max-width: 520px;
                                width: 100%;
                                max-height: 90vh;
                                box-shadow: var(--shadow-lg, 0 25px 60px -15px rgba(0, 0, 0, 0.3));
                                border: 1px solid var(--border, rgba(226, 232, 240, 0.8));
                                transform: scale(0.95) translateY(16px);
                                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                            }
                            .admin-sheet-drag-handle {
                                display: none !important;
                            }
                            .admin-sheet-header {
                                border-radius: var(--radius-xl, 28px) var(--radius-xl, 28px) 0 0;
                                padding: 22px 24px 18px 24px;
                            }
                            .admin-sheet-body {
                                padding: 22px 24px 24px 24px;
                                display: flex;
                                flex-direction: column;
                                gap: 14px;
                            }
                            .admin-sheet-status-card {
                                padding: 14px 16px;
                                border-radius: 16px;
                            }
                            .admin-sheet-tech-card {
                                padding: 18px;
                                border-radius: 18px;
                                gap: 12px;
                            }
                            .admin-sheet-action-btn {
                                padding: 13px 20px;
                                border-radius: 16px;
                                font-size: 13.5px;
                            }
                        }

                        /* Móvil: Material 3 Expressive Bottom Sheet con la misma física y transición de las recetas */
                        @media (max-width: 640px) {
                            .admin-detail-backdrop {
                                align-items: flex-end;
                                justify-content: center;
                                padding: 0;
                            }
                            .admin-detail-sheet {
                                width: 100% !important;
                                max-width: 100% !important;
                                border-radius: 28px 28px 0 0 !important;
                                max-height: 92vh !important;
                                box-shadow: 0 -8px 36px rgba(0, 0, 0, 0.22) !important;
                                border-top: 1px solid var(--border, #E2E8F0) !important;
                                border-left: none !important;
                                border-right: none !important;
                                border-bottom: none !important;
                                transform: translateY(0);
                                transition: height 0.45s cubic-bezier(0.25, 1, 0.5, 1), transform 0.45s cubic-bezier(0.25, 1, 0.5, 1);
                                padding-bottom: max(16px, env(safe-area-inset-bottom));
                                overscroll-behavior: contain;
                                overflow-y: auto !important;
                                overflow-x: hidden !important;
                                touch-action: pan-y;
                                box-sizing: border-box !important;
                            }
                            .admin-detail-sheet.is-expanded {
                                height: 92vh !important;
                                max-height: 92vh !important;
                            }
                            .admin-sheet-drag-handle {
                                display: block !important;
                                width: 38px;
                                height: 4px;
                                background: #CBD5E1;
                                border-radius: 4px;
                                margin: 6px auto 14px auto;
                                cursor: pointer;
                                flex-shrink: 0;
                                transition: background 0.2s, transform 0.15s;
                            }
                            .admin-sheet-drag-handle:active {
                                background: #94A3B8;
                                transform: scaleX(1.2);
                            }
                            .admin-sheet-header {
                                border-radius: 28px 28px 0 0 !important;
                                padding: 12px 18px 10px 18px !important;
                            }
                            .admin-sheet-header .admin-user-avatar {
                                width: 44px !important;
                                height: 44px !important;
                                border-radius: 14px !important;
                                font-size: 16px !important;
                            }
                            .admin-sheet-header h3 {
                                font-size: 15.5px !important;
                            }
                            .admin-sheet-header .admin-user-email {
                                font-size: 12px !important;
                            }
                            .admin-sheet-body {
                                padding: 12px 16px 14px 16px !important;
                                display: flex;
                                flex-direction: column;
                                gap: 10px !important;
                            }
                            .admin-sheet-status-card {
                                padding: 10px 14px !important;
                                border-radius: 14px !important;
                            }
                            .admin-sheet-tech-card {
                                padding: 11px 13px !important;
                                border-radius: 14px !important;
                                gap: 7px !important;
                            }
                            .admin-sheet-action-btn {
                                padding: 11px 16px !important;
                                border-radius: 14px !important;
                                font-size: 12.5px !important;
                        }
                    </style>

                    <!-- Header M3 Expressive en color verde -->
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <div style="
                                background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                                color: white;
                                width: 48px;
                                height: 48px;
                                border-radius: 16px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                flex-shrink: 0;
                                box-shadow: 0 6px 16px rgba(16, 185, 129, 0.25);
                            ">
                                <span class="material-symbols-outlined" style="font-size: 26px;">admin_panel_settings</span>
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #064E3B; letter-spacing: -0.02em;">
                                        ${isEn ? 'User Management' : 'Gestión de Usuarios'}
                                    </h3>
                                    <span style="
                                        background: rgba(16, 185, 129, 0.12);
                                        color: #047857;
                                        font-size: 11px;
                                        font-weight: 800;
                                        padding: 3px 10px;
                                        border-radius: 100px;
                                        text-transform: uppercase;
                                        letter-spacing: 0.05em;
                                        border: 1px solid rgba(16, 185, 129, 0.25);
                                        display: inline-flex;
                                        align-items: center;
                                        gap: 4px;
                                    ">
                                        <span class="material-symbols-outlined" style="font-size: 13px;">shield_person</span>
                                        Super Admin
                                    </span>
                                </div>
                                <p style="margin: 3px 0 0 0; font-size: 13px; color: #64748B;">
                                    ${isEn 
                                        ? 'Global account control, authorization, and database management.' 
                                        : 'Control global de cuentas, autorización de accesos y gestión de la base de datos.'}
                                </p>
                            </div>
                        </div>

                        <!-- Botón Refrescar en verde -->
                        <button type="button" id="btn-admin-refresh-users" onclick="window.adminUsersManager.loadUsers(true)" style="
                            padding: 8px 16px;
                            background: rgba(255, 255, 255, 0.95);
                            border: 1px solid #E2E8F0;
                            border-radius: 12px;
                            font-size: 12.5px;
                            font-weight: 600;
                            color: #059669;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            box-shadow: 0 2px 6px rgba(0,0,0,0.03);
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#ECFDF5'" onmouseout="this.style.background='rgba(255, 255, 255, 0.95)'">
                            <span class="material-symbols-outlined" style="font-size: 17px;">refresh</span>
                            <span>${isEn ? 'Refresh' : 'Actualizar'}</span>
                        </button>
                    </div>

                    <!-- Métricas M3 Expressive (KPIs) en una sola barra unificada -->
                    <div id="admin-users-metrics" style="
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 8px;
                        background: #F8FAFC;
                        border: 1px solid #E2E8F0;
                        border-radius: 16px;
                        padding: 12px 10px;
                        margin-bottom: 8px;
                    ">
                        <!-- Skeleton inicial -->
                        <div style="grid-column: 1 / -1; text-align: center; padding: 8px; color: #64748B; font-size: 13px;">
                            <span class="material-symbols-outlined" style="font-size: 20px; color: #10B981; animation: spin 1.2s linear infinite; vertical-align: middle;">sync</span>
                            <span style="margin-left: 6px;">${isEn ? 'Loading metrics...' : 'Cargando métricas...'}</span>
                        </div>
                    </div>

                    <!-- Lista de Usuarios M3 -->
                    <div id="admin-users-list" style="
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                        max-height: 480px;
                        overflow-y: auto;
                        padding-right: 4px;
                    ">
                        <!-- Se llena dinámicamente -->
                    </div>
                </div>
                <div style="border-top: 1px solid #E2E8F0; margin: 4px -2px 0 -2px;"></div>

                <!-- Modal (PC) / Bottom Sheet (Móvil) de Detalle de Usuario M3 Expressive -->
                <div id="admin-user-detail-modal" class="admin-detail-backdrop hidden" 
                    onclick="if(event.target===this) window.adminUsersManager.closeUserModal()">
                    <div id="admin-user-detail-card" class="admin-detail-sheet">
                        <!-- Contenido dinámico del detalle -->
                    </div>
                </div>
            `;

            this.initGlobalSearch();

            // Optimización de caché en memoria:
            if (this.users && this.users.length > 0) {
                this.applyFilter();
                this.renderMetrics();
                this.renderList();
            } else {
                await this.loadUsers(false);
            }
        }

        /**
         * Carga la lista de usuarios desde Supabase
         */
        async loadUsers(showFeedback = false) {
            if (this.isLoading) return;
            this.isLoading = true;

            const isEn = this.isEnglish();
            const listEl = document.getElementById('admin-users-list');
            if (listEl && showFeedback) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #64748B;">
                        <span class="material-symbols-outlined" style="font-size: 32px; color: #10B981; animation: spin 1s linear infinite;">sync</span>
                        <p style="margin: 8px 0 0 0; font-size: 13.5px; font-weight: 600;">
                            ${isEn ? 'Synchronizing users...' : 'Sincronizando usuarios...'}
                        </p>
                    </div>
                `;
            }

            try {
                let usersData = null;
                const { data: rpcData, error: rpcError } = await window.supabaseClient.rpc('admin_get_all_users');

                if (!rpcError && Array.isArray(rpcData)) {
                    usersData = rpcData;
                } else {
                    const { data: selectData, error: selectError } = await window.supabaseClient
                        .from('users')
                        .select('*')
                        .order('created_at', { ascending: false });

                    if (selectError) throw selectError;
                    usersData = selectData || [];
                }

                this.users = usersData.map(u => ({
                    ...u,
                    is_active: u.is_active !== false
                }));

                this.applyFilter();
                this.renderMetrics();
                this.renderList();

                if (showFeedback) {
                    const toastMsg = isEn 
                        ? `✅ ${this.users.length} users synchronized`
                        : `✅ ${this.users.length} usuarios sincronizados`;
                    this.notify(toastMsg, 'success', 2000);
                }
            } catch (err) {
                console.error('❌ Error al cargar usuarios para Super Admin:', err);
                if (listEl) {
                    listEl.innerHTML = `
                        <div style="text-align: center; padding: 30px; background: #FEF2F2; border-radius: 16px; border: 1px solid #FEE2E2;">
                            <span class="material-symbols-outlined" style="font-size: 32px; color: #EF4444;">error</span>
                            <p style="margin: 6px 0 0 0; font-size: 13.5px; font-weight: 700; color: #991B1B;">
                                ${isEn ? 'Error fetching users' : 'Error al obtener usuarios'}
                            </p>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: #B91C1C;">
                                ${err.message || (isEn ? 'Verify your connection and permissions.' : 'Verifica tu conexión y permisos.')}
                            </p>
                        </div>
                    `;
                }
            } finally {
                this.isLoading = false;
            }
        }

        /**
         * Renderiza tarjetas de métricas en verde M3
         */
        renderMetrics() {
            const metricsEl = document.getElementById('admin-users-metrics');
            if (!metricsEl) return;

            const isEn = this.isEnglish();
            const total = this.users.length;
            const activos = this.users.filter(u => u.is_active).length;
            const inactivos = total - activos;

            metricsEl.innerHTML = `
                <!-- Total Usuarios -->
                <div style="display: flex; align-items: center; justify-content: center; text-align: center; flex-direction: column; padding: 4px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 18px; color: #10B981;">group</span>
                        <span style="font-size: 20px; font-weight: 800; color: #1E293B; line-height: 1;">${total}</span>
                    </div>
                    <span style="font-size: 11.5px; font-weight: 600; color: #64748B; margin-top: 4px;">${isEn ? 'Users' : 'Usuarios'}</span>
                </div>

                <!-- Activos -->
                <div style="display: flex; align-items: center; justify-content: center; text-align: center; flex-direction: column; padding: 4px; border-left: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 18px; color: #059669;">check_circle</span>
                        <span style="font-size: 20px; font-weight: 800; color: #047857; line-height: 1;">${activos}</span>
                    </div>
                    <span style="font-size: 11.5px; font-weight: 600; color: #047857; margin-top: 4px;">${isEn ? 'Active' : 'Activos'}</span>
                </div>

                <!-- Bloqueados -->
                <div style="display: flex; align-items: center; justify-content: center; text-align: center; flex-direction: column; padding: 4px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="material-symbols-outlined" style="font-size: 18px; color: #EF4444;">block</span>
                        <span style="font-size: 20px; font-weight: 800; color: #B91C1C; line-height: 1;">${inactivos}</span>
                    </div>
                    <span style="font-size: 11.5px; font-weight: 600; color: #B91C1C; margin-top: 4px;">${isEn ? 'Blocked' : 'Bloqueados'}</span>
                </div>
            `;
        }

        setupMetricsCarousel() {}

        /**
         * Inicializa eventos de scroll para actualizar los puntos del carrusel de métricas en móvil
         */
        setupMetricsCarousel() {
            const track = document.getElementById('admin-users-metrics');
            const dots = document.querySelectorAll('.admin-metrics-dot');
            if (!track || !dots.length) return;

            if (this._carouselScrollHandler) {
                track.removeEventListener('scroll', this._carouselScrollHandler);
            }

            this._carouselScrollHandler = () => {
                const scrollLeft = track.scrollLeft;
                const card = track.querySelector('.admin-metric-card');
                const cardWidth = card ? card.offsetWidth + 12 : 210;
                const activeIndex = Math.min(dots.length - 1, Math.max(0, Math.round(scrollLeft / cardWidth)));
                dots.forEach((dot, idx) => {
                    if (idx === activeIndex) {
                        dot.classList.add('active');
                    } else {
                        dot.classList.remove('active');
                    }
                });
            };

            track.addEventListener('scroll', this._carouselScrollHandler, { passive: true });
        }

        /**
         * Desplaza el carrusel de métricas a la tarjeta seleccionada
         */
        scrollToMetricCard(index) {
            const track = document.getElementById('admin-users-metrics');
            if (!track) return;
            const cards = track.querySelectorAll('.admin-metric-card');
            if (cards[index]) {
                cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
            }
        }

        /**
         * Maneja la búsqueda conectada al buscador global (#searchInput)
         */
        handleSearch(val) {
            this.searchQuery = (val || '').toLowerCase().trim();
            this.applyFilter();
            this.renderList();
        }

        clearSearch() {
            this.searchQuery = '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            this.applyFilter();
            this.renderList();
        }

        applyFilter() {
            if (!this.searchQuery) {
                this.filteredUsers = [...this.users];
                return;
            }
            this.filteredUsers = this.users.filter(u => {
                const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
                const email = (u.email || '').toLowerCase();
                return name.includes(this.searchQuery) || email.includes(this.searchQuery);
            });
        }

        /**
         * Renderiza la lista de tarjetas M3 de usuarios
         */
        renderList() {
            const listEl = document.getElementById('admin-users-list');
            if (!listEl) return;

            const isEn = this.isEnglish();

            if (this.filteredUsers.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 36px; background: #F8FAFC; border-radius: 16px; border: 1px dashed #CBD5E1;">
                        <span class="material-symbols-outlined" style="font-size: 32px; color: #94A3B8;">search_off</span>
                        <p style="margin: 6px 0 0 0; font-size: 13.5px; font-weight: 600; color: #64748B;">
                            ${isEn ? 'No matching users found' : 'No se encontraron usuarios coincidentes'}
                        </p>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = this.filteredUsers.map(user => {
                const isSuperAdminUser = (user.email || '').toLowerCase().trim() === this.SUPER_ADMIN_EMAIL;
                const initials = ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || 'U';
                const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || (isEn ? 'No Name' : 'Sin Nombre');
                const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric'
                }) : (isEn ? 'Unrecorded date' : 'Fecha no registrada');

                const statusColor = user.is_active ? '#10B981' : '#EF4444';
                const statusBg = user.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                const statusText = user.is_active 
                    ? (isEn ? 'Active' : 'Activo') 
                    : (isEn ? 'Blocked' : 'Bloqueado');
                const statusBorder = user.is_active ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';

                return `
                    <div class="admin-user-card" onclick="window.adminUsersManager.openUserModal('${user.id}')" style="
                        background: #FFFFFF;
                        border: 1px solid #E2E8F0;
                        border-radius: 18px;
                        padding: 14px 18px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 14px;
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: 0 2px 6px rgba(0,0,0,0.015);
                    "
                    onmouseover="this.style.borderColor='#10B981'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(16, 185, 129, 0.08)';"
                    onmouseout="this.style.borderColor='#E2E8F0'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.015)';"
                    >
                        <div style="display: flex; align-items: center; gap: 14px; min-width: 0;">
                            <!-- Avatar verde M3 -->
                            <div style="
                                width: 44px;
                                height: 44px;
                                border-radius: 14px;
                                background: linear-gradient(135deg, #10B981, #059669);
                                color: white;
                                font-size: 15px;
                                font-weight: 800;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                flex-shrink: 0;
                                overflow: hidden;
                            ">
                                ${user.avatar_url ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">` : (isSuperAdminUser ? '<span class="material-symbols-outlined" style="font-size: 24px;">shield_person</span>' : initials)}
                            </div>

                            <!-- Información principal -->
                            <div style="min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <div style="
                                        font-size: 14.5px;
                                        font-weight: 700;
                                        color: #1E293B;
                                        white-space: nowrap;
                                        overflow: hidden;
                                        text-overflow: ellipsis;
                                    ">
                                        ${fullName}
                                    </div>
                                    ${isSuperAdminUser ? `
                                        <span title="Super Admin" style="
                                            background: linear-gradient(135deg, #10B981, #059669);
                                            color: #FFFFFF;
                                            width: 20px;
                                            height: 20px;
                                            border-radius: 6px;
                                            display: inline-flex;
                                            align-items: center;
                                            justify-content: center;
                                            flex-shrink: 0;
                                            box-shadow: 0 2px 5px rgba(16, 185, 129, 0.3);
                                        ">
                                            <span class="material-symbols-outlined" style="font-size: 13px;">shield_person</span>
                                        </span>
                                    ` : ''}
                                </div>
                                <div style="
                                    font-size: 12.5px;
                                    color: #64748B;
                                    white-space: nowrap;
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    margin-top: 2px;
                                ">
                                    ${user.email}
                                </div>
                            </div>
                        </div>

                        <!-- Estado y Flecha -->
                        <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                <span style="
                                    background: ${statusBg};
                                    color: ${statusColor};
                                    border: 1px solid ${statusBorder};
                                    font-size: 11px;
                                    font-weight: 700;
                                    padding: 2.5px 10px;
                                    border-radius: 100px;
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 4px;
                                ">
                                    <span style="width: 6px; height: 6px; border-radius: 50%; background: ${statusColor};"></span>
                                    ${statusText}
                                </span>
                                <span style="font-size: 11px; color: #94A3B8;">
                                    ${isEn ? 'Registered:' : 'Registrado:'} ${createdDate}
                                </span>
                            </div>

                            <span class="material-symbols-outlined" style="font-size: 20px; color: #CBD5E1;">
                                chevron_right
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        /**
         * Carga de forma asíncrona y exacta el conteo real de notas y recetas del usuario
         */
        async loadUserStats(user) {
            if (!user) return;
            const targetUserId = user.auth_user_id || user.id;
            const profileId = user.id;

            let notesCount = 0;
            // 1. Revisar caché local en localStorage (útil para el admin actual)
            try {
                const cachedRaw = localStorage.getItem(`pantry_notes_cache_${targetUserId}`) || 
                                  localStorage.getItem(`pantry_notes_cache_${profileId}`);
                if (cachedRaw) {
                    const parsed = JSON.parse(cachedRaw);
                    if (Array.isArray(parsed)) {
                        notesCount = parsed.length;
                    }
                }
            } catch (_) {}

            // 2. Consultar conteo exacto en Supabase para 'notes'
            try {
                const { count, error } = await window.supabaseClient
                    .from('notes')
                    .select('*', { count: 'exact', head: true })
                    .or(`user_id.eq.${targetUserId},user_id.eq.${profileId}`);

                if (!error && typeof count === 'number') {
                    notesCount = Math.max(notesCount, count);
                }
            } catch (_) {}

            user.notes_count = notesCount;

            // 3. Consultar conteo exacto en Supabase para 'recipes'
            let recipesCount = 0;
            try {
                const { count, error } = await window.supabaseClient
                    .from('recipes')
                    .select('*', { count: 'exact', head: true })
                    .or(`user_id.eq.${targetUserId},user_id.eq.${profileId}`);

                if (!error && typeof count === 'number') {
                    recipesCount = count;
                }
            } catch (_) {}

            user.recipes_count = recipesCount;

            // Actualizar elementos en el DOM si el modal está abierto para este usuario
            const recEl = document.getElementById(`user-recipes-count-${user.id}`);
            if (recEl) recEl.textContent = user.recipes_count;
            const noteEl = document.getElementById(`user-notes-count-${user.id}`);
            if (noteEl) noteEl.textContent = user.notes_count;
        }

        /**
         * Abre el Modal con la información detallada del usuario y opciones de control de acceso
         */
        openUserModal(userId) {
            const user = this.users.find(u => u.id === userId);
            if (!user) return;
            this.selectedUser = user;

            const isEn = this.isEnglish();
            const modal = document.getElementById('admin-user-detail-modal');
            const card = document.getElementById('admin-user-detail-card');
            if (!modal || !card) return;

            const isSuperAdminUser = (user.email || '').toLowerCase().trim() === this.SUPER_ADMIN_EMAIL;
            const initials = ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || 'U';
            const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || (isEn ? 'No Name' : 'Sin Nombre');
            const createdDate = user.created_at ? new Date(user.created_at).toLocaleString() : (isEn ? 'Unrecorded' : 'No registrado');
            const updatedDate = user.updated_at ? new Date(user.updated_at).toLocaleString() : (isEn ? 'Unrecorded' : 'No registrado');

            const statusBg = user.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';
            const statusTextColor = user.is_active ? '#047857' : '#B91C1C';
            const statusText = user.is_active 
                ? (isEn ? 'Access Granted (Active)' : 'Acceso Permitido (Activo)') 
                : (isEn ? 'Access Revoked (Blocked)' : 'Acceso Revocado (Bloqueado)');
            const statusIcon = user.is_active ? 'check_circle' : 'block';

            card.innerHTML = `
                <!-- Drag Handle para Mobile Bottom Sheet M3 Expressive -->
                <div class="admin-sheet-drag-handle" onclick="window.adminUsersManager.toggleSheetExpand()" title="Deslizar o tocar para expandir"></div>

                <!-- Cabecera del modal / bottom sheet en verde M3 -->
                <div class="admin-sheet-header" style="
                    border-bottom: 1px solid #E2E8F0;
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    background: linear-gradient(135deg, #F8FAFC 0%, #ECFDF5 100%);
                ">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div class="admin-user-avatar" style="
                            width: 50px;
                            height: 50px;
                            border-radius: 16px;
                            background: linear-gradient(135deg, #10B981, #059669);
                            color: white;
                            font-size: 18px;
                            font-weight: 800;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.25);
                            overflow: hidden;
                            flex-shrink: 0;
                        ">
                            ${user.avatar_url ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">` : (isSuperAdminUser ? '<span class="material-symbols-outlined" style="font-size: 26px;">shield_person</span>' : initials)}
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #064E3B;">
                                    ${fullName}
                                </h3>
                                ${isSuperAdminUser ? `
                                    <span style="background: #059669; color: white; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 100px; display: inline-flex; align-items: center; gap: 3px;">
                                        <span class="material-symbols-outlined" style="font-size: 12px;">shield_person</span>
                                        Super Admin
                                    </span>
                                ` : ''}
                            </div>
                            <div class="admin-user-email" style="font-size: 13px; color: #64748B; margin-top: 2px; word-break: break-all;">
                                ${user.email}
                            </div>
                        </div>
                    </div>

                    <button type="button" onclick="window.adminUsersManager.closeUserModal()" style="
                        background: rgba(255,255,255,0.9);
                        border: 1px solid #CBD5E1;
                        border-radius: 50%;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #64748B;
                        cursor: pointer;
                        flex-shrink: 0;
                    ">
                        <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
                    </button>
                </div>

                <!-- Cuerpo con Datos Completos del Usuario -->
                <div class="admin-sheet-body">
                    <!-- Estado Actual Banner M3 -->
                    <div class="admin-sheet-status-card" style="
                        background: ${statusBg};
                        border: 1px solid ${user.is_active ? '#A7F3D0' : '#FECACA'};
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                    ">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="material-symbols-outlined" style="font-size: 20px; color: ${statusTextColor};">${statusIcon}</span>
                            <div>
                                <div style="font-size: 13px; font-weight: 800; color: ${statusTextColor};">
                                    ${statusText}
                                </div>
                                <div style="font-size: 11.5px; color: #475569; margin-top: 1px;">
                                    ${user.is_active 
                                        ? (isEn ? 'The user has full access to the application.' : 'El usuario tiene acceso completo a la aplicación.')
                                        : (isEn ? 'The user is denied access and cannot use the app.' : 'El usuario tiene el acceso denegado y no puede usar la app.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Ficha de Datos Técnicos M3 -->
                    <div class="admin-sheet-tech-card" style="
                        background: #F8FAFC;
                        border: 1px solid #E2E8F0;
                        display: flex;
                        flex-direction: column;
                    ">
                        <div style="font-size: 11px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.05em;">
                            ${isEn ? 'Account Information' : 'Información de la Cuenta'}
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div>
                                <span style="font-size: 11px; color: #94A3B8;">${isEn ? 'Registration Date:' : 'Fecha de Registro:'}</span>
                                <div style="font-size: 12px; font-weight: 600; color: #1E293B;">
                                    ${createdDate}
                                </div>
                            </div>
                            <div>
                                <span style="font-size: 11px; color: #94A3B8;">${isEn ? 'Last Modified:' : 'Última Modificación:'}</span>
                                <div style="font-size: 12px; font-weight: 600; color: #1E293B;">
                                    ${updatedDate}
                                </div>
                            </div>
                        </div>

                        <!-- Conteo real de Recetas y Notas -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 2px;">
                            <div>
                                <span style="font-size: 11px; color: #94A3B8;">${isEn ? 'Created Recipes:' : 'Recetas Creadas:'}</span>
                                <div id="user-recipes-count-${user.id}" style="font-size: 13.5px; font-weight: 800; color: #059669;">
                                    ${user.recipes_count !== undefined ? user.recipes_count : (isEn ? 'Loading...' : 'Consultando...')}
                                </div>
                            </div>
                            <div>
                                <span style="font-size: 11px; color: #94A3B8;">${isEn ? 'Created Notes:' : 'Notas Creadas:'}</span>
                                <div id="user-notes-count-${user.id}" style="font-size: 13.5px; font-weight: 800; color: #059669;">
                                    ${user.notes_count !== undefined ? user.notes_count : (isEn ? 'Loading...' : 'Consultando...')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Panel de Acción: Restablecer Contraseña, Conceder / Revocar Acceso y Eliminación Definitiva -->
                    <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
                        
                        <!-- Botón Enviar Enlace para Restablecer Contraseña -->
                        <button type="button" id="btn-admin-reset-password" class="admin-sheet-action-btn" onclick="window.adminUsersManager.handleSendPasswordReset('${user.id}')" style="
                            width: 100%;
                            background: #EFF6FF;
                            color: #2563EB;
                            border: 1.5px solid rgba(37, 99, 235, 0.3);
                            font-weight: 700;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            transition: all 0.2s;
                        "
                        onmouseover="this.style.background='#2563EB'; this.style.color='#FFFFFF';"
                        onmouseout="this.style.background='#EFF6FF'; this.style.color='#2563EB';"
                        >
                            <span class="material-symbols-outlined" style="font-size: 19px;">lock_reset</span>
                            <span>${isEn ? 'Send Password Reset Link' : 'Enviar Enlace para Restablecer Contraseña'}</span>
                        </button>
                        ${isSuperAdminUser ? `
                            <div style="
                                background: #F0FDF4;
                                border: 1px solid #BBF7D0;
                                border-radius: 14px;
                                padding: 12px;
                                text-align: center;
                                font-size: 12px;
                                color: #166534;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 6px;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #10B981;">lock</span>
                                <span>${isEn ? 'Your Super Admin account is protected against revocation or deletion.' : 'Tu propia cuenta de Super Administrador está protegida contra revocación o eliminación.'}</span>
                            </div>
                        ` : `
                            <!-- Botón Conceder / Revocar Acceso -->
                            ${user.is_active ? `
                                <button type="button" id="btn-admin-toggle-access" class="admin-sheet-action-btn" onclick="window.adminUsersManager.handleToggleAccess('${user.id}', false)" style="
                                    width: 100%;
                                    background: #FEF2F2;
                                    color: #DC2626;
                                    border: 1.5px solid rgba(220, 38, 38, 0.3);
                                    font-weight: 700;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 8px;
                                    transition: all 0.2s;
                                "
                                onmouseover="this.style.background='#DC2626'; this.style.color='#FFFFFF';"
                                onmouseout="this.style.background='#FEF2F2'; this.style.color='#DC2626';"
                                >
                                    <span class="material-symbols-outlined" style="font-size: 19px;">block</span>
                                    <span>${isEn ? 'Revoke App Access' : 'Revocar Acceso a mi Aplicación'}</span>
                                </button>
                            ` : `
                                <button type="button" id="btn-admin-toggle-access" class="admin-sheet-action-btn" onclick="window.adminUsersManager.handleToggleAccess('${user.id}', true)" style="
                                    width: 100%;
                                    background: #10B981;
                                    color: #FFFFFF;
                                    border: none;
                                    font-weight: 700;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 8px;
                                    transition: all 0.2s;
                                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
                                "
                                onmouseover="this.style.background='#059669';"
                                onmouseout="this.style.background='#10B981';"
                                >
                                    <span class="material-symbols-outlined" style="font-size: 19px;">check_circle</span>
                                    <span>${isEn ? 'Grant App Access' : 'Conceder Acceso a mi Aplicación'}</span>
                                </button>
                            `}

                            <!-- Botón para Eliminar Usuario de la BD -->
                            <button type="button" id="btn-admin-delete-user" class="admin-sheet-action-btn" onclick="window.adminUsersManager.handleDeleteUser('${user.id}')" style="
                                width: 100%;
                                background: #FFF1F2;
                                color: #E11D48;
                                border: 1.5px solid rgba(225, 29, 72, 0.3);
                                font-weight: 700;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 8px;
                                transition: all 0.2s;
                            "
                            onmouseover="this.style.background='#E11D48'; this.style.color='#FFFFFF';"
                            onmouseout="this.style.background='#FFF1F2'; this.style.color='#E11D48';"
                            >
                                <span class="material-symbols-outlined" style="font-size: 19px;">delete_forever</span>
                                <span>${isEn ? 'Permanently Delete User from DB' : 'Eliminar Usuario de la BD'}</span>
                            </button>
                        `}
                    </div>
                </div>
            `;

            const isMobile = window.matchMedia('(max-width: 640px)').matches;
            modal.classList.remove('hidden');
            modal.style.pointerEvents = 'auto';

            this._touchStartY = 0;
            this._touchDiffY = 0;
            this._isSheetExpanded = false;
            this._initialSheetHeight = 0;
            const smoothCurve = 'height 0.45s cubic-bezier(0.25, 1, 0.5, 1), transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)';

            if (isMobile) {
                card.classList.remove('is-expanded');
                card.style.height = 'auto';
                card.style.transform = 'translateY(100%)';
                card.style.transition = 'transform 0.38s cubic-bezier(0.1, 0.9, 0.2, 1)';
                modal.style.transition = 'opacity 0.28s ease';

                const measureBaseHeight = () => {
                    if (!this._isSheetExpanded && card.offsetHeight > 50) {
                        this._initialSheetHeight = card.offsetHeight;
                        card.style.height = `${this._initialSheetHeight}px`;
                    }
                };

                requestAnimationFrame(() => {
                    modal.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                    requestAnimationFrame(measureBaseHeight);
                    setTimeout(measureBaseHeight, 60);
                });
            } else {
                card.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
                modal.style.transition = 'opacity 0.3s ease';
                requestAnimationFrame(() => {
                    modal.style.opacity = '1';
                    card.style.transform = 'scale(1) translateY(0)';
                });
            }

            // Gestos táctiles de deslizamiento interactivo hacia arriba o abajo idénticos a los de las recetas
            if (!this._touchInitialized) {
                this._touchInitialized = true;

                card.addEventListener('touchstart', (e) => {
                    if (window.matchMedia('(max-width: 640px)').matches) {
                        this._touchStartY = e.touches[0].clientY;
                        this._touchDiffY = 0;
                        if (!this._initialSheetHeight && !this._isSheetExpanded) {
                            this._initialSheetHeight = card.offsetHeight || 380;
                        }
                    }
                }, { passive: true });

                card.addEventListener('touchmove', (e) => {
                    if (window.matchMedia('(max-width: 640px)').matches && this._touchStartY > 0) {
                        this._touchDiffY = e.touches[0].clientY - this._touchStartY;
                        if (!this._initialSheetHeight && !this._isSheetExpanded) {
                            this._initialSheetHeight = card.offsetHeight || 380;
                        }

                        if (!this._isSheetExpanded) {
                            if (this._touchDiffY < 0) {
                                // Jalando hacia arriba: sube dinámicamente hacia 92vh
                                const targetH = Math.min(window.innerHeight * 0.92, this._initialSheetHeight - this._touchDiffY);
                                card.style.transition = 'none';
                                card.style.height = `${targetH}px`;
                                card.style.transform = 'translateY(0)';
                            } else {
                                // Jalando hacia abajo: se desliza hacia abajo
                                card.style.transition = 'none';
                                card.style.transform = `translateY(${this._touchDiffY}px)`;
                            }
                        } else {
                            // Si ya está expandido y está arriba del scroll, contraer hacia abajo dinámicamente
                            if (card.scrollTop <= 2 && this._touchDiffY > 0) {
                                const startH = window.innerHeight * 0.92;
                                const targetH = Math.max(this._initialSheetHeight, startH - this._touchDiffY);
                                card.style.transition = 'none';
                                card.style.height = `${targetH}px`;
                                card.style.transform = 'translateY(0)';
                            }
                        }
                    }
                }, { passive: true });

                card.addEventListener('touchend', () => {
                    if (window.matchMedia('(max-width: 640px)').matches && this._touchStartY > 0) {
                        if (!this._initialSheetHeight && !this._isSheetExpanded) {
                            this._initialSheetHeight = card.offsetHeight || 380;
                        }
                        card.style.transition = smoothCurve;
                        void card.offsetHeight; // Forzar reflow para aplicar transición en todos los navegadores

                        if (!this._isSheetExpanded) {
                            if (this._touchDiffY < -35) {
                                // Se jaló hacia arriba: expandir a pantalla casi completa (92vh) con transición suave
                                this._isSheetExpanded = true;
                                card.classList.add('is-expanded');
                                card.style.height = '92vh';
                                card.style.transform = 'translateY(0)';
                            } else if (this._touchDiffY > 80) {
                                // Deslizado hacia abajo: cerrar con animación suave
                                this.closeUserModal();
                            } else {
                                // Regresar suavemente a la altura inicial
                                card.style.height = `${this._initialSheetHeight}px`;
                                card.style.transform = 'translateY(0)';
                            }
                        } else {
                            if (this._touchDiffY > 40) {
                                // Se jaló hacia abajo: contraer suavemente a la altura normal (misma curva que al subir)
                                this._isSheetExpanded = false;
                                card.classList.remove('is-expanded');
                                card.style.height = `${this._initialSheetHeight}px`;
                                card.style.transform = 'translateY(0)';
                            } else {
                                // Regresar suavemente a expandido 92vh
                                card.style.height = '92vh';
                                card.style.transform = 'translateY(0)';
                            }
                        }
                        this._touchStartY = 0;
                        this._touchDiffY = 0;
                    }
                }, { passive: true });
            }

            // Disparar carga real de estadísticas (notas y recetas)
            this.loadUserStats(user);
        }

        /**
         * Alterna o fuerza la expansión completa del Bottom Sheet hacia arriba en móvil con la curva de receta
         */
        toggleSheetExpand(forceExpand = null) {
            const card = document.getElementById('admin-user-detail-card');
            if (!card || !window.matchMedia('(max-width: 640px)').matches) return;
            const smoothCurve = 'height 0.45s cubic-bezier(0.25, 1, 0.5, 1), transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)';
            if (!this._initialSheetHeight) this._initialSheetHeight = card.offsetHeight || 380;
            const shouldExpand = forceExpand !== null ? forceExpand : !this._isSheetExpanded;

            this._isSheetExpanded = shouldExpand;
            card.style.transition = smoothCurve;
            void card.offsetHeight; // Forzar reflow para asegurar animación suave
            card.classList.toggle('is-expanded', this._isSheetExpanded);
            if (this._isSheetExpanded) {
                card.style.height = '92vh';
            } else {
                card.style.height = `${this._initialSheetHeight}px`;
            }
            card.style.transform = 'translateY(0)';
        }

        /**
         * Cierra el modal / bottom sheet de detalle con animación orgánica
         */
        closeUserModal() {
            const modal = document.getElementById('admin-user-detail-modal');
            const card = document.getElementById('admin-user-detail-card');
            if (!modal || !card) return;

            const isMobile = window.matchMedia('(max-width: 640px)').matches;
            modal.style.transition = 'opacity 0.28s ease';
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';

            if (isMobile) {
                card.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 1, 1), height 0.32s cubic-bezier(0.4, 0, 1, 1)';
                card.style.transform = 'translateY(100%)';
            } else {
                card.style.transition = 'transform 0.25s ease';
                card.style.transform = 'scale(0.95) translateY(12px)';
            }

            setTimeout(() => {
                modal.classList.add('hidden');
                card.classList.remove('is-expanded');
                card.style.height = '';
                this._isSheetExpanded = false;
                this._initialSheetHeight = 0;
            }, 320);
        }

        /**
         * Manejador para enviar enlace de recuperación de contraseña al correo del usuario
         */
        async handleSendPasswordReset(userId) {
            const user = this.users.find(u => u.id === userId);
            if (!user || !user.email) {
                const isEn = this.isEnglish();
                this.notify(isEn ? '⚠️ User has no valid email registered' : '⚠️ El usuario no tiene un correo válido registrado', 'error', 3000);
                return;
            }

            const isEn = this.isEnglish();
            const confirmMsg = isEn
                ? `Send password reset email to ${user.email}?`
                : `¿Enviar enlace para restablecer contraseña a ${user.email}?`;

            const actionBtn = isEn ? 'Send Email' : 'Enviar Correo';
            const cancelBtn = isEn ? 'Cancel' : 'Cancelar';

            const doSend = async () => {
                await this._executeSendPasswordReset(userId);
            };

            const triggerAction = window.showActionToast || window.utils?.showActionToast;

            if (triggerAction) {
                triggerAction({
                    message: confirmMsg,
                    actionText: actionBtn,
                    cancelText: cancelBtn,
                    actionColor: '#2563EB',
                    type: 'info',
                    onConfirm: doSend
                });
            } else {
                await doSend();
            }
        }

        /**
         * Ejecuta el envío de restablecimiento de contraseña mediante Supabase Auth
         */
        async _executeSendPasswordReset(userId) {
            const user = this.users.find(u => u.id === userId);
            if (!user || !user.email) return;

            const isEn = this.isEnglish();
            const btn = document.getElementById('btn-admin-reset-password');
            const origHTML = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px; animation: spin 1s linear infinite;">sync</span> ${isEn ? 'Sending link...' : 'Enviando enlace...'}`;
            }

            try {
                const redirectUrl = window.location.origin + '/reset-password.html';
                const { error } = await window.supabaseClient.auth.resetPasswordForEmail(user.email, {
                    redirectTo: redirectUrl
                });

                if (error) throw error;

                const successMsg = isEn 
                    ? `📧 Reset link sent to ${user.email}` 
                    : `📧 Enlace de restablecimiento enviado a ${user.email}`;
                this.notify(successMsg, 'success', 3500);

            } catch (err) {
                console.error('❌ Error enviando reset de contraseña:', err);
                const errMsg = isEn 
                    ? `❌ Error sending reset email: ${err.message || 'Unknown error'}` 
                    : `❌ Error al enviar enlace: ${err.message || 'Error desconocido'}`;
                this.notify(errMsg, 'error', 4000);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = origHTML;
                }
            }
        }

        /**
         * Manejador de confirmación para conceder o revocar acceso vía snackbar / showActionToast
         */
        async handleToggleAccess(userId, grantAccess) {
            const user = this.users.find(u => u.id === userId);
            if (!user) return;

            const isEn = this.isEnglish();
            const confirmMsg = grantAccess
                ? (isEn 
                    ? `Grant access to ${user.email}? The user will be able to use the application again.` 
                    : `¿Deseas conceder acceso a ${user.email}? El usuario podrá volver a usar la aplicación.`)
                : (isEn 
                    ? `Are you sure you want to revoke access for ${user.email}? Their session will close immediately.` 
                    : `¿Estás seguro de revocar el acceso a ${user.email}? Su sesión se cerrará inmediatamente.`);

            const actionBtn = grantAccess 
                ? (isEn ? 'Grant Access' : 'Conceder Acceso') 
                : (isEn ? 'Revoke Access' : 'Revocar Acceso');
            const cancelBtn = isEn ? 'Cancel' : 'Cancelar';

            const doExecution = async () => {
                await this._executeToggleAccess(userId, grantAccess);
            };

            const triggerAction = window.showActionToast || window.utils?.showActionToast;

            if (triggerAction) {
                triggerAction({
                    message: confirmMsg,
                    actionText: actionBtn,
                    cancelText: cancelBtn,
                    actionColor: grantAccess ? '#10B981' : '#EF4444',
                    type: grantAccess ? 'success' : 'error',
                    onConfirm: doExecution
                });
            } else {
                await doExecution();
            }
        }

        /**
         * Ejecuta la revocación o concesión de acceso mediante Supabase
         */
        async _executeToggleAccess(userId, grantAccess) {
            const user = this.users.find(u => u.id === userId);
            if (!user) return;

            const isEn = this.isEnglish();
            const actionVerb = grantAccess 
                ? (isEn ? 'grant' : 'conceder') 
                : (isEn ? 'revoke' : 'revocar');

            const btn = document.getElementById('btn-admin-toggle-access');
            const origHTML = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px; animation: spin 1s linear infinite;">sync</span> ${isEn ? 'Saving changes...' : 'Guardando cambios...'}`;
            }

            try {
                let rpcSucceeded = false;
                const { data: rpcRes, error: rpcErr } = await window.supabaseClient.rpc('admin_toggle_user_access', {
                    target_user_id: userId,
                    grant_access: grantAccess
                });

                if (!rpcErr) {
                    rpcSucceeded = true;
                } else {
                    const { error: updateErr } = await window.supabaseClient
                        .from('users')
                        .update({
                            is_active: grantAccess,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', userId);

                    if (updateErr) throw updateErr;
                }

                user.is_active = grantAccess;
                user.updated_at = new Date().toISOString();

                this.renderMetrics();
                this.renderList();
                this.openUserModal(userId);

                const toastMsg = grantAccess
                    ? (isEn 
                        ? `✅ Access granted to ${user.first_name || user.email}`
                        : `✅ Acceso concedido a ${user.first_name || user.email}`)
                    : (isEn 
                        ? `⛔ Access revoked for ${user.first_name || user.email}`
                        : `⛔ Acceso revocado a ${user.first_name || user.email}`);

                this.notify(toastMsg, grantAccess ? 'success' : 'error', 3000);

            } catch (err) {
                console.error('❌ Error al cambiar acceso de usuario:', err);
                const errMsg = isEn 
                    ? `Error attempting to ${actionVerb} access: ${err.message || 'Server error'}`
                    : `Error al ${actionVerb} acceso: ${err.message || 'Error del servidor'}`;

                this.notify(errMsg, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = origHTML;
                }
            }
        }

        /**
         * Manejador de confirmación para eliminar usuario permanentemente de la BD vía snackbar / showActionToast
         */
        async handleDeleteUser(userId) {
            const user = this.users.find(u => u.id === userId);
            if (!user) return;

            const isEn = this.isEnglish();
            const confirmMsg = isEn 
                ? `⚠️ Permanently delete ${user.email} from database? All user data will be deleted.`
                : `⚠️ ¿Eliminar permanentemente a ${user.email} de la base de datos? Se eliminarán todos sus datos.`;

            const actionBtn = isEn ? 'Delete Permanently' : 'Eliminar Definitivamente';
            const cancelBtn = isEn ? 'Cancel' : 'Cancelar';

            const doDelete = async () => {
                await this._executeDeleteUser(userId);
            };

            const triggerAction = window.showActionToast || window.utils?.showActionToast;

            if (triggerAction) {
                triggerAction({
                    message: confirmMsg,
                    actionText: actionBtn,
                    cancelText: cancelBtn,
                    actionColor: '#E11D48',
                    type: 'error',
                    onConfirm: doDelete
                });
            } else {
                await doDelete();
            }
        }

        /**
         * Ejecuta la eliminación definitiva del usuario en Supabase (users, notes, recipes)
         */
        async _executeDeleteUser(userId) {
            const user = this.users.find(u => u.id === userId);
            if (!user) return;

            const isEn = this.isEnglish();
            const btn = document.getElementById('btn-admin-delete-user');
            const origHTML = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px; animation: spin 1s linear infinite;">sync</span> ${isEn ? 'Deleting from DB...' : 'Eliminando de la BD...'}`;
            }

            try {
                const userIdentities = [user.id, user.auth_user_id].filter(Boolean);

                // 1. Intentar RPC de borrado administrativo seguro (SECURITY DEFINER)
                let rpcDeleted = false;
                try {
                    const { data: rpcData, error: rpcErr } = await window.supabaseClient.rpc('admin_delete_user', {
                        target_user_id: userId
                    });
                    if (rpcErr) throw rpcErr;
                    if (rpcData && rpcData.success === false) {
                        throw new Error(rpcData.message || 'No se pudo eliminar el usuario de la BD.');
                    }
                    rpcDeleted = true;
                } catch (rpcEx) {
                    console.warn('RPC admin_delete_user falló, intentando cascada directa:', rpcEx);
                }

                // 2. Si no hubo RPC o para garantizar limpieza, eliminar registros asociados en cascada
                if (!rpcDeleted) {
                    try {
                        await window.supabaseClient.from('recipes').delete().in('user_id', userIdentities);
                    } catch (e) {
                        console.warn('Limpieza de recetas omitida o sin permisos:', e);
                    }

                    try {
                        await window.supabaseClient.from('notes').delete().in('user_id', userIdentities);
                    } catch (e) {
                        console.warn('Limpieza de notas omitida o sin permisos:', e);
                    }

                    const { error: delErr } = await window.supabaseClient
                        .from('users')
                        .delete()
                        .eq('id', userId);

                    if (delErr) throw delErr;
                }

                // 3. Remover del listado local en memoria
                this.users = this.users.filter(u => u.id !== userId);

                // 4. Actualizar interfaz y cerrar modal
                this.closeUserModal();
                this.applyFilter();
                this.renderMetrics();
                this.renderList();

                const successMsg = isEn 
                    ? `🗑️ User ${user.email} permanently deleted from database`
                    : `🗑️ Usuario ${user.email} eliminado permanentemente de la base de datos`;

                this.notify(successMsg, 'success', 3500);

            } catch (err) {
                console.error('❌ Error al eliminar usuario de la BD:', err);
                const errMsg = isEn 
                    ? `Error deleting user: ${err.message || 'Server error'}`
                    : `Error al eliminar usuario: ${err.message || 'Error del servidor'}`;

                this.notify(errMsg, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = origHTML;
                }
            }
        }
    }

    window.adminUsersManager = new AdminUsersManager();
})();
