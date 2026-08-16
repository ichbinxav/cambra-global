# Adaptive Verified Savings attribution boundary

CAMBRA's acquisition learning may use Verified Savings only as a bounded,
descriptive advisory observation. It is neither a training label nor evidence
that outreach caused the saving.

## Exact lineage required

The economic label `verified_savings` is emitted only when one
`AcquisitionAttribution` row has state `EXACT` and binds all of these durable
identifiers and timestamps:

- one `OutboundLead` and its exact `CommunicationThread`;
- the thread's confirmed outbound exposure timestamp;
- one exact merchant `Brand` and its durable onboarding observation;
- one exact `DealActivation` and activation timestamp;
- one exact, fully verified `MonthlySavingsReport` for that Brand and deal;
- a report observation timestamp at or after the exposure, onboarding
  observation and deal activation.

The worker never sums reports by Brand. Multiple eligible leads for one Brand,
multiple sent threads, multiple qualifying reports, missing references, stale
pre-exposure reports or unavailable lineage produce `AMBIGUOUS` or
`UNATTRIBUTED` economic state and no economic label.

## Commercial outcomes remain independent

Missing or ambiguous economic lineage does not erase directly observed replies,
completed meetings or an exact lead/thread commercial win. Those outcomes keep
their existing post-exposure gates. This separation prevents a report-lineage
problem from rewriting real communication history.

All cohort output remains aggregate-only, bounded and marked
`causal_claim: false` / `training_eligible: false`.
