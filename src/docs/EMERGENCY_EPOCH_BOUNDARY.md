# Emergency epoch and external-effect boundary

Status at source snapshot: ROOT-OTR-002: **NOT_MET**. ROOT-OTR-003: **NOT_MET**.

This is an implementation and test inventory, not runtime proof. The binary OTR
ledger remains unchanged because an authenticated concurrent Base44/provider
drill has not run against the final deployed SHA.

## Source controls implemented

- `EmergencyControl.control_revision` is captured as a monotonic epoch. Exact
  singleton id and revision are re-read immediately before and after material
  effects. STOP followed by RESUME cannot authorize a stale claim.
- Authenticated internal children can inherit an epoch, but the child re-reads
  singleton authority before adopting it. Provider negotiation, aggregate
  procurement, commercial approval and their final send share the original
  epoch instead of silently recapturing a newer one.
- Instantly queue/reply, Outlook draft/send, Resend send, Base44/Core email,
  Taplio/Typefully publication, public Insight publication, Outlook meetings,
  paid provider contact lookup, Stripe invoice/payment-link/setup effects,
  local billing issuance/provider-payment mirrors and Developer migration
  effects have explicit final-boundary fencing.
- Successful provider responses followed by a stale epoch are never returned as
  success. They become `REVIEW_REQUIRED`/ambiguous and do not receive a blind
  automatic retry.
- Communication containment invalidates every visible `OutboundControl`
  authority row, disables acquisition plus the affected transport, clears
  transition claims and pauses all visible matching sending profiles. A full
  bounded page is treated as incomplete, never as proof of coverage.
- Founder Safe Mode records separate Outlook, Resend and Instantly containment
  results in the durable command audit. Any unreadable, truncated or failed
  transport is persisted as `CONTAINMENT_INCOMPLETE` and the command cannot
  return `ok: true`; a critical, Founder-owned `AutonomyIncident` is opened for
  reconciliation.
- Instantly additionally attempts remote campaign pause. Outlook draft/event
  creation has compensating delete where a remote identifier exists. Resend and
  already-sent Outlook messages have no honest recall guarantee, so their local
  transport is disabled and the effect remains ambiguous for reconciliation. A
  configured Outlook/Resend transport therefore forces
  `CONTAINMENT_INCOMPLETE`; local containment is never labelled remote proof.
- Paid `api` and `enrichment` reservations capture the `paid_discovery` epoch
  before any cost mutation. `paidProviderFetch` reuses that same claim around
  the provider request for every current or future provider, instead of relying
  on a provider-name allow-list. Only explicitly allow-listed inbound/reconcile
  readers can use the zero-effect `read_only_reconciliation` mode. Provider
  adapters with their own retry loops revalidate the same claim around every
  attempt and never retry an ambiguous/stale emergency result.
- Stripe race receipts are typed and prefix-validated (`in_`, `ii_`, `cus_`,
  `txi_`). Only a verified invoice checkpoint can ever populate
  `Invoice.stripe_invoice_id`.
- Founder runtime gates require a mandatory fresh expiry, an exact comparison
  with the complete deployment-owned runtime identity, and recomputed canonical
  identity/evidence hashes. Legacy, forged or field-tampered PASS rows resolve
  to blocked capacity.

## Why binary closure remains NOT_MET

ROOT-OTR-002 requires a stale run to prove zero external effects. A control
transition can occur while a network request is already executing; the provider
may accept the effect before CAMBRA observes the newer revision. Source code can
detect and contain that race, but only provider receipts from a controlled
concurrent drill can prove the exact observed outcome.

ROOT-OTR-003 requires every configured outbound provider to be locally blocked
and remotely verified paused. Local containment is implemented. Instantly has a
remote pause operation, while one-shot Resend delivery and a sent Outlook message
cannot be recalled. Until a drill records all configured transports and their
provider receipts, the only honest result is `CONTAINMENT_INCOMPLETE`.

## Exact remaining runtime evidence

1. Deploy the final SHA and record its source-tree hash and Base44 identity.
2. With controlled recipients/accounts, capture epoch N, start each material
   effect, issue SAFE MODE and then selective RESUME (epochs N+1/N+2) at the
   provider boundary, and retain the raw trace IDs.
3. Query provider receipts plus CAMBRA effect/idempotency ledgers to prove no
   stale success response and no duplicate retry for Resend, Outlook, Instantly,
   Stripe and a paid provider API.
4. Verify every `OutboundControl` row and every configured sending profile is
   paused; verify every Instantly campaign remotely paused. Any unreadable,
   truncated or unpausable transport must yield `CONTAINMENT_INCOMPLETE` and a
   durable incident.
5. Exercise Developer migration under the same interleaving and preserve its
   pre/post fence hashes and review-required lifecycle row.
6. Restart/reinvoke after containment and prove durable state still prevents a
   material effect until a fresh explicit activation.

Only those final-SHA runtime artifacts can change ROOT-OTR-002/003 to PASS.
