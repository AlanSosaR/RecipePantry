const fs = require('fs');
const path = require('path');

const VERSION = '366';
const NUKE_KEY = 'v366_flat_ui_fix';
const dir = __dirname;
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
    'js/recipe-form.js',
    'css/styles.css',
    'css/components.css'
];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ Skip: ${file} (not found)`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    
    // Core versioning
    content = content.replace(/\?v=\d+/g, `?v=${VERSION}`);
    content = content.replace(/CurrentVersion = '\d+'/gi, `CurrentVersion = '${VERSION}'`);
    content = content.replace(/CURRENT_VERSION = '\d+'/gi, `CURRENT_VERSION = '${VERSION}'`);
    content = content.replace(/data-app-version="\d+"/g, `data-app-version="${VERSION}"`);
    
    // Cache and Build naming
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, `CACHE_NAME = 'recipepantry-v${VERSION}'`);
    content = content.replace(/CACHE_NAME: 'recipepantry-v\d+'/g, `CACHE_NAME: 'recipepantry-v${VERSION}'`);
    
    // Config adjustments
    content = content.replace(/APP_VERSION: '\d+'/g, `APP_VERSION: '${VERSION}'`);
    content = content.replace(/APP_VERSION_ID = '\d+'/g, `APP_VERSION_ID = '${VERSION}'`);
    content = content.replace(/Configuración v\d+ inicializada/g, `Configuración v${VERSION} inicializada`);
    content = content.replace(/Recipe Pantry Dashboard init - v\d+/g, `Recipe Pantry Dashboard init - v${VERSION}`);

    // Package.json specific
    if (file === 'package.json') {
        content = content.replace(/"version": "\d+"/, `"version": "${VERSION}"`);
    }

    // Nuke key enforcement (index and ocr)
    if (file === 'index.html' || file === 'ocr.html') {
        content = content.replace(/const NUKE_KEY = '[^']+';/g, `const NUKE_KEY = '${NUKE_KEY}';`);
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${file} bumped to v${VERSION}`);
});
