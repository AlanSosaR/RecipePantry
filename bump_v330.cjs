const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'login.html', 'registro.html', 'sw.js', 'js/config.js', 'js/dashboard.js', 'ocr.html', 'manifest.webmanifest', 'js/url-importer.js', 'js/ocr.js'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/\?v=\d+/g, '?v=330');
    content = content.replace(/CurrentVersion = '\d+'/gi, "CurrentVersion = '330'");
    content = content.replace(/CURRENT_VERSION = '\d+'/g, "CURRENT_VERSION = '330'");
    content = content.replace(/data-app-version="\d+"/g, 'data-app-version="330"');
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, "CACHE_NAME = 'recipepantry-v330'");

    // Config adjustments
    content = content.replace(/APP_VERSION: '\d+'/g, "APP_VERSION: '330'");
    content = content.replace(/Configuración v\d+ inicializada/g, "Configuración v330 inicializada");

    if (file === 'index.html') {
        content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v330_unified_ocr_ui';");
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} forcefully bumped to v330!`);
});
