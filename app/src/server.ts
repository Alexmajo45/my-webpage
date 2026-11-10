// HTTP server: static dashboard, JSON API, MCP endpoint. No framework - the surface is small enough to read in one sitting.
import { timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentConfigured, chat, composerFor, describeError, resetConversation, transcript } from './agent.ts';
import { briefHistory, latestBrief } from './brief.ts';
import { APP_ROOT, dataDir, loadConfig, localParts, type Config } from './config.ts';
import { InputError, openDb, type DB } from './db.ts';
import { JOBS, recentRuns, runJob, startScheduler, type JobCtx } from './jobs.ts';
import { importInstagram, librarySummary, listLibrary, updateLibraryItem } from './library.ts';
import { addHabit, addJournal, addTask, habitViews, listTasks, memories, recentJournal, setTaskDone, toggleHabit } from './life.ts';
import { handleMcp } from './mcp.ts';
import { listNews, retagNews } from './news.ts';
import { portfolioView, removeHolding, seedDemo, upsertHolding } from './portfolio.ts';

const WEB_ROOT = resolve(APP_ROOT, 'web');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
  const payload = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers,
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage, limit: number): Promise<any> {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Content-Type must be application/json');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'); }
  catch { throw new HttpError(400, 'Body is not valid JSON'); }
}

