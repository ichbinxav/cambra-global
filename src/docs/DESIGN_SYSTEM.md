# CAMBRA Design System — Enforcement Rules

> Single source of truth. Every page and component MUST follow these rules.
> If your component diverges, refactor it instead of styling around it.

---

## 1. THE CARD HIERARCHY (most important rule)

There are exactly **TWO** card primitives in the platform. Never invent a new one.

### `<NavyCard>` — PRIMARY intelligence
Use for:
- KPI strips, scores, savings figures
- Analyzer audit modules
- Benchmark / intelligence panels
- Admin command modules (TopOpportunities, ActionQueue, KPIStrip)
- Dashboard hero metrics, MetricCard, InfraScore
- Insights featured cards, pricing highlighted plan
- Onboarding step modules
- Reports charts + verification

CSS class: `.cambra-card` (+ `.cambra-card--soft`, `.cambra-card--compact`)
Component: `components/shared/NavyCard.jsx`

### `<Surface>` — SECONDARY / utility
Use for:
- Forms, settings, account fields
- Legal pages (Privacy, Terms, Cookies)
- FAQ accordions
- Tables, list rows, filter bars
- Empty states, helper boxes
- Onboarding form sections (not the steps themselves)

Component: `components/shared/Surface.jsx`

❌ NEVER write `rounded-xl border bg-card p-5` ad-hoc anymore.
❌ NEVER write a new gradient card per page.

---

## 2. THE SECTION SHELL

Every inner-page section (Dashboard, Admin, Reports, Help, Pricing, Account, …)
uses `<SectionShell>` from `components/shared/SectionShell.jsx`.

- Provides max-width, padding, header eyebrow/title/subtitle/actions slot
- Variants: `default` (max-w-7xl), `tight` (forms), `wide` (analytics)

❌ Do not write `<div className="max-w-7xl mx-auto px-...">` anymore.
❌ Landing page sections are exempt (they have their own editorial composition).

---

## 3. TYPOGRAPHY (locked)

| Use                          | Class                                                             |
|------------------------------|-------------------------------------------------------------------|
| Display / page hero          | `font-display text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.045em]` |
| Section title (H2)           | `font-display text-2xl sm:text-3xl font-black tracking-[-0.03em]` |
| Card title                   | `font-display text-xl font-black tracking-tight`                  |
| Eyebrow (uppercase)          | `text-[10px] font-bold tracking-[0.22em] uppercase`               |
| Body                         | default Inter, no extra class                                     |
| Numeric / KPI                | add `tabular-nums`                                                |

❌ No `font-extrabold`, no `font-bold` on headings (always `font-black`).
❌ No custom letter-spacing values per page.

---

## 4. SPACING TOKENS

- Section vertical rhythm: `py-8 sm:py-10` (handled by SectionShell)
- Card density: `p-4` (compact) / `p-6` (cozy/default) / `p-8` (spacious)
- Gaps inside grids: `gap-3` (KPI strips), `gap-4` (cards), `gap-6` (sections)

❌ Avoid `p-5`, `p-7`, `gap-5` — these are off-grid.

---

## 5. RADIUS

- Cards: `rounded-2xl` (16px+)
- Pills, badges: `rounded-full`
- Inputs, buttons: `rounded-md` (shadcn default)
- Micro elements: `rounded-lg`

❌ No `rounded-xl` on primary cards, no `rounded-3xl`, no arbitrary radii.

---

## 6. BUTTONS

ALWAYS use `<Button>` from `@/components/ui/button`.
Sizes: `sm` (h-8), `default` (h-9), `lg` (h-10).
Pill style for hero CTAs: add `rounded-full px-5`.

❌ No `<button className="...">` with custom backgrounds.
❌ No hand-styled outline buttons.

---

## 7. MOTION

Always import tokens from `@/lib/motion`:

```js
import { slideUp, fadeIn, hoverLift, stagger, EASE } from "@/lib/motion";
```

- Default page enter: `slideUp` (or `pageEnter` for full pages)
- Card hover: `hoverLift` (max y:-2, never scale)
- Easing: `EASE` ([0.22, 1, 0.36, 1])

❌ No bouncy springs.
❌ No `scale` on hover greater than 1.02.
❌ No durations > 0.6s.

---

## 8. SCORE & STATUS COLORS

| Status      | Light bg                | On-navy hex   |
|-------------|-------------------------|---------------|
| Excellent   | `bg-score-excellent-soft` | `#52EBA4`   |
| Good        | `bg-score-good-soft`      | `#7AA8FF`   |
| Medium      | `bg-score-medium-soft`    | `#FFB05A`   |
| Risk        | `bg-score-risk-soft`      | `#FF8A8A`   |
| Accent      | —                         | `#C49AFF`   |
| Cyan accent | —                         | `#7BD9F0`   |

❌ No `text-blue-500`, `text-green-500` directly — they get remapped but lose semantics.

---

## 9. CHARTS

Always Recharts. Common config:
- Grid: `strokeDasharray="2 4" stroke="hsl(var(--border))"` (light) / `rgba(255,255,255,0.08)` (navy)
- Axis tick fontSize: 10, fill muted
- Bar radius: `[3,3,0,0]`
- Tooltip: rounded-lg border 1px hsl(--border), fontSize 11
- Colors on navy: `#7AA8FF`, `#52EBA4`, `#FFB05A`, `#7BD9F0`, `#C49AFF`
- Colors on light: `hsl(var(--cambra-blue/cyan/navy))`

❌ No custom legends per file. No 3D charts. No pie animations.

---

## 10. THE LANDING IS PROTECTED

`pages/Landing` and all `components/landing/*` files have their own editorial
composition (hero, ticker, three layers, founder story, etc.).

**DO NOT apply NavyCard, Surface, or SectionShell to Landing components.**
Landing keeps its bespoke premium energy.

---

## 11. AI TONE (system-wide)

All AI-generated content (Copilot, recommendations, intelligence insights, email copy):

- intelligent · concise · strategic · calm
- infrastructural · operational
- never salesy · never robotic · never "ChatGPT-like"

Reference voice: McKinsey × Stripe × Linear.

---

## 12. ENFORCEMENT CHECKLIST (before any PR)

- [ ] No new card style — uses `NavyCard` or `Surface`
- [ ] No new section wrapper — uses `SectionShell`
- [ ] Motion imported from `@/lib/motion`
- [ ] Eyebrows use the exact class (or `.cc-eyebrow` inside NavyCard)
- [ ] No custom hex colors (use score tokens or palette hex above)
- [ ] No spacing values outside the token grid
- [ ] Buttons via shadcn `<Button>`
- [ ] Landing files untouched