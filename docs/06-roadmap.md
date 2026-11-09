# 6. Roadmap

Each milestone has an exit criterion that can be checked, not a list of features. Work inside a milestone is decomposed into task cards in `memory/BACKLOG.md` by the Task Master.

| Milestone | Outcome | Exit criterion | Status |
|---|---|---|---|
| **M0 Foundation** | A working dashboard, agent scaffold, operating model and plan | Runs in demo mode; tests and type-check pass; documents written | Done |
| **M1 Real data** | The dashboard shows your actual life and money | Your holdings are entered; live prices and at least three feeds refresh for five consecutive days without a failed run; a real Instagram export imports cleanly | Next |
| **M2 Agent on** | The agent is trustworthy enough to use daily | Twenty representative questions answered correctly from tools; ten consecutive model-written briefs pass verification; one external MCP client connected | |
| **M3 Library with substance** | Saved posts carry what they are about | Enrichment route chosen and run on the backlog; 80% of saved items have a note or caption; search by subject returns what you expect | |
| **M4 Reach** | It comes to you, and knows your calendar | Brief delivered to your phone daily; capture from the phone works; calendar events appear in the brief | |
| **M5 Always on** | It runs without your laptop | Deployed on a small server or home machine on a private network, with daily backup of the database | |

## M1 in detail, because it is next

| Task | Why it comes first |
|---|---|
| Run `/goldfish-review` on the M0 code | The foundation was written in one session by one agent. It has not yet been through the gate this project is built around |
| Verify the Stooq provider against live data and confirm your symbols resolve | Unverified in the build environment; European tickers are the likely trouble |
| Verify the three example feeds, replace any that fail | Feed URLs change without notice |
| Enter your holdings; decide whether to add a CSV import from your broker | Manual entry is fine for ten positions, tedious for fifty |
| Request and import an Instagram export | Confirms the importer against Meta's current format |
| Set owner, timezone and schedule in `config/cortex.json` | |

## Decisions waiting for you

| Decision | Options | Recommendation |
|---|---|---|
| Where this lives | Keep in `my-webpage`, or move to a dedicated private repository | Move. The repository name no longer describes the contents, and a private repository is the right default for a personal-finance tool even though data is git-ignored |
| Instagram enrichment | Assisted browser pass, Meta oEmbed, or manual notes | Manual notes now, assisted pass for the backlog |
| Automatic review on pull requests | On (needs an API key as a repository secret) or manual | Manual until M2, then on |
| Portfolio depth | Stay simple, or run Ghostfolio behind Cortex | Stay simple until you miss a specific analysis |
| Voice | None, or speech in and out | Defer; it changes the interface more than the value |

## Deliberately out of scope

Trade execution; tax or accounting-grade bookkeeping; multi-user accounts; scraping any service against its terms.
