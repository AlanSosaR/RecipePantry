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
    
    // Core versioning - replace all versions with 350
    content = content.replace(/\?v=\d+/g, '?v=350');
    content = content.replace(/CurrentVersion = '\d+'/gi, "CurrentVersion = '350'");
    content = content.replace(/CURRENT_VERSION = '\d+'/g, "CURRENT_VERSION = '350'");
    content = content.replace(/data-app-version="\d+"/g, 'data-app-version="350"');
    
    // Cache and Build naming
    content = content.replace(/CACHE_NAME = 'recipepantry-v\d+'/g, "CACHE_NAME = 'recipepantry-v350'");
    content = content.replace(/CACHE_NAME: 'recipepantry-v\d+'/g, "CACHE_NAME: 'recipepantry-v350'");
    
    // Config adjustments
    content = content.replace(/APP_VERSION: '\d+'/g, "APP_VERSION: '350'");
    content = content.replace(/APP_VERSION_ID = '\d+'/g, "APP_VERSION_ID = '350'");
    content = content.replace(/Configuración v\d+ inicializada/g, "Configuración v350 inicializada");
    content = content.replace(/Recipe Pantry Dashboard init - v\d+/g, "Recipe Pantry Dashboard init - v350");

    // Package.json specific
    if (file === 'package.json') {
        content = content.replace(/"version": "\d+"/, '"version": "350"');
    }

    if (file === 'index.html') {
        content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v350_url_fix';");
    }

    // Add Nuke to recipe-form.html and recipe-detail.html if not present
    if (file === 'recipe-form.html' || file === 'recipe-detail.html') {
         if (!content.includes('const NUKE_KEY')) {
             // Add it at the beginning of <head> or right after <head>
             const nukeScript = `  <!-- CONSOLE CLEANER & EMERGENCY SW CACHE CLEAR -->
  <script>
    (function() {
      const CURRENT_VERSION = '350';
      const NUKE_KEY = 'v350_url_fix';

      (async () => {
        const storedVersion = localStorage.getItem('recipe_app_version_' + window.location.pathname);
        const storedNuke = localStorage.getItem(NUKE_KEY);

        if (storedVersion !== CURRENT_VERSION || !storedNuke) {
          console.log(\`[System] Forcing update to \${CURRENT_VERSION}...\`);
          
          localStorage.setItem('recipe_app_version_' + window.location.pathname, CURRENT_VERSION);
          localStorage.setItem(NUKE_KEY, 'true');

          try {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const r of regs) await r.unregister();
            }
            if (window.caches) {
                const cacheNames = await caches.keys();
                for (const name of cacheNames) await caches.delete(name);
            }
          } catch(e) {}
          
          window.location.reload(true);
        }
      })();
    })();
  </script>
`;
              content = content.replace(/<head>/i, '<head>\n' + nukeScript);
         } else {
              // Update existing nuke key if any
              content = content.replace(/const CURRENT_VERSION = '\d+';/g, "const CURRENT_VERSION = '350';");
              content = content.replace(/const NUKE_KEY = '[^']+';/g, "const NUKE_KEY = 'v350_url_fix';");
         }
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} forcefully bumped to v350!`);
});
