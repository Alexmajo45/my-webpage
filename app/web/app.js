// Dashboard front end. No framework and no innerHTML: every string from the server (news, saved posts,
// model output) is placed with textContent, so third-party text can never become markup.
const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';

function h(tag, props = {}, ...children) {
  const el = tag === 'svg' || props.svg ? document.createElementNS(SVG, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false || k === 'svg') continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const fill = (id, ...children) => { const el = $(id); el.replaceChildren(...children.flat().filter(Boolean)); return el; };

let S = null;
const view = { newsRelevant: false, libQuery: '', libTopic: null, libItems: null };

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}
function banner(text, isError = false) {
  const b = $('banner');
  b.textContent = text ?? ''; b.hidden = !text; b.classList.toggle('error', isError);
  if (text && !isError) setTimeout(() => { if (b.textContent === text) b.hidden = true; }, 6000);
}
/** Runs an action with the triggering button disabled, reports failure in the banner, then reloads state. */
async function act(button, fn) {
  if (button) button.disabled = true;
  try { const msg = await fn(); await load(); if (typeof msg === 'string') banner(msg); else banner(null); }
  catch (e) { banner(e.message, true); }
  finally { if (button) button.disabled = false; }
}

const money = (n, ccy, digits = 0) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
const num = (n, d = 2) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
const dateShort = (iso) => (iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso)) : '');
const dateTime = (iso) => (iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '');
const CLASS_LABEL = { equity: 'Equity', etf: 'ETF', bond: 'Bond', crypto: 'Crypto', cash: 'Cash', other: 'Other' };

/** Direction is carried by the arrow and the sign, not by colour alone; the figure itself stays in text ink. */
function delta(value, text) {
  if (value == null) return h('span', { class: 'muted' }, '–');
  const dir = value > 0.0005 ? 'up' : value < -0.0005 ? 'down' : 'flat';
  return h('span', { class: `delta ${dir} num` }, h('span', { class: 'arrow', 'aria-hidden': 'true' }, dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'), text);
}
const signed = (n, fmt) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

const tip = $('tip');
function showTip(text, x, y) {
  tip.textContent = text; tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, x - w / 2))}px`;
  tip.style.top = `${Math.max(4, y - 34)}px`;
}
const hideTip = () => { tip.hidden = true; };

function sparkline(points, currency) {
  const W = 120, H = 30, P = 5;
  if (points.length < 2) return h('span', { class: 'muted small' }, 'n/a');
  const lo = Math.min(...points.map((p) => p.close)), hi = Math.max(...points.map((p) => p.close));
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v) => (hi === lo ? H / 2 : H - P - ((v - lo) * (H - 2 * P)) / (hi - lo));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.close).toFixed(1)}`).join(' ');
  const dot = h('circle', { svg: true, r: 4, cx: x(points.length - 1), cy: y(points.at(-1).close) });
  const svg = h('svg', { class: 'spark', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `30-day price trend, from ${num(points[0].close)} to ${num(points.at(-1).close)} ${currency}` },
    h('path', { svg: true, d }), dot, h('rect', { svg: true, class: 'hit', x: 0, y: 0, width: W, height: H }));
  svg.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - box.left - P) / (box.width - 2 * P)) * (points.length - 1))));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(points[i].close));
    showTip(`${dateShort(points[i].day)} · ${num(points[i].close)} ${currency}`, box.left + x(i), box.top);
  });
  svg.addEventListener('pointerleave', () => { dot.setAttribute('cx', x(points.length - 1)); dot.setAttribute('cy', y(points.at(-1).close)); hideTip(); });
  return svg;
}

function linkify(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    out.push(text.slice(last, m.index), h('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer' }, m[0].replace(/^https?:\/\/(www\.)?/, '')));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}
/** A deliberately tiny markdown subset (headings, bullets, paragraphs) rendered as DOM nodes. */
function prose(md) {
  const nodes = [];
  let list = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    if (line.startsWith('# ')) continue; // the card already has a title
    if (/^#{2,}\s/.test(line)) { list = null; nodes.push(h('h3', {}, line.replace(/^#+\s*/, ''))); continue; }
    if (/^[-*]\s/.test(line)) { if (!list) nodes.push((list = h('ul'))); list.append(h('li', {}, linkify(line.slice(2).replace(/\*\*/g, '')))); continue; }
    list = null;
    nodes.push(h('p', {}, linkify(line.replace(/\*\*/g, ''))));
  }
  return nodes;
}

