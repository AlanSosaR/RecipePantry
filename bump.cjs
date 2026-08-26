/**
 * bump.cjs — Version bumper genérico para RecipePantry
 * Uso: node bump.cjs
 * Detecta la versión actual en sw.js y la incrementa en todos los archivos.
 */
const fs = require('fs');

const FILES = [
  'sw.js',
  'nota-form.html',
  'notas.html',
  'index.html',
  'profile.html',
  'recipe-detail.html',
  'recipe-form.html',
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
];

// 1. Detectar versión actual desde sw.js
const swContent = fs.readFileSync('sw.js', 'utf8');
const match = swContent.match(/const VERSION = 'v(\d+)'/);
if (!match) { console.error('❌ No se encontró VERSION en sw.js'); process.exit(1); }

const currentNum = parseInt(match[1], 10);
const nextNum    = currentNum + 1;
const oldVer     = `v${currentNum}`;
const newVer     = `v${nextNum}`;

console.log(`\n🔄 Bumping ${oldVer} → ${newVer}\n`);

// 2. Reemplazar en todos los archivos
let total = 0;
FILES.forEach(file => {
  if (!fs.existsSync(file)) { console.log(`  SKIP (no existe): ${file}`); return; }
  const before = fs.readFileSync(file, 'utf8');
  const after  = before.replaceAll(oldVer, newVer);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    const n = (before.match(new RegExp(oldVer, 'g')) || []).length;
    total += n;
    console.log(`  ✅ ${file}  (${n} reemplazos)`);
  } else {
    console.log(`  ── sin cambios: ${file}`);
  }
});

console.log(`\n✅ Total reemplazos: ${total}`);
console.log(`   Nueva versión: ${newVer}`);
console.log(`\n💡 Recuerda hacer git commit + push para que el SW descargue los nuevos assets.\n`);
