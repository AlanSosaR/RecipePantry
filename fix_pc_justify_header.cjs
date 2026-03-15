const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\js\\dashboard.js';
let content = fs.readFileSync(filePath, 'utf8');

// Target the script added in step 673
const target = `// Force PC overlap alignment leftwards securely\r\n            const barContent = document.querySelector('.selection-bar-content');\r\n            const barLeft = document.querySelector('.selection-bar-left');\r\n            if (barContent && barLeft && window.innerWidth > 800) {\r\n                barLeft.style.setProperty('flex', 'none', 'important');\r\n                barContent.style.setProperty('justify-content', 'flex-start', 'important');\r\n                barContent.style.setProperty('gap', '16px', 'important');\r\n            }`;
const targetFallback = `// Force PC overlap alignment leftwards securely\n            const barContent = document.querySelector('.selection-bar-content');\n            const barLeft = document.querySelector('.selection-bar-left');\n            if (barContent && barLeft && window.innerWidth > 800) {\n                barLeft.style.setProperty('flex', 'none', 'important');\n                barContent.style.setProperty('justify-content', 'flex-start', 'important');\n                barContent.style.setProperty('gap', '16px', 'important');\n            }`;

const replacement = `// Force PC selection header alignment leftwards next to title\r\n            const dashHeader = document.querySelector('.dashboard-header');\r\n            if (dashHeader && window.innerWidth > 800) {\r\n                dashHeader.style.setProperty('justify-content', 'flex-start', 'important');\r\n                dashHeader.style.setProperty('gap', '24px', 'important');\r\n            }`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
} else if (content.includes(targetFallback)) {
    content = content.replace(targetFallback, replacement.replace(/\r\n/g, '\n'));
}


// AND restore it in the else block if size === 0!
const targetElse = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'none', 'important');\r\n                moreBtn.classList.add('hidden');\r\n            }`;
const targetElseFallback = `const moreBtn = document.getElementById('selectionMoreBtn');\n            if (moreBtn) {\n                moreBtn.style.setProperty('display', 'none', 'important');\n                moreBtn.classList.add('hidden');\n            }`;

const replacementElse = `const moreBtn = document.getElementById('selectionMoreBtn');\r\n            if (moreBtn) {\r\n                moreBtn.style.setProperty('display', 'none', 'important');\r\n                moreBtn.classList.add('hidden');\r\n            }\r\n            // Restore normal PC header alignment\r\n            const dashHeader = document.querySelector('.dashboard-header');\r\n            if (dashHeader && window.innerWidth > 800) {\r\n                dashHeader.style.setProperty('justify-content', 'space-between', 'important');\r\n                dashHeader.style.setProperty('gap', '8px', 'important');\r\n            }`;

if (content.includes(targetElse)) {
    content = content.replace(targetElse, replacementElse);
} else if (content.includes(targetElseFallback)) {
    content = content.replace(targetElseFallback, replacementElse.replace(/\r\n/g, '\n'));
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('PC Selection Dashboard Header position updated fully!');
const verify = fs.readFileSync(filePath, 'utf8');
console.log('Updated contains dashHeader style property? ', verify.includes('dashHeader.style.setProperty(\'justify-content\''));
