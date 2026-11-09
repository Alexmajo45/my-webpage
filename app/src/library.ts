// The Library: things you saved or liked elsewhere (starting with Instagram) turned into a searchable,
// triageable backlog. Source of truth is Instagram's own "Download your information" JSON export -
// no scraping, no session cookies, no risk to the account.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { InputError, all, get, now, type DB } from './db.ts';
import { like } from './life.ts';

export interface LibraryItem {
  id: number; source: string; kind: string; url: string; author: string | null; collection: string | null;
  saved_at: string | null; note: string | null; topics: string[]; status: string;
}
export const LIBRARY_STATUSES = ['new', 'keep', 'actioned', 'archived'] as const;

interface Extracted { url: string; author: string | null; collection: string | null; savedAt: string | null; kind: 'saved' | 'liked' }

/** Meta exports write UTF-8 bytes as Latin-1 code points ("Ã¨" for "è"). Undo that when it round-trips cleanly. */
export function fixMojibake(s: string): string {
  if (!/[Â-ô][\u0080-¿]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  const decoded = Buffer.from(s, 'latin1').toString('utf8');
  return decoded.includes('�') ? s : decoded;
}

export function normaliseInstagramUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!/^(www\.)?instagram\.com$/i.test(u.hostname)) return null;
    const path = u.pathname.replace(/\/+$/, '');
    if (!path) return null;
    return `https://www.instagram.com${path}/`;
  } catch { return null; }
}

interface Leaf { href?: unknown; value?: unknown; timestamp?: unknown }
function leaves(node: unknown, out: Leaf[] = []): Leaf[] {
  if (Array.isArray(node)) for (const n of node) leaves(n, out);
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if ('href' in o || 'timestamp' in o) out.push(o);
    for (const v of Object.values(o)) if (v && typeof v === 'object') leaves(v, out);
  }
  return out;
}

/**
 * Tolerant reader for Instagram export JSON (saved_posts, saved_collections, liked_posts).
 * Meta has changed the layout more than once, so rather than hard-code one shape we look for arrays of
 * entries, and within each entry for an instagram.com link, a timestamp and an author.
 */
export function extractInstagram(json: unknown, fallbackKind: 'saved' | 'liked' = 'saved'): Extracted[] {
  const out: Extracted[] = [];
  const lists: { key: string; entries: unknown[] }[] = [];
  if (Array.isArray(json)) lists.push({ key: '', entries: json });
  else if (json && typeof json === 'object')
    for (const [key, v] of Object.entries(json as Record<string, unknown>)) if (Array.isArray(v)) lists.push({ key, entries: v });
  for (const { key, entries } of lists) {
    const kind = /like/i.test(key) ? 'liked' : /sav/i.test(key) ? 'saved' : fallbackKind;
    let collection: string | null = null;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const found = leaves(e);
      const linkLeaf = found.find((l) => normaliseInstagramUrl(l.href));
      const title = typeof e.title === 'string' ? fixMojibake(e.title).trim() : '';
      if (!linkLeaf) {
        // In saved_collections a header entry (title "Collection") names the collection for the rows after it.
        const name = found.find((l) => typeof l.value === 'string' && l.value && !l.href)?.value
          ?? (e.string_map_data as Record<string, Leaf> | undefined)?.Name?.value;
        if (/collection/i.test(title) && typeof name === 'string') collection = fixMojibake(name).trim().slice(0, 80) || null;
        continue;
      }
      const stamps = found.map((l) => Number(l.timestamp)).filter((t) => Number.isFinite(t) && t > 0);
      const leafValue = typeof linkLeaf.value === 'string' ? fixMojibake(linkLeaf.value).trim() : '';
      // An author is a handle; reaction emoji and labels in `value` are not.
      const author = [title, leafValue].find((s) => /^[A-Za-z0-9._]{2,30}$/.test(s)) ?? null;
      out.push({
        url: normaliseInstagramUrl(linkLeaf.href)!, author, collection, kind,
        savedAt: stamps.length ? new Date(Math.max(...stamps) * 1000).toISOString() : null,
      });
    }
  }
  return out;
}

const TOPIC_RULES: [string, RegExp][] = [
  ['food', /recipe|ricett|food|cucina|cook|chef|restaurant|ristorant|pasta|wine|vino/i],
  ['fitness', /fit|gym|workout|allenament|run|yoga|mobility|pilates/i],
  ['travel', /travel|viagg|trip|hotel|itinerar|hike|weekend/i],
  ['money', /invest|financ|etf|stock|money|risparm|budget|tax/i],
  ['work', /leader|career|productiv|business|startup|consult|neuro|learning/i],
  ['design', /design|interior|architect|typograph|brand/i],
  ['tech', /\bai\b|tech|code|software|prompt|automation/i],
  ['style', /outfit|fashion|style|moda/i],
  ['home', /home|casa|garden|diy|plants/i],
  ['books', /book|libr[oi]|reading/i],
];
export function suggestTopics(item: { author?: string | null; collection?: string | null; note?: string | null }): string[] {
  const text = [item.collection, item.author, item.note].filter(Boolean).join(' ');
  const topics = TOPIC_RULES.filter(([, re]) => re.test(text)).map(([t]) => t);
  if (item.collection) topics.unshift(item.collection.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''));
  return [...new Set(topics.filter(Boolean))].slice(0, 6);
}

