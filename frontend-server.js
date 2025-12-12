const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const FRONTEND_DIR = path.join(__dirname, 'frontend');

const server = http.createServer((req, res) => {
  // Default to index.html for root path
  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // Normalize the requested path (remove ../ etc)
  filePath = path.normalize('/' + filePath).substring(1);
  
  // Construct full path
  const fullPath = path.join(FRONTEND_DIR, filePath);

  // Security: prevent directory traversal - use resolve for absolute comparison
  const resolvedPath = path.resolve(fullPath);
  const resolvedDir = path.resolve(FRONTEND_DIR);
  
  if (!resolvedPath.startsWith(resolvedDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Try to serve the file
  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      // Return 404 for missing files
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - File Not Found</h1>');
      return;
    }

    // Set appropriate content type
    let contentType = 'text/html';
    if (resolvedPath.endsWith('.css')) contentType = 'text/css';
    if (resolvedPath.endsWith('.js')) contentType = 'application/javascript';
    if (resolvedPath.endsWith('.json')) contentType = 'application/json';
    if (resolvedPath.endsWith('.png')) contentType = 'image/png';
    if (resolvedPath.endsWith('.jpg')) contentType = 'image/jpeg';
    if (resolvedPath.endsWith('.gif')) contentType = 'image/gif';
    if (resolvedPath.endsWith('.svg')) contentType = 'image/svg+xml';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  // Frontend server started (logs suppressed)
});
