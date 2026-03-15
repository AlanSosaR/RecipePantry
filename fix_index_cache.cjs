const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\index.html';
let content = fs.readFileSync(filePath, 'utf8');

// replace ?v=266 with ?v=273 everywhere in index.html
content = content.replace(/\?v=266/g, '?v=273');

// Also update the Emergency Clear variables inside <head> just in case!
content = content.replace(/const CURRENT_VERSION = '266';/, `const CURRENT_VERSION = '273';`);
content = content.replace(/const NUKE_KEY = 'v266_green_ocr_fix';/, `const NUKE_KEY = 'v273_cleanup_fixes';`);
content = content.replace(/data-app-version="266"/, `data-app-version="273"`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('index.html version triggers updated to v273!');
