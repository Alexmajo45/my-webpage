// The daily brief. Facts are assembled deterministically from the database; a model may only rephrase them.
// verifyNumbers() is the runtime "goldfish": a check with no memory and no context beyond the brief and its
// source data, which rejects any figure the data does not support.
import { addDays, localParts, type Config } from './config.ts';
import { all, get, now, run, type DB } from './db.ts';
import { resurface, librarySummary, type LibraryItem } from './library.ts';
import { habitViews, listTasks, memories, type HabitView, type Task } from './life.ts';
import { listNews, type NewsItem } from './news.ts';
import { portfolioView, type PortfolioView } from './portfolio.ts';

export interface BriefData {
  day: string; weekdayName: string; owner: string;
  tasks: { overdue: Task[]; today: Task[]; upcoming: Task[]; openCount: number };
  habits: HabitView[];
  portfolio: PortfolioView;
  news: { relevant: NewsItem[]; other: NewsItem[] };
  library: { untriaged: number; resurfaced: LibraryItem[] };
  goals: string[];
}

export function briefData(db: DB, cfg: Config, at = new Date()): BriefData {
  const { day } = localParts(cfg.timezone, at);
  const open = listTasks(db, 'open');
  const relevant = listNews(db, { relevantOnly: true, limit: 5 });
  const seen = new Set(relevant.map((n) => n.id));
  return {
    day, owner: cfg.owner,
    weekdayName: new Intl.DateTimeFormat('en-GB', { timeZone: cfg.timezone, weekday: 'long' }).format(at),
    tasks: {
      overdue: open.filter((t) => t.due && t.due < day),
      today: open.filter((t) => t.due === day),
      upcoming: open.filter((t) => t.due && t.due > day && t.due <= addDays(day, 7)),
      openCount: open.length,
    },
    habits: habitViews(db, day),
    portfolio: portfolioView(db, cfg),
    news: { relevant, other: listNews(db, { limit: 8 }).filter((n) => !seen.has(n.id)).slice(0, 4) },
    library: { untriaged: librarySummary(db).byStatus.new ?? 0, resurfaced: resurface(db, 3) },
    goals: memories(db).filter((m) => m.kind === 'goal').slice(0, 5).map((m) => m.text),
  };
}

export const fmtMoney = (n: number, ccy: string) =>
  `${n < 0 ? '−' : ''}${new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(Math.abs(n))}`;
export const fmtPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;

export function renderBrief(d: BriefData, kind: 'morning' | 'weekly' = 'morning'): string {
  const L: string[] = [`# ${kind === 'weekly' ? 'Weekly review' : 'Morning brief'} — ${d.weekdayName} ${d.day}`, ''];
  const p = d.portfolio;
  L.push('## Money');
  if (!p.holdings.length) L.push('No holdings yet. Add some to start tracking.');
  else {
    const change = p.dayChangePct === null ? '' : `, ${fmtPct(p.dayChangePct)} on the day (${fmtMoney(p.dayChange, p.baseCurrency)})`;
    L.push(`Portfolio stands at ${fmtMoney(p.totalValue, p.baseCurrency)}${change}. Prices as of ${p.asOf ?? 'n/a'}.`);
    const movers = p.holdings.filter((h) => h.dayChangePct !== null).sort((a, b) => Math.abs(b.dayChangePct!) - Math.abs(a.dayChangePct!)).slice(0, 3);
    for (const h of movers) L.push(`- ${h.name} (${h.symbol}): ${fmtPct(h.dayChangePct!)}`);
    for (const w of p.warnings) L.push(`- Note: ${w}`);
  }
  L.push('', '## News that touches your holdings');
  if (!d.news.relevant.length) L.push('Nothing tagged to your holdings since the last refresh.');
  for (const n of d.news.relevant) L.push(`- ${n.title} [${n.tags.join(', ')}] — ${n.feed}`);
  if (d.news.other.length) { L.push('', '## Also in the news'); for (const n of d.news.other) L.push(`- ${n.title} — ${n.feed}`); }
  L.push('', '## Today');
  const t = d.tasks;
  if (!t.overdue.length && !t.today.length) L.push(`Nothing due today. ${t.openCount} open task${t.openCount === 1 ? '' : 's'} in total.`);
  for (const x of t.overdue) L.push(`- Overdue since ${x.due}: ${x.title}`);
  for (const x of t.today) L.push(`- Due today: ${x.title}`);
  if (kind === 'weekly') for (const x of t.upcoming) L.push(`- Due ${x.due}: ${x.title}`);
  if (d.habits.length) {
    L.push('', '## Habits');
    for (const h of d.habits) L.push(`- ${h.name}: ${h.days.filter((x) => x.done).length}/${h.days.length} in the last week, streak ${h.streak}`);
  }
  if (d.library.untriaged) {
    L.push('', '## From your saved posts', `${d.library.untriaged} saved or liked item${d.library.untriaged === 1 ? '' : 's'} not yet triaged. Oldest first:`);
    for (const i of d.library.resurfaced) L.push(`- ${i.author ? `@${i.author}` : 'Post'}${i.collection ? ` (${i.collection})` : ''}: ${i.url}`);
  }
  if (d.goals.length) { L.push('', '## Goals you asked me to keep in view'); for (const g of d.goals) L.push(`- ${g}`); }
  return L.join('\n');
}

