// Cortex front end. No framework and no innerHTML: every string from the server (news, saved posts, model
// output) is placed with textContent, so third-party text can never become markup.
const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';

function h(tag, props = {}, ...children) {
  const el = props.svg || tag === 'svg' ? document.createElementNS(SVG, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false || k === 'svg') continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(3)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

let S = null;
const ui = { allNews: false, libQuery: '', libTopic: null, libItems: null, pendingChat: null };

// ---------- plumbing ----------
async function api(method, path, body) {
  const res = await fetch(path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `That did not work (error ${res.status}). Please try again.`);
  return data;
}

let toastTimer;
function toast(text, { error = false, undo } = {}) {
  const t = $('toast');
  clearTimeout(toastTimer);
  t.replaceChildren(text, undo ? h('button', { onclick: () => { t.hidden = true; undo(); } }, 'Undo') : '');
  t.classList.toggle('error', error);
  t.hidden = false;
  toastTimer = setTimeout(() => { t.hidden = true; }, error ? 9000 : undo ? 7000 : 4000);
}

/** Runs an action with its button disabled, reloads, and reports the outcome. `done` may be a string or {text, undo}. */
async function act(button, fn) {
  if (button) button.disabled = true;
  try {
    const done = await fn();
    await load();
    if (typeof done === 'string') toast(done); else if (done?.text) toast(done.text, done);
  } catch (e) { toast(e.message, { error: true }); }
  finally { if (button?.isConnected) button.disabled = false; }
}

// ---------- formatting ----------
const money = (n, ccy, d = 0) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy, maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
const num = (n, d = 2) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
const signed = (n, fmt) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const noon = (day) => new Date(`${day}T12:00:00`);
const dayLabel = (day) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(noon(day));
const when = (iso) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const TYPE = { equity: 'Shares', etf: 'Funds', bond: 'Bonds', crypto: 'Crypto', cash: 'Cash', other: 'Other' };
const TYPE_ONE = { equity: 'Share', etf: 'Fund', bond: 'Bond', crypto: 'Crypto', cash: 'Cash', other: 'Other' };
const holdingName = (symbol) => S.portfolio.holdings.find((x) => x.symbol === symbol)?.name ?? symbol;

function ago(iso) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days < 1) return 'today';
  if (days < 31) return `${plural(days, 'day')} ago`;
  if (days < 365) return `${plural(Math.round(days / 30), 'month')} ago`;
  return `${plural(Math.round(days / 365), 'year')} ago`;
}
function dueText(t) {
  if (!t.due) return null;
  const diff = Math.round((noon(t.due) - noon(S.today)) / 864e5);
  if (diff < 0) return { text: `${plural(-diff, 'day')} overdue`, late: true };
  if (diff === 0) return { text: 'Due today' };
  if (diff === 1) return { text: 'Due tomorrow' };
  return { text: `Due ${dayLabel(t.due)}` };
}

