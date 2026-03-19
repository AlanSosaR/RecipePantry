const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'login.html', 'registro.html', 'sw.js', 'js/config.js', 'js/dashboard.js', 'ocr.html', 'manifest.webmanifest', 'js/url-importer.js'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/\?v=\d+/g, '?v=325');
    content = content.replace(/CurrentVersion = '\d+'/gi, "CurrentVersion = '325'");
    content = content.replace(/CURRENT_VERSION = '\d+'/g, "CURRENT_VERSION = '325'");
    content = content.replace(/data-app-version="\d+"/g, 'data-app-version="325"');
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, "CACHE_NAME = 'recipepantry-v325'");

    // Config adjustments
    content = content.replace(/APP_VERSION: '\d+'/g, "APP_VERSION: '325'");
    content = content.replace(/Configuración v\d+ inicializada/g, "Configuración v325 inicializada");

    if (file === 'index.html') {
        content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v325_tab_color_fix';");
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} forcefully bumped to v325!`);
});
