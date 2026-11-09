# 1. Landscape: what exists, and what we took from it

Researched on 9 November 2026. Star counts and last-push dates are from the GitHub API on that day; descriptions of features come from each project's README and from secondary reviews, and were not verified by installing the projects.

## The short answer

There is no single best repository for this brief. The request spans three categories that the open-source world serves separately, and no project found does all three well.

| Need | Best-in-class today | What is missing for our purpose |
|---|---|---|
| A dashboard that puts everything on one page | Glance, Homepage | They aggregate feeds and services; they hold no personal data of their own and have no agent |
| Investment tracking | Ghostfolio, Wealthfolio | Self-contained finance apps; no link to tasks, news relevance or an assistant |
| A Jarvis-like agent with memory and a daily brief | OpenJarvis | An agent framework; no dashboard and no portfolio model |

The decision therefore was not "which repo to fork" but "compose three products, or build one thin layer that borrows the best pattern from each". We chose the second. The reasoning is at the end of this document.

## Dashboards

| Project | Stars | Licence | Stack | Verdict |
|---|---|---|---|---|
| [glanceapp/glance](https://github.com/glanceapp/glance) | 38.1k | AGPL-3.0 | Go, single binary, YAML config | The best model for our purpose: feeds-first, tiny footprint, one config file. Has market and RSS widgets. No write path, no agent. |
| [gethomepage/homepage](https://github.com/gethomepage/homepage) | 33.6k | GPL-3.0 | Next.js | The most complete for homelab service status. Aimed at servers, not at a person's life. |
| [Lissy93/dashy](https://github.com/Lissy93/dashy) | 27.0k | MIT | Vue | Most customisable; heavier. Still a launcher at heart. |
| [homarr-labs/homarr](https://github.com/homarr-labs/homarr) | 5.3k | Apache-2.0 | TypeScript | Friendliest drag-and-drop setup; same launcher category. |
| [koala73/worldmonitor](https://github.com/koala73/worldmonitor) | 90.4k | AGPL-3.0 | TypeScript | Real-time global news and geopolitics dashboard with AI summarisation. Impressive, but it monitors the world, not your portfolio. |

Borrowed: Glance's principle that the whole system is one small process configured by one file, and worldmonitor's idea that news is only useful once it is filtered against what you care about.

## Investments

| Project | Stars | Licence | Stack | Verdict |
|---|---|---|---|---|
| [ghostfolio/ghostfolio](https://github.com/ghostfolio/ghostfolio) | 9.7k | AGPL-3.0 | Angular, NestJS, Postgres | The established self-hosted wealth tracker: multi-asset, multi-currency, performance analytics. Needs Postgres and Redis. |
| [wealthfolio/wealthfolio](https://github.com/wealthfolio/wealthfolio) | 9.4k | AGPL-3.0 | Rust, Tauri desktop | Local-first and private; a desktop application rather than a service. |
| [we-promise/sure](https://github.com/we-promise/sure) | 11.3k | AGPL-3.0 | Ruby on Rails | Community continuation of Maybe (archived July 2025). Full personal finance including budgeting. |
| [OpenBB](https://github.com/OpenBB-finance/OpenBB) | 75.3k | see repo | Python | A data platform for analysts and agents. The right upgrade path if we outgrow simple quote providers. |
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | 121.6k | Apache-2.0 | Python | Multi-agent trading research framework. Deliberately not adopted: it is built to make trading decisions, and Cortex is built not to. |

Borrowed: Ghostfolio's data model in miniature (holdings, per-unit cost, base-currency valuation, allocation by class) and Wealthfolio's stance that financial data stays on your own machine.

If you later want serious performance analytics (time-weighted returns, dividends, transactions), the sensible move is to run Ghostfolio alongside and have Cortex read it, rather than to rebuild it here.

## Agents

| Project | Stars | Licence | Stack | Verdict |
|---|---|---|---|---|
| [open-jarvis/OpenJarvis](https://github.com/open-jarvis/OpenJarvis) | 14.1k | Apache-2.0 | Python | Closest to "Jarvis": local-first, scheduled morning digest across email, calendar, health and news, memory, optional speech. |
| [khoj-ai/khoj](https://github.com/khoj-ai/khoj) | 38.1k | AGPL-3.0 | Python | "AI second brain": answers from your documents and the web, custom agents, automations. Last pushed August 2026. |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | 68.7k | Apache-2.0 | Python | Memory layer for agents. The upgrade path if a flat memory table stops being enough. |
| [roiguri/jarvis-agent](https://github.com/roiguri/jarvis-agent) | 0 | MIT | Python, LangGraph | Tiny, but a clean reference design: channel-decoupled gateway, self-scheduling heartbeat, file-based memory. |

Borrowed: OpenJarvis's morning digest as the agent's anchor habit; the heartbeat idea (the agent is woken by a scheduler, it does not wait to be asked); and the discipline, common to the better projects, that the agent acts only through a small declared set of tools.

## Agent engineering method

| Project | Stars | Licence | Verdict |
|---|---|---|---|
| [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model) | 16.4k | Apache-2.0 | The method this repository is organised on. A long-lived, context-rich "elephant" drafts; fresh-context "goldfish" review with no access to the conversation; a human decides. Published October 2026; its README states it is not an officially supported Google product. |

How we apply and extend it is in [03-agent-operating-model.md](03-agent-operating-model.md).

## Why build a thin layer rather than compose the leaders

Composing Glance, Ghostfolio and OpenJarvis would have been faster to a first screenshot. It was rejected for three reasons.

First, the value of this product is in the joins: a headline matters because you hold the stock; a saved post matters because it relates to a goal you told the agent about. Three separate applications in Go, TypeScript and Python, each with its own store, make those joins the hardest part of the system instead of the easiest.

Second, memory. A Jarvis that is useful needs one memory spanning money, tasks and saved material. None of the three shares state with the others.

Third, operating cost for one person. The composed stack means Postgres, Redis, three runtimes and three upgrade cycles. The layer built here is one Node process and one SQLite file.

The cost of this choice is real and should be stated: we own more code, and our portfolio analytics are basic compared with Ghostfolio's. The architecture keeps the door open to plugging the specialists in behind the same interfaces later.

A note on licences: Glance, Ghostfolio, Wealthfolio, Sure, Khoj and worldmonitor are AGPL or GPL. We have taken ideas and patterns from them, and no code.

## Sources

Secondary reviews consulted alongside the repositories themselves:
[Self-hosted dashboards compared (2026)](https://codeshrew.github.io/ai-lab-notes/posts/2026-02-08_homepage-dashboards-self-hosters-comparison),
[awesome-selfhosted: personal dashboards](https://awesome-selfhosted.net/tags/personal-dashboards.html),
[Ghostfolio vs Wealthfolio](https://openalternative.co/compare/ghostfolio/vs/wealthfolio),
[Ghostfolio vs Maybe](https://dev.to/selfhostingsh/ghostfolio-vs-maybe-2ma1),
[OpenJarvis quick start](https://open-jarvis.github.io/OpenJarvis/getting-started/quickstart/),
[EGM explained (MindStudio)](https://www.mindstudio.ai/blog/google-elephant-goldfish-model-egm),
[EGM design review write-up](https://www.digitalapplied.com/blog/google-elephant-goldfish-agent-design-review).
