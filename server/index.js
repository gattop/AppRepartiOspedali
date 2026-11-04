import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, ENTITIES, ValidationError } from './db.js';
import { seed, updateSeededMaps, applyDataFixes } from './seed.js';
import { scheduleBackups } from './backup.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, '..', 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

// The app sits behind oauth2-proxy (reverse proxy mode, --pass-user-headers) and is never
// exposed directly, so these headers are trusted.
function userFrom(req, cfg) {
  const name = req.headers['x-forwarded-preferred-username'] || req.headers['x-forwarded-email'] || req.headers['x-forwarded-user'];
  if (!name) return cfg.devUser ? { name: cfg.devUser, groups: [] } : null;
  const groups = String(req.headers['x-forwarded-groups'] || '').split(',').map((g) => g.trim()).filter(Boolean);
  return { name: String(name), email: req.headers['x-forwarded-email'] || null, groups };
}

function canEdit(user, cfg) {
  if (!user) return false;
  if (!cfg.editorGroups.length) return true;
  return user.groups.some((g) => cfg.editorGroups.includes(g));
}

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, {
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(json ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new ValidationError('Richiesta troppo grande'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new ValidationError('JSON non valido'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname, cfg) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const headers = {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    if (rel === '/index.html') {
      headers['Content-Security-Policy'] = "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'";
      headers['Referrer-Policy'] = 'same-origin';
    }
    // The service worker carries the build version so each deploy refreshes the offline cache.
    if (rel === '/sw.js' || rel === '/index.html') {
      const body = fs.readFileSync(file, 'utf8').replaceAll('__APP_VERSION__', cfg.version);
      res.writeHead(200, headers);
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    const etag = `W/"${st.size}-${st.mtimeMs}"`;
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

export function createApp(cfg) {
  const store = openDb(path.join(cfg.dataDir, 'reparti.db'));
  if (store.isEmpty()) seed(store, { demo: cfg.seedDemo });
  else updateSeededMaps(store);
  applyDataFixes(store);

  async function api(req, res, pathname) {
    const user = userFrom(req, cfg);
    const parts = pathname.split('/').filter(Boolean).slice(1); // drop "api"

    if (req.method === 'GET' && parts[0] === 'me') {
      // groups and editorGroups are returned so a missing role can be diagnosed from the browser.
      return send(res, 200, {
        user: user && { name: user.name, email: user.email, groups: user.groups },
        canEdit: canEdit(user, cfg),
        editorGroups: cfg.editorGroups,
        version: cfg.version
      });
    }
    if (req.method === 'GET' && parts[0] === 'data') {
      return send(res, 200, store.all());
    }

    const [entity, id, action] = parts;
    if (!ENTITIES[entity]) return send(res, 404, { error: 'Risorsa sconosciuta' });
    if (!canEdit(user, cfg)) return send(res, 403, { error: 'Non hai i permessi per modificare i dati' });
    const who = user.name;

    if (req.method === 'POST' && !id) {
      return send(res, 201, store.insert(entity, await readJson(req), who));
    }
    if (req.method === 'POST' && entity === 'reparti' && id && action === 'verifica') {
      const row = store.verify(id, who);
      return row ? send(res, 200, row) : send(res, 404, { error: 'Non trovato' });
    }
    if (req.method === 'PUT' && id && !action) {
      const row = store.update(entity, id, await readJson(req), who);
      return row ? send(res, 200, row) : send(res, 404, { error: 'Non trovato' });
    }
    if (req.method === 'DELETE' && id && !action) {
      return store.remove(entity, id, who) ? send(res, 204, '') : send(res, 404, { error: 'Non trovato' });
    }
    return send(res, 405, { error: 'Metodo non consentito' });
  }

  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname === '/healthz') return send(res, 200, 'ok');
      if (pathname.startsWith('/api/')) return await api(req, res, pathname);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, pathname, cfg);
    } catch (e) {
      if (e instanceof ValidationError) return send(res, 400, { error: e.message });
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: 'Errore interno' });
    }
  });

  return { server, store };
}

export function configFromEnv(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    dataDir: env.DATA_DIR || path.join(ROOT, '..', 'data'),
    seedDemo: env.SEED_DEMO === 'true',
    devUser: env.DEV_USER || '',
    editorGroups: String(env.EDITOR_GROUPS || '').split(',').map((g) => g.trim()).filter(Boolean),
    version: env.APP_VERSION || 'dev',
    backupDir: env.BACKUP_DIR || '',
    backupsToKeep: Math.max(1, Number(env.BACKUPS_TO_KEEP || 3))
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = configFromEnv();
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const { server, store } = createApp(cfg);
  if (cfg.backupDir) scheduleBackups(store, cfg.backupDir, cfg.backupsToKeep);
  server.listen(cfg.port, () => console.log(`Reparti in ascolto su :${cfg.port} (versione ${cfg.version})`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
