/**
 * js/m3-folder-dropdown.js — RecipePantry
 * Componente Material 3 Expressive para el selector de carpetas.
 * Replica el diseño Material 3 con esquinas redondeadas, pastilla de selección suave verde,
 * checkmark, icono de carpeta en verde oficial de la app, y soporte nativo sincronizado.
 */

window.initM3FolderDropdown = function (options) {
    const {
        wrapperId = 'pantryFolderWrapper',
        triggerId = 'pantryFolderTrigger',
        menuId = 'pantryFolderMenu',
        itemsContainerId = 'pantryFolderItems',
        selectId = 'pantryFolderSelect',
        newFolderBoxId = 'pantryNewFolderBox',
        newFolderInputId = 'newFolderCustomInput',
        onFolderChange = null
    } = options || {};

    const wrapper = document.getElementById(wrapperId);
    const trigger = document.getElementById(triggerId);
    const menu = document.getElementById(menuId);
    const itemsContainer = document.getElementById(itemsContainerId);
    const select = document.getElementById(selectId);
    const newFolderBox = document.getElementById(newFolderBoxId);
    const newFolderInput = document.getElementById(newFolderInputId);

    if (!wrapper || !trigger || !menu || !itemsContainer || !select) return null;

    let foldersList = [];
    let currentSelectedValue = select.value || '';

    function getRecipeCounts() {
        const countMap = new Map();
        try {
            let recs = [];
            if (window.dashboard && Array.isArray(window.dashboard.recipes)) {
                recs = window.dashboard.recipes;
            } else if (window.db && Array.isArray(window.db.recipesCache)) {
                recs = window.db.recipesCache;
            } else if (window.db && typeof window.db.getRecipesSync === 'function') {
                recs = window.db.getRecipesSync() || [];
            }
            if (recs && recs.length > 0) {
                recs.forEach(r => {
                    const f = (r.pantry_es || r.folder || '').trim().toLowerCase();
                    if (f) {
                        countMap.set(f, (countMap.get(f) || 0) + 1);
                    }
                });
            }
        } catch (e) {
            // ignore
        }
        return countMap;
    }

    function renderItems() {
        const isEn = window.i18n && window.i18n.getLang() === 'en';
        const soloTu = isEn ? 'Only you' : 'Solo tú';
        let html = '';

        // 1. Opción Raíz: Despensa Principal (Raíz)
        const isRootSelected = currentSelectedValue === '';
        const rootTitle = isEn ? 'Main Pantry (Root)' : 'Despensa Principal (Raíz)';
        const rootSub = isRootSelected 
            ? (isEn ? 'Current location' : 'Ubicación actual') 
            : (isEn ? 'Main location' : 'Ubicación principal');

        html += `
            <div class="m3-folder-option-item ${isRootSelected ? 'is-selected' : ''}" data-value="">
                <div class="m3-folder-option-content">
                    <span class="material-symbols-outlined m3-folder-option-icon" style="color: #10B981; font-variation-settings: 'FILL' 1;">inventory_2</span>
                    <div class="m3-folder-option-text-group">
                        <span class="m3-folder-option-name">${rootTitle}</span>
                        <span class="m3-folder-option-sub">${rootSub}</span>
                    </div>
                </div>
                <div class="m3-folder-option-right">
                    <span class="m3-folder-option-badge">${soloTu}</span>
                    <span class="material-symbols-outlined m3-folder-check-icon">check</span>
                </div>
            </div>
        `;

        // 2. Carpetas existentes
        const counts = getRecipeCounts();
        foldersList.forEach(folder => {
            const isSelected = currentSelectedValue.toLowerCase() === folder.toLowerCase();
            const count = counts.get(folder.toLowerCase()) || 0;
            const countLabel = count > 0 
                ? `${count} ${count === 1 ? (isEn ? 'recipe' : 'receta') : (isEn ? 'recipes' : 'recetas')}`
                : (isEn ? 'Folder' : 'Carpeta');

            html += `
                <div class="m3-folder-option-item ${isSelected ? 'is-selected' : ''}" data-value="${folder}">
                    <div class="m3-folder-option-content">
                        <span class="material-symbols-outlined m3-folder-option-icon" style="color: #10B981; font-variation-settings: 'FILL' 1;">folder</span>
                        <div class="m3-folder-option-text-group">
                            <span class="m3-folder-option-name" title="${folder}">${folder}</span>
                            <span class="m3-folder-option-sub">${countLabel}</span>
                        </div>
                    </div>
                    <div class="m3-folder-option-right">
                        <span class="m3-folder-option-badge">${soloTu}</span>
                        <span class="material-symbols-outlined m3-folder-check-icon">check</span>
                    </div>
                </div>
            `;
        });

        // 3. Separador y Crear Nueva Carpeta
        html += `
            <div class="m3-folder-divider"></div>
            <div class="m3-folder-option-item m3-folder-option-create" data-value="__NEW__">
                <div class="m3-folder-option-content">
                    <span class="material-symbols-outlined m3-folder-option-icon" style="color: #10B981; font-variation-settings: 'FILL' 1;">create_new_folder</span>
                    <div class="m3-folder-option-text-group">
                        <span class="m3-folder-option-name">${isEn ? 'Crear nueva carpeta...' : 'Crear nueva carpeta...'}</span>
                        <span class="m3-folder-option-sub">${isEn ? 'Custom folder' : 'Carpeta personalizada'}</span>
                    </div>
                </div>
                <div class="m3-folder-option-right">
                    <span class="material-symbols-outlined m3-folder-check-icon">check</span>
                </div>
            </div>
        `;

        itemsContainer.innerHTML = html;

        // Añadir listeners a cada opción
        itemsContainer.querySelectorAll('.m3-folder-option-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = item.getAttribute('data-value');
                setValue(val);
                closeMenu();
                if (val === '__NEW__' && newFolderInput) {
                    setTimeout(() => newFolderInput.focus(), 120);
                }
            });
        });
    }

    function updateTriggerDisplay() {
        const textEl = trigger.querySelector('.m3-folder-selected-text');
        const iconEl = trigger.querySelector('.m3-folder-icon');
        const isEn = window.i18n && window.i18n.getLang() === 'en';

        if (currentSelectedValue === '__NEW__') {
            if (textEl) textEl.textContent = isEn ? 'Crear nueva carpeta...' : 'Crear nueva carpeta...';
            if (iconEl) {
                iconEl.textContent = 'create_new_folder';
                iconEl.style.color = '#10B981';
            }
            if (newFolderBox) newFolderBox.classList.remove('hidden');
        } else if (!currentSelectedValue) {
            if (textEl) textEl.textContent = isEn ? 'Main Pantry (Root)' : 'Despensa Principal (Raíz)';
            if (iconEl) {
                iconEl.textContent = 'inventory_2';
                iconEl.style.color = '#10B981';
            }
            if (newFolderBox) newFolderBox.classList.add('hidden');
        } else {
            if (textEl) textEl.textContent = currentSelectedValue;
            if (iconEl) {
                iconEl.textContent = 'folder';
                iconEl.style.color = '#10B981';
            }
            if (newFolderBox) newFolderBox.classList.add('hidden');
        }

        renderItems();
    }

    function setValue(val) {
        currentSelectedValue = val;
        select.value = val;
        select.dispatchEvent(new Event('change'));
        updateTriggerDisplay();
        if (typeof onFolderChange === 'function') {
            onFolderChange(val);
        }
    }

    function openMenu() {
        wrapper.classList.add('is-open');
        menu.classList.remove('hidden');
        trigger.setAttribute('aria-expanded', 'true');
        setTimeout(() => {
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    }

    function closeMenu() {
        wrapper.classList.remove('is-open');
        menu.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
    }

    function toggleMenu() {
        if (menu.classList.contains('hidden')) {
            openMenu();
        } else {
            closeMenu();
        }
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });

    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleMenu();
        } else if (e.key === 'Escape') {
            closeMenu();
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            closeMenu();
        }
    });

    function setFolders(newFolders) {
        foldersList = (newFolders || []).filter(f => f && typeof f === 'string' && f.trim());
        renderItems();
        updateTriggerDisplay();
    }

    // Inicialización inmediata
    renderItems();
    updateTriggerDisplay();

    return {
        setFolders,
        setValue,
        getValue: () => currentSelectedValue
    };
};
