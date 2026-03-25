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
    
    // Ensure scanner modules have ?v= in ocr.html
    if (file === 'ocr.html') {
        content = content.replace(/js\/scanner\/documentDetection\.js(?!(\?v=))/g, 'js/scanner/documentDetection.js?v=350');
        content = content.replace(/js\/scanner\/perspectiveCorrection\.js(?!(\?v=))/g, 'js/scanner/perspectiveCorrection.js?v=350');
        content = content.replace(/js\/scanner\/imageEnhancer\.js(?!(\?v=))/g, 'js/scanner/imageEnhancer.js?v=350');
        content = content.replace(/js\/scanner\/cameraController\.js(?!(\?v=))/g, 'js/scanner/cameraController.js?v=350');
    }

    // Core versioning - replace all versions with 351
    content = content.replace(/\?v=\d+/g, '?v=351');
    content = content.replace(/CurrentVersion = '\d+'/gi, "CurrentVersion = '351'");
    content = content.replace(/CURRENT_VERSION = '\d+'/g, "CURRENT_VERSION = '351'");
    content = content.replace(/data-app-version="\d+"/g, 'data-app-version="351"');
    
    // Cache and Build naming
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, "CACHE_NAME = 'recipepantry-v351'");
    content = content.replace(/CACHE_NAME: 'recipepantry-v\d+'/g, "CACHE_NAME: 'recipepantry-v351'");
    
    // Config adjustments
    content = content.replace(/APP_VERSION: '\d+'/g, "APP_VERSION: '351'");
    content = content.replace(/APP_VERSION_ID = '\d+'/g, "APP_VERSION_ID = '351'");
    content = content.replace(/Configuración v\d+ inicializada/g, "Configuración v351 inicializada");
    content = content.replace(/Recipe Pantry Dashboard init - v\d+/g, "Recipe Pantry Dashboard init - v351");

    // Package.json specific
    if (file === 'package.json') {
        content = content.replace(/"version": "\d+"/, '"version": "351"');
    }

    if (file === 'index.html' || file === 'ocr.html') {
        content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v351_opencv_scanner';");
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} forcefully bumped to v351!`);
});
