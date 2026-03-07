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
        content = content.replace(/recipehub-v54/g, 'recipehub-v55');
        content = content.replace(/v54_privacy_fix/g, 'v55_offline_sync');
        content = content.replace(/APP_VERSION_ID = '54'/g, "APP_VERSION_ID = '55'");
        content = content.replace(/data-app-version="54"/g, 'data-app-version="55"');
        content = content.replace(/\?v=54/g, '?v=55');
        content = content.replace(/2026-03-07-v54/g, `2026-03-07-v55`);

        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
    }
});
