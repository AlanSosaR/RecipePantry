const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'login.html', 'registro.html', 'sw.js', 'js/config.js', 'js/dashboard.js', 'ocr.html'];

// We want to force version 294
files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Generic replacements for existing versions
    content = content.replace(/\?v=\d+/g, '?v=294');
    content = content.replace(/CurrentVersion = '\d+'/gi, "CurrentVersion = '294'");
    content = content.replace(/CURRENT_VERSION = '\d+'/g, "CURRENT_VERSION = '294'");
    content = content.replace(/data-app-version="\d+"/g, 'data-app-version="294"');
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, "CACHE_NAME = 'recipepantry-v294'");

    // Update Nuke Key in index.html to force a fresh wipe
    if (file === 'index.html') {
        content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v294_force_ocr_key_auto';");
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} forcefully bumped to v294!`);
});
