// News ingest and relevance tagging against the user's holdings.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_ROOT, type Config } from './config.ts';
import { all, now, type DB } from './db.ts';
import { like } from './life.ts';
import { listHoldings, type Holding } from './portfolio.ts';
import { fetchFeed, type FeedItem } from './providers/rss.ts';

export interface NewsItem { id: number; feed: string; title: string; url: string; summary: string | null; published_at: string | null; tags: string[] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns the symbols of holdings an item mentions. Tickers match case-sensitively; names and keywords do not. */
export function tagsFor(text: string, holdings: Pick<Holding, 'symbol' | 'name' | 'keywords'>[]): string[] {
  const tags: string[] = [];
  for (const h of holdings) {
    const ticker = h.symbol.split('.')[0]!;
    const words = [h.name, ...h.keywords.split(',')].map((w) => w.trim()).filter((w) => w.length >= 3);
    const hit = (ticker.length >= 3 && new RegExp(`(?<![A-Za-z0-9])${esc(ticker)}(?![A-Za-z0-9])`).test(text))
      || words.some((w) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, 'iu').test(text));
    if (hit) tags.push(h.symbol);
  }
  return tags;
}

export function saveNews(db: DB, feed: string, items: FeedItem[]): number {
  const holdings = listHoldings(db);
  const stmt = db.prepare('INSERT OR IGNORE INTO news (feed, title, url, summary, published_at, fetched_at, tags) VALUES (?,?,?,?,?,?,?)');
  let added = 0;
  for (const it of items) {
    const tags = tagsFor(`${it.title} ${it.summary}`, holdings);
    added += Number(stmt.run(feed, it.title, it.url, it.summary, it.publishedAt, now(), JSON.stringify(tags)).changes);
  }
  return added;
}

export function retagNews(db: DB): void {
  const holdings = listHoldings(db);
  const stmt = db.prepare('UPDATE news SET tags = ? WHERE id = ?');
  for (const n of all<{ id: number; title: string; summary: string | null }>(db, 'SELECT id, title, summary FROM news ORDER BY id DESC LIMIT 500'))
    stmt.run(JSON.stringify(tagsFor(`${n.title} ${n.summary ?? ''}`, holdings)), n.id);
}

export async function refreshNews(db: DB, cfg: Config): Promise<string> {
  if (cfg.mode === 'demo') {
    const sample = JSON.parse(readFileSync(resolve(APP_ROOT, 'config/sample-news.json'), 'utf8')) as FeedItem[];
    return `${saveNews(db, 'Sample feed', sample)} new items (sample data, demo mode)`;
  }
  if (!cfg.feeds.length) return 'no feeds configured';
  let added = 0;
  const errors: string[] = [];
  for (const feed of cfg.feeds) {
    try { added += saveNews(db, feed.name, await fetchFeed(feed.url)); }
    catch (e) { errors.push(`${feed.name}: ${(e as Error).message}`); }
  }
  if (errors.length === cfg.feeds.length) throw new Error(`all feeds failed: ${errors.join('; ')}`);
  return `${added} new items${errors.length ? `; failed: ${errors.join('; ')}` : ''}`;
}

export function listNews(db: DB, opts: { query?: string; relevantOnly?: boolean; limit?: number } = {}): NewsItem[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.query?.trim()) { where.push("(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')"); params.push(like(opts.query.trim()), like(opts.query.trim())); }
  if (opts.relevantOnly) where.push("tags != '[]'");
  const rows = all<Omit<NewsItem, 'tags'> & { tags: string }>(db,
    `SELECT id, feed, title, url, summary, published_at, tags FROM news ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT ?`, ...params, Math.min(opts.limit ?? 30, 100));
  return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) as string[] }));
}
