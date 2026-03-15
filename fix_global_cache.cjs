const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry';
const files = ['index.html', 'ocr.html', 'profile.html'];

files.forEach(file => {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    content = content.replace(/\?v=266/g, '?v=273');
    content = content.replace(/CurrentVersion = '266'/gi, "CurrentVersion = '273'");
    content = content.replace(/CURRENT_VERSION = '266'/g, "CURRENT_VERSION = '273'");
    content = content.replace(/data-app-version="266"/g, 'data-app-version="273"');
    
    // Nuke key updates inside files holding emergency reset logic
    content = content.replace(/v266_green_ocr_fix/g, 'v273_cleanup_fixes');
    content = content.replace(/v266_ocr_green_ui/g, 'v273_cleanup_fixes_ocr');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`${file} updated successfully!`);
});
