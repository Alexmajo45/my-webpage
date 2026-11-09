---
description: Spec gate. Memoryless reviewers check a design document before anything is built.
argument-hint: "<path to spec in docs/designs/>"
---

Run the spec gate on `$ARGUMENTS`.

1. Confirm the file exists and set its status line to `In review`.
2. Create `.review/<date>-<spec-name>/` and write `packet.md` containing only: the path of the spec, and a reading list of the existing source files and documents the spec refers to. No rationale, no history, nothing from this conversation.
3. Start fresh subagents in parallel, each given only the packet path: `goldfish-zoom-out` and `goldfish-comprehension` always; `goldfish-security` if the spec touches data, authentication, the network or agent tools; `goldfish-experience` if it describes interface. If fresh subagents cannot be started, stop and say so.
4. Save each report verbatim in the packet directory.
5. Compare the comprehension reviewer's restatement with what the spec was meant to say. Every divergence is a finding about the document, even if the reviewer raised none.
6. Consolidate into Blocker, Major, Nit. Mark each `PROPOSE FIX` or `CONTEST` with your reason.
7. Present to the user, who decides. Revise the spec as agreed. If a Blocker was fixed, have a fresh `goldfish-zoom-out` read the revision.
8. Only when the user approves, set the status to `Approved (<date>)`, record the outcome in `memory/JOURNAL.md`, and offer to run `/plan` on it.
