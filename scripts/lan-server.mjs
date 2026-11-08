import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachLanSignaling, handleLanInfo, lanAddresses, LAN_INFO_PATH } from './lan-signaling.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const keyPath = process.env.LAN_HTTPS_KEY;
const certPath = process.env.LAN_HTTPS_CERT;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const handler = (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === LAN_INFO_PATH) {
    handleLanInfo(request, response);
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  let filename = path.resolve(root, `.${pathname}`);
  if (!filename.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  if (!existsSync(filename) || statSync(filename).isDirectory()) {
    if (path.extname(pathname)) {
      response.writeHead(404).end();
      return;
    }
    filename = path.join(root, 'index.html');
  }

  response.setHeader('Content-Type', mime[path.extname(filename)] ?? 'application/octet-stream');
  response.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  createReadStream(filename).pipe(response);
};

const server = keyPath && certPath
  ? createHttpsServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, handler)
  : createHttpServer(handler);
attachLanSignaling(server);
server.listen(port, '0.0.0.0', () => {
  const protocol = keyPath && certPath ? 'https' : 'http';
  console.log(`DevToolbox LAN server: ${protocol}://localhost:${port}`);
  for (const address of lanAddresses()) console.log(`  ${protocol}://${address}:${port}`);
  if (protocol === 'http') console.log('Note: phone cameras generally require HTTPS; set LAN_HTTPS_KEY and LAN_HTTPS_CERT or use an HTTPS reverse proxy.');
});
