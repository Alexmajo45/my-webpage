# Design system

Owned by the Designer role. The implementation is `app/web/styles.css`; this file states the rules that code must follow.

## Character

A calm instrument panel, not a marketing page. Neutral warm surfaces, one deep teal accent used for actions and selected states, and data as the only thing allowed to be loud. Dense enough to scan in one screen on a laptop; one column on a phone.

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--page` | `#f4f3ef` | `#111110` | Page background |
| `--surface` | `#fcfcfb` | `#1a1a19` | Cards, inputs |
| `--sunken` | `#efeeea` | `#232321` | Hover, assistant messages |
| `--line` | `#e2e0d9` | `#32322f` | Hairlines, borders |
| `--ink`, `--ink-2`, `--ink-3` | `#0b0b0b`, `#52514e`, `#76746e` | `#f0efec`, `#c3c2b7`, `#96958c` | Primary, secondary, muted text |
| `--accent` | `#14484a` | `#8fd3c9` | Primary buttons, selected states |
| `--s1` to `--s6` | see stylesheet | see stylesheet | Chart series, in fixed order |
| `--good`, `--critical`, `--warning` | `#0ca30c`, `#d03b3b`, `#fab219` | same | Status only |

Dark mode follows the operating system. Dark values are chosen for the dark surface, not inverted.

## Rules

1. **Text is never coloured by data.** Figures stay in ink. Direction is shown by an arrow glyph and a sign; the arrow carries the colour.
2. **Colour is never the only signal.** Status has a glyph and a word. Allocation has a legend with labels and values. Every chart has a table beside it.
3. **Asset classes keep their colour.** Equity, ETF, bond, crypto, cash and other map to series 1 to 6 in that order, always, whatever is in the portfolio. The six were validated for colour-vision separation in both modes.
4. **Chart marks are thin.** Lines 2px; bars no thicker than 24px with a 2px surface gap between segments; end markers at least 8px with a surface ring.
5. **Charts answer on hover.** Sparklines and allocation segments show the exact value.
6. **Status colours are reserved.** Green and red never appear as series or decoration.
7. **Numbers align.** Tabular figures wherever digits are compared.
8. **No horizontal page scroll** at any width from 360px. Wide tables scroll inside their own container.
9. **Every interactive element** has a visible focus ring and an accessible name.
10. **Third-party text is placed with `textContent`.** Never build markup from strings.

## Components

Card with header; list row with body and actions; chip (static or toggle); tag (monospace, for symbols and topics); hero figure with delta; allocation bar with legend; sparkline; habit day grid; chat bubble; status marker; banner.

New components are added here before they are added to the stylesheet.
