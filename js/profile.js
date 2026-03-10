// js/profile.js
// Manager para la vista de perfil de usuario

class ProfileManager {
    constructor() {
        this.form = document.getElementById('profile-form');
        this.btnSave = document.getElementById('btn-save-profile');

        this.fields = {
            prefix: document.getElementById('prefix'),
            first_name: document.getElementById('first_name'),
            last_name: document.getElementById('last_name'),
            email: document.getElementById('email'),
            current_password: document.getElementById('current_password'),
            new_password: document.getElementById('new_password'),
            confirm_password: document.getElementById('confirm_password')
        };

        this.init();
    }

    async init() {
        // 1. Requerir auth
        const ok = await window.authManager.requireAuth();
        if (!ok) return;

        // 2. Cargar datos
        this.loadUserData();

        // 3. Event Listeners
        if (this.btnSave) {
            this.btnSave.onclick = (e) => this.handleSave(e);
        }

        const avatarContainer = document.getElementById('profile-hero-avatar');
        const avatarInput = document.getElementById('avatar-upload-input');
        if (avatarContainer && avatarInput) {
            avatarContainer.addEventListener('click', () => avatarInput.click());
            avatarInput.addEventListener('change', (e) => this.handleAvatarUpload(e));
        }

        // 4. Traducciones iniciales
        if (window.i18n) {
            window.i18n.applyLanguage(window.i18n.getLang());
        }

        console.log('👤 ProfileManager inicializado');
    }

    loadUserData() {
        const user = window.authManager.currentUser;
        if (!user) return;

        if (this.fields.prefix) this.fields.prefix.value = user.prefix || 'Chef';
        if (this.fields.first_name) this.fields.first_name.value = user.first_name || '';
        if (this.fields.last_name) this.fields.last_name.value = user.last_name || '';
        if (this.fields.email) this.fields.email.value = user.email || '';

        this.updateProfileVisuals(user);
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

        // Sincronizar con el sidebar si está presente
        if (window.updateGlobalUserUI) {
            window.updateGlobalUserUI();
        }
    }

    async handleAvatarUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const user = window.authManager.currentUser;
        if (!user) return;

        // Limpiar input para permitir seleccionar la misma imagen si hubo error
        e.target.value = '';

        // Previsualización inmediata
        const avatarImg = document.getElementById('avatar-img');
        const initialsEl = document.getElementById('avatar-initials');
        
        if (avatarImg) {
            avatarImg.src = URL.createObjectURL(file);
            avatarImg.style.display = 'block';
            avatarImg.style.opacity = '0.5'; // Dimming while uploading
            if (initialsEl) initialsEl.style.display = 'none';
        }

        try {
            window.utils.showToast(window.i18n?.t('uploadingAvatar') || 'Subiendo foto...', 'info');
            
            // Reemplazar la anterior usando un nombre fijo (auth_user_id que coincide con RLS)
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.auth_user_id}.${fileExt}`;
            
            const { error: uploadError } = await window.supabaseClient.storage
                .from('avatars')
                .upload(fileName, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;
            
            // Obtener URL pública
            const { data: { publicUrl } } = window.supabaseClient.storage
                .from('avatars')
                .getPublicUrl(fileName);
                
            // Evitar caché del navegador adjuntando la hora
            const urlWithCacheBuster = `${publicUrl}?t=${new Date().getTime()}`;
                
            // Actualizar el perfil del usuario
            const res = await window.authManager.updateProfile({
                avatar_url: urlWithCacheBuster
            });
            
            if (!res.success) throw new Error(res.error);
            
            window.utils.showToast(window.i18n?.t('avatarUpdated') || 'Foto de perfil actualizada', 'success');
            this.updateProfileVisuals(window.authManager.currentUser);
            
        } catch (error) {
            console.error('Error uploading avatar:', error);
            window.utils.showToast(window.i18n?.t('errorUploadingAvatar') || 'Error al subir la foto', 'error');
            // Revertir UI
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

        // Validaciones básicas
        if (!firstName) {
            window.utils.showToast(window.i18n?.t('msgNameReq') || 'El nombre es obligatorio', 'error');
            return;
        }

        this.btnSave.disabled = true;
        const originalContent = this.btnSave.innerHTML;
        this.btnSave.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Guardando...';

        try {
            let profileUpdated = false;
            let passwordUpdated = false;

            // 1. Actualizar perfil si hubo cambios
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

            // 2. Actualizar contraseña si se escribió algo
            if (newPass) {
                if (newPass.length < 6) {
                    throw new Error(window.i18n?.t('msgPassLen') || 'La contraseña debe tener al menos 6 caracteres');
                }
                if (newPass !== confirmPass) {
                    throw new Error(window.i18n?.t('msgPassMismatch') || 'Las contraseñas no coinciden');
                }

                const resPass = await window.authManager.updatePassword(newPass);
                if (!resPass.success) throw new Error(resPass.error);
                passwordUpdated = true;

                // Limpiar campos de password
                this.fields.new_password.value = '';
                this.fields.confirm_password.value = '';
            }

            if (profileUpdated || passwordUpdated) {
                window.utils.showToast(window.i18n?.t('profileUpdateSuccess') || 'Perfil actualizado correctamente', 'success');
            } else {
                window.utils.showToast(window.i18n?.t('profileNoChanges') || 'No se detectaron cambios', 'info');
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
