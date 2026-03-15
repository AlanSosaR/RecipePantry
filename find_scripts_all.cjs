const fs = require('fs');

const files = ['index.html', 'profile.html', 'recipe-detail.html', 'recipe-form.html', 'login.html'];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  const matches = {};
  lines.forEach((line, index) => {
    const match = line.match(/src="js\/([^"?]+)/);
    if (match) {
      const script = match[1];
      if (!matches[script]) matches[script] = [];
      matches[script].push(index + 1);
    }
  });

  for (const [script, lineNumbers] of Object.entries(matches)) {
    if (lineNumbers.length > 1) {
      console.log(`[DUPLICATE] In ${file}: '${script}' loaded on lines ${lineNumbers.join(', ')}`);
    }
  }
});
