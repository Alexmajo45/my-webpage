# Project state

Read by the Master at the start of every session. Keep it under one page. Rewrite it; do not append to it.

## Purpose

A personal command centre for one user (applied-neuroscience and leadership consultant, Milan): daily life, investments, relevant news, a backlog of saved Instagram posts, and an agent with memory. Client-ready clarity matters to this user; so does being told plainly what is not yet working.

## State as of 2026-11-10

Milestone M0 (Foundation) is complete. The app runs in demo mode; 16 tests and the type-check pass; the interface was rebuilt on 2026-11-10 after the user found the first version not user friendly (D-008), and checked in a browser at desktop and phone width, light and dark.

Not yet verified anywhere: the agent against the live Anthropic API, the Stooq provider and RSS feeds against live endpoints, outbound delivery, the MCP endpoint against a real client, and the Instagram importer against a real export. The build environment had no API key and no outbound access to those hosts.

The M0 code has not been through `/goldfish-review`. It was written by the Master in a single session.

## Next

Milestone M1 (Real data). The first task is to run the diff gate on the M0 code. See `BACKLOG.md`.

## Standing preferences of the user

- British English; consulting-style prose; few bullets; tables only where they help.
- Wants to be challenged where the framing is weak.
- Europe by default (EUR base currency, Europe/Rome).
- Interface must be friendly to a non-technical reader: plain language, one clear next action, no internal names.
- Asked specifically for: a master agent holding all memory; memoryless reviewers on the Elephant-Goldfish model; designer and task-master roles; automations; connections to external agents; an action to scan Instagram saved and liked posts.

## Open decisions with the user

Listed in `docs/06-roadmap.md` under "Decisions waiting for you". The most consequential: move to a dedicated private repository, and which Instagram enrichment route to take.
