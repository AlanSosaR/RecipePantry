const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'login.html', 'registro.html', 'sw.js', 'js/config.js', 'js/dashboard.js'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    content = content.replace(/\?v=290/g, '?v=291');
    content = content.replace(/CurrentVersion = '290'/gi, "CurrentVersion = '291'");
    content = content.replace(/CURRENT_VERSION = '290'/g, "CURRENT_VERSION = '291'");
    content = content.replace(/data-app-version="290"/g, 'data-app-version="291"');
    content = content.replace(/const CACHE_NAME = 'recipepantry-v290'/g, "const CACHE_NAME = 'recipepantry-v291'");

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} updated successfully to v291!`);
});
