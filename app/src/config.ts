// Configuration: one JSON file plus a handful of environment variables for secrets.
// Secrets never live in the JSON file; see app/.env.example.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface JobConfig {
  name: string;
  /** Local time "HH:MM" in config.timezone. */
  at?: string;
  /** 0 = Sunday ... 6 = Saturday. Only with `at`. */
  weekday?: number;
  everyMinutes?: number;
}

export interface Config {
  /** "demo" makes no outbound data calls and uses synthetic prices and sample news. */
  mode: 'demo' | 'live';
  owner: string;
  timezone: string;
  baseCurrency: string;
  host: string;
  port: number;
  quotes: { provider: 'demo' | 'stooq' };
  feeds: { name: string; url: string }[];
  jobs: JobConfig[];
  agent: { model: string; effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; maxToolRounds: number };
  mcp: { enabled: boolean; allowWrite: boolean };
  notify: { ntfyUrl?: string; webhookUrl?: string; telegramChatId?: string };
}

export const DEFAULT_CONFIG: Config = {
  mode: 'demo',
  owner: 'there',
  timezone: 'Europe/Rome',
  baseCurrency: 'EUR',
  host: '127.0.0.1',
  port: 4317,
  quotes: { provider: 'demo' },
  feeds: [],
  jobs: [
    { name: 'refresh-quotes', everyMinutes: 30 },
    { name: 'refresh-news', everyMinutes: 30 },
    { name: 'morning-brief', at: '07:30' },
    { name: 'weekly-review', at: '18:00', weekday: 0 },
  ],
  agent: { model: 'claude-opus-5-5', effort: 'medium', maxToolRounds: 8 },
  mcp: { enabled: true, allowWrite: false },
  notify: {},
};

export function loadConfig(path = process.env.CORTEX_CONFIG): Config {
  const file = path ?? resolve(APP_ROOT, 'config/cortex.json');
  if (!existsSync(file)) {
    if (path) throw new Error(`Config file not found: ${file}`);
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>;
  const cfg: Config = {
    ...structuredClone(DEFAULT_CONFIG),
    ...raw,
    quotes: { ...DEFAULT_CONFIG.quotes, ...raw.quotes },
    agent: { ...DEFAULT_CONFIG.agent, ...raw.agent },
    mcp: { ...DEFAULT_CONFIG.mcp, ...raw.mcp },
    notify: { ...DEFAULT_CONFIG.notify, ...raw.notify },
  };
  if (cfg.mode !== 'demo' && cfg.mode !== 'live') throw new Error('config.mode must be "demo" or "live"');
  if (!/^[A-Z]{3}$/.test(cfg.baseCurrency)) throw new Error('config.baseCurrency must be a 3-letter code');
  return cfg;
}

export function dataDir(): string {
  return process.env.CORTEX_DATA ?? resolve(APP_ROOT, 'data');
}

/** Calendar day (YYYY-MM-DD) and clock parts in the configured timezone. */
export function localParts(tz: string, at = new Date()): { day: string; hhmm: string; weekday: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday!);
  return { day: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, weekday };
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