function renderHeader() {
  $('dateline').textContent = `${new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${S.today}T12:00:00`))} · ${S.timezone}`;
  fill('chips',
    S.mode === 'demo' && h('span', { class: 'chip' }, 'Demo data'),
    h('span', { class: 'chip' }, S.agent.configured ? `Agent: ${S.agent.model}` : 'Agent off'));
}

function renderBrief() {
  const b = S.brief;
  $('brief-meta').textContent = b ? `${b.kind} · ${dateTime(b.created_at)} · ${b.generator === 'model' ? 'written by the agent, figures verified' : 'template'}` : '';
  fill('brief', b ? prose(b.body) : h('p', { class: 'empty' }, 'No brief yet. Use “Refresh brief” to write one.'));
}

function renderPortfolio() {
  const p = S.portfolio, ccy = p.baseCurrency;
  $('money-meta').textContent = p.asOf ? `prices as of ${dateShort(p.asOf)}` : '';
  fill('money-hero',
    h('span', { class: 'value num' }, money(p.totalValue, ccy)),
    p.dayChangePct != null && delta(p.dayChange, `${signed(p.dayChange, (v) => money(v, ccy))} (${signed(p.dayChangePct, (v) => num(v))}%) today`),
    p.totalPnl != null && h('span', { class: 'muted num' }, `${signed(p.totalPnl, (v) => money(v, ccy))} since purchase`));
  fill('allocation', p.allocation.length > 0 && h('div', { class: 'alloc' },
    h('div', { class: 'alloc-bar', role: 'img', 'aria-label': `Allocation: ${p.allocation.map((a) => `${CLASS_LABEL[a.assetClass]} ${num(a.pct, 0)}%`).join(', ')}` },
      p.allocation.map((a) => {
        const seg = h('div', { class: `c-${a.assetClass}` });
        seg.style.flexGrow = String(Math.max(a.pct, 0.5));
        seg.addEventListener('pointermove', (e) => showTip(`${CLASS_LABEL[a.assetClass]} · ${money(a.value, ccy)} · ${num(a.pct, 1)}%`, e.clientX, seg.getBoundingClientRect().top));
        seg.addEventListener('pointerleave', hideTip);
        return seg;
      })),
    h('div', { class: 'legend' }, p.allocation.map((a) => h('span', {}, h('i', { class: `swatch c-${a.assetClass}` }), `${CLASS_LABEL[a.assetClass]} ${num(a.pct, 0)}%`)))));
  fill('money-warn', p.warnings.map((w) => h('p', { class: 'note' }, w)));
  const head = h('tr', {}, h('th', {}, 'Holding'), h('th', { class: 'r' }, 'Price'), h('th', { class: 'r' }, 'Day'), h('th', {}, '30 days'), h('th', { class: 'r' }, `Value (${ccy})`), h('th', { class: 'r' }, 'Gain'), h('th', {}, h('span', { class: 'muted' }, '')));
  const rows = p.holdings.map((x) => h('tr', {},
    h('td', { class: 'name' }, h('div', {}, x.name), h('div', { class: 'muted small' }, `${x.symbol} · ${CLASS_LABEL[x.assetClass]}${x.quantity ? ` · ${num(x.quantity, x.quantity % 1 ? 4 : 0)} units` : ' · watchlist'}`)),
    h('td', { class: 'r num' }, x.price == null ? '–' : `${num(x.price)} ${x.currency}`),
    h('td', { class: 'r' }, x.dayChangePct == null ? '–' : delta(x.dayChangePct, `${signed(x.dayChangePct, (v) => num(v))}%`)),
    h('td', {}, sparkline(x.spark, x.currency)),
    h('td', { class: 'r num' }, x.quantity && x.valueBase != null ? money(x.valueBase, ccy) : '–'),
    h('td', { class: 'r' }, x.quantity && x.pnlPct != null ? delta(x.pnlPct, `${signed(x.pnlPct, (v) => num(v, 1))}%`) : '–'),
    h('td', { class: 'r' }, h('button', { class: 'mini', 'aria-label': `Remove ${x.name}`, onclick: (e) => { if (confirm(`Remove ${x.name} from the portfolio?`)) act(e.currentTarget, () => api('DELETE', `/api/holdings/${x.id}`)); } }, 'Remove'))));
  fill('holdings', p.holdings.length ? [h('thead', {}, head), h('tbody', {}, rows)] : h('caption', { class: 'empty' }, 'No holdings yet. Add one below.'));
}

function renderNews() {
  const items = S.news.filter((n) => !view.newsRelevant || n.tags.length);
  fill('news', items.length ? items.map((n) => h('li', {},
    h('div', { class: 'body' },
      h('a', { href: n.url, target: '_blank', rel: 'noopener noreferrer' }, n.title),
      h('div', { class: 'muted small' }, [n.feed, dateTime(n.published_at)].filter(Boolean).join(' · '))),
    h('div', { class: 'actions' }, n.tags.map((t) => h('span', { class: 'tag', title: 'Mentions this holding' }, t))))) :
    h('li', { class: 'empty' }, view.newsRelevant ? 'Nothing currently mentions your holdings.' : 'No news yet. Add feeds to the config, then refresh.'));
}

function renderTasks() {
  $('tasks-meta').textContent = `${S.tasks.length} open`;
  fill('tasks', S.tasks.length ? S.tasks.map((t) => {
    const overdue = t.due && t.due < S.today;
    return h('li', {},
      h('input', { type: 'checkbox', 'aria-label': `Complete: ${t.title}`, onchange: (e) => act(e.currentTarget, () => api('POST', `/api/tasks/${t.id}/done`, {})) }),
      h('div', { class: 'body' }, h('span', { class: overdue ? 'overdue' : '' }, t.title),
        h('div', { class: 'muted small' }, [t.due && `${overdue ? 'overdue since' : t.due === S.today ? 'due today,' : 'due'} ${dateShort(t.due)}`, t.area, t.source !== 'manual' && `via ${t.source}`].filter(Boolean).join(' · '))));
  }) : h('li', { class: 'empty' }, 'Nothing open. Enjoy it.'));
}

function renderHabits() {
  fill('habits', S.habits.length ? S.habits.map((hb) => h('div', { class: 'habit' },
    h('span', {}, hb.name),
    h('div', { class: 'days' }, hb.days.map((d) => h('button', {
      class: `day${d.day === S.today ? ' today' : ''}`, 'aria-pressed': String(d.done),
      'aria-label': `${hb.name}, ${dateShort(d.day)}: ${d.done ? 'done' : 'not done'}`,
      onclick: (e) => act(e.currentTarget, () => api('POST', `/api/habits/${hb.id}/toggle`, { day: d.day })),
    }, new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' }).format(new Date(`${d.day}T12:00:00`))))),
    h('span', { class: 'muted small num' }, `streak ${hb.streak}`))) : h('p', { class: 'empty' }, 'No habits yet.'));
}

function renderJournal() {
  fill('journal', S.journal.map((j) => h('li', {}, h('div', { class: 'body' }, j.text, h('div', { class: 'muted small' }, `${dateShort(j.day)}${j.mood ? ` · mood ${j.mood}/5` : ''}`)))));
}

function renderLibrary() {
  const sum = S.library.summary;
  $('lib-meta').textContent = sum.total ? `${sum.total} items · ${sum.byStatus.new ?? 0} to triage` : '';
  fill('lib-topics', sum.topics.map((t) => h('button', { class: 'chip', 'aria-pressed': String(view.libTopic === t.topic),
    onclick: () => { view.libTopic = view.libTopic === t.topic ? null : t.topic; searchLibrary(); } }, `${t.topic} ${t.count}`)));
  const items = view.libItems ?? S.library.items;
  const setStatus = (it, status) => (e) => act(e.currentTarget, async () => { await api('POST', `/api/library/${it.id}`, { status }); await searchLibrary(false); });
  fill('library', items.length ? items.map((it) => h('li', {},
    h('div', { class: 'body' },
      h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer' }, it.author ? `@${it.author}` : 'Instagram post'),
      ' ', h('span', { class: 'muted small' }, [it.kind, it.collection, dateShort(it.saved_at), it.status !== 'new' && it.status].filter(Boolean).join(' · ')),
      it.note && h('div', { class: 'small' }, it.note),
      it.topics.length > 0 && h('div', { class: 'chips' }, it.topics.map((t) => h('span', { class: 'tag' }, t)))),
    h('div', { class: 'actions' },
      h('button', { class: 'mini', onclick: (e) => { const note = prompt('Why did you save this? (note)', it.note ?? ''); if (note !== null) act(e.currentTarget, async () => { await api('POST', `/api/library/${it.id}`, { note, status: it.status === 'new' ? 'keep' : it.status }); await searchLibrary(false); }); } }, 'Note'),
      h('button', { class: 'mini', onclick: (e) => act(e.currentTarget, async () => {
        await api('POST', '/api/tasks', { title: `Act on saved post${it.author ? ` from @${it.author}` : ''}`, notes: `${it.url}${it.note ? `\n${it.note}` : ''}`, area: it.topics[0] ?? 'personal' });
        await api('POST', `/api/library/${it.id}`, { status: 'actioned' }); await searchLibrary(false); return 'Task created from saved post.';
      }) }, 'Make task'),
      it.status === 'new' && h('button', { class: 'mini', onclick: setStatus(it, 'keep') }, 'Keep'),
      h('button', { class: 'mini', onclick: setStatus(it, 'archived') }, 'Archive')))) :
    h('li', { class: 'empty' }, sum.total ? 'Nothing matches.' : 'Empty. In Instagram: Accounts Centre → Your information and permissions → Download your information → JSON format. Then import the saved and liked files here.'));
}
async function searchLibrary(rerender = true) {
  const params = new URLSearchParams();
  if (view.libQuery) params.set('q', view.libQuery);
  if (view.libTopic) params.set('topic', view.libTopic);
  view.libItems = view.libQuery || view.libTopic ? await api('GET', `/api/library?${params}`) : null;
  if (rerender) renderLibrary();
}

function renderAutomations() {
  const when = (s) => (!s ? 'manual only' : s.at ? `${s.weekday != null ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.weekday]} ` : 'daily '}${s.at}` : `every ${s.everyMinutes} min`);
  fill('jobs', S.jobs.map((j) => h('li', {},
    h('div', { class: 'body' }, h('span', {}, j.name), ' ', h('span', { class: 'tag' }, when(j.schedule)), h('div', { class: 'muted small' }, j.description)),
    h('button', { class: 'mini', onclick: (e) => runJob(e.currentTarget, j.name) }, 'Run now'))));
  const label = { ok: 'ok', error: 'failed', running: 'running' };
  fill('runs', S.runs.length ? S.runs.map((r) => h('li', {},
    h('span', { class: `status ${r.status}` }, h('span', { class: 'dot', 'aria-hidden': 'true' }, r.status === 'ok' ? '✓' : r.status === 'error' ? '✕' : '…'), label[r.status] ?? r.status),
    h('div', { class: 'body' }, `${r.job} · ${dateTime(r.started_at)}`, r.detail && h('div', { class: 'muted' }, r.detail)))) : h('li', { class: 'empty' }, 'No runs yet.'));
}
const runJob = (button, name) => act(button, async () => { const r = await api('POST', `/api/jobs/${name}/run`, {}); if (r.status === 'error') throw new Error(`${name} failed: ${r.detail}`); return `${name}: ${r.detail}`; });

