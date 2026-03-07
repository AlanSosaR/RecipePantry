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
        content = content.replace(/recipehub-v53/g, 'recipehub-v54');
        content = content.replace(/v53_test_notification/g, 'v54_privacy_fix');
        content = content.replace(/APP_VERSION_ID = '53'/g, "APP_VERSION_ID = '54'");
        content = content.replace(/data-app-version="53"/g, 'data-app-version="54"');
        content = content.replace(/\?v=53/g, '?v=54');
        content = content.replace(/2026-03-07-v53/g, '2026-03-07-v54');

        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
    }
});
