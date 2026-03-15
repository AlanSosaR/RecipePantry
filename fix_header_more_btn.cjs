const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\js\\dashboard.js';
let content = fs.readFileSync(filePath, 'utf8');

const targetIf = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'flex', 'important');\r\n                moreBtn.classList.remove('hidden');\r\n            }`;
const targetIfFallback = `const moreBtn = document.getElementById('selectionMoreBtn');\n            if (moreBtn) {\n                moreBtn.style.setProperty('display', 'flex', 'important');\n                moreBtn.classList.remove('hidden');\n            }`;

const replacementIf = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'flex', 'important');\r\n                moreBtn.classList.remove('hidden');\r\n            }\r\n            const moreBtnHeader = document.getElementById('selectionMoreBtnHeader');\r\n            if (moreBtnHeader) {\r\n                moreBtnHeader.style.setProperty('display', 'inline-flex', 'important');\r\n            }`;

if (content.includes(targetIf)) {
    content = content.replace(targetIf, replacementIf);
} else if (content.includes(targetIfFallback)) {
    content = content.replace(targetIfFallback, replacementIf.replace(/\r\n/g, '\n'));
}

const targetElse = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'none', 'important');\r\n                moreBtn.classList.add('hidden');\r\n            }`;
const targetElseFallback = `const moreBtn = document.getElementById('selectionMoreBtn');\n            if (moreBtn) {\n                moreBtn.style.setProperty('display', 'none', 'important');\n                moreBtn.classList.add('hidden');\n            }`;

const replacementElse = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'none', 'important');\r\n                moreBtn.classList.add('hidden');\r\n            }\r\n            const moreBtnHeader = document.getElementById('selectionMoreBtnHeader');\r\n            if (moreBtnHeader) {\r\n                moreBtnHeader.style.setProperty('display', 'none', 'important');\r\n            }`;

if (content.includes(targetElse)) {
    content = content.replace(targetElse, replacementElse);
} else if (content.includes(targetElseFallback)) {
    content = content.replace(targetElseFallback, replacementElse.replace(/\r\n/g, '\n'));
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('dashboard.js local options btn updated!');
const verify = fs.readFileSync(filePath, 'utf8');
console.log('Updated contains moreBtnHeader? ', verify.includes('document.getElementById(\'selectionMoreBtnHeader\')'));
