export default async function handler(req, res) {
    return res.status(200).json({
        url_defined: !!process.env.SUPABASE_URL,
        key_defined: !!process.env.SUPABASE_ANON_KEY,
        node_version: process.version || 'unknown'
    });
}
