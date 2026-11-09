# Journal

Dated notes from each session, newest first: what was done, what was learned, review outcomes. Written by `/handoff`.

## 2026-11-09 Foundation session

Researched the landscape (dashboards, finance trackers, Jarvis-style agents, EGM) and verified star counts and activity through the GitHub API. Chose to build a thin integrated layer (D-001).

Built M0: the app, the agent definitions, the memory structure and the plan. The user added the Instagram saved and liked scan mid-session; implemented through the official export (D-007).

Learned while building:

- The first version of the brief's figure verifier accepted "42.42%" because it compared at any rounding, and the data happened to contain a 42. A test caught it. It now compares at the precision the writer used. Worth remembering as a general point: a verifier that is too forgiving is worse than none, because it is trusted.
- Meta's exports encode UTF-8 as Latin-1 code points, including a non-breaking space for the second byte of "à". The repair function and its fixture cover this.
- The build environment blocked outbound calls to Stooq, the ECB, the BBC and CoinGecko, and had no API key. Everything that depends on them is written and unit-tested on fixtures but unverified live. This is recorded in the README and is the substance of M1.

No goldfish review has been run yet. That is M1-01.
