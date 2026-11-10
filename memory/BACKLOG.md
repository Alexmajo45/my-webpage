# Backlog

Owned by the Task Master. A card is small enough for one Builder in one sitting and has a check that proves it is done.

Status values: `todo`, `doing`, `review`, `done`, `blocked`.

## M1 Real data

| ID | Status | Task | Done when |
|---|---|---|---|
| M1-01 | todo | Run `/goldfish-review` on the M0 code and resolve Blockers and Majors | Consolidated report recorded in `JOURNAL.md`; fixes merged; tests pass |
| M1-02 | todo | Verify the Stooq provider on live data with the user's symbols | `refresh-quotes` returns a price for every holding in live mode, or the gaps are documented with an alternative provider proposed |
| M1-03 | todo | Verify the example feeds; replace any that fail | `refresh-news` succeeds for three feeds on five consecutive days |
| M1-04 | todo | Import a real Instagram export | Import completes; counts match the export; any format differences are covered by a new fixture and test |
| M1-05 | todo | Run the agent against the live API | Ten varied questions answered using tools; any SDK or request errors fixed; findings recorded |
| M1-06 | todo | Connect one external MCP client to `/mcp` | Client lists tools and completes `get_overview`; any protocol gaps fixed or logged |
| M1-07 | todo | Decide on and, if wanted, build a broker CSV import for holdings | Decision recorded; if built, a fixture and test exist |
| M1-08 | blocked | Move to a dedicated private repository | Waiting for the user's decision |

## Later, not yet decomposed

M2 agent evaluation set; M3 Library enrichment; M4 delivery, capture and calendar; M5 deployment and backup. See `docs/06-roadmap.md`.
