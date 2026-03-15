const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'ocr.html', 'profile.html'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Update from 273 (or 266 if any left) to 274
    content = content.replace(/\?v=273/g, '?v=274');
    content = content.replace(/\?v=266/g, '?v=274');
    content = content.replace(/CURRENT_VERSION = '273'/g, "CURRENT_VERSION = '274'");
    content = content.replace(/CurrentVersion = '273'/gi, "CurrentVersion = '274'");
    content = content.replace(/CURRENT_VERSION = '266'/g, "CURRENT_VERSION = '274'");
    content = content.replace(/data-app-version="273"/g, 'data-app-version="274"');
    content = content.replace(/data-app-version="266"/g, 'data-app-version="274"');
    
    // Nuke key for cache clear trigger
    content = content.replace(/v273_cleanup_fixes/g, 'v274_cleanup_fix_grid');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} updated to v274!`);
});
