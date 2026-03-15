const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\js\\dashboard.js';
let content = fs.readFileSync(filePath, 'utf8');

// We can append a small code snippet right inside updateActionBar() triggers 
// to force set style property on selection-bar-content for desktop
const targetIf = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'flex', 'important');\r\n                moreBtn.classList.remove('hidden');\r\n            }`;
const targetIfFallback = `const moreBtn = document.getElementById('selectionMoreBtn');\n            if (moreBtn) {\n                moreBtn.style.setProperty('display', 'flex', 'important');\n                moreBtn.classList.remove('hidden');\n            }`;

const replacementIf = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'flex', 'important');\r\n                moreBtn.classList.remove('hidden');\r\n            }\r\n            // Force PC overlap alignment leftwards securely\r\n            const barContent = document.querySelector('.selection-bar-content');\r\n            const barLeft = document.querySelector('.selection-bar-left');\r\n            if (barContent && barLeft && window.innerWidth > 800) {\r\n                barLeft.style.setProperty('flex', 'none', 'important');\r\n                barContent.style.setProperty('justify-content', 'flex-start', 'important');\r\n                barContent.style.setProperty('gap', '16px', 'important');\r\n            }`;

if (content.includes(targetIf)) {
    content = content.replace(targetIf, replacementIf);
} else if (content.includes(targetIfFallback)) {
    content = content.replace(targetIfFallback, replacementIf.replace(/\r\n/g, '\n'));
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Force style script appended to dashboard.js!');
const verify = fs.readFileSync(filePath, 'utf8');
console.log('Updated contains force PC overlap alignment? ', verify.includes('force PC overlap alignment leftwards'));
