# 5. Connecting external agents and services

Cortex is designed to be one node among your agents, not a closed box. Connections run in three directions.

## Inbound: other agents using Cortex (MCP server)

Cortex exposes its tool registry over the Model Context Protocol at `POST /mcp`. Any MCP-capable agent can then ask "what is on today?" or "what does my portfolio look like?" and get the same answers the dashboard agent would.

| Property | Value |
|---|---|
| Transport | HTTP, stateless JSON-RPC (one request, one JSON response) |
| Tools exposed | `get_overview`, `list_tasks`, `get_portfolio`, `search_news`, `search_library`, `recall` |
| Write tools | Hidden unless `mcp.allowWrite` is `true` in the config |
| Authentication | Bearer token when `CORTEX_TOKEN` is set; loopback-only otherwise |

The repository's `.mcp.json` registers this endpoint for Claude Code, so a session opened in this repository can query the running dashboard. For Claude Desktop or another client, add an HTTP MCP server pointing at `http://127.0.0.1:4317/mcp`.

Scope, honestly: this is a minimal server that implements initialisation, tool listing and tool calls. It does not implement streaming, resources or prompts, and it has been tested at protocol level but not yet against a real client. If a client turns out to need more, the right fix is to replace `app/src/mcp.ts` with the official MCP SDK; the tool registry behind it would not change.

Read-only is the default for a reason. An external agent that can read your overview is useful. One that can write to your task list or your memory is a route by which a compromised or confused agent changes what your assistant believes about you. Enable writes deliberately.

## Outbound: Cortex using other services

| Need | Mechanism | Status |
|---|---|---|
| Market prices | Provider interface in `providers/quotes.ts` (Stooq today) | Built; live endpoint unverified |
| News | RSS and Atom feeds listed in the config | Built; live feeds unverified |
| Language and reasoning | Anthropic API through the official SDK | Built; not yet run against the live API |
| Delivery of briefs | ntfy, Telegram bot, or any webhook | Built; untested |
| Calendar, email, documents | Not built | Roadmap M4 |

For calendar and email the recommended route is not to write integrations but to give the agent MCP connectors (Google Workspace, Microsoft 365 and others publish them) and add their tools alongside the registry. This keeps the architecture's rule intact: the agent acts only through declared tools.

Adding a price source means writing one object with a `latest()` method. Candidates when Stooq is not enough: Finnhub or Twelve Data (API key, better coverage), OpenBB (a full data platform), or Ghostfolio's API if you run it for analytics.

## Sideways: hosted and scheduled agents

Some work is better done by an agent that is not the dashboard.

| Pattern | Example | How it connects |
|---|---|---|
| A scheduled agent that prepares something overnight | "Every Sunday, research the three holdings that moved most and leave a note" | It reads through `/mcp` and writes its conclusion to `/api/inbox` |
| A browsing agent | The Instagram enrichment pass in document 4 | It reads the Library through `/mcp` and updates items through the API |
| A workflow tool | n8n receiving a bank email and creating a task | `POST /api/inbox` |
| The build team | Claude Code sessions working on this repository | `.claude/`, `memory/`, GitHub |

The rule for all of them: they reach Cortex through the same two doors (the MCP endpoint and the API), with the same token, and are subject to the same write gating. No agent gets direct access to the database.

## Agent-to-agent protocols

Google's A2A protocol and similar standards let agents discover and delegate to each other as peers. Cortex does not implement one. For a single-user system where every other agent is also yours, MCP plus a capture endpoint covers the need with far less machinery. This is worth revisiting only if you want third-party agents, which you do not control, to negotiate with yours.

## Exposure checklist

Before making Cortex reachable from anywhere but your own machine:

1. Set `CORTEX_TOKEN` to a long random value. The server will not start on a non-loopback address without it.
2. Put it behind a private network (Tailscale or WireGuard) in preference to the public internet.
3. If it must be public, terminate TLS in a reverse proxy and add real authentication there. The built-in token is a shared secret, not an identity system.
4. Leave `mcp.allowWrite` off unless a specific agent needs it.
