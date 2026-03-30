// Using native fetch (Node 18+)
async function testExtraction() {
  const videoId = 'F6Q8515y88M';
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  console.log(`Fetching ${url}...`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    }
  });
  
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  
  const findMeta = (tag) => {
    const re1 = new RegExp(`<meta[^>]+property=["']${tag}["'][^>]+content=["'](.*?)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["'](.*?)["'][^>]+property=["']${tag}["']`, 'i');
    const re3 = new RegExp(`<meta[^>]+name=["']${tag}["'][^>]+content=["'](.*?)["']`, 'i');
    
    const m1 = html.match(re1); if (m1) return m1[1];
    const m2 = html.match(re2); if (m2) return m2[1];
    const m3 = html.match(re3); if (m3) return m3[1];
    return null;
  };

  let title = findMeta('og:title') || (html.match(/<title>(.*?)<\/title>/i)?.[1] || 'YouTube Video');
  let description = findMeta('og:description') || findMeta('description') || '';
  
  // Try to find the FULL description in ytInitialData (usually much longer)
  const shortDescMatch = html.match(/"shortDescription":"(.*?)"/);
  if (shortDescMatch) {
    const fullDesc = shortDescMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    if (fullDesc.length > description.length) {
      console.log(`📡 [Gemini] Swapping short description (${description.length}) for full description (${fullDesc.length})`);
      description = fullDesc;
    }
  }

  console.log('--- RESULTS ---');
  console.log('Title:', title);
  console.log('Description Length:', description.length);
  console.log('Description Preview:', description.substring(0, 200));
  
  if (description.toLowerCase().includes('garbanzos')) {
    console.log('✅ SUCCESS: "Garbanzos" found in description.');
  } else {
    console.log('❌ FAILURE: "Garbanzos" NOT found in description.');
  }
}

testExtraction().catch(console.error);
