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
            this.availability = this.loadAvailability();
            this.customItems = this.loadCustomItems(); // Platos agregados por el usuario
            this.removedItemIds = this.loadRemovedItems(); // Platos eliminados

            this.closeDocumentViewer = this.closeDocumentViewer.bind(this);
            this.openDocumentViewer = this.openDocumentViewer.bind(this);
            this.cancelAddDish = this.cancelAddDish.bind(this);
            this.render = this.render.bind(this);
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
        getAllSections() {
            const data = window.STANLEYS_MENU_DATA || {};
            const rawSections = JSON.parse(JSON.stringify(data.sections || []));
            const removedSet = new Set(this.removedItemIds);

            // Filtrar eliminados y anotar metadatos de categoría
            rawSections.forEach(section => {
                section.categories.forEach(cat => {
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
            this.customItems.forEach(item => {
                let found = false;
                for (const sec of rawSections) {
                    for (const cat of sec.categories) {
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
                if (!found && rawSections[0] && rawSections[0].categories[0]) {
                    const fallbackCat = rawSections[0].categories[0];
                    item.categoryName_es = fallbackCat.name_es;
                    item.categoryName_en = fallbackCat.name_en;
                    item.categoryIcon = fallbackCat.icon || 'restaurant';
                    fallbackCat.items.push(item);
                }
            });

            return rawSections;
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
                if (confirm(confirmMsg)) {
                    doDelete();
                }
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
                if (confirm(confirmMsg)) {
                    doReset();
                }
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
                                ${isEn ? 'Add seasonal specials, new creations or web updates to Stanley’s food menu.' : 'Añade novedades que salgan en la web de Stanley’s o especiales del chef.'}
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
                } else {
                    alert('Por favor ingresa el nombre del plato.');
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
                                    <span>${isEn ? 'Official Menu Document & Photos' : 'Carta Oficial de Stanley\'s (Documento / Foto)'}</span>
                                </h1>
                                <p style="margin: 3px 0 0 0; font-size: 13px; color: #6B7280;">
                                    ${isEn ? 'View official menu document or upload new photos when kitchen changes.' : 'Visualiza la carta oficial o sube fotos nuevas cuando cambie la carta.'}
                                </p>
                            </div>
                        </div>

                        <!-- Macro Tabs Switcher -->
                        <div class="menu-doc-tabs" style="background: #F3F4F6; padding: 4px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;">
                            <button type="button" class="menu-doc-tab-btn ${this.currentDocTab === 'main' ? 'active' : ''}" id="docTabMain" onclick="window.restaurantMenu.switchDocTab('main')">
                                <span class="material-symbols-outlined" style="font-size: 16px;">restaurant</span>
                                <span>${isEn ? 'Main Menu & Pizzas' : 'Menú Principal'}</span>
                            </button>
                            <button type="button" class="menu-doc-tab-btn ${this.currentDocTab === 'sunday' ? 'active' : ''}" id="docTabSunday" onclick="window.restaurantMenu.switchDocTab('sunday')">
                                <span class="material-symbols-outlined" style="font-size: 16px;">outdoor_grill</span>
                                <span>${isEn ? 'Sunday Roasts' : 'Sunday Roasts'}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Actions & Controls Toolbar -->
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: #FFFFFF; border: 1px solid var(--outline-variant, #E5E7EB); border-radius: 16px 16px 0 0; border-bottom: none; flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <input type="file" id="menuDocFileInput" accept="image/*,application/pdf" style="display: none;" onchange="window.restaurantMenu.handleDocumentUpload(event)">
                            <button type="button" class="btn-primary" onclick="document.getElementById('menuDocFileInput').click()" style="border-radius: 999px; height: 38px; padding: 0 18px; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);">
                                <span class="material-symbols-outlined" style="font-size: 18px;">upload_file</span>
                                <span>${isEn ? 'Upload New Photo or PDF' : 'Subir Nueva Foto o PDF'}</span>
                            </button>
                            <button type="button" id="btnResetDoc" class="btn-secondary" onclick="window.restaurantMenu.resetCurrentDocToDefault()" style="display: none; border-radius: 999px; height: 38px; padding: 0 16px; font-size: 13px; font-weight: 600; align-items: center; gap: 6px;" title="Restaurar documento original">
                                <span class="material-symbols-outlined" style="font-size: 17px;">restore</span>
                                <span>${isEn ? 'Reset to Original' : 'Restaurar Original'}</span>
                            </button>
                        </div>

                        <div style="display: flex; align-items: center; gap: 6px;">
                            <button type="button" class="btn-icon-m3" onclick="window.restaurantMenu.zoomDoc(-0.2)" title="${isEn ? 'Zoom Out' : 'Reducir'}" style="width: 36px; height: 36px; background: #F9FAFB; border: 1px solid #E5E7EB;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">zoom_out</span>
                            </button>
                            <span id="docZoomLevel" style="font-size: 13px; font-weight: 800; color: #374151; min-width: 50px; text-align: center;">100%</span>
                            <button type="button" class="btn-icon-m3" onclick="window.restaurantMenu.zoomDoc(0.2)" title="${isEn ? 'Zoom In' : 'Ampliar'}" style="width: 36px; height: 36px; background: #F9FAFB; border: 1px solid #E5E7EB;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">zoom_in</span>
                            </button>
                            <div style="width: 1px; height: 22px; background: #E5E7EB; margin: 0 4px;"></div>
                            <button type="button" class="btn-icon-m3" onclick="window.restaurantMenu.downloadCurrentDoc()" title="${isEn ? 'Download file' : 'Descargar archivo'}" style="width: 36px; height: 36px; background: #F9FAFB; border: 1px solid #E5E7EB;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">download</span>
                            </button>
                            <button type="button" class="btn-icon-m3" onclick="window.restaurantMenu.openDocInNewTab()" title="${isEn ? 'Open in new window' : 'Abrir en nueva ventana'}" style="width: 36px; height: 36px; background: #F9FAFB; border: 1px solid #E5E7EB;">
                                <span class="material-symbols-outlined" style="font-size: 20px;">open_in_new</span>
                            </button>
                        </div>
                    </div>

                    <!-- Adapted Viewport inside System -->
                    <div class="menu-doc-viewport" id="docViewport" style="background: #FFFFFF; min-height: auto; border-radius: 0 0 16px 16px; border: 1px solid var(--outline-variant, #E5E7EB); box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
                        <div id="docViewerLoading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #4B5563; min-height: 220px; padding: 30px 0;">
                            <div class="spinner-sm" style="border-top-color: #10B981;"></div>
                            <span style="font-size: 14px; font-weight: 600;">${isEn ? 'Loading menu document...' : 'Cargando documento de la carta...'}</span>
                        </div>
                        <canvas id="docViewerCanvas" style="display: none;"></canvas>
                        <img id="docViewerImage" style="display: none;" alt="Carta Stanley's">
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
            const loadingEl = document.getElementById('docViewerLoading');
            const canvasEl = document.getElementById('docViewerCanvas');
            const imgEl = document.getElementById('docViewerImage');
            const resetBtn = document.getElementById('btnResetDoc');

            if (loadingEl) loadingEl.style.display = 'flex';
            if (canvasEl) canvasEl.style.display = 'none';
            if (imgEl) imgEl.style.display = 'none';

            try {
                const custom = await MenuDocStorage.getDoc(this.currentDocTab);
                if (custom && custom.dataUrl) {
                    if (resetBtn) resetBtn.style.display = 'inline-flex';
                    this.activeDocFile = custom;
                    if (custom.type && custom.type.startsWith('image/')) {
                        if (imgEl) {
                            imgEl.src = custom.dataUrl;
                            imgEl.style.display = 'block';
                            imgEl.style.transform = `scale(${this.docZoom})`;
                        }
                        if (loadingEl) loadingEl.style.display = 'none';
                    } else {
                        // PDF
                        await this.renderPdfDoc(custom.dataUrl);
                    }
                } else {
                    if (resetBtn) resetBtn.style.display = 'none';
                    const defaultPdf = this.currentDocTab === 'sunday' 
                        ? 'assets/pdf/stanleys-sunday-menu.pdf' 
                        : 'assets/pdf/stanleys-main-menu.pdf';
                    this.activeDocFile = { type: 'application/pdf', dataUrl: defaultPdf, name: (this.currentDocTab === 'sunday' ? 'stanleys-sunday-menu.pdf' : 'stanleys-main-menu.pdf') };
                    await this.renderPdfDoc(defaultPdf);
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

            const reader = new FileReader();
            reader.onload = async () => {
                const dataUrl = reader.result;
                await MenuDocStorage.setDoc(this.currentDocTab, {
                    type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
                    dataUrl: dataUrl,
                    name: file.name
                });
                this.loadCurrentDocument();
                if (window.showActionToast) {
                    const isSunday = this.currentDocTab === 'sunday';
                    window.showActionToast({
                        message: `✅ Carta de ${isSunday ? 'Sunday Roasts' : 'Menú Principal'} actualizada con tu nueva foto/documento`,
                        type: 'success'
                    });
                }
            };
            reader.readAsDataURL(file);
        }

        async resetCurrentDocToDefault() {
            const isEn = window.i18n && window.i18n.getLang() === 'en';
            const msg = isEn ? 'Reset to the official original menu document?' : '¿Deseas restaurar la carta oficial original?';
            if (confirm(msg)) {
                await MenuDocStorage.removeDoc(this.currentDocTab);
                this.loadCurrentDocument();
                if (window.showActionToast) {
                    window.showActionToast({
                        message: '✅ Carta original restaurada',
                        type: 'success'
                    });
                }
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
            a.download = this.activeDocFile.name || `stanleys-${this.currentDocTab}-menu.pdf`;
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
            const data = window.STANLEYS_MENU_DATA || {};
            const removedSet = new Set(this.removedItemIds);
            const result = [];

            (data.sections || []).forEach(section => {
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

            if (this.isAddingDish) {
                this.renderAddDishForm(container);
                return;
            }

            if (this.isViewingDocument) {
                this.renderDocumentView(container);
                return;
            }

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

            let html = `
                <div class="allergens-module menu-module-container">
                    <!-- Modern Header Banner -->
                    <div class="menu-hero-card">
                        <!-- Botón de Ayuda circular en esquina superior derecha -->
                        <button type="button" class="menu-hero-help-btn" onclick="window.restaurantMenu.showHelpModal()" title="${isEn ? 'How updates and dishes work' : '¿Cómo funciona la gestión del menú?'}" aria-label="${isEn ? 'Help' : 'Ayuda'}">
                            <span class="material-symbols-outlined">help</span>
                        </button>

                        <div class="allergens-hero-top-row" style="align-items: center;">
                            <a href="${info.website || 'https://www.stanleyssw16.com/food'}" target="_blank" rel="noopener" class="menu-hero-logo" title="${isEn ? 'Visit official Stanley’s website' : 'Visitar web oficial de Stanley’s'}" style="text-decoration: none; cursor: pointer; display: inline-flex;">
                                <img src="assets/images/stanleys-logo.png" alt="Stanley's of Streatham">
                            </a>
                            <div class="allergens-hero-heading-block" style="flex: 1;">
                                <div class="menu-hero-badge-row">
                                    <span class="m3-uk-fsa-badge" style="background: #EFF6FF; color: #1E40AF; font-weight: 800;">
                                        ${totalDishesAll} ${isEn ? 'Active Dishes' : 'Platos Activos'}
                                    </span>
                                </div>
                                <h1 style="margin: 4px 0 2px 0; font-size: clamp(22px, 3.5vw, 28px); font-weight: 900; color: #111827; letter-spacing: -0.02em;">
                                    ${isEn ? 'Food Menu' : 'Carta de Comida'}
                                </h1>
                                <p style="margin: 0; font-size: 13.5px; color: #4B5563;">
                                    ${isEn ? 'Complete digital restaurant menu. Dishes can be marked out-of-stock (86) or updated dynamically.' : 'Carta digital completa y abierta. Puedes marcar platos agotados (86) o agregar novedades cuando cambie la web.'}
                                </p>
                            </div>
                        </div>

                        <!-- Header Action Buttons -->
                        <div class="menu-hero-actions">
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

                    <!-- Macro Tabs (Todo, Menú Diario, Sunday Roasts) -->
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
                            <span>${isEn ? 'Sunday Roasts' : '🥩 Sunday Roasts'}</span>
                            <span class="chip-count" style="margin-left: 4px;">${sundayDishesCount}</span>
                            <span class="menu-tab-badge">Domingos 12-8pm</span>
                        </button>
                    </div>

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

                        <p class="menu-item-desc">${desc || (isEn ? 'Chef preparation from Stanley’s SW16' : 'Elaboración artesanal de Stanley’s SW16')}</p>

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
