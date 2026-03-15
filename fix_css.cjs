const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\css\\components.css';
let content = fs.readFileSync(filePath, 'utf8');

const target = `#selectionMoreBtn, \r\n.m3-checkbox-wrapper {`;
const targetFallback = `#selectionMoreBtn, \n.m3-checkbox-wrapper {`;

const replacement = `#selectionMoreBtn {\r\n    display: inline-flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    margin: 0 !important;\r\n    padding: 0 !important;\r\n    min-width: 40px !important;\r\n    min-height: 40px !important;\r\n}\r\n\r\n.m3-checkbox-wrapper {`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
} else if (content.includes(targetFallback)) {
    content = content.replace(targetFallback, replacement.replace(/\r\n/g, '\n'));
} else {
    console.log('Target not found precisely, searching with regex');
    content = content.replace(/#selectionMoreBtn,\s*\.m3-checkbox-wrapper\s*\{/, `#selectionMoreBtn {\n    display: inline-flex;\n    align-items: center;\n    justify-content: center;\n    margin: 0 !important;\n    padding: 0 !important;\n    min-width: 40px !important;\n    min-height: 40px !important;\n}\n\n.m3-checkbox-wrapper {`);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Update finished!');