/** Direction is carried by the arrow and the sign, never by colour alone; the figure itself stays in text ink. */
function delta(value, text) {
  const dir = value > 0.0005 ? 'up' : value < -0.0005 ? 'down' : 'flat';
  return h('span', { class: `delta ${dir} num` }, h('span', { class: 'arrow', 'aria-hidden': 'true' }, dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'), text);
}

const tip = $('tip');
function showTip(text, x, y) {
  tip.textContent = text; tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, x - w / 2))}px`;
  tip.style.top = `${Math.max(4, y - 36)}px`;
}
const hideTip = () => { tip.hidden = true; };

function sparkline(points, currency) {
  const W = 110, H = 32, P = 5;
  if (points.length < 2) return h('span', { class: 'muted' }, '–');
  const lo = Math.min(...points.map((p) => p.close)), hi = Math.max(...points.map((p) => p.close));
  const x = (i) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v) => (hi === lo ? H / 2 : H - P - ((v - lo) * (H - 2 * P)) / (hi - lo));
  const dot = h('circle', { svg: true, r: 4, cx: x(points.length - 1), cy: y(points.at(-1).close) });
  const svg = h('svg', { class: 'spark', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Price over the last month, from ${num(points[0].close)} to ${num(points.at(-1).close)} ${currency}` },
    h('path', { svg: true, d: points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.close).toFixed(1)}`).join(' ') }), dot,
    h('rect', { svg: true, class: 'hit', x: 0, y: 0, width: W, height: H }));
  svg.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - box.left - P) / (box.width - 2 * P)) * (points.length - 1))));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(points[i].close));
    showTip(`${dayLabel(points[i].day)}: ${num(points[i].close)} ${currency}`, box.left + x(i), box.top);
  });
  svg.addEventListener('pointerleave', () => { dot.setAttribute('cx', x(points.length - 1)); dot.setAttribute('cy', y(points.at(-1).close)); hideTip(); });
  return svg;
}

function linkify(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    out.push(text.slice(last, m.index), h('a', { class: 'link', href: m[0], target: '_blank', rel: 'noopener noreferrer' }, m[0].replace(/^https?:\/\/(www\.)?/, '')));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}
/** A tiny markdown subset (headings, bullets, paragraphs), built as DOM nodes. */
function prose(md) {
  const nodes = [];
  let list = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    if (line.startsWith('# ')) continue;
    if (/^#{2,}\s/.test(line)) { list = null; nodes.push(h('h3', {}, line.replace(/^#+\s*/, ''))); continue; }
    if (/^[-*]\s/.test(line)) { if (!list) nodes.push((list = h('ul'))); list.append(h('li', {}, linkify(line.slice(2).replace(/\*\*/g, '')))); continue; }
    list = null;
    nodes.push(h('p', {}, linkify(line.replace(/\*\*/g, ''))));
  }
  return nodes;
}

// ---------- shared pieces ----------
const section = (title, link, ...body) => h('section', { class: 'section' },
  h('div', { class: 'section-head' }, h('h2', {}, title), link), body);

function taskRow(t) {
  const due = dueText(t);
  return h('li', {},
    h('input', { type: 'checkbox', 'aria-label': `Mark as done: ${t.title}`, onchange: (e) => act(e.currentTarget, async () => {
      await api('POST', `/api/tasks/${t.id}/done`, {});
      return { text: 'Task done.', undo: () => act(null, () => api('POST', `/api/tasks/${t.id}/done`, { done: false }).then(() => 'Task restored.')) };
    }) }),
    h('div', { class: 'main' }, h('div', { class: 'title' }, t.title),
      t.notes && h('div', { class: 'sub' }, linkify(t.notes))),
    due && h('span', { class: `pill${due.late ? ' late' : ''}` }, due.text));
}

function captureForm(withDate) {
  return h('form', { class: `capture${withDate ? ' with-date' : ''}`, onsubmit: (e) => {
    e.preventDefault();
    const f = e.currentTarget, title = f.title.value.trim();
    if (!title) { f.title.focus(); return toast('Type what you need to do first.', { error: true }); }
    act(f.querySelector('button'), async () => { await api('POST', '/api/tasks', { title, due: f.due?.value || null }); return 'Task added.'; });
  } },
    h('label', { class: 'sr-only', for: 'capture-title' }, 'New task'),
    h('input', { id: 'capture-title', type: 'text', name: 'title', placeholder: 'Add something you need to do…', autocomplete: 'off', enterkeyhint: 'done' }),
    withDate && h('label', { class: 'sr-only', for: 'capture-due' }, 'Due date'),
    withDate && h('input', { id: 'capture-due', type: 'date', name: 'due' }),
    h('button', { class: 'btn primary' }, 'Add task'));
}

function newsRow(n) {
  return h('li', {},
    h('div', { class: 'main' },
      h('a', { class: 'title', href: n.url, target: '_blank', rel: 'noopener noreferrer' }, n.title),
      h('div', { class: 'sub' }, n.feed, n.published_at ? `, ${ago(n.published_at)}` : ''),
      n.tags.length > 0 && h('div', { class: 'pills' }, n.tags.map((s) => h('span', { class: 'pill' }, `About ${holdingName(s)}`)))));
}

function savedRow(it) {
  const refresh = () => searchSaved(false);
  return h('li', {},
    h('div', { class: 'main' },
      h('a', { class: 'title', href: it.url, target: '_blank', rel: 'noopener noreferrer' }, it.author ? `Post by @${it.author}` : 'Instagram post'),
      h('div', { class: 'sub' }, it.kind === 'liked' ? 'Liked' : 'Saved', it.saved_at ? ` ${ago(it.saved_at)}` : '', it.collection ? ` in “${it.collection}”` : ''),
      it.note && h('div', {}, it.note),
      it.topics.length > 0 && h('div', { class: 'pills' }, it.topics.map((t) => h('span', { class: 'pill' }, t)))),
    h('div', { class: 'side' },
      h('button', { class: 'btn', onclick: (e) => act(e.currentTarget, async () => {
        await api('POST', '/api/tasks', { title: `Act on the post${it.author ? ` by @${it.author}` : ''} I saved`, notes: `${it.url}${it.note ? `\n${it.note}` : ''}`, area: it.topics[0] ?? 'personal' });
        await api('POST', `/api/library/${it.id}`, { status: 'actioned' }); await refresh(); return 'Added to your tasks.';
      }) }, 'Turn into task'),
      h('button', { class: 'btn quiet', onclick: () => openNote(it) }, it.note ? 'Edit note' : 'Add note'),
      h('button', { class: 'btn quiet', onclick: (e) => act(e.currentTarget, async () => {
        await api('POST', `/api/library/${it.id}`, { status: 'archived' }); await refresh();
        return { text: 'Archived.', undo: () => act(null, async () => { await api('POST', `/api/library/${it.id}`, { status: it.status }); await refresh(); return 'Restored.'; }) };
      }) }, 'Archive')));
}

// ---------- views ----------
function viewToday() {
  const p = S.portfolio, ccy = p.baseCurrency;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: S.timezone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const greeting = `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}${S.owner && S.owner !== 'there' ? `, ${S.owner}` : ''}`;
  const overdue = S.tasks.filter((t) => t.due && t.due < S.today), dueToday = S.tasks.filter((t) => t.due === S.today);
  const urgent = [...overdue, ...dueToday];
  const movers = p.holdings.filter((x) => x.quantity > 0 && Math.abs(x.dayChangePct ?? 0) >= 2);
  const untriaged = S.library.summary.byStatus.new ?? 0;
  const relevant = S.news.filter((n) => n.tags.length).slice(0, 3);
  const habitsLeft = S.habits.filter((x) => !x.days.at(-1).done).length;

  const lede = h('p', { class: 'lede' });
  const parts = [];
  if (overdue.length) parts.push([h('strong', {}, plural(overdue.length, 'task')), ` ${overdue.length === 1 ? 'is' : 'are'} overdue`]);
  else if (dueToday.length) parts.push([h('strong', {}, plural(dueToday.length, 'task')), ' due today']);
  else parts.push(['nothing is due today']);
  if (p.dayChangePct != null) parts.push(['your portfolio is ', h('strong', {}, `${p.dayChange >= 0 ? 'up' : 'down'} ${num(Math.abs(p.dayChangePct))}%`)]);
  if (habitsLeft) parts.push([h('strong', {}, plural(habitsLeft, 'habit')), ' still to tick']);
  parts.forEach((part, i) => lede.append(...(i === 0 ? [] : [i === parts.length - 1 ? ' and ' : ', ']), ...part));
  lede.append('.');
  lede.firstChild.textContent = lede.firstChild.textContent.replace(/^./, (c) => c.toUpperCase());

  const modelBrief = S.brief?.generator === 'model';
  return [
    h('p', { class: 'dateline' }, new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(noon(S.today))),
    h('h1', {}, greeting), lede,
    captureForm(false),

    h('div', { class: 'glance' },
      h('a', { href: '#/money' }, h('div', { class: 'label' }, 'Your portfolio'), h('div', { class: 'figure num' }, money(p.totalValue, ccy)),
        h('div', { class: 'note' }, p.dayChangePct == null ? 'No price history yet' : delta(p.dayChange, `${signed(p.dayChange, (v) => money(v, ccy))} today`))),
      h('a', { href: '#/plan' }, h('div', { class: 'label' }, 'To do'), h('div', { class: 'figure num' }, plural(S.tasks.length, 'task')),
        h('div', { class: 'note' }, overdue.length ? `${overdue.length} overdue` : dueToday.length ? `${dueToday.length} due today` : 'Nothing due today')),
      h('a', { href: '#/saved' }, h('div', { class: 'label' }, 'Saved posts to sort'), h('div', { class: 'figure num' }, String(untriaged)),
        h('div', { class: 'note' }, S.library.summary.total ? `of ${S.library.summary.total} imported` : 'Import from Instagram'))),

    modelBrief && h('div', { class: 'brief' }, prose(S.brief.body)),

    section('Needs your attention', urgent.length > 0 && h('a', { href: '#/plan' }, 'All tasks'),
      urgent.length || movers.length || p.warnings.length ? h('div', { class: 'panel' }, h('ul', { class: 'rows' },
        urgent.map(taskRow),
        movers.map((x) => h('li', {}, h('div', { class: 'main' }, h('a', { class: 'title', href: '#/money' }, `${x.name} moved sharply`), h('div', { class: 'sub' }, 'A change of 2% or more in a day')), delta(x.dayChangePct, `${signed(x.dayChangePct, (v) => num(v))}%`))),
        p.warnings.map((w) => h('li', {}, h('div', { class: 'main' }, h('a', { class: 'title', href: '#/money' }, 'Check your portfolio'), h('div', { class: 'sub' }, w))))))
        : h('p', { class: 'empty' }, 'Nothing urgent. The day is yours.')),

    S.habits.length > 0 && section('Habits for today', h('a', { href: '#/plan' }, 'See the week'),
      h('div', { class: 'habit-toggles' }, S.habits.map((hb) => {
        const done = hb.days.at(-1).done;
        return h('button', { class: 'habit-toggle', 'aria-pressed': String(done), onclick: (e) => act(e.currentTarget, () => api('POST', `/api/habits/${hb.id}/toggle`, { day: S.today })) },
          h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'),
          h('span', {}, h('span', { class: 'name' }, hb.name), h('span', { class: 'sub' }, done ? `Done. ${plural(hb.streak, 'day')} in a row` : hb.streak ? `${plural(hb.streak, 'day')} in a row so far` : 'Not done yet')));
      }))),

    section('In the news for you', h('a', { href: '#/money' }, 'More news'),
      relevant.length ? h('div', { class: 'panel' }, h('ul', { class: 'rows' }, relevant.map(newsRow)))
        : h('p', { class: 'empty' }, 'No headlines mention your holdings right now.')),

    untriaged > 0 && section('From your saved posts', h('a', { href: '#/saved' }, `All ${untriaged} to sort`),
      h('p', { class: 'hint' }, 'You saved these a while ago. Decide what each one is for.'),
      h('div', { class: 'panel' }, h('ul', { class: 'rows wrap-actions' }, S.library.items.filter((i) => i.status === 'new').slice(-2).reverse().map(savedRow)))),

    !modelBrief && S.brief && h('section', { class: 'section' }, h('details', { class: 'fold' },
      h('summary', {}, 'Read this morning’s full brief'), h('div', { class: 'brief' }, prose(S.brief.body)))),
  ];
}

function viewPlan() {
  return [
    h('h1', {}, 'Plan'),
    h('p', { class: 'lede' }, S.tasks.length ? `${plural(S.tasks.length, 'open task')}. Tick one off when it is done.` : 'Nothing on your list. Add the next thing below.'),
    captureForm(true),
    S.tasks.length > 0 && h('div', { class: 'section' }, h('div', { class: 'panel' }, h('ul', { class: 'rows' }, S.tasks.map(taskRow)))),

    section('Habits this week', null,
      S.habits.length ? h('div', { class: 'panel' }, S.habits.map((hb) => h('div', { class: 'week' },
        h('div', {}, h('div', { class: 'title' }, hb.name), h('div', { class: 'muted' }, hb.streak ? `${plural(hb.streak, 'day')} in a row` : 'No run yet')),
        h('div', { class: 'days' }, hb.days.map((d) => h('button', {
          class: `day${d.day === S.today ? ' is-today' : ''}`, 'aria-pressed': String(d.done),
          'aria-label': `${hb.name}, ${new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(noon(d.day))}: ${d.done ? 'done' : 'not done'}`,
          onclick: (e) => act(e.currentTarget, () => api('POST', `/api/habits/${hb.id}/toggle`, { day: d.day })),
        }, h('span', {}, new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(noon(d.day)).slice(0, 2), h('b', { 'aria-hidden': 'true' }, '✓')))))))) : h('p', { class: 'empty' }, 'No habits yet. Start with one small thing you want to do every day.'),
      h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); const f = e.currentTarget; if (!f.name.value.trim()) return f.name.focus(); act(f.querySelector('button'), () => api('POST', '/api/habits', { name: f.name.value }).then(() => 'Habit added.')); } },
        h('label', { class: 'sr-only', for: 'habit-name' }, 'New habit'),
        h('input', { id: 'habit-name', name: 'name', placeholder: 'A new daily habit…', autocomplete: 'off' }), h('button', { class: 'btn' }, 'Add habit'))),

    section('Journal', null,
      h('form', { onsubmit: (e) => { e.preventDefault(); const f = e.currentTarget; if (!f.text.value.trim()) return f.text.focus(); act(f.querySelector('button'), () => api('POST', '/api/journal', { text: f.text.value, mood: f.mood.value }).then(() => 'Saved to your journal.')); } },
        h('label', { class: 'sr-only', for: 'journal-text' }, 'Journal entry'),
        h('textarea', { id: 'journal-text', name: 'text', rows: 3, placeholder: 'A line or two about today…' }),
        h('div', { class: 'inline-form' },
          h('label', { for: 'journal-mood', class: 'muted' }, 'How was the day?'),
          h('select', { id: 'journal-mood', name: 'mood' }, h('option', { value: '' }, 'Skip'), [['1', 'Rough'], ['2', 'Low'], ['3', 'Fine'], ['4', 'Good'], ['5', 'Great']].map(([v, l]) => h('option', { value: v }, l))),
          h('span', { class: 'spacer' }), h('button', { class: 'btn' }, 'Save entry'))),
      S.journal.length > 0 && h('div', { class: 'panel', style: null }, h('ul', { class: 'rows' }, S.journal.map((j) => h('li', {}, h('div', { class: 'main' }, j.text, h('div', { class: 'sub' }, dayLabel(j.day), j.mood ? `, felt ${['', 'rough', 'low', 'fine', 'good', 'great'][j.mood]}` : ''))))))),
  ];
}

function viewMoney() {
  const p = S.portfolio, ccy = p.baseCurrency;
  const news = S.news.filter((n) => ui.allNews || n.tags.length);
  return [
    h('p', { class: 'dateline' }, 'Your portfolio is worth'),
    h('h1', { class: 'worth num' }, money(p.totalValue, ccy)),
    h('div', { class: 'worth-row' },
      p.dayChangePct != null && delta(p.dayChange, `${signed(p.dayChange, (v) => money(v, ccy))} (${signed(p.dayChangePct, (v) => num(v))}%) today`),
      p.totalPnl != null && h('span', { class: 'num' }, `${signed(p.totalPnl, (v) => money(v, ccy))} since you bought`),
      p.asOf && h('span', { class: 'muted' }, `Prices from ${dayLabel(p.asOf)}`)),
    S.mode === 'demo' && h('p', { class: 'notice' }, 'These are example holdings with made-up prices. Add your own to replace them.'),
    p.warnings.map((w) => h('p', { class: 'notice' }, w)),

    p.allocation.length > 0 && h('div', {},
      h('div', { class: 'alloc-bar', role: 'img', 'aria-label': `How it is split: ${p.allocation.map((a) => `${TYPE[a.assetClass]} ${num(a.pct, 0)}%`).join(', ')}` },
        p.allocation.map((a) => {
          const seg = h('div', { class: `c-${a.assetClass}` });
          seg.style.flexGrow = String(Math.max(a.pct, 0.5));
          seg.addEventListener('pointermove', (e) => showTip(`${TYPE[a.assetClass]}: ${money(a.value, ccy)} (${num(a.pct, 1)}%)`, e.clientX, seg.getBoundingClientRect().top));
          seg.addEventListener('pointerleave', hideTip);
          return seg;
        })),
      h('div', { class: 'legend' }, p.allocation.map((a) => h('span', {}, h('i', { class: `swatch c-${a.assetClass}` }), `${TYPE[a.assetClass]} ${num(a.pct, 0)}%`)))),

    section('What you hold', h('button', { class: 'btn primary', onclick: () => openHolding(null) }, 'Add a holding'),
      p.holdings.length ? h('div', { class: 'panel' },
        h('div', { class: 'holdings-head', 'aria-hidden': 'true' }, h('span', {}, 'Tap a row to edit'), h('span', { class: 'trend' }, 'Last month'), h('span', { class: 'r today' }, 'Today'), h('span', { class: 'r' }, 'Worth')),
        h('ul', { class: 'holdings' }, p.holdings.map((x) => h('li', {}, h('button', { class: 'holding', 'aria-label': `Edit ${x.name}`, onclick: () => openHolding(x) },
          h('span', {}, h('span', { class: 'title' }, x.name),
            h('span', { class: 'sub' }, x.quantity ? `${num(x.quantity, x.quantity % 1 ? 4 : 0)} × ${x.price == null ? '–' : `${num(x.price)} ${x.currency}`}` : `Watching, ${x.price == null ? 'no price yet' : `${num(x.price)} ${x.currency}`}`)),
          h('span', { class: 'trend' }, sparkline(x.spark, x.currency)),
          h('span', { class: 'r today' }, x.dayChangePct == null ? '–' : delta(x.dayChangePct, `${signed(x.dayChangePct, (v) => num(v))}%`)),
          h('span', { class: 'r' }, h('span', { class: 'title num' }, x.quantity && x.valueBase != null ? money(x.valueBase, ccy) : '–'),
            h('span', { class: 'today-inline' }, x.dayChangePct == null ? '' : delta(x.dayChangePct, `${signed(x.dayChangePct, (v) => num(v))}%`)),
            x.quantity > 0 && x.pnlPct != null && h('span', { class: 'sub num' }, `${signed(x.pnlPct, (v) => num(v, 1))}% overall`)))))))
        : h('p', { class: 'empty' }, 'Nothing here yet. Add what you own, or anything you want to keep an eye on.')),

    section(ui.allNews ? 'All news' : 'News about your holdings',
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: ui.allNews, onchange: (e) => { ui.allNews = e.target.checked; render(); } }), 'Show all news'),
      news.length ? h('div', { class: 'panel' }, h('ul', { class: 'rows' }, news.map(newsRow)))
        : h('p', { class: 'empty' }, ui.allNews ? 'No news yet. News sources are set in the configuration file.' : 'No headlines mention your holdings right now.')),
    h('p', { class: 'hint section' }, 'Cortex tracks your investments so you can see them clearly. It never buys or sells, and nothing here is financial advice.'),
  ];
}

function viewSaved() {
  const sum = S.library.summary, toSort = sum.byStatus.new ?? 0;
  const items = ui.libItems ?? S.library.items;
  const importButton = h('label', { class: 'btn primary' }, 'Import from Instagram',
    h('input', { type: 'file', accept: '.json,application/json', multiple: true, hidden: true, onchange: importFiles }));
  if (!sum.total) return [
    h('h1', {}, 'Saved'),
    h('p', { class: 'lede' }, 'Bring in the posts you saved or liked on Instagram, so the useful ones stop getting lost.'),
    h('div', { class: 'section panel pad' },
      h('h2', {}, 'How to bring them in'),
      h('ol', { class: 'steps' },
        h('li', {}, h('span', {}, 'In Instagram, open ', h('strong', {}, 'Settings'), ', then ', h('strong', {}, 'Accounts Centre'), ', then ', h('strong', {}, 'Your information and permissions'), '.')),
        h('li', {}, h('span', {}, 'Choose ', h('strong', {}, 'Download your information'), '. Pick the format ', h('strong', {}, 'JSON'), ' and include saved and liked posts.')),
        h('li', {}, h('span', {}, 'Instagram emails you a zip file, usually within the hour. Unzip it.')),
        h('li', {}, h('span', {}, 'Press the button below and choose the files named ', h('strong', {}, 'saved_posts'), ', ', h('strong', {}, 'saved_collections'), ' and ', h('strong', {}, 'liked_posts'), '.'))),
      importButton,
      h('p', { class: 'hint' }, 'Cortex reads Instagram’s own export. It never logs in to your account.')),
  ];
  return [
    h('h1', {}, 'Saved'),
    h('p', { class: 'lede' }, toSort ? [h('strong', {}, plural(toSort, 'post')), ` still to sort, out of ${sum.total} imported. Turn the useful ones into tasks and archive the rest.`] : `All ${sum.total} posts are sorted.`),
    h('div', { class: 'capture' },
      h('label', { class: 'sr-only', for: 'saved-q' }, 'Search saved posts'),
      h('input', { id: 'saved-q', class: 'search', type: 'search', placeholder: 'Search by person, collection, topic or note…', value: ui.libQuery, oninput: (e) => { ui.libQuery = e.target.value.trim(); clearTimeout(searchSaved.timer); searchSaved.timer = setTimeout(() => searchSaved().catch((err) => toast(err.message, { error: true })), 200); } })),
    sum.topics.length > 0 && h('div', { class: 'pills', style: null }, sum.topics.map((t) => h('button', { class: 'pill', 'aria-pressed': String(ui.libTopic === t.topic),
      onclick: () => { ui.libTopic = ui.libTopic === t.topic ? null : t.topic; searchSaved().catch((err) => toast(err.message, { error: true })); } }, `${t.topic} (${t.count})`))),
    h('div', { class: 'section' }, items.length ? h('div', { class: 'panel' }, h('ul', { class: 'rows wrap-actions', id: 'saved-list' }, items.map(savedRow)))
      : h('p', { class: 'empty' }, 'Nothing matches that search.')),
    h('div', { class: 'section' }, importButton, h('p', { class: 'hint' }, 'Importing a newer export only adds what is new. Your notes and sorting are kept.')),
  ];
}
async function searchSaved(rerender = true) {
  const q = new URLSearchParams();
  if (ui.libQuery) q.set('q', ui.libQuery);
  if (ui.libTopic) q.set('topic', ui.libTopic);
  ui.libItems = ui.libQuery || ui.libTopic ? await api('GET', `/api/library?${q}`) : null;
  if (rerender) render({ keepFocus: 'saved-q' });
}
function importFiles(e) {
  const input = e.target;
  act(null, async () => {
    let found = 0, added = 0;
    for (const file of input.files) {
      let json;
      try { json = JSON.parse(await file.text()); }
      catch { throw new Error(`“${file.name}” is not a JSON file. When you request the download from Instagram, choose JSON instead of HTML.`); }
      const r = await api('POST', `/api/library/import?kind=${/like/i.test(file.name) ? 'liked' : 'saved'}`, json);
      found += r.found; added += r.added;
    }
    input.value = '';
    if (!found) throw new Error('No Instagram posts were found in those files. Choose saved_posts, saved_collections or liked_posts from the unzipped download.');
    return added ? `${plural(added, 'new post')} imported.` : 'Nothing new: those posts were already here.';
  });
}

const SUGGESTIONS = ['What needs my attention today?', 'How is my portfolio doing?', 'What did I save about work?', 'Remind me to call the accountant tomorrow'];
function viewAsk() {
  const msgs = [...S.chat, ...(ui.pendingChat ?? [])];
  const on = S.agent.configured;
  const send = (text) => sendChat(text);
  return [
    h('h1', {}, 'Ask Cortex'),
    h('p', { class: 'lede' }, on ? 'Ask about your day, your money or your saved posts. It can also add tasks and tick off habits for you.'
      : 'The assistant is switched off. Everything else in Cortex works without it.'),
    !on && h('div', { class: 'section panel pad' }, h('h2', {}, 'To switch it on'),
      h('ol', { class: 'steps' },
        h('li', {}, h('span', {}, 'Get an API key from Anthropic (console.anthropic.com).')),
        h('li', {}, h('span', {}, 'Set it as ', h('strong', {}, 'ANTHROPIC_API_KEY'), ' where Cortex runs.')),
        h('li', {}, h('span', {}, 'Restart Cortex. This page will then accept questions.')))),
    on && msgs.length === 0 && h('div', { class: 'suggest' }, SUGGESTIONS.map((s) => h('button', { class: 'btn', onclick: () => send(s) }, s))),
    msgs.length > 0 && h('div', { class: 'chat-log', 'aria-live': 'polite' }, msgs.map((m) => h('div', { class: `msg ${m.role}` }, m.text,
      m.did?.length > 0 && h('span', { class: 'did' }, `Done: ${m.did.join(', ')}`)))),
    on && h('form', { class: 'capture', onsubmit: (e) => { e.preventDefault(); const v = e.currentTarget.message.value.trim(); if (v) send(v); } },
      h('label', { class: 'sr-only', for: 'ask-input' }, 'Your question'),
      h('input', { id: 'ask-input', type: 'text', name: 'message', placeholder: 'Ask anything…', autocomplete: 'off', disabled: !!ui.pendingChat, enterkeyhint: 'send' }),
      h('button', { class: 'btn primary', disabled: !!ui.pendingChat }, 'Send')),
    on && msgs.length > 0 && h('p', { class: 'hint' }, h('button', { class: 'btn quiet', onclick: (e) => act(e.currentTarget, () => api('POST', '/api/chat/reset', {}).then(() => 'Started a new conversation.')) }, 'Start a new conversation'),
      ' Cortex keeps what you asked it to remember.'),
  ];
}
const DID = { add_task: 'added a task', complete_task: 'completed a task', log_habit: 'updated a habit', add_journal_entry: 'wrote in your journal', update_library_item: 'sorted a saved post', remember: 'remembered that', forget: 'forgot that' };
async function sendChat(text) {
  ui.pendingChat = [{ role: 'user', text }, { role: 'assistant', text: 'Thinking…' }];
  render();
  try {
    const r = await api('POST', '/api/chat', { message: text });
    S = await api('GET', '/api/state');
    const did = [...new Set(r.tools.filter((t) => t.ok && DID[t.name]).map((t) => DID[t.name]))];
    const last = S.chat.at(-1);
    // A reply that was not saved (declined, or out of steps) still has to be shown.
    ui.pendingChat = last?.role === 'assistant' && last.text === r.reply ? null : [{ role: 'user', text }, { role: 'assistant', text: r.reply }];
    if (did.length) (ui.pendingChat?.at(-1) ?? last).did = did;
  } catch (e) { ui.pendingChat = null; toast(e.message, { error: true }); }
  render();
  ui.pendingChat = null;
  $('ask-input')?.focus();
}

const JOB = { 'refresh-quotes': 'Update prices', 'refresh-news': 'Fetch the news', 'morning-brief': 'Write the morning brief', 'weekly-review': 'Write the weekly review' };
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const schedule = (s) => (!s ? 'Only when you run it' : s.at ? `${s.weekday != null ? WEEKDAYS[s.weekday] : 'Every day'} at ${s.at}` : `Every ${s.everyMinutes} minutes`);
function viewSettings() {
  return [
    h('h1', {}, 'Settings'),
    h('p', { class: 'lede' }, 'What Cortex does on its own, and what it knows about you.'),
    S.mode === 'demo' && h('p', { class: 'notice' }, 'Cortex is in demo mode: prices and headlines are examples. Switch to live data in the configuration file (see the README).'),
    section('Runs automatically', null, h('div', { class: 'panel' }, h('ul', { class: 'rows' }, S.jobs.map((j) => h('li', {},
      h('div', { class: 'main' }, h('div', { class: 'title' }, JOB[j.name] ?? j.name), h('div', { class: 'sub' }, schedule(j.schedule))),
      h('button', { class: 'btn', onclick: (e) => act(e.currentTarget, async () => { const r = await api('POST', `/api/jobs/${j.name}/run`, {}); if (r.status === 'error') throw new Error(`${JOB[j.name] ?? j.name} failed: ${r.detail}`); return `${JOB[j.name] ?? j.name}: done.`; }) }, 'Run now')))))),
    section('What Cortex remembers about you', null, S.memories.length
      ? h('div', { class: 'panel' }, h('ul', { class: 'rows' }, S.memories.map((m) => h('li', {}, h('div', { class: 'main' }, m.text, h('div', { class: 'sub' }, `${m.kind[0].toUpperCase()}${m.kind.slice(1)}, noted ${ago(m.created_at)}`))))))
      : h('p', { class: 'empty' }, 'Nothing yet. Tell the assistant a goal or a preference and it will keep it for next time.')),
    section('Recent activity', null, S.runs.length ? h('div', { class: 'panel' }, h('ul', { class: 'rows' }, S.runs.map((r) => h('li', {},
      h('div', { class: 'main' }, h('div', {}, JOB[r.job] ?? r.job), h('div', { class: 'sub' }, when(r.started_at), r.status === 'error' && r.detail ? `: ${r.detail}` : '')),
      h('span', { class: `status ${r.status}` }, h('span', { class: 'dot', 'aria-hidden': 'true' }, r.status === 'ok' ? '✓' : r.status === 'error' ? '✕' : '…'), r.status === 'ok' ? 'Worked' : r.status === 'error' ? 'Failed' : 'Running')))))
      : h('p', { class: 'empty' }, 'Nothing has run yet.')),
  ];
}

// ---------- dialogs ----------
function wireDialog(dialog) {
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.closest('[data-close]')) dialog.close(); });
}
let editing = null;
function openHolding(x) {
  editing = x;
  const f = $('holding-form');
  f.reset();
  $('holding-error').hidden = true;
  $('holding-title').textContent = x ? `Edit ${x.name}` : 'Add a holding';
  $('holding-remove').hidden = !x;
  f.symbol.readOnly = !!x;
  if (x) {
    const raw = S.portfolio.holdings.find((y) => y.id === x.id);
    Object.assign(f.symbol, { value: raw.symbol }); f.name.value = raw.name; f.quantity.value = raw.quantity;
    f.currency.value = raw.currency; f.assetClass.value = raw.assetClass;
    f.costBasis.value = raw.costBasis ?? ''; f.keywords.value = raw.keywords ?? '';
  }
  $('holding-dialog').showModal();
}
$('holding-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget, btn = f.querySelector('.primary'), err = $('holding-error');
  btn.disabled = true;
  try {
    const saved = await api('POST', '/api/holdings', Object.fromEntries(new FormData(f)));
    $('holding-dialog').close(); await load(); toast(`${saved.name} saved.`);
  } catch (ex) { err.textContent = `${ex.message[0].toUpperCase()}${ex.message.slice(1)}.`.replace(/\.\.$/, '.'); err.hidden = false; }
  finally { btn.disabled = false; }
});
$('holding-remove').addEventListener('click', (e) => {
  const x = editing, b = e.currentTarget;
  if (b.dataset.armed !== String(x.id)) { b.dataset.armed = String(x.id); b.textContent = `Really remove ${x.name}?`; return; }
  delete b.dataset.armed; b.textContent = 'Remove holding';
  $('holding-dialog').close();
  act(null, () => api('DELETE', `/api/holdings/${x.id}`).then(() => `${x.name} removed.`));
});
$('holding-dialog').addEventListener('close', () => { const b = $('holding-remove'); delete b.dataset.armed; b.textContent = 'Remove holding'; });

let noting = null;
function openNote(it) { noting = it; $('note-text').value = it.note ?? ''; $('note-dialog').showModal(); }
$('note-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const it = noting, note = $('note-text').value.trim();
  $('note-dialog').close();
  act(null, async () => { await api('POST', `/api/library/${it.id}`, { note, status: it.status === 'new' && note ? 'keep' : it.status }); await searchSaved(false); return 'Note saved.'; });
});
wireDialog($('holding-dialog')); wireDialog($('note-dialog'));

// ---------- routing ----------
const VIEWS = { today: ['Today', viewToday], plan: ['Plan', viewPlan], money: ['Money', viewMoney], saved: ['Saved', viewSaved], ask: ['Ask', viewAsk], settings: ['Settings', viewSettings] };
const current = () => { const v = location.hash.replace(/^#\/?/, ''); return VIEWS[v] ? v : 'today'; };

function render({ keepFocus } = {}) {
  if (!S) return;
  const name = current(), [title, build] = VIEWS[name];
  document.title = `${title} – Cortex`;
  for (const a of document.querySelectorAll('.nav a[data-view]')) a.dataset.view === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  const focusId = keepFocus ?? (document.activeElement?.id || null);
  const sel = focusId && $(focusId)?.selectionStart;
  $('view').replaceChildren(...build().flat(3).filter((n) => n != null && n !== false));
  if (focusId && $(focusId)) { $(focusId).focus(); if (sel != null) try { $(focusId).setSelectionRange(sel, sel); } catch { /* not a text field */ } }
}
async function load() { S = await api('GET', '/api/state'); render(); }

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); $('view').focus({ preventScroll: true }); });
load().catch((e) => { $('view').replaceChildren(h('h1', {}, 'Cortex could not load'), h('p', { class: 'lede' }, `${e.message} Check that Cortex is still running, then reload this page.`)); });
// Quiet refresh, skipped while you are typing or a dialog is open so nothing is lost.
setInterval(() => {
  const typing = [...document.querySelectorAll('#view input:not([type=checkbox]), #view textarea')].some((el) => el.value);
  if (!document.hidden && !typing && !document.querySelector('dialog[open]') && !ui.pendingChat) load().catch(() => {});
}, 60_000);
