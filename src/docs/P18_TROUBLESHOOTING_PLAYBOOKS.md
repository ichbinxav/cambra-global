# P18 TROUBLESHOOTING PLAYBOOKS — v0.79.0

These playbooks describe supported failure modes in the actual implementation. Automatic response means only the behavior currently implemented; absence of an automatic response is not permission to improvise a write.

## OAuth disconnected / expired
SYMPTOM: Integration error/expired token/stale sync. LIKELY CAUSES: expired access token, revoked refresh token, provider auth/API failure. AUTOMATIC CAMBRA RESPONSE: P17 may refresh an eligible OAuth token through the canonical refresh path and verifies resulting connection/token state. HOW TO VERIFY: Maintenance Center integration issue disappears and token expiry is future/connection healthy. HUMAN ACTION: reconnect when refresh is unavailable/revoked or permissions changed. SAFE MANUAL ACTION: reconnect through the canonical integration UI; never paste tokens into logs/docs.

## Webhook failure
SYMPTOM: pending/exhausted WebhookDeadLetter. CAUSES: endpoint outage, network failure, non-2xx response, disabled endpoint. AUTOMATIC: bounded dead-letter retry worker; P17 may invoke the existing replay worker and verifies backlog convergence. HUMAN: exhausted/manual replay or external endpoint repair. SAFE MANUAL ACTION: inspect payload boundary and endpoint status; use admin-confirmed replay path where supported.

## Provider data stale
SYMPTOM: verified provider pricing older than freshness threshold. AUTOMATIC: Provider Intelligence maintenance refresh; unresolved/conflicting intelligence remains surfaced. VERIFY: observed_at/source/freshness updated without deleting history. HUMAN: source unavailable, material conflict or contractual private-rate uncertainty.

## Incomplete analysis
SYMPTOM: missing evidence/insufficient confidence/result blocked. AUTOMATIC: no invented fallback. Analyzer/ECL stay fail-closed. HUMAN: connect/upload better evidence or resolve review case. SAFE MANUAL ACTION: obtain source statement/data; never mark unverified evidence verified.

## Negotiation stuck
SYMPTOM: next_action overdue, awaiting provider/CAMBRA, paused thread. AUTOMATIC: supervisor/follow-up worker may resume routine due work if policy and emergency controls allow. HUMAN: material/final offer, unverified referral, quality gate, missing provider contact or SAFE MODE. SAFE MANUAL ACTION: inspect Negotiation War Room and thread evidence; do not accept material terms outside approval.

## Migration failed/blocked
SYMPTOM: MigrationTask blocked/Developer verification failed. AUTOMATIC: P17 detects long blockage; Developer may investigate. HUMAN: credentials, provider dependency, material go-live/cutover, failed production verification. SAFE MANUAL ACTION: use canonical migration task update or guarded Developer rollback; do not force activation state.

## Invoice mismatch
SYMPTOM: reconciliation_status mismatch/error. AUTOMATIC: read-oriented Recover billing reconciliation may converge transient drift. P17 can invoke only that existing reconciler. HUMAN: persistent mismatch, dispute, legal/tax issue, frozen economics conflict. SAFE MANUAL ACTION: inspect Invoice/PaymentEvent/Stripe evidence; do not rewrite frozen amounts.

## Provider revenue missing/mismatch
SYMPTOM: provider statement mismatch or outstanding entitlement. AUTOMATIC: provider reconciliation/recovery machinery can identify discrepancies. HUMAN: contract interpretation, legal entitlement, invoice/self-billing/tax evidence. SAFE MANUAL ACTION: use provider economics command center and governed recovery.

## Agent degraded / stuck
SYMPTOM: repeated recent failures or task running >6h. AUTOMATIC: stale tasks may be conservatively closed as failed; degraded agent creates incident/Developer investigation rather than code mutation. HUMAN: repeated root cause, external dependency, security/material domain. SAFE MANUAL ACTION: inspect AgentTask/incident evidence; pause the affected domain or SAFE MODE if external effects are at risk.

## API unavailable
SYMPTOM: integration error, repeated function failures, provider outage. AUTOMATIC: bounded retries only where implemented; P17 escalates unresolved external/API failures. HUMAN: sustained outage or fallback decision. SAFE MANUAL ACTION: pause affected external-effect domain; do not silently switch providers if economics/contract changes.

## AI degradation
SYMPTOM: repeated agent failures, malformed output, excessive escalation/quality gate failures. AUTOMATIC: deterministic gates reject unsafe output; P17 surfaces degraded agent. HUMAN: investigate model/provider/config; use domain pause/SAFE MODE if external communication risk exists. SAFE MANUAL ACTION: disable the affected workflow/policy, preserve evidence, use deterministic operations where possible.

## Database/data issue
SYMPTOM: authoritative reads fail, duplicate/conflicting records, relationship corruption. AUTOMATIC: critical economic/ECL reads are designed to fail closed; selected reconciliation may heal known drift. HUMAN: schema/data repair or production migration. SAFE MANUAL ACTION: contain first; use Developer/approved migration tooling. Never delete audit/evidence history merely to make UI green.

## Security alert
SYMPTOM: repeated SecurityAudit failures, dependency alert, auth/permission anomaly. AUTOMATIC: detection/escalation only; P17 does not weaken security. HUMAN: engineering/security review is required. SAFE MANUAL ACTION: SAFE MODE where external effects may be unsafe, revoke affected access/API key/OAuth, preserve evidence, investigate.
