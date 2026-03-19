const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'login.html', 'registro.html', 'sw.js', 'js/config.js', 'js/dashboard.js', 'ocr.html', 'manifest.webmanifest'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    
    // Standard replacements
    content = content.replace(/\?v=\d+/g, '?v=319');
    content = content.replace(/CurrentVersion = '\d+'/gi, "CurrentVersion = '319'");
    content = content.replace(/CURRENT_VERSION = '\d+'/g, "CURRENT_VERSION = '319'");
    content = content.replace(/data-app-version="\d+"/g, 'data-app-version="319"');
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, "CACHE_NAME = 'recipepantry-v319'");

    // Config adjustments
    content = content.replace(/APP_VERSION: '\d+'/g, "APP_VERSION: '319'");
    content = content.replace(/BUILD_ID: '\d{4}-\d{2}-\d{2}-v\d+'/g, `BUILD_ID: '${new Date().toISOString().split('T')[0]}-v319'`);
    content = content.replace(/Configuración v\d+ inicializada/g, "Configuración v319 inicializada");
    content = content.replace(/Configuración Global Recipe Pantry \(v\d+\)/g, "Configuración Global Recipe Pantry (v319)");

    if (file === 'index.html') {
        content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v319_url_import_pwa_share_v2';");
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} forcefully bumped to v319!`);
});