/** Every percentage and currency amount the data supports, in each rounding a writer might reasonably use. */
export function allowedNumbers(d: BriefData): Set<string> {
  const out = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return;
    for (const dp of [0, 1, 2]) out.add(Math.abs(n).toFixed(dp));
  };
  const p = d.portfolio;
  [p.totalValue, p.dayChange, p.dayChangePct, p.totalPnl].forEach(add);
  for (const h of p.holdings) [h.price, h.dayChangePct, h.valueBase, h.dayChangeBase, h.pnlBase, h.pnlPct, h.quantity].forEach(add);
  for (const a of p.allocation) { add(a.value); add(a.pct); }
  return out;
}

/** Returns the financial figures in `text` that the data does not support. Empty means the text is clean. */
export function verifyNumbers(text: string, d: BriefData): string[] {
  const allowed = allowedNumbers(d);
  const bad: string[] = [];
  const re = /(?:[€$£]\s?)?[+\-−]?\d[\d,. ]*\d(?:\s?%|\s?(?:EUR|USD|GBP|CHF))?|(?:[€$£]\s?)?[+\-−]?\d(?:\s?%|\s?(?:EUR|USD|GBP|CHF))/g;
  for (const m of text.matchAll(re)) {
    const token = m[0];
    if (!/[€$£%]|EUR|USD|GBP|CHF/.test(token)) continue; // dates, counts and times are not financial claims
    const digits = token.replace(/[^\d.,]/g, '').replace(/[.,]$/, '');
    // Accept either convention (1,234.5 and 1.234,5), but only at the precision the writer actually used:
    // "42.4%" must match a figure that rounds to 42.4, not merely one that rounds to 42.
    const readings = [digits.replace(/,/g, ''), digits.replace(/\./g, '').replace(',', '.')];
    const ok = readings.some((r) => {
      const n = Number(r);
      const dp = Math.min(2, r.split('.')[1]?.length ?? 0);
      return Number.isFinite(n) && allowed.has(n.toFixed(dp));
    });
    if (!ok) bad.push(token.trim());
  }
  return bad;
}

export type Composer = (data: BriefData, draft: string, kind: 'morning' | 'weekly') => Promise<string>;

export async function generateBrief(db: DB, cfg: Config, kind: 'morning' | 'weekly', compose?: Composer): Promise<{ id: number; body: string; generator: string; note: string }> {
  const data = briefData(db, cfg);
  const template = renderBrief(data, kind);
  let body = template, generator = 'template', note = 'deterministic template';
  if (compose) {
    try {
      const written = await compose(data, template, kind);
      const unsupported = verifyNumbers(written, data);
      if (!written.trim()) note = 'model returned nothing; used template';
      else if (unsupported.length) note = `model draft rejected: unsupported figures ${unsupported.slice(0, 5).join(', ')}; used template`;
      else { body = written; generator = 'model'; note = 'model draft, figures verified against data'; }
    } catch (e) { note = `model unavailable (${(e as Error).message}); used template`; }
  }
  const id = run(db, 'INSERT INTO briefs (day, kind, body, generator, created_at) VALUES (?,?,?,?,?)', data.day, kind, body, generator, now());
  return { id, body, generator, note };
}

export function latestBrief(db: DB) {
  return get<{ id: number; day: string; kind: string; body: string; generator: string; created_at: string }>(db, 'SELECT * FROM briefs ORDER BY id DESC LIMIT 1');
}
export function briefHistory(db: DB, limit = 14) {
  return all<{ id: number; day: string; kind: string; generator: string }>(db, 'SELECT id, day, kind, generator FROM briefs ORDER BY id DESC LIMIT ?', limit);
}
