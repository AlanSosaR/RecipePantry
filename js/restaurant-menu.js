/**
 * Restaurant Menu Manager - Stanley's SW16 Streatham
 * Visualizador completo y gestor de carta abierta sin marcos cerrados.
 * Permite ver Todo el Menú (incluyendo Sunday Roasts), filtrar por categorías,
 * marcar platos 86 (agotados) y agregar/eliminar platos cuando la carta del restaurante cambie.
 */

(function () {
    class RestaurantMenuManager {
        constructor() {
            this.containerId = 'menuView';
            this.activeTab = 'all'; // 'all' (todo) | 'main' | 'sunday'
            this.activeCategory = 'all';
            this.searchQuery = '';
            this.availability = this.loadAvailability();
            this.customItems = this.loadCustomItems(); // Platos agregados por el usuario
            this.removedItemIds = this.loadRemovedItems(); // Platos eliminados
        }

        loadAvailability() {
            try {
                const stored = localStorage.getItem('stanleys_menu_availability');
                return stored ? JSON.parse(stored) : {};
            } catch (e) {
                return {};
            }
        }

        saveAvailability() {
            try {
                localStorage.setItem('stanleys_menu_availability', JSON.stringify(this.availability));
            } catch (e) {}
        }

        loadCustomItems() {
            try {
                const stored = localStorage.getItem('stanleys_custom_items');
                return stored ? JSON.parse(stored) : [];
            } catch (e) {
                return [];
            }
        }

        saveCustomItems() {
            try {
                localStorage.setItem('stanleys_custom_items', JSON.stringify(this.customItems));
            } catch (e) {}
        }

        loadRemovedItems() {
            try {
                const stored = localStorage.getItem('stanleys_removed_items');
                return stored ? JSON.parse(stored) : [];
            } catch (e) {
                return [];
            }
        }

        saveRemovedItems() {
            try {
                localStorage.setItem('stanleys_removed_items', JSON.stringify(this.removedItemIds));
            } catch (e) {}
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
        getAllSections() {
            const data = window.STANLEYS_MENU_DATA || {};
            const rawSections = JSON.parse(JSON.stringify(data.sections || []));
            const removedSet = new Set(this.removedItemIds);

            // Filtrar eliminados
            rawSections.forEach(section => {
                section.categories.forEach(cat => {
                    cat.items = (cat.items || []).filter(item => !removedSet.has(item.id));
                });
            });

            // Agregar custom items a su categoría
            this.customItems.forEach(item => {
                let found = false;
                for (const sec of rawSections) {
                    for (const cat of sec.categories) {
                        if (cat.id === item.categoryId) {
                            cat.items.push(item);
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
                if (!found && rawSections[0] && rawSections[0].categories[0]) {
                    rawSections[0].categories[0].items.push(item);
                }
            });

            return rawSections;
        }

        // Gestión: Eliminar un plato que ya no está en la carta del restaurante
        deleteMenuItem(itemId, itemName) {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const confirmMsg = isEn 
                ? `Do you want to remove "${itemName}" from the active menu?` 
                : `¿Deseas quitar "${itemName}" de la carta activa?`;
            
            if (!confirm(confirmMsg)) return;

            // Si es un plato creado localmente, removerlo de customItems
            this.customItems = this.customItems.filter(i => i.id !== itemId);
            this.saveCustomItems();

            // Si es un plato de la lista base, agregarlo a removedItemIds
            if (!this.removedItemIds.includes(itemId)) {
                this.removedItemIds.push(itemId);
                this.saveRemovedItems();
            }

            this.render();
            if (window.showActionToast) {
                window.showActionToast({
                    message: isEn ? `"${itemName}" removed from menu` : `"${itemName}" retirado de la carta`,
                    type: 'info'
                });
            }
        }

        // Restaurar menú original completo
        resetOriginalMenu() {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            if (!confirm(isEn ? 'Restore all original menu items?' : '¿Restaurar todos los platos originales de la carta oficial?')) return;
            this.removedItemIds = [];
            this.saveRemovedItems();
            this.render();
            if (window.showActionToast) {
                window.showActionToast({
                    message: isEn ? 'Original menu restored' : 'Menú original restaurado',
                    type: 'success'
                });
            }
        }

        // Modal para agregar un nuevo plato cuando la web del restaurante estrene algo
        showAddDishModal() {
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

            const modalHtml = `
                <div id="addDishModal" class="modal-overlay" style="display: flex; z-index: 99999;">
                    <div class="share-modal-container" style="max-width: 480px; width: 92%;">
                        <div class="modal-header">
                            <div class="header-info">
                                <h3 style="margin: 0; font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                                    <span class="material-symbols-outlined" style="color: #10B981;">add_circle</span>
                                    <span>${isEn ? 'Add New Dish to Menu' : 'Agregar Nuevo Plato a la Carta'}</span>
                                </h3>
                                <p style="margin: 4px 0 0 0; font-size: 12.5px; color: #666;">
                                    ${isEn ? 'Add items updated on Stanley’s website or seasonal specials.' : 'Añade novedades que salgan en la web de Stanley’s o especiales del chef.'}
                                </p>
                            </div>
                            <button class="btn-close-modal" onclick="document.getElementById('addDishModal').remove()">
                                <span class="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px; padding: 20px;">
                            <div>
                                <label style="font-size: 12px; font-weight: 700; color: #444; display: block; margin-bottom: 4px;">
                                    ${isEn ? 'Dish Name *' : 'Nombre del Plato *'}
                                </label>
                                <input type="text" id="newDishName" placeholder="Ej: Truffle Mac & Cheese" style="width: 100%; height: 42px; border-radius: 10px; border: 1px solid #D1D5DB; padding: 0 12px; font-family: inherit; font-size: 14px; box-sizing: border-box;">
                            </div>

                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <div>
                                    <label style="font-size: 12px; font-weight: 700; color: #444; display: block; margin-bottom: 4px;">
                                        ${isEn ? 'Price (£) *' : 'Precio (£) *'}
                                    </label>
                                    <input type="number" step="0.5" id="newDishPrice" placeholder="14.50" style="width: 100%; height: 42px; border-radius: 10px; border: 1px solid #D1D5DB; padding: 0 12px; font-family: inherit; font-size: 14px; box-sizing: border-box;">
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: 700; color: #444; display: block; margin-bottom: 4px;">
                                        ${isEn ? 'Category *' : 'Categoría *'}
                                    </label>
                                    <select id="newDishCategory" style="width: 100%; height: 42px; border-radius: 10px; border: 1px solid #D1D5DB; padding: 0 10px; font-family: inherit; font-size: 13px; box-sizing: border-box; background: white;">
                                        ${categoriesOptions}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style="font-size: 12px; font-weight: 700; color: #444; display: block; margin-bottom: 4px;">
                                    ${isEn ? 'Description & Ingredients' : 'Descripción e Ingredientes'}
                                </label>
                                <textarea id="newDishDesc" placeholder="Detalles de preparación o guarniciones..." rows="2" style="width: 100%; border-radius: 10px; border: 1px solid #D1D5DB; padding: 10px 12px; font-family: inherit; font-size: 13px; box-sizing: border-box;"></textarea>
                            </div>

                            <div>
                                <label style="font-size: 12px; font-weight: 700; color: #444; display: block; margin-bottom: 4px;">
                                    ${isEn ? 'Dietary Tags (comma separated)' : 'Etiquetas dietéticas (V, VE, GF*, Hot)'}
                                </label>
                                <input type="text" id="newDishTags" placeholder="V, bestseller" style="width: 100%; height: 42px; border-radius: 10px; border: 1px solid #D1D5DB; padding: 0 12px; font-family: inherit; font-size: 13px; box-sizing: border-box;">
                            </div>
                        </div>
                        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 16px 20px;">
                            <button class="btn-secondary" onclick="document.getElementById('addDishModal').remove()">
                                <span>${isEn ? 'Cancel' : 'Cancelar'}</span>
                            </button>
                            <button class="btn-primary" onclick="window.restaurantMenu.saveNewDish()">
                                <span class="material-symbols-outlined" style="font-size: 18px;">save</span>
                                <span>${isEn ? 'Save Dish' : 'Guardar Plato'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
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
                alert('Por favor ingresa el nombre del plato.');
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

            const modal = document.getElementById('addDishModal');
            if (modal) modal.remove();

            this.render();
            if (window.showActionToast) {
                window.showActionToast({
                    message: `✅ Plato "${name}" agregado al menú`,
                    type: 'success'
                });
            }
        }

        render() {
            const container = document.getElementById(this.containerId);
            if (!container) return;

            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const data = window.STANLEYS_MENU_DATA || {};
            const info = data.info || {};
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

            // Contabilizar items y categorías
            let totalDishes = 0;
            let outOfStockCount = 0;
            const categoryList = [];

            allSections.forEach(sec => {
                (sec.categories || []).forEach(cat => {
                    const count = (cat.items || []).length;
                    totalDishes += count;
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

            let html = `
                <div class="allergens-module menu-module-container">
                    <!-- Modern Header Banner -->
                    <div class="menu-hero-card">
                        <div class="allergens-hero-top-row" style="align-items: center;">
                            <div class="menu-hero-icon" style="background: linear-gradient(135deg, #10B981 0%, #047857 100%);">
                                <span class="material-symbols-outlined" style="font-size: 30px;">restaurant_menu</span>
                            </div>
                            <div class="allergens-hero-heading-block" style="flex: 1;">
                                <div class="menu-hero-badge-row">
                                    <span class="m3-uk-fsa-badge" style="background: #ECFDF5; color: #065F46; font-weight: 800;">
                                        ${info.location || 'Streatham, London'}
                                    </span>
                                    <span class="m3-uk-fsa-badge" style="background: #FEF3C7; color: #92400E; font-weight: 800;">
                                        Domingos 12:00 – 20:00 (Roasts)
                                    </span>
                                    <span class="m3-uk-fsa-badge" style="background: #EFF6FF; color: #1E40AF; font-weight: 800;">
                                        ${totalDishes} Platos Activos
                                    </span>
                                </div>
                                <h1 style="margin: 4px 0 2px 0; font-size: clamp(22px, 3.5vw, 28px); font-weight: 900; color: #111827; letter-spacing: -0.02em;">
                                    ${info.restaurantName || "Stanley's SW16"} &bull; ${isEn ? 'Food Menu' : 'Carta de Comida'}
                                </h1>
                                <p style="margin: 0; font-size: 13.5px; color: #4B5563;">
                                    ${isEn ? 'Complete digital restaurant menu. Dishes can be marked out-of-stock (86) or updated dynamically.' : 'Carta digital completa y abierta. Puedes marcar platos agotados (86) o agregar novedades cuando cambie la web.'}
                                </p>
                            </div>
                        </div>

                        <!-- Header Action Buttons -->
                        <div class="menu-hero-actions">
                            <button class="btn-new-dropbox" onclick="window.restaurantMenu.showAddDishModal()" style="border-radius: 999px; height: 38px; padding: 0 16px; font-size: 13px;">
                                <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
                                <span>${isEn ? 'Add New Dish' : 'Agregar Plato'}</span>
                            </button>

                            <a href="${info.website}" target="_blank" rel="noopener" class="menu-action-pill" title="Visitar web oficial">
                                <span class="material-symbols-outlined" style="font-size: 17px;">public</span>
                                <span>stanleyssw16.com/food</span>
                            </a>

                            <a href="${info.pdfUrl}" target="_blank" rel="noopener" class="menu-action-pill menu-pdf-pill" title="Abrir documento PDF original en nueva pestaña">
                                <span class="material-symbols-outlined" style="font-size: 17px;">open_in_new</span>
                                <span>${isEn ? 'Official PDF' : 'PDF Original'}</span>
                            </a>

                            ${this.removedItemIds.length > 0 ? `
                                <button class="menu-action-pill" onclick="window.restaurantMenu.resetOriginalMenu()" title="Restaurar platos ocultados" style="background: #FEF3C7; color: #92400E;">
                                    <span class="material-symbols-outlined" style="font-size: 16px;">restore</span>
                                    <span>${isEn ? 'Restore All Items' : 'Restaurar Todo'}</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Macro Tabs (Todo, Menú Diario, Sunday Roasts) -->
                    <div class="menu-tabs-bar">
                        <button class="menu-tab-btn ${this.activeTab === 'all' ? 'active' : ''}" onclick="window.restaurantMenu.setTab('all')">
                            <span class="material-symbols-outlined">menu_book</span>
                            <span>${isEn ? 'Full Menu (Everything)' : '🍽️ Todo el Menú (Completo)'}</span>
                            <span class="chip-count" style="margin-left: 4px;">${totalDishes}</span>
                        </button>
                        <button class="menu-tab-btn ${this.activeTab === 'main' ? 'active' : ''}" onclick="window.restaurantMenu.setTab('main')">
                            <span class="material-symbols-outlined">restaurant</span>
                            <span>${isEn ? 'Main Menu & Pizzas' : 'Menú Principal & Pizzas'}</span>
                        </button>
                        <button class="menu-tab-btn ${this.activeTab === 'sunday' ? 'active' : ''}" onclick="window.restaurantMenu.setTab('sunday')">
                            <span class="material-symbols-outlined">outdoor_grill</span>
                            <span>${isEn ? 'Sunday Roasts' : '🥩 Sunday Roasts'}</span>
                            <span class="menu-tab-badge">Domingos 12-8pm</span>
                        </button>
                    </div>

                    <!-- Horizontal Scrollable Category Chips -->
                    <div class="menu-category-chips">
                        <button class="menu-category-chip ${this.activeCategory === 'all' ? 'active' : ''}" onclick="window.restaurantMenu.setCategory('all')">
                            <span>${isEn ? 'All Categories' : 'Todas las Secciones'}</span>
                            <span class="chip-count">${totalDishes}</span>
                        </button>
                        ${categoryList.map(c => `
                            <button class="menu-category-chip ${this.activeCategory === c.id ? 'active' : ''}" onclick="window.restaurantMenu.setCategory('${c.id}')">
                                <span class="material-symbols-outlined" style="font-size: 16px;">${c.icon}</span>
                                <span>${c.name}</span>
                                <span class="chip-count">${c.count}</span>
                            </button>
                        `).join('')}
                    </div>

                    <!-- Search Bar & 86 Counter -->
                    <div class="menu-search-row">
                        <div class="search-wrapper-m3 menu-search-input-wrap">
                            <span class="material-symbols-outlined">search</span>
                            <input type="text" id="menuLocalSearch" placeholder="${isEn ? 'Search any dish, burger, roast, pizza or ingredient...' : 'Buscar plato, pizza, asado de domingo, hamburguesa o ingrediente...'}" value="${this.searchQuery}" oninput="window.restaurantMenu.setSearchQuery(this.value)">
                            ${this.searchQuery ? `<button class="btn-clear-search" onclick="window.restaurantMenu.setSearchQuery(''); document.getElementById('menuLocalSearch').value='';"><span class="material-symbols-outlined">close</span></button>` : ''}
                        </div>
                        ${outOfStockCount > 0 ? `
                            <div class="menu-status-pill out-of-stock-counter" title="${isEn ? 'Items currently marked out of stock' : 'Platos marcados como agotados en cocina'}">
                                <span class="material-symbols-outlined" style="font-size: 16px; color: #DC2626;">do_not_disturb_on</span>
                                <span>${outOfStockCount} ${isEn ? 'Out of stock (86)' : 'Agotados (86)'}</span>
                            </div>
                        ` : ''}
                    </div>
            `;

            // Render all sections and categories
            let renderedDishesCount = 0;
            let sectionsHtml = '';

            sectionsToDisplay.forEach(section => {
                const isSunday = section.id === 'sunday';

                // Si estamos viendo todo y llegamos al domingo, mostramos el banner especial de domingo
                let sectionIntroHtml = '';
                if (isSunday) {
                    sectionIntroHtml = `
                        <div class="menu-sunday-banner" style="margin-top: 24px; margin-bottom: 8px;">
                            <div class="menu-sunday-banner-icon">
                                <span class="material-symbols-outlined">outdoor_grill</span>
                            </div>
                            <div class="menu-sunday-banner-content">
                                <div class="menu-sunday-banner-title">
                                    <strong>SOS Sunday Roasts</strong> &bull; <span>${info.sundayHours || 'Domingos de 12:00 a 20:00'}</span>
                                </div>
                                <p class="menu-sunday-banner-desc">
                                    ${isEn ? info.sundayDescription_en : info.sundayDescription_es}
                                </p>
                            </div>
                        </div>
                    `;
                }

                let categoriesInSecHtml = '';

                (section.categories || []).forEach(cat => {
                    // Filtrar por categoría activa
                    if (this.activeCategory !== 'all' && this.activeCategory !== cat.id) return;

                    // Filtrar por búsqueda
                    const filteredItems = (cat.items || []).filter(item => {
                        if (!this.searchQuery) return true;
                        const name = (item.name || '').toLowerCase();
                        const desc = ((isEn ? item.desc_en : item.desc_es) || '').toLowerCase();
                        const tags = (item.tags || []).join(' ').toLowerCase();
                        const allergens = (item.allergens || []).join(' ').toLowerCase();
                        return name.includes(this.searchQuery) || desc.includes(this.searchQuery) || tags.includes(this.searchQuery) || allergens.includes(this.searchQuery);
                    });

                    if (filteredItems.length === 0) return;

                    renderedDishesCount += filteredItems.length;

                    categoriesInSecHtml += `
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

                if (categoriesInSecHtml) {
                    sectionsHtml += sectionIntroHtml + categoriesInSecHtml;
                }
            });

            if (renderedDishesCount === 0) {
                sectionsHtml = `
                    <div class="menu-empty-state">
                        <span class="material-symbols-outlined" style="font-size: 56px; color: #ccc;">search_off</span>
                        <h4>${isEn ? 'No dishes match your filter' : 'No se encontraron platos con ese criterio'}</h4>
                        <p>${isEn ? 'Try another search or select "All Categories".' : 'Intenta con otro término de búsqueda o selecciona "Todas las Secciones".'}</p>
                    </div>
                `;
            }

            html += `
                <div class="menu-items-container">
                    ${sectionsHtml}
                </div>

                <!-- Footer Info / How updates work -->
                <div class="menu-update-explainer-card">
                    <div class="menu-update-icon">
                        <span class="material-symbols-outlined">sync_alt</span>
                    </div>
                    <div class="menu-update-content">
                        <h4>${isEn ? 'How do updates & new dishes work?' : '¿Cómo se actualizan o agregan nuevos platos si cambia la web?'}</h4>
                        <p>
                            ${isEn 
                                ? '1. <strong>Direct Addition:</strong> Click "+ Add New Dish" above to instantly add any new special or changed plate.<br>' +
                                  '2. <strong>Remove Outdated Items:</strong> Click the trash icon on any dish that was taken off the restaurant menu.<br>' +
                                  '3. <strong>Daily Kitchen 86:</strong> Use "86 / Out of Stock" to temporarily deactivate a dish without deleting it.'
                                : '1. <strong>Agregar Platos:</strong> Usa el botón "+ Agregar Plato" arriba para añadir al instante cualquier plato nuevo que publiquen en su web.<br>' +
                                  '2. <strong>Quitar Platos Viejos:</strong> Haz clic en el icono de papelera en cualquier plato que hayan quitado de la carta.<br>' +
                                  '3. <strong>Agotado en Cocina (86):</strong> Usa el botón "Agotado (86)" para apagar temporalmente platos que se terminen durante el servicio sin tener que borrarlos.'}
                        </p>
                    </div>
                </div>

                </div>
            `;

            container.innerHTML = html;
        }

        renderMenuItemCard(item, isEn) {
            const isAvail = this.isAvailable(item.id);
            const desc = isEn ? item.desc_en : item.desc_es;
            const priceText = item.priceOptions || `£${item.price.toFixed(2)}`;

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

            return `
                <div class="menu-item-card ${!isAvail ? 'is-out-of-stock' : ''}" id="card_${item.id}">
                    <div class="menu-item-card-top">
                        <div class="menu-item-header">
                            <h4 class="menu-item-name">${item.name}</h4>
                            <div class="menu-item-price-wrap">
                                <span class="menu-item-price">${priceText}</span>
                            </div>
                        </div>

                        ${tagsHtml ? `<div class="menu-item-tags-row">${tagsHtml}</div>` : ''}

                        <p class="menu-item-desc">${desc || (isEn ? 'Chef preparation from Stanley’s SW16' : 'Elaboración artesanal de Stanley’s SW16')}</p>

                        ${allergensHtml}
                    </div>

                    <div class="menu-item-card-footer">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <button class="menu-toggle-86-btn ${isAvail ? 'btn-mark-86' : 'btn-restore-86'}" onclick="window.restaurantMenu.toggleItemAvailability('${item.id}', event)" title="${isAvail ? 'Marcar como agotado (86)' : 'Marcar como disponible'}">
                                <span class="material-symbols-outlined" style="font-size: 16px;">${isAvail ? 'do_not_disturb_on' : 'check_circle'}</span>
                                <span>${isAvail ? (isEn ? '86' : '86') : (isEn ? 'Available' : 'Disponible')}</span>
                            </button>

                            <button class="menu-pantry-btn" onclick="window.restaurantMenu.searchInPantry('${item.name.replace(/'/g, "\\'")}')" title="${isEn ? 'Search recipe in pantry' : 'Buscar receta en mi recetario'}">
                                <span class="material-symbols-outlined" style="font-size: 16px;">menu_book</span>
                                <span>${isEn ? 'Recipe' : 'Receta'}</span>
                            </button>
                        </div>

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
})();
