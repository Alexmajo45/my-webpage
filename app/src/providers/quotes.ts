// Price providers. A provider returns the latest close per symbol; history accumulates in our own DB.
// FX pairs are ordinary symbols named BASEQUOTE (e.g. EURUSD = how many USD one EUR buys).
import { addDays } from '../config.ts';

export interface Quote { symbol: string; day: string; close: number }
export interface QuoteProvider { name: string; latest(symbols: string[], today: string): Promise<Quote[]> }

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic synthetic series: the same symbol and day always give the same price. */
export function demoSeries(symbol: string, endDay: string, days: number): Quote[] {
  const isFx = /^[A-Z]{6}$/.test(symbol);
  const base = isFx ? 0.8 + (hash(symbol) % 60) / 100 : 20 + (hash(symbol) % 400);
  const vol = isFx ? 0.003 : 0.012;
  const out: Quote[] = [];
  let price = base;
  // Walk forward from a fixed epoch so that extending the window never rewrites history.
  const start = '2026-01-01';
  for (let day = start; day <= endDay; day = addDays(day, 1)) {
    const r = (hash(`${symbol}|${day}`) % 20001) / 10000 - 1; // uniform in [-1, 1]
    price = Math.max(0.01, price * (1 + r * vol + 0.0002));
    out.push({ symbol, day, close: Math.round(price * 10000) / 10000 });
  }
  return out.slice(-days);
}

export const demoProvider: QuoteProvider = {
  name: 'demo',
  async latest(symbols, today) { return symbols.flatMap((s) => demoSeries(s, today, 1)); },
};

/** Parses Stooq's light CSV: Symbol,Date,Time,Open,High,Low,Close,Volume. Unknown symbols come back as N/D. */
export function parseStooqCsv(csv: string): Quote[] {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  if (!header) return [];
  const cols = header.split(',').map((c) => c.trim().toLowerCase());
  const iS = cols.indexOf('symbol'), iD = cols.indexOf('date'), iC = cols.indexOf('close');
  if (iS < 0 || iD < 0 || iC < 0) return [];
  const out: Quote[] = [];
  for (const row of rows) {
    const f = row.split(',');
    const close = Number(f[iC]);
    const day = f[iD] ?? '';
    if (!Number.isFinite(close) || close <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    out.push({ symbol: (f[iS] ?? '').toUpperCase(), day, close });
  }
  return out;
}

export const stooqProvider: QuoteProvider = {
  name: 'stooq',
  async latest(symbols) {
    const out: Quote[] = [];
    for (const symbol of symbols) {
      const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`stooq ${symbol}: HTTP ${res.status}`);
      // Stooq echoes its own symbol casing; we key on the symbol we asked for.
      for (const q of parseStooqCsv(await res.text())) out.push({ ...q, symbol });
    }
    return out;
  },
};

export function providerFor(name: string): QuoteProvider {
  if (name === 'demo') return demoProvider;
  if (name === 'stooq') return stooqProvider;
  throw new Error(`Unknown quote provider: ${name}`);
}
