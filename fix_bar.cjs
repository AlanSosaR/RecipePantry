const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\css\\components.css';
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `@media (max-width: 800px) {\r\n    .selection-action-bar {\r\n        height: 48px;\r\n        /* Match list header height */\r\n    }\r\n}`;
const targetStrFallback = `@media (max-width: 800px) {\n    .selection-action-bar {\n        height: 48px;\n        /* Match list header height */\n    }\n}`;

const insertStr = `\r\n\r\n.selection-action-bar:not(.hidden) {\r\n    transform: translateY(0);\r\n    opacity: 1;\r\n}\r\n\r\n.selection-bar-content {\r\n    display: flex;\r\n    align-items: center;\r\n    width: 100%;\r\n}\r\n\r\n@media (min-width: 801px) {\r\n    .selection-bar-left {\r\n        flex: none !important;\r\n    }\r\n    .selection-bar-content {\r\n        justify-content: flex-start !important;\r\n        gap: 16px !important;\r\n    }\r\n}`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, targetStr + insertStr);
} else if (content.includes(targetStrFallback)) {
    content = content.replace(targetStrFallback, targetStrFallback + insertStr.replace(/\r\n/g, '\n'));
} else {
    console.log('Target string fallback regex lookup triggered');
    content = content.replace(/(@media\s*\(max-width:\s*800px\)\s*\{\s*\.selection-action-bar\s*\{\s*height:\s*48px;[^}]+\}\s*\})/, `$1` + insertStr.replace(/\r\n/g, '\n'));
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Selection bar content restored and updated in components.css!');
const verify = fs.readFileSync(filePath, 'utf8');
console.log('Updated contains selection-bar-left? ', verify.includes('.selection-bar-left {'));
