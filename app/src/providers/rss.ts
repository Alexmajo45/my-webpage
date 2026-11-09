// Minimal RSS 2.0 / Atom reader. Feed content is untrusted: we keep plain text only.
export interface FeedItem { title: string; url: string; summary: string; publishedAt: string | null }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function toPlainText(raw: string): string {
  const cdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Decode first so that escaped markup (&lt;p&gt;) is stripped too, then decode what remains.
  return decodeEntities(decodeEntities(cdata).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? m[1]! : null;
}

function isoDate(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(toPlainText(s));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function safeHttpUrl(s: string): string | null {
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const block = m[2]!;
    const title = toPlainText(tag(block, 'title') ?? '');
    let link = toPlainText(tag(block, 'link') ?? '');
    if (!link) {
      const alt = /<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i.exec(block)
        ?? /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(block);
      link = alt ? decodeEntities(alt[1]!) : '';
    }
    const url = safeHttpUrl(link);
    if (!title || !url) continue;
    const summary = toPlainText(tag(block, 'description') ?? tag(block, 'summary') ?? tag(block, 'content') ?? '');
    items.push({
      title: title.slice(0, 300), url, summary: summary.slice(0, 600),
      publishedAt: isoDate(tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated')),
    });
  }
  return items;
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 5_000_000) throw new Error('feed too large');
  return parseFeed(text);
}
