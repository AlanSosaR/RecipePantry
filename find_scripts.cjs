const fs = require('fs');

const content = fs.readFileSync('ocr.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('config.js') || line.includes('ocr.js') || line.includes('ocr-processor.js')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
