const fs = require('fs');
const path = require('path');

const VERSION = '505';
const V_TAG = 'v505';

// 1. Update config.js
const configPath = path.join(__dirname, 'js', 'config.js');
if (fs.existsSync(configPath)) {
    let content = fs.readFileSync(configPath, 'utf8');
    content = content.replace(/BUILD_ID:\s*'[^']+'/g, `BUILD_ID: '${V_TAG}'`);
    content = content.replace(/APP_VERSION:\s*'[^']+'/g, `APP_VERSION: '${V_TAG}'`);
    content = content.replace(/v\d+/g, V_TAG);
    fs.writeFileSync(configPath, content, 'utf8');
    console.log('✅ Updated js/config.js');
}

// 2. Update sw.js
const swPath = path.join(__dirname, 'sw.js');
if (fs.existsSync(swPath)) {
    let content = fs.readFileSync(swPath, 'utf8');
    content = content.replace(/const VERSION = '[^']+';/g, `const VERSION = '${V_TAG}';`);
    content = content.replace(/const BUILD_ID = '[^']+';/g, `const BUILD_ID = '${V_TAG}';`);
    content = content.replace(/const CACHE_NAME = `[^`]+`;/g, `const CACHE_NAME = \`recipe-pantry-${V_TAG}\`;`);
    content = content.replace(/const STATIC_CACHE = '[^']+';/g, `const STATIC_CACHE = 'static-${V_TAG}';`);
    content = content.replace(/const DATA_CACHE = '[^']+';/g, `const DATA_CACHE = 'data-${V_TAG}';`);
    fs.writeFileSync(swPath, content, 'utf8');
    console.log('✅ Updated sw.js');
}

// 3. Update HTML files
const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
htmlFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace data-app-version
    content = content.replace(/data-app-version="[^"]+"/g, `data-app-version="${VERSION}"`);
    // Replace CURRENT_VERSION
    content = content.replace(/const CURRENT_VERSION = '[^']+';/g, `const CURRENT_VERSION = '${VERSION}';`);
    // Replace NUKE_KEY
    content = content.replace(/const NUKE_KEY = '[^']+';/g, `const NUKE_KEY = 'v${VERSION}_fresh_sync';`);
    // Replace query params ?v=...
    content = content.replace(/\?v=[a-zA-Z0-9_.-]+/g, `?v=${VERSION}`);
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Updated ${file}`);
});

// 4. Update version.json
const verJsonPath = path.join(__dirname, 'version.json');
fs.writeFileSync(verJsonPath, JSON.stringify({ version: VERSION, build: V_TAG }, null, 2), 'utf8');
console.log('✅ Updated version.json');

console.log(`\n🎉 All files bumped to version ${VERSION} (${V_TAG})`);
