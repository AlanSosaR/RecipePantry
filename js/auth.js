// js/auth.js
// Sistema de autenticación completo (Clase AuthManager)

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.session = null;
    }

    // Verificar si hay sesión activa
    async checkAuth() {
        try {
            // 1. Verificar sesión en Supabase (rápido, a menudo local)
            const { data, error: sessionError } = await window.supabaseClient.auth.getSession();

            if (sessionError) throw sessionError;

            const session = data?.session;
            if (!session) {
                this.currentUser = null;
                this.session = null;
                document.documentElement.removeAttribute('data-auth-likely');
                return false;
            }

            this.session = session;
            document.documentElement.setAttribute('data-auth-likely', 'true');

            // 2. Intentar obtener el perfil (opcional para considerar "autenticado")
            // Si ya tenemos el usuario en memoria, no hace falta volver a la DB cada vez
            if (this.currentUser && this.currentUser.auth_user_id === session.user.id) {
                return true;
            }

            const { data: userData, error: userError } = await window.supabaseClient
                .from('users')
                .select('*')
                .eq('auth_user_id', session.user.id)
                .single();

            // Si el perfil no existe, lo creamos
            if (userError && userError.code === 'PGRST116') {
                console.log('Perfil no encontrado, creando uno nuevo...');
                return await this.createProfile(session.user);
            } else if (userError) {
                console.warn('⚠️ Error al cargar perfil, pero la sesión es válida:', userError.message);
                // Si hay sesión pero falló la DB, intentamos usar los datos del payload de la sesión como fallback
                this.currentUser = {
                    auth_user_id: session.user.id,
                    email: session.user.email,
                    first_name: session.user.user_metadata?.first_name || 'Chef',
                    last_name: session.user.user_metadata?.last_name || ''
                };
                return true; // Seguimos autenticados a nivel de sesión
            }

            this.currentUser = userData;
            console.log('✅ Usuario autenticado:', userData.email);
            return true;

        } catch (error) {
            console.error('❌ Error verificando auth:', error);
            // Solo devolvemos false si realmente no hay rastro de sesión
            return !!this.session;
        }
    }

    async createProfile(authUser) {
        try {
            const firstName = authUser.user_metadata?.first_name || authUser.email.split('@')[0];
            const lastName = authUser.user_metadata?.last_name || '';

            const { data: userData, error: userError } = await window.supabaseClient
                .from('users')
                .insert([{
                    auth_user_id: authUser.id,
                    email: authUser.email,
                    first_name: firstName,
                    last_name: lastName,
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

    // Logout
    async signOut() {
        try {
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
