async function test() {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Authorization': `Bearer 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`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://recipepantry.app',
                'X-Title': 'Recipe Pantry'
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [{ role: 'user', content: 'hello' }],
                max_tokens: 10
            })
        });

        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Data:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
