# Design system

Owned by the Designer role. The implementation is `app/web/`; this file states the rules that code must follow.

## What the first version got wrong

The first interface put ten panels on one page at equal weight, used internal names (`refresh-quotes`, ticker tags, "streak"), kept every form permanently open, and offered four small identical buttons on every row. It was a faithful picture of the database, not of what a person needs in the morning. The user's verdict was "not user friendly", and it was right.

The rules below come from that failure and from three sources on GitHub: Vercel's [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), Anthropic's [frontend-design skill](https://github.com/anthropics/skills), and GitHub's own [Primer](https://github.com/primer/design) navigation patterns.

## Principles

1. **Answer "what needs me?" first.** The opening screen is Today: one sentence that sums up the day, then only what needs attention. Everything else is one tap away.
2. **One job per screen.** Six places, each with a single purpose: Today, Plan, Money, Saved, Ask, Settings. A rail on wide screens, a bottom bar on phones.
3. **Speak like a person.** "Update prices", not `refresh-quotes`. "About Microsoft", not `MSFT.US`. "4 days in a row", not "streak 4". "2 days overdue", not a date to subtract.
4. **Show less until asked.** Forms that are used rarely (adding a holding, writing a note) open in a dialog. Machinery (automations, run history, memory) lives in Settings.
5. **One obvious action.** Each row has one primary button; the rest are quiet.
6. **Forgive.** Completing a task and archiving a post offer Undo. Removing a holding asks twice. Errors say what to change and appear next to the form.
7. **Never a dead end.** Every empty state says what to do next; the Instagram import is explained as numbered steps because it is a sequence.

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--page` | `#eef0f4` | `#0f1218` | Page background |
| `--surface` | `#ffffff` | `#181c25` | Panels, inputs, tiles |
| `--sunken` | `#f3f5f8` | `#1f2430` | Hover |
| `--line` | `#dde1e8` | `#2b313e` | Dividers, input borders |
| `--ink`, `--ink-2`, `--ink-3` | `#171c2b`, `#4a5368`, `#697186` | `#eef0f5`, `#b9c0cf`, `#8d95a6` | Primary, secondary, muted text |
| `--accent` | `#2b46c7` | `#9aabff` | The primary action on a screen, selected states, links |
| `--accent-soft` | `#e7ebfb` | `#232b4a` | Pills, completed habits |
| `--s1` to `--s6` | see stylesheet | see stylesheet | Chart series, fixed order |
| `--good`, `--critical`, `--warning` | `#0ca30c`, `#d03b3b`, `#fab219` | same | Status only |

Type: a serif display face for the greeting, headings and headline figures; the system sans for everything else. Body text is 16px, so phones do not zoom on focus. Headings are sentence case; no capitalised, letter-spaced labels.

Shape: panels 14px radius, controls fully rounded, dialogs 22px.

## Rules

1. **Text is never coloured by data.** Figures stay in ink. Direction is an arrow and a sign; only the arrow carries colour.
2. **Colour is never the only signal.** Status has a glyph and a word; the allocation bar has a labelled legend; every chart sits beside its figures.
3. **Asset types keep their colour.** Shares, funds, bonds, crypto, cash and other map to series 1 to 6 in that order, always. The six were validated for colour-vision separation on both surfaces.
4. **Chart marks are thin and answer on hover.** Lines 2px; bar segments separated by a 2px gap; end markers 8px with a surface ring; exact values on hover.
5. **Touch targets are at least 44px on phones**, 40px elsewhere.
6. **Every control has a label**, visible or for screen readers, and a visible focus ring. Navigation uses real links, so the back button and bookmarks work.
7. **No horizontal page scroll** from 360px upwards.
8. **Third-party text is placed with `textContent`.** Never build markup from strings.
9. **Dark mode is chosen, not inverted**, and follows the operating system.
10. **Before shipping an interface change, look at it** at 1280px and 390px, light and dark, and try the main action on each screen.

## Components

Navigation rail and bottom bar; page heading with lede; capture bar; glance tile; panel with rows; pill (static or toggle); habit toggle; week grid; allocation bar with legend; holding row with sparkline; numbered steps; chat bubble; dialog; toast with Undo; notice.

New components are added here before they are added to the stylesheet.
