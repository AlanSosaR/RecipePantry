// js/notas.js
(function() {
    class NotasManager {
        constructor() {
            this.notes = [];
            this.currentNote = null;
            this.checklistItems = [];
            this.loading = true;
            this.searchQuery = '';
            this.viewMode = localStorage.getItem('notes_view_mode') || 'grid';
            this.init();
        }

        async init() {
            // Wait for auth to be ready
            if (window.authManager && window.authManager.initialized) {
                this.setup();
            } else {
                window.addEventListener('auth-ready', () => this.setup());
            }
        }

        async setup() {
            const ok = await window.authManager.requireAuth();
            if (!ok) return;
            const user = window.authManager.currentUser;

            this.updateAvatar(user);

            if (window.notificationManager && typeof window.notificationManager.init === 'function') {
                window.notificationManager.init().catch(e => console.warn('Notif init:', e));
            }

            const path = window.location.pathname;

            if (path.includes('nota-form')) {
                this.initFormView();
                return;
            }

            // List view logic
            if (path.includes('notas.html') || path.includes('/notas')) {
                // We don't strictly need window.db for notes, but we log if it's missing for recipes
                if (!window.db) {
                    console.warn("DatabaseManager (db) not yet ready, but proceeding with notes fetch.");
                }
                this.applyViewModeUI();
                this.initListView();
                window.addEventListener('popstate', () => {
                    if (this.isKeepModalOpen && !this.isModalClosing) {
                        this.closeKeepModal(true, true);
                    }
                });
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        if (this.isKeepModalOpen) {
                            this.closeKeepModal(true);
                            return;
                        }
                        this.closeFabMenu();
                        this.closeNewDropboxMenu();
                    }
                });
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('#newDropboxMenu') && !e.target.closest('#btnNewNoteTop')) {
                        this.closeNewDropboxMenu();
                    }
                });
            }
        }

        // ── Avatar: reusar la misma lógica de Recetas (ui.js) ─────────────
        async updateAvatar(user) {
            const greetingEl = document.getElementById('sidebar-user-greeting');
            const authUser = window.authManager.session?.user;

            try {
                // Ensure we have the user profile
                if (!user || (!user.avatar_url && !user.first_name)) {
                    const searchId = user?.auth_user_id || user?.id || authUser?.id;
                    if (searchId) {
                        const { data: profile } = await window.supabaseClient
                            .from('users')
                            .select('first_name, last_name, prefix, avatar_url')
                            .eq('auth_user_id', searchId)
                            .maybeSingle();

                        if (profile) {
                            window.authManager.currentUser = {
                                ...window.authManager.currentUser,
                                ...profile
                            };
                            user = window.authManager.currentUser;
                        }
                    }
                }

                if (user) {
                    const prefix = user.prefix || 'Chef';
                    const fName  = user.first_name || '';
                    const lName  = user.last_name  || '';
                    let fullName = `${prefix} ${fName} ${lName}`.replace(/\s+/g, ' ').trim();
                    if (!fName && !lName) fullName = prefix;
                    if (greetingEl) greetingEl.textContent = fullName;
                }
            } catch (e) {
                console.warn("Avatar update error:", e);
            }

            if (window.updateGlobalUserUI) window.updateGlobalUserUI();
        }

        getNotesCacheKey(userId) {
            return `pantry_notes_cache_${userId}`;
        }

        getNotesFromCache(userId) {
            if (!userId) return null;
            try {
                const raw = localStorage.getItem(this.getNotesCacheKey(userId));
                return raw ? JSON.parse(raw) : null;
            } catch (_) {
                return null;
            }
        }

        setNotesToCache(userId, notes) {
            if (!userId || !notes) return;
            try {
                localStorage.setItem(this.getNotesCacheKey(userId), JSON.stringify(notes));
            } catch (_) {}
        }

        updateNoteInCache(userId, updatedNote) {
            if (!userId || !updatedNote || !updatedNote.id) return;
            try {
                let list = this.getNotesFromCache(userId) || [];
                const idx = list.findIndex(n => n.id === updatedNote.id);
                if (idx !== -1) {
                    list[idx] = { ...list[idx], ...updatedNote, updated_at: updatedNote.updated_at || new Date().toISOString() };
                } else {
                    list.unshift(updatedNote);
                }
                this.setNotesToCache(userId, list);
            } catch (_) {}
        }

        removeNoteFromCache(userId, noteId) {
            if (!userId || !noteId) return;
            try {
                let list = this.getNotesFromCache(userId) || [];
                list = list.filter(n => n.id !== noteId);
                this.setNotesToCache(userId, list);
            } catch (_) {}
        }

        async initListView() {
            const user = window.authManager.currentUser;
            if (!user) {
                console.error("No user found in authManager");
                return;
            }
            const userId = user.auth_user_id || user.id;

            // ── 1. MOSTRAR INMEDIATAMENTE DESDE LOCALSTORAGE (0ms, INSTANTÁNEO) ──
            const cachedNotes = this.getNotesFromCache(userId);
            if (cachedNotes && Array.isArray(cachedNotes) && cachedNotes.length > 0) {
                this.notes = cachedNotes;
                this.applyCustomOrder();
                this.showLoading(false);
                this.renderNotesList();
            } else {
                this.showLoading(true);
            }

            // ── 2. Función de carga real desde Supabase en segundo plano ──
            const fetchNotes = async (silent = false) => {
                try {
                    const { data: remoteNotes, error } = await window.supabaseClient
                        .from('notes')
                        .select('*, note_items(*)')
                        .eq('user_id', userId)
                        .order('is_pinned', { ascending: false })
                        .order('order_index', { ascending: true })
                        .order('created_at', { ascending: false });

                    if (error) throw error;
                    if (remoteNotes) {
                        const localCached = this.getNotesFromCache(userId) || [];
                        const localMap = new Map(localCached.map(n => [n.id, n]));

                        const merged = remoteNotes.map(rn => {
                            const ln = localMap.get(rn.id);
                            if (ln && ln.updated_at && (!rn.updated_at || new Date(ln.updated_at) > new Date(rn.updated_at))) {
                                return { ...rn, ...ln };
                            }
                            return rn;
                        });

                        const remoteIds = new Set(remoteNotes.map(n => n.id));
                        localCached.forEach(ln => {
                            if (!remoteIds.has(ln.id)) {
                                merged.unshift(ln);
                            }
                        });

                        this.notes = merged;
                        this.setNotesToCache(userId, this.notes);
                        this.applyCustomOrder();
                        this.renderNotesList();
                    }
                } catch (err) {
                    console.error('Error fetching notes:', err);
                    if (!silent && (!this.notes || this.notes.length === 0)) {
                        if (window.uiManager) window.uiManager.showToast('Error al cargar las notas.', 'error');
                    }
                } finally {
                    this.showLoading(false);
                }
            };

            await fetchNotes();

            // ── 3. Actualización automática instantánea en BFCache / Cambios de foco ──
            const refreshInstant = () => {
                const fresh = this.getNotesFromCache(userId);
                if (fresh && fresh.length > 0) {
                    this.notes = fresh;
                    this.applyCustomOrder();
                    this.renderNotesList();
                }
                fetchNotes(true);
            };

            window.addEventListener('pageshow', refreshInstant);
            window.addEventListener('focus', refreshInstant);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') refreshInstant();
            });
            window.addEventListener('storage', (e) => {
                if (e.key && e.key.includes('pantry_notes_cache')) refreshInstant();
            });

            // ── Wire up search input ──
            const searchInput = document.getElementById('searchInput') || document.querySelector('.notas-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchQuery = e.target.value.trim().toLowerCase();
                    this.renderNotesList();
                });
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        searchInput.value = '';
                        this.searchQuery = '';
                        this.renderNotesList();
                        searchInput.blur();
                    }
                });
            }
        }

        // ── Vista de Lista / Cuadrícula estilo Google Keep ──
        toggleViewMode() {
            this.viewMode = (this.viewMode === 'list') ? 'grid' : 'list';
            localStorage.setItem('notes_view_mode', this.viewMode);
            this.applyViewModeUI();
        }

        applyViewModeUI() {
            const isList = (this.viewMode === 'list');
            const btn = document.getElementById('btnViewMode');
            const icon = document.getElementById('viewModeIcon');
            const container = document.getElementById('notas-main-container');

            if (container) {
                if (isList) {
                    container.classList.add('view-list');
                } else {
                    container.classList.remove('view-list');
                }
            }

            if (btn) {
                btn.title = isList ? 'Vista de cuadrícula' : 'Vista de lista';
                btn.setAttribute('aria-label', btn.title);
            }
            if (icon) {
                icon.textContent = isList ? 'grid_view' : 'view_agenda';
            }
        }

        // ── Fijar / Desfijar nota desde la lista ──
        async togglePinNote(noteId, event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            const note = this.notes.find(n => n.id === noteId);
            if (!note) return;

            note.is_pinned = !note.is_pinned;

            const user = window.authManager?.currentUser;
            const userId = user?.auth_user_id || user?.id;
            if (userId) {
                this.updateNoteInCache(userId, note);
            }

            this.applyCustomOrder();
            this.renderNotesList();

            try {
                await window.supabaseClient
                    .from('notes')
                    .update({ is_pinned: note.is_pinned })
                    .eq('id', noteId);
            } catch (e) {
                console.warn('Error saving pin state:', e);
            }
        }

        formatNoteContent(content) {
            if (!content) return '';
            const cleanContent = typeof content === 'string' ? content.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n') : content;
            const escaped = this.escapeHTML(cleanContent);
            const urlRegex = /(https?:\/\/[^\s<]+)/g;
            return escaped.replace(urlRegex, (url) => {
                return `<a href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${url}</a>`;
            });
        }

        createCardElement(note) {
            const card = document.createElement('div');
            card.className = 'note-card';
            card.dataset.noteId = note.id;
            card.dataset.id = note.id;
            card.setAttribute('data-id', note.id);
            card.setAttribute('data-note-id', note.id);
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');

            const bgColor = note.color || 'transparent';
            if (bgColor !== 'transparent') {
                card.style.backgroundColor = bgColor;
                card.style.borderColor = 'rgba(0,0,0,0.12)';
            }

            let contentHtml = '';
            if (note.type === 'text') {
                contentHtml = `<p class="note-text">${this.formatNoteContent(note.content || '')}</p>`;
            } else {
                const items = (note.note_items || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                if (items.length > 0) {
                    contentHtml = `<div class="note-items-preview">
                        ${items.map(item => `
                            <div class="note-checklist-item ${item.is_completed ? 'completed' : ''}">
                                <span class="material-symbols-outlined">
                                    ${item.is_completed ? 'check_box' : 'check_box_outline_blank'}
                                </span>
                                <span>${this.escapeHTML(item.content || '')}</span>
                            </div>
                        `).join('')}
                    </div>`;
                } else {
                    contentHtml = `<div class="note-items-preview">
                        <div class="note-checklist-item" style="color:#80868b; font-style:italic;">
                            <span class="material-symbols-outlined">check_box_outline_blank</span>
                            <span>Lista vacía</span>
                        </div>
                    </div>`;
                }
            }

            card.innerHTML = `
                <button type="button" class="note-pin-btn ${note.is_pinned ? 'pinned' : ''}" 
                    title="${note.is_pinned ? 'Desfijar nota' : 'Fijar nota'}" 
                    onclick="event.preventDefault(); event.stopPropagation(); window.notasManager.togglePinNote('${note.id}', event)">
                    <span class="material-symbols-outlined">${note.is_pinned ? 'push_pin' : 'push_pin'}</span>
                </button>
                ${note.title ? `<h3 class="note-title">${this.escapeHTML(note.title)}</h3>` : ''}
                <div class="note-content-wrapper">
                    ${contentHtml}
                </div>
                <div class="note-card-footer">
                    <button type="button" class="note-action-btn color-btn" title="Cambiar color" 
                        onclick="event.preventDefault(); event.stopPropagation(); window.notasManager.showColorPalette(event, '${note.id}')">
                        <span class="material-symbols-outlined">palette</span>
                    </button>
                    <button type="button" class="note-action-btn delete-btn" title="Eliminar nota" 
                        onclick="event.preventDefault(); event.stopPropagation(); window.notasManager.deleteNotePrompt('${note.id}')">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            `;

            const openNote = (e) => {
                if (this.isDragging || this.justDragged) return;
                if (e.target.closest('.note-card-footer') || e.target.closest('.note-action-btn') || e.target.closest('.note-pin-btn') || e.target.closest('.note-color-palette') || e.target.closest('#note-color-palette') || e.target.closest('a')) return;
                
                // Abrir con efecto Google Keep expansivo desde la tarjeta
                this.openKeepModal(note.id, 'text', card);
            };

            card.addEventListener('click', openNote);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openNote(e);
                }
            });

            return card;
        }

        renderNotesList() {
            const grid = document.getElementById('notes-grid');
            const emptyState = document.getElementById('empty-state');

            if (!grid || !emptyState) return;

            this.applyViewModeUI();

            const q = (this.searchQuery || '').trim().toLowerCase();
            const filtered = q
                ? this.notes.filter(n => {
                    const inTitle   = (n.title   || '').toLowerCase().includes(q);
                    const inContent = (n.content || '').toLowerCase().includes(q);
                    const inItems   = (n.note_items || []).some(i => (i.content || '').toLowerCase().includes(q));
                    return inTitle || inContent || inItems;
                })
                : this.notes;

            if (this.notes.length === 0) {
                grid.style.display = 'none';
                emptyState.style.display = 'flex';
                return;
            }

            if (filtered.length === 0) {
                grid.style.display = 'none';
                emptyState.style.display = 'flex';
                emptyState.innerHTML = `
                    <div class="notas-empty-icon-circle">
                        <span class="material-symbols-outlined">search_off</span>
                    </div>
                    <h2 class="notas-empty-title">Sin resultados</h2>
                    <p class="notas-empty-desc">No encontramos notas para "${this.escapeHTML(q)}"</p>
                `;
                return;
            }

            if (!emptyState.querySelector('.notas-empty-actions') && this.notes.length > 0) {
                emptyState.innerHTML = `
                    <div class="notas-empty-icon-circle">
                        <span class="material-symbols-outlined">menu_book</span>
                    </div>
                    <h2 class="notas-empty-title" data-i18n="notesEmptyTitle">Tu viaje culinario comienza aquí</h2>
                    <p class="notas-empty-desc" data-i18n="notesEmptyDesc">
                        Captura tus recetas e ideas para construir tu recetario digital personal.
                    </p>
                    <div class="notas-empty-actions">
                        <button class="notas-btn-primary" onclick="window.notasManager.createNewNote('checklist')">
                            <span class="material-symbols-outlined">checklist</span>
                            <span>Capturar ingredientes</span>
                        </button>
                        <button class="notas-btn-tonal" onclick="window.notasManager.createNewNote('text')">
                            <span>Nota rápida</span>
                        </button>
                    </div>
                `;
            }

            emptyState.style.display = 'none';
            grid.style.display = 'flex';
            grid.style.flexDirection = 'column';
            grid.innerHTML = '';

            const pinnedNotes = filtered.filter(n => n.is_pinned);
            const otherNotes = filtered.filter(n => !n.is_pinned);

            if (pinnedNotes.length > 0) {
                const pinnedTitle = document.createElement('h4');
                pinnedTitle.className = 'notes-section-title';
                pinnedTitle.textContent = 'FIJADAS';
                grid.appendChild(pinnedTitle);

                const pinnedGrid = document.createElement('div');
                pinnedGrid.className = 'notes-cards-container recipe-masonry';
                pinnedGrid.id = 'pinned-notes-container';
                pinnedNotes.forEach(n => pinnedGrid.appendChild(this.createCardElement(n)));
                grid.appendChild(pinnedGrid);

                if (otherNotes.length > 0) {
                    const otherTitle = document.createElement('h4');
                    otherTitle.className = 'notes-section-title';
                    otherTitle.textContent = 'OTRAS';
                    grid.appendChild(otherTitle);

                    const otherGrid = document.createElement('div');
                    otherGrid.className = 'notes-cards-container recipe-masonry';
                    otherGrid.id = 'other-notes-container';
                    otherNotes.forEach(n => otherGrid.appendChild(this.createCardElement(n)));
                    grid.appendChild(otherGrid);
                }
            } else {
                const allGrid = document.createElement('div');
                allGrid.className = 'notes-cards-container recipe-masonry';
                allGrid.id = 'all-notes-container';
                otherNotes.forEach(n => allGrid.appendChild(this.createCardElement(n)));
                grid.appendChild(allGrid);
            }
 
            // ── Efecto Google Keep: animación de asentamiento al volver ──
            try {
                const settleId = sessionStorage.getItem('settle_note_id');
                if (settleId) {
                    sessionStorage.removeItem('settle_note_id');
                    sessionStorage.removeItem('open_note_rect');
                    sessionStorage.removeItem('open_note_id');
                    const targetCard = grid.querySelector(`.note-card[data-id="${settleId}"]`);
                    if (targetCard) {
                        targetCard.classList.add('note-card--settle');
                        setTimeout(() => targetCard.classList.remove('note-card--settle'), 400);
                    }
                }
            } catch (_) {}

            this.setupDragAndDrop();
        }

        setupDragAndDrop() {
            const containers = document.querySelectorAll('.notes-cards-container');
            if (!containers.length) return;

            containers.forEach(container => {
                container.querySelectorAll('.note-card').forEach(card => {
                    // Evitar arrastre nativo de HTML5 para no interferir con el levantamiento personalizado
                    card.removeAttribute('draggable');

                    let placeholder = null;
                    let offsetX = 0, offsetY = 0;
                    let hasLifted = false;
                    let touchHoldTimer = null;
                    let touchMovedFar = false;
                    let startX = 0, startY = 0;

                    const scrollArea = document.querySelector('.notas-scroll-area') || window;

                    const startLift = (clientX, clientY) => {
                        if (hasLifted || this.isDragging) return;
                        hasLifted = true;
                        this.isDragging = true;

                        const rect = card.getBoundingClientRect();
                        offsetX = clientX - rect.left;
                        offsetY = clientY - rect.top;

                        // Asegurar fondo 100% sólido y opaco idéntico a Google Keep (para que se vea toda la tarjeta y no sólo las letras)
                        const computedStyle = window.getComputedStyle(card);
                        const currentBg = card.style.backgroundColor || computedStyle.backgroundColor;
                        if (!currentBg || currentBg === 'transparent' || currentBg === 'rgba(0, 0, 0, 0)') {
                            const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
                            card.style.backgroundColor = isDark ? '#202124' : '#ffffff';
                            card.dataset.hadAutoBg = 'true';
                        }

                        // Crear hueco/placeholder con las dimensiones exactas de la tarjeta
                        placeholder = document.createElement('div');
                        placeholder.className = 'note-card-placeholder';
                        placeholder.style.height = `${rect.height}px`;
                        placeholder.style.minHeight = `${rect.height}px`;
                        placeholder.dataset.noteId = card.dataset.noteId;

                        card.parentElement.insertBefore(placeholder, card);

                        // Levantar tarjeta para que flote por encima de todas las demás
                        card.classList.add('note-card--floating');
                        card.style.width = `${rect.width}px`;
                        card.style.height = `${rect.height}px`;
                        card.style.left = `${clientX - offsetX}px`;
                        card.style.top = `${clientY - offsetY}px`;
                        document.body.appendChild(card);
                        document.body.classList.add('notes-is-reordering');
                    };

                    const moveLift = (clientX, clientY) => {
                        if (!hasLifted) return;

                        // Mover la tarjeta con el cursor o el dedo
                        card.style.left = `${clientX - offsetX}px`;
                        card.style.top = `${clientY - offsetY}px`;

                        // Auto-scroll al acercarse a los bordes de la pantalla
                        if (scrollArea && scrollArea.scrollTop !== undefined) {
                            const scrollRect = scrollArea.getBoundingClientRect();
                            if (clientY < scrollRect.top + 60) {
                                scrollArea.scrollTop -= 12;
                            } else if (clientY > scrollRect.bottom - 60) {
                                scrollArea.scrollTop += 12;
                            }
                        }

                        // Localizar tarjeta o contenedor debajo del punto
                        const hitEl = document.elementFromPoint(clientX, clientY);
                        let targetContainer = hitEl ? hitEl.closest('.notes-cards-container') : null;

                        // Si el cursor está sobre un título de sección o espacio vacío, encontrar contenedor más cercano
                        if (!targetContainer) {
                            const containers = Array.from(document.querySelectorAll('.notes-cards-container'));
                            if (containers.length === 1) {
                                targetContainer = containers[0];
                            } else if (containers.length > 1) {
                                let bestDist = Infinity;
                                containers.forEach(ct => {
                                    const r = ct.getBoundingClientRect();
                                    const dist = Math.abs(clientY - (r.top + r.height / 2));
                                    if (dist < bestDist) {
                                        bestDist = dist;
                                        targetContainer = ct;
                                    }
                                });
                            }
                        }

                        if (!targetContainer) return;

                        // Obtener tarjetas presentes en este contenedor (excluyendo la flotante)
                        const cards = Array.from(targetContainer.querySelectorAll('.note-card:not(.note-card--floating)'));
                        if (cards.length === 0) {
                            if (placeholder.parentElement !== targetContainer) {
                                targetContainer.appendChild(placeholder);
                            }
                            return;
                        }

                        // Determinar la posición de inserción adecuada (soporta filas/grid y lista)
                        let inserted = false;
                        for (let i = 0; i < cards.length; i++) {
                            const c = cards[i];
                            const rect = c.getBoundingClientRect();

                            // 1. Si el cursor está por encima de la tarjeta
                            const isAbove = clientY < rect.top;
                            // 2. Si el cursor está en la misma fila verticalmente:
                            const isWithinRow = (clientY >= rect.top && clientY <= rect.bottom);
                            const isLeftHalf = clientX < (rect.left + rect.width / 2);
                            const isUpperHalf = clientY < (rect.top + rect.height / 2);

                            if (isAbove || (isWithinRow && (isLeftHalf || isUpperHalf))) {
                                if (c.previousElementSibling !== placeholder) {
                                    c.before(placeholder);
                                }
                                inserted = true;
                                break;
                            }
                        }

                        if (!inserted) {
                            const lastCard = cards[cards.length - 1];
                            if (lastCard && lastCard.nextElementSibling !== placeholder) {
                                lastCard.after(placeholder);
                            }
                        }
                    };

                    const endLift = () => {
                        if (touchHoldTimer) clearTimeout(touchHoldTimer);

                        if (hasLifted) {
                            hasLifted = false;
                            this.isDragging = false;

                            // Quitar estilos de flotación
                            card.classList.remove('note-card--floating');
                            card.style.width = '';
                            card.style.height = '';
                            card.style.left = '';
                            card.style.top = '';
                            card.style.position = '';
                            card.style.zIndex = '';
                            card.style.margin = '';
                            if (card.dataset.hadAutoBg === 'true') {
                                card.style.backgroundColor = '';
                                delete card.dataset.hadAutoBg;
                            }

                            // Devolver la tarjeta a su lugar en el DOM ocupando el placeholder
                            if (placeholder && placeholder.parentElement) {
                                placeholder.parentElement.insertBefore(card, placeholder);
                                placeholder.remove();
                            }

                            document.body.classList.remove('notes-is-reordering');

                            this.justDragged = true;
                            setTimeout(() => { this.justDragged = false; }, 300);

                            // Sincronizar estado is_pinned si se movió entre FIJADAS y OTRAS
                            const pinnedContainer = document.getElementById('pinned-notes-container');
                            const otherContainer = document.getElementById('other-notes-container');
                            const noteObj = this.notes.find(n => n.id === card.dataset.noteId);
                            if (noteObj) {
                                if (pinnedContainer && pinnedContainer.contains(card) && !noteObj.is_pinned) {
                                    noteObj.is_pinned = true;
                                    const pinBtn = card.querySelector('.note-pin-btn');
                                    if (pinBtn) pinBtn.classList.add('pinned');
                                    window.supabaseClient?.from('notes').update({ is_pinned: true }).eq('id', noteObj.id).then(() => {});
                                } else if (otherContainer && otherContainer.contains(card) && noteObj.is_pinned) {
                                    noteObj.is_pinned = false;
                                    const pinBtn = card.querySelector('.note-pin-btn');
                                    if (pinBtn) pinBtn.classList.remove('pinned');
                                    window.supabaseClient?.from('notes').update({ is_pinned: false }).eq('id', noteObj.id).then(() => {});
                                }
                            }

                            this.syncNotesFromDOM();
                        }
                    };

                    // ── Soporte Ratón (PC) ──
                    card.addEventListener('mousedown', (e) => {
                        if (e.button !== 0) return;
                        if (e.target.closest('.note-action-btn') || e.target.closest('.note-pin-btn') || e.target.closest('a') || e.target.closest('button')) return;

                        startX = e.clientX;
                        startY = e.clientY;
                        let moved = false;

                        const onMouseMove = (moveEvt) => {
                            if (!moved) {
                                if (Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY) > 5) {
                                    moved = true;
                                    startLift(startX, startY);
                                }
                            }
                            if (moved) {
                                moveLift(moveEvt.clientX, moveEvt.clientY);
                            }
                        };

                        const onMouseUp = () => {
                            window.removeEventListener('mousemove', onMouseMove);
                            window.removeEventListener('mouseup', onMouseUp);
                            if (moved) {
                                endLift();
                            }
                        };

                        window.addEventListener('mousemove', onMouseMove);
                        window.addEventListener('mouseup', onMouseUp);
                    });

                    // ── Soporte Táctil (Móvil) ──
                    card.addEventListener('touchstart', (e) => {
                        if (e.target.closest('.note-action-btn') || e.target.closest('.note-pin-btn') || e.target.closest('a') || e.target.closest('button')) return;
                        const t = e.touches[0];
                        startX = t.clientX;
                        startY = t.clientY;
                        touchMovedFar = false;

                        touchHoldTimer = setTimeout(() => {
                            if (!touchMovedFar) {
                                startLift(startX, startY);
                                if (navigator.vibrate) navigator.vibrate(35);
                            }
                        }, 220);
                    }, { passive: true });

                    card.addEventListener('touchmove', (e) => {
                        const t = e.touches[0];
                        const dist = Math.hypot(t.clientX - startX, t.clientY - startY);

                        if (!hasLifted) {
                            if (dist > 8) {
                                touchMovedFar = true;
                                clearTimeout(touchHoldTimer);
                            }
                            return;
                        }

                        if (e.cancelable) e.preventDefault();
                        moveLift(t.clientX, t.clientY);
                    }, { passive: false });

                    const onTouchEnd = () => {
                        clearTimeout(touchHoldTimer);
                        if (hasLifted) {
                            endLift();
                        }
                    };

                    card.addEventListener('touchend', onTouchEnd);
                    card.addEventListener('touchcancel', onTouchEnd);
                });
            });
        }

        // ── Sincronizar y guardar orden personalizado ──
        syncNotesFromDOM() {
            const grid = document.getElementById('notes-grid');
            if (!grid) return;
            const domCards = Array.from(grid.querySelectorAll('.note-card'));
            const orderedIds = domCards.map(c => c.dataset.noteId).filter(Boolean);
            if (orderedIds.length === 0) return;

            const map = new Map(this.notes.map(n => [n.id, n]));
            const reordered = [];
            orderedIds.forEach(id => {
                if (map.has(id)) {
                    reordered.push(map.get(id));
                    map.delete(id);
                }
            });
            for (const rem of map.values()) {
                reordered.push(rem);
            }
            this.notes = reordered;

            const user = window.authManager?.currentUser;
            const userId = user?.auth_user_id || user?.id;
            if (userId) {
                this.setNotesToCache(userId, this.notes);
            }

            this.saveCustomOrder();
        }

        saveCustomOrder() {
            const user = window.authManager?.currentUser;
            const userId = user?.auth_user_id || user?.id;
            if (!userId || !this.notes) return;
            try {
                const ids = this.notes.map(n => n.id);
                localStorage.setItem(`notes_order_${userId}`, JSON.stringify(ids));
                // Persistir orden en Supabase si la columna existe
                ids.forEach((id, idx) => {
                    window.supabaseClient
                        ?.from('notes')
                        .update({ order_index: idx })
                        .eq('id', id)
                        .then(() => {})
                        .catch(() => {});
                });
            } catch (_) {}
        }

        applyCustomOrder() {
            const user = window.authManager?.currentUser;
            const userId = user?.auth_user_id || user?.id;
            if (!userId || !this.notes || this.notes.length === 0) return;
            try {
                const savedOrder = JSON.parse(localStorage.getItem(`notes_order_${userId}`) || '[]');
                if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
                    const orderMap = new Map();
                    savedOrder.forEach((id, index) => orderMap.set(id, index));
                    this.notes.sort((a, b) => {
                        if (a.is_pinned !== b.is_pinned) {
                            return a.is_pinned ? -1 : 1;
                        }
                        const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : (a.order_index ?? 999999);
                        const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : (b.order_index ?? 999999);
                        if (indexA !== indexB) return indexA - indexB;
                        return new Date(b.created_at) - new Date(a.created_at);
                    });
                } else {
                    this.notes.sort((a, b) => {
                        if (a.is_pinned !== b.is_pinned) {
                            return a.is_pinned ? -1 : 1;
                        }
                        const indexA = a.order_index ?? 999999;
                        const indexB = b.order_index ?? 999999;
                        if (indexA !== indexB) return indexA - indexB;
                        return new Date(b.created_at) - new Date(a.created_at);
                    });
                }
            } catch (_) {}
        }

        // ── Material 3 FAB Menu / Speed Dial ───────────────────────
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

        handleFabOption(type) {
            this.closeFabMenu();
            this.createNewNote(type);
        }

        // ─── Menú "Crear" Estilo Dropbox (Desktop) ──────────────────
        toggleNewDropboxMenu(e) {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            const menu = document.getElementById('newDropboxMenu');
            if (!menu) return;
            menu.classList.toggle('hidden');
        }

        closeNewDropboxMenu(e) {
            if (e) e.stopPropagation();
            const menu = document.getElementById('newDropboxMenu');
            if (menu) menu.classList.add('hidden');
        }

        handleNewOption(action) {
            this.closeNewDropboxMenu();
            this.createNewNote(action);
        }

        createNewNote(type) {
            const fab = document.getElementById('mainFabBtn') || document.querySelector('.fab-m3');
            this.openKeepModal(null, type, fab);
        }

        showColorPalette(event, noteId) {
            const btn = event.currentTarget;
            const card = btn.closest('.note-card');
            if (!card) return;

            // Si ya está abierta en esta misma tarjeta, cerrarla (toggle)
            if (card.classList.contains('note-card--palette-open')) {
                this.closeAllColorPalettes();
                return;
            }

            // Cerrar cualquier otra paleta abierta
            this.closeAllColorPalettes();

            // Marcar esta tarjeta como activa para que sus botones y borde resalten fijamente
            card.classList.add('note-card--palette-open');

            let palette = card.querySelector('.note-color-palette');
            if (!palette) {
                palette = document.createElement('div');
                palette.className = 'note-color-palette';
                card.appendChild(palette);
            }

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
            const note = this.notes.find(n => n.id === noteId);
            const currentColor = note?.color || 'transparent';

            const lightColors = [
                { name: 'Predeterminado', value: 'transparent' },
                { name: 'Coral', value: '#f28b82' },
                { name: 'Melocotón', value: '#fbbc04' },
                { name: 'Arena', value: '#fff475' },
                { name: 'Menta', value: '#ccff90' },
                { name: 'Turquesa', value: '#a7ffeb' },
                { name: 'Niebla', value: '#cbf0f8' },
                { name: 'Azul tormenta', value: '#aecbfa' },
                { name: 'Amatista', value: '#d7aefb' },
                { name: 'Rosa flor', value: '#fdcfe8' },
                { name: 'Arcilla', value: '#e6c9a8' },
                { name: 'Tiza', value: '#e8eaed' }
            ];

            const darkColors = [
                { name: 'Predeterminado', value: 'transparent' },
                { name: 'Coral oscuro', value: '#5c2b29' },
                { name: 'Melocotón oscuro', value: '#614a19' },
                { name: 'Arena oscuro', value: '#635d19' },
                { name: 'Menta oscura', value: '#345920' },
                { name: 'Turquesa oscuro', value: '#16504b' },
                { name: 'Niebla oscura', value: '#2d555e' },
                { name: 'Azul tormenta', value: '#1e3a5f' },
                { name: 'Amatista oscura', value: '#42275e' },
                { name: 'Rosa flor oscuro', value: '#5b2245' },
                { name: 'Arcilla oscura', value: '#442f19' },
                { name: 'Tiza oscura', value: '#3c3f41' }
            ];

            const colors = isDark ? darkColors : lightColors;

            palette.innerHTML = colors.map(c => {
                const isSelected = currentColor === c.value;
                const isDefault = c.value === 'transparent';
                const bg = isDefault ? (isDark ? '#202124' : '#ffffff') : c.value;
                return `
                    <div class="color-option ${isSelected ? 'active-color' : ''}" 
                         data-color-value="${c.value}"
                         style="background-color: ${bg}; ${isDefault ? 'border: 1px dashed #9aa0a6;' : ''}"
                         onclick="event.stopPropagation(); window.notasManager.updateNoteColor('${noteId}', '${c.value}')"
                         title="${c.name}">
                         ${isDefault ? '<span class="material-symbols-outlined" style="font-size: 14px; color: #5f6368;">format_color_reset</span>' : ''}
                         ${isSelected ? `
                             <span class="color-check-badge">
                                 <span class="material-symbols-outlined">check</span>
                             </span>
                         ` : ''}
                    </div>
                `;
            }).join('');

            palette.style.display = 'flex';

            // Comprobar si cabe debajo de la tarjeta o si debe abrirse hacia arriba
            const cardRect = card.getBoundingClientRect();
            const spaceBelow = window.innerHeight - cardRect.bottom;
            if (spaceBelow < 120) {
                palette.classList.add('palette-placement-top');
            } else {
                palette.classList.remove('palette-placement-top');
            }

            // Comprobar posición horizontal para que no se salga de los bordes de la pantalla
            const paletteWidth = 380;
            if (cardRect.left + paletteWidth > window.innerWidth - 16) {
                const shiftLeft = (cardRect.left + paletteWidth) - (window.innerWidth - 16);
                palette.style.left = `-${Math.max(0, shiftLeft)}px`;
            } else {
                palette.style.left = '4px';
            }

            const closePalette = (e) => {
                if (!card.contains(e.target)) {
                    this.closeAllColorPalettes();
                    document.removeEventListener('click', closePalette);
                }
            };

            setTimeout(() => {
                document.addEventListener('click', closePalette);
            }, 10);
        }

        closeAllColorPalettes() {
            document.querySelectorAll('.note-card--palette-open').forEach(c => {
                c.classList.remove('note-card--palette-open');
                const p = c.querySelector('.note-color-palette');
                if (p) p.remove();
            });
            const oldPalette = document.getElementById('note-color-palette');
            if (oldPalette) oldPalette.remove();
        }

        async updateNoteColor(noteId, color) {
            // No cerramos la paleta para que el usuario pueda seguir probando colores
            const user = window.authManager?.currentUser;
            const userId = user?.auth_user_id || user?.id;
            try {
                // Actualizar en memoria y cache
                const note = this.notes.find(n => n.id === noteId);
                if (note) note.color = color;
                if (userId) this.updateNoteInCache(userId, { id: noteId, color: color });

                // Aplicar color en vivo directamente a la tarjeta en el DOM
                const card = document.querySelector(`.note-card[data-note-id="${noteId}"]`);
                if (card) {
                    if (color === 'transparent') {
                        card.style.backgroundColor = '';
                        card.style.borderColor = '';
                    } else {
                        card.style.backgroundColor = color;
                        card.style.borderColor = 'rgba(0,0,0,0.12)';
                    }

                    // Actualizar el indicador de selección (insignia check) en la paleta abierta
                    const palette = card.querySelector('.note-color-palette');
                    if (palette) {
                        palette.querySelectorAll('.color-option').forEach(opt => {
                            opt.classList.remove('active-color');
                            const badge = opt.querySelector('.color-check-badge');
                            if (badge) badge.remove();
                            if (opt.dataset.colorValue === color) {
                                opt.classList.add('active-color');
                                const newBadge = document.createElement('span');
                                newBadge.className = 'color-check-badge';
                                newBadge.innerHTML = '<span class="material-symbols-outlined">check</span>';
                                opt.appendChild(newBadge);
                            }
                        });
                    }
                }

                // Guardar en Supabase en segundo plano
                window.supabaseClient
                    ?.from('notes')
                    .update({ color: color })
                    .eq('id', noteId)
                    .then(() => {})
                    .catch(err => console.error('Error saving color in Supabase:', err));

            } catch (err) {
                console.error('Error updating color:', err);
            }
        }

        deleteNotePrompt(id, isCurrent = false) {
            const deleteAction = () => this._performDelete(id, isCurrent);

            if (window.showActionSnackbar) {
                window.showActionSnackbar(
                    '¿Eliminar nota permanentemente?',
                    'Eliminar',
                    deleteAction
                );
            } else if (confirm('¿Estás seguro de que quieres eliminar esta nota?')) {
                deleteAction();
            }
        }

        _performDelete(id, isCurrent) {
            const user = window.authManager?.currentUser;
            const userId = user?.auth_user_id || user?.id;

            if (isCurrent) {
                if (userId) {
                    this.removeNoteFromCache(userId, id);
                    const list = (this.getNotesFromCache(userId) || []).filter(n => n.id !== id);
                    this.setNotesToCache(userId, list);
                    this.notes = list;
                    this.saveCustomOrder();
                }
                window.location.href = '/notas';
                window.supabaseClient.from('notes').delete().eq('id', id)
                    .then(({ error }) => {
                        if (error) console.error('Error al eliminar nota:', error);
                    });
                return;
            }

            // Lista de notas: quitar tarjeta de UI al instante (optimista)
            const removed = this.notes.find(n => n.id === id);
            this.notes = this.notes.filter(n => n.id !== id);
            if (userId) {
                this.removeNoteFromCache(userId, id);
                this.saveCustomOrder();
            }
            this.renderNotesList();
            if (window.uiManager) window.uiManager.showToast('Nota eliminada', 'success');

            // Confirmar en Supabase en segundo plano
            window.supabaseClient.from('notes').delete().eq('id', id)
                .then(({ error }) => {
                    if (error) {
                        console.error('Error al eliminar nota:', error);
                        if (removed) {
                            this.notes.unshift(removed);
                            if (userId) {
                                this.updateNoteInCache(userId, removed);
                                this.saveCustomOrder();
                            }
                            this.renderNotesList();
                        }
                        if (window.uiManager) window.uiManager.showToast('Error al eliminar', 'error');
                    }
                });
        }

        // ═══════════════════════════════════════════
        // GOOGLE KEEP FLOATING MODAL EDITOR METHODS
        // ═══════════════════════════════════════════

        openKeepModal(noteId, newType = 'text', originElement = null) {
            const backdrop = document.getElementById('keep-modal-backdrop');
            const card = document.getElementById('keep-modal-card');
            const titleInput = document.getElementById('modal-note-title');
            const contentArea = document.getElementById('modal-note-content');
            const checklistContainer = document.getElementById('modal-checklist-container');
            const pinBtn = document.getElementById('modal-pin-btn');

            if (!backdrop || !card) return;

            this.closeAllColorPalettes();
            this.isKeepModalOpen = true;
            this.isModalClosing = false;

            if (noteId) {
                const note = this.notes.find(n => n.id === noteId);
                this.activeModalNote = note ? JSON.parse(JSON.stringify(note)) : { id: noteId, type: 'text' };
            } else {
                this.activeModalNote = {
                    id: null,
                    title: '',
                    content: '',
                    type: newType,
                    color: 'transparent',
                    is_pinned: false,
                    note_items: []
                };
            }

            titleInput.value = this.activeModalNote.title || '';
            const type = this.activeModalNote.type || 'text';

            if (type === 'checklist') {
                contentArea.style.display = 'none';
                checklistContainer.style.display = 'flex';
                this.renderModalChecklist();

                if (noteId && (!this.activeModalNote.note_items || this.activeModalNote.note_items.length === 0)) {
                    window.supabaseClient
                        ?.from('note_items')
                        .select('*')
                        .eq('note_id', noteId)
                        .order('order_index', { ascending: true })
                        .then(({ data }) => {
                            if (data && this.isKeepModalOpen && this.activeModalNote?.id === noteId) {
                                this.activeModalNote.note_items = data;
                                const original = this.notes.find(n => n.id === noteId);
                                if (original) original.note_items = data;
                                this.renderModalChecklist();
                            }
                        });
                }
            } else {
                contentArea.style.display = 'block';
                checklistContainer.style.display = 'none';
                contentArea.value = this.activeModalNote.content || '';
                setTimeout(() => {
                    contentArea.style.height = 'auto';
                    contentArea.style.height = Math.max(120, contentArea.scrollHeight) + 'px';
                }, 20);
            }

            if (pinBtn) {
                pinBtn.classList.toggle('pinned', !!this.activeModalNote.is_pinned);
                pinBtn.title = this.activeModalNote.is_pinned ? 'Desfijar nota' : 'Fijar nota';
            }

            const typeIcon = document.getElementById('modal-type-icon');
            if (typeIcon) {
                typeIcon.textContent = type === 'checklist' ? 'description' : 'check_box';
            }

            const deleteBtn = document.getElementById('modal-delete-btn');
            if (deleteBtn) {
                deleteBtn.style.display = noteId ? 'flex' : 'none';
            }

            // Aplicar color de la nota (idéntico a Google Keep)
            this.applyModalColor(this.activeModalNote.color || 'transparent');

            if (!contentArea.oninput) {
                contentArea.oninput = () => {
                    contentArea.style.height = 'auto';
                    contentArea.style.height = Math.max(120, contentArea.scrollHeight) + 'px';
                };
            }

            // ANIMACIÓN EXPANSIVA GOOGLE KEEP (Tanto en PC como en Móvil)
            const origin = originElement || (noteId ? document.querySelector(`.note-card[data-id="${noteId}"], .note-card[data-note-id="${noteId}"]`) : null);
            this._activeOriginElement = origin;

            backdrop.classList.add('active');
            backdrop.style.display = 'flex';
            document.body.style.overflow = 'hidden';

            if (origin && origin.classList && origin.classList.contains('note-card')) {
                const originRect = origin.getBoundingClientRect();

                // Asegurar que medimos las dimensiones reales sin transformaciones previas
                card.style.transform = 'none';
                card.style.transition = 'none';
                const modalRect = card.getBoundingClientRect();

                const dx = originRect.left - modalRect.left;
                const dy = originRect.top - modalRect.top;
                const scaleX = Math.max(0.05, originRect.width / modalRect.width);
                const scaleY = Math.max(0.05, originRect.height / modalRect.height);

                origin.style.opacity = '0'; // Se oculta temporalmente la tarjeta para que la animación sea 1 sola pieza continua
                card.style.transformOrigin = 'top left';
                card.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
                card.style.borderRadius = '8px';
                card.style.overflow = 'hidden';

                backdrop.style.transition = 'none';
                backdrop.style.opacity = '0';

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        backdrop.style.transition = 'opacity 0.32s cubic-bezier(0.2, 0, 0, 1)';
                        backdrop.style.opacity = '1';

                        card.style.transition = 'transform 0.36s cubic-bezier(0.05, 0.7, 0.1, 1), border-radius 0.36s cubic-bezier(0.05, 0.7, 0.1, 1)';
                        card.style.transform = 'translate(0px, 0px) scale(1, 1)';
                        card.style.borderRadius = window.innerWidth <= 768 ? '0px' : '8px';

                        setTimeout(() => {
                            card.style.transition = '';
                            card.style.transform = '';
                            card.style.borderRadius = '';
                            card.style.overflow = '';
                            backdrop.style.transition = '';
                            backdrop.style.opacity = '';
                        }, 380);
                    });
                });
            } else {
                // Para nueva nota desde botón/FAB: animación Google Keep pop fade-up
                card.style.transformOrigin = 'center center';
                card.style.transition = 'none';
                card.style.transform = 'translateY(24px) scale(0.95)';
                card.style.opacity = '0';
                backdrop.style.transition = 'none';
                backdrop.style.opacity = '0';

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        backdrop.style.transition = 'opacity 0.28s ease';
                        backdrop.style.opacity = '1';

                        card.style.transition = 'transform 0.32s cubic-bezier(0.05, 0.7, 0.1, 1), opacity 0.28s ease';
                        card.style.transform = 'translate(0px, 0px) scale(1, 1)';
                        card.style.opacity = '1';

                        setTimeout(() => {
                            card.style.transition = '';
                            card.style.transform = '';
                            card.style.opacity = '';
                            backdrop.style.transition = '';
                            backdrop.style.opacity = '';
                        }, 340);
                    });
                });
            }

            try {
                history.pushState(
                    { keepModalOpen: true, noteId: noteId },
                    '',
                    window.innerWidth <= 768 ? (noteId ? `/nota-form?id=${encodeURIComponent(noteId)}` : '/nota-form') : window.location.href
                );
            } catch (_) {}

            setTimeout(() => {
                if (!noteId) {
                    titleInput.focus();
                }
            }, 60);
        }

        async closeKeepModal(save = true, fromPopstate = false) {
            if (!this.isKeepModalOpen || this.isModalClosing) return;
            this.isModalClosing = true;

            const backdrop = document.getElementById('keep-modal-backdrop');
            const card = document.getElementById('keep-modal-card');
            const modalPalette = document.getElementById('modal-color-palette');
            if (modalPalette) modalPalette.remove();
            this.closeFormColorBottomSheet();
            this.closeModalMoreMenu();

            if (!fromPopstate && history.state?.keepModalOpen) {
                try { history.replaceState({}, '', '/notas'); } catch (_) {}
            }

            if (!save || !this.activeModalNote) {
                this.finishModalClose(false);
                return;
            }

            const title = (document.getElementById('modal-note-title')?.value || '').trim();
            const type = this.activeModalNote.type || 'text';
            const content = type === 'text' ? (document.getElementById('modal-note-content')?.value || '').trim() : '';
            const items = type === 'checklist' ? (this.activeModalNote.note_items || []).filter(i => !i._deleted && (i.content || '').trim() !== '') : [];

            const hasContent = title !== '' || (type === 'text' && content !== '') || (type === 'checklist' && items.length > 0);

            if (!this.activeModalNote.id && !hasContent) {
                this.finishModalClose(false);
                return;
            }

            const user = window.authManager?.currentUser;
            const userId = user?.auth_user_id || user?.id;
            const noteId = this.activeModalNote.id;

            if (noteId) {
                if (!hasContent) {
                    // Si borró todo el contenido, auto-eliminar como Google Keep
                    if (userId) {
                        this.removeNoteFromCache(userId, noteId);
                        this.saveCustomOrder();
                    }
                    this.notes = this.notes.filter(n => n.id !== noteId);
                    window.supabaseClient?.from('notes').delete().eq('id', noteId).then(() => {});
                    this.finishModalClose(false);
                    return;
                }

                // Actualizar nota existente
                const note = this.notes.find(n => n.id === noteId);
                if (note) {
                    note.title = title || (type === 'text' ? 'Nota sin título' : 'Lista sin título');
                    note.type = type;
                    note.color = this.activeModalNote.color || 'transparent';
                    note.is_pinned = !!this.activeModalNote.is_pinned;
                    if (type === 'text') note.content = content;
                    if (type === 'checklist') note.note_items = items;
                    note.updated_at = new Date().toISOString();
                }

                this.applyCustomOrder();

                if (userId) {
                    this.updateNoteInCache(userId, {
                        id: noteId,
                        title: title || (type === 'text' ? 'Nota sin título' : 'Lista sin título'),
                        type: type,
                        content: type === 'text' ? content : '',
                        note_items: items,
                        color: this.activeModalNote.color || 'transparent',
                        is_pinned: !!this.activeModalNote.is_pinned,
                        updated_at: new Date().toISOString()
                    });
                }

                const updateData = {
                    title: title || (type === 'text' ? 'Nota sin título' : 'Lista sin título'),
                    type: type,
                    color: this.activeModalNote.color || 'transparent',
                    is_pinned: !!this.activeModalNote.is_pinned,
                    updated_at: new Date().toISOString()
                };
                if (type === 'text') updateData.content = content;

                window.supabaseClient
                    ?.from('notes')
                    .update(updateData)
                    .eq('id', noteId)
                    .then(() => {})
                    .catch(e => console.error('Error updating note:', e));

                if (type === 'checklist') {
                    const toDelete = (this.activeModalNote.note_items || []).filter(i => i._deleted && i.id).map(i => i.id);
                    if (toDelete.length > 0) {
                        window.supabaseClient.from('note_items').delete().in('id', toDelete).then(() => {});
                    }
                    items.forEach((item, idx) => {
                        const itemData = {
                            note_id: noteId,
                            content: item.content,
                            is_completed: !!item.is_completed,
                            order_index: idx
                        };
                        if (item.id && !String(item.id).startsWith('temp-')) {
                            window.supabaseClient.from('note_items').update(itemData).eq('id', item.id).then(() => {});
                        } else {
                            window.supabaseClient.from('note_items').insert([itemData]).then(() => {});
                        }
                    });
                }

                this.finishModalClose(true, noteId);
            } else {
                // Crear nueva nota inmediatamente
                const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('note-' + Date.now());
                const newNote = {
                    id: tempId,
                    title: title || (type === 'text' ? 'Nota sin título' : 'Lista sin título'),
                    type: type,
                    content: type === 'text' ? content : '',
                    note_items: items,
                    color: this.activeModalNote.color || 'transparent',
                    is_pinned: !!this.activeModalNote.is_pinned,
                    user_id: userId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                this.notes.unshift(newNote);
                this.applyCustomOrder();
                this.renderNotesList();

                if (userId) {
                    this.updateNoteInCache(userId, newNote);
                    this.saveCustomOrder();
                }

                const insertData = {
                    id: tempId,
                    title: newNote.title,
                    type: type,
                    user_id: userId,
                    color: newNote.color,
                    is_pinned: newNote.is_pinned,
                    updated_at: newNote.updated_at
                };
                if (type === 'text') insertData.content = content;

                window.supabaseClient
                    ?.from('notes')
                    .insert([insertData])
                    .then(() => {
                        if (type === 'checklist' && items.length > 0) {
                            const itemsData = items.map((it, idx) => ({
                                note_id: tempId,
                                content: it.content,
                                is_completed: !!it.is_completed,
                                order_index: idx
                            }));
                            window.supabaseClient.from('note_items').insert(itemsData).then(() => {});
                        }
                    })
                    .catch(e => console.error('Error creating note:', e));

                this.finishModalClose(true, tempId);
            }
        }

        finishModalClose(hasTargetNote, targetNoteId = null) {
            const backdrop = document.getElementById('keep-modal-backdrop');
            const card = document.getElementById('keep-modal-card');

            if (!backdrop || !card) {
                this.isKeepModalOpen = false;
                this.isModalClosing = false;
                this.activeModalNote = null;
                document.body.style.overflow = '';
                const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
                const metaTheme = document.querySelector('meta[name="theme-color"]');
                if (metaTheme) metaTheme.setAttribute('content', isDarkTheme ? '#202124' : '#ffffff');
                document.documentElement.style.backgroundColor = '';
                document.body.style.backgroundColor = '';
                this.closeModalMoreMenu();
                return;
            }

            // Google Keep FLIP shrink animation directa hacia la tarjeta en el grid (Tanto en PC como en Móvil)
            const targetCard = (hasTargetNote && targetNoteId)
                ? document.querySelector(`.note-card[data-id="${targetNoteId}"], .note-card[data-note-id="${targetNoteId}"]`)
                : null;
            const finalTarget = targetCard || ((hasTargetNote && this._activeOriginElement && this._activeOriginElement.isConnected) ? this._activeOriginElement : null);

            if (hasTargetNote && finalTarget) {
                finalTarget.style.opacity = '0'; // Se mantiene oculta hasta que aterriza la animación en su lugar exacto

                const targetRect = finalTarget.getBoundingClientRect();
                const modalRect = card.getBoundingClientRect();
                const dx = targetRect.left - modalRect.left;
                const dy = targetRect.top - modalRect.top;
                const scaleX = Math.max(0.05, targetRect.width / modalRect.width);
                const scaleY = Math.max(0.05, targetRect.height / modalRect.height);

                const header = card.querySelector('.keep-modal-header');
                const footer = card.querySelector('.keep-modal-footer');
                if (header) { header.style.transition = 'opacity 0.12s ease'; header.style.opacity = '0'; }
                if (footer) { footer.style.transition = 'opacity 0.12s ease'; footer.style.opacity = '0'; }

                card.style.transformOrigin = 'top left';
                card.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
                card.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
                card.style.borderRadius = '8px';
                card.style.overflow = 'hidden';

                backdrop.style.transition = 'opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1)';
                backdrop.style.opacity = '0';

                setTimeout(() => {
                    backdrop.classList.remove('active');
                    backdrop.style.display = 'none';
                    backdrop.style.opacity = '';
                    backdrop.style.transition = '';

                    card.style.transition = '';
                    card.style.transform = '';
                    card.style.borderRadius = '';
                    card.style.overflow = '';
                    if (header) { header.style.transition = ''; header.style.opacity = ''; }
                    if (footer) { footer.style.transition = ''; footer.style.opacity = ''; }

                    this.isKeepModalOpen = false;
                    this.isModalClosing = false;
                    this.activeModalNote = null;
                    document.body.style.overflow = '';
                    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
                    const metaTheme = document.querySelector('meta[name="theme-color"]');
                    if (metaTheme) metaTheme.setAttribute('content', isDarkTheme ? '#202124' : '#ffffff');
                    document.documentElement.style.backgroundColor = '';
                    document.body.style.backgroundColor = '';
                    this.closeModalMoreMenu();

                    // Actualizar el grid con los datos actualizados y asentar la tarjeta
                    this.renderNotesList();

                    const settled = document.querySelector(`.note-card[data-id="${targetNoteId}"], .note-card[data-note-id="${targetNoteId}"]`);
                    if (settled) {
                        settled.style.opacity = '1';
                        settled.classList.add('note-card--settle');
                        setTimeout(() => settled.classList.remove('note-card--settle'), 400);
                    }

                    if (this._activeOriginElement && this._activeOriginElement !== settled) {
                        this._activeOriginElement.style.opacity = '1';
                    }
                    this._activeOriginElement = null;
                }, 340);
                return;
            }

            // Si no hay tarjeta o está vacía / descartada (Google Keep slide down exit)
            card.style.transformOrigin = 'center center';
            card.style.transition = 'transform 0.30s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.28s ease';
            card.style.transform = 'translateY(40px) scale(0.92)';
            card.style.opacity = '0';
            backdrop.style.transition = 'opacity 0.28s ease';
            backdrop.style.opacity = '0';

            setTimeout(() => {
                backdrop.classList.remove('active');
                backdrop.style.display = 'none';
                backdrop.style.opacity = '';
                backdrop.style.transition = '';

                card.style.transition = '';
                card.style.transform = '';
                card.style.opacity = '';

                if (this._activeOriginElement) this._activeOriginElement.style.opacity = '1';
                this._activeOriginElement = null;

                this.isKeepModalOpen = false;
                this.isModalClosing = false;
                this.activeModalNote = null;
                document.body.style.overflow = '';
                const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
                const metaTheme = document.querySelector('meta[name="theme-color"]');
                if (metaTheme) metaTheme.setAttribute('content', isDarkTheme ? '#202124' : '#ffffff');
                document.documentElement.style.backgroundColor = '';
                document.body.style.backgroundColor = '';
                this.closeModalMoreMenu();
                this.renderNotesList();
            }, 300);
        }

        handleModalBackdropClick(event) {
            if (event.target === event.currentTarget) {
                this.closeKeepModal(true);
            }
        }

        toggleModalPin(event) {
            event?.stopPropagation();
            if (!this.activeModalNote) return;
            this.activeModalNote.is_pinned = !this.activeModalNote.is_pinned;
            const pinBtn = document.getElementById('modal-pin-btn');
            if (pinBtn) {
                pinBtn.classList.toggle('pinned', !!this.activeModalNote.is_pinned);
                pinBtn.title = this.activeModalNote.is_pinned ? 'Desfijar nota' : 'Fijar nota';
            }
        }

        applyModalColor(color) {
            if (!this.activeModalNote) return;
            this.activeModalNote.color = color;

            const card = document.getElementById('keep-modal-card');
            if (!card) return;

            const isCustom = color && color !== 'transparent';
            const isDark = isCustom ? this.isDarkColor(color) : (document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark');
            const defaultBg = isDark ? '#202124' : '#ffffff';
            const effectiveBg = isCustom ? color : defaultBg;

            if (isCustom) {
                card.style.setProperty('background-color', color, 'important');
                card.style.setProperty('border-color', isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)', 'important');
                card.classList.add('has-color');
            } else {
                card.style.removeProperty('background-color');
                card.style.removeProperty('border-color');
                card.classList.remove('has-color');
            }

            // Sincronizar theme-color del navegador (Pixel, Android gesture bar & status bar)
            let metaTheme = document.querySelector('meta[name="theme-color"]');
            if (!metaTheme) {
                metaTheme = document.createElement('meta');
                metaTheme.setAttribute('name', 'theme-color');
                document.head.appendChild(metaTheme);
            }
            metaTheme.setAttribute('content', effectiveBg);

            // En móvil, sincronizar también el fondo de html y body para que no haya franjas blancas en la barra de navegación del Pixel
            if (window.innerWidth <= 768) {
                document.documentElement.style.backgroundColor = effectiveBg;
                document.body.style.backgroundColor = effectiveBg;
            }

            // También actualizar el fondo del bottom sheet de color si está visible
            const sheet = document.getElementById('form-color-sheet');
            if (sheet) {
                sheet.style.setProperty('background-color', effectiveBg, 'important');
            }

            // También actualizar el fondo del menú de 3 puntos si está visible
            const moreSheet = document.getElementById('modal-more-sheet');
            if (moreSheet) {
                moreSheet.style.setProperty('background-color', effectiveBg, 'important');
                moreSheet.classList.toggle('dark-contrast', isDark);
            }

            card.classList.toggle('km-dark-contrast', isDark);
        }

        toggleModalNoteType(event) {
            event?.stopPropagation();
            if (!this.activeModalNote) return;

            const contentArea = document.getElementById('modal-note-content');
            const checklistContainer = document.getElementById('modal-checklist-container');
            const typeIcon = document.getElementById('modal-type-icon');

            const currentType = this.activeModalNote.type || 'text';

            if (currentType === 'text') {
                const rawText = contentArea ? contentArea.value : '';
                const lines = rawText.split('\n').filter(l => l.trim().length > 0);
                const newItems = lines.length > 0
                    ? lines.map((line, idx) => ({ id: 'temp-' + Date.now() + '-' + idx, content: line.trim(), is_completed: false }))
                    : [{ id: 'temp-' + Date.now() + '-0', content: '', is_completed: false }];

                this.activeModalNote.type = 'checklist';
                this.activeModalNote.note_items = newItems;

                if (contentArea) contentArea.style.display = 'none';
                if (checklistContainer) checklistContainer.style.display = 'flex';
                if (typeIcon) typeIcon.textContent = 'description';

                this.renderModalChecklist();
            } else {
                const items = (this.activeModalNote.note_items || []).filter(i => !i._deleted && (i.content || '').trim() !== '');
                const joinedText = items.map(i => i.content).join('\n');

                this.activeModalNote.type = 'text';
                this.activeModalNote.content = joinedText;

                if (checklistContainer) checklistContainer.style.display = 'none';
                if (contentArea) {
                    contentArea.style.display = 'block';
                    contentArea.value = joinedText;
                    contentArea.style.height = 'auto';
                    contentArea.style.height = Math.max(120, contentArea.scrollHeight) + 'px';
                }
                if (typeIcon) typeIcon.textContent = 'check_box';
            }
        }

        formatNoteEditedTime(dateString) {
            if (!dateString) return 'Editado recientemente';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Editado recientemente';

            const now = new Date();
            const isToday = date.toDateString() === now.toDateString();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');

            if (isToday) {
                return `Se editó hoy a las ${hours}:${minutes}`;
            }

            const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            const day = date.getDate();
            const month = months[date.getMonth()];
            const year = date.getFullYear();

            if (year === now.getFullYear()) {
                return `Se editó el ${day} ${month}`;
            }
            return `Se editó el ${day} ${month} ${year}`;
        }

        showModalMoreMenu(event) {
            event?.stopPropagation();
            if (!this.activeModalNote) return;

            if (document.getElementById('modal-more-sheet')) {
                this.closeModalMoreMenu();
                return;
            }

            const isDesktop = window.innerWidth > 768;
            const note = this.activeModalNote;
            const editTimeText = this.formatNoteEditedTime(note.updated_at || note.created_at);
            const isCustom = note.color && note.color !== 'transparent';
            const isDark = isCustom ? this.isDarkColor(note.color) : (document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark');

            const sheet = document.createElement('div');
            sheet.id = 'modal-more-sheet';
            sheet.className = `modal-more-sheet ${isDesktop ? 'desktop-popover' : ''} ${isDark ? 'dark-contrast' : ''}`;

            if (!isDesktop) {
                const defaultBg = isDark ? '#252628' : '#ffffff';
                const sheetBg = isCustom ? note.color : defaultBg;
                sheet.style.setProperty('background-color', sheetBg, 'important');
            }
            sheet.onclick = (e) => e.stopPropagation();

            sheet.innerHTML = `
                <div class="modal-more-header">${editTimeText}</div>
                <div class="modal-more-list">
                    <button type="button" class="modal-more-item" id="more-share-btn">
                        <span class="material-symbols-outlined">share</span>
                        <span>Compartir</span>
                    </button>
                    <button type="button" class="modal-more-item danger-item" id="more-delete-btn">
                        <span class="material-symbols-outlined">delete</span>
                        <span>Eliminar</span>
                    </button>
                </div>
            `;

            if (isDesktop) {
                const actionsRight = document.querySelector('.keep-modal-actions-right') || document.querySelector('.keep-modal-actions') || document.getElementById('keep-modal-card');
                if (actionsRight) {
                    actionsRight.style.position = 'relative';
                    actionsRight.appendChild(sheet);
                } else {
                    document.body.appendChild(sheet);
                }

                const moreBtn = document.getElementById('modal-more-btn');
                const closeOnDocClick = (e) => {
                    if (!sheet.contains(e.target) && (!moreBtn || !moreBtn.contains(e.target))) {
                        this.closeModalMoreMenu();
                        document.removeEventListener('click', closeOnDocClick, true);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeOnDocClick, true), 20);
            } else {
                const backdrop = document.createElement('div');
                backdrop.id = 'modal-more-backdrop';
                backdrop.className = 'modal-more-backdrop';
                backdrop.onclick = (e) => {
                    e.stopPropagation();
                    this.closeModalMoreMenu();
                };
                document.body.appendChild(backdrop);
                document.body.appendChild(sheet);
            }

            const shareBtn = sheet.querySelector('#more-share-btn');
            if (shareBtn) {
                shareBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.closeModalMoreMenu();
                    this.openShareModalForNote();
                };
            }

            const delBtn = sheet.querySelector('#more-delete-btn');
            if (delBtn) {
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.closeModalMoreMenu();
                    this.deleteModalNote();
                };
            }
        }

        closeModalMoreMenu() {
            const sheet = document.getElementById('modal-more-sheet');
            const backdrop = document.getElementById('modal-more-backdrop');
            if (!sheet && !backdrop) return;

            if (sheet) {
                if (sheet.classList.contains('desktop-popover')) {
                    sheet.remove();
                } else {
                    sheet.classList.add('closing');
                    setTimeout(() => sheet.remove(), 180);
                }
            }
            if (backdrop) {
                backdrop.style.opacity = '0';
                backdrop.style.transition = 'opacity 0.18s ease';
                setTimeout(() => backdrop.remove(), 180);
            }
        }

        async openShareModalForNote() {
            if (!this.activeModalNote) return;

            // Si la nota aún no tiene ID (es nueva en edición), persistirla primero
            if (!this.activeModalNote.id) {
                const title = (document.getElementById('modal-note-title')?.value || '').trim();
                const type = this.activeModalNote.type || 'text';
                const content = type === 'text' ? (document.getElementById('modal-note-content')?.value || '').trim() : '';
                const items = type === 'checklist' ? (this.activeModalNote.note_items || []).filter(i => !i._deleted && (i.content || '').trim() !== '') : [];

                const user = window.authManager?.currentUser;
                const userId = user?.auth_user_id || user?.id;
                const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('note-' + Date.now());

                const newNote = {
                    id: tempId,
                    user_id: userId,
                    title: title || (type === 'text' ? 'Nota sin título' : 'Lista sin título'),
                    content: type === 'text' ? content : '',
                    type: type,
                    color: this.activeModalNote.color || 'transparent',
                    is_pinned: !!this.activeModalNote.is_pinned,
                    note_items: items,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                this.activeModalNote.id = tempId;
                this.notes.unshift(newNote);
                if (userId) {
                    this.saveNoteToCache(userId, newNote);
                    this.saveCustomOrder();
                }

                if (window.supabaseClient) {
                    window.supabaseClient.from('notes').insert([{
                        id: tempId,
                        user_id: userId,
                        title: newNote.title,
                        content: newNote.content,
                        type: newNote.type,
                        color: newNote.color,
                        is_pinned: newNote.is_pinned
                    }]).then(() => {});
                }
            }

            const noteId = this.activeModalNote.id;
            if (!noteId) return;

            if (window.shareModal && typeof window.shareModal.open === 'function') {
                window.shareModal.open(noteId, 'note');
            } else {
                console.warn('Share modal no disponible');
            }
        }

        deleteModalNote() {
            if (!this.activeModalNote) return;
            const noteId = this.activeModalNote.id;
            this.closeKeepModal(false);
            if (noteId) {
                this.deleteNote(noteId);
            }
        }

        showModalColorPalette(event) {
            event?.stopPropagation();
            if (window.innerWidth <= 768) {
                this.showFormColorPalette(event);
                return;
            }
            const btn = document.getElementById('modal-color-btn');
            const footerActions = document.querySelector('.keep-modal-actions');
            if (!btn || !footerActions) return;

            let palette = document.getElementById('modal-color-palette');
            if (palette) {
                palette.remove();
                return;
            }

            palette = document.createElement('div');
            palette.id = 'modal-color-palette';
            palette.className = 'note-color-palette';

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
            const currentColor = this.activeModalNote?.color || 'transparent';

            const lightColors = [
                { name: 'Predeterminado', value: 'transparent' },
                { name: 'Coral', value: '#f28b82' },
                { name: 'Melocotón', value: '#fbbc04' },
                { name: 'Arena', value: '#fff475' },
                { name: 'Menta', value: '#ccff90' },
                { name: 'Turquesa', value: '#a7ffeb' },
                { name: 'Niebla', value: '#cbf0f8' },
                { name: 'Azul tormenta', value: '#aecbfa' },
                { name: 'Amatista', value: '#d7aefb' },
                { name: 'Rosa flor', value: '#fdcfe8' },
                { name: 'Arcilla', value: '#e6c9a8' },
                { name: 'Tiza', value: '#e8eaed' }
            ];

            const darkColors = [
                { name: 'Predeterminado', value: 'transparent' },
                { name: 'Coral oscuro', value: '#5c2b29' },
                { name: 'Melocotón oscuro', value: '#614a19' },
                { name: 'Arena oscuro', value: '#635d19' },
                { name: 'Menta oscura', value: '#345920' },
                { name: 'Turquesa oscuro', value: '#16504b' },
                { name: 'Niebla oscura', value: '#2d555e' },
                { name: 'Azul tormenta', value: '#1e3a5f' },
                { name: 'Amatista oscura', value: '#42275e' },
                { name: 'Rosa flor oscuro', value: '#5b2245' },
                { name: 'Arcilla oscura', value: '#442f19' },
                { name: 'Tiza oscura', value: '#3c3f41' }
            ];

            const colors = isDark ? darkColors : lightColors;

            palette.innerHTML = colors.map(c => {
                const isSelected = currentColor === c.value;
                const isDefault = c.value === 'transparent';
                const bg = isDefault ? (isDark ? '#202124' : '#ffffff') : c.value;
                return `
                    <div class="color-option ${isSelected ? 'active-color' : ''}" 
                         data-color-value="${c.value}"
                         style="background-color: ${bg}; ${isDefault ? 'border: 1px dashed #9aa0a6;' : ''}"
                         onclick="event.stopPropagation(); window.notasManager.selectModalColor('${c.value}')"
                         title="${c.name}">
                         ${isDefault ? '<span class="material-symbols-outlined" style="font-size: 14px; color: #5f6368;">format_color_reset</span>' : ''}
                         ${isSelected ? `
                             <span class="color-check-badge">
                                 <span class="material-symbols-outlined">check</span>
                             </span>
                         ` : ''}
                    </div>
                `;
            }).join('');

            palette.style.display = 'flex';
            footerActions.appendChild(palette);

            const closePalette = (ev) => {
                if (!palette.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
                    palette.remove();
                    document.removeEventListener('click', closePalette);
                }
            };
            setTimeout(() => document.addEventListener('click', closePalette), 10);
        }

        selectModalColor(color) {
            if (!this.activeModalNote) return;
            this.applyModalColor(color);

            const palette = document.getElementById('modal-color-palette');
            if (palette) {
                palette.querySelectorAll('.color-option').forEach(opt => {
                    opt.classList.remove('active-color');
                    const badge = opt.querySelector('.color-check-badge');
                    if (badge) badge.remove();
                    if (opt.dataset.colorValue === color) {
                        opt.classList.add('active-color');
                        const newBadge = document.createElement('span');
                        newBadge.className = 'color-check-badge';
                        newBadge.innerHTML = '<span class="material-symbols-outlined">check</span>';
                        opt.appendChild(newBadge);
                    }
                });
            }
        }

        deleteModalNote() {
            if (!this.activeModalNote?.id) {
                this.closeKeepModal(false);
                return;
            }
            const id = this.activeModalNote.id;
            this.closeKeepModal(false);
            this.deleteNotePrompt(id, false);
        }

        renderModalChecklist() {
            const container = document.getElementById('modal-checklist-items');
            if (!container || !this.activeModalNote) return;

            const items = (this.activeModalNote.note_items || []).filter(i => !i._deleted);
            container.innerHTML = items.map((item, idx) => `
                <div class="keep-modal-checklist-item ${item.is_completed ? 'completed' : ''}">
                    <div class="keep-modal-checkbox" onclick="window.notasManager.toggleModalChecklistItem(${idx})">
                        <span class="material-symbols-outlined">
                            ${item.is_completed ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                    </div>
                    <input type="text" class="keep-modal-item-input" value="${this.escapeHTML(item.content || '')}" 
                           oninput="window.notasManager.updateModalChecklistItem(${idx}, this.value)" 
                           onkeydown="if(event.key === 'Enter') { event.preventDefault(); window.notasManager.addModalChecklistItem(); }"
                           placeholder="Elemento de lista...">
                    <button type="button" class="keep-modal-item-del" onclick="window.notasManager.deleteModalChecklistItem(${idx})">
                        <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
                    </button>
                </div>
            `).join('');
        }

        addModalChecklistItem() {
            if (!this.activeModalNote) return;
            if (!this.activeModalNote.note_items) this.activeModalNote.note_items = [];
            this.activeModalNote.note_items.push({
                content: '',
                is_completed: false,
                order_index: this.activeModalNote.note_items.length
            });
            this.renderModalChecklist();
            setTimeout(() => {
                const inputs = document.querySelectorAll('.keep-modal-item-input');
                if (inputs.length > 0) inputs[inputs.length - 1].focus();
            }, 30);
        }

        toggleModalChecklistItem(idx) {
            if (!this.activeModalNote?.note_items) return;
            const activeItems = this.activeModalNote.note_items.filter(i => !i._deleted);
            if (activeItems[idx]) {
                activeItems[idx].is_completed = !activeItems[idx].is_completed;
                this.renderModalChecklist();
            }
        }

        updateModalChecklistItem(idx, val) {
            if (!this.activeModalNote?.note_items) return;
            const activeItems = this.activeModalNote.note_items.filter(i => !i._deleted);
            if (activeItems[idx]) {
                activeItems[idx].content = val;
            }
        }

        deleteModalChecklistItem(idx) {
            if (!this.activeModalNote?.note_items) return;
            const activeItems = this.activeModalNote.note_items.filter(i => !i._deleted);
            if (activeItems[idx]) {
                activeItems[idx]._deleted = true;
                this.renderModalChecklist();
            }
        }

        // --- Form View Methods ---

        isDarkColor(hex) {
            if (!hex || hex === 'transparent') return false;
            let c = hex.replace('#', '');
            if (c.length === 3) c = c.split('').map(x => x + x).join('');
            const r = parseInt(c.substr(0, 2), 16) || 0;
            const g = parseInt(c.substr(2, 2), 16) || 0;
            const b = parseInt(c.substr(4, 2), 16) || 0;
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return yiq < 135;
        }

        applyFormNoteColor(color) {
            if (!this.currentNote) this.currentNote = {};
            this.currentNote.color = color;

            const isCustom = color && color !== 'transparent';
            const isDark = isCustom ? this.isDarkColor(color) : false;

            const body = document.body;
            const mainArea = document.querySelector('.nf-main-area');
            const topBar = document.querySelector('.nf-topbar');
            const scrollArea = document.querySelector('.nf-scroll-area');
            const titleInput = document.getElementById('note-title');
            const contentInput = document.getElementById('note-content');
            const barTitle = document.getElementById('page-title');
            const divider = document.querySelector('.nf-divider');
            const backBtn = document.querySelector('.nf-btn-back');
            const pinBtn = document.getElementById('pin-save-btn');
            const colorBtn = document.getElementById('form-color-btn');

            const bottomBar = document.querySelector('.nf-bottom-bar');
            const sheet = document.getElementById('form-color-sheet');

            const root = document.documentElement;
            const metaTheme = document.querySelector('meta[name="theme-color"]');

            if (isCustom) {
                if (root) root.style.setProperty('background-color', color, 'important');
                if (body) body.style.setProperty('background-color', color, 'important');
                if (mainArea) mainArea.style.setProperty('background-color', color, 'important');
                if (topBar) {
                    topBar.style.setProperty('background-color', color, 'important');
                    topBar.style.borderBottom = 'none';
                    topBar.style.boxShadow = 'none';
                }
                if (scrollArea) scrollArea.style.setProperty('background-color', color, 'important');
                if (bottomBar) {
                    bottomBar.style.setProperty('background-color', color, 'important');
                    bottomBar.style.borderTop = 'none';
                }
                if (sheet) {
                    sheet.style.setProperty('background-color', color, 'important');
                }
                if (metaTheme) {
                    metaTheme.setAttribute('content', color);
                }

                if (titleInput) titleInput.style.color = isDark ? '#ffffff' : '#111827';
                if (contentInput) contentInput.style.color = isDark ? '#f3f4f6' : '#1f2937';
                if (barTitle) barTitle.style.color = isDark ? '#ffffff' : '#111827';

                if (divider) {
                    divider.style.background = isDark 
                        ? 'linear-gradient(to right, rgba(255,255,255,0.25), transparent)' 
                        : 'linear-gradient(to right, rgba(0,0,0,0.15), transparent)';
                }
                if (backBtn) {
                    backBtn.style.backgroundColor = 'transparent';
                    backBtn.style.color = isDark ? '#ffffff' : '#10B981';
                    const bIcon = backBtn.querySelector('.material-symbols-outlined');
                    if (bIcon) bIcon.style.color = isDark ? '#ffffff' : '#10B981';
                }
                if (colorBtn) {
                    colorBtn.style.backgroundColor = 'transparent';
                    colorBtn.style.color = isDark ? '#ffffff' : '#4b5563';
                }
                if (pinBtn) {
                    pinBtn.style.backgroundColor = isDark ? 'rgba(255,255,255,0.18)' : '#10B981';
                    pinBtn.style.color = '#ffffff';
                    pinBtn.style.borderColor = isDark ? 'rgba(255,255,255,0.3)' : '#059669';
                }

                // Checklist items
                document.querySelectorAll('.checklist-editor-item').forEach(item => {
                    item.style.backgroundColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)';
                    item.style.borderColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';
                    const input = item.querySelector('.checklist-item-input');
                    if (input) input.style.color = isDark ? '#ffffff' : '#111827';
                    const del = item.querySelector('.checklist-item-delete');
                    if (del) del.style.color = isDark ? '#f87171' : '#ef4444';
                });

                document.body.classList.toggle('nf-dark-contrast', isDark);
                document.body.classList.add('nf-colored-note');
            } else {
                const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
                const defaultBg = isDarkTheme ? '#202124' : '#ffffff';

                if (root) root.style.setProperty('background-color', defaultBg, 'important');
                if (body) body.style.setProperty('background-color', defaultBg, 'important');
                if (mainArea) mainArea.style.setProperty('background-color', defaultBg, 'important');
                if (topBar) {
                    topBar.style.setProperty('background-color', defaultBg, 'important');
                    topBar.style.borderBottom = 'none';
                    topBar.style.boxShadow = 'none';
                }
                if (scrollArea) scrollArea.style.setProperty('background-color', defaultBg, 'important');
                if (bottomBar) {
                    bottomBar.style.setProperty('background-color', defaultBg, 'important');
                    bottomBar.style.borderTop = 'none';
                }
                if (sheet) {
                    sheet.style.setProperty('background-color', defaultBg, 'important');
                }
                if (metaTheme) {
                    metaTheme.setAttribute('content', defaultBg);
                }

                if (titleInput) titleInput.style.color = '';
                if (contentInput) contentInput.style.color = '';
                if (barTitle) barTitle.style.color = '';
                if (divider) divider.style.background = '';
                if (backBtn) {
                    backBtn.style.backgroundColor = 'transparent';
                    backBtn.style.color = '#10B981';
                    const bIcon = backBtn.querySelector('.material-symbols-outlined');
                    if (bIcon) bIcon.style.color = '#10B981';
                }
                if (colorBtn) {
                    colorBtn.style.backgroundColor = 'transparent';
                    colorBtn.style.color = isDarkTheme ? '#ffffff' : '#4b5563';
                }
                if (pinBtn) {
                    pinBtn.style.backgroundColor = '';
                    pinBtn.style.color = '';
                    pinBtn.style.borderColor = '';
                }

                document.querySelectorAll('.checklist-editor-item').forEach(item => {
                    item.style.backgroundColor = '';
                    item.style.borderColor = '';
                    const input = item.querySelector('.checklist-item-input');
                    if (input) input.style.color = '';
                    const del = item.querySelector('.checklist-item-delete');
                    if (del) del.style.color = '';
                });

                document.body.classList.remove('nf-dark-contrast', 'nf-colored-note');
            }
        }

        showFormColorPalette(event) {
            event?.stopPropagation();

            const existingSheet = document.getElementById('form-color-sheet');
            if (existingSheet) {
                this.closeFormColorBottomSheet();
                return;
            }

            const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.getAttribute('data-theme') === 'dark';
            const currentColor = (this.currentNote?.color || this.activeModalNote?.color) || 'transparent';
            const isCustom = currentColor && currentColor !== 'transparent';
            const isNoteDark = isCustom ? this.isDarkColor(currentColor) : isDarkTheme;

            const lightColors = [
                { name: 'Predeterminado', value: 'transparent' },
                { name: 'Coral', value: '#f28b82' },
                { name: 'Melocotón', value: '#fbbc04' },
                { name: 'Arena', value: '#fff475' },
                { name: 'Menta', value: '#ccff90' },
                { name: 'Turquesa', value: '#a7ffeb' },
                { name: 'Niebla', value: '#cbf0f8' },
                { name: 'Azul tormenta', value: '#aecbfa' },
                { name: 'Amatista', value: '#d7aefb' },
                { name: 'Rosa flor', value: '#fdcfe8' },
                { name: 'Arcilla', value: '#e6c9a8' },
                { name: 'Tiza', value: '#e8eaed' }
            ];

            const darkColors = [
                { name: 'Predeterminado', value: 'transparent' },
                { name: 'Coral oscuro', value: '#5c2b29' },
                { name: 'Melocotón oscuro', value: '#614a19' },
                { name: 'Arena oscuro', value: '#635d19' },
                { name: 'Menta oscura', value: '#345920' },
                { name: 'Turquesa oscuro', value: '#16504b' },
                { name: 'Niebla oscura', value: '#2d555e' },
                { name: 'Azul tormenta', value: '#1e3a5f' },
                { name: 'Amatista oscura', value: '#42275e' },
                { name: 'Rosa flor oscuro', value: '#5b2245' },
                { name: 'Arcilla oscura', value: '#442f19' },
                { name: 'Tiza oscura', value: '#3c3f41' }
            ];

            const colors = (isDarkTheme || isNoteDark) ? darkColors : lightColors;

            // Backdrop transparente que no oculta ni difumina la nota (permite leer la información completa arriba)
            const backdrop = document.createElement('div');
            backdrop.id = 'form-color-backdrop';
            backdrop.className = 'color-sheet-backdrop';
            backdrop.onclick = () => this.closeFormColorBottomSheet();

            // Bottom sheet con el mismo fondo y tono de la nota como Google Keep
            const sheet = document.createElement('div');
            sheet.id = 'form-color-sheet';
            sheet.className = 'color-bottom-sheet';
            const sheetBg = isCustom ? currentColor : (isDarkTheme || isNoteDark ? '#252628' : '#ffffff');
            sheet.style.backgroundColor = sheetBg;

            sheet.innerHTML = `
                <div class="m3-sheet-drag-handle" onclick="window.notasManager.closeFormColorBottomSheet()"></div>
                <div class="color-sheet-header">
                    <span class="color-sheet-title">Color</span>
                </div>
                <div class="color-sheet-scroll">
                    ${colors.map(c => {
                        const isSelected = currentColor === c.value;
                        const isDefault = c.value === 'transparent';
                        const bg = isDefault ? (isDarkTheme || isNoteDark ? '#2a2b2e' : '#ffffff') : c.value;
                        return `
                            <button type="button" class="color-sheet-circle ${isSelected ? 'active-color' : ''}"
                                data-color-value="${c.value}"
                                style="background-color: ${bg}; ${isDefault ? 'border: 1.5px dashed #9aa0a6;' : ''}"
                                onclick="event.stopPropagation(); window.notasManager.selectFormColor('${c.value}')"
                                title="${c.name}"
                                aria-label="${c.name}">
                                ${isDefault ? '<span class="material-symbols-outlined color-sheet-reset-icon">format_color_reset</span>' : ''}
                                ${isSelected ? `
                                    <span class="color-check-badge">
                                        <span class="material-symbols-outlined">check</span>
                                    </span>
                                ` : ''}
                            </button>
                        `;
                    }).join('')}
                </div>
            `;

            document.body.appendChild(backdrop);
            document.body.appendChild(sheet);
        }

        closeFormColorBottomSheet() {
            const sheet = document.getElementById('form-color-sheet');
            const backdrop = document.getElementById('form-color-backdrop');
            if (sheet) {
                sheet.style.animation = 'm3SheetSlideDown 0.22s cubic-bezier(0.4, 0, 1, 1) forwards';
                setTimeout(() => sheet.remove(), 220);
            }
            if (backdrop) {
                backdrop.remove();
            }
        }

        selectFormColor(color) {
            if (!this.currentNote && !this.activeModalNote) return;

            // Detectar con precisión si estamos dentro del modal Keep (isKeepModalOpen o presencia de keep-modal-card)
            const isModal = Boolean(this.isKeepModalOpen || (this.activeModalNote && document.getElementById('keep-modal-card')));

            if (isModal && this.activeModalNote) {
                this.activeModalNote.color = color;
                this.applyModalColor(color);

                // Guardar en Supabase y actualizar cache local
                if (this.activeModalNote.id) {
                    const user = window.authManager?.currentUser;
                    const userId = user?.auth_user_id || user?.id;
                    if (userId) this.updateNoteInCache(userId, { id: this.activeModalNote.id, color: color });
                    window.supabaseClient
                        ?.from('notes')
                        .update({ color: color })
                        .eq('id', this.activeModalNote.id)
                        .then(() => {})
                        .catch(err => console.error('Error saving color in Supabase:', err));
                }
            } else {
                if (!this.currentNote) this.currentNote = {};
                this.currentNote.color = color;
                this.applyFormNoteColor(color);

                if (this.currentNote.id) {
                    const user = window.authManager?.currentUser;
                    const userId = user?.auth_user_id || user?.id;
                    if (userId) this.updateNoteInCache(userId, { id: this.currentNote.id, color: color });
                    window.supabaseClient
                        ?.from('notes')
                        .update({ color: color })
                        .eq('id', this.currentNote.id)
                        .then(() => {})
                        .catch(err => console.error('Error saving color in Supabase:', err));
                }
            }

            // Actualizar selección visual en el bottom sheet si está abierto
            const sheet = document.getElementById('form-color-sheet');
            if (sheet) {
                sheet.querySelectorAll('.color-sheet-circle').forEach(opt => {
                    opt.classList.remove('active-color');
                    const badge = opt.querySelector('.color-check-badge');
                    if (badge) badge.remove();
                    if (opt.dataset.colorValue === color) {
                        opt.classList.add('active-color');
                        const newBadge = document.createElement('span');
                        newBadge.className = 'color-check-badge';
                        newBadge.innerHTML = '<span class="material-symbols-outlined">check</span>';
                        opt.appendChild(newBadge);
                    }
                });
            }
        }

        // ── Auto-guardado y auto-eliminación al salir (Estilo Google Keep) ──
        async handleBack() {
            if (this.isExiting) return;
            this.isExiting = true;

            const urlParams = new URLSearchParams(window.location.search);
            const noteId = urlParams.get('id') || this.currentNote?.id;

            const title = (document.getElementById('note-title')?.value || '').trim();
            const typeInput = document.getElementById('note-type');
            const type = typeInput ? typeInput.value : (this.currentNote?.type || 'text');
            const content = type === 'text' ? (document.getElementById('note-content')?.value || '').trim() : '';
            const activeItems = type === 'checklist'
                ? (this.checklistItems || []).filter(i => !i._deleted && (i.content || '').trim() !== '')
                : [];

            const hasContent = title !== '' || (type === 'text' && content !== '') || (type === 'checklist' && activeItems.length > 0);

            let authUserId = window.authManager?.session?.user?.id
                || window.authManager?.currentUser?.auth_user_id
                || window.authManager?.currentUser?.id;

            if (!authUserId) {
                try {
                    const { data: sd } = await window.supabaseClient.auth.getSession();
                    authUserId = sd?.session?.user?.id;
                } catch (_) {}
            }

            const finishExit = (targetNoteId) => {
                const rawRect = sessionStorage.getItem('open_note_rect');
                const shell = document.querySelector('.nf-shell') || document.body;
                let animDelay = 0;

                if (rawRect) {
                    try {
                        const rect = JSON.parse(rawRect);
                        const scaleX = Math.max(0.1, rect.width / window.innerWidth);
                        const scaleY = Math.max(0.1, rect.height / window.innerHeight);
                        const tx = rect.left;
                        const ty = rect.top;

                        shell.style.transformOrigin = 'top left';
                        shell.style.transition = 'transform 0.28s cubic-bezier(0.1, 0.9, 0.2, 1), border-radius 0.28s ease, opacity 0.22s ease';
                        shell.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`;
                        shell.style.borderRadius = '16px';
                        shell.style.opacity = '0.35';
                        shell.style.overflow = 'hidden';
                        animDelay = 250;
                    } catch (_) {
                        animDelay = 150;
                    }
                } else {
                    shell.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease';
                    shell.style.transform = 'scale(0.88) translateY(24px)';
                    shell.style.opacity = '0';
                    animDelay = 200;
                }

                if (targetNoteId) {
                    sessionStorage.setItem('settle_note_id', targetNoteId);
                }

                setTimeout(() => {
                    window.location.href = '/notas';
                }, animDelay);
            };

            // CASO 1: Si no tiene contenido ("si borro se quita asi como lo hace google")
            if (!hasContent) {
                if (noteId && authUserId) {
                    this.removeNoteFromCache(authUserId, noteId);
                    this.saveCustomOrder();
                    window.supabaseClient?.from('notes').delete().eq('id', noteId).then(() => {});
                }
                finishExit(null);
                return;
            }

            // CASO 2: Tiene contenido ("si escribo algo y salgo se actualiza")
            if (noteId) {
                const updateData = {
                    title: title || (type === 'text' ? 'Nota sin título' : 'Lista sin título'),
                    type: type,
                    color: this.currentNote?.color || 'transparent',
                    updated_at: new Date().toISOString()
                };
                if (type === 'text') {
                    updateData.content = content;
                }

                if (authUserId) {
                    const preview = {
                        id: noteId,
                        title: updateData.title,
                        type: type,
                        content: type === 'text' ? content : '',
                        note_items: type === 'checklist' ? activeItems : [],
                        is_pinned: !!this.currentNote?.is_pinned,
                        color: updateData.color,
                        updated_at: updateData.updated_at,
                        created_at: this.currentNote?.created_at || updateData.updated_at
                    };
                    this.updateNoteInCache(authUserId, preview);
                }

                const upsertData = {
                    id: noteId,
                    user_id: authUserId,
                    ...updateData
                };
                window.supabaseClient?.from('notes').upsert(upsertData).then(() => {});

                if (type === 'checklist') {
                    const itemsToDelete = (this.checklistItems || []).filter(i => i._deleted && i.id).map(i => i.id);
                    if (itemsToDelete.length > 0) {
                        window.supabaseClient?.from('note_items').delete().in('id', itemsToDelete).then(() => {});
                    }
                    activeItems.forEach((item, i) => {
                        const itemData = {
                            note_id: noteId,
                            content: item.content,
                            is_completed: !!item.is_completed,
                            order_index: i
                        };
                        if (item.id && !item.id.toString().startsWith('temp-')) {
                            window.supabaseClient?.from('note_items').update(itemData).eq('id', item.id).then(() => {});
                        } else {
                            window.supabaseClient?.from('note_items').insert([itemData]).then(() => {});
                        }
                    });
                }

                finishExit(noteId);
            } else {
                if (!authUserId) {
                    finishExit(null);
                    return;
                }

                const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('note-' + Date.now());
                const insertData = {
                    id: newId,
                    title: title || (type === 'text' ? 'Nota sin título' : 'Lista sin título'),
                    type: type,
                    user_id: authUserId,
                    color: this.currentNote?.color || 'transparent',
                    is_pinned: !!this.currentNote?.is_pinned,
                    updated_at: new Date().toISOString()
                };
                if (type === 'text') insertData.content = content;

                const newNote = {
                    id: newId,
                    user_id: authUserId,
                    title: insertData.title,
                    type: type,
                    content: type === 'text' ? content : '',
                    note_items: type === 'checklist' ? activeItems : [],
                    is_pinned: insertData.is_pinned,
                    color: insertData.color,
                    updated_at: insertData.updated_at,
                    created_at: insertData.updated_at
                };
                this.updateNoteInCache(authUserId, newNote);
                this.saveCustomOrder();

                window.supabaseClient?.from('notes').insert([insertData]).then(() => {
                    if (type === 'checklist' && activeItems.length > 0) {
                        const itemsData = activeItems.map((it, idx) => ({
                            note_id: newId,
                            content: it.content,
                            is_completed: !!it.is_completed,
                            order_index: idx
                        }));
                        window.supabaseClient?.from('note_items').insert(itemsData).then(() => {});
                    }
                }).catch(e => console.warn('Background note sync err:', e));

                finishExit(newId);
            }
        }

        autoSaveSilently() {
            const urlParams = new URLSearchParams(window.location.search);
            const noteId = urlParams.get('id') || this.currentNote?.id;

            const title = (document.getElementById('note-title')?.value || '').trim();
            const typeInput = document.getElementById('note-type');
            const type = typeInput ? typeInput.value : (this.currentNote?.type || 'text');
            const content = type === 'text' ? (document.getElementById('note-content')?.value || '').trim() : '';
            const activeItems = type === 'checklist'
                ? (this.checklistItems || []).filter(i => !i._deleted && (i.content || '').trim() !== '')
                : [];

            const hasContent = title !== '' || (type === 'text' && content !== '') || (type === 'checklist' && activeItems.length > 0);

            const user = window.authManager?.currentUser;
            const authUserId = user?.auth_user_id || user?.id;
            if (!authUserId) return;

            if (!hasContent) {
                if (noteId) {
                    this.removeNoteFromCache(authUserId, noteId);
                    this.saveCustomOrder();
                    window.supabaseClient?.from('notes').delete().eq('id', noteId).then(() => {});
                }
                return;
            }

            if (noteId) {
                const updateData = {
                    title: title || (type === 'text' ? 'Nota sin título' : 'Lista sin título'),
                    type: type,
                    color: this.currentNote?.color || 'transparent',
                    updated_at: new Date().toISOString()
                };
                if (type === 'text') updateData.content = content;

                const preview = {
                    id: noteId,
                    title: updateData.title,
                    type: type,
                    content: type === 'text' ? content : '',
                    note_items: type === 'checklist' ? activeItems : [],
                    is_pinned: !!this.currentNote?.is_pinned,
                    color: updateData.color,
                    updated_at: updateData.updated_at,
                    created_at: this.currentNote?.created_at || updateData.updated_at
                };
                this.updateNoteInCache(authUserId, preview);

                const upsertData = {
                    id: noteId,
                    user_id: authUserId,
                    ...updateData
                };
                window.supabaseClient?.from('notes').upsert(upsertData).then(() => {});
            }
        }

        async initFormView() {
            const urlParams = new URLSearchParams(window.location.search);
            const noteId = urlParams.get('id');
            const initialType = urlParams.get('type') || 'text'; // 'text' or 'checklist'
            const initialColor = urlParams.get('color');

            const editorForm = document.getElementById('editor-form');
            const typeInput = document.getElementById('note-type');
            const deleteBtn = document.getElementById('delete-note-btn');

            let user = window.authManager?.currentUser;
            let userId = user?.auth_user_id || user?.id;
            if (!userId) {
                try {
                    const { data: sd } = await window.supabaseClient?.auth?.getSession?.() || {};
                    userId = sd?.session?.user?.id;
                } catch (_) {}
            }

            if (noteId) {
                if (deleteBtn) deleteBtn.style.display = 'flex';

                // 1. Cargar INMEDIATAMENTE de la memoria caché local (Instantáneo / 0ms)
                let localNote = null;
                if (userId) {
                    const cachedNotes = this.getNotesFromCache(userId) || [];
                    localNote = cachedNotes.find(n => n.id === noteId);
                }

                if (localNote) {
                    this.currentNote = localNote;
                    document.getElementById('note-title').value = localNote.title || '';
                    typeInput.value = localNote.type || 'text';
                    if (localNote.color) this.applyFormNoteColor(localNote.color);

                    if (localNote.type === 'checklist') {
                        this.checklistItems = localNote.note_items || [];
                        this.renderChecklistEditor();
                    } else {
                        document.getElementById('note-content').value = localNote.content || '';
                        window.autoResizeNoteContent?.();
                    }

                    const pageTitle = document.getElementById('page-title');
                    if (pageTitle) pageTitle.textContent = 'Editar Nota';

                    this.showLoading(false);
                    editorForm.style.display = 'flex';
                    this.toggleFormType(typeInput.value);
                    window.autoResizeNoteContent?.();
                } else {
                    if (initialColor) this.applyFormNoteColor(initialColor);
                    this.showLoading(true);
                }

                // 2. Sincronizar con Supabase en segundo plano si existe
                try {
                    const { data: note, error } = await window.supabaseClient
                        .from('notes')
                        .select('*')
                        .eq('id', noteId)
                        .maybeSingle();

                    if (!error && note) {
                        this.currentNote = { ...this.currentNote, ...note };
                        document.getElementById('note-title').value = note.title || '';
                        typeInput.value = note.type || 'text';
                        if (note.color) this.applyFormNoteColor(note.color);

                        if (note.type === 'checklist') {
                            const { data: items } = await window.supabaseClient
                                .from('note_items')
                                .select('*')
                                .eq('note_id', noteId)
                                .order('order_index', { ascending: true });
                            if (items) {
                                this.checklistItems = items;
                                this.renderChecklistEditor();
                            }
                        } else {
                            document.getElementById('note-content').value = note.content || '';
                            window.autoResizeNoteContent?.();
                        }
                    } else if (!localNote) {
                        console.error('Note not found anywhere');
                        if (window.uiManager) window.uiManager.showToast('Nota no encontrada', 'error');
                        setTimeout(() => window.history.back(), 1500);
                        return;
                    }
                } catch (err) {
                    console.warn('Note fetch error from Supabase, using local cache:', err);
                    if (!localNote) {
                        if (window.uiManager) window.uiManager.showToast('Error al cargar la nota', 'error');
                        setTimeout(() => window.history.back(), 1500);
                        return;
                    }
                } finally {
                    this.showLoading(false);
                    editorForm.style.display = 'flex';
                    this.toggleFormType(typeInput.value);
                }
            } else {
                // Nueva nota
                this.currentNote = {
                    title: '',
                    content: '',
                    type: initialType,
                    color: initialColor || 'transparent'
                };
                typeInput.value = initialType;
                if (initialColor) this.applyFormNoteColor(initialColor);
                this.showLoading(false);
                editorForm.style.display = 'flex';
                this.toggleFormType(typeInput.value);

                if (typeInput.value === 'checklist') {
                    this.renderChecklistEditor();
                    this.addChecklistItem();
                }
            }

            // Auto-guardado transparente si el usuario minimiza o navega fuera
            window.addEventListener('pagehide', () => {
                if (!this.isExiting) {
                    this.autoSaveSilently();
                }
            });
        }

        toggleFormType(type) {
            const contentArea = document.getElementById('note-content');
            const checklistArea = document.getElementById('checklist-container');
            
            if (type === 'checklist') {
                contentArea.style.display = 'none';
                checklistArea.style.display = 'flex';
            } else {
                contentArea.style.display = 'block';
                checklistArea.style.display = 'none';
            }
        }

        toggleCurrentFormType() {
            const typeInput = document.getElementById('note-type');
            if (!typeInput) return;
            const newType = typeInput.value === 'checklist' ? 'text' : 'checklist';
            typeInput.value = newType;
            if (this.currentNote) this.currentNote.type = newType;
            this.toggleFormType(newType);
            if (newType === 'checklist') {
                if (!this.checklistItems || this.checklistItems.length === 0) {
                    const text = (document.getElementById('note-content')?.value || '').trim();
                    if (text) {
                        const lines = text.split('\n').filter(l => l.trim() !== '');
                        this.checklistItems = lines.map((l, idx) => ({
                            id: `temp-${idx}`,
                            content: l,
                            is_completed: false,
                            order_index: idx
                        }));
                    } else {
                        this.checklistItems = [{ id: 'temp-0', content: '', is_completed: false, order_index: 0 }];
                    }
                }
                this.renderChecklistEditor();
            }
        }

        toggleChecklistMode() {
            this.toggleCurrentFormType();
        }

        toggleFormPin() {
            if (!this.currentNote) this.currentNote = {};
            this.currentNote.is_pinned = !this.currentNote.is_pinned;
            const pinBtn = document.getElementById('pin-note-btn');
            if (pinBtn) {
                pinBtn.classList.toggle('pinned', !!this.currentNote.is_pinned);
                pinBtn.title = this.currentNote.is_pinned ? 'Desfijar nota' : 'Fijar nota';
            }
        }

        renderChecklistEditor() {
            const container = document.getElementById('checklist-items');
            if (!container) return;
            
            container.innerHTML = '';
            
            this.checklistItems.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = `checklist-editor-item ${item.is_completed ? 'completed' : ''}`;
                
                div.innerHTML = `
                    <div class="checklist-checkbox" onclick="window.notasManager.toggleItemCompleted(${index})">
                        ${item.is_completed ? '<span class="material-symbols-outlined">check</span>' : ''}
                    </div>
                    <input type="text" class="checklist-item-input" value="${this.escapeHTML(item.content || '')}" 
                           oninput="window.notasManager.updateItemContent(${index}, this.value)" 
                           placeholder="Elemento...">
                    <button class="checklist-item-delete" onclick="window.notasManager.deleteItem(${index})">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                `;
                container.appendChild(div);
            });

            if (this.currentNote?.color) {
                this.applyFormNoteColor(this.currentNote.color);
            }
        }

        addChecklistItem() {
            this.checklistItems.push({
                content: '',
                is_completed: false,
                order_index: this.checklistItems.length,
                isNew: true // temporary flag
            });
            this.renderChecklistEditor();
            
            // Focus last input
            setTimeout(() => {
                const inputs = document.querySelectorAll('.checklist-item-input');
                if (inputs.length > 0) inputs[inputs.length - 1].focus();
            }, 50);
        }

        toggleItemCompleted(index) {
            if (this.checklistItems[index]) {
                this.checklistItems[index].is_completed = !this.checklistItems[index].is_completed;
                this.checklistItems[index].isModified = true;
                this.renderChecklistEditor();
            }
        }

        updateItemContent(index, value) {
            if (this.checklistItems[index]) {
                this.checklistItems[index].content = value;
                this.checklistItems[index].isModified = true;
            }
        }

        deleteItem(index) {
            if (this.checklistItems[index]) {
                if (this.checklistItems[index].id) {
                    // Mark for deletion on save
                    this.checklistItems[index]._deleted = true;
                } else {
                    // It's a new item, just remove from array
                    this.checklistItems.splice(index, 1);
                }
                this.renderChecklistEditor();
            }
        }

        async deleteCurrentNote() {
            if (this.currentNote && this.currentNote.id) {
                this.deleteNotePrompt(this.currentNote.id, true);
            }
        }

        // --- Utils ---
        showLoading(show) {
            const loader = document.getElementById('loading-state');
            if (loader) loader.style.display = show ? 'flex' : 'none';
            
            const form = document.getElementById('editor-form');
            if (form && !show) form.style.display = 'flex';
        }

        escapeHTML(str) {
            return str.replace(/[&<>'"]/g, 
                tag => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    "'": '&#39;',
                    '"': '&quot;'
                }[tag] || tag)
            );
        }
    }

    // Initialize globally
    window.notasManager = new NotasManager();
})();
