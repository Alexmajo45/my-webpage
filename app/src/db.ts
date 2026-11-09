// SQLite via Node's built-in driver: one file, no server, trivially backed up.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, notes TEXT, area TEXT NOT NULL DEFAULT 'personal',
  due TEXT, status TEXT NOT NULL DEFAULT 'open', source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL, done_at TEXT
);
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS habit_log (
  habit_id INTEGER NOT NULL REFERENCES habits(id), day TEXT NOT NULL, PRIMARY KEY (habit_id, day)
);
CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, text TEXT NOT NULL, mood INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY, symbol TEXT NOT NULL UNIQUE, name TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0,
  cost_basis REAL, currency TEXT NOT NULL, asset_class TEXT NOT NULL DEFAULT 'equity', keywords TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS prices (
  symbol TEXT NOT NULL, day TEXT NOT NULL, close REAL NOT NULL, source TEXT NOT NULL, PRIMARY KEY (symbol, day)
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY, feed TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE, summary TEXT,
  published_at TEXT, fetched_at TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS library (
  id INTEGER PRIMARY KEY, source TEXT NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL, author TEXT, collection TEXT,
  saved_at TEXT, note TEXT, topics TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL, UNIQUE (source, url)
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, text TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'agent',
  created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS briefs (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, generator TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, job TEXT NOT NULL, local_day TEXT NOT NULL, started_at TEXT NOT NULL,
  finished_at TEXT, status TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY, conversation INTEGER NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prices_symbol ON prices(symbol, day);
CREATE INDEX IF NOT EXISTS idx_runs_job ON runs(job, started_at);
`;

export function openDb(dir: string | ':memory:'): DB {
  let db: DB;
  if (dir === ':memory:') db = new DatabaseSync(':memory:');
  else {
    mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(join(dir, 'cortex.db'));
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Thrown for bad caller input; the HTTP layer maps it to a 400. */
export class InputError extends Error {}

export const now = (): string => new Date().toISOString();

export function all<T = Record<string, unknown>>(db: DB, sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function get<T = Record<string, unknown>>(db: DB, sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
export function run(db: DB, sql: string, ...params: (string | number | null)[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
