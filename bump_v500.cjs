const fs = require('fs');
const files = ['sw.js','nota-form.html','notas.html','index.html','js/notas.js','js/auth.js'];
let total = 0;
files.forEach(file => {
  if (!fs.existsSync(file)) { console.log(`SKIP: ${file}`); return; }
  let c = fs.readFileSync(file, 'utf8');
  const b = c;
  // Reemplazamos cualquier versión anterior v49X por v500
  c = c.replace(/v49[0-9]/g, 'v500');
  if (c !== b) {
    fs.writeFileSync(file, c, 'utf8');
    const n = (b.match(/v49[0-9]/g)||[]).length;
    total += n;
    console.log(`✅ ${file} (${n} replacements)`);
  } else console.log(`── no changes: ${file}`);
});
console.log(`\nTotal: ${total}`);
