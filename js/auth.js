import { supabase } from './supabase-client.js';

export const auth = {
    async signUp(email, password, firstName, lastName) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName
                }
            }
        });
        return { data, error };
    },

    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        return { data, error };
    },

    async signOut() {
        const { error } = await supabase.auth.signOut();
        return { error };
    },

    async getUser() {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    }
};
