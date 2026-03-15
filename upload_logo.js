const fs = require('fs');

const SUPABASE_URL = 'https://fsgfrqrerddmopojjcsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ny8r880V6IRSMABnHVfzJw_0in8E-2z';

async function upload() {
    try {
        const fileContent = fs.readFileSync('./images/icons/icon-192x192.png');

        // We try to upsert it (overwrite if it exists)
        const response = await fetch(`${SUPABASE_URL}/storage/v1/object/avatar/app-logo.png`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'image/png',
                'x-upsert': 'true'
            },
            body: fileContent
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', data);

        if (response.ok) {
            console.log('Public URL:', `${SUPABASE_URL}/storage/v1/object/public/avatar/app-logo.png`);
        }
    } catch (err) {
        console.error(err);
    }
}

upload();
