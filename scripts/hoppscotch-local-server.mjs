import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
const root = fileURLToPath(new URL("../.cache/hoppscotch/", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};
createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/__local/status") {
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end('{"localOnly":true}');
    return;
  }
  if (/^\/(backend|admin)(\/|$)/.test(url.pathname)) {
    res.writeHead(404).end();
    return;
  }
  let path;
  try {
    path = resolve(root, "." + decodeURIComponent(url.pathname));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (!path.startsWith(resolve(root) + sep) && path !== resolve(root)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(path) || !statSync(path).isFile())
    path = resolve(root, "index.html");
  res.writeHead(200, {
    "Content-Type": types[extname(path)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(readFileSync(path));
}).listen(3173, "127.0.0.1", () =>
  console.log("Local API client: http://127.0.0.1:3173"),
);
