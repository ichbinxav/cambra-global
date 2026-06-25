# CAMBRA Design System — Hybrid

Landing & marketing pages are **dark editorial**.
Dashboard, Admin & app pages are **light institutional**.
Tokens, typography, radii, spacing and motion are **identical** on both surfaces.

---

## Buttons (always use these classes)

| Class                         | Use                                       |
|------------------------------|-------------------------------------------|
| `btn-base btn-primary`        | Primary CTA on **light** surfaces          |
| `btn-base btn-primary-inverse`| Primary CTA on **dark** surfaces           |
| `btn-base btn-secondary`      | Secondary on **light** surfaces            |
| `btn-base btn-secondary-dark` | Secondary on **dark** surfaces             |
| `btn-base btn-ghost`          | Text-only on **light**                     |
| `btn-base btn-ghost-dark`     | Text-only on **dark**                      |
| `+ btn-sm` / `+ btn-lg`       | Size modifier                              |

❌ Do NOT use raw shadcn `<Button>` variants in landing/navbar/CTAs.
✅ Use the unified `btn-*` classes for visual consistency.

---

## Cards (3 canonical surfaces)

| Class             | Use                                                       |
|------------------|-----------------------------------------------------------|
| `surface-card`    | Default card in app (white / off-white)                   |
| `surface-elevated`| Hero / featured panel in app (stronger shadow)            |
| `surface-dark`    | Premium navy/black card (landing + accent panels in app)  |

❌ Stop using ad-hoc combos like `bg-white/[0.04] backdrop-blur border border-white/10 rounded-2xl`.
✅ Use `surface-dark` instead — it's the same look, one class.

`cambra-card` and `card-premium` are legacy aliases; new code should prefer the `surface-*` family.

---

## Status / eyebrow pill

| Class            | Surface |
|------------------|---------|
| `pill-live`      | Light   |
| `pill-live-dark` | Dark    |

```html
<span class="pill-live"><span class="dot"></span>Network live</span>
```

---

## Tokens (do not redefine inline)

- Colors: `hsl(var(--foreground))`, `hsl(var(--cambra-blue))`, `hsl(var(--cambra-cyan))`
- Border radius: `rounded-full` (pills, CTAs), `rounded-xl` (cards), `rounded-2xl` (heroes)
- Font weights: 700 for CTAs, 800–900 for display headings, 600 for nav labels
- Letter spacing: `-0.01em` to `-0.04em` for headings, `0.22em` for uppercase eyebrows

---

## Migration checklist (incremental)

When touching a file, replace in this priority order:
1. Buttons with inline `bg-foreground text-background h-8 rounded-full ...` → `btn-base btn-primary btn-sm`
2. Ad-hoc dark panels (`bg-white/[0.04] border border-white/[0.08] rounded-2xl`) → `surface-dark`
3. Status pills (any inline ping+cyan combo) → `pill-live` / `pill-live-dark`

Don't migrate untouched files just for cleanup — only when editing.