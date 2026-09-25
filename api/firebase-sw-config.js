// api/firebase-sw-config.js
// Devuelve la configuración de Firebase para Service Worker desde variables de entorno

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const config = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'recipepantry-e8ef8.firebaseapp.com',
    projectId: process.env.FIREBASE_PROJECT_ID || 'recipepantry-e8ef8',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'recipepantry-e8ef8.firebasestorage.app',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '547631229279',
    appId: process.env.FIREBASE_APP_ID || '1:547631229279:web:5ad75d816f2c37f75e6eea'
  };

  const script = `self.FIREBASE_CONFIG = ${JSON.stringify(config)};\n`;
  res.writeHead(200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Content-Length': Buffer.byteLength(script)
  });
  return res.end(script);
}