function renderMemories() {
  fill('memories', S.memories.length ? S.memories.map((m) => h('li', {}, h('span', { class: 'tag' }, m.kind), h('div', { class: 'body' }, m.text))) :
    h('li', { class: 'empty' }, 'Nothing yet. Tell Cortex a goal or a preference and it will keep it across conversations.'));
}

function renderChat(pending) {
  const msgs = [...S.chat, ...(pending ?? [])];
  const log = fill('chat-log', msgs.length ? msgs.map((m) => h('div', { class: `msg ${m.role}` }, m.text, m.used?.length > 0 && h('span', { class: 'used' }, `used ${m.used.join(', ')}`))) :
    h('p', { class: 'empty' }, S.agent.configured ? 'Ask about your day, your portfolio, the news or your saved posts. It can also add tasks and tick habits.' : 'The agent is off. Everything else on this page works without it.'));
  log.scrollTop = log.scrollHeight;
  $('chat-note').textContent = S.agent.configured ? 'Tracks and explains; does not trade or give regulated advice.' : 'Set ANTHROPIC_API_KEY and restart to switch the agent on.';
  for (const el of $('chat-form').elements) el.disabled = !S.agent.configured;
}

function render() {
  renderHeader(); renderBrief(); renderPortfolio(); renderNews(); renderTasks(); renderHabits(); renderJournal(); renderLibrary(); renderAutomations(); renderMemories(); renderChat();
}
async function load() { S = await api('GET', '/api/state'); render(); }

