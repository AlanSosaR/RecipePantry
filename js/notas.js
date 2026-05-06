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

            // Intentar obtener perfil extendido desde la BD si no lo tenemos completo
            try {
                // Si el perfil ya tiene avatar_url y nombres, no necesitamos re-consultar
                if (user && user.avatar_url && user.first_name) {
                     if (window.updateGlobalUserUI) window.updateGlobalUserUI();
                     return;
                }

                const searchId = user.auth_user_id || user.id || authUser?.id;
                if (!searchId) throw new Error('NO_USER_ID');

                const { data: profile, error: profileError } = await window.supabaseClient
                    .from('users')
                    .select('first_name, last_name, prefix, avatar_url')
                    .eq('auth_user_id', searchId)
                    .maybeSingle();

                if (profileError) {
                    console.warn("⚠️ Error recuperando perfil extendido:", profileError);
                }

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
                } else {
                    throw new Error('NO_DB_PROFILE');
                }
            } catch (e) {
                // Sin perfil extendido: usar user_metadata de Auth (el objeto real de Supabase Auth)
                const meta = authUser?.user_metadata || {};
                const displayName = meta.full_name || meta.name || authUser?.email || 'Chef';
                if (greetingEl) greetingEl.textContent = displayName.split(' ')[0];

                // Montar datos mínimos en currentUser para que updateGlobalUserUI funcione
                if (window.authManager.currentUser) {
                    if (!window.authManager.currentUser.avatar_url) {
                        window.authManager.currentUser.avatar_url = meta.avatar_url || meta.picture || null;
                    }
                    const parts = displayName.trim().split(/\s+/);
                    if (!window.authManager.currentUser.first_name) {
                        window.authManager.currentUser.first_name = parts[0] || '';
                        window.authManager.currentUser.last_name  = parts[1] || '';
                    }
                }
            }

            // Disparar el updater global (maneja foto e iniciales para .user-avatar-m3)
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
                    .select('*')
                    .eq('user_id', user.auth_user_id || user.id)
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
                        <div class="note-spacer"></div>
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
                    const { error } = await window.supabaseClient.from('notes').delete().eq('id', id);
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

                // Handle Checklist Items
                if (type === 'checklist') {
                    const itemsToDelete = this.checklistItems.filter(i => i._deleted && i.id).map(i => i.id);
                    if (itemsToDelete.length > 0) {
                        await window.supabaseClient.from('note_items').delete().in('id', itemsToDelete);
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
                            await window.supabaseClient.from('note_items').update(itemData).eq('id', item.id);
                        } else if (item.isNew) {
                            await window.supabaseClient.from('note_items').insert([itemData]);
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
