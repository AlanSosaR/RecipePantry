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
            const { data: { session }, error } = await window.supabaseClient.auth.getSession();

            if (error) throw error;

            if (!session) {
                return false;
            }

            this.session = session;

            // Obtener datos completos del usuario
            const { data: userData, error: userError } = await window.supabaseClient
                .from('users')
                .select('*')
                .eq('auth_user_id', session.user.id)
                .single();

            // Si el perfil no existe en la tabla 'users', lo creamos (esto puede pasar tras el registro)
            if (userError && userError.code === 'PGRST116') {
                console.log('Perfil no encontrado, creando uno nuevo...');
                return await this.createProfile(session.user);
            } else if (userError) {
                throw userError;
            }

            this.currentUser = userData;
            console.log('✅ Usuario autenticado:', userData.email);
            return true;

        } catch (error) {
            console.error('❌ Error verificando auth:', error);
            return false;
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
            return false;
        }
    }

    // Requerir autenticación (usar en páginas protegidas)
    async requireAuth() {
        const isAuthenticated = await this.checkAuth();

        if (!isAuthenticated) {
            // Guardar URL actual para redirigir después del login
            sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
            window.location.href = 'login.html';
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

            // 2. Crear perfil en users
            const { data: userData, error: userError } = await window.supabaseClient
                .from('users')
                .insert([{
                    auth_user_id: authData.user.id,
                    email,
                    first_name: firstName,
                    last_name: lastName,
                    collection_name: `Recetario de ${firstName}`
                }])
                .select()
                .single();

            if (userError) throw userError;

            // 3. Crear categorías predeterminadas
            await this.createDefaultCategories(userData.id);

            return { success: true, user: userData };

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

            if (userError) throw userError;

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
            window.location.href = 'index.html';

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
