/**
 * Restaurant Menu Manager - Stanley's SW16 Streatham
 * Visualizador completo y gestor de carta abierta sin marcos cerrados.
 * Permite ver Todo el Menú (incluyendo Sunday Roasts), filtrar por categorías,
 * marcar platos 86 (agotados) y agregar/eliminar platos cuando la carta del restaurante cambie.
 */

(function () {
    const MenuDocStorage = {
        dbPromise: null,
        getDB() {
            if (!this.dbPromise) {
                this.dbPromise = new Promise((resolve, reject) => {
                    const req = indexedDB.open('RecipePantry_MenuDocs', 1);
                    req.onupgradeneeded = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains('docs')) {
                            db.createObjectStore('docs', { keyPath: 'id' });
                        }
                    };
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            }
            return this.dbPromise;
        },
        async setDoc(id, data) {
            try {
                const db = await this.getDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction('docs', 'readwrite');
                    const store = tx.objectStore('docs');
                    const req = store.put({ id, ...data, updatedAt: Date.now() });
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            } catch (e) {
                console.warn('DocStorage error:', e);
            }
        },
        async getDoc(id) {
            try {
                const db = await this.getDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction('docs', 'readonly');
                    const store = tx.objectStore('docs');
                    const req = store.get(id);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            } catch (e) {
                return null;
            }
        },
        async removeDoc(id) {
            try {
                const db = await this.getDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction('docs', 'readwrite');
                    const store = tx.objectStore('docs');
                    const req = store.delete(id);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            } catch (e) {}
        }
    };

    class RestaurantMenuManager {
        constructor() {
            this.containerId = 'menuView';
            this.activeTab = 'all'; // 'all' (todo) | 'main' | 'sunday'
            this.activeCategory = 'all';
            this.searchQuery = '';
            this.isAddingDish = false; // Vista de formulario completo para nuevo plato
            this.isViewingDocument = false; // Vista de visualizador de carta adaptada al sistema
            this.currentDocTab = 'main';
            this.docZoom = 1.0;

            // Estado de propiedad y pertenencia del restaurante
            this.hasMenu = false;
            this.isOwner = false;
            this.isShared = false;
            this.sharedBy = null;
            this.permission = 'view';
            this.activeMenu = null;
            this.sharedRecordId = null;

            this.restaurantName = "Mi Restaurante";
            this.logoUrl = null;
            this.websiteUrl = null;
            this.info = {};
            this.sections = [];
            this.customItems = [];
            this.removedItemIds = [];
            this.availability = {};
            this.officialAllergens = [];
            this.allergenDefinitions = [];
            this.isLoading = true;

            this.closeDocumentViewer = this.closeDocumentViewer.bind(this);
            this.openDocumentViewer = this.openDocumentViewer.bind(this);
            this.cancelAddDish = this.cancelAddDish.bind(this);
            this.render = this.render.bind(this);
            this.resetToEmpty = this.resetToEmpty.bind(this);
            this.restoreFromCache = this.restoreFromCache.bind(this);
            this.saveToCache = this.saveToCache.bind(this);

            // 1. Restaurar de caché local de inmediato para que NUNCA aparezca vacío al entrar
            this.restoreFromCache();

            // 2. Sincronizar desde Supabase en segundo plano al iniciar
            this.syncFromSupabase();

            // 3. Re-sincronizar automáticamente ante cualquier evento de autenticación o cambio de usuario
            window.addEventListener('auth-ready', () => {
                this.syncFromSupabase();
            });

            window.addEventListener('auth-changed', () => {
                this.syncFromSupabase();
            });

            if (window.supabaseClient) {
                window.supabaseClient.auth.onAuthStateChange((event, session) => {
                    if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
                        this.syncFromSupabase();
                    } else if (event === 'SIGNED_OUT') {
                        this.resetToEmpty();
                        this.render();
                    }
                });
            }
        }

        restoreFromCache() {
            try {
                const cached = localStorage.getItem('recipepantry_cached_active_menu');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed && parsed.activeMenu) {
                        this.activeMenu = parsed.activeMenu;
                        this.hasMenu = true;
                        this.isOwner = !!parsed.isOwner;
                        this.isShared = !!parsed.isShared;
                        this.sharedBy = parsed.sharedBy || null;
                        this.sharedRecordId = parsed.sharedRecordId || null;
                        this.shareScope = parsed.shareScope || 'all';
                        this.permission = parsed.permission || (this.isOwner ? 'edit' : 'view');
                        this.loadMenuDataFromActive();
                        this.isLoading = false;
                        console.log('⚡ [Menu] Restaurado al instante desde caché local:', this.restaurantName);
                    }
                }
            } catch (e) {
                console.warn('[Menu] Error al restaurar caché local:', e);
            }
        }

        saveToCache() {
            try {
                if (this.hasMenu && this.activeMenu) {
                    const payload = {
                        activeMenu: this.activeMenu,
                        isOwner: this.isOwner,
                        isShared: this.isShared,
                        sharedBy: this.sharedBy,
                        sharedRecordId: this.sharedRecordId,
                        shareScope: this.shareScope,
                        permission: this.permission,
                        cachedAt: Date.now()
                    };
                    localStorage.setItem('recipepantry_cached_active_menu', JSON.stringify(payload));
                } else {
                    localStorage.removeItem('recipepantry_cached_active_menu');
                }
            } catch (e) {}
        }

        resetToEmpty() {
            this.hasMenu = false;
            this.isOwner = false;
            this.isShared = false;
            this.sharedBy = null;
            this.permission = 'view';
            this.activeMenu = null;
            this.sharedRecordId = null;
            this.shareScope = 'all';
            this.restaurantName = "Mi Restaurante";
            this.logoUrl = null;
            this.websiteUrl = null;
            this.info = {};
            this.sections = [];
            this.customItems = [];
            this.removedItemIds = [];
            this.availability = {};
            this.officialAllergens = [];
            this.allergenDefinitions = [];
            try {
                localStorage.removeItem('recipepantry_cached_active_menu');
            } catch (e) {}
        }

        // Helper para identificar si el restaurante activo es el de Alan (Stanley's original)
        isStanleyOriginal() {
            if (this.currentUser?.email === 'alansosa225@gmail.com') return true;
            if (this.activeMenu?.id === '24cf3b14-c867-49bc-a5fd-9045be6ccedf') return true;
            if (this.restaurantName === "Stanley's SW16" && this.activeMenu?.doc_main_url === 'assets/pdf/stanleys-main-menu.pdf') return true;
            return false;
        }

        // ─── PERSISTENCIA CENTRALIZADA: restaurant_menus + shared_restaurant_menus ───

        async syncFromSupabase() {
            try {
                const sb = window.supabaseClient;
                if (!sb) {
                    this.isLoading = false;
                    return;
                }

                // 1. Obtener usuario actual: primero de authManager o perfil en localStorage (instantáneo)
                let userData = window.authManager?.currentUser;
                if (!userData || !userData.id) {
                    try {
                        const storedProfile = localStorage.getItem('recipe_pantry_user_profile');
                        if (storedProfile) {
                            const parsed = JSON.parse(storedProfile);
                            if (parsed && parsed.id) userData = parsed;
                        }
                    } catch (e) {}
                }

                // Si aún no está hidratado, intentar obtenerlo de la sesión de Supabase con reintentos
                if (!userData || !userData.id) {
                    for (let attempt = 0; attempt < 5; attempt++) {
                        try {
                            const session = (await sb.auth.getSession())?.data?.session;
                            const authUser = session?.user || (await sb.auth.getUser())?.data?.user;
                            if (authUser && authUser.id) {
                                const { data: uData } = await sb.from('users')
                                    .select('id, email, first_name, last_name')
                                    .eq('auth_user_id', authUser.id)
                                    .maybeSingle();
                                if (uData && uData.id) {
                                    userData = uData;
                                    break;
                                }
                            }
                        } catch (err) {}
                        await new Promise(r => setTimeout(r, 200));
                    }
                }

                if (!userData || !userData.id) {
                    // Si tras reintentos no hay usuario conectado y no tenemos menú en caché
                    if (!this.hasMenu) {
                        this.resetToEmpty();
                    }
                    this.isLoading = false;
                    this.render();
                    return;
                }
                this.currentUser = userData;

                // 2. Si el usuario es dueño de algún restaurante propio (ej: Alan con Stanley's)
                let { data: ownMenus, error: ownErr } = await sb.from('restaurant_menus')
                    .select('*')
                    .eq('owner_user_id', userData.id);

                // Salvaguarda: si es el usuario de Alan, asegurar vinculación con Stanley's si existiese
                if ((!ownMenus || ownMenus.length === 0) && userData.email === 'alansosa225@gmail.com') {
                    const { data: stanleyMenu } = await sb.from('restaurant_menus')
                        .select('*')
                        .eq('restaurant_name', "Stanley's SW16")
                        .limit(1);
                    if (stanleyMenu && stanleyMenu.length > 0) {
                        ownMenus = stanleyMenu;
                    }
                }

                if (ownMenus && ownMenus.length > 0) {
                    this.hasMenu = true;
                    this.isOwner = true;
                    this.isShared = false;
                    this.permission = 'edit';
                    this.activeMenu = ownMenus[0];
                    this.loadMenuDataFromActive();
                    this.saveToCache();
                    this.isLoading = false;
                    this.render();
                    if (window.dashboard && window.dashboard.currentView === 'allergens') {
                        window.dashboard.renderAllergensView();
                    }
                    return;
                }

                // 3. Buscar si tiene restaurantes compartidos con status='accepted'
                const { data: sharedMenus, error: sharedErr } = await sb.from('shared_restaurant_menus')
                    .select(`
                        id,
                        permission,
                        status,
                        share_scope,
                        menu:menu_id (*),
                        owner:owner_user_id (id, first_name, last_name, email)
                    `)
                    .eq('recipient_user_id', userData.id)
                    .eq('status', 'accepted');

                if (sharedErr) {
                    console.warn('[Menu] Error al consultar shared_restaurant_menus:', sharedErr);
                    if (this.hasMenu) {
                        this.isLoading = false;
                        this.render();
                        return;
                    }
                }

                let preferredShared = null;
                try {
                    const preferredMenuId = localStorage.getItem('recipepantry_preferred_menu_id');
                    if (preferredMenuId && sharedMenus?.length > 0) {
                        preferredShared = sharedMenus.find(s => {
                            const m = Array.isArray(s.menu) ? s.menu[0] : s.menu;
                            return m?.id === preferredMenuId;
                        });
                    }
                } catch (e) {}

                if (preferredShared && preferredShared.menu) {
                    const rawMenu = Array.isArray(preferredShared.menu) ? preferredShared.menu[0] : preferredShared.menu;
                    const rawOwner = Array.isArray(preferredShared.owner) ? preferredShared.owner[0] : preferredShared.owner;
                    if (rawMenu) {
                        this.hasMenu = true;
                        this.isOwner = false;
                        this.isShared = true;
                        this.sharedRecordId = preferredShared.id;
                        this.shareScope = preferredShared.share_scope || 'all';
                        this.permission = preferredShared.permission || 'view';
                        this.sharedBy = rawOwner;
                        this.activeMenu = rawMenu;
                        this.loadMenuDataFromActive();
                        this.saveToCache();
                        this.isLoading = false;
                        this.render();
                        if (window.dashboard && window.dashboard.currentView === 'allergens') {
                            window.dashboard.renderAllergensView();
                        }
                        return;
                    }
                }

                // 4. Si no tiene preferido pero tiene compartido aceptado
                if (sharedMenus && sharedMenus.length > 0 && sharedMenus[0].menu) {
                    const rawMenu = Array.isArray(sharedMenus[0].menu) ? sharedMenus[0].menu[0] : sharedMenus[0].menu;
                    const rawOwner = Array.isArray(sharedMenus[0].owner) ? sharedMenus[0].owner[0] : sharedMenus[0].owner;
                    if (rawMenu) {
                        this.hasMenu = true;
                        this.isOwner = false;
                        this.isShared = true;
                        this.sharedRecordId = sharedMenus[0].id;
                        this.shareScope = sharedMenus[0].share_scope || 'all';
                        this.permission = sharedMenus[0].permission || 'view';
                        this.sharedBy = rawOwner;
                        this.activeMenu = rawMenu;
                        this.loadMenuDataFromActive();
                        this.saveToCache();
                        this.isLoading = false;
                        this.render();
                        if (window.dashboard && window.dashboard.currentView === 'allergens') {
                            window.dashboard.renderAllergensView();
                        }
                        return;
                    }
                }

                // 5. Si no tiene ni propio ni compartido: Estado completamente vacío
                this.resetToEmpty();
                this.isLoading = false;
                this.render();
                if (window.dashboard && window.dashboard.currentView === 'allergens') {
                    window.dashboard.renderAllergensView();
                }
            } catch (e) {
                console.warn('[Menu] Error al sincronizar restaurante desde Supabase:', e);
                this.isLoading = false;
                this.render();
            }
        }

        loadMenuDataFromActive() {
            if (!this.activeMenu) return;
            if (Array.isArray(this.activeMenu)) {
                this.activeMenu = this.activeMenu[0];
            }
            if (!this.activeMenu) return;
            this.restaurantName = this.activeMenu.restaurant_name || "Mi Restaurante";
            this.logoUrl = this.activeMenu.logo_url || null;
            this.websiteUrl = this.activeMenu.website_url || null;
            this.info = this.activeMenu.info || {};
            this.sections = this.activeMenu.sections || [];
            this.customItems = Array.isArray(this.activeMenu.custom_items) ? this.activeMenu.custom_items : [];
            this.removedItemIds = Array.isArray(this.activeMenu.removed_items) ? this.activeMenu.removed_items : [];
            this.availability = this.activeMenu.availability || {};
            this.docMainUrl = this.activeMenu.doc_main_url;
            this.docSundayUrl = this.activeMenu.doc_sunday_url;
            this.officialAllergens = this.activeMenu.official_allergens || [];
            this.allergenDefinitions = Array.isArray(this.activeMenu.allergen_definitions) ? this.activeMenu.allergen_definitions : [];
        }

        async saveToSupabase(fieldsToUpdate = {}) {
            try {
                const sb = window.supabaseClient;
                if (!sb || !this.activeMenu?.id) return;

                const payload = {
                    ...fieldsToUpdate,
                    updated_at: new Date().toISOString()
                };

                const { error } = await sb.from('restaurant_menus')
                    .update(payload)
                    .eq('id', this.activeMenu.id);

                if (error) throw error;
            } catch (e) {
                console.warn('[Menu] No se pudo guardar en Supabase:', e);
            }
        }

        saveAvailability() {
            this.saveToSupabase({ availability: this.availability });
        }

        saveCustomItems() {
            this.saveToSupabase({ custom_items: this.customItems });
        }

        saveRemovedItems() {
            this.saveToSupabase({ removed_items: this.removedItemIds });
        }

        shareRestaurantMenu() {
            if (!this.activeMenu?.id) {
                if (window.showActionToast) {
                    window.showActionToast({
                        message: 'No hay una carta de restaurante activa para compartir.',
                        type: 'warning'
                    });
                }
                return;
            }
            if (window.shareModal) {
                window.shareModal.open(this.activeMenu.id, 'menu');
            } else {
                console.error('ShareModalManager no disponible.');
            }
        }

        async leaveSharedMenu() {
            if (!this.isShared || !this.sharedRecordId) return;
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const confirmMsg = isEn 
                ? 'Are you sure you want to leave this shared restaurant menu? You will no longer have access to it.' 
                : '¿Seguro que deseas dejar de seguir la carta de este restaurante? Ya no tendrás acceso a sus platos ni matriz de alérgenos.';
            
            if (window.showActionToast) {
                window.showActionToast({
                    message: isEn 
                        ? 'Are you sure you want to leave this shared restaurant menu? You will no longer have access to it.' 
                        : '¿Seguro que deseas dejar de seguir la carta de este restaurante? Ya no tendrás acceso a sus platos ni matriz de alérgenos.',
                    actionText: isEn ? 'Leave' : 'Dejar de seguir',
                    cancelText: isEn ? 'Keep' : 'Mantener',
                    actionColor: '#EF4444',
                    onConfirm: async () => {
                        const recId = this.sharedRecordId;
                        try {
                            localStorage.removeItem('recipepantry_preferred_menu_id');
                        } catch (e) {}

                        // 1. Resetear localmente de inmediato y renderizar al instante
                        this.resetToEmpty();
                        this.render();
                        if (window.dashboard && window.dashboard.currentView === 'allergens') {
                            window.dashboard.renderAllergensView();
                        }

                        // 2. Notificación simple normal (sin botones de confirmar de nuevo)
                        if (window.utils && window.utils.showToast) {
                            window.utils.showToast(isEn ? 'You left the shared restaurant' : 'Has dejado de seguir el restaurante', 'info');
                        }

                        // 3. Eliminar de Supabase en segundo plano
                        try {
                            const sb = window.supabaseClient;
                            if (sb && recId) {
                                await sb.from('shared_restaurant_menus').delete().eq('id', recId);
                            }
                        } catch (err) {
                            console.error('Error leaving shared menu in Supabase:', err);
                        }
                    }
                });
            }
        }

        promptCreateMenu() {
            this.openCreateMenuModal();
        }

        async handleLogoFileSelected(event, mode = 'create') {
            const file = event.target?.files?.[0];
            if (!file) return;

            const isEn = window.i18n && window.i18n.getLang() === 'en';
            if (window.showActionToast) {
                window.showActionToast({
                    message: isEn ? '⏳ Uploading logo...' : '⏳ Subiendo logo...',
                    type: 'info'
                });
            }

            try {
                const sb = window.supabaseClient;
                if (!sb) throw new Error('No Supabase connection');

                const ext = file.name.split('.').pop() || 'png';
                const fileName = `logo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
                const { error: uploadErr } = await sb.storage.from('menu-files').upload(fileName, file, { upsert: true });
                if (uploadErr) throw uploadErr;

                const { data: { publicUrl } } = sb.storage.from('menu-files').getPublicUrl(fileName);

                const urlInput = document.getElementById(`${mode}LogoUrlInput`);
                if (urlInput) urlInput.value = publicUrl;

                const previewImg = document.getElementById(`${mode}LogoPreview`);
                if (previewImg) previewImg.src = publicUrl;

                if (window.showActionToast) {
                    window.showActionToast({
                        message: isEn ? '✅ Logo uploaded' : '✅ Logo subido correctamente',
                        type: 'success'
                    });
                }
            } catch (err) {
                console.error('Error uploading logo:', err);
                if (window.showActionToast) {
                    window.showActionToast({
                        message: isEn ? '❌ Error uploading logo' : '❌ Error al subir logo',
                        type: 'error'
                    });
                }
            }
        }

        updateLogoUrlPreview(url, mode = 'create') {
            const preview = document.getElementById(`${mode}LogoPreview`);
            if (!preview) return;
            const clean = (url || '').trim();
            preview.src = clean ? clean : 'assets/icons/favicon-196.png';
        }

        clearLogoInput(mode = 'create') {
            const urlInput = document.getElementById(`${mode}LogoUrlInput`);
            if (urlInput) urlInput.value = '';
            const preview = document.getElementById(`${mode}LogoPreview`);
            if (preview) preview.src = 'assets/icons/favicon-196.png';
        }

        openCreateMenuModal() {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const modalId = 'createMenuModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'demo-recipe-modal-backdrop';
            modal.style.cssText = 'position: fixed; inset: 0; z-index: 99999; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px;';
            modal.innerHTML = `
                <div class="demo-recipe-modal-card" style="background: #FFFFFF; border-radius: 24px; width: 100%; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid #E2E8F0; overflow: hidden; max-height: 90vh; display: flex; flex-direction: column;">
                    <div style="padding: 20px 24px 16px 24px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #F1F5F9; flex-shrink: 0;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <div style="width: 44px; height: 44px; border-radius: 12px; background: #ECFDF5; color: #059669; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(5, 150, 105, 0.15);">
                                <span class="material-symbols-outlined" style="font-size: 24px;">storefront</span>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #0F172A;">
                                    ${isEn ? 'Create Restaurant Menu' : 'Crear Carta de Restaurante'}
                                </h3>
                                <p style="margin: 3px 0 0 0; font-size: 13px; color: #64748B;">
                                    ${isEn ? 'Configure restaurant name, logo, and website' : 'Introduce el nombre, logo y web de tu restaurante'}
                                </p>
                            </div>
                        </div>
                        <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background: none; border: none; cursor: pointer; color: #94A3B8; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
                        </button>
                    </div>

                    <form id="createMenuForm" onsubmit="event.preventDefault(); window.restaurantMenu.submitCreateMenuForm();" style="padding: 24px; overflow-y: auto;">
                        <!-- Nombre del restaurante -->
                        <div style="margin-bottom: 18px;">
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Restaurant / Menu Name *' : 'Nombre del Restaurante / Carta *'}
                            </label>
                            <input type="text" id="newRestaurantNameInput" required placeholder="${isEn ? 'e.g. The Italian Kitchen, Bistro Central...' : 'Ej. La Trattoria, Bistró Central...'}" 
                                style="width: 100%; height: 44px; border-radius: 12px; border: 1.5px solid #CBD5E1; padding: 0 14px; font-size: 14px; color: #0F172A; outline: none; box-sizing: border-box;">
                        </div>

                        <!-- Logo / Icono -->
                        <div style="margin-bottom: 18px;">
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Restaurant Logo (Optional)' : 'Logo del Restaurante (Opcional)'}
                            </label>
                            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 10px;">
                                <div style="width: 56px; height: 56px; border-radius: 14px; border: 1.5px solid #E2E8F0; overflow: hidden; background: #F8FAFC; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
                                    <img id="createLogoPreview" src="assets/icons/favicon-196.png" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;">
                                </div>
                                <div style="flex: 1;">
                                    <input type="file" id="createLogoFileInput" accept="image/*" style="display: none;" onchange="window.restaurantMenu.handleLogoFileSelected(event, 'create')">
                                    <button type="button" onclick="document.getElementById('createLogoFileInput').click()" class="btn-secondary" style="border-radius: 999px; height: 34px; padding: 0 14px; font-size: 12.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                                        <span class="material-symbols-outlined" style="font-size: 16px;">upload</span>
                                        <span>${isEn ? 'Upload Image File' : 'Subir Imagen'}</span>
                                    </button>
                                    <button type="button" onclick="window.restaurantMenu.clearLogoInput('create')" class="btn-secondary" style="border-radius: 999px; height: 34px; padding: 0 12px; font-size: 12.5px; margin-left: 6px; color: #64748B;" title="Usar icono oficial de la app">
                                        <span>${isEn ? 'Use App Icon' : 'Usar Icono App'}</span>
                                    </button>
                                    <p style="margin: 4px 0 0 0; font-size: 11.5px; color: #64748B;">
                                        ${isEn ? 'If left empty, the official app icon will be used.' : 'Si no subes logo, se usará el icono oficial de la app.'}
                                    </p>
                                </div>
                            </div>
                            <input type="url" id="createLogoUrlInput" placeholder="${isEn ? 'Or paste direct image URL (https://...)' : 'O pega una URL directa de imagen (https://...)'}"
                                oninput="window.restaurantMenu.updateLogoUrlPreview(this.value, 'create')"
                                style="width: 100%; height: 40px; border-radius: 10px; border: 1.5px solid #CBD5E1; padding: 0 12px; font-size: 13px; color: #0F172A; outline: none; box-sizing: border-box;">
                        </div>

                        <!-- Página Web Oficial -->
                        <div style="margin-bottom: 22px;">
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Official Website URL (Optional)' : 'Página Web Oficial (Opcional)'}
                            </label>
                            <input type="url" id="createWebsiteUrlInput" placeholder="https://www.mirestaurante.com"
                                style="width: 100%; height: 42px; border-radius: 12px; border: 1.5px solid #CBD5E1; padding: 0 14px; font-size: 14px; color: #0F172A; outline: none; box-sizing: border-box;">
                            <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748B; line-height: 1.4;">
                                💡 ${isEn ? 'If set, clicking the logo will open this site in a new tab. If empty, clicking the logo does nothing.' : 'Si pones una URL, al tocar el logo se abrirá tu web. Si lo dejas vacío, al tocar el logo no hará nada.'}
                            </p>
                        </div>

                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
                            <button type="button" onclick="document.getElementById('${modalId}').remove()" 
                                style="height: 42px; padding: 0 18px; border-radius: 999px; border: 1px solid #CBD5E1; background: #F8FAFC; color: #475569; font-weight: 600; font-size: 14px; cursor: pointer;">
                                ${isEn ? 'Cancel' : 'Cancelar'}
                            </button>
                            <button type="submit" 
                                style="height: 42px; padding: 0 24px; border-radius: 999px; border: none; background: #10B981; color: #FFFFFF; font-weight: 700; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);">
                                <span class="material-symbols-outlined" style="font-size: 18px;">check</span>
                                <span>${isEn ? 'Create Menu' : 'Crear Carta'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
            setTimeout(() => {
                const input = document.getElementById('newRestaurantNameInput');
                if (input) input.focus();
            }, 100);
        }

        submitCreateMenuForm() {
            const nameInput = document.getElementById('newRestaurantNameInput');
            const logoInput = document.getElementById('createLogoUrlInput');
            const webInput = document.getElementById('createWebsiteUrlInput');

            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) return;

            const logoUrl = logoInput ? logoInput.value.trim() : null;
            const websiteUrl = webInput ? webInput.value.trim() : null;

            const modal = document.getElementById('createMenuModal');
            if (modal) modal.remove();

            this.createRestaurantMenu(name, {
                logo_url: logoUrl || null,
                website_url: websiteUrl || null,
                withDefaults: false
            });
        }

        openEditMenuModal() {
            if (!this.isOwner) return;
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const modalId = 'editMenuModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            const isStanley = this.isStanleyOriginal();
            const currentLogo = this.logoUrl || (isStanley ? 'assets/images/stanleys-logo.png' : 'assets/icons/favicon-196.png');
            const currentWeb = this.websiteUrl || (isStanley ? (this.info?.website || 'https://www.stanleyssw16.com/food') : '');

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'demo-recipe-modal-backdrop';
            modal.style.cssText = 'position: fixed; inset: 0; z-index: 99999; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px;';
            modal.innerHTML = `
                <div class="demo-recipe-modal-card" style="background: #FFFFFF; border-radius: 24px; width: 100%; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid #E2E8F0; overflow: hidden; max-height: 90vh; display: flex; flex-direction: column;">
                    <div style="padding: 20px 24px 16px 24px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #F1F5F9; flex-shrink: 0;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <div style="width: 44px; height: 44px; border-radius: 12px; background: #ECFDF5; color: #059669; display: flex; align-items: center; justify-content: center;">
                                <span class="material-symbols-outlined" style="font-size: 24px;">storefront</span>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #0F172A;">
                                    ${isEn ? 'Edit Restaurant Details' : 'Editar Datos del Restaurante'}
                                </h3>
                                <p style="margin: 3px 0 0 0; font-size: 13px; color: #64748B;">
                                    ${isEn ? 'Configure name, logo, and website' : 'Configura el nombre, logo y página web'}
                                </p>
                            </div>
                        </div>
                        <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background: none; border: none; cursor: pointer; color: #94A3B8; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
                        </button>
                    </div>

                    <form id="editMenuForm" onsubmit="event.preventDefault(); window.restaurantMenu.submitEditMenuForm();" style="padding: 24px; overflow-y: auto;">
                        <!-- Nombre del restaurante -->
                        <div style="margin-bottom: 18px;">
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Restaurant / Menu Name *' : 'Nombre del Restaurante / Carta *'}
                            </label>
                            <input type="text" id="editRestaurantNameInput" required value="${this.restaurantName || ''}" 
                                placeholder="${isEn ? 'e.g. The Italian Kitchen' : 'Ej. La Trattoria'}" 
                                style="width: 100%; height: 44px; border-radius: 12px; border: 1.5px solid #CBD5E1; padding: 0 14px; font-size: 14px; color: #0F172A; outline: none; box-sizing: border-box;">
                        </div>

                        <!-- Logo / Icono -->
                        <div style="margin-bottom: 18px;">
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Restaurant Logo' : 'Logo del Restaurante'}
                            </label>
                            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 10px;">
                                <div style="width: 58px; height: 58px; border-radius: 14px; border: 1.5px solid #E2E8F0; overflow: hidden; background: #F8FAFC; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
                                    <img id="editLogoPreview" src="${currentLogo}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;">
                                </div>
                                <div style="flex: 1;">
                                    <input type="file" id="editLogoFileInput" accept="image/*" style="display: none;" onchange="window.restaurantMenu.handleLogoFileSelected(event, 'edit')">
                                    <button type="button" onclick="document.getElementById('editLogoFileInput').click()" class="btn-secondary" style="border-radius: 999px; height: 34px; padding: 0 14px; font-size: 12.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                                        <span class="material-symbols-outlined" style="font-size: 16px;">upload</span>
                                        <span>${isEn ? 'Upload Image File' : 'Subir Imagen'}</span>
                                    </button>
                                    <button type="button" onclick="window.restaurantMenu.clearLogoInput('edit')" class="btn-secondary" style="border-radius: 999px; height: 34px; padding: 0 12px; font-size: 12.5px; margin-left: 6px; color: #64748B;" title="Usar icono oficial de la app">
                                        <span>${isEn ? 'Use App Icon' : 'Usar Icono App'}</span>
                                    </button>
                                    <p style="margin: 4px 0 0 0; font-size: 11.5px; color: #64748B;">
                                        ${isEn ? 'If empty, the official app icon will be used.' : 'Si no subes logo, se usará el icono oficial de la app.'}
                                    </p>
                                </div>
                            </div>
                            <input type="url" id="editLogoUrlInput" value="${this.logoUrl || ''}" placeholder="${isEn ? 'Or paste direct image URL (https://...)' : 'O pega una URL directa de imagen (https://...)'}"
                                oninput="window.restaurantMenu.updateLogoUrlPreview(this.value, 'edit')"
                                style="width: 100%; height: 40px; border-radius: 10px; border: 1.5px solid #CBD5E1; padding: 0 12px; font-size: 13px; color: #0F172A; outline: none; box-sizing: border-box;">
                        </div>

                        <!-- Página Web -->
                        <div style="margin-bottom: 24px;">
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Official Website URL (Optional)' : 'Página Web Oficial (Opcional)'}
                            </label>
                            <input type="url" id="editWebsiteUrlInput" value="${currentWeb}" placeholder="https://www.mirestaurante.com"
                                style="width: 100%; height: 42px; border-radius: 12px; border: 1.5px solid #CBD5E1; padding: 0 14px; font-size: 14px; color: #0F172A; outline: none; box-sizing: border-box;">
                            <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748B; line-height: 1.4;">
                                💡 ${isEn ? 'If set, clicking the logo will open this site in a new tab. If empty, clicking the logo does nothing.' : 'Si pones una URL, al tocar el logo se abrirá tu web. Si lo dejas vacío, al tocar el logo no hará nada.'}
                            </p>
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 6px; flex-wrap: wrap;">
                            <button type="button" onclick="window.restaurantMenu.confirmDeleteRestaurantMenu()" 
                                style="height: 42px; padding: 0 16px; border-radius: 999px; border: 1.5px solid #FECDD3; background: #FFF1F2; color: #E11D48; font-weight: 700; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;"
                                onmouseenter="this.style.background='#FEE2E2'" onmouseleave="this.style.background='#FFF1F2'"
                                title="${isEn ? 'Permanently delete this restaurant and leave menu empty' : 'Eliminar permanentemente esta carta y dejar el espacio vacío'}">
                                <span class="material-symbols-outlined" style="font-size: 17px;">delete</span>
                                <span>${isEn ? 'Delete Menu' : 'Eliminar Carta'}</span>
                            </button>
                            <div style="display: flex; align-items: center; gap: 10px; margin-left: auto;">
                                <button type="button" onclick="document.getElementById('${modalId}').remove()" 
                                    style="height: 42px; padding: 0 18px; border-radius: 999px; border: 1px solid #CBD5E1; background: #F8FAFC; color: #475569; font-weight: 600; font-size: 14px; cursor: pointer;">
                                    ${isEn ? 'Cancel' : 'Cancelar'}
                                </button>
                                <button type="submit" 
                                    style="height: 42px; padding: 0 24px; border-radius: 999px; border: none; background: #10B981; color: #FFFFFF; font-weight: 700; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);">
                                    <span class="material-symbols-outlined" style="font-size: 18px;">save</span>
                                    <span>${isEn ? 'Save Changes' : 'Guardar Cambios'}</span>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }

        confirmDeleteRestaurantMenu() {
            if (!this.isOwner || !this.activeMenu?.id) return;
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const modalId = 'editMenuModal';
            const modal = document.getElementById(modalId);
            if (modal) modal.remove();

            const menuName = this.restaurantName || (isEn ? 'this restaurant' : 'este restaurante');
            const confirmMsg = isEn 
                ? `Are you sure you want to permanently delete "${menuName}"? The restaurant menu will be completely empty.` 
                : `¿Seguro que deseas eliminar definitivamente la carta de "${menuName}"? El espacio quedará completamente vacío.`;

            const doDelete = async () => {
                try {
                    const sb = window.supabaseClient;
                    const menuId = this.activeMenu?.id;
                    if (sb && menuId) {
                        // 1. Eliminar colaboraciones compartidas asociadas a este menú
                        await sb.from('shared_restaurant_menus').delete().eq('menu_id', menuId);
                        // 2. Eliminar el menú en sí
                        const { error } = await sb.from('restaurant_menus').delete().eq('id', menuId);
                        if (error) throw error;
                    }

                    // 3. Resetear todo el estado a vacío
                    this.hasMenu = false;
                    this.isOwner = false;
                    this.isShared = false;
                    this.sharedBy = null;
                    this.permission = 'view';
                    this.activeMenu = null;
                    this.sharedRecordId = null;
                    this.restaurantName = "Mi Restaurante";
                    this.logoUrl = null;
                    this.websiteUrl = null;
                    this.info = {};
                    this.sections = [];
                    this.customItems = [];
                    this.removedItemIds = [];
                    this.availability = {};
                    this.officialAllergens = [];
                    this.allergenDefinitions = [];

                    // 4. Renderizar vista de menú (ahora mostrará el estado vacío para crear restaurante)
                    this.render();

                    // 5. Si el usuario está en la vista de alérgenos, refrescarla también
                    if (window.dashboard && window.dashboard.currentView === 'allergens') {
                        window.dashboard.renderAllergensView();
                    }

                    if (window.showActionToast) {
                        window.showActionToast({
                            message: isEn ? '✅ Menu deleted. Space is now empty.' : '✅ Carta eliminada correctamente. El espacio ha quedado vacío.',
                            type: 'success'
                        });
                    }
                } catch (err) {
                    console.error('Error deleting restaurant menu:', err);
                    if (window.showActionToast) {
                        window.showActionToast({
                            message: isEn ? '❌ Could not delete menu: ' + (err.message || err) : '❌ No se pudo eliminar la carta: ' + (err.message || err),
                            type: 'error'
                        });
                    }
                }
            };

            if (window.showActionToast) {
                window.showActionToast({
                    message: confirmMsg,
                    actionText: isEn ? 'Delete Permanently' : 'Eliminar Carta',
                    cancelText: isEn ? 'Keep' : 'Cancelar',
                    type: 'error',
                    actionColor: '#EF4444',
                    onConfirm: doDelete
                });
            } else {
                doDelete();
            }
        }

        async submitEditMenuForm() {
            const nameInput = document.getElementById('editRestaurantNameInput');
            const logoInput = document.getElementById('editLogoUrlInput');
            const webInput = document.getElementById('editWebsiteUrlInput');

            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) return;

            const logoUrl = logoInput ? (logoInput.value.trim() || null) : null;
            const websiteUrl = webInput ? (webInput.value.trim() || null) : null;

            const modal = document.getElementById('editMenuModal');
            if (modal) modal.remove();

            this.restaurantName = name;
            this.logoUrl = logoUrl;
            this.websiteUrl = websiteUrl;

            await this.saveToSupabase({
                restaurant_name: name,
                logo_url: logoUrl,
                website_url: websiteUrl
            });

            this.render();

            const isEn = window.i18n && window.i18n.getLang() === 'en';
            if (window.showActionToast) {
                window.showActionToast({
                    message: isEn ? '✅ Restaurant details updated' : '✅ Datos del restaurante actualizados',
                    type: 'success'
                });
            }
        }

        getAllergens() {
            if (this.hasMenu && Array.isArray(this.allergenDefinitions) && this.allergenDefinitions.length > 0) {
                return this.allergenDefinitions;
            }
            if (this.isStanleyOriginal()) {
                return (window.UK_ALLERGENS || []).map(a => ({
                    id: a.id,
                    name: a.name_es,
                    name_en: a.name_en,
                    icon: a.icon,
                    color: a.color,
                    whereItHides: a.whereItHides_es,
                    contaminationRisks: a.contaminationRisks_es,
                    keywords: a.keywords || []
                }));
            }
            return [];
        }

        openAllergenModal(allergenId = null) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const modalId = 'allergenEditorModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            const existing = allergenId ? (this.allergenDefinitions || []).find(a => a.id === allergenId) : null;
            const isEdit = !!existing;

            const icons = ['spa', 'bakery_dining', 'phishing', 'egg', 'nutrition', 'science', 'local_cafe', 'eco', 'grain', 'set_meal', 'water_drop', 'health_and_safety'];
            const currentIcon = existing?.icon || 'spa';
            const currentColor = existing?.color || '#10B981';

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'demo-recipe-modal-backdrop';
            modal.style.cssText = 'position: fixed; inset: 0; z-index: 99999; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px;';
            
            modal.innerHTML = `
                <div class="demo-recipe-modal-card" style="background: #FFFFFF; border-radius: 24px; width: 100%; max-width: 540px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid #E2E8F0; overflow: hidden;">
                    <div style="padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #F1F5F9; flex-shrink: 0;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div id="modalIconPreview" style="width: 44px; height: 44px; border-radius: 12px; background: ${currentColor}18; color: ${currentColor}; display: flex; align-items: center; justify-content: center;">
                                <span class="material-symbols-outlined" style="font-size: 26px;">${currentIcon}</span>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #0F172A;">
                                    ${isEdit ? (isEn ? 'Edit Kitchen Allergen' : 'Editar Alérgeno') : (isEn ? 'New Kitchen Allergen' : 'Registrar Nuevo Alérgeno')}
                                </h3>
                                <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748B;">
                                    ${isEn ? 'Custom allergen for your kitchen and country regulation' : 'Alérgeno personalizado para tu cocina y normativa local'}
                                </p>
                            </div>
                        </div>
                        <button type="button" onclick="document.getElementById('${modalId}').remove()" style="background: none; border: none; cursor: pointer; color: #94A3B8; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
                        </button>
                    </div>

                    <form id="allergenEditForm" onsubmit="event.preventDefault(); window.restaurantMenu.submitAllergenForm('${allergenId || ''}');" style="padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px;">
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Allergen Name *' : 'Nombre del Alérgeno *'}
                            </label>
                            <input type="text" id="allergenNameInput" required value="${existing?.name_es || existing?.name || ''}" placeholder="${isEn ? 'e.g. Peanuts, Gluten, Dairy, Sesame...' : 'Ej. Maní / Cacahuetes, Gluten, Lácteos, Sésamo...'}"
                                style="width: 100%; height: 44px; border-radius: 12px; border: 1.5px solid #CBD5E1; padding: 0 14px; font-size: 14.5px; color: #0F172A; outline: none; box-sizing: border-box;">
                        </div>

                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Icon & Color' : 'Icono y Color'}
                            </label>
                            <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                                <div style="display: flex; gap: 6px; flex-wrap: wrap; flex: 1;">
                                    ${icons.map(ic => `
                                        <button type="button" class="allergen-icon-btn ${ic === currentIcon ? 'active' : ''}" data-icon="${ic}" onclick="window.restaurantMenu.selectModalIcon('${ic}')"
                                            style="width: 36px; height: 36px; border-radius: 8px; border: 1.5px solid ${ic === currentIcon ? '#10B981' : '#E2E8F0'}; background: ${ic === currentIcon ? '#ECFDF5' : '#F8FAFC'}; color: ${ic === currentIcon ? '#059669' : '#64748B'}; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                                            <span class="material-symbols-outlined" style="font-size: 20px;">${ic}</span>
                                        </button>
                                    `).join('')}
                                </div>
                                <input type="hidden" id="selectedAllergenIcon" value="${currentIcon}">
                                <input type="color" id="selectedAllergenColor" value="${currentColor}" onchange="window.restaurantMenu.updateModalColor(this.value)"
                                    style="width: 40px; height: 38px; border-radius: 8px; border: 1.5px solid #E2E8F0; padding: 2px; cursor: pointer; background: #FFF;">
                            </div>
                        </div>

                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Where does it hide in daily cooking?' : '¿Dónde se esconde en la cocina diaria?'}
                            </label>
                            <textarea id="allergenHidesInput" rows="2" placeholder="${isEn ? 'e.g. Soy sauces, stock cubes, roux, batters...' : 'Ej. Salsas de soja, pastillas de caldo, caldos concentrados, rebozados...'}"
                                style="width: 100%; border-radius: 12px; border: 1.5px solid #CBD5E1; padding: 10px 14px; font-size: 14px; color: #0F172A; outline: none; resize: vertical; box-sizing: border-box;">${existing?.whereItHides_es || existing?.whereItHides || ''}</textarea>
                        </div>

                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Cross-contamination critical points:' : 'Puntos críticos de contaminación cruzada:'}
                            </label>
                            <textarea id="allergenRisksInput" rows="2" placeholder="${isEn ? 'e.g. Shared deep fryers, cutting boards, shared blenders...' : 'Ej. Freidoras compartidas, aceites de fritura, tablas de corte, batidoras...'}"
                                style="width: 100%; border-radius: 12px; border: 1.5px solid #CBD5E1; padding: 10px 14px; font-size: 14px; color: #0F172A; outline: none; resize: vertical; box-sizing: border-box;">${existing?.contaminationRisks_es || existing?.contaminationRisks || ''}</textarea>
                        </div>

                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                                ${isEn ? 'Keywords for detection (comma-separated):' : 'Palabras clave para detección (separadas por comas):'}
                            </label>
                            <input type="text" id="allergenKeywordsInput" value="${(existing?.keywords || []).join(', ')}" placeholder="${isEn ? 'e.g. peanut, butter, arachis' : 'Ej. mani, cacahuete, crema de mani, arbol'}"
                                style="width: 100%; height: 42px; border-radius: 12px; border: 1.5px solid #CBD5E1; padding: 0 14px; font-size: 14px; color: #0F172A; outline: none; box-sizing: border-box;">
                        </div>

                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 8px; flex-shrink: 0;">
                            <button type="button" onclick="document.getElementById('${modalId}').remove()" 
                                style="height: 42px; padding: 0 18px; border-radius: 999px; border: 1px solid #CBD5E1; background: #F8FAFC; color: #475569; font-weight: 600; font-size: 14px; cursor: pointer;">
                                ${isEn ? 'Cancel' : 'Cancelar'}
                            </button>
                            <button type="submit" 
                                style="height: 42px; padding: 0 24px; border-radius: 999px; border: none; background: #10B981; color: #FFFFFF; font-weight: 700; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);">
                                <span class="material-symbols-outlined" style="font-size: 18px;">save</span>
                                <span>${isEn ? 'Save Allergen' : 'Guardar Alérgeno'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
            setTimeout(() => {
                const nameInput = document.getElementById('allergenNameInput');
                if (nameInput) nameInput.focus();
            }, 100);
        }

        selectModalIcon(icon) {
            const input = document.getElementById('selectedAllergenIcon');
            if (input) input.value = icon;
            document.querySelectorAll('.allergen-icon-btn').forEach(btn => {
                const isSelected = btn.getAttribute('data-icon') === icon;
                btn.style.borderColor = isSelected ? '#10B981' : '#E2E8F0';
                btn.style.background = isSelected ? '#ECFDF5' : '#F8FAFC';
                btn.style.color = isSelected ? '#059669' : '#64748B';
            });
            const preview = document.querySelector('#modalIconPreview .material-symbols-outlined');
            if (preview) preview.textContent = icon;
        }

        updateModalColor(color) {
            const preview = document.getElementById('modalIconPreview');
            if (preview) {
                preview.style.background = color + '18';
                preview.style.color = color;
            }
        }

        submitAllergenForm(allergenId = '') {
            const nameInput = document.getElementById('allergenNameInput');
            const iconInput = document.getElementById('selectedAllergenIcon');
            const colorInput = document.getElementById('selectedAllergenColor');
            const hidesInput = document.getElementById('allergenHidesInput');
            const risksInput = document.getElementById('allergenRisksInput');
            const keywordsInput = document.getElementById('allergenKeywordsInput');

            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) return;

            const icon = iconInput ? iconInput.value : 'spa';
            const color = colorInput ? colorInput.value : '#10B981';
            const hides = hidesInput ? hidesInput.value.trim() : '';
            const risks = risksInput ? risksInput.value.trim() : '';
            const keywords = keywordsInput ? keywordsInput.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];

            if (!Array.isArray(this.allergenDefinitions)) {
                this.allergenDefinitions = [];
            }

            const isEdit = !!allergenId;
            const id = isEdit ? allergenId : (name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4));

            const newAllergen = {
                id,
                name_es: name,
                name_en: name,
                icon,
                color,
                bg: color + '15',
                border: color + '30',
                whereItHides_es: hides,
                whereItHides_en: hides,
                contaminationRisks_es: risks,
                contaminationRisks_en: risks,
                keywords: keywords.length > 0 ? keywords : [name.toLowerCase()]
            };

            if (isEdit) {
                const idx = this.allergenDefinitions.findIndex(a => a.id === allergenId);
                if (idx !== -1) {
                    this.allergenDefinitions[idx] = newAllergen;
                } else {
                    this.allergenDefinitions.push(newAllergen);
                }
            } else {
                this.allergenDefinitions.push(newAllergen);
            }

            this.saveToSupabase({ allergen_definitions: this.allergenDefinitions });

            const modal = document.getElementById('allergenEditorModal');
            if (modal) modal.remove();

            if (window.showActionToast) {
                window.showActionToast({
                    message: isEdit ? `Alérgeno "${name}" actualizado` : `Alérgeno "${name}" registrado correctamente`,
                    type: 'success'
                });
            }

            if (window.dashboard && window.dashboard.currentView === 'allergens') {
                window.dashboard.renderAllergensView();
            }
        }

        confirmDeleteAllergen(allergenId) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const allg = (this.allergenDefinitions || []).find(a => a.id === allergenId);
            const name = allg ? (allg.name_es || allg.name_en || allergenId) : allergenId;
            
            if (window.showActionToast) {
                window.showActionToast({
                    message: isEn ? `¿Eliminar alérgeno "${name}" de la carta?` : `¿Eliminar alérgeno "${name}" de la carta?`,
                    actionText: isEn ? 'Eliminar' : 'Eliminar',
                    cancelText: isEn ? 'Cancelar' : 'Cancelar',
                    actionColor: '#EF4444',
                    onConfirm: () => {
                        this.deleteAllergen(allergenId);
                    }
                });
            }
        }

        deleteAllergen(allergenId) {
            this.allergenDefinitions = (this.allergenDefinitions || []).filter(a => a.id !== allergenId);
            this.saveToSupabase({ allergen_definitions: this.allergenDefinitions });
            if (window.showActionToast) {
                window.showActionToast({
                    message: 'Alérgeno eliminado correctamente',
                    type: 'success'
                });
            }
            if (window.dashboard && window.dashboard.currentView === 'allergens') {
                window.dashboard.renderAllergensView();
            }
        }

        async createRestaurantMenu(restaurantName = 'Mi Restaurante', options = false) {
            try {
                const sb = window.supabaseClient;
                if (!sb) return;
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;

                const { data: userData } = await sb.from('users')
                    .select('id, email')
                    .eq('auth_user_id', user.id)
                    .single();

                if (!userData) return;

                const isObj = typeof options === 'object' && options !== null;
                const withDefaults = isObj ? !!options.withDefaults : !!options;
                const logoUrl = isObj ? (options.logo_url || null) : null;
                const websiteUrl = isObj ? (options.website_url || null) : null;

                const defaultData = window.STANLEYS_MENU_DATA || {};
                const defaultAllergens = window.STANLEYS_OFFICIAL_ALLERGENS || [];

                const payload = {
                    owner_user_id: userData.id,
                    restaurant_name: restaurantName,
                    logo_url: logoUrl || (withDefaults ? 'assets/images/stanleys-logo.png' : null),
                    website_url: websiteUrl || (withDefaults ? 'https://www.stanleyssw16.com/food' : null),
                    info: withDefaults ? (defaultData.info || {}) : {},
                    doc_main_url: withDefaults ? 'assets/pdf/stanleys-main-menu.pdf' : null,
                    doc_main_name: withDefaults ? 'stanleys-main-menu.pdf' : null,
                    doc_main_type: withDefaults ? 'application/pdf' : null,
                    doc_sunday_url: withDefaults ? 'assets/pdf/stanleys-sunday-menu.pdf' : null,
                    doc_sunday_name: withDefaults ? 'stanleys-sunday-menu.pdf' : null,
                    doc_sunday_type: withDefaults ? 'application/pdf' : null,
                    sections: withDefaults ? (defaultData.sections || []) : [
                        { id: 'main', name_es: 'Menú Principal', name_en: 'Main Menu', icon: 'restaurant', categories: [
                            { id: 'starters', name_es: 'Entrantes', name_en: 'Starters', icon: 'tapas', items: [] },
                            { id: 'mains', name_es: 'Platos Principales', name_en: 'Main Dishes', icon: 'lunch_dining', items: [] },
                            { id: 'desserts', name_es: 'Postres', name_en: 'Desserts', icon: 'icecream', items: [] }
                        ]}
                    ],
                    custom_items: [],
                    removed_items: [],
                    availability: {},
                    official_allergens: withDefaults ? defaultAllergens : []
                };

                const { data, error } = await sb.from('restaurant_menus').insert(payload).select().single();
                if (error) throw error;

                if (window.showActionToast) {
                    window.showActionToast({
                        message: `✅ Carta de "${restaurantName}" creada con éxito`,
                        type: 'success'
                    });
                }

                await this.syncFromSupabase();
                if (window.dashboard && window.dashboard.currentView === 'allergens') {
                    window.dashboard.renderAllergensView();
                }
            } catch (err) {
                console.error('Error creating restaurant menu:', err);
                if (window.showActionToast) {
                    window.showActionToast({
                        message: 'No se pudo crear el menú: ' + (err.message || err),
                        type: 'error'
                    });
                }
            }
        }

        toggleItemAvailability(itemId, event) {
            if (event) event.stopPropagation();
            const current = this.isAvailable(itemId);
            this.availability[itemId] = !current;
            this.saveAvailability();
            this.render();

            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const msg = !current
                ? (isEn ? 'Item marked as AVAILABLE' : 'Plato marcado como DISPONIBLE')
                : (isEn ? 'Item marked as 86 (OUT OF STOCK)' : 'Plato marcado como 86 (AGOTADO)');
            
            if (window.showActionToast) {
                window.showActionToast({ message: msg, type: !current ? 'success' : 'warning', timeout: 2500 });
            }
        }

        isAvailable(itemId) {
            return this.availability[itemId] !== false; // Por defecto disponible
        }

        setTab(tab) {
            this.activeTab = tab;
            this.activeCategory = 'all';
            this.render();
        }

        setCategory(catId) {
            this.activeCategory = catId;
            this.render();
            // Scroll suave a la categoría si no es 'all'
            if (catId !== 'all') {
                const target = document.getElementById(`cat_section_${catId}`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        }

        setSearchQuery(q) {
            this.searchQuery = (q || '').trim().toLowerCase();
            this.render();
            const searchInput = document.getElementById('searchInput');
            if (searchInput && searchInput.value !== (q || '')) {
                searchInput.value = q || '';
            }
            const clearBtn = document.getElementById('clearSearch');
            if (clearBtn) {
                clearBtn.classList.toggle('hidden', !q);
            }
        }

        searchInPantry(dishName) {
            if (window.dashboard) {
                window.dashboard.switchView('recipes');
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.value = dishName;
                }
                window.dashboard.loadRecipes({ search: dishName });
            }
        }

        // Obtener todos los platos combinando datos fijos y personalizados, omitiendo eliminados
        // Obtener todos los platos combinando datos del restaurante y personalizados, omitiendo eliminados
        getAllSections() {
            if (!this.hasMenu) return [];
            const isStanley = this.isStanleyOriginal();
            const sectionsToUse = (this.sections && this.sections.length > 0)
                ? this.sections
                : (isStanley ? (window.STANLEYS_MENU_DATA?.sections || []) : []);
            const rawSections = JSON.parse(JSON.stringify(sectionsToUse));
            const removedSet = new Set(this.removedItemIds || []);

            // Filtrar eliminados y anotar metadatos de categoría
            rawSections.forEach(section => {
                (section.categories || []).forEach(cat => {
                    cat.items = (cat.items || []).filter(item => !removedSet.has(item.id));
                    cat.items.forEach(item => {
                        item.categoryName_es = cat.name_es;
                        item.categoryName_en = cat.name_en;
                        item.categoryIcon = cat.icon || 'restaurant';
                        item.categoryId = cat.id;
                    });
                });
            });

            // Agregar custom items a su categoría
            (this.customItems || []).forEach(item => {
                let found = false;
                for (const sec of rawSections) {
                    for (const cat of (sec.categories || [])) {
                        if (cat.id === item.categoryId) {
                            item.categoryName_es = cat.name_es;
                            item.categoryName_en = cat.name_en;
                            item.categoryIcon = cat.icon || 'restaurant';
                            cat.items.push(item);
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
                if (!found && rawSections[0] && rawSections[0].categories && rawSections[0].categories[0]) {
                    const fallbackCat = rawSections[0].categories[0];
                    item.categoryName_es = fallbackCat.name_es;
                    item.categoryName_en = fallbackCat.name_en;
                    item.categoryIcon = fallbackCat.icon || 'restaurant';
                    fallbackCat.items.push(item);
                }
            });

            return rawSections;
        }

        getOfficialAllergens() {
            if (!this.hasMenu) return [];
            const isStanley = this.isStanleyOriginal();
            const base = (this.officialAllergens && this.officialAllergens.length > 0)
                ? this.officialAllergens
                : (isStanley ? (window.STANLEYS_OFFICIAL_ALLERGENS || []) : []);
            const removedSet = new Set(this.removedItemIds || []);
            let list = base.filter(d => !removedSet.has(d.id));

            if (this.customItems && this.customItems.length > 0) {
                this.customItems.forEach(ci => {
                    if (removedSet.has(ci.id)) return;
                    list.push({
                        id: ci.id,
                        section: (ci.sectionId === 'sunday' ? 'SUNDAY ROAST' : 'MAINS'),
                        name_en: ci.name,
                        name_es: ci.name,
                        name: ci.name,
                        allergens: ci.allergens || [],
                        crossContamination: ci.crossContamination || [],
                        rawAllergens: {},
                        tags: ci.tags || []
                    });
                });
            }
            return list;
        }

        // Gestión: Eliminar un plato que ya no está en la carta del restaurante
        deleteMenuItem(itemId, itemName) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const confirmMsg = isEn 
                ? `¿Remove "${itemName}" from the active menu?` 
                : `¿Deseas quitar "${itemName}" de la carta activa?`;

            const doDelete = () => {
                // Si es un plato creado localmente, removerlo de customItems
                this.customItems = this.customItems.filter(i => i.id !== itemId);
                this.saveCustomItems();

                // Si es un plato de la lista base, agregarlo a removedItemIds
                if (!this.removedItemIds.includes(itemId)) {
                    this.removedItemIds.push(itemId);
                    this.saveRemovedItems();
                }

                this.render();
                const notify = window.showToast || (window.utils && window.utils.showToast);
                if (notify) {
                    notify(isEn ? `"${itemName}" removed from menu` : `"${itemName}" retirado de la carta`, 'info');
                }
            };

            const triggerAction = window.showActionToast || window.utils?.showActionToast;
            if (triggerAction) {
                triggerAction({
                    message: confirmMsg,
                    actionText: isEn ? 'Remove' : 'Eliminar',
                    cancelText: isEn ? 'Cancel' : 'Cancelar',
                    type: 'error',
                    actionColor: '#EF4444',
                    onConfirm: doDelete
                });
            } else {
                doDelete();
            }
        }

        // Restaurar menú original completo
        resetOriginalMenu() {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const confirmMsg = isEn ? '¿Restore all original menu items?' : '¿Restaurar todos los platos originales de la carta oficial?';

            const doReset = () => {
                this.removedItemIds = [];
                this.saveRemovedItems();
                this.render();
                const notify = window.showToast || (window.utils && window.utils.showToast);
                if (notify) {
                    notify(isEn ? 'Original menu restored' : 'Menú original restaurado', 'success');
                }
            };

            const triggerAction = window.showActionToast || window.utils?.showActionToast;
            if (triggerAction) {
                triggerAction({
                    message: confirmMsg,
                    actionText: isEn ? 'Restore' : 'Restaurar',
                    cancelText: isEn ? 'Cancel' : 'Cancelar',
                    type: 'info',
                    actionColor: '#2563EB',
                    onConfirm: doReset
                });
            } else {
                doReset();
            }
        }

        showAddDishForm() {
            this.isAddingDish = true;
            this.render();
            const main = document.querySelector('.main-content') || window;
            if (main.scrollTo) {
                main.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        showAddDishModal() {
            // Reemplazado para no abrir modal flotante, sino cargar el formulario en vista completa
            this.showAddDishForm();
        }

        cancelAddDish() {
            this.isAddingDish = false;
            this.render();
        }

        updateDishTagsFromChips() {
            const activeChips = document.querySelectorAll('#dishDietaryChips .m3-expressive-chip.active, #dishDietaryChips .filter-chip.active');
            const tags = Array.from(activeChips).map(c => c.getAttribute('data-diet')).filter(Boolean);
            const tagsInput = document.getElementById('newDishTags');
            if (tagsInput) {
                tagsInput.value = tags.join(', ');
            }
        }

        renderAddDishForm(container) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const sections = this.getAllSections();

            let categoriesOptions = '';
            sections.forEach(sec => {
                categoriesOptions += `<optgroup label="${isEn ? sec.name_en : sec.name_es}">`;
                sec.categories.forEach(cat => {
                    categoriesOptions += `<option value="${cat.id}">${isEn ? cat.name_en : cat.name_es}</option>`;
                });
                categoriesOptions += `</optgroup>`;
            });

            container.innerHTML = `
                <div class="menu-form-view-container" style="max-width: 820px; margin: 0 auto; padding: 16px 16px 60px 16px;">
                    <!-- Top Navigation Bar / Breadcrumb (sin botones duplicados arriba) -->
                    <div style="display: flex; align-items: center; margin-bottom: 24px; gap: 14px;">
                        <button type="button" class="btn-icon-m3" onclick="window.restaurantMenu.cancelAddDish()" title="${isEn ? 'Back to menu' : 'Volver a la carta'}" style="background: #FFFFFF; border: 1px solid var(--outline-variant, #E5E7EB); box-shadow: 0 2px 6px rgba(0,0,0,0.06); width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
                            <span class="material-symbols-outlined" style="font-size: 20px; color: #374151;">arrow_back</span>
                        </button>
                        <div>
                            <h1 style="margin: 0; font-size: clamp(20px, 3.2vw, 24px); font-weight: 800; color: #111827; display: flex; align-items: center; gap: 8px; letter-spacing: -0.02em;">
                                <span class="material-symbols-outlined" style="color: #10B981; font-size: 26px;">restaurant</span>
                                <span>${isEn ? 'Add New Dish to Menu' : 'Agregar Nuevo Plato a la Carta'}</span>
                            </h1>
                            <p style="margin: 3px 0 0 0; font-size: 13.5px; color: #6B7280;">
                                ${isEn ? `Add seasonal specials, new creations or web updates to ${this.restaurantName || 'the'} food menu.` : `Añade novedades o especiales del chef a la carta de ${this.restaurantName || 'tu restaurante'}.`}
                            </p>
                        </div>
                    </div>

                    <!-- Single Unified M3 Expressive Card -->
                    <div class="menu-form-single-card" style="background: #FFFFFF; border-radius: 24px; border: 1px solid var(--outline-variant, #E5E7EB); box-shadow: 0 4px 20px rgba(0,0,0,0.04); padding: 28px 24px; display: flex; flex-direction: column; gap: 26px;">
                        <!-- Sección 1: Datos principales -->
                        <div>
                            <h3 style="margin: 0 0 16px 0; font-size: 15px; font-weight: 800; color: #1F2937; display: flex; align-items: center; gap: 8px;">
                                <span class="material-symbols-outlined" style="color: #10B981; font-size: 20px;">info</span>
                                <span>${isEn ? 'Dish Details' : 'Información del Plato'}</span>
                            </h3>
                            <div style="display: flex; flex-direction: column; gap: 16px;">
                                <div>
                                    <label style="font-size: 13px; font-weight: 700; color: #374151; display: block; margin-bottom: 6px;">
                                        ${isEn ? 'Dish Name *' : 'Nombre del Plato *'}
                                    </label>
                                    <input type="text" id="newDishName" placeholder="Ej: Truffle Mac & Cheese, Wagyu Steak Tartare..." style="width: 100%; height: 44px; border-radius: 12px; border: 1px solid #D1D5DB; padding: 0 14px; font-family: inherit; font-size: 14px; box-sizing: border-box; background: #FFFFFF; color: #111827;">
                                </div>

                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
                                    <div>
                                        <label style="font-size: 13px; font-weight: 700; color: #374151; display: block; margin-bottom: 6px;">
                                            ${isEn ? 'Price in Pounds (£) *' : 'Precio (£ Libras) *'}
                                        </label>
                                        <div style="position: relative;">
                                            <span style="position: absolute; left: 14px; top: 12px; font-weight: 800; color: #059669; font-size: 15px;">£</span>
                                            <input type="number" step="0.5" id="newDishPrice" placeholder="14.50" style="width: 100%; height: 44px; border-radius: 12px; border: 1px solid #D1D5DB; padding: 0 14px 0 30px; font-family: inherit; font-size: 14.5px; font-weight: 600; box-sizing: border-box; background: #FFFFFF; color: #111827;">
                                        </div>
                                    </div>
                                    <div>
                                        <label style="font-size: 13px; font-weight: 700; color: #374151; display: block; margin-bottom: 6px;">
                                            ${isEn ? 'Category in Menu *' : 'Categoría en la Carta *'}
                                        </label>
                                        <select id="newDishCategory" style="width: 100%; height: 44px; border-radius: 12px; border: 1px solid #D1D5DB; padding: 0 12px; font-family: inherit; font-size: 13.5px; box-sizing: border-box; background: #FFFFFF; color: #111827; cursor: pointer;">
                                            ${categoriesOptions}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <hr style="border: 0; height: 1px; background: #F3F4F6; margin: 0;">

                        <!-- Sección 2: Descripción y Preparación -->
                        <div>
                            <h3 style="margin: 0 0 16px 0; font-size: 15px; font-weight: 800; color: #1F2937; display: flex; align-items: center; gap: 8px;">
                                <span class="material-symbols-outlined" style="color: #10B981; font-size: 20px;">menu_book</span>
                                <span>${isEn ? 'Description & Ingredients' : 'Descripción, Preparación y Guarniciones'}</span>
                            </h3>
                            <div>
                                <label style="font-size: 13px; font-weight: 700; color: #374151; display: block; margin-bottom: 6px;">
                                    ${isEn ? 'Preparation details, ingredients or garnishes' : 'Detalles de la preparación, ingredientes o guarniciones'}
                                </label>
                                <textarea id="newDishDesc" placeholder="${isEn ? 'E.g. Served with roasted rosemary potatoes, red wine jus and seasonal greens...' : 'Ej: Servido con patatas asadas al romero, reducción de vino tinto y verduras de temporada...'}" rows="3" style="width: 100%; border-radius: 12px; border: 1px solid #D1D5DB; padding: 12px 14px; font-family: inherit; font-size: 13.5px; line-height: 1.5; box-sizing: border-box; background: #FFFFFF; color: #111827;"></textarea>
                            </div>
                        </div>

                        <hr style="border: 0; height: 1px; background: #F3F4F6; margin: 0;">

                        <!-- Sección 3: Preferencias Dietéticas (Material 3 Expressive Chips sin contornos) -->
                        <div>
                            <h3 style="margin: 0 0 16px 0; font-size: 15px; font-weight: 800; color: #1F2937; display: flex; align-items: center; gap: 8px;">
                                <span class="material-symbols-outlined" style="color: #10B981; font-size: 20px;">local_florist</span>
                                <span>${isEn ? 'Dietary Preferences & Tags' : 'Preferencias Dietéticas y Etiquetas'}</span>
                            </h3>
                            <div>
                                <label style="font-size: 13px; font-weight: 700; color: #374151; display: block; margin-bottom: 10px;">
                                    ${isEn ? 'Select tags (click to toggle):' : 'Selecciona insignias (haz clic para activar o desactivar):'}
                                </label>
                                <div class="menu-m3-chips-group" id="dishDietaryChips">
                                    <button type="button" class="m3-expressive-chip" data-diet="V" onclick="this.classList.toggle('active'); window.restaurantMenu.updateDishTagsFromChips();">
                                        <span>🌱 Vegetariano (V)</span>
                                    </button>
                                    <button type="button" class="m3-expressive-chip" data-diet="VE" onclick="this.classList.toggle('active'); window.restaurantMenu.updateDishTagsFromChips();">
                                        <span>🌿 Vegano (VE)</span>
                                    </button>
                                    <button type="button" class="m3-expressive-chip" data-diet="GF*" onclick="this.classList.toggle('active'); window.restaurantMenu.updateDishTagsFromChips();">
                                        <span>🌾 Opción Sin Gluten (GF*)</span>
                                    </button>
                                    <button type="button" class="m3-expressive-chip" data-diet="GF" onclick="this.classList.toggle('active'); window.restaurantMenu.updateDishTagsFromChips();">
                                        <span>✨ Sin Gluten (GF)</span>
                                    </button>
                                    <button type="button" class="m3-expressive-chip" data-diet="Hot" onclick="this.classList.toggle('active'); window.restaurantMenu.updateDishTagsFromChips();">
                                        <span>🔥 Picante (Hot)</span>
                                    </button>
                                    <button type="button" class="m3-expressive-chip" data-diet="Bestseller" onclick="this.classList.toggle('active'); window.restaurantMenu.updateDishTagsFromChips();">
                                        <span>⭐ Especial / Popular</span>
                                    </button>
                                </div>
                                <input type="hidden" id="newDishTags" value="">
                            </div>
                        </div>

                        <!-- Bottom Actions -->
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding-top: 14px; border-top: 1px solid #F3F4F6;">
                            <button type="button" class="btn-secondary" onclick="window.restaurantMenu.cancelAddDish()" style="border: none !important; outline: none !important; box-shadow: none !important; background: #F1F5F9; color: #475569; border-radius: 999px; height: 44px; padding: 0 24px; font-size: 14px; font-weight: 600; cursor: pointer;">
                                <span>${isEn ? 'Cancel' : 'Cancelar'}</span>
                            </button>
                            <button type="button" class="btn-primary" onclick="window.restaurantMenu.saveNewDish()" style="border-radius: 999px; height: 44px; padding: 0 26px; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);">
                                <span class="material-symbols-outlined" style="font-size: 20px;">save</span>
                                <span>${isEn ? 'Save Dish to Menu' : 'Guardar Plato en la Carta'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        saveNewDish() {
            const nameEl = document.getElementById('newDishName');
            const priceEl = document.getElementById('newDishPrice');
            const catEl = document.getElementById('newDishCategory');
            const descEl = document.getElementById('newDishDesc');
            const tagsEl = document.getElementById('newDishTags');

            const name = nameEl ? nameEl.value.trim() : '';
            const price = priceEl ? parseFloat(priceEl.value) : 0;
            const categoryId = catEl ? catEl.value : 'mains';
            const desc = descEl ? descEl.value.trim() : '';
            const rawTags = tagsEl ? tagsEl.value : '';

            if (!name) {
                if (window.showActionToast) {
                    window.showActionToast({
                        message: 'Por favor ingresa el nombre del plato.',
                        type: 'error'
                    });
                } else if (window.showToast) {
                    window.showToast('Por favor ingresa el nombre del plato.', 'error');
                }
                if (nameEl) nameEl.focus();
                return;
            }

            const tags = rawTags.split(',').map(t => t.trim()).filter(Boolean);

            const newDish = {
                id: 'custom_' + Date.now(),
                name: name,
                price: isNaN(price) ? 0 : price,
                categoryId: categoryId,
                desc_es: desc,
                desc_en: desc,
                tags: tags,
                allergens: [],
                isCustom: true
            };

            this.customItems.push(newDish);
            this.saveCustomItems();

            // Cerrar formulario
            this.isAddingDish = false;

            // Seleccionar la categoría del plato para que el usuario lo vea inmediatamente
            this.activeCategory = categoryId;

            this.render();

            if (window.showActionToast) {
                window.showActionToast({
                    message: `✅ Plato "${name}" agregado exitosamente a la carta`,
                    type: 'success'
                });
            }
        }

        scrollChips(distance) {
            const container = document.getElementById('menuCategoryChips');
            if (container) {
                container.scrollBy({ left: distance, behavior: 'smooth' });
            }
        }

        handleChipsWheel(e) {
            const container = document.getElementById('menuCategoryChips');
            if (container && (e.deltaY !== 0 || e.deltaX !== 0)) {
                e.preventDefault();
                container.scrollLeft += (e.deltaY || e.deltaX);
            }
        }

        setupChipsDrag() {
            const chips = document.getElementById('menuCategoryChips');
            if (!chips || chips.dataset.dragInitialized) return;
            chips.dataset.dragInitialized = 'true';

            let isDown = false;
            let startX;
            let scrollLeft;

            chips.addEventListener('mousedown', (e) => {
                isDown = true;
                chips.classList.add('is-dragging');
                startX = e.pageX - chips.offsetLeft;
                scrollLeft = chips.scrollLeft;
            });

            chips.addEventListener('mouseleave', () => {
                isDown = false;
                chips.classList.remove('is-dragging');
            });

            chips.addEventListener('mouseup', () => {
                isDown = false;
                chips.classList.remove('is-dragging');
            });

            chips.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - chips.offsetLeft;
                const walk = (x - startX) * 1.5;
                chips.scrollLeft = scrollLeft - walk;
            });
        }

        openDocumentViewer(tab) {
            this.currentDocTab = tab || (this.activeTab === 'sunday' ? 'sunday' : 'main');
            this.docZoom = 1.0;
            this.isViewingDocument = true;
            this.isAddingDish = false;
            // Eliminar modal antiguo si existía
            document.getElementById('menuDocModal')?.remove();
            this.render();
            const main = document.querySelector('.main-content') || window;
            if (main.scrollTo) {
                main.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        closeDocumentViewer() {
            this.isViewingDocument = false;
            this.isAddingDish = false;
            if (window.dashboard && typeof window.dashboard.showMenuView === 'function') {
                window.dashboard.showMenuView();
            } else {
                this.render();
            }
            const main = document.querySelector('.main-content') || window;
            if (main.scrollTo) {
                main.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        renderDocumentView(container) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const isStanley = this.isStanleyOriginal();
            const hasSundayDoc = isStanley || !!this.activeMenu?.doc_sunday_url;
            const restaurantTitle = this.restaurantName || (isEn ? 'Restaurant' : 'Restaurante');

            container.innerHTML = `
                <div class="menu-doc-view-container">
                    <!-- Top Navigation Bar / Breadcrumb -->
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <button type="button" id="btnBackDocViewer" class="btn-icon-m3" onclick="window.restaurantMenu.closeDocumentViewer();" title="${isEn ? 'Back to menu' : 'Volver a la carta'}" style="background: #FFFFFF; border: 1px solid var(--outline-variant, #E5E7EB); box-shadow: 0 2px 6px rgba(0,0,0,0.06); width: 42px; height: 42px; min-width: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; z-index: 10;">
                                <span class="material-symbols-outlined" style="font-size: 22px; color: #1F2937; pointer-events: none;">arrow_back</span>
                            </button>
                            <div>
                                <h1 style="margin: 0; font-size: clamp(19px, 3vw, 24px); font-weight: 800; color: #111827; display: flex; align-items: center; gap: 8px; letter-spacing: -0.02em;">
                                    <span class="material-symbols-outlined" style="color: #DC2626; font-size: 24px;">picture_as_pdf</span>
                                    <span>${isEn ? `Official Menu for ${restaurantTitle}` : `Carta Oficial de ${restaurantTitle} (Documento / Foto)`}</span>
                                </h1>
                                <p style="margin: 3px 0 0 0; font-size: 13px; color: #6B7280;">
                                    ${isEn ? 'View official menu document or upload new photos when kitchen changes.' : 'Visualiza la carta oficial o sube fotos nuevas cuando cambie la carta.'}
                                </p>
                            </div>
                        </div>

                        <!-- Macro Tabs Switcher (Solo si tiene Sunday Roasts o múltiples cartas) -->
                        ${hasSundayDoc ? `
                            <div class="menu-doc-tabs" style="background: #F3F4F6; padding: 4px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;">
                                <button type="button" class="menu-doc-tab-btn ${this.currentDocTab === 'main' ? 'active' : ''}" id="docTabMain" onclick="window.restaurantMenu.switchDocTab('main')">
                                    <span class="material-symbols-outlined" style="font-size: 16px;">restaurant</span>
                                    <span>${isEn ? 'Main Menu' : 'Menú Principal'}</span>
                                </button>
                                <button type="button" class="menu-doc-tab-btn ${this.currentDocTab === 'sunday' ? 'active' : ''}" id="docTabSunday" onclick="window.restaurantMenu.switchDocTab('sunday')">
                                    <span class="material-symbols-outlined" style="font-size: 16px;">outdoor_grill</span>
                                    <span>Sunday Roasts</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Actions & Controls Toolbar -->
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: #FFFFFF; border: 1px solid var(--outline-variant, #E5E7EB); border-radius: 16px 16px 0 0; border-bottom: none; flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <input type="file" id="menuDocFileInput" accept="image/*,application/pdf" style="display: none;" onchange="window.restaurantMenu.handleDocumentUpload(event)">
                            <button type="button" class="btn-primary" onclick="document.getElementById('menuDocFileInput').click()" style="border-radius: 999px; height: 38px; padding: 0 18px; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);">
                                <span class="material-symbols-outlined" style="font-size: 18px;">upload_file</span>
                                <span>${isEn ? 'Upload New Photo or PDF' : 'Subir Nueva Foto o PDF'}</span>
                            </button>
                            <button type="button" id="btnResetDoc" class="btn-secondary" onclick="window.restaurantMenu.resetCurrentDocToDefault()" style="display: none; border-radius: 999px; height: 38px; padding: 0 16px; font-size: 13px; font-weight: 600; align-items: center; gap: 6px;" title="Restaurar o eliminar documento actual">
                                <span class="material-symbols-outlined" style="font-size: 17px;">restore</span>
                                <span>${isEn ? 'Reset / Remove' : 'Restaurar / Eliminar'}</span>
                            </button>
                        </div>

                        <div id="docControlsGroup" style="display: flex; align-items: center; gap: 6px;">
                            <button type="button" id="btnDocZoomOut" class="btn-icon-m3" onclick="window.restaurantMenu.zoomDoc(-0.2)" title="${isEn ? 'Zoom Out' : 'Reducir'}" style="width: 36px; height: 36px; background: #F9FAFB; border: 1px solid #E5E7EB;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">zoom_out</span>
                            </button>
                            <span id="docZoomLevel" style="font-size: 13px; font-weight: 800; color: #374151; min-width: 50px; text-align: center;">100%</span>
                            <button type="button" id="btnDocZoomIn" class="btn-icon-m3" onclick="window.restaurantMenu.zoomDoc(0.2)" title="${isEn ? 'Zoom In' : 'Ampliar'}" style="width: 36px; height: 36px; background: #F9FAFB; border: 1px solid #E5E7EB;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">zoom_in</span>
                            </button>
                            <div style="width: 1px; height: 22px; background: #E5E7EB; margin: 0 4px;"></div>
                            <button type="button" id="btnDocDownload" class="btn-icon-m3" onclick="window.restaurantMenu.downloadCurrentDoc()" title="${isEn ? 'Download file' : 'Descargar archivo'}" style="width: 36px; height: 36px; background: #F9FAFB; border: 1px solid #E5E7EB;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">download</span>
                            </button>
                            <button type="button" id="btnDocNewTab" class="btn-icon-m3" onclick="window.restaurantMenu.openDocInNewTab()" title="${isEn ? 'Open in new window' : 'Abrir en nueva ventana'}" style="width: 36px; height: 36px; background: #F9FAFB; border: 1px solid #E5E7EB;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">open_in_new</span>
                            </button>
                        </div>
                    </div>

                    <!-- Adapted Viewport inside System -->
                    <div class="menu-doc-viewport" id="docViewport" style="background: #FFFFFF; min-height: auto; border-radius: 0 0 16px 16px; border: 1px solid var(--outline-variant, #E5E7EB); box-shadow: 0 4px 16px rgba(0,0,0,0.04); position: relative;">
                        <div id="docViewerLoading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #4B5563; min-height: 220px; padding: 30px 0;">
                            <div class="spinner-sm" style="border-top-color: #10B981;"></div>
                            <span style="font-size: 14px; font-weight: 600;">${isEn ? 'Loading menu document...' : 'Cargando documento de la carta...'}</span>
                        </div>
                        <canvas id="docViewerCanvas" style="display: none;"></canvas>
                        <img id="docViewerImage" style="display: none;" alt="Carta ${restaurantTitle}">
                    </div>
                </div>
            `;

            const backBtn = container.querySelector('#btnBackDocViewer');
            if (backBtn) {
                backBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeDocumentViewer();
                });
            }

            this.loadCurrentDocument();
        }

        switchDocTab(tab) {
            this.currentDocTab = tab;
            document.querySelectorAll('.menu-doc-tab-btn').forEach(btn => btn.classList.remove('active'));
            if (tab === 'main') {
                document.getElementById('docTabMain')?.classList.add('active');
            } else {
                document.getElementById('docTabSunday')?.classList.add('active');
            }
            this.docZoom = 1.0;
            const zEl = document.getElementById('docZoomLevel');
            if (zEl) zEl.textContent = '100%';
            this.loadCurrentDocument();
        }

        async loadCurrentDocument() {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const loadingEl = document.getElementById('docViewerLoading');
            const canvasEl = document.getElementById('docViewerCanvas');
            const imgEl = document.getElementById('docViewerImage');
            const resetBtn = document.getElementById('btnResetDoc');
            const controlsGroup = document.getElementById('docControlsGroup');

            // Eliminar estado vacío previo si existía
            const oldEmpty = document.getElementById('docViewerEmptyState');
            if (oldEmpty) oldEmpty.remove();

            if (loadingEl) loadingEl.style.display = 'flex';
            if (canvasEl) canvasEl.style.display = 'none';
            if (imgEl) imgEl.style.display = 'none';

            try {
                const isSunday = this.currentDocTab === 'sunday';
                let docUrl = isSunday ? this.activeMenu?.doc_sunday_url : this.activeMenu?.doc_main_url;
                let docType = isSunday ? this.activeMenu?.doc_sunday_type : this.activeMenu?.doc_main_type;
                let docName = isSunday ? this.activeMenu?.doc_sunday_name : this.activeMenu?.doc_main_name;

                // Solo el restaurante original de Alan (Stanley's) tiene los PDFs de fallback
                if (!docUrl && this.isStanleyOriginal()) {
                    docUrl = isSunday ? 'assets/pdf/stanleys-sunday-menu.pdf' : 'assets/pdf/stanleys-main-menu.pdf';
                    docType = 'application/pdf';
                    docName = isSunday ? 'stanleys-sunday-menu.pdf' : 'stanleys-main-menu.pdf';
                }

                // SI NO HAY DOCUMENTO SUBIDO: Mostrar estado vacío limpio y amigable
                if (!docUrl) {
                    if (loadingEl) loadingEl.style.display = 'none';
                    if (canvasEl) canvasEl.style.display = 'none';
                    if (imgEl) imgEl.style.display = 'none';
                    if (resetBtn) resetBtn.style.display = 'none';
                    if (controlsGroup) controlsGroup.style.opacity = '0.35';

                    this.activeDocFile = null;

                    const vp = document.getElementById('docViewport');
                    if (vp) {
                        const emptyDiv = document.createElement('div');
                        emptyDiv.id = 'docViewerEmptyState';
                        emptyDiv.style.cssText = 'padding: 55px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; width: 100%; box-sizing: border-box;';
                        emptyDiv.innerHTML = `
                            <div style="width: 76px; height: 76px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; color: #6B7280; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                                <span class="material-symbols-outlined" style="font-size: 38px; color: #4B5563;">upload_file</span>
                            </div>
                            <div style="max-width: 460px;">
                                <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 800; color: #111827;">
                                    ${isEn ? 'No official menu document uploaded yet' : 'Aún no hay carta oficial subida'}
                                </h3>
                                <p style="margin: 0; font-size: 13.5px; color: #6B7280; line-height: 1.5;">
                                    ${isEn ? 'Upload the official PDF or photo of this restaurant menu so your team can consult the original printed version at any time.' : 'Sube la carta oficial de tu restaurante en formato PDF o foto para que tu equipo pueda consultarla en cualquier momento.'}
                                </p>
                            </div>
                            ${(this.isOwner || this.permission === 'edit') ? `
                                <button type="button" class="btn-primary" onclick="document.getElementById('menuDocFileInput').click()" style="border-radius: 999px; height: 42px; padding: 0 24px; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                                    <span class="material-symbols-outlined" style="font-size: 20px;">upload_file</span>
                                    <span>${isEn ? 'Upload Menu (PDF / Photo)' : 'Subir Carta Oficial (PDF o Foto)'}</span>
                                </button>
                            ` : `
                                <p style="margin: 6px 0 0 0; font-size: 13px; color: #9CA3AF; font-style: italic;">
                                    ${isEn ? 'The restaurant owner has not uploaded an official menu document yet.' : 'El propietario del restaurante aún no ha subido la carta oficial.'}
                                </p>
                            `}
                        `;
                        vp.appendChild(emptyDiv);
                    }
                    return;
                }

                // SI HAY DOCUMENTO: Habilitar controles
                if (controlsGroup) controlsGroup.style.opacity = '1';

                if (resetBtn) {
                    const isCustom = docUrl && !docUrl.startsWith('assets/');
                    resetBtn.style.display = (isCustom && (this.isOwner || this.permission === 'edit')) ? 'inline-flex' : 'none';
                }

                this.activeDocFile = { type: docType, dataUrl: docUrl, name: docName };

                const isImage = (docType && docType.startsWith('image/')) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(docUrl);

                if (isImage) {
                    if (imgEl) {
                        imgEl.src = docUrl;
                        imgEl.style.display = 'block';
                        imgEl.style.transform = `scale(${this.docZoom})`;
                    }
                    if (loadingEl) loadingEl.style.display = 'none';
                } else {
                    await this.renderPdfDoc(docUrl);
                }
            } catch (err) {
                console.error('Error loading menu document:', err);
                if (loadingEl) {
                    loadingEl.innerHTML = `
                        <span class="material-symbols-outlined" style="font-size: 36px; color: #EF4444;">error</span>
                        <p style="margin: 4px 0 0 0; font-size: 13px;">No se pudo cargar la vista previa.</p>
                        <a href="${this.activeDocFile ? this.activeDocFile.dataUrl : '#'}" download class="btn-secondary" style="margin-top: 10px; border-radius: 999px;">Descargar archivo</a>
                    `;
                }
            }
        }

        async renderPdfDoc(srcOrData) {
            const loadingEl = document.getElementById('docViewerLoading');
            const canvasEl = document.getElementById('docViewerCanvas');
            if (!canvasEl) return;

            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/lib/pdf.worker.min.js';
                const loadingTask = window.pdfjsLib.getDocument(srcOrData);
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                const scale = 1.8;
                const viewport = page.getViewport({ scale: scale });

                canvasEl.width = viewport.width;
                canvasEl.height = viewport.height;
                const renderContext = {
                    canvasContext: canvasEl.getContext('2d'),
                    viewport: viewport
                };
                await page.render(renderContext).promise;

                if (loadingEl) loadingEl.style.display = 'none';
                canvasEl.style.display = 'block';
                canvasEl.style.transform = `scale(${this.docZoom})`;
            } else {
                // Fallback embebido
                const vp = document.getElementById('docViewport');
                if (vp) {
                    vp.innerHTML = `<iframe src="${srcOrData}" style="width: 100%; height: 100%; border: none; min-height: 600px;"></iframe>`;
                }
            }
        }

        async handleDocumentUpload(e) {
            const file = e.target && e.target.files && e.target.files[0];
            if (!file) return;

            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const sb = window.supabaseClient;
            if (!sb) {
                if (window.showActionToast) {
                    window.showActionToast({
                        message: isEn ? 'Server connection not available' : 'No se pudo conectar con el servidor',
                        type: 'error'
                    });
                }
                return;
            }

            if (window.showActionToast) {
                window.showActionToast({
                    message: isEn ? '⏳ Uploading menu document to cloud...' : '⏳ Subiendo documento a la nube...',
                    type: 'info'
                });
            }

            try {
                const fileExt = file.name.split('.').pop();
                const menuId = this.activeMenu?.id || 'default';
                const fileName = `menu_${menuId}_${this.currentDocTab}_${Date.now()}.${fileExt}`;

                const { data: uploadData, error: uploadErr } = await sb.storage
                    .from('menu-files')
                    .upload(fileName, file, { cacheControl: '3600', upsert: true });

                if (uploadErr) {
                    console.error('Error uploading menu doc to storage:', uploadErr);
                    throw uploadErr;
                }

                const { data: { publicUrl } } = sb.storage.from('menu-files').getPublicUrl(fileName);

                const isSunday = this.currentDocTab === 'sunday';
                const updatePayload = isSunday 
                    ? { doc_sunday_url: publicUrl, doc_sunday_name: file.name, doc_sunday_type: file.type, updated_at: new Date().toISOString() }
                    : { doc_main_url: publicUrl, doc_main_name: file.name, doc_main_type: file.type, updated_at: new Date().toISOString() };

                if (this.activeMenu?.id) {
                    await sb.from('restaurant_menus')
                        .update(updatePayload)
                        .eq('id', this.activeMenu.id);

                    if (isSunday) {
                        this.activeMenu.doc_sunday_url = publicUrl;
                        this.activeMenu.doc_sunday_name = file.name;
                        this.activeMenu.doc_sunday_type = file.type;
                    } else {
                        this.activeMenu.doc_main_url = publicUrl;
                        this.activeMenu.doc_main_name = file.name;
                        this.activeMenu.doc_main_type = file.type;
                    }
                }

                this.loadCurrentDocument();

                if (window.showActionToast) {
                    window.showActionToast({
                        message: isEn ? '✅ Official menu document updated and synchronized!' : '✅ Carta oficial actualizada en la nube y sincronizada para todos los usuarios',
                        type: 'success'
                    });
                }
            } catch (err) {
                console.error('Error al subir documento del menú:', err);
                if (window.showActionToast) {
                    window.showActionToast({
                        message: isEn ? '❌ Could not upload document' : '❌ Error al subir documento a la nube',
                        type: 'error'
                    });
                }
            }
        }

        async resetCurrentDocToDefault() {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const isStanley = this.isStanleyOriginal();
            const msg = isStanley 
                ? (isEn ? 'Reset to the official original menu document?' : '¿Deseas restaurar la carta oficial original?')
                : (isEn ? 'Remove this uploaded menu document?' : '¿Deseas eliminar este documento subido?');

            const doReset = async () => {
                try {
                    const isSunday = this.currentDocTab === 'sunday';
                    const defaultUrl = isStanley ? (isSunday ? 'assets/pdf/stanleys-sunday-menu.pdf' : 'assets/pdf/stanleys-main-menu.pdf') : null;
                    const defaultName = isStanley ? (isSunday ? 'stanleys-sunday-menu.pdf' : 'stanleys-main-menu.pdf') : null;
                    const defaultType = isStanley ? 'application/pdf' : null;

                    const updatePayload = isSunday 
                        ? { doc_sunday_url: defaultUrl, doc_sunday_name: defaultName, doc_sunday_type: defaultType, updated_at: new Date().toISOString() }
                        : { doc_main_url: defaultUrl, doc_main_name: defaultName, doc_main_type: defaultType, updated_at: new Date().toISOString() };

                    if (this.activeMenu?.id && window.supabaseClient) {
                        await window.supabaseClient.from('restaurant_menus').update(updatePayload).eq('id', this.activeMenu.id);
                        if (isSunday) {
                            this.activeMenu.doc_sunday_url = defaultUrl;
                            this.activeMenu.doc_sunday_name = defaultName;
                            this.activeMenu.doc_sunday_type = defaultType;
                        } else {
                            this.activeMenu.doc_main_url = defaultUrl;
                            this.activeMenu.doc_main_name = defaultName;
                            this.activeMenu.doc_main_type = defaultType;
                        }
                    }

                    this.loadCurrentDocument();
                    if (window.showActionToast) {
                        window.showActionToast({
                            message: isStanley 
                                ? (isEn ? '✅ Original menu document restored' : '✅ Carta oficial original restaurada')
                                : (isEn ? '✅ Menu document removed' : '✅ Documento de la carta eliminado'),
                            type: 'success'
                        });
                    }
                } catch (e) {
                    console.error('Error resetting doc:', e);
                }
            };

            if (window.showActionToast) {
                window.showActionToast({
                    message: msg,
                    actionText: isStanley ? (isEn ? 'Reset' : 'Restaurar') : (isEn ? 'Remove' : 'Eliminar'),
                    cancelText: isEn ? 'Cancel' : 'Cancelar',
                    actionColor: isStanley ? '#10B981' : '#EF4444',
                    onConfirm: doReset
                });
            } else {
                doReset();
            }
        }

        zoomDoc(delta) {
            this.docZoom = Math.max(0.6, Math.min(2.8, parseFloat(((this.docZoom || 1) + delta).toFixed(2))));
            const zEl = document.getElementById('docZoomLevel');
            if (zEl) zEl.textContent = Math.round(this.docZoom * 100) + '%';

            const canvasEl = document.getElementById('docViewerCanvas');
            if (canvasEl && canvasEl.style.display !== 'none') {
                canvasEl.style.transform = `scale(${this.docZoom})`;
            }
            const imgEl = document.getElementById('docViewerImage');
            if (imgEl && imgEl.style.display !== 'none') {
                imgEl.style.transform = `scale(${this.docZoom})`;
            }
        }

        downloadCurrentDoc() {
            if (!this.activeDocFile || !this.activeDocFile.dataUrl) return;
            const a = document.createElement('a');
            a.href = this.activeDocFile.dataUrl;
            const fallbackName = `${(this.restaurantName || 'carta').toLowerCase().replace(/\s+/g, '_')}_${this.currentDocTab}.pdf`;
            a.download = this.activeDocFile.name || fallbackName;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }

        openDocInNewTab() {
            if (!this.activeDocFile || !this.activeDocFile.dataUrl) return;
            window.open(this.activeDocFile.dataUrl, '_blank');
        }

        showHelpModal() {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const modalHtml = `
                <div id="menuHelpModal" class="modal-overlay" style="display: flex; z-index: 99999; background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(6px); padding: 16px; align-items: center; justify-content: center;">
                    <div class="menu-modal-card">
                        <div class="modal-header">
                            <div class="header-info">
                                <h3 style="margin: 0; font-size: 16.5px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                                    <span class="material-symbols-outlined" style="color: #2563EB; font-size: 20px;">help</span>
                                    <span>${isEn ? 'How do updates & new dishes work?' : '¿Cómo se actualiza la carta?'}</span>
                                </h3>
                                <p style="margin: 2px 0 0 0; font-size: 12px; color: #666;">
                                    ${isEn ? 'Guide for menu updates and kitchen availability.' : 'Guía de actualización y disponibilidad en cocina.'}
                                </p>
                            </div>
                            <button class="btn-close-modal" onclick="document.getElementById('menuHelpModal').remove()">
                                <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
                            </button>
                        </div>
                        <div class="modal-body" style="display: flex; flex-direction: column; gap: 10px;">
                            <div class="menu-help-item">
                                <div class="menu-help-icon-wrap" style="background: #ECFDF5; color: #059669;">
                                    <span class="material-symbols-outlined" style="font-size: 19px;">add_circle</span>
                                </div>
                                <div>
                                    <h4 style="margin: 0 0 2px 0; font-size: 13.5px; font-weight: 700; color: #111827;">
                                        ${isEn ? '1. Add New Dishes' : '1. Agregar Nuevos Platos'}
                                    </h4>
                                    <p style="margin: 0; font-size: 12.5px; color: #4B5563; line-height: 1.4;">
                                        ${isEn 
                                            ? 'Click the <strong>"+ Add New Dish"</strong> button at the top to add any seasonal special or newly introduced dish.' 
                                            : 'Usa el botón <strong>"+ Agregar Plato"</strong> en la parte superior para añadir novedades o especiales de temporada.'}
                                    </p>
                                </div>
                            </div>

                            <div class="menu-help-item">
                                <div class="menu-help-icon-wrap" style="background: #FEF2F2; color: #DC2626;">
                                    <span class="material-symbols-outlined" style="font-size: 19px;">delete</span>
                                </div>
                                <div>
                                    <h4 style="margin: 0 0 2px 0; font-size: 13.5px; font-weight: 700; color: #111827;">
                                        ${isEn ? '2. Remove Outdated Dishes' : '2. Quitar Platos Retirados'}
                                    </h4>
                                    <p style="margin: 0; font-size: 12.5px; color: #4B5563; line-height: 1.4;">
                                        ${isEn 
                                            ? 'Click the <strong>trash icon</strong> at the bottom of any dish card to remove it from the active menu.' 
                                            : 'Haz clic en el icono de <strong>papelera</strong> en la tarjeta del plato para retirarlo de la carta activa.'}
                                    </p>
                                </div>
                            </div>

                            <div class="menu-help-item">
                                <div class="menu-help-icon-wrap" style="background: #FFFBEB; color: #D97706;">
                                    <span class="material-symbols-outlined" style="font-size: 19px;">do_not_disturb_on</span>
                                </div>
                                <div>
                                    <h4 style="margin: 0 0 2px 0; font-size: 13.5px; font-weight: 700; color: #111827;">
                                        ${isEn ? '3. Out of Stock / 86 (Kitchen Service)' : '3. Agotado / 86 (Servicio Diario)'}
                                    </h4>
                                    <p style="margin: 0; font-size: 12.5px; color: #4B5563; line-height: 1.4;">
                                        ${isEn 
                                            ? 'Click the <strong>"86"</strong> button on any dish to mark it temporarily out of stock for the shift without deleting it.' 
                                            : 'Usa el botón <strong>"86"</strong> en cualquier plato para marcarlo como agotado en cocina durante el servicio sin tener que borrarlo.'}
                                    </p>
                                </div>
                            </div>

                            <div class="menu-help-item">
                                <div class="menu-help-icon-wrap" style="background: #FFFBEB; color: #D97706;">
                                    <span class="material-symbols-outlined" style="font-size: 19px;">visibility_off</span>
                                </div>
                                <div>
                                    <h4 style="margin: 0 0 2px 0; font-size: 13.5px; font-weight: 700; color: #111827;">
                                        ${isEn ? '4. Dishes Off Menu' : '4. Platos Fuera del Menú'}
                                    </h4>
                                    <p style="margin: 0; font-size: 12.5px; color: #4B5563; line-height: 1.4;">
                                        ${isEn 
                                            ? 'If you remove dishes, click "Dishes Off Menu" to view them and restore any dish back to the menu whenever you want.' 
                                            : 'Si retiras platos de la carta, pulsa "Platos Fuera del Menú" para verlos y devolver individualmente cualquiera de ellos en cualquier momento.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn-m3-expressive" onclick="document.getElementById('menuHelpModal').remove()">
                                <span class="material-symbols-outlined" style="font-size: 19px;">check</span>
                                <span>${isEn ? 'Got It' : 'Entendido'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        getRemovedItems() {
            const isStanley = this.isStanleyOriginal();
            const sectionsToUse = (this.sections && this.sections.length > 0)
                ? this.sections
                : (isStanley ? (window.STANLEYS_MENU_DATA?.sections || []) : []);
            const removedSet = new Set(this.removedItemIds);
            const result = [];

            sectionsToUse.forEach(section => {
                (section.categories || []).forEach(cat => {
                    (cat.items || []).forEach(item => {
                        if (removedSet.has(item.id)) {
                            result.push({
                                ...item,
                                categoryName_es: cat.name_es,
                                categoryName_en: cat.name_en,
                                categoryIcon: cat.icon || 'restaurant',
                                sectionName_es: section.name_es,
                                sectionName_en: section.name_en
                            });
                        }
                    });
                });
            });

            (this.customItems || []).forEach(item => {
                if (removedSet.has(item.id)) {
                    result.push({
                        ...item,
                        categoryName_es: item.categoryName_es || 'Personalizados',
                        categoryName_en: item.categoryName_en || 'Custom',
                        categoryIcon: item.categoryIcon || 'restaurant'
                    });
                }
            });

            return result;
        }

        closeRemovedItemsModal() {
            const modal = document.getElementById('menuRemovedItemsModal');
            if (modal) modal.remove();
        }

        restoreMenuItem(itemId, itemName) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            this.removedItemIds = this.removedItemIds.filter(id => id !== itemId);
            this.saveRemovedItems();
            this.render();

            if (this.removedItemIds.length > 0) {
                this.showRemovedItemsModal();
            } else {
                this.closeRemovedItemsModal();
            }

            const notify = window.showToast || (window.utils && window.utils.showToast);
            if (notify) {
                notify(isEn ? `"${itemName || 'Dish'}" moved back to the menu` : `"${itemName || 'Plato'}" regresado a la carta`, 'success');
            }
        }

        restoreAllRemovedItems() {
            this.resetOriginalMenu();
            this.closeRemovedItemsModal();
        }

        showRemovedItemsModal() {
            this.closeRemovedItemsModal();
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const removedItems = this.getRemovedItems();

            const modalHtml = `
                <div id="menuRemovedItemsModal" class="modal-overlay" style="display: flex; z-index: 99999; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(8px); padding: 16px; align-items: center; justify-content: center;">
                    <div class="menu-modal-card" style="max-width: 580px; width: min(580px, calc(100vw - 28px)); max-height: min(88vh, 650px);">
                        <div class="modal-header">
                            <div class="header-info">
                                <h3 style="margin: 0; font-size: 16.5px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                                    <span class="material-symbols-outlined" style="color: #D97706; font-size: 22px;">visibility_off</span>
                                    <span>${isEn ? 'Dishes Off Menu' : 'Platos Fuera del Menú'}</span>
                                    <span class="chip-count" style="background: #FEE2E2; color: #DC2626; font-size: 12px; padding: 2px 8px; border-radius: 999px; font-weight: 800;">${removedItems.length}</span>
                                </h3>
                                <p style="margin: 2px 0 0 0; font-size: 12px; color: #666;">
                                    ${isEn 
                                        ? 'Dishes currently excluded from the menu. Click "Return to Menu" to put any dish back.' 
                                        : 'Platos retirados de la carta activa. Pulsa "Regresar a la carta" en el plato que quieras recuperar.'}
                                </p>
                            </div>
                            <button class="btn-close-modal" onclick="window.restaurantMenu.closeRemovedItemsModal()" aria-label="${isEn ? 'Close' : 'Cerrar'}">
                                <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
                            </button>
                        </div>
                        <div class="modal-body" style="padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto;">
                            ${removedItems.length === 0 ? `
                                <div style="text-align: center; padding: 36px 16px; color: #64748B;">
                                    <span class="material-symbols-outlined" style="font-size: 48px; color: #10B981; display: block; margin-bottom: 8px;">task_alt</span>
                                    <strong style="display: block; font-size: 15px; color: #0F172A; margin-bottom: 4px;">
                                        ${isEn ? 'All dishes are in the active menu' : 'Todos los platos están en la carta activa'}
                                    </strong>
                                    <span style="font-size: 13px;">${isEn ? 'No dishes are marked as off menu.' : 'No tienes platos fuera de la carta en este momento.'}</span>
                                </div>
                            ` : removedItems.map(item => `
                                <div class="removed-dish-item" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 14px; transition: all 0.15s ease;">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px; flex-wrap: wrap;">
                                            <strong style="color: #0F172A; font-size: 14px;">${item.name}</strong>
                                            ${item.categoryName_es ? `
                                                <span style="font-size: 11px; font-weight: 700; color: #475569; background: #E2E8F0; padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                                                    <span class="material-symbols-outlined" style="font-size: 13px;">${item.categoryIcon || 'restaurant'}</span>
                                                    <span>${isEn ? item.categoryName_en : item.categoryName_es}</span>
                                                </span>
                                            ` : ''}
                                            <span style="font-size: 12px; font-weight: 700; color: #059669;">£${(item.price || 0).toFixed(2)}</span>
                                        </div>
                                        ${(isEn ? item.desc_en : item.desc_es) ? `
                                            <p style="margin: 0; font-size: 12px; color: #64748B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                ${isEn ? item.desc_en : item.desc_es}
                                            </p>
                                        ` : ''}
                                    </div>
                                    <button 
                                        type="button" 
                                        onclick="window.restaurantMenu.restoreMenuItem('${item.id}', '${(item.name || '').replace(/'/g, "\\'")}')" 
                                        title="${isEn ? 'Move this dish back to the active menu' : 'Regresar este plato a la carta activa'}"
                                        style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: #ECFDF5; color: #047857; border: 1.5px solid #A7F3D0; border-radius: 10px; font-weight: 700; font-size: 12.5px; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all 0.2s ease;"
                                        onmouseover="this.style.background='#D1FAE5'; this.style.borderColor='#059669';"
                                        onmouseout="this.style.background='#ECFDF5'; this.style.borderColor='#A7F3D0';"
                                    >
                                        <span class="material-symbols-outlined" style="font-size: 17px;">keyboard_return</span>
                                        <span>${isEn ? 'Return to Menu' : 'Regresar a la carta'}</span>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px;">
                            ${removedItems.length > 1 ? `
                                <button type="button" onclick="window.restaurantMenu.restoreAllRemovedItems()" style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer;">
                                    <span class="material-symbols-outlined" style="font-size: 16px;">restore</span>
                                    <span>${isEn ? 'Restore All Dishes' : 'Regresar todos a la carta'}</span>
                                </button>
                            ` : '<div></div>'}
                            <button class="btn-m3-expressive" onclick="window.restaurantMenu.closeRemovedItemsModal()">
                                <span class="material-symbols-outlined" style="font-size: 18px;">check</span>
                                <span>${isEn ? 'Done' : 'Listo'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        render() {
            const container = document.getElementById(this.containerId);
            if (!container) return;

            const isEn = window.i18n && window.i18n.getLang() === 'en';

            if (!this.hasMenu) {
                if (this.isLoading) {
                    container.innerHTML = `
                        <div class="allergens-module menu-module-container" style="padding: 24px 0;">
                            <div class="menu-hero-card" style="text-align: center; padding: 64px 24px; background: #FFFFFF; border-radius: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); border: 1px solid #E2E8F0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 280px;">
                                <div style="width: 58px; height: 58px; border-radius: 50%; background: #EFF6FF; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(37,99,235,0.12);">
                                    <div class="spinner-sm" style="border-top-color: #2563EB; width: 28px; height: 28px; border-width: 3px;"></div>
                                </div>
                                <h3 style="font-size: 19px; font-weight: 800; color: #0F172A; margin: 0 0 6px 0; letter-spacing: -0.01em;">
                                    ${isEn ? 'Loading Restaurant Menu...' : 'Cargando Carta de Restaurante...'}
                                </h3>
                                <p style="color: #64748B; font-size: 14px; margin: 0; max-width: 440px; line-height: 1.5;">
                                    ${isEn ? 'Verifying kitchen status and preparing active dishes...' : 'Sincronizando información de la carta y platos activos...'}
                                </p>
                            </div>
                        </div>
                    `;
                    return;
                }

                container.innerHTML = `
                    <div class="allergens-module menu-module-container">
                        <div class="menu-hero-card" style="text-align: center; padding: 56px 24px; background: #FFFFFF; border-radius: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); border: 1px solid #E2E8F0;">
                            <div style="width: 80px; height: 80px; margin: 0 auto 20px auto; border-radius: 50%; background: #EFF6FF; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(37,99,235,0.12);">
                                <span class="material-symbols-outlined" style="font-size: 42px; color: #2563EB;">storefront</span>
                            </div>
                            <h2 style="font-size: 24px; font-weight: 900; color: #0F172A; margin: 0 0 10px 0; letter-spacing: -0.02em;">
                                ${isEn ? 'No Restaurant Menu Active' : 'No tienes una carta de restaurante activa'}
                            </h2>
                            <p style="color: #64748B; font-size: 15px; max-width: 540px; margin: 0 auto 28px auto; line-height: 1.6;">
                                ${isEn 
                                    ? 'Start by creating your restaurant menu or ask your team owner to share their menu with you. Your recipes and private space remain 100% independent.' 
                                    : 'Empieza creando la carta de tu restaurante o solicita al propietario de tu cocina que comparta su menú contigo. Tus recetas y tu espacio personal se mantienen 100% independientes.'}
                            </p>
                            <div style="display: flex; align-items: center; justify-content: center;">
                                <button type="button" class="btn-primary" onclick="window.restaurantMenu.openCreateMenuModal()" style="border-radius: 999px; height: 46px; padding: 0 28px; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);">
                                    <span class="material-symbols-outlined" style="font-size: 20px;">add_circle</span>
                                    <span>${isEn ? 'Create Restaurant Menu' : 'Crear Carta de Restaurante'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            if (this.isAddingDish) {
                this.renderAddDishForm(container);
                return;
            }

            if (this.isViewingDocument) {
                this.renderDocumentView(container);
                return;
            }

            const info = this.info || {};
            const allSections = this.getAllSections();

            // Filtrar secciones según tab
            let sectionsToDisplay = [];
            if (this.activeTab === 'main') {
                sectionsToDisplay = allSections.filter(s => s.id === 'main');
            } else if (this.activeTab === 'sunday') {
                sectionsToDisplay = allSections.filter(s => s.id === 'sunday');
            } else {
                sectionsToDisplay = allSections; // 'all' -> Muestra absolutamente todo
            }

            // Total general en la carta completa
            let totalDishesAll = 0;
            let mainDishesCount = 0;
            let sundayDishesCount = 0;

            allSections.forEach(sec => {
                (sec.categories || []).forEach(cat => {
                    const cCount = (cat.items || []).length;
                    totalDishesAll += cCount;
                    if (sec.id === 'main') mainDishesCount += cCount;
                    if (sec.id === 'sunday') sundayDishesCount += cCount;
                });
            });

            // Contabilizar items y categorías exclusivas del tab activo actual
            let currentTabDishes = 0;
            let outOfStockCount = 0;
            const categoryList = [];

            sectionsToDisplay.forEach(sec => {
                (sec.categories || []).forEach(cat => {
                    const count = (cat.items || []).length;
                    currentTabDishes += count;
                    (cat.items || []).forEach(it => {
                        if (!this.isAvailable(it.id)) outOfStockCount++;
                    });
                    categoryList.push({
                        id: cat.id,
                        name: isEn ? cat.name_en : cat.name_es,
                        icon: cat.icon || 'restaurant',
                        count: count,
                        sectionId: sec.id
                    });
                });
            });

            // Asegurar que si la categoría activa no pertenece al menú actual, se reinicie a 'all'
            if (this.activeCategory !== 'all' && !categoryList.some(c => c.id === this.activeCategory)) {
                this.activeCategory = 'all';
            }

            const isStanley = this.isStanleyOriginal();
            const defaultLogo = isStanley ? 'assets/images/stanleys-logo.png' : 'assets/icons/favicon-196.png';
            const logoSrc = this.logoUrl || defaultLogo;
            const website = this.websiteUrl || (isStanley ? (info.website || 'https://www.stanleyssw16.com/food') : null);

            let html = `
                <div class="allergens-module menu-module-container">
                    <!-- Modern Header Banner -->
                    <div class="menu-hero-card">
                        <!-- Botón de Ayuda circular en esquina superior derecha -->
                        <button type="button" class="menu-hero-help-btn" onclick="window.restaurantMenu.showHelpModal()" title="${isEn ? 'How updates and dishes work' : '¿Cómo funciona la gestión del menú?'}" aria-label="${isEn ? 'Help' : 'Ayuda'}">
                            <span class="material-symbols-outlined">help</span>
                        </button>

                        <!-- Header Top Row (Logo, Website, Name & Badge) -->
                        <div class="allergens-hero-top-row" style="align-items: center;">
                            ${website ? `
                                <a href="${website}" target="_blank" rel="noopener noreferrer" class="menu-hero-logo" title="${isEn ? 'Visit official website' : 'Visitar página web oficial'}" style="text-decoration: none; cursor: pointer; display: inline-flex; width: 62px; height: 62px; border-radius: 16px; overflow: hidden; background: #FFFFFF; border: 1.5px solid #E2E8F0; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); padding: 4px; box-sizing: border-box;">
                                    <img src="${logoSrc}" alt="${this.restaurantName}" style="width: 100%; height: 100%; object-fit: contain;">
                                </a>
                            ` : `
                                <div class="menu-hero-logo" title="${this.restaurantName}" style="display: inline-flex; cursor: default; width: 62px; height: 62px; border-radius: 16px; overflow: hidden; background: #FFFFFF; border: 1.5px solid #E2E8F0; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); padding: 4px; box-sizing: border-box;">
                                    <img src="${logoSrc}" alt="${this.restaurantName}" style="width: 100%; height: 100%; object-fit: contain;">
                                </div>
                            `}
                            <div class="allergens-hero-heading-block" style="flex: 1;">
                                <div class="menu-hero-badge-row" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <span class="m3-uk-fsa-badge" style="background: #EFF6FF; color: #1E40AF; font-weight: 800;">
                                        ${totalDishesAll} ${isEn ? 'Active Dishes' : 'Platos Activos'}
                                    </span>
                                    ${this.isOwner ? `
                                        <span class="m3-uk-fsa-badge" style="background: #FEF3C7; color: #92400E; font-weight: 800;">
                                            👑 ${isEn ? 'Owner' : 'Propietario'}
                                        </span>
                                    ` : ''}
                                    ${this.isShared ? `
                                        <span class="m3-uk-fsa-badge" style="background: #E0E7FF; color: #3730A3; font-weight: 800;">
                                            👥 ${isEn ? 'Collaborator' : 'Colaborador'}
                                        </span>
                                    ` : ''}
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <h1 style="margin: 4px 0 2px 0; font-size: clamp(22px, 3.5vw, 28px); font-weight: 900; color: #111827; letter-spacing: -0.02em;">
                                        ${this.restaurantName || (isEn ? 'Food Menu' : 'Carta de Comida')}
                                    </h1>
                                    ${this.isOwner ? `
                                        <button type="button" onclick="window.restaurantMenu.openEditMenuModal()" title="${isEn ? 'Edit restaurant details (name, logo, web)' : 'Editar restaurante (nombre, logo, web)'}" style="background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 50%; width: 32px; height: 32px; min-width: 32px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #475569; transition: all 0.2s;" onmouseenter="this.style.background='#E2E8F0'" onmouseleave="this.style.background='#F1F5F9'">
                                            <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
                                        </button>
                                    ` : ''}
                                </div>
                                <p style="margin: 0; font-size: 13.5px; color: #4B5563;">
                                    ${isEn ? 'Complete digital restaurant menu. Dishes can be marked out-of-stock (86) or updated dynamically.' : 'Carta digital completa y abierta. Puedes marcar platos agotados (86) o agregar novedades cuando cambie la web.'}
                                </p>
                            </div>
                        </div>

                        <!-- Header Action Buttons -->
                        <div class="menu-hero-actions">
                            ${this.isOwner ? `
                                <button type="button" class="menu-action-pill" onclick="window.restaurantMenu.shareRestaurantMenu()" title="${isEn ? 'Share menu and allergen matrix with your kitchen team' : 'Compartir carta y matriz de alérgenos con tu equipo'}" style="background: #ECFDF5; color: #065F46; border: 1.5px solid #A7F3D0; font-weight: 700;">
                                    <span class="material-symbols-outlined" style="font-size: 18px; color: #059669;">group_add</span>
                                    <span>${isEn ? 'Share with Team' : 'Compartir con Equipo'}</span>
                                </button>
                                <button type="button" class="menu-action-pill" onclick="window.restaurantMenu.confirmDeleteRestaurantMenu()" title="${isEn ? 'Permanently delete this restaurant menu and clear space' : 'Eliminar permanentemente esta carta y dejar el espacio vacío'}" style="background: #FFF1F2; color: #E11D48; border: 1.5px solid #FECDD3; font-weight: 700;">
                                    <span class="material-symbols-outlined" style="font-size: 17px; color: #E11D48;">delete</span>
                                    <span>${isEn ? 'Delete Menu' : 'Eliminar Carta'}</span>
                                </button>
                            ` : ''}

                            ${this.isShared ? `
                                <span class="menu-action-pill" style="background: #F1F5F9; color: #334155; border: 1.5px solid #CBD5E1; cursor: default;">
                                    <span class="material-symbols-outlined" style="font-size: 17px; color: #64748B;">group</span>
                                    <span>${isEn ? 'Shared by' : 'Compartido por'}: <strong>${this.sharedBy?.first_name || this.sharedBy?.email || 'Propietario'}</strong></span>
                                </span>
                                <button type="button" class="menu-action-pill" onclick="window.restaurantMenu.leaveSharedMenu()" title="${isEn ? 'Leave shared menu' : 'Dejar de seguir esta carta'}" style="background: #FFF1F2; color: #9F1239; border: 1.5px solid #FECDD3;">
                                    <span class="material-symbols-outlined" style="font-size: 17px; color: #E11D48;">logout</span>
                                    <span>${isEn ? 'Leave Menu' : 'Dejar de seguir'}</span>
                                </button>
                            ` : ''}

                            <button type="button" class="menu-action-pill menu-pdf-pill" onclick="window.restaurantMenu.openDocumentViewer()" title="${isEn ? 'View official menu PDF / photos and upload new' : 'Ver carta oficial en PDF / foto y actualizar'}">
                                <span class="material-symbols-outlined" style="font-size: 18px; color: #DC2626;">picture_as_pdf</span>
                                <span>${isEn ? 'Official Menu (PDF / Photo)' : 'Carta Oficial (PDF / Foto)'}</span>
                            </button>

                            ${this.removedItemIds.length > 0 ? `
                                <button class="menu-action-pill" onclick="window.restaurantMenu.showRemovedItemsModal()" title="${isEn ? 'View dishes currently off the menu' : 'Ver platos fuera de la carta'}" style="background: #FEF3C7; color: #92400E; border: 1.5px solid #FDE68A;">
                                    <span class="material-symbols-outlined" style="font-size: 17px; color: #D97706;">visibility_off</span>
                                    <span>${isEn ? 'Dishes Off Menu' : 'Platos Fuera del Menú'}</span>
                                    <span class="chip-count" style="background: #D97706; color: #FFFFFF; font-weight: 800; margin-left: 4px; padding: 2px 7px; border-radius: 999px;">${this.removedItemIds.length}</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Macro Tabs (Solo si es Stanley o si hay más de 1 sección macro con platos) -->
                    ${isStanley ? `
                        <div class="menu-tabs-bar">
                            <button class="menu-tab-btn ${this.activeTab === 'all' ? 'active' : ''}" onclick="window.restaurantMenu.setTab('all')">
                                <span class="material-symbols-outlined">menu_book</span>
                                <span>${isEn ? 'Full Menu (Everything)' : '🍽️ Todo el Menú (Completo)'}</span>
                                <span class="chip-count" style="margin-left: 4px;">${totalDishesAll}</span>
                            </button>
                            <button class="menu-tab-btn ${this.activeTab === 'main' ? 'active' : ''}" onclick="window.restaurantMenu.setTab('main')">
                                <span class="material-symbols-outlined">restaurant</span>
                                <span>${isEn ? 'Main Menu & Pizzas' : 'Menú Principal & Pizzas'}</span>
                                <span class="chip-count" style="margin-left: 4px;">${mainDishesCount}</span>
                            </button>
                            <button class="menu-tab-btn ${this.activeTab === 'sunday' ? 'active' : ''}" onclick="window.restaurantMenu.setTab('sunday')">
                                <span class="material-symbols-outlined">outdoor_grill</span>
                                <span>🥩 Sunday Roasts</span>
                                <span class="chip-count" style="margin-left: 4px;">${sundayDishesCount}</span>
                                <span class="menu-tab-badge">Domingos 12-8pm</span>
                            </button>
                        </div>
                    ` : (allSections.length > 1 ? `
                        <div class="menu-tabs-bar">
                            <button class="menu-tab-btn ${this.activeTab === 'all' ? 'active' : ''}" onclick="window.restaurantMenu.setTab('all')">
                                <span class="material-symbols-outlined">menu_book</span>
                                <span>${isEn ? 'All Sections' : '🍽️ Todo el Menú'}</span>
                                <span class="chip-count" style="margin-left: 4px;">${totalDishesAll}</span>
                            </button>
                            ${allSections.map(sec => {
                                let count = 0;
                                (sec.categories || []).forEach(cat => { count += (cat.items || []).length; });
                                return `
                                    <button class="menu-tab-btn ${this.activeTab === sec.id ? 'active' : ''}" onclick="window.restaurantMenu.setTab('${sec.id}')">
                                        <span class="material-symbols-outlined">${sec.icon || 'restaurant'}</span>
                                        <span>${isEn ? (sec.name_en || sec.name_es) : sec.name_es}</span>
                                        <span class="chip-count" style="margin-left: 4px;">${count}</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    ` : '')}

                    ${categoryList.length > 0 ? `
                        <!-- Horizontal Scrollable Category Chips Carousel -->
                        <div class="menu-category-carousel-wrapper">
                            <button type="button" class="menu-carousel-arrow left" onclick="window.restaurantMenu.scrollChips(-260)" title="${isEn ? 'Previous categories' : 'Categorías anteriores'}">
                                <span class="material-symbols-outlined">chevron_left</span>
                            </button>
                            <div class="menu-category-chips" id="menuCategoryChips" onwheel="window.restaurantMenu.handleChipsWheel(event)">
                                <button class="menu-category-chip ${this.activeCategory === 'all' ? 'active' : ''}" onclick="window.restaurantMenu.setCategory('all')">
                                    <span>${isEn ? 'All Categories' : 'Todas las Secciones'}</span>
                                    <span class="chip-count">${currentTabDishes}</span>
                                </button>
                                ${categoryList.map(c => `
                                    <button class="menu-category-chip ${this.activeCategory === c.id ? 'active' : ''}" onclick="window.restaurantMenu.setCategory('${c.id}')">
                                        <span class="material-symbols-outlined" style="font-size: 16px;">${c.icon}</span>
                                        <span>${c.name}</span>
                                        <span class="chip-count">${c.count}</span>
                                    </button>
                                `).join('')}
                                ${outOfStockCount > 0 ? `
                                    <div class="menu-status-pill out-of-stock-counter" title="${isEn ? 'Items currently marked out of stock' : 'Platos marcados como agotados en cocina'}" style="white-space: nowrap;">
                                        <span class="material-symbols-outlined" style="font-size: 16px; color: #DC2626;">do_not_disturb_on</span>
                                        <span>${outOfStockCount} ${isEn ? '86 Out' : '86 Agotados'}</span>
                                    </div>
                                ` : ''}
                            </div>
                            <button type="button" class="menu-carousel-arrow right" onclick="window.restaurantMenu.scrollChips(260)" title="${isEn ? 'Next categories' : 'Siguientes categorías'}">
                                <span class="material-symbols-outlined">chevron_right</span>
                            </button>
                        </div>
                    ` : ''}

                    ${this.searchQuery ? `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 14px; background: #ECFDF5; border-radius: 12px; border: 1px solid #A7F3D0; margin: 4px 0 10px 0;">
                            <span style="font-size: 13px; color: #065F46; font-weight: 600;">
                                ${isEn ? `Filtering by: "<strong>${this.searchQuery}</strong>"` : `Filtrando por: "<strong>${this.searchQuery}</strong>"`}
                            </span>
                            <button onclick="window.restaurantMenu.setSearchQuery(''); const si=document.getElementById('searchInput'); if(si) si.value='';" style="background: none; border: none; color: #047857; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                                <span>${isEn ? 'Clear' : 'Limpiar'}</span>
                            </button>
                        </div>
                    ` : ''}
            `;

            // Render all sections and categories
            let renderedDishesCount = 0;
            let sectionsHtml = '';

            if (this.activeCategory === 'all') {
                // MODO FLUIDO: Todos los platos en una única cuadrícula continua.
                // Cuando se elimina cualquier tarjeta, las demás se mueven automáticamente
                // al espacio vacío sin dejar huecos entre categorías.
                const allDishes = [];
                sectionsToDisplay.forEach(section => {
                    const isSunday = section.id === 'sunday';
                    (section.categories || []).forEach(cat => {
                        (cat.items || []).forEach(item => {
                            if (this.searchQuery) {
                                const q = this.searchQuery.toLowerCase();
                                const name = (item.name || '').toLowerCase();
                                const desc = ((isEn ? item.desc_en : item.desc_es) || '').toLowerCase();
                                const tags = (item.tags || []).join(' ').toLowerCase();
                                const allergens = (item.allergens || []).join(' ').toLowerCase();
                                if (!name.includes(q) && !desc.includes(q) && !tags.includes(q) && !allergens.includes(q)) {
                                    return;
                                }
                            }
                            allDishes.push(item);
                        });
                    });
                });

                renderedDishesCount = allDishes.length;

                if (renderedDishesCount > 0) {
                    sectionsHtml = `
                        <div class="menu-items-grid">
                            ${allDishes.map(item => this.renderMenuItemCard(item, isEn)).join('')}
                        </div>
                    `;
                }
            } else {
                // MODO CATEGORÍA ESPECÍFICA (cuando el usuario selecciona una sección específica en los chips)
                sectionsToDisplay.forEach(section => {
                    (section.categories || []).forEach(cat => {
                        if (cat.id !== this.activeCategory) return;

                        const filteredItems = (cat.items || []).filter(item => {
                            if (!this.searchQuery) return true;
                            const q = this.searchQuery.toLowerCase();
                            const name = (item.name || '').toLowerCase();
                            const desc = ((isEn ? item.desc_en : item.desc_es) || '').toLowerCase();
                            const tags = (item.tags || []).join(' ').toLowerCase();
                            const allergens = (item.allergens || []).join(' ').toLowerCase();
                            return name.includes(q) || desc.includes(q) || tags.includes(q) || allergens.includes(q);
                        });

                        if (filteredItems.length === 0) return;

                        renderedDishesCount += filteredItems.length;

                        sectionsHtml += `
                            <div class="menu-category-section" id="cat_section_${cat.id}">
                                <div class="menu-category-header">
                                    <div class="menu-category-title-wrap">
                                        <span class="material-symbols-outlined menu-cat-icon">${cat.icon || 'restaurant'}</span>
                                        <h3 class="menu-category-title">${isEn ? cat.name_en : cat.name_es}</h3>
                                        <span class="menu-category-badge">${filteredItems.length}</span>
                                    </div>
                                    ${(isEn ? cat.notice_en : cat.notice_es) ? `<p class="menu-category-notice">${isEn ? cat.notice_en : cat.notice_es}</p>` : ''}
                                </div>

                                <div class="menu-items-grid">
                                    ${filteredItems.map(item => this.renderMenuItemCard(item, isEn)).join('')}
                                </div>
                            </div>
                        `;
                    });
                });
            }

            if (renderedDishesCount === 0) {
                if (totalDishesAll === 0) {
                    sectionsHtml = `
                        <div class="menu-empty-state" style="padding: 48px 20px; background: #FFFFFF; border-radius: 20px; border: 1.5px dashed #CBD5E1; text-align: center; margin: 24px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                            <div style="width: 72px; height: 72px; border-radius: 50%; background: #F0FDF4; display: flex; align-items: center; justify-content: center; color: #10B981; margin-bottom: 4px;">
                                <span class="material-symbols-outlined" style="font-size: 38px;">restaurant_menu</span>
                            </div>
                            <h4 style="margin: 0; font-size: 19px; font-weight: 800; color: #0F172A;">
                                ${isEn ? 'Your restaurant menu is empty' : 'La carta de este restaurante está vacía'}
                            </h4>
                            <p style="margin: 0; font-size: 14px; color: #64748B; max-width: 440px; line-height: 1.5;">
                                ${isEn ? 'Start by adding your signature dishes, ingredients, prices, and allergen tags.' : 'Comienza añadiendo tus platos, ingredientes, precios y alérgenos para gestionar tu carta.'}
                            </p>
                            ${(this.isOwner || this.permission === 'edit') ? `
                                <button type="button" class="btn-primary" onclick="window.restaurantMenu.showAddDishForm()" style="border-radius: 999px; height: 44px; padding: 0 24px; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
                                    <span class="material-symbols-outlined" style="font-size: 20px;">add</span>
                                    <span>${isEn ? 'Add First Dish' : 'Agregar Primer Plato'}</span>
                                </button>
                            ` : ''}
                        </div>
                    `;
                } else {
                    sectionsHtml = `
                        <div class="menu-empty-state">
                            <span class="material-symbols-outlined" style="font-size: 56px; color: #ccc;">search_off</span>
                            <h4>${isEn ? 'No dishes match your filter' : 'No se encontraron platos con ese criterio'}</h4>
                            <p>${isEn ? 'Try another search or select "All Categories".' : 'Intenta con otro término de búsqueda o selecciona "Todas las Secciones".'}</p>
                        </div>
                    `;
                }
            }

            html += `
                <div class="menu-items-container">
                    ${sectionsHtml}
                </div>
                </div>
            `;

            container.innerHTML = html;
            this.setupChipsDrag();
        }

        renderMenuItemCard(item, isEn) {
            const isAvail = this.isAvailable(item.id);
            const desc = isEn ? item.desc_en : item.desc_es;
            const priceText = item.priceOptions || `£${item.price.toFixed(2)}`;

            const catName = isEn ? (item.categoryName_en || '') : (item.categoryName_es || '');
            const catBadgeHtml = catName ? `
                <div class="menu-card-cat-badge">
                    <span class="material-symbols-outlined" style="font-size: 13px;">${item.categoryIcon || 'restaurant'}</span>
                    <span>${catName}</span>
                </div>
            ` : '';

            // Render tags
            const tagsHtml = (item.tags || []).map(t => {
                let badgeClass = 'tag-default';
                let label = t;
                if (t === 'V') { badgeClass = 'tag-vegetarian'; label = 'Vegetariano'; }
                else if (t === 'VE') { badgeClass = 'tag-vegan'; label = 'Vegano'; }
                else if (t === 'VE*' || t === 'VEO') { badgeClass = 'tag-vegan-opt'; label = 'Opción Vegana'; }
                else if (t === 'GF*') { badgeClass = 'tag-gf'; label = 'Opción Sin Gluten'; }
                else if (t === 'hot') { badgeClass = 'tag-hot'; label = 'Picante 🌶️'; }
                else if (t === 'bestseller') { badgeClass = 'tag-bestseller'; label = 'Favorito ⭐'; }
                return `<span class="menu-item-tag ${badgeClass}">${label}</span>`;
            }).join('');

            // Render allergens mini pills
            const allergensHtml = (item.allergens && item.allergens.length > 0)
                ? `<div class="menu-item-allergens">
                    <span class="allergen-hint">${isEn ? 'Allergens:' : 'Alérgenos:'}</span>
                    ${item.allergens.map(a => {
                        const allInfo = (window.UK_ALLERGENS || []).find(all => all.id === a);
                        const allName = allInfo ? (isEn ? allInfo.name_en : allInfo.name_es) : a;
                        return `<span class="menu-allergen-pill" title="${allName}">${allName}</span>`;
                    }).join('')}
                   </div>`
                : '';

            // Render cross-contamination (O) mini pills from official kitchen sheet
            const crossHtml = (item.crossContamination && item.crossContamination.length > 0)
                ? `<div class="menu-item-allergens" style="margin-top: 4px;">
                    <span class="allergen-hint" style="color: #D97706;">${isEn ? 'Cross-risk (O):' : 'Riesgo cruzado (O):'}</span>
                    ${item.crossContamination.map(c => {
                        const allInfo = (window.UK_ALLERGENS || []).find(all => all.id === c);
                        const allName = allInfo ? (isEn ? allInfo.name_en : allInfo.name_es) : c;
                        return `<span class="menu-allergen-pill" style="background:#FEF3C7; color:#B45309; border:1px solid #FDE68A;" title="${isEn ? `Shared equipment: ${allName}` : `Equipo compartido con: ${allName}`}">${allName}</span>`;
                    }).join('')}
                   </div>`
                : '';

            return `
                <div class="menu-item-card ${!isAvail ? 'is-out-of-stock' : ''}" id="card_${item.id}">
                    <div class="menu-item-card-top">
                        ${catBadgeHtml}
                        <div class="menu-item-header">
                            <h4 class="menu-item-name">${item.name}</h4>
                            <div class="menu-item-price-wrap">
                                <span class="menu-item-price">${priceText}</span>
                            </div>
                        </div>

                        ${tagsHtml ? `<div class="menu-item-tags-row">${tagsHtml}</div>` : ''}

                        <p class="menu-item-desc">${desc || (isEn ? `Chef preparation from ${this.restaurantName || 'kitchen'}` : `Elaboración artesanal de ${this.restaurantName || 'cocina'}`)}</p>

                        ${allergensHtml}
                        ${crossHtml}
                    </div>

                    <div class="menu-item-card-footer">
                        <button class="menu-toggle-86-btn ${isAvail ? 'btn-mark-86' : 'btn-restore-86'}" onclick="window.restaurantMenu.toggleItemAvailability('${item.id}', event)" title="${isAvail ? 'Marcar como agotado (86)' : 'Marcar como disponible'}">
                            <span class="material-symbols-outlined" style="font-size: 16px;">${isAvail ? 'do_not_disturb_on' : 'check_circle'}</span>
                            <span>${isAvail ? (isEn ? '86' : '86') : (isEn ? 'Available' : 'Disponible')}</span>
                        </button>

                        <!-- Botón eliminar plato de la carta si fue retirado del restaurante -->
                        <button class="btn-icon-m3" onclick="window.restaurantMenu.deleteMenuItem('${item.id}', '${item.name.replace(/'/g, "\\'")}')" title="${isEn ? 'Remove from active menu' : 'Quitar plato de la carta'}" style="width: 32px; height: 32px; color: #9CA3AF;">
                            <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                        </button>
                    </div>
                </div>
            `;
        }
    }

    window.restaurantMenu = new RestaurantMenuManager();
    window.closeMenuDocumentViewer = () => window.restaurantMenu?.closeDocumentViewer();
})();
