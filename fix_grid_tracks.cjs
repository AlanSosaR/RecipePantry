const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\css\\components.css';
let content = fs.readFileSync(filePath, 'utf8');

const target = `grid-template-columns: 48px 1fr 120px 180px 48px 48px !important;`;
const replacement = `grid-template-columns: 48px 48px 1fr 120px 180px 48px !important;`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Grid tracks fixed in components.css!');
} else {
    console.log('Target track string not found! Falling back to regex');
    content = content.replace(/grid-template-columns:\s*48px\s*1fr\s*120px\s*180px\s*48px\s*48px\s*!important;/, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Regex replace finished!');
}
