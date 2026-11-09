// Command line entry point, for cron and for one-off imports.
//   npm run cli -- jobs
//   npm run cli -- run morning-brief
//   npm run cli -- import-instagram ~/Downloads/instagram-export
import { agentConfigured, composerFor } from './agent.ts';
import { dataDir, loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { JOBS, runJob } from './jobs.ts';
import { importInstagramPath, librarySummary } from './library.ts';

const [command, arg] = process.argv.slice(2);
const cfg = loadConfig();
const db = openDb(dataDir());
const ctx = { db, cfg, compose: agentConfigured() ? composerFor(cfg.agent.model) : undefined };

switch (command) {
  case 'jobs':
    for (const [name, j] of Object.entries(JOBS)) console.log(`${name.padEnd(16)} ${j.description}`);
    break;
  case 'run': {
    if (!arg || !JOBS[arg]) { console.error(`Usage: run <${Object.keys(JOBS).join('|')}>`); process.exit(2); }
    const r = await runJob(ctx, arg);
    console.log(`${arg}: ${r.status} - ${r.detail}`);
    if (r.status === 'error') process.exit(1);
    break;
  }
  case 'import-instagram': {
    if (!arg) { console.error('Usage: import-instagram <path to unzipped export, or to one JSON file>'); process.exit(2); }
    const r = importInstagramPath(db, arg);
    console.log(`Read ${r.files.length} file(s): ${r.found} posts found, ${r.added} added, ${r.updated} updated.`);
    if (!r.files.length) console.log('No saved_*.json or liked_*.json files found. Request the export in JSON format, not HTML.');
    console.log('Library now holds:', JSON.stringify(librarySummary(db).byStatus));
    break;
  }
  default:
    console.error('Commands: jobs | run <job> | import-instagram <path>');
    process.exit(2);
}
