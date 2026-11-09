# 3. Agent operating model

## Two planes, one pattern

"Agents" means two different things in this project, and conflating them causes confusion.

The **build plane** is the team of AI agents that develops this repository: it plans, designs, writes code and reviews it. It lives in `.claude/` and `memory/` and runs inside Claude Code.

The **run plane** is the agent inside the product: the assistant you talk to on the dashboard, which reads your data and writes your brief. It lives in `app/src/agent.ts`.

Both planes use the same pattern, taken from Google's [Elephant-Goldfish model](https://github.com/google/elephant-goldfish-model) (EGM): one long-lived agent that holds all the context, checked by reviewers that hold none, with a human making the decisions.

| | Build plane | Run plane |
|---|---|---|
| Elephant | The Master: the main Claude Code session, with `memory/` | Cortex: the dashboard agent, with the `memories` table |
| Goldfish | Five fresh-context reviewer subagents | `verifyNumbers`: a stateless check of every brief against source data |
| Human decision | You approve specs and decide which findings to fix | You own every investment decision; the agent cannot trade |

## Why the pattern works

An agent that has been in a long session knows why every choice was made. That is exactly why it is a poor reviewer of its own work: it reads what it meant, not what it wrote. A reviewer started with an empty context sees only the artefact, as a future maintainer or an attacker would. The reviewer's ignorance is the feature.

EGM as published applies this to **design documents before code is written**. Your brief asked for goldfish as **code reviewers**. These are different gates, and this project uses both: a spec gate before building anything substantial, and a diff gate before anything is merged.

## Roles on the build plane

| Role | Implemented as | Memory | Writes | Purpose |
|---|---|---|---|---|
| **Master (the elephant)** | The main session, governed by `CLAUDE.md` | All of `memory/`, loaded at session start | Anything, but delegates | Holds the whole project: goals, decisions, history. Drafts specs, orchestrates the others, consolidates reviews, talks to you |
| **Task Master** | `.claude/agents/task-master.md` | Approved specs and `memory/BACKLOG.md` only | `memory/BACKLOG.md` | Turns an approved spec into small, ordered, testable task cards; keeps the backlog honest |
| **Designer** | `.claude/agents/designer.md` | `docs/design-system.md` and the current UI | `app/web/`, `docs/design-system.md` | Owns the visual system, accessibility and interaction; can use the Figma connector |
| **Builder** | `.claude/agents/builder.md` | One task card and the files it names | `app/` | Implements exactly one task card with tests, in a clean context |
| **Scout** | `.claude/agents/scout.md` | None | Nothing | Researches libraries, data sources and comparable projects; returns sourced findings |
| **Goldfish (five personas)** | `.claude/agents/goldfish-*.md` | **None, by design** | Nothing | Review a spec or a diff from a review packet alone |
| **You** | | | | Approve specs, rule on contested findings, own the roadmap |

Specialists are deliberately given **scoped** memory rather than full memory. The Task Master does not need to know why a design was chosen, only what was approved. A Builder with one task card and a clean context writes more focused code than one carrying the whole project.

## The goldfish

| Persona | Gate | Looks for |
|---|---|---|
| `goldfish-zoom-out` | Spec | Is this the right problem and the simplest approach? What was not considered? |
| `goldfish-comprehension` | Spec | Restates the spec from the document alone. Where the restatement diverges from intent, the document is unclear |
| `goldfish-correctness` | Diff | Logic errors, unhandled cases, behaviour not covered by a test |
| `goldfish-security` | Diff, and any spec touching data or the network | Injection, authentication gaps, secrets, unsafe handling of third-party text, anything that could move money |
| `goldfish-experience` | Diff touching `app/web/`, or a UI spec | Accessibility, layout failure, unclear states, breaches of the design system |

### What a goldfish receives

Exactly one thing: a **review packet**, a directory the Master prepares at `.review/<id>/`.

| File | Contents |
|---|---|
| `packet.md` | What is under review in one neutral sentence, and a reading list of file paths |
| `change.diff` | For a diff review, the output of `git diff` |

The packet contains no rationale, no history and no summary of what the author thinks the change does. If the artefact needs an explanation to be understood, that is a finding.

