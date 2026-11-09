---
description: Have the Task Master decompose an approved spec into backlog cards.
argument-hint: "<path to approved spec>"
---

Decompose `$ARGUMENTS` into task cards.

1. Check that the spec's status line says Approved. If not, stop and say that `/spec-review` comes first.
2. Start the `task-master` subagent with the spec path. Give it the path and nothing else from this conversation.
3. Read the cards it added to `memory/BACKLOG.md`. Check each has a "Done when" that can be verified and that the order leaves the system working after every card.
4. Present the cards and the recommended first one to the user. Do not start building until the user agrees the plan.
