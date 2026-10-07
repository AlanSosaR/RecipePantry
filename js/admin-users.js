/**
 * Recipe Pantry - AdminUsersManager (Material 3 Expressive)
 * Panel de Gestión de Usuarios y Control de Acceso exclusivo para Super Administrador.
 * Autorizado exclusivamente para: alansosa225@gmail.com
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
         * Renderiza el contenedor principal en la vista de configuración
         */
        async render(container) {
            if (!container) return;

            // Restricción estricta de seguridad en cliente
            if (!this.isSuperAdmin()) {
                container.innerHTML = '';
                return;
            }

            container.innerHTML = `
                <div class="settings-panel-m3 admin-m3-container" style="
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.03) 100%);
                    border: 1.5px solid rgba(99, 102, 241, 0.25);
                    border-radius: 24px;
                    padding: 24px;
                    margin-bottom: 24px;
                    box-shadow: 0 10px 30px -10px rgba(99, 102, 241, 0.12);
                    position: relative;
                    overflow: hidden;
                ">
                    <!-- Decoración visual M3 -->
                    <div style="
                        position: absolute;
                        top: -40px;
                        right: -40px;
                        width: 140px;
                        height: 140px;
                        border-radius: 50%;
                        background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0) 70%);
                        pointer-events: none;
                    "></div>

                    <!-- Header M3 Expressive -->
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <div style="
                                background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
                                color: white;
                                width: 48px;
                                height: 48px;
                                border-radius: 16px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                flex-shrink: 0;
                                box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
                            ">
                                <span class="material-symbols-outlined" style="font-size: 26px;">admin_panel_settings</span>
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #1E1B4B; letter-spacing: -0.02em;">
                                        Gestión de Usuarios
                                    </h3>
                                    <span style="
                                        background: rgba(79, 70, 229, 0.12);
                                        color: #4338CA;
                                        font-size: 11px;
                                        font-weight: 800;
                                        padding: 3px 10px;
                                        border-radius: 100px;
                                        text-transform: uppercase;
                                        letter-spacing: 0.05em;
                                        border: 1px solid rgba(79, 70, 229, 0.2);
                                        display: inline-flex;
                                        align-items: center;
                                        gap: 4px;
                                    ">
                                        <span class="material-symbols-outlined" style="font-size: 13px;">shield_person</span>
                                        Super Admin
                                    </span>
                                </div>
                                <p style="margin: 3px 0 0 0; font-size: 13px; color: #64748B;">
                                    Control global de cuentas, accesos al sistema y estadísticas en tiempo real.
                                </p>
                            </div>
                        </div>

                        <!-- Botón Refrescar -->
                        <button type="button" id="btn-admin-refresh-users" onclick="window.adminUsersManager.loadUsers(true)" style="
                            padding: 8px 16px;
                            background: rgba(255, 255, 255, 0.9);
                            border: 1px solid #E2E8F0;
                            border-radius: 12px;
                            font-size: 12.5px;
                            font-weight: 600;
                            color: #4F46E5;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            box-shadow: 0 2px 6px rgba(0,0,0,0.03);
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#EEF2FF'" onmouseout="this.style.background='rgba(255, 255, 255, 0.9)'">
                            <span class="material-symbols-outlined" style="font-size: 17px;">refresh</span>
                            <span>Actualizar</span>
                        </button>
                    </div>

                    <!-- Métricas M3 Expressive (KPIs) -->
                    <div id="admin-users-metrics" style="
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                        gap: 12px;
                        margin-bottom: 20px;
                    ">
                        <!-- Skeleton loader inicial -->
                        <div style="background: white; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; text-align: center;">
                            <span class="material-symbols-outlined" style="font-size: 22px; color: #94A3B8; animation: spin 1.2s linear infinite;">sync</span>
                            <div style="font-size: 12px; color: #64748B; margin-top: 4px;">Cargando métricas...</div>
                        </div>
                    </div>

                    <!-- Buscador M3 Expressive -->
                    <div style="position: relative; margin-bottom: 18px;">
                        <span class="material-symbols-outlined" style="
                            position: absolute;
                            left: 14px;
                            top: 50%;
                            transform: translateY(-50%);
                            color: #94A3B8;
                            font-size: 20px;
                            pointer-events: none;
                        ">search</span>
                        <input type="text" id="admin-user-search-input" placeholder="Buscar usuario por nombre, apellido o correo..." 
                            oninput="window.adminUsersManager.handleSearch(this.value)"
                            style="
                                width: 100%;
                                box-sizing: border-box;
                                padding: 12px 40px 12px 44px;
                                background: white;
                                border: 1.5px solid #E2E8F0;
                                border-radius: 16px;
                                font-size: 13.5px;
                                color: #1E293B;
                                outline: none;
                                transition: all 0.2s;
                                box-shadow: 0 2px 6px rgba(0,0,0,0.02);
                            "
                            onfocus="this.style.borderColor='#6366F1'; this.style.boxShadow='0 0 0 3px rgba(99, 102, 241, 0.15)';"
                            onblur="this.style.borderColor='#E2E8F0'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.02)';"
                        />
                        <button type="button" id="admin-user-search-clear" onclick="window.adminUsersManager.clearSearch()" style="
                            display: none;
                            position: absolute;
                            right: 12px;
                            top: 50%;
                            transform: translateY(-50%);
                            background: transparent;
                            border: none;
                            color: #94A3B8;
                            cursor: pointer;
                            padding: 4px;
                            border-radius: 50%;
                        ">
                            <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
                        </button>
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

                <!-- Modal de Detalle de Usuario M3 Expressive -->
                <div id="admin-user-detail-modal" class="hidden" style="
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.6);
                    backdrop-filter: blur(8px);
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.25s ease;
                ">
                    <div id="admin-user-detail-card" style="
                        background: #FFFFFF;
                        border-radius: 28px;
                        max-width: 520px;
                        width: 100%;
                        max-height: 90vh;
                        overflow-y: auto;
                        box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.3);
                        border: 1px solid rgba(226, 232, 240, 0.8);
                        transform: scale(0.95) translateY(10px);
                        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                    ">
                        <!-- Contenido dinámico del detalle -->
                    </div>
                </div>
            `;

            await this.loadUsers(false);
        }

        /**
         * Carga la lista de usuarios desde Supabase
         */
        async loadUsers(showFeedback = false) {
            if (this.isLoading) return;
            this.isLoading = true;

            const listEl = document.getElementById('admin-users-list');
            if (listEl && showFeedback) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #64748B;">
                        <span class="material-symbols-outlined" style="font-size: 32px; color: #6366F1; animation: spin 1s linear infinite;">sync</span>
                        <p style="margin: 8px 0 0 0; font-size: 13.5px; font-weight: 600;">Sincronizando usuarios...</p>
                    </div>
                `;
            }

            try {
                // Intentar mediante la RPC de Super Admin
                let usersData = null;
                const { data: rpcData, error: rpcError } = await window.supabaseClient.rpc('admin_get_all_users');

                if (!rpcError && Array.isArray(rpcData)) {
                    usersData = rpcData;
                } else {
                    console.warn('⚠️ admin_get_all_users RPC falló o no existe, usando select fallback:', rpcError?.message);
                    const { data: selectData, error: selectError } = await window.supabaseClient
                        .from('users')
                        .select('*')
                        .order('created_at', { ascending: false });

                    if (selectError) throw selectError;
                    usersData = selectData || [];
                }

                this.users = usersData.map(u => ({
                    ...u,
                    is_active: u.is_active !== false // Por defecto true si null
                }));

                this.applyFilter();
                this.renderMetrics();
                this.renderList();

                if (showFeedback && window.utils?.showToast) {
                    window.utils.showToast(`✅ ${this.users.length} usuarios sincronizados`, 'success', 2000);
                }
            } catch (err) {
                console.error('❌ Error al cargar usuarios para Super Admin:', err);
                if (listEl) {
                    listEl.innerHTML = `
                        <div style="text-align: center; padding: 30px; background: #FEF2F2; border-radius: 16px; border: 1px solid #FEE2E2;">
                            <span class="material-symbols-outlined" style="font-size: 32px; color: #EF4444;">error</span>
                            <p style="margin: 6px 0 0 0; font-size: 13.5px; font-weight: 700; color: #991B1B;">
                                Error al obtener usuarios
                            </p>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: #B91C1C;">
                                ${err.message || 'Verifica tu conexión y permisos.'}
                            </p>
                        </div>
                    `;
                }
            } finally {
                this.isLoading = false;
            }
        }

        /**
         * Renderiza tarjetas de métricas en estilo M3 Expressive
         */
        renderMetrics() {
            const metricsEl = document.getElementById('admin-users-metrics');
            if (!metricsEl) return;

            const total = this.users.length;
            const activos = this.users.filter(u => u.is_active).length;
            const inactivos = total - activos;

            metricsEl.innerHTML = `
                <!-- Total Usuarios -->
                <div style="
                    background: white;
                    border: 1px solid #E2E8F0;
                    border-radius: 18px;
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.02);
                ">
                    <div style="
                        width: 44px;
                        height: 44px;
                        border-radius: 14px;
                        background: rgba(99, 102, 241, 0.12);
                        color: #4F46E5;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    ">
                        <span class="material-symbols-outlined" style="font-size: 24px;">group</span>
                    </div>
                    <div>
                        <div style="font-size: 24px; font-weight: 800; color: #1E293B; line-height: 1;">
                            ${total}
                        </div>
                        <div style="font-size: 12px; font-weight: 600; color: #64748B; margin-top: 4px;">
                            Usuarios en la App
                        </div>
                    </div>
                </div>

                <!-- Activos -->
                <div style="
                    background: white;
                    border: 1px solid #E2E8F0;
                    border-radius: 18px;
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.02);
                ">
                    <div style="
                        width: 44px;
                        height: 44px;
                        border-radius: 14px;
                        background: rgba(16, 185, 129, 0.12);
                        color: #10B981;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    ">
                        <span class="material-symbols-outlined" style="font-size: 24px;">check_circle</span>
                    </div>
                    <div>
                        <div style="font-size: 24px; font-weight: 800; color: #047857; line-height: 1;">
                            ${activos}
                        </div>
                        <div style="font-size: 12px; font-weight: 600; color: #64748B; margin-top: 4px;">
                            Acceso Concedido
                        </div>
                    </div>
                </div>

                <!-- Revocados -->
                <div style="
                    background: white;
                    border: 1px solid #E2E8F0;
                    border-radius: 18px;
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.02);
                ">
                    <div style="
                        width: 44px;
                        height: 44px;
                        border-radius: 14px;
                        background: rgba(239, 68, 68, 0.12);
                        color: #EF4444;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    ">
                        <span class="material-symbols-outlined" style="font-size: 24px;">block</span>
                    </div>
                    <div>
                        <div style="font-size: 24px; font-weight: 800; color: #B91C1C; line-height: 1;">
                            ${inactivos}
                        </div>
                        <div style="font-size: 12px; font-weight: 600; color: #64748B; margin-top: 4px;">
                            Acceso Revocado
                        </div>
                    </div>
                </div>
            `;
        }

        /**
         * Maneja la búsqueda en tiempo real
         */
        handleSearch(val) {
            this.searchQuery = (val || '').toLowerCase().trim();
            const clearBtn = document.getElementById('admin-user-search-clear');
            if (clearBtn) {
                clearBtn.style.display = this.searchQuery ? 'block' : 'none';
            }
            this.applyFilter();
            this.renderList();
        }

        clearSearch() {
            const input = document.getElementById('admin-user-search-input');
            if (input) input.value = '';
            this.handleSearch('');
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

            if (this.filteredUsers.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 36px; background: white; border-radius: 16px; border: 1px dashed #CBD5E1;">
                        <span class="material-symbols-outlined" style="font-size: 32px; color: #94A3B8;">search_off</span>
                        <p style="margin: 6px 0 0 0; font-size: 13.5px; font-weight: 600; color: #64748B;">
                            No se encontraron usuarios coincidentes
                        </p>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = this.filteredUsers.map(user => {
                const isSuperAdminUser = (user.email || '').toLowerCase().trim() === this.SUPER_ADMIN_EMAIL;
                const initials = ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || 'U';
                const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Sin Nombre';
                const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric'
                }) : 'Fecha no registrada';

                const statusColor = user.is_active ? '#10B981' : '#EF4444';
                const statusBg = user.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';
                const statusTextColor = user.is_active ? '#047857' : '#B91C1C';
                const statusText = user.is_active ? 'Acceso Concedido' : 'Acceso Revocado';
                const statusIcon = user.is_active ? 'check_circle' : 'block';

                return `
                    <div class="admin-user-card" onclick="window.adminUsersManager.openUserModal('${user.id}')" style="
                        background: white;
                        border: 1.5px solid ${isSuperAdminUser ? 'rgba(99, 102, 241, 0.4)' : '#E2E8F0'};
                        border-radius: 18px;
                        padding: 14px 18px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 14px;
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: 0 2px 6px rgba(0,0,0,0.02);
                        ${isSuperAdminUser ? 'background: linear-gradient(90deg, #FFFFFF 0%, #F5F3FF 100%);' : ''}
                    "
                    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.06)'; this.style.borderColor='#6366F1';"
                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.02)'; this.style.borderColor='${isSuperAdminUser ? 'rgba(99, 102, 241, 0.4)' : '#E2E8F0'}';"
                    >
                        <!-- Izquierda: Avatar y Datos Principales -->
                        <div style="display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1;">
                            <!-- Avatar con iniciales o foto -->
                            <div style="
                                width: 44px;
                                height: 44px;
                                border-radius: 14px;
                                background: ${isSuperAdminUser ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : 'linear-gradient(135deg, #E0E7FF, #C7D2FE)'};
                                color: ${isSuperAdminUser ? 'white' : '#4338CA'};
                                font-weight: 800;
                                font-size: 15px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                flex-shrink: 0;
                                overflow: hidden;
                            ">
                                ${user.avatar_url ? `<img src="${user.avatar_url}" alt="${fullName}" style="width: 100%; height: 100%; object-fit: cover;">` : initials}
                            </div>

                            <div style="min-width: 0; flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <span style="font-weight: 700; font-size: 14.5px; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${fullName}
                                    </span>
                                    ${isSuperAdminUser ? `
                                        <span style="
                                            background: #4F46E5;
                                            color: white;
                                            font-size: 10px;
                                            font-weight: 800;
                                            padding: 2px 8px;
                                            border-radius: 100px;
                                            text-transform: uppercase;
                                            letter-spacing: 0.04em;
                                        ">Tú (Super Admin)</span>
                                    ` : ''}
                                </div>
                                <div style="font-size: 12.5px; color: #64748B; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${user.email || 'Sin correo registrado'}
                                </div>
                            </div>
                        </div>

                        <!-- Derecha: Estado Chip e Indicador -->
                        <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                            <!-- Chip de Acceso -->
                            <span style="
                                background: ${statusBg};
                                color: ${statusTextColor};
                                font-size: 11.5px;
                                font-weight: 700;
                                padding: 5px 12px;
                                border-radius: 100px;
                                display: inline-flex;
                                align-items: center;
                                gap: 5px;
                                border: 1px solid ${statusColor}33;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 14px;">${statusIcon}</span>
                                <span>${statusText}</span>
                            </span>

                            <span class="material-symbols-outlined" style="color: #94A3B8; font-size: 20px;">chevron_right</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        /**
         * Abre el Modal con la información detallada del usuario y opciones de control de acceso
         */
        openUserModal(userId) {
            const user = this.users.find(u => u.id === userId);
            if (!user) return;
            this.selectedUser = user;

            const modal = document.getElementById('admin-user-detail-modal');
            const card = document.getElementById('admin-user-detail-card');
            if (!modal || !card) return;

            const isSuperAdminUser = (user.email || '').toLowerCase().trim() === this.SUPER_ADMIN_EMAIL;
            const initials = ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || 'U';
            const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Sin Nombre';
            const createdDate = user.created_at ? new Date(user.created_at).toLocaleString() : 'No registrado';
            const updatedDate = user.updated_at ? new Date(user.updated_at).toLocaleString() : 'No registrado';

            const statusBg = user.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';
            const statusTextColor = user.is_active ? '#047857' : '#B91C1C';
            const statusText = user.is_active ? 'Acceso Permitido (Activo)' : 'Acceso Revocado (Bloqueado)';
            const statusIcon = user.is_active ? 'check_circle' : 'block';

            card.innerHTML = `
                <!-- Cabecera del modal -->
                <div style="
                    padding: 24px 24px 20px 24px;
                    border-bottom: 1px solid #E2E8F0;
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    background: linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%);
                    border-radius: 28px 28px 0 0;
                ">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="
                            width: 52px;
                            height: 52px;
                            border-radius: 18px;
                            background: linear-gradient(135deg, #4F46E5, #7C3AED);
                            color: white;
                            font-size: 18px;
                            font-weight: 800;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-shadow: 0 6px 16px rgba(79, 70, 229, 0.25);
                            overflow: hidden;
                        ">
                            ${user.avatar_url ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">` : initials}
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <h3 style="margin: 0; font-size: 17.5px; font-weight: 800; color: #0F172A;">
                                    ${fullName}
                                </h3>
                                ${isSuperAdminUser ? `
                                    <span style="background: #4F46E5; color: white; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 100px;">
                                        Super Admin
                                    </span>
                                ` : ''}
                            </div>
                            <div style="font-size: 13px; color: #64748B; margin-top: 2px;">
                                ${user.email}
                            </div>
                        </div>
                    </div>

                    <button type="button" onclick="window.adminUsersManager.closeUserModal()" style="
                        background: rgba(255,255,255,0.8);
                        border: 1px solid #CBD5E1;
                        border-radius: 50%;
                        width: 34px;
                        height: 34px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #64748B;
                        cursor: pointer;
                    ">
                        <span class="material-symbols-outlined" style="font-size: 19px;">close</span>
                    </button>
                </div>

                <!-- Cuerpo con Datos Completos del Usuario -->
                <div style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                    <!-- Estado Actual Banner M3 -->
                    <div style="
                        background: ${statusBg};
                        border: 1px solid ${user.is_active ? '#A7F3D0' : '#FECACA'};
                        border-radius: 16px;
                        padding: 14px 16px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                    ">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="material-symbols-outlined" style="font-size: 22px; color: ${statusTextColor};">${statusIcon}</span>
                            <div>
                                <div style="font-size: 13.5px; font-weight: 800; color: ${statusTextColor};">
                                    ${statusText}
                                </div>
                                <div style="font-size: 12px; color: #475569; margin-top: 1px;">
                                    ${user.is_active ? 'El usuario tiene acceso completo a la aplicación.' : 'El usuario tiene el acceso denegado y no puede usar la app.'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Ficha de Datos Técnicos M3 -->
                    <div style="
                        background: #F8FAFC;
                        border: 1px solid #E2E8F0;
                        border-radius: 18px;
                        padding: 18px;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    ">
                        <div style="font-size: 12px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">
                            Información de la Cuenta
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div>
                                <span style="font-size: 11.5px; color: #94A3B8;">ID de Perfil:</span>
                                <div style="font-size: 12.5px; font-family: monospace; font-weight: 600; color: #1E293B; word-break: break-all;">
                                    ${user.id}
                                </div>
                            </div>
                            <div>
                                <span style="font-size: 11.5px; color: #94A3B8;">Auth UUID:</span>
                                <div style="font-size: 12.5px; font-family: monospace; font-weight: 600; color: #1E293B; word-break: break-all;">
                                    ${user.auth_user_id || 'Vinculado'}
                                </div>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px;">
                            <div>
                                <span style="font-size: 11.5px; color: #94A3B8;">Fecha de Registro:</span>
                                <div style="font-size: 12.5px; font-weight: 600; color: #1E293B;">
                                    ${createdDate}
                                </div>
                            </div>
                            <div>
                                <span style="font-size: 11.5px; color: #94A3B8;">Última Modificación:</span>
                                <div style="font-size: 12.5px; font-weight: 600; color: #1E293B;">
                                    ${updatedDate}
                                </div>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px;">
                            <div>
                                <span style="font-size: 11.5px; color: #94A3B8;">Recetas Creadas:</span>
                                <div style="font-size: 13.5px; font-weight: 700; color: #4F46E5;">
                                    ${user.recipes_count !== undefined ? user.recipes_count : 'Consultando...'}
                                </div>
                            </div>
                            <div>
                                <span style="font-size: 11.5px; color: #94A3B8;">Notas Creadas:</span>
                                <div style="font-size: 13.5px; font-weight: 700; color: #4F46E5;">
                                    ${user.notes_count !== undefined ? user.notes_count : '0'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Panel de Acción: Conceder / Revocar Acceso -->
                    <div style="margin-top: 8px;">
                        ${isSuperAdminUser ? `
                            <div style="
                                background: #F1F5F9;
                                border: 1px solid #CBD5E1;
                                border-radius: 16px;
                                padding: 14px;
                                text-align: center;
                                font-size: 12.5px;
                                color: #64748B;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 8px;
                            ">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #4F46E5;">lock</span>
                                <span>Tu propia cuenta de Super Administrador está protegida contra revocación.</span>
                            </div>
                        ` : `
                            ${user.is_active ? `
                                <button type="button" id="btn-admin-toggle-access" onclick="window.adminUsersManager.handleToggleAccess('${user.id}', false)" style="
                                    width: 100%;
                                    padding: 14px 20px;
                                    background: #FEF2F2;
                                    color: #DC2626;
                                    border: 1.5px solid rgba(220, 38, 38, 0.3);
                                    border-radius: 16px;
                                    font-size: 14px;
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
                                    <span class="material-symbols-outlined" style="font-size: 20px;">block</span>
                                    <span>Revocar Acceso a mi Aplicación</span>
                                </button>
                                <p style="margin: 8px 0 0 0; text-align: center; font-size: 11.5px; color: #94A3B8;">
                                    El usuario no podrá iniciar sesión ni realizar acciones hasta que se restablezca el acceso.
                                </p>
                            ` : `
                                <button type="button" id="btn-admin-toggle-access" onclick="window.adminUsersManager.handleToggleAccess('${user.id}', true)" style="
                                    width: 100%;
                                    padding: 14px 20px;
                                    background: #10B981;
                                    color: #FFFFFF;
                                    border: none;
                                    border-radius: 16px;
                                    font-size: 14px;
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
                                    <span class="material-symbols-outlined" style="font-size: 20px;">check_circle</span>
                                    <span>Conceder Acceso a mi Aplicación</span>
                                </button>
                                <p style="margin: 8px 0 0 0; text-align: center; font-size: 11.5px; color: #94A3B8;">
                                    El usuario podrá iniciar sesión normalmente con sus credenciales.
                                </p>
                            `}
                        `}
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');
            modal.style.pointerEvents = 'auto';
            requestAnimationFrame(() => {
                modal.style.opacity = '1';
                card.style.transform = 'scale(1) translateY(0)';
            });
        }

        /**
         * Cierra el modal de detalle
         */
        closeUserModal() {
            const modal = document.getElementById('admin-user-detail-modal');
            const card = document.getElementById('admin-user-detail-card');
            if (!modal || !card) return;

            modal.style.opacity = '0';
            card.style.transform = 'scale(0.95) translateY(10px)';
            modal.style.pointerEvents = 'none';
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 250);
        }

        /**
         * Ejecuta la revocación o concesión de acceso mediante Supabase RPC o Update
         */
        async handleToggleAccess(userId, grantAccess) {
            const user = this.users.find(u => u.id === userId);
            if (!user) return;

            const actionVerb = grantAccess ? 'conceder' : 'revocar';
            const confirmMsg = grantAccess
                ? `¿Deseas conceder acceso a ${user.email}? El usuario podrá volver a usar la aplicación.`
                : `¿Estás seguro de revocar el acceso a ${user.email}? Su sesión se cerrará inmediatamente y no podrá ingresar a la app.`;

            if (!confirm(confirmMsg)) return;

            const btn = document.getElementById('btn-admin-toggle-access');
            const origHTML = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px; animation: spin 1s linear infinite;">sync</span> Guardando cambios...`;
            }

            try {
                // 1. Intentar vía RPC segura de administración
                let rpcSucceeded = false;
                const { data: rpcRes, error: rpcErr } = await window.supabaseClient.rpc('admin_toggle_user_access', {
                    target_user_id: userId,
                    grant_access: grantAccess
                });

                if (!rpcErr) {
                    rpcSucceeded = true;
                } else {
                    console.warn('⚠️ Fallback a update directo de users:', rpcErr.message);
                    // 2. Fallback con update directo
                    const { error: updateErr } = await window.supabaseClient
                        .from('users')
                        .update({
                            is_active: grantAccess,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', userId);

                    if (updateErr) throw updateErr;
                }

                // 3. Actualizar estado local
                user.is_active = grantAccess;
                user.updated_at = new Date().toISOString();

                // 4. Actualizar interfaz
                this.renderMetrics();
                this.renderList();
                this.openUserModal(userId); // Reabrir modal con estado actualizado

                const toastMsg = grantAccess
                    ? `✅ Acceso concedido a ${user.first_name || user.email}`
                    : `⛔ Acceso revocado a ${user.first_name || user.email}`;

                if (window.utils?.showToast) {
                    window.utils.showToast(toastMsg, grantAccess ? 'success' : 'error', 3000);
                } else {
                    alert(toastMsg);
                }

            } catch (err) {
                console.error('❌ Error al cambiar acceso de usuario:', err);
                const errMsg = `Error al ${actionVerb} acceso: ${err.message || 'Error del servidor'}`;
                if (window.utils?.showToast) {
                    window.utils.showToast(errMsg, 'error');
                } else {
                    alert(errMsg);
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = origHTML;
                }
            }
        }
    }

    // Instancia global
    window.adminUsersManager = new AdminUsersManager();
})();