### What a goldfish may not do

It has read-only tools. It is instructed not to open `memory/`, not to ask for context, and to report what it could not determine instead of guessing.

Isolation is achieved by three things, and it is worth being precise about how strong each is. The fresh context is structural: a Claude Code subagent starts without the parent conversation. The packet is procedural: the Master must not leak rationale into it. The ban on reading `memory/` is by instruction; nothing mechanically prevents a subagent with a file-reading tool from opening that directory. `CLAUDE.md` is kept deliberately free of history so that, if subagents receive it, they receive standards and nothing else.

### The hard rule

A review performed in the Master's own context is not a goldfish review. If the environment cannot start a fresh subagent, the review stops and says so. This is EGM's rule and we keep it.

## The two gates

### Spec gate: `/spec-review <path>`

Used before building anything that changes architecture, data model, security posture or external connections. It follows EGM's sequence, compressed.

1. The Master drafts the spec in `docs/designs/` with your input.
2. `goldfish-zoom-out` and `goldfish-comprehension` run in parallel, plus `goldfish-security` or `goldfish-experience` where relevant.
3. The Master consolidates findings into three levels (Blocker, Major, Nit) and marks each `PROPOSE FIX` or `CONTEST` with a reason.
4. You decide. Contested findings are yours to rule on.
5. The Master revises. If Blockers were fixed, a fresh `goldfish-zoom-out` reads the revision.
6. On your approval the spec's status is set to Approved and the Task Master decomposes it.

### Diff gate: `/goldfish-review`

Used before every merge.

1. The Master runs the tests and type-check. A failing build is not sent for review.
2. The Master writes the packet from `git diff` against the base branch.
3. `goldfish-correctness` and `goldfish-security` always run; `goldfish-experience` runs if `app/web/` changed. All in parallel, each in its own fresh context.
4. Consolidation, your ruling on anything contested, fixes, and a re-review only of what changed.

## The Master's memory

| File | Contents | Updated |
|---|---|---|
| `memory/PROJECT.md` | Purpose, current state, what is next, known gaps | End of every session |
| `memory/DECISIONS.md` | Decision log: what, why, what was rejected | When a decision is made |
| `memory/BACKLOG.md` | Task cards and their status | By the Task Master |
| `memory/JOURNAL.md` | Dated session notes and review outcomes | End of every session |

A session-start hook (`scripts/elephant-context.sh`) prints `PROJECT.md` and the open backlog into the Master's context, so every session begins knowing where the last one ended. `/handoff` writes the session back to memory before you close it. This is what "the master with all the memory of the project" means in practice: memory is files in the repository, versioned with the code, readable by you, and not dependent on any one chat surviving.

## Limits you should know about

**Shared blind spots.** If the elephant and every goldfish are the same underlying model, they share training-derived blind spots; fresh context removes the author's assumptions, not the model's. Mitigations in place: deterministic checks (tests, type-check, the figure verifier) that do not depend on any model's judgement, and your own review. A further mitigation available at low cost is to set a different model for one goldfish in its frontmatter.

**Review is not testing.** A goldfish reads; it does not run. The test suite is the evidence that code works.

**Cost.** Each goldfish is a full model run. The diff gate costs two to three runs per merge. That is proportionate for a system holding financial data, and it is why Nits are batched instead of triggering re-review.

## Using Google's plugin directly

The original EGM plugin can be installed alongside this setup and is the better tool for long, formal design documents: it has a fuller set of reviewer prompts and a five-stage review. What is in `.claude/` here is a lighter, native implementation tuned to this repository, extended to code review. The two do not conflict.

## Roles on the run plane

Today the product has one agent, Cortex, with thirteen tools and a durable memory, and one goldfish, the figure verifier. That is intentional: one capable agent with good tools is easier to trust than a committee.

The roadmap adds specialist "desks" only where a narrower prompt demonstrably does better: a Markets desk that writes the money section, a News desk that clusters and summarises, a Library curator that enriches and files saved posts. Each would be a scoped call with only the data it needs, its output checked before the elephant uses it. They are not built yet.
