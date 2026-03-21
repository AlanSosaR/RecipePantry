const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = [
    'index.html', 
    'login.html', 
    'sw.js', 
    'js/config.js', 
    'js/dashboard.js', 
    'ocr.html', 
    'package.json',
    'js/url-importer.js', 
    'js/ocr.js',
    'js/ocr-processor.js',
    'manifest.webmanifest',
    'js/recipe-form.js'
];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    
    // Core versioning - replace all versions with 349
    content = content.replace(/\?v=\d+/g, '?v=349');
    content = content.replace(/CurrentVersion = '\d+'/gi, "CurrentVersion = '349'");
    content = content.replace(/CURRENT_VERSION = '\d+'/g, "CURRENT_VERSION = '349'");
    content = content.replace(/data-app-version="\d+"/g, 'data-app-version="349"');
    
    // Cache and Build naming
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, "CACHE_NAME = 'recipepantry-v349'");
    content = content.replace(/CACHE_NAME: 'recipepantry-v\d+'/g, "CACHE_NAME: 'recipepantry-v349'");
    
    // Config adjustments
    content = content.replace(/APP_VERSION: '\d+'/g, "APP_VERSION: '349'");
    content = content.replace(/Configuración v\d+ inicializada/g, "Configuración v349 inicializada");
    content = content.replace(/Recipe Pantry Dashboard init - v\d+/g, "Recipe Pantry Dashboard init - v349");

    // Package.json specific
    if (file === 'package.json') {
        content = content.replace(/"version": "\d+"/, '"version": "349"');
    }

    if (file === 'index.html') {
        content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v349_url_fix';");
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} forcefully bumped to v349!`);
});
