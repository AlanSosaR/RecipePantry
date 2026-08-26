const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.cjs': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Normalize path
    let filePath = path.join(ROOT, pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    // Check if path is a directory or exact root
    try {
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                const indexPath = path.join(filePath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    filePath = indexPath;
                }
            }
        } else {
            // Clean URLs: check if appending .html matches a file
            const htmlPath = filePath + '.html';
            if (fs.existsSync(htmlPath)) {
                filePath = htmlPath;
            }
        }
    } catch (e) {}

    // Fallback: If still not found, check if it's an API route or fallback to index.html
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (pathname.startsWith('/api/')) {
            const apiPath = path.join(ROOT, pathname + (pathname.endsWith('.js') ? '' : '.js'));
            if (fs.existsSync(apiPath)) {
                try {
                    // Try dynamic import/require for API route
                    const handlerModule = await import('file://' + apiPath.replace(/\\/g, '/'));
                    const handler = handlerModule.default || handlerModule;
                    if (typeof handler === 'function') {
                        return handler(req, res);
                    }
                } catch (apiErr) {
                    console.error('API Error:', apiErr);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: apiErr.message }));
                    return;
                }
            }
        }

        // SPA rewrite fallback if no extension
        if (!path.extname(pathname)) {
            filePath = path.join(ROOT, 'index.html');
        }
    }

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Not Found</h1><p>No se encontró: ' + pathname + '</p>');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Disable caching in development
    res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
});

server.listen(PORT, HOST, () => {
    console.log(`\n========================================`);
    console.log(`  🚀 Servidor RecipePantry listo`);
    console.log(`  👉 Local:   http://localhost:${PORT}`);
    console.log(`  👉 Red:     http://192.168.1.141:${PORT}`);
    console.log(`========================================\n`);
});
