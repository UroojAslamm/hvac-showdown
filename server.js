// Local server: serves /public and /api/game exactly like Vercel does. No dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import handler from './api/game.js';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
};

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/game') {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
      handler(req, res);
    });
    return;
  }
  let f = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
  if (!path.extname(f)) f += '.html';
  const fp = path.join(PUB, path.normalize(f));
  if (!fp.startsWith(PUB)) { res.statusCode = 403; return res.end(); }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache'); // always revalidate, so edits show up on reload
    res.end(buf);
  });
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  HVAC Showdown running\n  Main screen:  http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Phones (same Wi-Fi):  http://${ip}:${PORT}/play?p=1   and   ?p=2`);
  console.log('');
});
