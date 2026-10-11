'use strict';

/**
 * frontend/server.js
 *
 * Dedicated Frontend Web Server.
 * Runs independently on port 5173 (or $PORT).
 *
 * Architecture:
 *   Frontend UI  → http://localhost:5173  (serves map, styles, JS assets)
 *   Backend API  → http://localhost:3000  (ingests & serves GPS locations from PostgreSQL)
 *   PostgreSQL   → localhost:5432        (database)
 *
 * Zero external dependencies: uses Node.js standard library (http, fs, path).
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT ?? '5173', 10);
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js':   'application/javascript; charset=UTF-8',
  '.css':  'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  // Normalize requested URL path
  let safePath = path.normalize(decodeURI(req.url.split('?')[0])).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Security: Prevent directory traversal outside frontend
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🛵  Rider Live Location Map UI`);
  console.log(`======================================================`);
  console.log(`  Frontend running at: http://localhost:${PORT}`);
  console.log(`  Backend API target:  http://localhost:3000`);
  console.log(`======================================================\n`);
});

process.on('SIGINT', () => {
  console.log('\n[frontend] Shutting down frontend server...');
  server.close(() => process.exit(0));
});