function onSubmit(id, handler) {
  $(id).addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    act(form.querySelector('button'), async () => { const out = await handler(Object.fromEntries(new FormData(form)), form); form.reset(); return out; });
  });
}
onSubmit('task-form', (d) => api('POST', '/api/tasks', { title: d.title, due: d.due || null }).then(() => null));
onSubmit('habit-form', (d) => api('POST', '/api/habits', d).then(() => null));
onSubmit('journal-form', (d) => api('POST', '/api/journal', d).then(() => 'Journal entry saved.'));
onSubmit('holding-form', (d) => api('POST', '/api/holdings', d).then((x) => `Saved ${x.symbol}.`));

$('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget, text = form.message.value.trim();
  if (!text) return;
  form.message.value = '';
  renderChat([{ role: 'user', text }, { role: 'assistant', text: 'Thinking…' }]);
  for (const el of form.elements) el.disabled = true;
  try {
    const r = await api('POST', '/api/chat', { message: text });
    await load();
    // A reply that was not saved (refusal, out of steps) still needs showing; so do the tools that ran.
    const used = r.tools.filter((t) => t.ok).map((t) => t.name);
    const last = S.chat.at(-1);
    if (!last || last.role !== 'assistant' || last.text !== r.reply) renderChat([{ role: 'user', text }, { role: 'assistant', text: r.reply, used }]);
    else if (used.length) { last.used = used; renderChat(); }
  } catch (err) { renderChat([{ role: 'user', text }]); form.message.value = text; banner(err.message, true); }
  finally { for (const el of form.elements) el.disabled = !S.agent.configured; form.message.focus(); }
});
$('chat-reset').addEventListener('click', (e) => act(e.currentTarget, () => api('POST', '/api/chat/reset', {})));

