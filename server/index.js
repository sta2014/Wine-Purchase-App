import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EngineDatabase } from './database.js';
import { RefreshService } from './refresh.js';
import { applyAction } from '../src/engine/actions.js';
import { sourceStatus } from '../src/engine/sources.js';
import { credentialAvailable } from './adapters.js';

export function createEngineServer({ database = new EngineDatabase(process.env.WINE_DB_FILE || '.local/wine-engine.sqlite'), token = process.env.ENGINE_ACCESS_TOKEN || '', origins = (process.env.WINE_ALLOWED_ORIGINS || '').split(',').filter(Boolean), refresh = new RefreshService(database), staticDir = 'dist' } = {}) {
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const host = req.headers.host || '';
    const sameOrigin = origin && (() => { try { return new URL(origin).host === host; } catch { return false; } })();
    const localOrigin = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const allowedOrigin = !origin || sameOrigin || origins.includes(origin) || (!token && localOrigin);
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    try {
      if (!allowedOrigin) return send(403, { error: 'Origin not allowed.' });
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.writeHead(204); return res.end(); }
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') return send(405, { error: 'Method not allowed.' });
        const root = resolve(staticDir), path = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
        if (path !== root && !path.startsWith(root + sep)) return send(403, { error: 'Invalid path.' });
        try {
          const data = await readFile(path);
          const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' }[extname(path)] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); return res.end(data);
        } catch { return send(404, { error: 'File not found. Build the frontend first.' }); }
      }
      if (!token && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return send(403, { error: 'Local API requires a loopback Host.' });
      if (token) {
        const supplied = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
        const a = Buffer.from(token), b = Buffer.from(supplied);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return send(401, { error: 'Engine authentication required.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return send(200, { ok: true, scheduler: true, persistent: true });
      if (req.method === 'GET' && url.pathname === '/api/engine') {
        const state = database.load();
        for (const source of state.sources) source.status = sourceStatus(source, credentialAvailable(source));
        return send(200, state);
      }
      if (req.method !== 'POST') return send(404, { error: 'API route not found.' });
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(415, { error: 'Use application/json.' });
      let bytes = 0; const chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 10 * 1024 * 1024) return send(413, { error: 'Request exceeds 10 MB.' }); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (url.pathname === '/api/refresh') return send(200, await refresh.run(body.force === true));
      if (url.pathname === '/api/action') {
        const current = database.load();
        if (body.expectedRevision !== current.revision) return send(409, { error: 'Engine changed in another session. Reload and try again.' });
        const state = applyAction(current, body.action);
        database.save(state);
        return send(200, state);
      }
      return send(404, { error: 'API route not found.' });
    } catch (error) { return send(400, { error: error.message }); }
  });
  return { server, database, refresh };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.WINE_API_HOST || '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.ENGINE_ACCESS_TOKEN) throw new Error('ENGINE_ACCESS_TOKEN is required before binding the engine to a public interface.');
  const app = createEngineServer();
  app.server.listen(Number(process.env.WINE_API_PORT || 5180), host, () => { console.log('Wine intelligence service started; SQLite persistence and scheduled refresh enabled.'); app.refresh.start(); app.refresh.run().catch(error => console.error('Initial refresh failed:', error.message)); });
  const shutdown = () => { app.refresh.stop(); app.server.close(() => { app.database.close(); process.exit(0); }); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
