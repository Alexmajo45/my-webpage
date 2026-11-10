# 2. Architecture

## Principles

1. **One process, one file.** A single Node.js process serves the page, the API, the scheduler and the agent. All state is one SQLite file. Backing up is copying a file.
2. **Facts are computed, language is generated.** Every figure on the page and in the brief comes from deterministic code. A model may rephrase facts; it may not originate them, and a check enforces that.
3. **The agent acts only through declared tools.** One registry (`app/src/tools.ts`) defines everything any agent, internal or external, can do.
4. **Read-only on money.** There is no code path that places an order or moves funds, and none will be added.
5. **Third-party text is data.** Headlines and saved-post text are never rendered as markup and never treated as instructions.
6. **Works with nothing configured.** Demo mode needs no keys and makes no network calls; the agent is an optional layer, not a dependency.

## Shape of the system

```
                         you (browser, phone)               external agents
                               |                           (Claude Desktop, Claude Code,
                               v                            n8n, shortcuts, cron)
        +------------------------------------------------------------+
        |  server.ts   static page | JSON API | /mcp | /api/inbox    |
        +------------------------------------------------------------+
              |                |                     |
              v                v                     v
        +-----------+   +--------------+     +----------------+
        | domain    |   | agent.ts     |     | jobs.ts        |
        | life      |<--| Claude + tool|<--->| scheduler and  |
        | portfolio |   | loop, memory |     | run log        |
        | news      |   +--------------+     +----------------+
        | library   |          |                     |
        | brief     |<---- tools.ts (single registry) ---> mcp.ts
        +-----------+                                 |
              |                                       v
              v                               notify.ts (ntfy, Telegram, webhook)
        +-----------+      providers/quotes.ts (demo, Stooq)
        | SQLite    |      providers/rss.ts    (RSS, Atom)
        +-----------+
```

## Modules

| File | Responsibility |
|---|---|
| `config.ts` | Loads one JSON config; timezone-aware date helpers |
| `db.ts` | Schema and thin query helpers over Node's built-in SQLite |
| `life.ts` | Tasks, habits, journal, long-term memories |
| `portfolio.ts` | Holdings, price history, base-currency valuation, allocation |
| `news.ts` | Feed ingest, relevance tagging against holdings |
| `library.ts` | Instagram export import, topics, triage, resurfacing |
| `brief.ts` | Assembles the day's facts, renders the brief, verifies figures |
| `tools.ts` | The tool registry, input validation, write gating |
| `agent.ts` | The Claude-powered agent: tool loop, conversation store, brief composer |
| `mcp.ts` | Exposes the tool registry to external agents |
| `jobs.ts` | Named automations, run log, scheduler |
| `notify.ts` | Outbound delivery |
| `server.ts` | HTTP, authentication, request guards |
| `web/` | The dashboard: plain HTML, CSS and one JavaScript module |

## Decisions and their trade-offs

| Decision | Why | What we give up |
|---|---|---|
| Node 22 running TypeScript directly, no build | Nothing to compile or bundle; one command to run | Requires Node 22.18+; TypeScript is limited to erasable syntax |
| Built-in SQLite | Zero infrastructure; adequate for one user for years | Node still labels the driver experimental; no concurrent writers |
| One runtime dependency (the Anthropic SDK) | Small attack surface and no upgrade treadmill | We hand-wrote an RSS parser and a minimal MCP server |
| No front-end framework | The page is one screen; the DOM is built with `textContent` only, so injected markup is impossible by construction | More verbose rendering code; would not scale to many screens |
| Amounts as floating point | Sufficient for tracking | Not suitable for bookkeeping or tax |
| Gains computed at today's FX rate | Simple and explainable | Ignores currency movement since purchase |
| Daily closes only | Matches a once-a-day decision rhythm | No intraday view |

## Data model

| Table | Holds |
|---|---|
| `tasks`, `habits`, `habit_log`, `journal` | Personal life |
| `holdings`, `prices` | Positions (quantity 0 means watchlist) and daily closes, including FX pairs |
| `news` | Ingested items with the holdings each mentions |
| `library` | Saved and liked posts with topics, note and triage status |
| `memories` | What the agent has been told to remember: facts, preferences, goals, decisions |
| `briefs` | Every brief produced, and whether a model or the template wrote it |
| `runs` | Every automation run with outcome |
| `chat` | Conversation history, stored verbatim so it can be replayed to the model unchanged |

## Security model

The threat model is a single-user service that holds sensitive personal data and reads untrusted text from the internet.

| Risk | Control |
|---|---|
| Exposure on the network | Binds to `127.0.0.1` by default; refuses to start on any other address without a token of at least 24 characters |
| Cross-site requests and DNS rebinding from a web page you visit | Host header must be a loopback name when no token is set; state-changing requests with a foreign Origin are refused; writes require a JSON content type |
| Script injection through headlines or saved posts | No `innerHTML` anywhere; strict Content-Security-Policy; only `http(s)` links are stored |
| Prompt injection through headlines or saved posts | Tool results carrying third-party text are labelled as such; the system prompt instructs the model to report and never obey; the agent's tools cannot move money, send messages or reach the network |
| A model inventing figures | `verifyNumbers` rejects any brief containing a percentage or currency amount not present in the data, and falls back to the template |
| External agents changing data | MCP is read-only unless `mcp.allowWrite` is set |
| Secrets in the repository | Secrets are environment variables only; `data/` and the live config are git-ignored |

Residual risks worth knowing: prompt-injection defences are mitigations, not guarantees, which is why the agent's tool set is kept harmless; and the token is a single shared secret, adequate behind a private network (Tailscale or similar) but not a substitute for proper authentication on the public internet.