document.addEventListener('click', (e) => { const b = e.target.closest('button[data-job]'); if (b) runJob(b, b.dataset.job); });
$('news-relevant').addEventListener('change', (e) => { view.newsRelevant = e.target.checked; renderNews(); });
let libTimer;
$('lib-q').addEventListener('input', (e) => { view.libQuery = e.target.value.trim(); clearTimeout(libTimer); libTimer = setTimeout(() => searchLibrary().catch((err) => banner(err.message, true)), 200); });
$('lib-file').addEventListener('change', (e) => act(null, async () => {
  let found = 0, added = 0, updated = 0;
  for (const file of e.target.files) {
    let json;
    try { json = JSON.parse(await file.text()); } catch { throw new Error(`${file.name} is not valid JSON. Request the Instagram export in JSON format, not HTML.`); }
    const r = await api('POST', `/api/library/import?kind=${/like/i.test(file.name) ? 'liked' : 'saved'}`, json);
    found += r.found; added += r.added; updated += r.updated;
  }
  e.target.value = '';
  return found ? `Import complete: ${found} posts read, ${added} new, ${updated} updated.` : 'No Instagram posts found in those files. Choose saved_posts.json, saved_collections.json or liked_posts.json.';
}));

load().catch((e) => banner(e.message, true));
setInterval(() => { if (!document.hidden && !document.querySelector('button:disabled')) load().catch(() => {}); }, 60_000);
