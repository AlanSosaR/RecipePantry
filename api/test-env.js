export const config = { runtime: 'edge' };

export default async function handler(req) {
    return new Response(JSON.stringify({
        url_defined: !!process.env.SUPABASE_URL,
        key_defined: !!process.env.SUPABASE_ANON_KEY,
        node_version: process.version || 'unknown'
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
