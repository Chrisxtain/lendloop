# LendLoop design system

Calm, practical neighbourhood utility. Structure borrowed from booking products (one primary action per view, request → approve flow), warmth from plain language and a single green accent. Monochrome everywhere else.

## Tokens (CSS variables in `src/app/globals.css`, light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #fafafa | #0c0c0e | Page floor |
| `--surface` | #ffffff | #151518 | Cards, dialogs, inputs |
| `--surface-2` | #f4f4f5 | #1c1c20 | Chips, subtle fills, skeletons |
| `--line` | #e4e4e7 | #2a2a30 | 1px borders, dividers |
| `--ink` | #18181b | #f4f4f5 | Headings, primary button fill |
| `--body` | #3f3f46 | #d4d4d8 | Running text |
| `--muted` | #6b6b74 | #a1a1aa | Secondary text (AA on bg) |
| `--accent` | #15803d | #4ade80 | The one accent: "Available", focus ring, links |
| `--accent-soft` | #dcfce7 | rgb(74 222 128 / .12) | Available badge fill |
| `--warn` / `--warn-soft` | #b45309 / #fef3c7 | #fbbf24 / rgb(251 191 36 / .12) | On loan, pending |
| `--danger` / `--danger-soft` | #b91c1c / #fee2e2 | #f87171 / rgb(248 113 113 / .12) | Overdue, destructive |

Amber and red are status semantics only, never decoration.

## Type
Geist (UI) + Geist Mono (dates, IDs). Display: 600, tracking -0.02em. Page titles `text-2xl`; landing hero `text-4xl md:text-6xl`. Body 15-16px, `leading-relaxed`, max 65ch.

## Shape rule
Buttons + inputs 8px (`rounded-lg`), cards + dialogs 12px (`rounded-xl`), status badges pill (`rounded-full`). No other radii.

## Elevation
Flat by default; cards use a 1px `--line` border. Dialogs only get a soft tinted shadow.

## Components
- **Primary button**: ink fill, bg text, 40px tall. One per view.
- **Secondary button**: surface fill + line border.
- **Danger button**: text in `--danger`, line border; fills on hover.
- **Status badge**: pill, soft fill + strong text (Available / On loan / Pending / Overdue / Returned / Declined / Cancelled).
- **Category filter**: horizontal scroll-snap chips; active chip = ink fill.
- **Dialog**: native `<dialog>` (focus trap + Esc for free), 12px radius.
- **Toast**: bottom-centre, for mutation results and errors.

## States
Every list has a skeleton that matches its final shape, an empty state that says how to fill it, and inline errors from Convex (`ConvexError.data.message`).

## Motion
Feedback and state change only: button press `scale(.98)`, list items fade/slide 8px on enter, active-tab indicator via `layoutId`, toast in/out. All gated by `prefers-reduced-motion`.

## Signature
Footer on every page: "Built by XTAIN™".
