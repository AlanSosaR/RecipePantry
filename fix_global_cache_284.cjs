const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'ocr.html', 'profile.html', 'login.html'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    content = content.replace(/\?v=283/g, '?v=284');
    content = content.replace(/CURRENT_VERSION = '283'/g, "CURRENT_VERSION = '284'");
    content = content.replace(/data-app-version="283"/g, 'data-app-version="284"');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} updated to v284!`);
});
