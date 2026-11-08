/** Shared by the development and production server; never accepts arbitrary target URLs. */
export const HOPPSCOTCH_STATUS_PATH = '/__hoppscotch/status';
export async function handleHoppscotchStatus(request, response) {
  if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }).end(); return; }
  const base = process.env.HOPPSCOTCH_URL || 'http://127.0.0.1:3173';
  let ready = false;
  try {
    const app = await fetch(`${base}/__local/status`, { signal: AbortSignal.timeout(2500) });
    ready = app.ok && (await app.json()).localOnly === true;
  } catch { /* A stopped or initializing local stack is an expected status. */ }
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ ready, url: base }));
}
export function hoppscotchStatusPlugin() {
  const configure = (server) => { server.middlewares.use(HOPPSCOTCH_STATUS_PATH, handleHoppscotchStatus); };
  return { name: 'hoppscotch-status', configureServer: configure, configurePreviewServer: configure };
}
