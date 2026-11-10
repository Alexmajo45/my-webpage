// Personal-life domain: tasks, habits, journal and the agent's long-term memory.
import { addDays } from './config.ts';
import { InputError, all, get, now, run, type DB } from './db.ts';

export interface Task { id: number; title: string; notes: string | null; area: string; due: string | null; status: string; source: string; created_at: string; done_at: string | null }

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function text(v: unknown, field: string, max = 500): string {
  if (typeof v !== 'string' || !v.trim()) throw new InputError(`${field} is required`);
  return v.trim().slice(0, max);
}
function optDay(v: unknown, field: string): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !DAY.test(v)) throw new InputError(`${field} must be YYYY-MM-DD`);
  return v;
}

export function addTask(db: DB, input: { title: unknown; notes?: unknown; area?: unknown; due?: unknown; source?: string }): Task {
  const id = run(db, 'INSERT INTO tasks (title, notes, area, due, source, created_at) VALUES (?,?,?,?,?,?)',
    text(input.title, 'title', 300), typeof input.notes === 'string' ? input.notes.slice(0, 2000) : null,
    typeof input.area === 'string' && input.area.trim() ? input.area.trim().slice(0, 40) : 'personal',
    optDay(input.due, 'due'), input.source ?? 'manual', now());
  return get<Task>(db, 'SELECT * FROM tasks WHERE id = ?', id)!;
}
export function setTaskDone(db: DB, id: number, done: boolean): Task {
  db.prepare('UPDATE tasks SET status = ?, done_at = ? WHERE id = ?').run(done ? 'done' : 'open', done ? now() : null, id);
  const t = get<Task>(db, 'SELECT * FROM tasks WHERE id = ?', id);
  if (!t) throw new InputError(`No task with id ${id}`);
  return t;
}
export function listTasks(db: DB, status: 'open' | 'done' | 'all' = 'open'): Task[] {
  const where = status === 'all' ? '' : 'WHERE status = ?';
  return all<Task>(db, `SELECT * FROM tasks ${where} ORDER BY status DESC, due IS NULL, due, id DESC LIMIT 200`,
    ...(status === 'all' ? [] : [status]));
}

export interface HabitView { id: number; name: string; days: { day: string; done: boolean }[]; streak: number }

export function addHabit(db: DB, name: unknown): number {
  return run(db, 'INSERT INTO habits (name, created_at) VALUES (?, ?)', text(name, 'name', 80), now());
}
export function toggleHabit(db: DB, habitId: number, day: string, done?: boolean): boolean {
  if (!DAY.test(day)) throw new InputError('day must be YYYY-MM-DD');
  if (!get(db, 'SELECT id FROM habits WHERE id = ?', habitId)) throw new InputError(`No habit with id ${habitId}`);
  const exists = !!get(db, 'SELECT 1 AS x FROM habit_log WHERE habit_id = ? AND day = ?', habitId, day);
  const target = done ?? !exists;
  if (target && !exists) db.prepare('INSERT INTO habit_log (habit_id, day) VALUES (?, ?)').run(habitId, day);
  if (!target && exists) db.prepare('DELETE FROM habit_log WHERE habit_id = ? AND day = ?').run(habitId, day);
  return target;
}
export function habitViews(db: DB, today: string, window = 7): HabitView[] {
  return all<{ id: number; name: string }>(db, 'SELECT id, name FROM habits WHERE archived = 0 ORDER BY id').map((h) => {
    const done = new Set(all<{ day: string }>(db, 'SELECT day FROM habit_log WHERE habit_id = ? AND day >= ?', h.id, addDays(today, -400)).map((r) => r.day));
    const days = Array.from({ length: window }, (_, i) => { const day = addDays(today, i - window + 1); return { day, done: done.has(day) }; });
    // A streak survives until the end of today: an unticked today does not break it.
    let streak = 0;
    for (let d = done.has(today) ? today : addDays(today, -1); done.has(d); d = addDays(d, -1)) streak++;
    return { ...h, days, streak };
  });
}

export function addJournal(db: DB, day: string, entry: unknown, mood?: unknown): number {
  const m = mood == null || mood === '' ? null : Number(mood);
  if (m !== null && (!Number.isInteger(m) || m < 1 || m > 5)) throw new InputError('mood must be an integer 1-5');
  return run(db, 'INSERT INTO journal (day, text, mood, created_at) VALUES (?,?,?,?)', day, text(entry, 'text', 5000), m, now());
}
export function recentJournal(db: DB, limit = 5) {
  return all<{ id: number; day: string; text: string; mood: number | null }>(db, 'SELECT id, day, text, mood FROM journal ORDER BY id DESC LIMIT ?', limit);
}

export const MEMORY_KINDS = ['fact', 'preference', 'goal', 'decision'] as const;
export interface Memory { id: number; kind: string; text: string; source: string; created_at: string }

export function remember(db: DB, kind: unknown, body: unknown, source = 'agent'): Memory {
  if (typeof kind !== 'string' || !(MEMORY_KINDS as readonly string[]).includes(kind)) throw new InputError(`kind must be one of ${MEMORY_KINDS.join(', ')}`);
  const id = run(db, 'INSERT INTO memories (kind, text, source, created_at) VALUES (?,?,?,?)', kind, text(body, 'text', 1000), source, now());
  return get<Memory>(db, 'SELECT id, kind, text, source, created_at FROM memories WHERE id = ?', id)!;
}
export function forget(db: DB, id: number): void {
  db.prepare('UPDATE memories SET active = 0 WHERE id = ?').run(id);
}
export function memories(db: DB, query?: string, limit = 50): Memory[] {
  const q = query?.trim();
  return q
    ? all<Memory>(db, "SELECT id, kind, text, source, created_at FROM memories WHERE active = 1 AND text LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ?", like(q), limit)
    : all<Memory>(db, 'SELECT id, kind, text, source, created_at FROM memories WHERE active = 1 ORDER BY id DESC LIMIT ?', limit);
}

export function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
