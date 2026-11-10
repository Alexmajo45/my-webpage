# Decision log

Newest first. One entry per decision: what, why, what was rejected. Do not edit past entries; supersede them.

## D-008 Interface rebuilt around a Today view and six destinations (2026-11-10)

The user judged the first single-page dashboard "not user friendly". Cause: ten panels at equal weight, internal jargon, forms always open. Rebuilt as Today, Plan, Money, Saved, Ask and Settings, with plain-language labels, dialogs for rare forms, Undo on completion and archive, and 44px touch targets. Guidance taken from Vercel's Web Interface Guidelines, Anthropic's frontend-design skill and GitHub Primer. Rejected: restyling the single page, because the problem was structure, not paint. Done inline by the Master rather than through the Designer subagent or a spec; it has not been through either gate.

## D-007 Instagram via official data export, not scraping (2026-11-09)

Instagram has no API for a personal account's saved or liked posts. Browser automation and private-API libraries breach its terms and risk the account. We import the official JSON export. Consequence: items arrive with link, author, date and collection but no caption; enrichment is a separate, open decision (roadmap M3).

## D-006 MCP endpoint is read-only by default (2026-11-09)

External agents can read the overview, portfolio, news, library and memory. Write tools are exposed only with `mcp.allowWrite`. Rejected: full access by default, because a write path into tasks and memory lets a confused or compromised agent change what the assistant believes.

## D-005 Figures are deterministic; a stateless verifier guards model-written briefs (2026-11-09)

The brief's facts come from code. A model may rewrite the prose; `verifyNumbers` rejects any percentage or currency amount not in the data, at the precision written, and the template is used instead. This is the run-plane goldfish.

## D-004 Two review gates, not one (2026-11-09)

EGM as published reviews design documents before code. The user asked for goldfish as code reviewers. We run both: `/spec-review` before building, `/goldfish-review` before merging. Five personas instead of EGM's fuller set, to keep the cost proportionate for a one-person project.

## D-003 Memory is files in the repository (2026-11-09)

The Master's memory is `memory/*.md`, loaded by a session-start hook and written by `/handoff`. Rejected: relying on chat history or a vector store. Files are versioned, reviewable by the user and survive any one session. `CLAUDE.md` deliberately carries no history so reviewers cannot inherit it.

## D-002 Zero-build Node 22 with built-in SQLite and one dependency (2026-11-09)

One process, one file, no build. Rejected: Next.js with Postgres (more capable, far more to operate for one user); Python (the agent ecosystem is richer, but a second runtime for the front end). Cost accepted: a hand-written RSS parser and a minimal MCP server.

## D-001 Build a thin integrated layer rather than compose Glance, Ghostfolio and OpenJarvis (2026-11-09)

The product's value is in joining money, news, tasks, saved posts and memory. Three applications in three stacks with three stores make those joins the hard part. Cost accepted: basic portfolio analytics. Door left open: Ghostfolio can sit behind the quote and portfolio interfaces later. Full reasoning in `docs/01-landscape.md`.