export function importInstagram(db: DB, json: unknown, fallbackKind: 'saved' | 'liked' = 'saved'): { found: number; added: number; updated: number } {
  const items = extractInstagram(json, fallbackKind);
  let added = 0, updated = 0;
  for (const it of items) {
    const existing = get<{ id: number; kind: string; collection: string | null }>(db, "SELECT id, kind, collection FROM library WHERE source = 'instagram' AND url = ?", it.url);
    if (!existing) {
      db.prepare("INSERT INTO library (source, kind, url, author, collection, saved_at, topics, created_at) VALUES ('instagram',?,?,?,?,?,?,?)")
        .run(it.kind, it.url, it.author, it.collection, it.savedAt, JSON.stringify(suggestTopics(it)), now());
      added++;
    } else {
      // A deliberate save outranks a like, and a collection name is worth keeping. User edits are never overwritten.
      const kind = existing.kind === 'saved' || it.kind === 'saved' ? 'saved' : 'liked';
      const collection = existing.collection ?? it.collection;
      if (kind !== existing.kind || collection !== existing.collection) {
        db.prepare('UPDATE library SET kind = ?, collection = ? WHERE id = ?').run(kind, collection, existing.id);
        updated++;
      }
    }
  }
  return { found: items.length, added, updated };
}

/** Imports every saved/liked JSON file found under an unzipped Instagram export directory (or a single file). */
export function importInstagramPath(db: DB, path: string): { files: string[]; found: number; added: number; updated: number } {
  const files: string[] = [];
  const walk = (p: string, depth: number) => {
    const st = statSync(p);
    if (st.isDirectory()) { if (depth < 8) for (const f of readdirSync(p)) walk(join(p, f), depth + 1); }
    else if (depth === 0 || /^(saved_|liked_).*\.json$/i.test(p.split(/[\\/]/).pop()!)) files.push(p);
  };
  walk(path, 0);
  const total = { files, found: 0, added: 0, updated: 0 };
  for (const f of files) {
    const r = importInstagram(db, JSON.parse(readFileSync(f, 'utf8')), /liked/i.test(f) ? 'liked' : 'saved');
    total.found += r.found; total.added += r.added; total.updated += r.updated;
  }
  return total;
}

function row(r: Omit<LibraryItem, 'topics'> & { topics: string }): LibraryItem {
  return { ...r, topics: JSON.parse(r.topics) as string[] };
}
const COLS = 'id, source, kind, url, author, collection, saved_at, note, topics, status';

export function listLibrary(db: DB, opts: { query?: string; status?: string; topic?: string; limit?: number } = {}): LibraryItem[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.status) { where.push('status = ?'); params.push(opts.status); }
  else where.push("status != 'archived'");
  if (opts.topic) { where.push("topics LIKE ? ESCAPE '\\'"); params.push(like(`"${opts.topic}"`)); }
  if (opts.query?.trim()) {
    const q = like(opts.query.trim());
    where.push("(author LIKE ? ESCAPE '\\' OR collection LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR topics LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')");
    params.push(q, q, q, q, q);
  }
  return all<Omit<LibraryItem, 'topics'> & { topics: string }>(db,
    `SELECT ${COLS} FROM library WHERE ${where.join(' AND ')} ORDER BY COALESCE(saved_at, created_at) DESC LIMIT ?`,
    ...params, Math.min(opts.limit ?? 30, 200)).map(row);
}

export function updateLibraryItem(db: DB, id: number, patch: { status?: unknown; note?: unknown; topics?: unknown }): LibraryItem {
  const cur = get<Omit<LibraryItem, 'topics'> & { topics: string }>(db, `SELECT ${COLS} FROM library WHERE id = ?`, id);
  if (!cur) throw new InputError(`No library item with id ${id}`);
  const status = patch.status === undefined ? cur.status : String(patch.status);
  if (!(LIBRARY_STATUSES as readonly string[]).includes(status)) throw new InputError(`status must be one of ${LIBRARY_STATUSES.join(', ')}`);
  const note = patch.note === undefined ? cur.note : String(patch.note).slice(0, 2000) || null;
  let topics = cur.topics;
  if (patch.topics !== undefined) {
    if (!Array.isArray(patch.topics)) throw new InputError('topics must be an array of strings');
    topics = JSON.stringify([...new Set(patch.topics.map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 10));
  }
  db.prepare('UPDATE library SET status = ?, note = ?, topics = ? WHERE id = ?').run(status, note, topics, id);
  return row({ ...cur, status, note, topics });
}

export function librarySummary(db: DB) {
  const byStatus = Object.fromEntries(all<{ status: string; n: number }>(db, 'SELECT status, COUNT(*) AS n FROM library GROUP BY status').map((r) => [r.status, r.n]));
  const topics = new Map<string, number>();
  for (const r of all<{ topics: string }>(db, "SELECT topics FROM library WHERE status != 'archived'"))
    for (const t of JSON.parse(r.topics) as string[]) topics.set(t, (topics.get(t) ?? 0) + 1);
  return {
    total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus,
    topics: [...topics].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([topic, count]) => ({ topic, count })),
  };
}

/** Oldest untriaged saves first: the point of the weekly review is to stop the pile growing unseen. */
export function resurface(db: DB, n = 5): LibraryItem[] {
  return all<Omit<LibraryItem, 'topics'> & { topics: string }>(db,
    `SELECT ${COLS} FROM library WHERE status = 'new' ORDER BY kind = 'saved' DESC, COALESCE(saved_at, created_at) ASC LIMIT ?`, n).map(row);
}