function tokenMatches(given: string | undefined, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const hostnameOf = (hostHeader: string) => hostHeader.replace(/:\d+$/, '').toLowerCase();

export function createApp(ctx: JobCtx, token = process.env.CORTEX_TOKEN): Server {
  const { db, cfg } = ctx;
  const id = (s: string | undefined) => { const n = Number(s); if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id'); return n; };
  const today = () => localParts(cfg.timezone).day;

  function authorised(req: IncomingMessage): boolean {
    if (!token) return true; // startup guarantees we are bound to loopback in this case
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const cookie = /(?:^|;\s*)cortex_token=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    return tokenMatches(bearer, token) || tokenMatches(cookie && decodeURIComponent(cookie), token);
  }

  function state() {
    return {
      owner: cfg.owner, mode: cfg.mode, today: today(), timezone: cfg.timezone,
      agent: { configured: agentConfigured(), model: cfg.agent.model },
      brief: latestBrief(db) ?? null, briefHistory: briefHistory(db),
      portfolio: portfolioView(db, cfg),
      news: listNews(db, { limit: 14 }),
      tasks: listTasks(db, 'open'), habits: habitViews(db, today()),
      journal: recentJournal(db, 3),
      library: { summary: librarySummary(db), items: listLibrary(db, { limit: 8 }) },
      memories: memories(db, undefined, 10),
      jobs: Object.entries(JOBS).map(([name, j]) => ({ name, description: j.description, schedule: cfg.jobs.find((c) => c.name === name) ?? null })),
      runs: recentRuns(db), chat: transcript(ctx),
    };
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams): Promise<void> {
    const m = req.method ?? 'GET';
    const seg = path.split('/').filter(Boolean).slice(1); // drop "api"
    const body = m === 'POST' ? await readJson(req, seg.join('/') === 'library/import' ? 30_000_000 : 1_000_000) : undefined;
    const route = `${m} ${seg.map((s) => (/^\d+$/.test(s) ? ':id' : s)).join('/')}`;
    switch (route) {
      case 'GET state': return send(res, 200, state());
      case 'POST tasks': return send(res, 201, addTask(db, body ?? {}));
      case 'POST tasks/:id/done': return send(res, 200, setTaskDone(db, id(seg[1]), body?.done !== false));
      case 'POST habits': return send(res, 201, { id: addHabit(db, body?.name) });
      case 'POST habits/:id/toggle': return send(res, 200, { done: toggleHabit(db, id(seg[1]), body?.day ?? today(), body?.done) });
      case 'POST journal': return send(res, 201, { id: addJournal(db, today(), body?.text, body?.mood) });
      case 'POST holdings': { const h = upsertHolding(db, body ?? {}); retagNews(db); await runJob(ctx, 'refresh-quotes'); return send(res, 201, h); }
      case 'DELETE holdings/:id': removeHolding(db, id(seg[1])); retagNews(db); return send(res, 204);
      case 'GET library': return send(res, 200, listLibrary(db, { query: query.get('q') ?? undefined, status: query.get('status') ?? undefined, topic: query.get('topic') ?? undefined, limit: Number(query.get('limit')) || 50 }));
      case 'POST library/import': return send(res, 200, importInstagram(db, body, query.get('kind') === 'liked' ? 'liked' : 'saved'));
      case 'POST library/:id': return send(res, 200, updateLibraryItem(db, id(seg[1]), body ?? {}));
      case 'POST inbox': {
        // Capture endpoint for phone shortcuts, n8n, a Telegram bridge: anything that can POST JSON.
        return send(res, 201, addTask(db, { title: body?.text, notes: body?.notes, area: body?.area, due: body?.due, source: String(body?.source ?? 'inbox').slice(0, 40) }));
      }
      case 'POST chat': {
        if (!agentConfigured()) throw new HttpError(503, 'The agent needs ANTHROPIC_API_KEY. Everything else works without it.');
        const text = typeof body?.message === 'string' ? body.message.trim() : '';
        if (!text) throw new HttpError(400, 'message is required');
        try { return send(res, 200, await chat(ctx, text.slice(0, 8000))); }
        catch (e) { throw new HttpError(502, describeError(e)); }
      }
      case 'POST chat/reset': return send(res, 200, { conversation: resetConversation(ctx) });
    }
    if (m === 'POST' && seg[0] === 'jobs' && seg[2] === 'run' && seg.length === 3) {
      if (!JOBS[seg[1]!]) throw new HttpError(404, `Unknown job "${seg[1]}"`);
      return send(res, 200, await runJob(ctx, seg[1]!));
    }
    throw new HttpError(404, 'Not found');
  }

  function serveStatic(res: ServerResponse, path: string): void {
    const file = resolve(WEB_ROOT, `.${path === '/' ? '/index.html' : path}`);
    if (!(file === WEB_ROOT || file.startsWith(WEB_ROOT + sep)) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    createReadStream(file).pipe(res);
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://local');
      const path = decodeURIComponent(url.pathname);
      const host = req.headers.host ?? '';
      // Without a token we only ever answer to loopback names, which defeats DNS rebinding.
      if (!token && !LOOPBACK.has(hostnameOf(host))) throw new HttpError(403, 'Forbidden host');
      // Browsers attach Origin to cross-site writes; a mismatch is a cross-site request.
      const origin = req.headers.origin;
      if (origin && req.method !== 'GET' && (() => { try { return new URL(origin).host !== host; } catch { return true; } })())
        throw new HttpError(403, 'Cross-origin request refused');

      if (token && req.method === 'GET' && path === '/' && url.searchParams.has('token')) {
        if (!tokenMatches(url.searchParams.get('token') ?? '', token)) throw new HttpError(401, 'Invalid token');
        const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        return send(res, 302, '', { location: '/', 'set-cookie': `cortex_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure}` });
      }
      if (!authorised(req)) throw new HttpError(401, 'Unauthorised. Open /?token=YOUR_TOKEN once in this browser, or send an Authorization: Bearer header.');

      if (path === '/mcp') {
        if (!cfg.mcp.enabled) throw new HttpError(404, 'MCP endpoint disabled');
        if (req.method !== 'POST') return send(res, 405, 'Method not allowed', { allow: 'POST' });
        const out = await handleMcp(ctx, await readJson(req, 1_000_000));
        return send(res, out.status, out.body);
      }
      if (path.startsWith('/api/')) return await api(req, res, path, url.searchParams);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(res, path);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof InputError) return send(res, 400, { error: e.message });
      console.error('[server]', e);
      return send(res, 500, { error: 'Internal error' });
    }
  });
}

export async function main(): Promise<void> {
  const cfg: Config = loadConfig();
  const token = process.env.CORTEX_TOKEN;
  if (!LOOPBACK.has(cfg.host) && !token) throw new Error(`Refusing to listen on ${cfg.host} without CORTEX_TOKEN. Set a token or bind to 127.0.0.1.`);
  if (token && token.length < 24) throw new Error('CORTEX_TOKEN must be at least 24 characters.');
  const db: DB = openDb(dataDir());
  const ctx: JobCtx = { db, cfg, compose: agentConfigured() ? composerFor(cfg.agent.model) : undefined };
  if (cfg.mode === 'demo') {
    seedDemo(db, localParts(cfg.timezone).day);
    if (!latestBrief(db)) await runJob(ctx, 'morning-brief');
  }
  startScheduler(ctx);
  createApp(ctx, token).listen(cfg.port, cfg.host, () => {
    console.log(`Cortex is running at http://${cfg.host}:${cfg.port}  (mode: ${cfg.mode}, agent: ${agentConfigured() ? cfg.agent.model : 'off - set ANTHROPIC_API_KEY'})`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error((e as Error).message); process.exit(1); });
}
