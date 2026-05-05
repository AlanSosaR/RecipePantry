// js/notas.js
(function() {
    class NotasManager {
        constructor() {
            this.notes = [];
            this.currentNote = null;
            this.checklistItems = [];
            this.loading = true;
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
            const user = await window.authManager.getCurrentUser();
            if (!user) {
                window.location.href = '/';
                return;
            }

            // ── Update sidebar avatar with photo or initials ──
            this.updateAvatar(user);

            const path = window.location.pathname;

            // If on nota-form and no dbManager yet, show editor immediately for new notes
            if (path.includes('nota-form.html')) {
                if (!window.dbManager) {
                    // Retry once after short delay; if still absent, show editor anyway
                    await new Promise(r => setTimeout(r, 600));
                }
                this.initFormView();
                return;
            }

            if (!window.dbManager) {
                console.error("dbManager not initialized yet.");
                return;
            }

            if (path.includes('notas.html') || path.includes('/notas')) {
                this.initListView();
            }
        }

        // ── Avatar: reusar la misma lógica de Recetas (ui.js) ─────────────
        async updateAvatar(user) {
            const greetingEl = document.getElementById('sidebar-user-greeting');

            // Intentar obtener perfil extendido desde la BD (igual que dashboard.js)
            try {
                const { data: profile } = await window.supabase
                    .from('profiles')
                    .select('first_name, last_name, prefix, avatar_url')
                    .eq('id', user.id)
                    .single();

                if (profile) {
                    // Montar el objeto que espera updateGlobalUserUI
                    window.authManager.currentUser = {
                        ...window.authManager.currentUser,
                        ...profile
                    };

                    // Nombre en el saludo
                    const prefix = profile.prefix || 'Chef';
                    const fName  = profile.first_name || '';
                    const lName  = profile.last_name  || '';
                    let fullName = `${prefix} ${fName} ${lName}`.replace(/\s+/g, ' ').trim();
                    if (!fName && !lName) fullName = prefix;
                    if (greetingEl) greetingEl.textContent = fullName;
                }
            } catch (e) {
                // Sin perfil extendido: usar user_metadata de Auth
                const meta = user.user_metadata || {};
                const displayName = meta.full_name || meta.name || user.email || 'Chef';
                if (greetingEl) greetingEl.textContent = displayName.split(' ')[0];

                // Montar datos mínimos en currentUser para que updateGlobalUserUI funcione
                if (!window.authManager.currentUser.avatar_url) {
                    window.authManager.currentUser.avatar_url = meta.avatar_url || meta.picture || null;
                }
                const parts = displayName.trim().split(/\s+/);
                if (!window.authManager.currentUser.first_name) {
                    window.authManager.currentUser.first_name = parts[0] || '';
                    window.authManager.currentUser.last_name  = parts[1] || '';
                }
            }

            // Disparar el updater global (maneja foto e iniciales para .user-avatar-m3)
            if (window.updateGlobalUserUI) window.updateGlobalUserUI();

            // También actualizar el círculo propio de notas si no tiene clase user-avatar-m3
            this._updateNotasAvatarCircle();
        }

        _updateNotasAvatarCircle() {
            const container  = document.getElementById('notas-avatar-container');
            const initialsEl = document.getElementById('sidebar-user-initials');
            if (!container) return;

            const cu = window.authManager?.currentUser || {};
            const avatarUrl = cu.avatar_url || null;

            if (avatarUrl) {
                container.innerHTML = '';
                const img = document.createElement('img');
                img.src = avatarUrl;
                img.alt = 'avatar';
                img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
                img.onerror = () => this._setInitialsCircle(container, initialsEl, cu);
                container.appendChild(img);
            } else {
                this._setInitialsCircle(container, initialsEl, cu);
            }
        }

        _setInitialsCircle(container, initialsEl, cu) {
            const fName = cu.first_name || '';
            const lName = cu.last_name  || '';
            const email = cu.email || '';
            let initials = '?';
            if (fName || lName) {
                initials = ((fName[0] || '') + (lName[0] || '')).toUpperCase();
            } else if (email) {
                initials = email[0].toUpperCase();
            }
            // Remove any img, set initials span
            const img = container.querySelector('img');
            if (img) img.remove();
            if (initialsEl) {
                initialsEl.textContent = initials;
                initialsEl.style.display = 'block';
            }
        }

        // --- List View Methods ---

        async initListView() {
            this.showLoading(true);
            try {
                // Fetch notes from Supabase
                const { data: notes, error } = await window.supabase
                    .from('notes')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                this.notes = notes || [];

                // Render
                this.renderNotesList();
            } catch (err) {
                console.error('Error fetching notes:', err);
                if (window.uiManager) window.uiManager.showToast('Error al cargar las notas.', 'error');
            } finally {
                this.showLoading(false);
            }
        }

        renderNotesList() {
            const grid = document.getElementById('notes-grid');
            const emptyState = document.getElementById('empty-state');
            
            if (!grid || !emptyState) return;

            if (this.notes.length === 0) {
                grid.style.display = 'none';
                emptyState.style.display = 'flex';
                return;
            }

            emptyState.style.display = 'none';
            grid.style.display = 'block'; // Masonry relies on column-count
            grid.innerHTML = '';

            this.notes.forEach(note => {
                const card = document.createElement('a');
                card.href = `nota-form.html?id=${note.id}`;
                card.className = 'note-card';
                card.innerHTML = `
                    <div class="note-header">
                        <div class="note-type-indicator">
                            <span class="material-symbols-outlined" style="font-size: 18px;">${note.type === 'checklist' ? 'checklist' : 'description'}</span>
                            <span>${note.type === 'checklist' ? 'Lista' : 'Nota'}</span>
                        </div>
                        <button class="note-menu-btn" onclick="event.preventDefault(); window.notasManager.deleteNotePrompt('${note.id}')">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                    <h3>${this.escapeHTML(note.title || 'Sin Título')}</h3>
                    ${note.type === 'text' 
                        ? `<p class="note-text">${this.escapeHTML(note.content || '')}</p>` 
                        : `<div class="checklist-preview">
                            <div class="checklist-item-preview">
                                <span class="material-symbols-outlined" style="font-size: 16px; color: var(--md-outline);">check_box_outline_blank</span>
                                <span class="item-text" style="font-style: italic;">Toque para ver lista...</span>
                            </div>
                           </div>`
                    }
                    <div class="note-footer">
                        <span class="material-symbols-outlined">calendar_today</span>
                        <span>${new Date(note.updated_at).toLocaleDateString()}</span>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        createNewNote(type) {
            window.location.href = `/nota-form.html?type=${type}`;
        }

        async deleteNotePrompt(id) {
            if (confirm('¿Estás seguro de que quieres eliminar esta nota?')) {
                try {
                    const { error } = await window.supabase.from('notes').delete().eq('id', id);
                    if (error) throw error;
                    
                    if (window.uiManager) window.uiManager.showToast('Nota eliminada', 'success');
                    this.notes = this.notes.filter(n => n.id !== id);
                    this.renderNotesList();
                } catch (err) {
                    console.error('Error deleting note:', err);
                    if (window.uiManager) window.uiManager.showToast('Error al eliminar', 'error');
                }
            }
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
                    const { data: note, error } = await window.supabase
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
                        const { data: items, error: itemsErr } = await window.supabase
                            .from('note_items')
                            .select('*')
                            .eq('note_id', noteId)
                            .order('order_index', { ascending: true });
                            
                        if (itemsErr) throw itemsErr;
                        this.checklistItems = items || [];
                    } else {
                        document.getElementById('note-content').value = note.content || '';
                    }

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
                const user = await window.authManager.getCurrentUser();

                const noteData = {
                    title: title || (type === 'text' ? 'Nota sin título' : 'Lista sin título'),
                    type: type,
                    user_id: user.id,
                    updated_at: new Date().toISOString()
                };

                if (type === 'text') {
                    noteData.content = content;
                }

                let noteId = this.currentNote?.id;

                if (noteId) {
                    // Update
                    const { error } = await window.supabase
                        .from('notes')
                        .update(noteData)
                        .eq('id', noteId);
                    if (error) throw error;
                } else {
                    // Insert
                    const { data, error } = await window.supabase
                        .from('notes')
                        .insert([noteData])
                        .select()
                        .single();
                    if (error) throw error;
                    noteId = data.id;
                    // Guardar ID en currentNote para re-uso
                    this.currentNote = { ...this.currentNote, id: noteId };
                }

                // Handle Checklist Items
                if (type === 'checklist') {
                    const itemsToDelete = this.checklistItems.filter(i => i._deleted && i.id).map(i => i.id);
                    if (itemsToDelete.length > 0) {
                        await window.supabase.from('note_items').delete().in('id', itemsToDelete);
                    }

                    const activeItems = this.checklistItems.filter(i => !i._deleted && i.content.trim() !== '');
                    for (let i = 0; i < activeItems.length; i++) {
                        const item = activeItems[i];
                        const itemData = {
                            note_id: noteId,
                            content: item.content,
                            is_completed: item.is_completed,
                            order_index: i
                        };

                        if (item.id && item.isModified) {
                            await window.supabase.from('note_items').update(itemData).eq('id', item.id);
                        } else if (item.isNew) {
                            await window.supabase.from('note_items').insert([itemData]);
                        }
                    }
                }

                if (window.uiManager) window.uiManager.showToast('Nota guardada ✅', 'success');

                // Redirigir a /notas forzando reload para que aparezca la nota
                setTimeout(() => { window.location.href = '/notas'; }, 500);

            } catch (err) {
                console.error('Error saving note:', err);
                if (window.uiManager) window.uiManager.showToast('Error al guardar la nota', 'error');
                this.showLoading(false);
            }
        }

        async deleteCurrentNote() {
            if (this.currentNote && this.currentNote.id) {
                await this.deleteNotePrompt(this.currentNote.id);
                window.history.back();
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
