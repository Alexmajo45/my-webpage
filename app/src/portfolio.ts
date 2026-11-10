// Holdings, prices and valuation. Read-only by design: Cortex tracks investments, it never trades.
// Amounts are floats, which is adequate for tracking but not for bookkeeping.
import { addDays, type Config } from './config.ts';
import { InputError, all, get, run, tx, type DB } from './db.ts';
import { demoSeries, providerFor } from './providers/quotes.ts';

export const ASSET_CLASSES = ['equity', 'etf', 'bond', 'crypto', 'cash', 'other'] as const;

export interface Holding { id: number; symbol: string; name: string; quantity: number; cost_basis: number | null; currency: string; asset_class: string; keywords: string }
export interface HoldingView {
  id: number; symbol: string; name: string; quantity: number; currency: string; assetClass: string;
  costBasis: number | null; keywords: string;
  price: number | null; priceDay: string | null; dayChangePct: number | null;
  valueBase: number | null; dayChangeBase: number | null; pnlBase: number | null; pnlPct: number | null;
  spark: { day: string; close: number }[];
}
export interface PortfolioView {
  baseCurrency: string; asOf: string | null; totalValue: number; dayChange: number; dayChangePct: number | null;
  totalPnl: number | null; allocation: { assetClass: string; value: number; pct: number }[];
  holdings: HoldingView[]; warnings: string[];
}

export function upsertHolding(db: DB, input: Record<string, unknown>): Holding {
  const symbol = String(input.symbol ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) throw new InputError('The ticker symbol can be up to 20 letters, digits or the characters . ^ = -');
  const name = String(input.name ?? '').trim().slice(0, 120) || symbol;
  const quantity = Number(input.quantity ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0) throw new InputError('The quantity you own must be zero or more');
  const cost = input.costBasis == null || input.costBasis === '' ? null : Number(input.costBasis);
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new InputError('The price you paid must be zero or more');
  const currency = String(input.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new InputError('The currency must be a 3-letter code such as EUR or USD');
  const assetClass = String(input.assetClass ?? 'equity');
  if (!(ASSET_CLASSES as readonly string[]).includes(assetClass)) throw new InputError(`assetClass must be one of ${ASSET_CLASSES.join(', ')}`);
  const keywords = String(input.keywords ?? '').slice(0, 300);
  db.prepare(`INSERT INTO holdings (symbol, name, quantity, cost_basis, currency, asset_class, keywords) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET name = excluded.name, quantity = excluded.quantity, cost_basis = excluded.cost_basis,
      currency = excluded.currency, asset_class = excluded.asset_class, keywords = excluded.keywords`)
    .run(symbol, name, quantity, cost, currency, assetClass, keywords);
  return get<Holding>(db, 'SELECT * FROM holdings WHERE symbol = ?', symbol)!;
}
export function removeHolding(db: DB, id: number): void {
  db.prepare('DELETE FROM holdings WHERE id = ?').run(id);
}
export function listHoldings(db: DB): Holding[] {
  return all<Holding>(db, 'SELECT * FROM holdings ORDER BY quantity = 0, symbol');
}

export function fxSymbol(base: string, currency: string): string { return `${base}${currency}`; }

export function savePrices(db: DB, quotes: { symbol: string; day: string; close: number }[], source: string): void {
  const stmt = db.prepare('INSERT INTO prices (symbol, day, close, source) VALUES (?,?,?,?) ON CONFLICT(symbol, day) DO UPDATE SET close = excluded.close, source = excluded.source');
  tx(db, () => { for (const q of quotes) stmt.run(q.symbol, q.day, q.close, source); });
}

export async function refreshQuotes(db: DB, cfg: Config, today: string): Promise<string> {
  const holdings = listHoldings(db);
  const symbols = [...new Set([
    ...holdings.map((h) => h.symbol),
    ...holdings.filter((h) => h.currency !== cfg.baseCurrency).map((h) => fxSymbol(cfg.baseCurrency, h.currency)),
  ])];
  if (!symbols.length) return 'no holdings';
  const providerName = cfg.mode === 'demo' ? 'demo' : cfg.quotes.provider;
  if (providerName === 'demo') {
    // Backfill so that sparklines and day changes are meaningful on first run.
    savePrices(db, symbols.flatMap((s) => demoSeries(s, today, 30)), 'demo');
    return `${symbols.length} symbols (synthetic demo prices)`;
  }
  const quotes = await providerFor(providerName).latest(symbols, today);
  savePrices(db, quotes, providerName);
  const missing = symbols.filter((s) => !quotes.some((q) => q.symbol === s));
  return `${quotes.length}/${symbols.length} symbols from ${providerName}${missing.length ? `; no data for ${missing.join(', ')}` : ''}`;
}

function series(db: DB, symbol: string, days = 30) {
  return all<{ day: string; close: number }>(db, 'SELECT day, close FROM prices WHERE symbol = ? ORDER BY day DESC LIMIT ?', symbol, days).reverse();
}

export function portfolioView(db: DB, cfg: Config): PortfolioView {
  const base = cfg.baseCurrency;
  const warnings: string[] = [];
  const fxCache = new Map<string, number | null>();
  const fx = (ccy: string): number | null => {
    if (ccy === base) return 1;
    if (!fxCache.has(ccy)) fxCache.set(ccy, series(db, fxSymbol(base, ccy), 1)[0]?.close ?? null);
    return fxCache.get(ccy)!;
  };
  let asOf: string | null = null;
  const holdings: HoldingView[] = listHoldings(db).map((h) => {
    const spark = series(db, h.symbol);
    const last = spark.at(-1), prev = spark.at(-2);
    const rate = fx(h.currency);
    if (last && (!asOf || last.day > asOf)) asOf = last.day;
    if (!last) warnings.push(`No price yet for ${h.symbol}.`);
    else if (rate === null && h.quantity > 0) warnings.push(`No ${base}/${h.currency} rate, so ${h.symbol} is excluded from totals.`);
    const toBase = (amount: number) => (rate ? amount / rate : null);
    const valueBase = last ? toBase(last.close * h.quantity) : null;
    const dayChangeBase = last && prev ? toBase((last.close - prev.close) * h.quantity) : null;
    const pnlBase = last && h.cost_basis != null ? toBase((last.close - h.cost_basis) * h.quantity) : null;
    return {
      id: h.id, symbol: h.symbol, name: h.name, quantity: h.quantity, currency: h.currency, assetClass: h.asset_class,
      costBasis: h.cost_basis, keywords: h.keywords,
      price: last?.close ?? null, priceDay: last?.day ?? null,
      dayChangePct: last && prev ? ((last.close - prev.close) / prev.close) * 100 : null,
      valueBase, dayChangeBase, pnlBase,
      pnlPct: last && h.cost_basis ? ((last.close - h.cost_basis) / h.cost_basis) * 100 : null,
      spark,
    };
  });
  const owned = holdings.filter((h) => h.quantity > 0 && h.valueBase !== null);
  const totalValue = owned.reduce((s, h) => s + h.valueBase!, 0);
  const dayChange = owned.reduce((s, h) => s + (h.dayChangeBase ?? 0), 0);
  const prevValue = totalValue - dayChange;
  const withCost = owned.filter((h) => h.pnlBase !== null);
  const byClass = new Map<string, number>();
  for (const h of owned) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + h.valueBase!);
  // Fixed order, so a class keeps its colour whatever else is in the portfolio.
  const allocation = ASSET_CLASSES.filter((c) => byClass.has(c)).map((c) => ({
    assetClass: c, value: byClass.get(c)!, pct: totalValue ? (byClass.get(c)! / totalValue) * 100 : 0,
  }));
  return {
    baseCurrency: base, asOf, totalValue, dayChange,
    dayChangePct: prevValue > 0 ? (dayChange / prevValue) * 100 : null,
    totalPnl: withCost.length ? withCost.reduce((s, h) => s + h.pnlBase!, 0) : null,
    allocation, holdings, warnings,
  };
}

