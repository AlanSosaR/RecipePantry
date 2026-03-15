const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'ocr.html', 'profile.html'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    content = content.replace(/\?v=274/g, '?v=275');
    content = content.replace(/CURRENT_VERSION = '274'/g, "CURRENT_VERSION = '275'");
    content = content.replace(/data-app-version="274"/g, 'data-app-version="275"');
    
    // Nuke key
    content = content.replace(/v274_cleanup_fix_grid/g, 'v275_cleanup_bar_grid');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} updated to v275!`);
});
