# AUDIT_LAUNCH_PRE — CAMBRA launch scope before 10-market change

Date: 2026-08-20
Decision: `PROMPT_LAUNCH_10`

## Scope to be applied

- ACTIVE / target ELIGIBLE (10): `ES IT PT GB GR HR DE PL CZ CY`
- LICENSING BLOCKED (3): `FR BE NL`
- NOT LAUNCH MARKET / target BLOCKED (17): `AT BG CH DK EE FI HU IE LT LU LV MT NO RO SE SI SK`
- Canonical registry also contains `IS LI AD`; they are outside this 30-market launch decision and are not launch markets under the new scope. Their research data is retained.

## Current pre-change commercial authority

The canonical repository authority is `config/europe-markets.json` -> generated `europeMarkets` adapters -> `marketLaunchScope.ts`.
Before this change it declares 30 active launch markets and 3 protected markets (`FR BE NL`). Within the 30-country decision perimeter, the pre-change state is therefore:

| ISO2 | Current state | Target state |
|---|---|---|
| AT | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| BE | PROTECTED_RESEARCH_ONLY | BLOCKED / licensing |
| BG | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| CH | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| CY | ACTIVE_LAUNCH | ELIGIBLE |
| CZ | ACTIVE_LAUNCH | ELIGIBLE |
| DE | ACTIVE_LAUNCH | ELIGIBLE |
| DK | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| EE | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| ES | ACTIVE_LAUNCH | ELIGIBLE |
| FI | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| FR | PROTECTED_RESEARCH_ONLY | BLOCKED / licensing |
| GB | ACTIVE_LAUNCH | ELIGIBLE |
| GR | ACTIVE_LAUNCH | ELIGIBLE |
| HR | ACTIVE_LAUNCH | ELIGIBLE |
| HU | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| IE | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| IT | ACTIVE_LAUNCH | ELIGIBLE |
| LT | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| LU | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| LV | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| MT | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| NL | PROTECTED_RESEARCH_ONLY | BLOCKED / licensing |
| NO | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| PL | ACTIVE_LAUNCH | ELIGIBLE |
| PT | ACTIVE_LAUNCH | ELIGIBLE |
| RO | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| SE | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| SI | ACTIVE_LAUNCH | BLOCKED / not_launch_market |
| SK | ACTIVE_LAUNCH | BLOCKED / not_launch_market |

`CountryProfile` currently has 33 live rows, all research-oriented, and `MarketActivationState` currently has 0 rows. The current commercial decision is therefore code/config authority rather than an existing live activation-row projection.

## Live data inventory before switch-off

### Registered merchants / Brand rows

18 `Brand` rows exist in total. Normalized by country, including demos:

| Country | Brand rows | Non-demo | Demo |
|---|---:|---:|---:|
| ES | 3 | 2 | 1 |
| FR | 8 | 4 | 4 |
| DE | 3 | 2 | 1 |
| IT | 1 | 1 | 0 |
| UNATTRIBUTED | 3 | 3 | 0 |

All other countries: 0.

**Registered Brand rows in the 17 markets being switched off: 0.**

### Saved diagnostics

`AnalyzerInput` is the persisted diagnostic input authority. There are 30 rows:

| Country | AnalyzerInput rows |
|---|---:|
| DE | 4 |
| ES | 2 |
| FR | 1 |
| IT | 1 |
| DK | 1 |
| SE | 1 |
| UNATTRIBUTED | 20 |

`AnalyzerResult` has 20 persisted outputs. Country is taken from `details.input_snapshot.country` when present, otherwise from its linked `AnalyzerInput`:

| Country | AnalyzerResult rows |
|---|---:|
| FR | 7 |
| ES | 5 |
| DE | 4 |
| IT | 1 |
| DK | 1 |
| SE | 1 |
| UNATTRIBUTED | 1 |

**Saved diagnostic records in the 17 markets being switched off: 2 country-scoped inputs and 2 corresponding outputs: DK=1, SE=1.** These records must remain intact and queryable after switch-off; no deletion or country rewrite is permitted.

### Invoice / statement observations

There is no live entity named `RateObservation` in the current schema. The current persisted upload/statement authority is `StatementImport`; P3 `ProviderPricingVersion` can also represent observations by `observation_type`.

`StatementImport` has 8 rows:

| Country via Brand | StatementImport rows |
|---|---:|
| DE | 6 |
| UNATTRIBUTED | 2 |

`ProviderPricingVersion` rows with `observation_type = STATEMENT_OBSERVED`: **0**.
`P4EvidenceProjection` rows: **0**.

**Invoice/statement observations attributable to the 17 markets being switched off: 0.**

The two unattributed `StatementImport` rows belong to Brand `6a4fe2df992f1f6be464a6fc`, whose country field is empty. They remain unattributed; this launch change must not infer or rewrite their country.

## Pricing data preservation baseline

The live `PaymentsRateTable` query currently returns 52 rows in the app data store. This differs from the 304-row verified repository/data package referenced by the launch decision; both are treated as immutable for this change. No `PaymentsRateTable` row may be created, deleted, degraded, or rewritten by launch-state changes.

P3 pricing intelligence exists for some markets that will be switched off (including AT/CH/EE/LT/LV/SK). This is expected research data and is explicitly retained; commercial switch-off is not a data-quality downgrade.

## Gate 0

- `AUDIT_LAUNCH_PRE.md` exists: YES.
- Registered Brand rows in 17 markets to switch off: **0**.
- Saved diagnostic country-scoped inputs in 17 markets to switch off: **2** (`DK=1`, `SE=1`).
- Corresponding persisted diagnostic outputs in 17 markets to switch off: **2** (`DK=1`, `SE=1`).
- Invoice/statement observations attributable to 17 markets to switch off: **0**.
- Existing live data scheduled for deletion: **0**.

**GATE 0: PASS.**
