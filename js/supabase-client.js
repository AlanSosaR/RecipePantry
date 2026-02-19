import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Configuración de Supabase
// Reemplaza con tus credenciales reales si no se cargan automáticamente
const SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
