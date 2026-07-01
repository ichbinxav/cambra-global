# Typecheck — Known Noise, Not Actionable

## TL;DR

`npm run typecheck:noise` emits **554 errors across 79 files**. **None are logic bugs.** They are all cosmetic-type noise from running `tsc` over JSX-without-annotations.

The Vite build **ignores this** and compiles fine. Runtime is unaffected.

Do NOT act on the output without reading this document first.

---

## What actually happens when you run it

- `tsc -p ./jsconfig.json` runs the TypeScript compiler in `allowJs`/`checkJs` mode over `.jsx` files that have zero type annotations.
- It compares JSX prop shapes against types exported by shadcn/ui components — which are `forwardRef` wrappers exporting `RefAttributes<any>` without proper generics for children.
- Result: 554 errors, dominated by 4 error codes:

| Code | Count | Meaning |
|---|---|---|
| TS2322 | 257 | Prop type mismatch against shadcn `RefAttributes<any>` wrappers |
| TS2339 | 179 | Property access on `unknown` / untyped SDK responses |
| TS2559 | 37 | Children type mismatch against shadcn wrappers |
| TS2353 | 32 | Unknown property on JSX element (same root cause) |

Sample verified by inspection (not exhaustive):

- `src/pages/Vault.jsx` (26 errors) → all TS2322 on children passed to `<PageHero>`, `<Select>`, `<SelectTrigger>`, `<Input>`. Not a bug.
- `src/pages/admin/AdminActivationDetail.jsx` (5) → same pattern.
- `src/components/onboarding/PaymentsModule.jsx` (70), `ShippingModule.jsx` (49), `SaasModule.jsx` (30) → same pattern.
- `src/pages/Analyzer.jsx` (25), `src/components/onboarding/CompanyBlock.jsx` (20), `src/pages/Snapshot.jsx` (15) → same pattern.

---

## Why "fix all 554" is not on the roadmap

**Option A — fix the 5 files the previous prompt mentioned:** theater. Leaves 549 red. `npm run typecheck` still fails. Zero closed debt.

**Option B — fix all 554:** 4-6 hours, medium risk of propagating new type errors across shadcn wrappers used app-wide, in exchange for a green check that has never emitted a useful signal. Violates the 90-day rule: perfect typecheck over unannotated JSX is not in the 90-day critical path. Real customer data is.

**Option C (adopted) — rename the script + document the reality.** No hidden false alarms in future audits. Migrating to `.tsx` gradually — file by file, only when a file's logic actually needs static types — is the correct long-term path IF and WHEN it matters. Today it doesn't.

---

## When to revisit

- If a real logic bug is ever traced back to type confusion at runtime.
- If migrating to `.tsx` becomes strategically valuable (e.g. onboarding external engineers who benefit from IDE completions on props).
- Not before.

---

## What DOES emit signal in this repo

- `npm run build` — Vite. Fails on real syntax / import errors.
- `npx vitest run` — unit tests over `src/lib/` (score engine, normalizers, sync engine).
- `npm run lint` — ESLint over `.jsx`/`.js`. Catches unused imports, missing hooks deps, real code smells.

Those three ARE actionable. `typecheck:noise` is not.