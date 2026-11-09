# 4. Automations

An assistant that waits to be asked is a search box. What makes this feel like a chief of staff is that it does things on a schedule and tells you. Automations exist at three levels.

## Level 1: inside the product

Defined in `app/src/jobs.ts`, scheduled from `config/cortex.json`, logged in the `runs` table and visible on the dashboard, where each can also be run by hand.

| Job | Default schedule | What it does |
|---|---|---|
| `refresh-quotes` | Every 30 minutes | Fetches the latest price for each holding and the currency pairs needed to value it |
| `refresh-news` | Every 30 minutes | Pulls the configured feeds and tags every item that mentions a holding |
| `morning-brief` | Daily 07:30 | Refreshes data, writes the brief, verifies its figures, delivers it |
| `weekly-review` | Sunday 18:00 | The week ahead, the habit record, and the oldest saved posts still waiting for triage |

Design choices that matter in practice:

- **Catch-up.** A daily job runs at the first opportunity after its time, once per local day. A laptop that was asleep at 07:30 still produces the brief when it wakes.
- **Degrade, do not fail.** If the model is unavailable or its draft fails verification, the brief is produced from the deterministic template and the run log says why.
- **Timezone-aware.** Schedules are in the configured zone (default Europe/Rome), not the server's.
- **Idempotent ingest.** Re-running any job never duplicates data.

## Level 2: triggered from outside

Every job can be fired without the built-in scheduler, which is what you want once the dashboard runs on a server or you prefer a proper orchestrator.

| Trigger | How |
|---|---|
| cron or systemd timer | `npm run cli -- run morning-brief` |
| n8n, Zapier, Make, a phone shortcut | `POST /api/jobs/morning-brief/run` with the bearer token |
| A hosted agent on a schedule | The same endpoint; see document 5 |

Inbound capture uses the same route in reverse: `POST /api/inbox` with `{"text": "..."}` creates a task from anything that can send JSON, such as an iOS Shortcut ("add to Cortex"), an email rule or a messaging bot.

## Level 3: on the repository

These automate the build plane.

| Automation | Where | What it does |
|---|---|---|
| Continuous integration | `.github/workflows/ci.yml` | Type-check and tests on every push and pull request |
| Session memory load | `.claude/settings.json` hook | Prints project state into the Master's context at session start |
| `/plan` | `.claude/commands/` | Task Master decomposes an approved spec into the backlog |
| `/spec-review`, `/goldfish-review` | `.claude/commands/` | The two review gates |
| `/handoff` | `.claude/commands/` | Writes the session into `memory/` |

Planned, not yet built: running the diff gate automatically on every pull request through the Claude Code GitHub Action. It needs an API key stored as a repository secret, so it is a decision for you and not something to switch on silently.

## The Instagram action

**What you asked for:** scan everything you have liked or saved on Instagram, because you have mapped a lot of useful material there.

**The constraint:** Instagram offers no API that returns a personal account's saved or liked posts. The only ways to read them programmatically are to automate a logged-in browser session or to use unofficial private-API libraries. Both breach Instagram's terms and regularly get accounts challenged or locked. For an account you value, that is the wrong trade.

**The route taken:** Instagram's own data export. In the app: Accounts Centre, Your information and permissions, Download your information, choose JSON, and select saved and liked content. The export arrives as a zip. Cortex imports it from the dashboard (Library, Import) or from the shell:

```bash
npm run cli -- import-instagram ~/Downloads/instagram-yourname-2026-11-09
```

The importer reads `saved_posts.json`, `saved_collections.json` and `liked_posts.json`, repairs the text-encoding fault Meta's exports are known for, deduplicates, and keeps your triage if you re-import later. Each post becomes a Library item with its link, author, date, collection and suggested topics. From there you can search, annotate, archive, or turn a post into a task; the agent can search and triage the Library on your behalf; and the weekly review resurfaces the oldest untriaged saves so the pile stops growing unseen.

**The limitation, stated plainly:** the export contains the link, the author and the date. It does not contain the caption, the video or what is said in it. Today, topic suggestions therefore rely on your collection names and the author's handle, which is useful if you used collections and thin if you did not. Extracting the actual substance of each post is the enrichment step, and it is a real decision with three options.

| Option | How it works | Trade-off |
|---|---|---|
| A. Assisted pass in your own browser | An agent using a browser extension, in your logged-in session, opens each saved post at human pace and records the caption | Compliant in spirit (it is you, browsing your own saves), slow, needs you present |
| B. Meta oEmbed API | Official endpoint returning author and caption for a public post URL | Requires registering a Meta developer app; public posts only |
| C. Manual, guided by the weekly review | You add a one-line note to five posts a week | No tooling, and the note records why it mattered to you, which no scraper can |

The recommendation is C immediately, because it works today, with A as the one-off backfill for the existing pile. This is milestone M3 in the roadmap.

**Keeping it current:** the export is a snapshot. The practical rhythm is to request a new export monthly; re-importing is safe and only adds what is new.
