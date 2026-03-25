const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = [
    'index.html', 
    'login.html', 
    'ocr.html', 
    'profile.html', 
    'recipe-detail.html', 
    'recipe-form.html', 
    'recovery.html', 
    'reset-password.html',
    'sw.js', 
    'js/sw-register.js',
    'js/config.js', 
    'js/dashboard.js', 
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
    
    // Core versioning - replace all versions with 357
    content = content.replace(/\?v=\d+/g, '?v=357');
    content = content.replace(/CurrentVersion = '\d+'/gi, "CurrentVersion = '357'");
    content = content.replace(/CURRENT_VERSION = '\d+'/g, "CURRENT_VERSION = '357'");
    content = content.replace(/data-app-version="\d+"/g, 'data-app-version="357"');
    
    // Cache and Build naming
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, "CACHE_NAME = 'recipepantry-v357'");
    content = content.replace(/CACHE_NAME: 'recipepantry-v\d+'/g, "CACHE_NAME: 'recipepantry-v357'");
    
    // Config adjustments
    content = content.replace(/APP_VERSION: '\d+'/g, "APP_VERSION: '357'");
    content = content.replace(/APP_VERSION_ID = '\d+'/g, "APP_VERSION_ID = '357'");
    content = content.replace(/Configuración v\d+ inicializada/g, "Configuración v357 inicializada");
    content = content.replace(/Recipe Pantry Dashboard init - v\d+/g, "Recipe Pantry Dashboard init - v357");

    // Package.json specific
    if (file === 'package.json') {
        content = content.replace(/"version": "\d+"/, '"version": "357"');
    }

    if (file === 'index.html' || file === 'ocr.html') {
        // FORCE the nuke key to run so PWA completely restarts
        content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v357_portrait_camera';");
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} forcefully bumped to v357!`);
});
