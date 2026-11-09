// Automations: named jobs, a run log, and a small in-process scheduler.
// The same jobs can be fired from outside (CLI, POST /api/jobs/:name/run) by cron, n8n or a hosted agent.
import { generateBrief, type Composer } from './brief.ts';
import { localParts, type JobConfig } from './config.ts';
import { all, get, now, run, type DB } from './db.ts';
import { refreshNews } from './news.ts';
import { notify } from './notify.ts';
import { refreshQuotes } from './portfolio.ts';
import type { Ctx } from './tools.ts';

export interface JobCtx extends Ctx { compose?: Composer }

export const JOBS: Record<string, { description: string; run(ctx: JobCtx): Promise<string> }> = {
  'refresh-quotes': {
    description: 'Fetch the latest price for every holding and the FX pairs they need.',
    run: (ctx) => refreshQuotes(ctx.db, ctx.cfg, localParts(ctx.cfg.timezone).day),
  },
  'refresh-news': {
    description: 'Pull configured feeds and tag items that mention a holding.',
    run: (ctx) => refreshNews(ctx.db, ctx.cfg),
  },
  'morning-brief': {
    description: 'Refresh data, write the morning brief, verify its figures, and deliver it.',
    run: (ctx) => briefJob(ctx, 'morning'),
  },
  'weekly-review': {
    description: 'Weekly review: the week ahead, habit record, and saved posts that still need triage.',
    run: (ctx) => briefJob(ctx, 'weekly'),
  },
};

async function briefJob(ctx: JobCtx, kind: 'morning' | 'weekly'): Promise<string> {
  const notes: string[] = [];
  for (const dep of ['refresh-quotes', 'refresh-news']) {
    try { await JOBS[dep]!.run(ctx); } catch (e) { notes.push(`${dep} failed: ${(e as Error).message}`); }
  }
  const brief = await generateBrief(ctx.db, ctx.cfg, kind, ctx.compose);
  const sent = await notify(ctx.cfg, kind === 'weekly' ? 'Weekly review' : 'Morning brief', brief.body);
  return [brief.note, ...notes, ...sent].join('; ');
}

const running = new Set<string>();

export async function runJob(ctx: JobCtx, name: string): Promise<{ status: 'ok' | 'error' | 'skipped'; detail: string }> {
  const job = JOBS[name];
  if (!job) throw new Error(`Unknown job "${name}". Known jobs: ${Object.keys(JOBS).join(', ')}`);
  if (running.has(name)) return { status: 'skipped', detail: 'already running' };
  running.add(name);
  const id = run(ctx.db, "INSERT INTO runs (job, local_day, started_at, status) VALUES (?,?,?, 'running')", name, localParts(ctx.cfg.timezone).day, now());
  try {
    const detail = await job.run(ctx);
    ctx.db.prepare("UPDATE runs SET status = 'ok', finished_at = ?, detail = ? WHERE id = ?").run(now(), detail.slice(0, 1000), id);
    return { status: 'ok', detail };
  } catch (e) {
    const detail = (e as Error).message;
    ctx.db.prepare("UPDATE runs SET status = 'error', finished_at = ?, detail = ? WHERE id = ?").run(now(), detail.slice(0, 1000), id);
    return { status: 'error', detail };
  } finally { running.delete(name); }
}

export interface LastRun { job: string; local_day: string; started_at: string }

/** Pure scheduling decision, kept separate from the timer so that it can be tested. */
export function dueJobs(jobs: JobConfig[], last: LastRun[], at: { day: string; hhmm: string; weekday: number }, nowMs: number): string[] {
  return jobs.filter((j) => {
    const prev = last.find((r) => r.job === j.name);
    if (j.at) {
      if (j.weekday !== undefined && j.weekday !== at.weekday) return false;
      // ">=" rather than "===": a machine that was asleep at 07:30 still gets its brief when it wakes.
      return at.hhmm >= j.at && prev?.local_day !== at.day;
    }
    if (j.everyMinutes) return !prev || nowMs - Date.parse(prev.started_at) >= j.everyMinutes * 60_000;
    return false;
  }).map((j) => j.name);
}

export function lastRuns(db: DB): LastRun[] {
  return all<LastRun>(db, 'SELECT job, local_day, MAX(started_at) AS started_at FROM runs GROUP BY job');
}
export function recentRuns(db: DB, limit = 12) {
  return all<{ id: number; job: string; started_at: string; finished_at: string | null; status: string; detail: string | null }>(db,
    'SELECT id, job, started_at, finished_at, status, detail FROM runs ORDER BY id DESC LIMIT ?', limit);
}

export function startScheduler(ctx: JobCtx, log: (line: string) => void = console.log): NodeJS.Timeout {
  // A run left "running" by a crash would otherwise look alive for ever.
  ctx.db.exec("UPDATE runs SET status = 'error', detail = 'interrupted by restart' WHERE status = 'running'");
  const tick = async () => {
    for (const name of dueJobs(ctx.cfg.jobs, lastRuns(ctx.db), localParts(ctx.cfg.timezone), Date.now())) {
      if (!JOBS[name]) { log(`[scheduler] unknown job in config: ${name}`); continue; }
      const r = await runJob(ctx, name);
      log(`[scheduler] ${name}: ${r.status} - ${r.detail}`);
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 30_000);
  timer.unref();
  return timer;
}

export function hasRunToday(db: DB, job: string, day: string): boolean {
  return !!get(db, 'SELECT 1 AS x FROM runs WHERE job = ? AND local_day = ?', job, day);
}
