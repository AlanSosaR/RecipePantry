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

            const path = window.location.pathname;
            
            // Wait for dbManager to be initialized
            if (!window.dbManager) {
                console.error("dbManager not initialized yet.");
                return;
            }

            if (path.includes('notas.html') || path.includes('/notas')) {
                this.initListView();
            } else if (path.includes('nota-form.html')) {
                this.initFormView();
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
                card.href = `/nota-form.html?id=${note.id}`;
                card.className = 'note-card group';
                card.innerHTML = `
                    <div class="note-header">
                        <span class="note-type-badge">${note.type === 'checklist' ? 'Lista' : 'Nota'}</span>
                        <button class="note-menu-btn" onclick="event.preventDefault(); window.notasManager.deleteNotePrompt('${note.id}')">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                    <h3>${this.escapeHTML(note.title || 'Sin Título')}</h3>
                    ${note.type === 'text' 
                        ? `<p class="note-text">${this.escapeHTML(note.content || '')}</p>` 
                        : `<div class="checklist-preview"><span class="item-text" style="color: var(--md-on-surface-var); font-style: italic;">Toque para ver los elementos...</span></div>`
                    }
                    <div class="note-footer">
                        <span class="material-symbols-outlined">schedule</span>
                        ${new Date(note.updated_at).toLocaleDateString()}
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
                this.showLoading(true);
                const title = document.getElementById('note-title').value.trim();
                const type = document.getElementById('note-type').value;
                const content = type === 'text' ? document.getElementById('note-content').value.trim() : null;
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
                }

                // Handle Checklist Items
                if (type === 'checklist') {
                    // 1. Delete marked items
                    const itemsToDelete = this.checklistItems.filter(i => i._deleted && i.id).map(i => i.id);
                    if (itemsToDelete.length > 0) {
                        await window.supabase.from('note_items').delete().in('id', itemsToDelete);
                    }

                    // 2. Insert/Update active items
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

                if (window.uiManager) window.uiManager.showToast('Nota guardada con éxito', 'success');
                setTimeout(() => window.history.back(), 500);

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
