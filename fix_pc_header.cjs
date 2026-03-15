const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\alans\\Documents\\Repocitorio_recetas\\RecipePantry\\css\\components.css';
let content = fs.readFileSync(filePath, 'utf8');

// Target de la definición del Grid
const targetGrid = `.file-row-m3,
.list-header-m3 {
    display: grid !important;
    grid-template-columns: 48px 48px 1fr 140px 100px 120px 60px !important;`;

const replacementGrid = `.file-row-m3,
.list-header-m3 {
    display: grid !important;
    grid-template-columns: 48px 1fr 120px 180px 48px 48px !important;`;

// Target de los estilos de Fuente
const targetHeader = `.list-header-m3 {
    background: transparent !important;
    font-weight: 700 !important;
    font-size: 11px !important;
    letter-spacing: 0.08em !important;
    text-transform: uppercase !important;
    color: var(--on-surface-variant) !important;`;

const replacementHeader = `.list-header-m3 {
    background: transparent !important;
    font-weight: 800 !important; /* Más negrita */
    font-size: 11px !important;
    letter-spacing: 0.08em !important;
    text-transform: uppercase !important;
    color: #1a1a1a !important; /* Más oscuro/negro */`;

if (content.includes(targetGrid)) {
    content = content.replace(targetGrid, replacementGrid);
} else {
    // Fallback regex
    content = content.replace(/(\.file-row-m3,\s*\.list-header-m3\s*\{\s*display:\s*grid\s*!important;\s*grid-template-columns:\s*)[^;]+(!important;)/, replacementGrid);
}

if (content.includes(targetHeader)) {
    content = content.replace(targetHeader, replacementHeader);
} else {
    // Fallback regex
    content = content.replace(/(\.list-header-m3\s*\{\s*background:\s*transparent\s*!important;\s*font-weight:\s*[^;]+;\s*font-size:\s*[^;]+;\s*letter-spacing:\s*[^;]+;\s*text-transform:\s*[^;]+;\s*color:\s*)[^;]+(!important;)/, replacementHeader);
}

// Ensure "Última Modificación" respects single line
if (!content.includes('.list-header-m3 .col-date { white-space: nowrap !important; }')) {
    content += `\n/* Fix forced single line for date header on PC */\n.list-header-m3 .col-date {\n    white-space: nowrap !important;\n}\n`;
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Grid and font styles updated in components.css!');
