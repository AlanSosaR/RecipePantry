// js/auth.js
// Sistema de autenticación completo (Clase AuthManager)

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.session = null;
    }

    // Verificar si hay sesión activa
    async checkAuth() {
        console.log('🔐 AuthManager.checkAuth: Iniciando...');
        try {
            // 1. Verificar sesión en Supabase (con timeout de seguridad para v214)
            const sessionPromise = window.supabaseClient.auth.getSession();
            const sessionTimeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SESSION')), 2000));
            
            let sessionData;
            try {
                const { data } = await Promise.race([sessionPromise, sessionTimeoutPromise]);
                sessionData = data;
                console.log('🔐 AuthManager.checkAuth: Sesion obtenida:', sessionData?.session ? 'Si' : 'No');
            } catch (e) {
                if (e.message === 'TIMEOUT_SESSION') {
                    console.warn('⚠️ Timeout obteniendo sesión, asumiendo estado offline/lento');
                    // v220: NO re-intentar sin timeout. Si falló la primera, usamos el estado local si existe.
                    // Supabase-js maneja la sesión internamente.
                } else {
                    throw e;
                }
            }

            const session = sessionData?.session || this.session;
            if (!session) {
                this.currentUser = null;
                this.session = null;
                document.documentElement.removeAttribute('data-auth-likely');
                return false;
            }

            this.session = session;
            document.documentElement.setAttribute('data-auth-likely', 'true');

            // 2. Intentar obtener el perfil (opcional para considerar "autenticado")
            if (this.currentUser && this.currentUser.auth_user_id === session.user.id) {
                return true;
            }

            // Uso de caché si estamos offline explícitamente o el refresh previo falló
            if (!navigator.onLine) {
                console.log('📶 Modo offline detectado, usando perfil caché');
                const cached = localStorage.getItem('recipe_pantry_user_profile');
                if (cached) {
                    try { this.currentUser = JSON.parse(cached); } catch(e){}
                }
                if (!this.currentUser) {
                    this.currentUser = {
                        // id: session.user.id, // ❌ ELIMINADO: Nunca asignar auth_user_id a id (PK de tabla users)
                        auth_user_id: session.user.id,
                        email: session.user.email,
                        first_name: session.user.user_metadata?.first_name || 'Chef',
                        last_name: session.user.user_metadata?.last_name || ''
                    };
                }
                return true;
            }

            // Implementar un timeout para redes intermitentes (Lie-Fi)
            const fetchProfile = window.supabaseClient
                .from('users')
                .select('*')
                .eq('auth_user_id', session.user.id)
                .single();

            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_DB')), 2500));

            console.log('🔐 AuthManager.checkAuth: Consultando perfil de usuario...');
            const response = await Promise.race([fetchProfile, timeoutPromise]);
            console.log('🔐 AuthManager.checkAuth: Perfil obtenido');
            const { data: userData, error: userError } = response;

            // Si el perfil no existe, lo creamos
            if (userError && userError.code === 'PGRST116') {
                console.log('Perfil no encontrado, creando uno nuevo...');
                return await this.createProfile(session.user);
            } else if (userError) {
                console.warn('⚠️ Error al cargar perfil, pero la sesión es válida:', userError.message);
                const cached = localStorage.getItem('recipe_pantry_user_profile');
                if (cached) {
                    try { this.currentUser = JSON.parse(cached); return true; } catch(e){}
                }
                this.currentUser = {
                    // id: session.user.id, // ❌ El ID real solo vendrá de la tabla 'users'
                    auth_user_id: session.user.id,
                    email: session.user.email,
                    first_name: session.user.user_metadata?.first_name || 'Chef',
                    last_name: session.user.user_metadata?.last_name || ''
                };
                return true; 
            }

            this.currentUser = userData;
            console.log('✅ Perfil cargado correctamente:', userData.first_name, userData.last_name);
            localStorage.setItem('recipe_pantry_user_profile', JSON.stringify(userData));
            
            // v227: Forzar actualización de UI si el método existe
            if (window.updateGlobalUserUI) window.updateGlobalUserUI();
            
            console.log('✅ Usuario autenticado:', userData.email);
            return true;

        } catch (error) {
            console.error('❌ Error verificando auth:', error);
            if (error.message === 'TIMEOUT_DB' || error.message === 'TIMEOUT_SESSION') {
                if (this.session) {
                    const cached = localStorage.getItem('recipe_pantry_user_profile');
                    if (cached) {
                        try { this.currentUser = JSON.parse(cached); } catch(e){}
                    }
                    if (!this.currentUser) {
                        this.currentUser = {
                            auth_user_id: this.session.user.id,
                            email: this.session.user.email,
                            first_name: this.session.user.user_metadata?.first_name || 'Chef',
                            last_name: this.session.user.user_metadata?.last_name || ''
                            // NOTA: id (PK) queda null hasta que se cargue de DB
                        };
                    }
                    return true;
                }
            }
            return !!this.session;
        }
    }

    async createProfile(authUser) {
        try {
            const firstName = authUser.user_metadata?.first_name || authUser.email.split('@')[0];
            const lastName = authUser.user_metadata?.last_name || '';
            const prefix = authUser.user_metadata?.prefix || 'Chef';

            const { data: userData, error: userError } = await window.supabaseClient
                .from('users')
                .insert([{
                    auth_user_id: authUser.id,
                    email: authUser.email,
                    first_name: firstName,
                    last_name: lastName,
                    prefix: prefix,
                    collection_name: `Recetario de ${firstName}`
                }])
                .select()
                .single();

            if (userError) throw userError;

            this.currentUser = userData;
            await this.createDefaultCategories(userData.id);
            return true;
        } catch (err) {
            console.error('Error creando perfil:', err);
            // Aún si falla el perfil, si tiene sesión de auth, devolvemos true para no bloquear el acceso
            return true;
        }
    }

    // Requerir autenticación (usar en páginas protegidas)
    async requireAuth() {
        const isAuthenticated = await this.checkAuth();

        if (!isAuthenticated) {
            console.log('🔒 Acceso denegado: Redirigiendo a inicio');
            // Guardar URL actual para redirigir después del login
            sessionStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
            // Usar replace para evitar que esta página quede en el historial de atrás
            window.location.replace('/');
            return false;
        }

        return true;
    }


    // Registro
    async signUp(email, password, firstName, lastName) {
        try {
            await this.clearLocalCache();
            // 1. Crear usuario en auth
            const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        first_name: firstName,
                        last_name: lastName
                    }
                }
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error('No se pudo crear el usuario de autenticación');

            // 2. Crear perfil en users
            const profileCreated = await this.createProfile(authData.user);

            if (!profileCreated) {
                // Si falla la creación del perfil pero el usuario de auth ya existe, 
                // el usuario podrá intentar loguearse y el signIn manejará la creación del perfil.
                console.warn('Usuario de auth creado pero falló el perfil inicial. Se reintentará en el login.');
            }

            return { success: true, user: authData.user };

        } catch (error) {
            console.error('❌ Error en registro:', error);
            return { success: false, error: error.message };
        }
    }

    // Login
    async signIn(email, password) {
        try {
            await this.clearLocalCache();
            const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            // Obtener datos de usuario
            const { data: userData, error: userError } = await window.supabaseClient
                .from('users')
                .select('*')
                .eq('auth_user_id', data.user.id)
                .single();

            if (userError && userError.code === 'PGRST116') {
                console.log('Perfil no encontrado en login, creando uno nuevo...');
                const profileCreated = await this.createProfile(data.user);
                if (!profileCreated) throw new Error('No se pudo crear el perfil de usuario');
                return { success: true, user: this.currentUser };
            } else if (userError) {
                throw userError;
            }

            this.currentUser = userData;
            this.session = data.session;

            console.log('✅ Login exitoso:', email);
            return { success: true, user: userData };

        } catch (error) {
            console.error('❌ Error en login:', error);
            return { success: false, error: error.message };
        }
    }

    // Limpieza de IndexedDB al cambiar de usuario
    async clearLocalCache() {
        if (window.localDB) {
            try {
                await window.localDB.clear('recipes_index');
                await window.localDB.clear('recipes_full');
                await window.localDB.clear('recipes');
                await window.localDB.clear('categories');
                console.log('🧹 Caché local limpiada preventivamente');
            } catch (e) {
                console.warn('No se pudo limpiar la caché', e);
            }
        }
    }

    // Logout
    async signOut() {
        try {
            await this.clearLocalCache();
            const { error } = await window.supabaseClient.auth.signOut();
            if (error) throw error;

            this.currentUser = null;
            this.session = null;

            console.log('✅ Logout exitoso');
            window.location.replace('/');

        } catch (error) {
            console.error('❌ Error en logout:', error);
        }
    }

    // Actualizar perfil del usuario
    async updateProfile(fields) {
        try {
            if (!this.currentUser) throw new Error('No hay usuario logueado');

            const { data, error } = await window.supabaseClient
                .from('users')
                .update(fields)
                .eq('id', this.currentUser.id)
                .select()
                .single();

            if (error) throw error;

            this.currentUser = data;
            localStorage.setItem('recipe_pantry_user_profile', JSON.stringify(data)); // ⚡ v229: Actualización inmediata de cache
            return { success: true, user: data };
        } catch (error) {
            console.error('Error actualizando perfil:', error);
            return { success: false, error: error.message };
        }
    }

    // Actualizar contraseña
    async updatePassword(newPassword) {
        try {
            const { error } = await window.supabaseClient.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error actualizando contraseña:', error);
            return { success: false, error: error.message };
        }
    }

    // Verificar contraseña actual
    async verifyCurrentPassword(password) {
        try {
            if (!this.currentUser || !this.currentUser.email) return { success: false };
            
            const { error } = await window.supabaseClient.auth.signInWithPassword({
                email: this.currentUser.email,
                password: password
            });

            if (error) return { success: false, error: error.message };
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // Recuperar contraseña
    async resetPassword(email) {
        try {
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html',
            });
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error enviando reset:', error);
            return { success: false, error: error.message };
        }
    }

    // Crear categorías predeterminadas
    async createDefaultCategories(userId) {
        const defaultCategories = [
            { name_es: 'Desayunos', name_en: 'Breakfast', icon: 'sunny', color: '#FF7A50' },
            { name_es: 'Almuerzos', name_en: 'Lunch', icon: 'restaurant', color: '#2D9596' },
            { name_es: 'Cenas', name_en: 'Dinner', icon: 'dark_mode', color: '#1A1A1A' },
            { name_es: 'Postres', name_en: 'Desserts', icon: 'cake', color: '#F59E0B' },
            { name_es: 'Bebidas', name_en: 'Drinks', icon: 'local_cafe', color: '#3B82F6' },
            { name_es: 'Saludable', name_en: 'Healthy', icon: 'eco', color: '#10B981' }
        ];

        const categoriesData = defaultCategories.map((cat, index) => ({
            user_id: userId,
            ...cat,
            order_index: index
        }));

        await window.supabaseClient.from('categories').insert(categoriesData);
    }

    // Escuchar cambios de autenticación
    onAuthStateChange(callback) {
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            console.log('Auth event:', event);

            if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.session = null;
            }

            callback(event, session);
        });
    }
}

// Instancia global
window.authManager = new AuthManager();

console.log('✅ AuthManager inicializado');
