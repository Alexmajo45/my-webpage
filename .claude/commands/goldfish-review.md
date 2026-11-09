---
description: Diff gate. Memoryless reviewers check the current change before it is merged.
argument-hint: "[base branch, default main]"
---

Run the diff gate on the current branch against the base branch `$ARGUMENTS` (use `main` if none was given).

1. From `app/`, run `npm run typecheck` and `npm test`. If either fails, stop and report: a failing build is not sent for review.
2. Create a packet directory `.review/<date>-<short-name>/`. Write the output of `git diff <base>...HEAD` to `change.diff` in it. If there are uncommitted changes, include them and say so.
3. Write `packet.md` containing only: one neutral sentence naming what is under review ("A change to the Cortex repository, in change.diff"), and a reading list of the files the diff touches plus `CLAUDE.md` and, if `app/web/` changed, `docs/design-system.md`. Do not describe what the change is for, why it was made, or anything from this conversation.
4. Start the reviewers as fresh subagents, in parallel, each given only the packet path: `goldfish-correctness` and `goldfish-security` always; `goldfish-experience` if `app/web/` changed. If fresh subagents cannot be started, stop and say that a goldfish review is not possible here. Do not review it yourself instead.
5. Save each report verbatim in the packet directory.
6. Consolidate into one list grouped Blocker, Major, Nit, merging duplicates. For each, mark `PROPOSE FIX` or `CONTEST` with your reason. You may contest; you may not silently drop.
7. Present the list. The user rules on anything contested. Then fix what was agreed, re-run the checks, and send only the changed parts back to a fresh reviewer if any Blocker was fixed.
8. Record the outcome in `memory/JOURNAL.md`: date, what was reviewed, counts by severity, what was fixed, what was contested and how it was ruled.
