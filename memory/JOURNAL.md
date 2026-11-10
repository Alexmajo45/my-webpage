# Journal

Dated notes from each session, newest first: what was done, what was learned, review outcomes. Written by `/handoff`.

## 2026-11-10 Interface redesign

The user saw the first dashboard and said it did not look user friendly. Rebuilt `app/web/` (D-008) and rewrote `docs/design-system.md` with the principles behind it. Checked every view in a browser at 1280px and 390px, light and dark, and exercised add task, complete with Undo, habit toggle, holding edit with an inline error, and saved-post search. Server change: holding views now carry cost and keywords so the edit dialog can pre-fill; validation messages reworded for people.

Lesson: the first version mirrored the data model. Start interface work from what the user needs to decide, not from what the tables hold. Still to do: the redesign is unreviewed (M1-01 now covers it too).

## 2026-11-09 Foundation session

Researched the landscape (dashboards, finance trackers, Jarvis-style agents, EGM) and verified star counts and activity through the GitHub API. Chose to build a thin integrated layer (D-001).

Built M0: the app, the agent definitions, the memory structure and the plan. The user added the Instagram saved and liked scan mid-session; implemented through the official export (D-007).

Learned while building:

- The first version of the brief's figure verifier accepted "42.42%" because it compared at any rounding, and the data happened to contain a 42. A test caught it. It now compares at the precision the writer used. Worth remembering as a general point: a verifier that is too forgiving is worse than none, because it is trusted.
- Meta's exports encode UTF-8 as Latin-1 code points, including a non-breaking space for the second byte of "à". The repair function and its fixture cover this.
- The build environment blocked outbound calls to Stooq, the ECB, the BBC and CoinGecko, and had no API key. Everything that depends on them is written and unit-tested on fixtures but unverified live. This is recorded in the README and is the substance of M1.

No goldfish review has been run yet. That is M1-01.
