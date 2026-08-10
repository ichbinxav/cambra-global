# P18 EMERGENCY CONTROLS — v0.79.0

This file inventories controls that ACTUALLY exist. A missing/unified control is marked PARTIAL/MISSING instead of being documented as imaginary capability.

## SAFE MODE — IMPLEMENTED

Canonical control: `base44/functions/emergencyControlAdmin/entry.ts` + `EmergencyControl`.

Activation requires exact founder confirmation `ACTIVATE_CAMBRA_SAFE_MODE`.

SAFE MODE blocks:
- new external communications through `commercialSendMessage`;
- provider and Aggregate negotiation execution;
- new payments migration starts;
- new Recover invoice issuance.

It additionally disables the existing global acquisition outbound control and pauses active commercial policies.

SAFE MODE deliberately DOES NOT stop:
- monitoring and health checks;
- billing reconciliation / observation of processor truth;
- evidence/audit persistence;
- incident investigation;
- obligations/economic rights already earned before the pause;
- read-only Founder OS / documentation queries.

Restoration requires exact confirmation `RESTORE_CAMBRA_AUTONOMY`. Restoration clears SAFE MODE and restores the P18 emergency flags to their previous values, but it DOES NOT automatically reactivate commercial policies or the OutboundControl sending switches that SAFE MODE conservatively paused. Those narrower commercial controls must be reviewed and explicitly reactivated after containment.

## PAUSE ACQUISITION — IMPLEMENTED

`outboundControlAdmin` can pause all acquisition sending (`pause_all`) and separately pause premium Outlook or volume Resend paths. Commercial policies can also be paused. Deliverability monitoring can automatically pause the volume profile when bounce/complaint thresholds are exceeded.

## PAUSE EMAILS / EXTERNAL COMMUNICATION — IMPLEMENTED

P18 `communications_paused` / SAFE MODE is enforced in the canonical `commercialSendMessage` boundary and in major user-facing lifecycle email execution paths (Recover contract delivery, monthly savings summaries, newsletter execute, legacy approved outreach, welcome/join/call-request confirmations). Existing per-thread suppression and sending-profile pause controls remain narrower layers underneath it. Internal founder/operational alerts may continue intentionally so containment does not blind the operator.

## PAUSE NEGOTIATIONS — IMPLEMENTED

P18 `negotiations_paused` / SAFE MODE is checked by provider and collective negotiation agents. Commercial policy/thread pauses remain additional controls.

## PAUSE MIGRATIONS — IMPLEMENTED FOR NEW STARTS / PARTIAL FOR IN-FLIGHT EXECUTION

P18 `migrations_paused` / SAFE MODE blocks `startPaymentsMigration`. It does not automatically roll back or destroy already-running migration evidence/tasks. In-flight migration containment must use the canonical task/Developer/go-live governance paths. Automatic forced rollback would be unsafe and is intentionally absent.

## PAUSE BILLING — IMPLEMENTED FOR NEW ISSUANCE

P18 `billing_issuance_paused` / SAFE MODE blocks `createEligibleRecoverInvoices` before new invoice issuance. Reconciliation, processor-state observation and already-existing invoice/payment obligations continue. This is intentionally not a switch that falsifies or freezes financial truth.

## DISABLE INTEGRATION — PARTIALLY_IMPLEMENTED

Provider-specific disconnect/revoke controls exist (including Stripe/OAuth paths), and unhealthy integrations are monitored. There is no single generic destructive “disconnect every integration” button because providers have different revocation semantics. Use canonical provider-specific disconnect/revoke functions.

## REVOKE ACCESS — IMPLEMENTED

API keys and OAuth authorization/token paths have canonical revocation functions. Use them for compromised or no-longer-authorized access. Revocation is not replaced by deleting audit records.

## PAUSE AGENT — PARTIALLY_IMPLEMENTED

There is no universal persisted kill switch for every internal/read-only agent. External-effect agents are bounded through policies, thread pauses, outbound controls and P18 SAFE MODE; Developer cutover remains approval-gated. Read-only monitoring/maintenance intentionally continues during SAFE MODE.

Do not claim “PAUSE ANY AGENT” as universally implemented until an explicit agent-level control is enforced by every relevant runtime boundary.

## REAL PAYMENT ROUTING — ALREADY DISABLED

P13 routing is SHADOW ONLY. There is no production routing activation path to pause. Future live routing must ship its own real-time circuit breaker/kill switch together with the other unresolved P13 activation gates.

## Emergency operating sequence

1. Activate SAFE MODE when scope is broad or uncertain.
2. Preserve evidence and identify affected domains.
3. Use Maintenance / Founder OS / Developer investigation to diagnose.
4. Revoke specific compromised access where necessary.
5. Apply only canonical, verified recovery paths.
6. Verify the original failure no longer reproduces.
7. Restore SAFE MODE.
8. Explicitly review/reactivate commercial policies and outbound sending controls as appropriate.
9. Record the incident/postmortem and update troubleshooting/remediation documentation.
