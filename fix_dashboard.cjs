const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\js\\dashboard.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `// Keep Select All group visible on mobile so it's always available in the fixed header area\r\n            if (countGroup) countGroup.classList.remove('hidden');`;
const targetFallback = `// Keep Select All group visible on mobile so it's always available in the fixed header area\n            if (countGroup) countGroup.classList.remove('hidden');`;

const replacement = `// Hide the group completely when no items are selected (user request)\r\n            if (countGroup) countGroup.classList.add('hidden');`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
} else if (content.includes(targetFallback)) {
    content = content.replace(targetFallback, replacement.replace(/\r\n/g, '\n'));
} else {
    console.log('Target not found precisely, searching with regex');
    content = content.replace(/\/\/ Keep Select All[^\n]+\n\s+if\s*\(countGroup\)\s*countGroup\.classList\.remove\('hidden'\);/, `// Hide the group completely when no items are selected\n            if (countGroup) countGroup.classList.add('hidden');`);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Update finished for dashboard.js!');
const verify = fs.readFileSync(filePath, 'utf8');
console.log('Updated contains add("hidden")? ', verify.includes('countGroup.classList.add(\'hidden\')'));
