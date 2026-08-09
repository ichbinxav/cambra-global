# Typecheck — Full repository gate

## Current status

As of **CAMBRA v0.65.1 (2026-08-09)**, the full JavaScript/JSX TypeScript check is clean:

```bash
npx tsc -p ./jsconfig.json --pretty false
```

Expected result: **0 errors**.

The historical baseline debt of 516 errors has been eliminated without disabling `checkJs`, excluding files, adding blanket `@ts-nocheck`, or weakening the critical typecheck. The critical economic/ECL perimeter remains a separate zero-error gate in `tsconfig.critical.json`.

## What was fixed

The old error volume was not one class of defect. The closure work fixed the underlying sources instead of increasing the baseline:

- React/shadcn/Radix wrappers now expose their real prop/ref types rather than being inferred as empty or overly narrow objects.
- The language context declares the real two-argument translation contract.
- Payments onboarding and payments-result helpers have explicit discriminated data/result shapes.
- Browser-only surfaces (`import.meta.env`, Stripe JS, DOM script nodes, local storage) have explicit environment types/adapters.
- Local component props that are genuinely optional now declare defaults/optional types.
- State previously initialized as `{}` is initialized/typed with the fields the component actually reads.
- A few real correctness issues surfaced by the compiler were fixed, including boolean sort arithmetic, ConnectorTile's previously-void refresh result, and terminal-rental insight availability when the authoritative current rate is missing.

## Release rule

`npm run typecheck:noise` is retained only as a compatibility script name. It now runs the same full check and **must stay at 0 errors**. A future error is actionable; it is not accepted as "known noise".

The sanctioned release gates are:

- `npm run typecheck:critical` — zero errors on the high-risk economic/ECL/backend perimeter.
- `npm run typecheck:baseline` — full-repo fingerprint gate. From v0.65.1 its approved error count is 0, so any future TypeScript diagnostic fails the release.
- `npm run test` — runtime/unit regression suite.
- `npm run lint` — ESLint.
- `npm run build` — Vite production build.

## Historical note

Earlier releases documented hundreds of `checkJs` diagnostics as baseline debt. That documentation is superseded by v0.65.1. The baseline mechanism remains because it provides a deterministic release invariant, but its purpose is now to enforce **zero regression from zero**, not to tolerate legacy errors.
