import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { briefData, generateBrief, renderBrief, verifyNumbers } from '../src/brief.ts';
import { addDays, DEFAULT_CONFIG, localParts } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import { dueJobs, runJob } from '../src/jobs.ts';
import { extractInstagram, fixMojibake, importInstagram, importInstagramPath, listLibrary, normaliseInstagramUrl, resurface, updateLibraryItem } from '../src/library.ts';
import { addHabit, addTask, habitViews, memories, remember, toggleHabit } from '../src/life.ts';
import { handleMcp } from '../src/mcp.ts';
import { listNews, saveNews, tagsFor } from '../src/news.ts';
import { portfolioView, refreshQuotes, savePrices, seedDemo, upsertHolding } from '../src/portfolio.ts';
import { demoSeries, parseStooqCsv } from '../src/providers/quotes.ts';
import { parseFeed } from '../src/providers/rss.ts';
import { callTool, validateInput, TOOLS } from '../src/tools.ts';

const cfg = structuredClone(DEFAULT_CONFIG);
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const fresh = () => ({ db: openDb(':memory:'), cfg });

test('dates: local parts and day arithmetic', () => {
  const p = localParts('Europe/Rome', new Date('2026-11-09T23:30:00Z'));
  assert.deepEqual(p, { day: '2026-11-10', hhmm: '00:30', weekday: 2 });
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('portfolio: valuation converts to base currency and reports day change', () => {
  const { db } = fresh();
  upsertHolding(db, { symbol: 'AAA', name: 'Alpha', quantity: 10, costBasis: 90, currency: 'EUR', assetClass: 'equity' });
  upsertHolding(db, { symbol: 'BBB.US', name: 'Beta', quantity: 5, costBasis: 100, currency: 'USD', assetClass: 'etf' });
  savePrices(db, [
    { symbol: 'AAA', day: '2026-11-06', close: 100 }, { symbol: 'AAA', day: '2026-11-09', close: 110 },
    { symbol: 'BBB.US', day: '2026-11-06', close: 200 }, { symbol: 'BBB.US', day: '2026-11-09', close: 220 },
    { symbol: 'EURUSD', day: '2026-11-09', close: 1.1 },
  ], 'test');
  const p = portfolioView(db, cfg);
  assert.equal(p.totalValue, 1100 + 1000);          // 10*110 + (5*220)/1.1
  assert.ok(Math.abs(p.dayChange - (100 + 100 / 1.1)) < 1e-9);
  assert.equal(p.holdings.find((h) => h.symbol === 'AAA')!.dayChangePct, 10);
  assert.deepEqual(p.allocation.map((a) => a.assetClass), ['equity', 'etf']);
  assert.equal(p.asOf, '2026-11-09');
  assert.deepEqual(p.warnings, []);
});

test('portfolio: a holding without an FX rate is excluded and flagged, not silently mis-valued', () => {
  const { db } = fresh();
  upsertHolding(db, { symbol: 'CCC', name: 'Gamma', quantity: 1, currency: 'CHF' });
  savePrices(db, [{ symbol: 'CCC', day: '2026-11-09', close: 50 }], 'test');
  const p = portfolioView(db, cfg);
  assert.equal(p.totalValue, 0);
  assert.match(p.warnings[0]!, /EUR\/CHF/);
});

test('portfolio: input validation', () => {
  const { db } = fresh();
  assert.throws(() => upsertHolding(db, { symbol: 'bad symbol!', currency: 'EUR' }), /ticker symbol/);
  assert.throws(() => upsertHolding(db, { symbol: 'OK', currency: 'EURO' }), /currency/);
  assert.throws(() => upsertHolding(db, { symbol: 'OK', currency: 'EUR', quantity: -1 }), /quantity you own/);
});

test('quotes: demo series is deterministic and stable when the window grows; stooq CSV parses', () => {
  assert.deepEqual(demoSeries('MSFT.US', '2026-11-09', 5), demoSeries('MSFT.US', '2026-11-09', 5));
  assert.deepEqual(demoSeries('MSFT.US', '2026-11-09', 5), demoSeries('MSFT.US', '2026-11-10', 6).slice(0, 5));
  const csv = 'Symbol,Date,Time,Open,High,Low,Close,Volume\r\nAAPL.US,2026-11-06,22:00:19,225.1,227.0,224.2,226.96,38328800\r\nNOPE,N/D,N/D,N/D,N/D,N/D,N/D,N/D\r\n';
  assert.deepEqual(parseStooqCsv(csv), [{ symbol: 'AAPL.US', day: '2026-11-06', close: 226.96 }]);
});

test('rss: parses RSS and Atom, strips markup, rejects non-http links', () => {
  const rss = `<rss><channel>
    <item><title><![CDATA[Rates &amp; <b>inflation</b>]]></title><link>https://example.com/a?x=1&amp;y=2</link>
      <description>&lt;p&gt;Body &lt;script&gt;alert(1)&lt;/script&gt;text&lt;/p&gt;</description><pubDate>Mon, 09 Nov 2026 07:00:00 GMT</pubDate></item>
    <item><title>Bad link</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const items = parseFeed(rss);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, 'Rates & inflation');
  assert.equal(items[0]!.url, 'https://example.com/a?x=1&y=2');
  assert.ok(!/[<>]/.test(items[0]!.summary));
  assert.equal(items[0]!.publishedAt, '2026-11-09T07:00:00.000Z');
  const atom = `<feed><entry><title>Atom one</title><link rel="alternate" href="https://example.com/b"/><updated>2026-11-08T10:00:00Z</updated><summary>S</summary></entry></feed>`;
  assert.equal(parseFeed(atom)[0]!.url, 'https://example.com/b');
});

test('news: tagging matches names, keywords and tickers on word boundaries', () => {
  const h = [{ symbol: 'ASML.NL', name: 'ASML Holding', keywords: 'semiconductor, chip' }, { symbol: 'V.US', name: 'Visa', keywords: '' }];
  assert.deepEqual(tagsFor('Chip makers rally as ASML guides higher', h), ['ASML.NL']);
  assert.deepEqual(tagsFor('Visa volumes rise', h), ['V.US']);
  assert.deepEqual(tagsFor('Advisors and chipmunks', h), []);           // no partial-word hits, no 1-letter ticker hits
  const { db } = fresh();
  upsertHolding(db, { symbol: 'ASML.NL', name: 'ASML Holding', currency: 'EUR', keywords: 'chip' });
  const items = [{ title: 'ASML beats', url: 'https://example.com/1', summary: '', publishedAt: null }, { title: 'Weather', url: 'https://example.com/2', summary: '', publishedAt: null }];
  assert.equal(saveNews(db, 'F', items), 2);
  assert.equal(saveNews(db, 'F', items), 0);                              // idempotent on URL
  assert.equal(listNews(db, { relevantOnly: true }).length, 1);
  assert.equal(listNews(db, { query: '100%_' }).length, 0);               // LIKE wildcards are escaped
});

test('instagram: URL normalisation and mojibake repair', () => {
  assert.equal(normaliseInstagramUrl('https://www.instagram.com/reel/Cabc123/?igsh=xyz#frag'), 'https://www.instagram.com/reel/Cabc123/');
  assert.equal(normaliseInstagramUrl('https://instagram.com/p/X'), 'https://www.instagram.com/p/X/');
  assert.equal(normaliseInstagramUrl('https://instagram.com.evil.io/p/X/'), null);
  assert.equal(normaliseInstagramUrl('javascript:alert(1)'), null);
  assert.equal(fixMojibake('Citt\u00c3\u00a0 da vedere'), 'Città da vedere');
  assert.equal(fixMojibake('Città'), 'Città');
  assert.equal(fixMojibake('plain'), 'plain');
});

test('instagram: extracts saved, liked and collections; ignores foreign links', () => {
  const saved = extractInstagram(fixture('saved_posts.json'));
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[0], { url: 'https://www.instagram.com/reel/Cabc123/', author: 'chef.marco', collection: null, kind: 'saved', savedAt: new Date(1730000000e3).toISOString() });
  const liked = extractInstagram(fixture('liked_posts.json'));
  assert.deepEqual(liked.map((l) => [l.kind, l.author]), [['liked', 'neuro_lab'], ['liked', 'runner.mi']]);
  const cols = extractInstagram(fixture('saved_collections.json'));
  assert.deepEqual(cols.map((c) => [c.collection, c.author]), [['Ricette', 'chef.marco'], ['Città da vedere', 'travel.it']]);
});

test('instagram: import is idempotent, merges kinds and collections, and never overwrites triage', () => {
  const { db } = fresh();
  assert.deepEqual(importInstagram(db, fixture('liked_posts.json')), { found: 2, added: 2, updated: 0 });
  const liked = listLibrary(db, { query: 'neuro_lab' })[0]!;
  updateLibraryItem(db, liked.id, { status: 'keep', note: 'for the workshop', topics: ['Work', 'work', ' neuro '] });
  assert.deepEqual(importInstagram(db, fixture('saved_posts.json')), { found: 2, added: 1, updated: 1 });
  assert.deepEqual(importInstagram(db, fixture('saved_collections.json')), { found: 2, added: 1, updated: 1 });
  assert.deepEqual(importInstagram(db, fixture('saved_posts.json')), { found: 2, added: 0, updated: 0 });
  const again = listLibrary(db, { query: 'neuro_lab' })[0]!;
  assert.deepEqual([again.kind, again.status, again.note, again.topics], ['saved', 'keep', 'for the workshop', ['work', 'neuro']]);
  const recipe = listLibrary(db, { topic: 'food' });
  assert.equal(recipe.length, 1);
  assert.equal(recipe[0]!.collection, 'Ricette');
  assert.deepEqual(resurface(db, 2).map((i) => i.kind), ['saved', 'saved']);   // saves before likes
  assert.throws(() => updateLibraryItem(db, liked.id, { status: 'nonsense' }), /status/);
  const dir = importInstagramPath(openDb(':memory:'), new URL('./fixtures', import.meta.url).pathname);
  assert.equal(dir.files.length, 3);
  assert.equal(dir.added, 4);
});

test('habits: streak tolerates an unticked today and breaks on a gap', () => {
  const { db } = fresh();
  const id = addHabit(db, 'Move');
  for (const d of ['2026-11-05', '2026-11-07', '2026-11-08']) toggleHabit(db, id, d);
  assert.equal(habitViews(db, '2026-11-09')[0]!.streak, 2);
  toggleHabit(db, id, '2026-11-09');
  assert.equal(habitViews(db, '2026-11-09')[0]!.streak, 3);
  assert.equal(habitViews(db, '2026-11-11')[0]!.streak, 0);
  assert.throws(() => toggleHabit(db, 999, '2026-11-09'), /No habit/);
});

test('brief: template renders from data, and the verifier rejects figures the data does not support', async () => {
  const { db } = fresh();
  seedDemo(db, '2026-11-09');
  await refreshQuotes(db, cfg, '2026-11-09');
  addTask(db, { title: 'Send proposal', due: '2026-11-01' });
  remember(db, 'goal', 'Keep equities under 70% of the portfolio');
  const data = briefData(db, cfg, new Date('2026-11-09T08:00:00Z'));
  const body = renderBrief(data);
  assert.match(body, /Morning brief — Monday 2026-11-09/);
  assert.match(body, /Overdue since 2026-11-01: Send proposal/);
  assert.match(body, /Keep equities under 70%/);
  assert.deepEqual(verifyNumbers(body.split('## Goals')[0]!, data), []);        // our own output must pass
  assert.deepEqual(verifyNumbers('Your portfolio rose 42.42% to €9,999,999 on 2026-11-09 at 07:30.', data), ['42.42%', '€9,999,999']);
  const pct = data.portfolio.dayChangePct!.toFixed(1);
  assert.deepEqual(verifyNumbers(`Up ${pct}% today, 3 tasks open.`, data), []);
  const rejected = await generateBrief(db, cfg, 'morning', async () => 'Portfolio up 99.9% today.');
  assert.equal(rejected.generator, 'template');
  assert.match(rejected.note, /rejected/);
  const accepted = await generateBrief(db, cfg, 'morning', async () => `A calm day: the portfolio moved ${pct}%.`);
  assert.equal(accepted.generator, 'model');
  const failed = await generateBrief(db, cfg, 'morning', async () => { throw new Error('offline'); });
  assert.match(failed.note, /offline/);
});

test('scheduler: daily jobs run once per local day and catch up; interval jobs respect their period', () => {
  const jobs = [{ name: 'brief', at: '07:30' }, { name: 'weekly', at: '18:00', weekday: 0 }, { name: 'poll', everyMinutes: 30 }];
  const t = Date.parse('2026-11-09T09:00:00Z');
  const mon = (hhmm: string) => ({ day: '2026-11-09', hhmm, weekday: 1 });
  assert.deepEqual(dueJobs(jobs, [], mon('07:29'), t), ['poll']);
  assert.deepEqual(dueJobs(jobs, [], mon('10:00'), t), ['brief', 'poll']);
  const ran = [{ job: 'brief', local_day: '2026-11-09', started_at: new Date(t).toISOString() }, { job: 'poll', local_day: '2026-11-09', started_at: new Date(t - 10 * 60000).toISOString() }];
  assert.deepEqual(dueJobs(jobs, ran, mon('10:00'), t), []);
  assert.deepEqual(dueJobs(jobs, ran, { day: '2026-11-15', hhmm: '18:05', weekday: 0 }, t + 6 * 864e5), ['brief', 'weekly', 'poll']);
});

test('jobs: a run is logged, and demo mode makes no network calls', async () => {
  const ctx = fresh();
  seedDemo(ctx.db, '2026-11-09');
  const r = await runJob(ctx, 'morning-brief');
  assert.equal(r.status, 'ok');
  assert.ok(portfolioView(ctx.db, cfg).totalValue > 0);
  assert.ok(listNews(ctx.db).length > 0);
  await assert.rejects(() => runJob(ctx, 'nope'), /Unknown job/);
});

test('tools: schema validation, write gating and untrusted-content marking', async () => {
  const ctx = fresh();
  assert.equal(validateInput(TOOLS.find((t) => t.name === 'add_task')!.inputSchema, { title: 'x', bogus: 1 }), 'unknown field "bogus"');
  assert.match((await callTool(ctx, 'add_task', {}, { allowWrite: true })).text, /missing required field "title"/);
  assert.match((await callTool(ctx, 'add_task', { title: 'x' }, { allowWrite: false })).text, /write access is disabled/);
  assert.equal((await callTool(ctx, 'add_task', { title: 'Call the bank', due: '2026-11-10' }, { allowWrite: true })).ok, true);
  assert.match((await callTool(ctx, 'add_task', { title: 'x', due: 'tomorrow' }, { allowWrite: true })).text, /YYYY-MM-DD/);
  assert.match((await callTool(ctx, 'search_news', {}, { allowWrite: false })).text, /Third-party content/);
  assert.equal((await callTool(ctx, 'remember', { kind: 'goal', text: 'Run a 10k' }, { allowWrite: true })).ok, true);
  assert.equal(memories(ctx.db, '10k').length, 1);
  assert.equal((await callTool(ctx, 'get_overview', {}, { allowWrite: false })).ok, true);
});

test('mcp: handshake, tool listing honours read-only mode, calls return results or tool errors', async () => {
  const ctx = fresh();
  const init = await handleMcp(ctx, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal((init.body as any).result.protocolVersion, '2025-06-18');
  assert.equal((await handleMcp(ctx, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const list = await handleMcp(ctx, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = (list.body as any).result.tools.map((t: any) => t.name);
  assert.ok(names.includes('get_portfolio') && !names.includes('add_task'));
  const denied = await handleMcp(ctx, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'add_task', arguments: { title: 'x' } } });
  assert.equal((denied.body as any).result.isError, true);
  const okCall = await handleMcp(ctx, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_tasks', arguments: {} } });
  assert.equal((okCall.body as any).result.isError, false);
  assert.equal(((await handleMcp(ctx, { jsonrpc: '2.0', id: 5, method: 'nope' })).body as any).error.code, -32601);
  assert.equal((await handleMcp(ctx, { hello: 1 })).status, 400);
});