export function seedDemo(db: DB, today: string): void {
  if (get(db, 'SELECT 1 AS x FROM holdings LIMIT 1')) return;
  // Cost bases are set relative to the synthetic price, so the demo shows plausible gains and losses.
  const cost = (symbol: string, factor: number) => Math.round(demoSeries(symbol, today, 1)[0]!.close * factor * 100) / 100;
  const rows: Record<string, unknown>[] = [
    { symbol: 'VWCE.DE', name: 'Vanguard FTSE All-World', quantity: 60, costBasis: cost('VWCE.DE', 0.82), currency: 'EUR', assetClass: 'etf', keywords: 'global equities' },
    { symbol: 'ASML.NL', name: 'ASML Holding', quantity: 12, costBasis: cost('ASML.NL', 0.9), currency: 'EUR', assetClass: 'equity', keywords: 'semiconductor, chip' },
    { symbol: 'MSFT.US', name: 'Microsoft', quantity: 40, costBasis: cost('MSFT.US', 1.07), currency: 'USD', assetClass: 'equity', keywords: 'Azure, OpenAI' },
    { symbol: 'BTP10.IT', name: 'BTP 10Y', quantity: 20, costBasis: cost('BTP10.IT', 0.98), currency: 'EUR', assetClass: 'bond', keywords: 'BTP, spread, Italian bonds' },
    { symbol: 'BTC.V', name: 'Bitcoin', quantity: 8, costBasis: cost('BTC.V', 0.7), currency: 'USD', assetClass: 'crypto', keywords: 'bitcoin, crypto' },
    { symbol: 'NVDA.US', name: 'Nvidia', quantity: 0, currency: 'USD', assetClass: 'equity', keywords: 'GPU' },
  ];
  for (const r of rows) upsertHolding(db, r);
  run(db, 'INSERT INTO habits (name, created_at) VALUES (?, ?)', 'Move 30 minutes', today);
  run(db, 'INSERT INTO habits (name, created_at) VALUES (?, ?)', 'Read 20 pages', today);
  for (const d of [1, 2, 3, 5]) db.prepare('INSERT INTO habit_log (habit_id, day) VALUES (1, ?)').run(addDays(today, -d));
  for (const d of [1, 2]) db.prepare('INSERT INTO habit_log (habit_id, day) VALUES (2, ?)').run(addDays(today, -d));
}
