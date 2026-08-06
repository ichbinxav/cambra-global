# CI smoke marker

Purpose: a deliberately inert file whose only job is to produce a diff, so a
push can trigger the GitHub workflow (`.github/workflows/ci.yml`) and prove the
pipeline runs end-to-end against real repository content.

It is documentation only. Nothing imports it, nothing builds it, no gate reads
it: it is NOT part of the pre-ECL freeze, NOT on the release touch list, and it
carries no ECL field, no schema, no policy and no economic effect. Deleting it
at any time is safe and changes no behaviour.

- Created: 2026-08-06
- Release under test: 0.62.3 (stage ECL_P1_SCHEMA_ONLY)
- Expected CI result: the same gates that pass locally — clean:check,
  policy:check, lint, typecheck:critical, typecheck:baseline (518 ≤ 518),
  tests, build.