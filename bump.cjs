const fs = require('fs');
const path = require('path');

const filesToUpdate = [
    'sw.js',
    'js/sw-register.js',
    'index.html',
    'recipe-detail.html',
    'recipe-form.html',
    'login.html',
    'ocr.html'
];

filesToUpdate.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');

        // Replace versions
        content = content.replace(/recipehub-v55/g, 'recipehub-v56');
        content = content.replace(/APP_VERSION_ID = '55'/g, "APP_VERSION_ID = '56'");
        content = content.replace(/data-app-version="55"/g, 'data-app-version="56"');
        content = content.replace(/\?v=55/g, '?v=56');
        content = content.replace(/2026-03-07-v55/g, `2026-03-07-v56`);

        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
    }
});
