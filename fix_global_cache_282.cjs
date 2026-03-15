const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'ocr.html', 'profile.html', 'login.html'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    content = content.replace(/\?v=281/g, '?v=282');
    content = content.replace(/\?v=220/g, '?v=282'); // Handle old template in login.html
    content = content.replace(/CURRENT_VERSION = '281'/g, "CURRENT_VERSION = '282'");
    content = content.replace(/CURRENT_VERSION = '220'/g, "CURRENT_VERSION = '282'");
    content = content.replace(/data-app-version="281"/g, 'data-app-version="282"');
    content = content.replace(/data-app-version="220"/g, 'data-app-version="282"');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} updated to v282!`);
});
