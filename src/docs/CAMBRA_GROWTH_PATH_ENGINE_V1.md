# CAMBRA Growth Path Engine V1

## Purpose

Growth Path is CAMBRA's navigation layer above canonical P1–P13 truth. It answers five founder questions continuously: where actual bookings, verified economic value, revenue and cash stand; what the current plan expects; what is most likely to constrain the path; which bounded action has the best marginal economics; and what must not be scaled yet.

It is not a second CRM, accounting ledger, KPI dictionary, attribution engine, event bus or execution orchestrator.

## Governed records

- `GrowthTargetRegistry` stores versioned founder targets by period, metric, business line, geography and channel. Targets are plans, not forecasts or facts.
- `GrowthAssumptionRegistry` stores every planning parameter with `ASSUMPTION`, `OBSERVED`, `CALIBRATED` or `INSUFFICIENT_DATA` provenance, source, confidence and effective version.
- `GrowthPathSnapshot` preserves each recomputation with actuals, forecasts, gaps, bridges, constraints, recommendations and number lineage.
- `GrowthScenario` stores founder-saved scenario changes and summaries. A scenario creates no execution authority.

Initial Y0–Y3 targets and cold-start assumptions live in `config/growth-path-defaults.json`. The €100M Y3 number is a registry seed only; no calculation branches on that value. The founder can supersede any target or assumption through versioned Admin actions.

## Calculation boundary

The deterministic core lives in `base44/shared/growthPath.ts`. For each channel and period it keeps reachable volume, conversion, booking value, verified economic value, revenue realization, cash collection, variable cost, contribution and lags separate. Missing required inputs produce `INSUFFICIENT_DATA`, not zero.

Cold start produces labelled low/base/high scenario ranges. P10/P50/P90 and target probability remain null until the minimum real-outcome and calibration thresholds are met. This prevents an assumed range from masquerading as a probability distribution.

Acquisition channel and business line are orthogonal dimensions. A partner-acquired merchant is attributed to `PARTNERS`, while its revenue belongs to `PAYMENTS_EUROPE`, `PAYMENTS_USA` or `LOGISTICS_EUROPE`. Each channel × business-line projection is counted once.

## Constraints and allocation

`ConstraintDetector` prioritizes emergency stop, P11 production proof, market action readiness, CANARY policy, sending infrastructure, downstream migration/billing throughput, founder capacity, unit-economics evidence and forecast calibration. It will recommend reducing or pausing acquisition when downstream execution is saturated.

Marginal allocation rows model the next 100 eligible opportunities. Paid media remains `DO_NOT_SCALE` until calibrated attribution, CAC and contribution evidence exists. All recommendations are `execute:false` and preserve original founder/P10/P11/emergency authority.

## Runtime consolidation

Base44 rejected new function names after the app reached its function-name ceiling. Growth Path therefore routes through the already-deployed `getEuropeMarketsCommandCenter` function using `view: "growth"`. That existing function owns one six-hour automation with a canonical `SchedulerRun` duplicate-execution guard. The same run recomputes the 33-market portfolio, seeds registries idempotently, writes the Growth Path snapshot and opens a shadow `GrowthDecision`.

This removes the runtime dependency on the new `europeanGrowthIntelligenceWorker` name. The source compatibility entry remains for portable archives, but production coordination uses the existing endpoint.

## Founder Admin

`/admin/growth` exposes Actual vs Plan, target gaps, deterministic ranges, binding constraints, recommendations, marginal allocation, target editing, scenario lab, founder morning brief, Europe-33 readiness and full lineage. Recompute requires explicit confirmation. Target and assumption edits create new versions and do not mutate commercial policy, sending caps or material authority.

## Truth boundaries

- Forecasts are decision support, never commitments.
- Operational revenue evidence is not a substitute for formal accounting recognition.
- Planned USA payments and European logistics remain `PLANNED` until explicitly activated and evidenced.
- Market intelligence remains available across Europe-33, while commercial action is limited to P10/P11-ready markets.
- No Growth Path action can send, spend, sign, negotiate, migrate, bill or override emergency controls.
