const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\js\\dashboard.js';
let content = fs.readFileSync(filePath, 'utf8');

// Inside updateActionBar() -> if size > 0
const targetIf = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) moreBtn.classList.remove('hidden');`;
const targetIfFallback = `const moreBtn = document.getElementById('selectionMoreBtn');\n            if (moreBtn) moreBtn.classList.remove('hidden');`;

const replacementIf = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'flex', 'important');\r\n                moreBtn.classList.remove('hidden');\r\n            }`;

if (content.includes(targetIf)) {
    content = content.replace(targetIf, replacementIf);
} else if (content.includes(targetIfFallback)) {
    content = content.replace(targetIfFallback, replacementIf.replace(/\r\n/g, '\n'));
} 

// Inside updateActionBar() -> else (size === 0)
const targetElse = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) moreBtn.classList.add('hidden'); // Only show if selection > 0`;
const targetElseFallback = `const moreBtn = document.getElementById('selectionMoreBtn');\n            if (moreBtn) moreBtn.classList.add('hidden'); // Only show if selection > 0`;

const replacementElse = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'none', 'important');\r\n                moreBtn.classList.add('hidden');\r\n            }`;

if (content.includes(targetElse)) {
    content = content.replace(targetElse, replacementElse);
} else if (content.includes(targetElseFallback)) {
    content = content.replace(targetElseFallback, replacementElse.replace(/\r\n/g, '\n'));
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Force display property added to dashboard.js!');
const verify = fs.readFileSync(filePath, 'utf8');
console.log('Updated contains setProperty none? ', verify.includes('style.setProperty(\'display\', \'none\', \'important\')'));
