const fs = require('fs');

const files = [
  'sw.js',
  'js/config.js',
  'index.html',
  'profile.html',
  'ocr.html'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/253/g, '254');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
