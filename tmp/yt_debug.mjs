const videoId = 'Z7iUYXCMpkg';

async function test() {
  // Test YouTube Shorts URL
  const res = await fetch('https://www.youtube.com/shorts/' + videoId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Cookie': 'CONSENT=YES+cb; SOCS=CAESEwgDEgk0OTczMDg1MTUaAmVzIAEaBgiAi5KoBg',
    }
  });
  console.log('Shorts status:', res.status);
  const html = await res.text();
  console.log('HTML size:', html.length);
  console.log('Has ytInitialPlayerResponse:', html.includes('ytInitialPlayerResponse'));
  console.log('Has timedtext:', html.includes('timedtext'));
  console.log('Has captionTracks:', html.includes('captionTracks'));

  // Find timedtext URL
  const m1 = html.match(/https:\/\/www\.youtube\.com\/api\/timedtext[^"\\]+/);
  if (m1) console.log('Found timedtext URL:', m1[0].substring(0, 150));

  // Find shortDescription
  const m2 = html.match(/"shortDescription":"([^"]{10,200})/);
  if (m2) console.log('Found description:', m2[1].substring(0, 200));
  else console.log('No shortDescription found');

  // Check if it's a consent wall
  if (html.includes('consent.youtube.com') || html.includes('Before you continue')) {
    console.log('>>> CONSENT WALL DETECTED');
  }
  if (html.includes('UNPLAYABLE') || html.includes('LOGIN_REQUIRED')) {
    console.log('>>> BLOCKED: UNPLAYABLE/LOGIN_REQUIRED');
  }
}

test().catch(e => console.error('ERROR:', e.message));
