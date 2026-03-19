const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'login.html', 'registro.html', 'sw.js', 'js/config.js', 'js/dashboard.js', 'ocr.html', 'manifest.webmanifest'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/\?v=\d+/g, '?v=320');
    content = content.replace(/CurrentVersion = '\d+'/gi, "CurrentVersion = '320'");
    content = content.replace(/CURRENT_VERSION = '\d+'/g, "CURRENT_VERSION = '320'");
    content = content.replace(/data-app-version="\d+"/g, 'data-app-version="320"');
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, "CACHE_NAME = 'recipepantry-v320'");

    // Config adjustments
    content = content.replace(/APP_VERSION: '\d+'/g, "APP_VERSION: '320'");
    content = content.replace(/Configuración v\d+ inicializada/g, "Configuración v320 inicializada");

    if (file === 'index.html') {
        content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v320_ocr_ui_fix';");
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} forcefully bumped to v320!`);
});
