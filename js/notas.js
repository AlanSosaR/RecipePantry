// js/notas.js
(function() {
    class NotasManager {
        constructor() {
            this.notes = [];
            this.currentNote = null;
            this.checklistItems = [];
            this.loading = true;
            this.searchQuery = '';
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
                this.initListView();
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

        // --- List View Methods ---

        async initListView() {
            this.showLoading(true);
            const user = window.authManager.currentUser;
            if (!user) {
                console.error("No user found in authManager");
                this.showLoading(false);
                return;
            }

            console.log('📝 Fetching notes for user:', user.id);

            try {
                const { data: notes, error } = await window.supabaseClient
                    .from('notes')
                    .select('*, note_items(*)')
                    .eq('user_id', user.auth_user_id || user.id)
                    .order('is_pinned', { ascending: false })
                    .order('created_at', { ascending: false });

                if (error) throw error;
                console.log(`✅ Fetched ${notes ? notes.length : 0} notes.`);
                this.notes = notes || [];
                this.renderNotesList();
            } catch (err) {
                console.error('Error fetching notes:', err);
                if (window.uiManager) window.uiManager.showToast('Error al cargar las notas.', 'error');
            } finally {
                this.showLoading(false);
            }

            // ── Wire up search input ──
            const searchInput = document.querySelector('.notas-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchQuery = e.target.value.trim().toLowerCase();
                    this.renderNotesList();
                });
                // Clear on Escape
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

        renderNotesList() {
            const grid = document.getElementById('notes-grid');
            const emptyState = document.getElementById('empty-state');

            if (!grid || !emptyState) return;

            // Filter by search query
            const q = this.searchQuery;
            const filtered = q
                ? this.notes.filter(n => {
                    const inTitle   = (n.title   || '').toLowerCase().includes(q);
                    const inContent = (n.content || '').toLowerCase().includes(q);
                    const inItems   = (n.note_items || []).some(i =>
                        (i.content || '').toLowerCase().includes(q)
                    );
                    return inTitle || inContent || inItems;
                })
                : this.notes;

            if (this.notes.length === 0) {
                grid.style.display = 'none';
                emptyState.style.display = 'flex';
                return;
            }

            if (filtered.length === 0) {
                // No search results
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

            // Restore empty state in case it was replaced by search message
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
            grid.style.display = 'block'; // Masonry relies on column-count
            grid.innerHTML = '';

            // Use filtered list
            const notesToRender = filtered;

            notesToRender.forEach(note => {
                const card = document.createElement('a');
                card.href = `nota-form.html?id=${note.id}`;
                card.className = 'note-card';
                
                let contentHtml = '';
                if (note.type === 'text') {
                    contentHtml = `<p class="note-text">${this.escapeHTML(note.content || '')}</p>`;
                } else {
                    const items = (note.note_items || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                    if (items.length > 0) {
                        contentHtml = `<div class="note-items-preview">
                            ${items.map(item => `
                                <div class="note-item-preview">
                                    <span class="material-symbols-outlined">
                                        ${item.is_completed ? 'check_box' : 'check_box_outline_blank'}
                                    </span>
                                    <span class="note-item-text ${item.is_completed ? 'checked' : ''}">
                                        ${this.escapeHTML(item.content || '')}
                                    </span>
                                </div>
                            `).join('')}
                        </div>`;
                    } else {
                        contentHtml = `<div class="note-items-preview">
                            <div class="note-item-preview">
                                <span class="material-symbols-outlined">check_box_outline_blank</span>
                                <span class="note-item-text" style="font-style: italic;">Lista vacía</span>
                            </div>
                        </div>`;
                    }
                }

                const bgColor = note.color || 'transparent';
                if (bgColor !== 'transparent') {
                    card.style.backgroundColor = bgColor;
                    card.style.borderColor = 'transparent';
                }

                card.innerHTML = `
                    <div class="note-header">
                        <div class="note-spacer"></div>
                        ${note.is_pinned ? '<span class="material-symbols-outlined" style="font-size: 20px; color: var(--primary);">push_pin</span>' : ''}
                    </div>
                    ${note.title ? `<h3 style="${bgColor !== 'transparent' ? 'color: inherit;' : ''}">${this.escapeHTML(note.title)}</h3>` : ''}
                    <div class="note-content-wrapper" style="${bgColor !== 'transparent' ? 'color: inherit;' : ''}">
                        ${contentHtml}
                    </div>
                    <div class="note-card-footer">
                        <div class="note-actions">
                            <button class="note-action-btn color-btn" title="Cambiar color" onclick="event.preventDefault(); event.stopPropagation(); window.notasManager.showColorPalette(event, '${note.id}')">
                                <span class="material-symbols-outlined">palette</span>
                            </button>
                            <button class="note-action-btn" title="Eliminar" onclick="event.preventDefault(); event.stopPropagation(); window.notasManager.deleteNotePrompt('${note.id}')">
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        createNewNote(type) {
            window.location.href = `/nota-form.html?type=${type}`;
        }

        showColorPalette(event, noteId) {
            const btn = event.currentTarget;
            const rect = btn.getBoundingClientRect();
            
            let palette = document.getElementById('note-color-palette');
            if (!palette) {
                palette = document.createElement('div');
                palette.id = 'note-color-palette';
                palette.className = 'note-color-palette';
                document.body.appendChild(palette);
            }

            const colors = [
                { name: 'Default', value: 'transparent' },
                { name: 'Red', value: '#f28b82' },
                { name: 'Orange', value: '#fbbc04' },
                { name: 'Yellow', value: '#fff475' },
                { name: 'Green', value: '#ccff90' },
                { name: 'Teal', value: '#a7ffeb' },
                { name: 'Blue', value: '#cbf0f8' },
                { name: 'Dark Blue', value: '#aecbfa' },
                { name: 'Purple', value: '#d7aefb' },
                { name: 'Pink', value: '#fdcfe8' },
                { name: 'Brown', value: '#e6c9a8' },
                { name: 'Gray', value: '#e8eaed' }
            ];

            palette.innerHTML = colors.map(c => `
                <div class="color-option ${c.name}" 
                     style="background-color: ${c.value === 'transparent' ? '#ffffff' : c.value}; ${c.value === 'transparent' ? 'border: 1px solid #dadce0;' : ''}"
                     onclick="window.notasManager.updateNoteColor('${noteId}', '${c.value}')"
                     title="${c.name}">
                     ${c.value === 'transparent' ? '<span class="material-symbols-outlined" style="font-size: 14px; color: #5f6368;">format_color_reset</span>' : ''}
                </div>
            `).join('');

            palette.style.display = 'flex';
            
            // Calculate position
            const paletteWidth = 140; 
            const left = rect.left + (rect.width / 2) - (paletteWidth / 2);
            const top = rect.bottom + 5 + window.scrollY; 

            palette.style.top = `${top}px`;
            palette.style.left = `${Math.max(10, left)}px`; // Prevent going off-screen left

            const closePalette = (e) => {
                if (!palette.contains(e.target) && !btn.contains(e.target)) {
                    palette.style.display = 'none';
                    document.removeEventListener('mousedown', closePalette);
                }
            };
            
            // Remove previous listener if exists to avoid duplication
            document.removeEventListener('mousedown', closePalette);
            setTimeout(() => {
                document.addEventListener('mousedown', closePalette);
            }, 10);
        }


        async updateNoteColor(noteId, color) {
            try {
                const { error } = await window.supabaseClient
                    .from('notes')
                    .update({ color: color })
                    .eq('id', noteId);

                if (error) throw error;
                
                // Update local note and re-render
                const note = this.notes.find(n => n.id === noteId);
                if (note) note.color = color;
                this.renderNotesList();
                
                const palette = document.getElementById('note-color-palette');
                if (palette) palette.style.display = 'none';
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
            if (isCurrent) {
                // Navegamos de vuelta INMEDIATAMENTE y borramos en fondo
                window.history.back();
                window.supabaseClient.from('notes').delete().eq('id', id)
                    .then(({ error }) => {
                        if (error) console.error('Error al eliminar nota:', error);
                    });
                return;
            }

            // Lista de notas: quitar tarjeta de UI al instante (optimista)
            const removed = this.notes.find(n => n.id === id);
            this.notes = this.notes.filter(n => n.id !== id);
            this.renderNotesList();
            if (window.uiManager) window.uiManager.showToast('Nota eliminada', 'success');

            // Confirmar en Supabase en segundo plano
            window.supabaseClient.from('notes').delete().eq('id', id)
                .then(({ error }) => {
                    if (error) {
                        // Rollback: devolver la nota a la lista
                        console.error('Error al eliminar nota:', error);
                        if (removed) {
                            this.notes.unshift(removed);
                            this.renderNotesList();
                        }
                        if (window.uiManager) window.uiManager.showToast('Error al eliminar', 'error');
                    }
                });
        }

        // --- Form View Methods ---

        async initFormView() {
            const urlParams = new URLSearchParams(window.location.search);
            const noteId = urlParams.get('id');
            const initialType = urlParams.get('type') || 'text'; // 'text' or 'checklist'

            const editorForm = document.getElementById('editor-form');
            const typeInput = document.getElementById('note-type');
            
            if (noteId) {
                // Edit existing
                document.getElementById('delete-note-btn').style.display = 'block';
                this.showLoading(true);
                try {
                    const { data: note, error } = await window.supabaseClient
                        .from('notes')
                        .select('*')
                        .eq('id', noteId)
                        .single();
                        
                    if (error) throw error;
                    this.currentNote = note;
                    
                    document.getElementById('note-title').value = note.title || '';
                    typeInput.value = note.type || 'text';
                    
                    if (note.type === 'checklist') {
                        // Fetch items
                        const { data: items, error: itemsErr } = await window.supabaseClient
                            .from('note_items')
                            .select('*')
                            .eq('note_id', noteId)
                            .order('order_index', { ascending: true });
                            
                        if (itemsErr) throw itemsErr;
                        this.checklistItems = items || [];
                    } else {
                        document.getElementById('note-content').value = note.content || '';
                    }

                    // Update UI for editing
                    const pinBtn = document.getElementById('pin-save-btn');
                    if (pinBtn) {
                        const icon = pinBtn.querySelector('.material-symbols-outlined');
                        const label = pinBtn.querySelector('.nf-btn-pin-label');
                        if (icon) icon.textContent = 'published_with_changes';
                        if (label) label.textContent = 'Actualizar';
                        pinBtn.title = 'Actualizar nota';
                    }
                    const pageTitle = document.getElementById('page-title');
                    if (pageTitle) pageTitle.textContent = 'Editar Nota';

                } catch (err) {
                    console.error('Error loading note:', err);
                    if (window.uiManager) window.uiManager.showToast('Error al cargar la nota', 'error');
                    setTimeout(() => window.history.back(), 1500);
                    return;
                } finally {
                    this.showLoading(false);
                }
            } else {
                // New note
                this.currentNote = {
                    title: '',
                    content: '',
                    type: initialType
                };
                typeInput.value = initialType;
                this.showLoading(false);
            }

            editorForm.style.display = 'flex';
            this.toggleFormType(typeInput.value);
            
            if (typeInput.value === 'checklist') {
                this.renderChecklistEditor();
                if (!noteId && this.checklistItems.length === 0) {
                    this.addChecklistItem(); // Add one empty item by default
                }
            }
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
                           onchange="window.notasManager.updateItemContent(${index}, this.value)" 
                           placeholder="Elemento...">
                    <button class="checklist-item-delete" onclick="window.notasManager.deleteItem(${index})">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                `;
                container.appendChild(div);
            });
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

        async saveNote() {
            try {
                const title = document.getElementById('note-title').value.trim();
                const type = document.getElementById('note-type').value;
                const content = type === 'text' ? document.getElementById('note-content').value.trim() : null;

                // ── Validación: no guardar si está vacía ──
                const hasContent = title !== '' || (type === 'text' && content !== '') ||
                    (type === 'checklist' && this.checklistItems.some(i => !i._deleted && i.content.trim() !== ''));

                if (!hasContent) {
                    if (window.uiManager) {
                        window.uiManager.showToast('Escribe un título o contenido antes de guardar.', 'warning');
                    }
                    return; // No guardar
                }

                this.showLoading(true);

                // Obtener user_id de forma segura: memoria → sesión activa de Supabase
                let authUserId = window.authManager.session?.user?.id
                    || window.authManager.currentUser?.auth_user_id
                    || window.authManager.currentUser?.id;

                if (!authUserId) {
                    // Fallback: consultar sesión activa directamente a Supabase
                    try {
                        const { data: sd } = await window.supabaseClient.auth.getSession();
                        authUserId = sd?.session?.user?.id;
                        // Actualizar sesión en authManager para futuras llamadas
                        if (sd?.session) window.authManager.session = sd.session;
                    } catch (_) {}
                }

                if (!authUserId) throw new Error('Usuario no autenticado');

                const noteData = {
                    title: title || (type === 'text' ? 'Nota sin título' : 'Lista sin título'),
                    type: type,
                    user_id: authUserId,
                    updated_at: new Date().toISOString()
                };

                if (type === 'text') {
                    noteData.content = content;
                }

                let noteId = this.currentNote?.id;

                if (noteId) {
                    // Update
                    const { error } = await window.supabaseClient
                        .from('notes')
                        .update(noteData)
                        .eq('id', noteId);
                    if (error) throw error;
                } else {
                    // Insert
                    const { data, error } = await window.supabaseClient
                        .from('notes')
                        .insert([noteData])
                        .select()
                        .single();
                    if (error) throw error;
                    noteId = data.id;
                    // Guardar ID en currentNote para re-uso
                    this.currentNote = { ...this.currentNote, id: noteId };
                }

                // Handle Checklist Items en paralelo (más rápido)
                if (type === 'checklist') {
                    const ops = [];
                    const itemsToDelete = this.checklistItems.filter(i => i._deleted && i.id).map(i => i.id);
                    if (itemsToDelete.length > 0) {
                        ops.push(window.supabaseClient.from('note_items').delete().in('id', itemsToDelete));
                    }

                    const activeItems = this.checklistItems.filter(i => !i._deleted && i.content.trim() !== '');
                    activeItems.forEach((item, i) => {
                        const itemData = {
                            note_id: noteId,
                            content: item.content,
                            is_completed: item.is_completed,
                            order_index: i
                        };
                        if (item.id && item.isModified) {
                            ops.push(window.supabaseClient.from('note_items').update(itemData).eq('id', item.id));
                        } else if (item.isNew) {
                            ops.push(window.supabaseClient.from('note_items').insert([itemData]));
                        }
                    });
                    await Promise.all(ops);
                }

                if (window.uiManager) window.uiManager.showToast('Nota guardada ✅', 'success');

                // Redirigir inmediatamente sin delay artificial
                window.location.href = '/notas';

            } catch (err) {
                console.error('Error saving note:', err);
                if (window.uiManager) window.uiManager.showToast('Error al guardar la nota', 'error');
                this.showLoading(false);
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
