# P18 HIGH / CRITICAL INCIDENT PLAYBOOKS — v0.79.0

Canonical pattern: STOP → CONTAIN → INVESTIGATE → RECOVER → VERIFY → COMMUNICATE → POSTMORTEM.

## Billing corruption / reconciliation failure
STOP: pause new billing issuance with Emergency Controls if new invoices could amplify the issue. CONTAIN: keep reconciliation/evidence active; do not rewrite frozen economics. INVESTIGATE: Invoice, MonthlySavingsReport, PaymentEvent, mandate/policy/ECL binding and Stripe authoritative state. RECOVER: use canonical read-oriented reconciliation/corrective legal path. VERIFY: local/Stripe identity, amounts, status and report linkage converge. COMMUNICATE: finance/merchant only with verified facts. POSTMORTEM: record root cause and update troubleshooting/self-healing documentation.

## Provider outage / mass integration failure
STOP: pause affected communications/migrations or SAFE MODE if scope is broad. CONTAIN: prevent repeated destructive/redundant actions; keep monitoring. INVESTIGATE: provider status, OAuth/API errors, rate limits, registry/version changes. RECOVER: refresh/reconnect/fallback only if already approved and semantics unchanged. VERIFY: real reads/syncs and downstream state recover. COMMUNICATE: affected merchants when material. POSTMORTEM: provider failure mode and prevention.

## Suspected data breach / auth anomaly
STOP: activate SAFE MODE where external effects are unsafe; revoke compromised API/OAuth access through canonical controls. CONTAIN: preserve logs/evidence and minimize access. INVESTIGATE: scope, actors, tenants, secrets, permissions and affected systems. RECOVER: rotate/revoke credentials and repair only through approved security process. VERIFY: unauthorized access path is closed and tenant/auth boundaries pass. COMMUNICATE: follow applicable legal/privacy incident obligations; do not invent breach conclusions. POSTMORTEM: root cause, controls and legal record.

## Incorrect pricing / stale commercial truth
STOP: pause negotiations/migrations that rely on affected pricing. CONTAIN: mark conflicting/stale intelligence; do not overwrite history. INVESTIGATE: source, observed date, private agreement, provider version and affected recommendations. RECOVER: refresh Provider Intelligence and re-evaluate dependent decisions. VERIFY: authoritative/current source and conflict resolution. COMMUNICATE: correct any material merchant/provider communication. POSTMORTEM: freshness thresholds/source precedence.

## Rogue / unexpected agent behavior
STOP: pause the affected domain; SAFE MODE if external effects cannot be bounded. CONTAIN: stop new sends/migrations/billing issuance while preserving AgentTask/Communication evidence. INVESTIGATE: authority matrix, policy snapshot, prompt/model output, deterministic gates, idempotency and incident trail. RECOVER: fix through Developer/PR/CI/approval; do not widen authority. VERIFY: reproduce the original scenario under tests and prove the unsafe effect is blocked. COMMUNICATE: disclose externally only where actual impact requires it. POSTMORTEM: add regression test and update agent/playbook documentation.

## Incorrect autonomous communication
STOP: pause communications or affected policy immediately. CONTAIN: suppress follow-ups on impacted threads. INVESTIGATE: source facts, quality gates, policy, identity/signature, timing and recipients. RECOVER: correct only evidenced misinformation; do not compound with speculative apology. VERIFY: sending gate and message generation regression tests. POSTMORTEM: communication-quality/prevention update.

## Failed migration cohort
STOP: pause new migration starts. CONTAIN: keep merchant payment continuity/rollback boundaries; do not mass-advance tasks. INVESTIGATE: shared provider/config/code dependency, Developer CI and merchant-specific differences. RECOVER: guarded rollback or corrected migration plan according to approval. VERIFY: payment/3DS/refund/webhook/reconciliation and savings verification for representative merchants. COMMUNICATE: affected merchants with verified status. POSTMORTEM: cohort root cause and rollout/canary changes.

## Financial reconciliation failure
STOP: pause new billing issuance or provider revenue activation if the mismatch can expand. CONTAIN: preserve both merchant and provider ledgers separately. INVESTIGATE: source documents, invoice/payment/provider statement identity, periods and currency. RECOVER: canonical reconciliation/recovery only. VERIFY: zero unexplained material mismatch or explicit human-owned exception. COMMUNICATE: finance/provider/merchant based on attribution. POSTMORTEM: reconciliation control/test update.
