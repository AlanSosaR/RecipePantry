/**
 * bump.cjs — Version bumper genérico para RecipePantry
 * Uso: node bump.cjs
 * Detecta la versión actual en sw.js y la incrementa en todos los archivos.
 */
const fs = require('fs');
const path = require('path');

// 1. Detectar versión actual desde sw.js
const swContent = fs.readFileSync('sw.js', 'utf8');
const match = swContent.match(/const VERSION = 'v(\d+)'/);
if (!match) { console.error('❌ No se encontró VERSION en sw.js'); process.exit(1); }

const currentNum = parseInt(match[1], 10);
const nextNum    = currentNum + 1;
const oldVer     = `v${currentNum}`;
const newVer     = `v${nextNum}`;

console.log(`\n🔄 Bumping ${oldVer} → ${newVer}\n`);

// Archivos JS y HTML
const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html') && !f.startsWith('stitch_'));
const jsFiles = [
  'sw.js',
  'js/auth.js',
  'js/config.js',
  'js/supabase-client.js',
  'js/utils.js',
  'js/i18n.js',
  'js/ui.js',
  'js/db.js',
  'js/localdb.js',
  'js/notas.js',
  'js/dashboard.js',
  'js/sync-manager.js',
  'js/notifications.js',
  'js/sw-register.js',
  'js/restaurant-menu.js',
  'js/menu-data.js',
  'js/pwa-install.js',
  'js/core/firebase.js',
  'js/core/push.js'
];

const ALL_FILES = [...new Set([...htmlFiles, ...jsFiles])];

ALL_FILES.forEach(file => {
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, 'utf8');
  let after = before.replaceAll(oldVer, newVer);
  after = after.replace(/\?v=\d+/g, `?v=${nextNum}`);
  after = after.replace(/data-app-version="\d+"/g, `data-app-version="${nextNum}"`);
  after = after.replace(/CURRENT_VERSION = '\d+'/g, `CURRENT_VERSION = '${nextNum}'`);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log(`  ✅ ${file}`);
  }
});

// version.json
fs.writeFileSync('version.json', JSON.stringify({ version: String(nextNum), build: newVer }, null, 2) + '\n', 'utf8');
console.log(`  ✅ version.json → build: ${newVer}`);
console.log(`\n✅ Sincronización completa a ${newVer}\n`);
