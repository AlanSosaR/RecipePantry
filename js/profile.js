// js/profile.js
// Manager para la vista de perfil de usuario

class ProfileManager {
    constructor() {
        this.form = document.getElementById('profile-form');
        this.btnSave = document.getElementById('btn-save-profile');
        this.btnDeletePrefix = document.getElementById('btn-delete-prefix');

        this.fields = {
            prefix: document.getElementById('prefix'),
            customPrefixWrapper: document.getElementById('custom-prefix-wrapper'),
            customPrefixInput: document.getElementById('custom-prefix-input'),
            first_name: document.getElementById('first_name'),
            last_name: document.getElementById('last_name'),
            email: document.getElementById('email'),
            current_password: document.getElementById('current_password'),
            new_password: document.getElementById('new_password'),
            confirm_password: document.getElementById('confirm_password')
        };

        this.userCustomPrefixes = []; // Lista de nombres de prefijos creados por el lector
        this.staticPrefixes = [
            'Chef', 'Sous Chef', 'Cocinero', 'Panadero', 
            'Bartender', 'Sommelier', 'Barista', 
            'Pastelero', 'Pizzero'
        ];

        this.init();
    }

    async init() {
        // 1. Requerir auth
        const ok = await window.authManager.requireAuth();
        if (!ok) return;

        // 2. Cargar prefijos personalizados de la BD
        await this.loadCustomPrefixes();

        // 3. Cargar datos del usuario
        this.loadUserData();

        // 4. Event Listeners
        if (this.btnSave) {
            this.btnSave.onclick = (e) => this.handleSave(e);
        }

        const avatarContainer = document.getElementById('profile-hero-avatar');
        const avatarInput = document.getElementById('avatar-upload-input');
        if (avatarContainer && avatarInput) {
            avatarContainer.addEventListener('click', () => avatarInput.click());
            avatarInput.addEventListener('change', (e) => this.handleAvatarUpload(e));
        }

        // Custom Prefix blur logic
        if (this.fields.customPrefixInput) {
            this.fields.customPrefixInput.addEventListener('blur', () => this.handleCustomPrefixBlur());
            this.fields.customPrefixInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleCustomPrefixBlur();
                }
            });
        }

        // 5. Traducciones iniciales
        if (window.i18n) {
            window.i18n.applyLanguage(window.i18n.getLang());
        }

        console.log('👤 ProfileManager inicializado (v213)');
    }

    handleCurrentPasswordInput(value) {
        if (this.verifyTimeout) clearTimeout(this.verifyTimeout);
        
        const statusEl = document.getElementById('current-pass-status');
        const container = document.getElementById('current-pass-container');
        if (!statusEl) return;

        if (!value) {
            statusEl.textContent = '';
            if (container) container.classList.remove('verified');
            this.currentPasswordVerified = false;
            return;
        }

        statusEl.textContent = 'Verificando...';
        statusEl.style.color = '#bbb';
        if (container) container.classList.remove('verified');

        this.verifyTimeout = setTimeout(async () => {
            const res = await window.authManager.verifyCurrentPassword(value);
            if (res.success) {
                statusEl.textContent = '✓ Contraseña verificada';
                statusEl.style.color = '#10B981';
                if (container) container.classList.add('verified');
                this.currentPasswordVerified = true;
            } else {
                statusEl.textContent = '✗ Contraseña incorrecta';
                statusEl.style.color = '#EF4444';
                if (container) container.classList.remove('verified');
                this.currentPasswordVerified = false;
            }
        }, 1000);
    }

    handleNewPasswordInput(value) {
        const statusEl = document.getElementById('new-password-status');
        const container = document.getElementById('new-pass-container');
        if (!statusEl) return;
        
        if (!value) {
            statusEl.textContent = '';
            if (container) container.classList.remove('verified');
            return;
        }

        if (value.length < 6) {
            statusEl.textContent = '✗ Mínimo 6 caracteres';
            statusEl.style.color = '#EF4444';
            if (container) container.classList.remove('verified');
        } else {
            statusEl.textContent = '✓ Longitud válida';
            statusEl.style.color = '#10B981';
            if (container) container.classList.add('verified');
        }
        
        // Re-validar confirmación si hay algo
        this.handleConfirmPasswordInput(this.fields.confirm_password.value);
    }

    handleConfirmPasswordInput(value) {
        const statusEl = document.getElementById('confirm-password-status');
        const container = document.getElementById('confirm-pass-container');
        if (!statusEl) return;
        
        const newPass = this.fields.new_password.value;
        if (!value) {
            statusEl.textContent = '';
            if (container) container.classList.remove('verified');
            return;
        }

        if (value !== newPass) {
            statusEl.textContent = '✗ Las contraseñas no coinciden';
            statusEl.style.color = '#EF4444';
            if (container) container.classList.remove('verified');
        } else if (value.length >= 6) {
            statusEl.textContent = '✓ Las contraseñas coinciden';
            statusEl.style.color = '#10B981';
            if (container) container.classList.add('verified');
        } else {
             statusEl.textContent = '';
             if (container) container.classList.remove('verified');
        }
    }

    async loadCustomPrefixes() {
        try {
            const user = window.authManager.currentUser;
            if (!user) return;

            const { data, error } = await window.supabaseClient
                .from('user_custom_prefixes')
                .select('name')
                .eq('user_id', user.id);

            if (error) throw error;

            this.userCustomPrefixes = data.map(p => p.name);
            console.log('📋 Prefijos personalizados cargados:', this.userCustomPrefixes);

            // Poblar el select con estos prefijos
            const otherGroup = document.getElementById('custom-prefixes-group');
            if (otherGroup) {
                // Limpiar opciones previas que no sean la de "Escribe tu prefijo..."
                const options = Array.from(otherGroup.children);
                options.forEach(opt => {
                    if (opt.value !== "") opt.remove();
                });

                // Agregar los cargados
                this.userCustomPrefixes.forEach(name => {
                    this.addOptionToGroup(otherGroup, name);
                });
            }
        } catch (err) {
            console.error('Error cargando prefijos:', err);
        }
    }

    addOptionToGroup(group, value) {
        const newOption = document.createElement('option');
        newOption.value = value;
        newOption.text = value;
        
        // Insertar antes de la opción vacía
        const emptyOption = Array.from(group.children).find(opt => opt.value === "");
        if (emptyOption) {
            group.insertBefore(newOption, emptyOption);
        } else {
            group.appendChild(newOption);
        }
    }

    loadUserData() {
        const user = window.authManager.currentUser;
        if (!user) return;

        const prefix = user.prefix || 'Chef';
        
        // Si el prefijo actual es uno que no está en la lista estática ni en la de custom, 
        // lo agregamos temporalmente para que se vea seleccionado (por si viene de una versión anterior o compartida)
        if (!this.staticPrefixes.includes(prefix) && !this.userCustomPrefixes.includes(prefix)) {
            const otherGroup = document.getElementById('custom-prefixes-group');
            if (otherGroup) this.addOptionToGroup(otherGroup, prefix);
        }

        if (this.fields.prefix) {
            this.fields.prefix.value = prefix;
            this.updateDeleteButtonVisibility();
        }

        if (this.fields.first_name) this.fields.first_name.value = user.first_name || '';
        if (this.fields.last_name) this.fields.last_name.value = user.last_name || '';
        if (this.fields.email) this.fields.email.value = user.email || '';

        this.updateProfileVisuals(user);
    }

    handlePrefixChange() {
        const select = this.fields.prefix;
        const wrapper = this.fields.customPrefixWrapper;
        const input = this.fields.customPrefixInput;

        if (select.value === "") {
            if (wrapper) wrapper.style.display = 'block';
            if (input) {
                input.value = "";
                input.focus();
            }
        } else {
            if (wrapper) wrapper.style.display = 'none';
        }
        
        this.updateDeleteButtonVisibility();
    }

    updateDeleteButtonVisibility() {
        if (!this.btnDeletePrefix || !this.fields.prefix) return;
        
        const currentVal = this.fields.prefix.value;
        // Solo mostrar botón de borrar si es un prefijo personalizado del usuario
        const isCustom = this.userCustomPrefixes.includes(currentVal);
        this.btnDeletePrefix.style.display = isCustom ? 'flex' : 'none';
    }

    async handleCustomPrefixBlur() {
        const input = this.fields.customPrefixInput;
        const select = this.fields.prefix;
        const wrapper = this.fields.customPrefixWrapper;

        const newValue = input.value.trim();
        if (newValue) {
            // 1. Guardar en Base de Datos si no existe
            const exists = this.userCustomPrefixes.includes(newValue) || this.staticPrefixes.includes(newValue);
            
            if (!exists) {
                try {
                    const user = window.authManager.currentUser;
                    const { error } = await window.supabaseClient
                        .from('user_custom_prefixes')
                        .insert([{ user_id: user.id, name: newValue }]);
                        
                    if (error) throw error;
                    
                    this.userCustomPrefixes.push(newValue);
                    const otherGroup = document.getElementById('custom-prefixes-group');
                    if (otherGroup) this.addOptionToGroup(otherGroup, newValue);
                    console.log(`✓ "${newValue}" guardado en BD`);
                } catch (err) {
                    console.error('Error guardando nuevo prefijo:', err);
                    window.utils.showToast('No se pudo guardar el prefijo', 'error');
                }
            }
            
            select.value = newValue;
            if (wrapper) wrapper.style.display = 'none';
            this.updateDeleteButtonVisibility();
        }
    }

    async handleDeletePrefix() {
        const select = this.fields.prefix;
        const prefixToDelete = select.value;
        
        if (!prefixToDelete || !this.userCustomPrefixes.includes(prefixToDelete)) return;

        const confirmOk = confirm(`¿Estás seguro de que deseas eliminar el prefijo "${prefixToDelete}"?`);
        if (!confirmOk) return;

        try {
            const user = window.authManager.currentUser;
            const { error } = await window.supabaseClient
                .from('user_custom_prefixes')
                .delete()
                .eq('user_id', user.id)
                .eq('name', prefixToDelete);

            if (error) throw error;

            // Quitar de la lista local
            this.userCustomPrefixes = this.userCustomPrefixes.filter(p => p !== prefixToDelete);
            
            // Quitar del select
            const option = Array.from(select.options).find(opt => opt.value === prefixToDelete);
            if (option) option.remove();

            // Seleccionar el por defecto (Chef)
            select.value = 'Chef';
            this.updateDeleteButtonVisibility();
            
            window.utils.showToast('Prefijo eliminado correctamente', 'success');
        } catch (err) {
            console.error('Error eliminando prefijo:', err);
            window.utils.showToast('Error al eliminar', 'error');
        }
    }

    updateProfileVisuals(user) {
        // Actualizar avatar grande del perfil
        const initialsEl = document.getElementById('avatar-initials');
        const imgEl = document.getElementById('avatar-img');

        if (user.avatar_url) {
            if (imgEl) {
                imgEl.src = user.avatar_url;
                imgEl.style.display = 'block';
                imgEl.style.opacity = '1';
            }
            if (initialsEl) initialsEl.style.display = 'none';
        } else {
            if (imgEl) imgEl.style.display = 'none';
            if (initialsEl) {
                const initials = ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || '??';
                initialsEl.textContent = initials;
                initialsEl.style.display = 'block';
            }
        }

        // Sincronizar con el sidebar si está presente (v201 fix)
        if (window.updateGlobalUserUI) {
            window.updateGlobalUserUI();
            // Re-sync after a short delay for safety in profile view
            setTimeout(() => window.updateGlobalUserUI(), 500);
        }
    }

    async handleAvatarUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const user = window.authManager.currentUser;
        if (!user) return;

        // Limpiar input
        e.target.value = '';

        // Previsualización inmediata
        const avatarImg = document.getElementById('avatar-img');
        const initialsEl = document.getElementById('avatar-initials');
        
        if (avatarImg) {
            avatarImg.src = URL.createObjectURL(file);
            avatarImg.style.display = 'block';
            avatarImg.style.opacity = '0.5';
            if (initialsEl) initialsEl.style.display = 'none';
        }

        try {
            window.utils.showToast('Subiendo foto...', 'info');
            
            // 1. Borrar anterior
            if (user.avatar_url) {
                try {
                    const urlPath = user.avatar_url.split('?')[0];
                    const oldFileName = urlPath.split('/').pop();
                    if (oldFileName && oldFileName.includes(user.auth_user_id)) {
                        await window.supabaseClient.storage
                            .from('avatars')
                            .remove([oldFileName]);
                    }
                } catch (err) {}
            }

            // 2. Subir nueva
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.auth_user_id}_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await window.supabaseClient.storage
                .from('avatars')
                .upload(fileName, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;
            
            // 3. URL
            const { data: { publicUrl } } = window.supabaseClient.storage
                .from('avatars')
                .getPublicUrl(fileName);
                
            user.avatar_url = publicUrl; 
            const res = await window.authManager.updateProfile({ avatar_url: publicUrl });
            if (!res.success) throw new Error(res.error);
            
            window.utils.showToast('Foto de perfil actualizada', 'success');
            this.updateProfileVisuals(window.authManager.currentUser);
        } catch (error) {
            console.error('Error uploading avatar:', error);
            window.utils.showToast('Error al subir la foto', 'error');
            this.updateProfileVisuals(user); 
        }
    }

    async handleSave(e) {
        e.preventDefault();

        const firstName = this.fields.first_name.value.trim();
        const lastName = this.fields.last_name.value.trim();
        const prefix = this.fields.prefix.value;
        const newPass = this.fields.new_password.value;
        const confirmPass = this.fields.confirm_password.value;

        if (!firstName) {
            window.utils.showToast('El nombre es obligatorio', 'error');
            return;
        }

        this.btnSave.disabled = true;
        const originalContent = this.btnSave.innerHTML;
        this.btnSave.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Guardando...';

        try {
            let profileUpdated = false;
            let passwordUpdated = false;

            const user = window.authManager.currentUser;
            if (firstName !== user.first_name || lastName !== user.last_name || prefix !== user.prefix) {
                const res = await window.authManager.updateProfile({
                    first_name: firstName,
                    last_name: lastName,
                    prefix: prefix
                });
                if (!res.success) throw new Error(res.error);
                profileUpdated = true;
                this.updateProfileVisuals(res.user);
            }

            if (newPass) {
                if (!this.currentPasswordVerified) {
                    throw new Error('Primero debes verificar tu contraseña actual');
                }
                if (newPass.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
                if (newPass !== confirmPass) throw new Error('Las nuevas contraseñas no coinciden');

                const resPass = await window.authManager.updatePassword(newPass);
                if (!resPass.success) throw new Error(resPass.error);
                passwordUpdated = true;

                this.fields.new_password.value = '';
                this.fields.confirm_password.value = '';
                this.fields.current_password.value = '';
                const statusEl = document.getElementById('current-pass-status');
                if (statusEl) statusEl.textContent = '';
                this.currentPasswordVerified = false;
            }

            if (profileUpdated || passwordUpdated) {
                window.utils.showToast('Perfil actualizado correctamente', 'success');
            } else {
                window.utils.showToast('No se detectaron cambios', 'info');
            }
        } catch (error) {
            window.utils.showToast(error.message, 'error');
        } finally {
            this.btnSave.disabled = false;
            this.btnSave.innerHTML = originalContent;
        }
    }

    togglePass(inputId, iconElement) {
        const input = document.getElementById(inputId);
        const icon = iconElement.querySelector('.material-symbols-outlined');
        if (input.type === 'password') {
            input.type = 'text';
            icon.textContent = 'visibility_off';
        } else {
            input.type = 'password';
            icon.textContent = 'visibility';
        }
    }

    toggleSecurity() {
        const content = document.getElementById('security-content');
        const chevron = document.getElementById('security-chevron');
        if (content) {
            content.classList.toggle('expanded');
            if (chevron) {
                chevron.textContent = content.classList.contains('expanded') ? 'expand_less' : 'expand_more';
            }
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.profileManager = new ProfileManager();
});
