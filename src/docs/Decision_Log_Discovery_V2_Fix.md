# Decision Log — Discovery V2 real fix (DSCV2, 2026-08-16)

Scope: PROMPT_FIX_DISCOVERY_V2 Parte 1 (Fases A–I). One commit block. No
outbound side effects were added; Discovery still never sends messages.

## What was actually broken (verified, not assumed)

1. **Enrichment was a no-op.** `leadEnrichmentAgent/entry.ts` short-circuited
   every non-`CONTACT_RESOLUTION` operation and returned
   `NO_COMPANY_ENRICHMENT_ADAPTER_CONFIGURED` without doing anything, so
   Discovery V2's `SELECTIVE_COMPANY_ENRICHMENT` stage spent nothing and wrote
   nothing.
2. **The Apollo→Instantly cutover could never fire.**
   `InstantlySuperSearchLeadProvider.status()` hard-returned `BLOCKED` even
   when configured and permission-verified; `searchCompanies()` always threw;
   and `discoveryV2Admin.ts` never consulted `selectLeadIntelligenceProvider`
   — it derived the provider directly from `run.selected_sources`.
3. **Founder result actions did not move `OutboundLead.stage`.**
   `ADD_TO_GROWTH` only touched `revenue_stage`/`reservoir_state`;
   `pipeline_transition_json` was initialized empty and never written.
4. **No stage function had a behavior test** — only `toContain` greps.

## Decisions taken (not 100% explicit in the prompt)

- **Cutover mode mapping.** A run whose founder chose `INSTANTLY` forces that
  provider (`mode: 'INSTANTLY'`); a run configured with `APOLLO` means "paid
  discovery" and uses `mode: 'AUTO'`, so the contract cutover
  (`APOLLO_CONTRACT_EXPIRES_AT = 2026-09-07T23:59:59.999Z`) and the pre-expiry
  auth-failure failover apply without a deploy. Instantly availability is
  resolved from the SAME evidence the runtime lock uses: `INSTANTLY_API_KEY`
  plus `CommercialProviderState.metrics_json.supersearch_permission_verified
  === true`. The manual founder lock was NOT bypassed.
- **Failover evidence.** A pre-expiry Apollo auth failure (401/403/auth-shaped
  error) falls over to Instantly only if genuinely available, and always
  writes an `OperationalLog` row (`event_type: lead_provider_failover`) plus
  `provider_selection.failover` in the run's stage entry. With no available
  provider the stage throws `NO_AVAILABLE_LEAD_PROVIDER` — fail-visible.
- **Contact is contact-LAST, after SCORING, not inside the enrichment stage.**
  `evaluateContactResolutionEligibility` (contactLast.ts) requires the
  governed scoring snapshot (`score_breakdown_json.adaptive_lead_v0`), which
  only exists after `stageScore`'s batches. Running contact resolution inside
  `SELECTIVE_COMPANY_ENRICHMENT` would be all-skips by design. So:
  `stageEnrich` = firmography only (Apollo `organizations/enrich`, new adapter
  in `base44/shared/companyEnrichment.ts`); `stageScore` = scoring batches →
  stage transition to `scored` → `CONTACT_RESOLUTION` invocation for the same
  selected candidates. All governed gates inside the agent stay authoritative.
- **Partial enrichment semantics (C.4).** Firmography success moves
  `stage: lead → enriched` and records `enrichment_json.company_enrichment`
  (with `enriched_at`), but does NOT set `last_enriched_at` — that field is
  written by the contact path on contact success, as before. "Fully enriched"
  = firmography evidence AND a resolved `contact_email` on the same lead; the
  run records `funnel_json.fully_enriched` and `funnel_json.contacts_resolved`
  separately. A blocked/partial contact pass is recorded in the run
  (`CONTACT_RESOLUTION` stage entry, `intelligence_contribution_json`) and
  never terminates the run: contact spend gates belong to the agent's policy
  authority, not to the run.
- **TPV is never invented.** Apollo does not return TPV;
  `estimated_tpv_min_eur`/`estimated_tpv_max_eur` stay untouched by the
  adapter and the snapshot records `tpv_not_provided_by_provider: true`.
  Employee count → range bucketing is a deterministic transform of an observed
  number (raw value kept in the snapshot); revenue uses only Apollo's printed
  range string, never a derived bucket.
- **Stage mapping for founder actions (E.1).** `ADD_TO_GROWTH` →
  `stage: 'outreach_ready'` (plus the existing `revenue_stage: 'qualified'`);
  `REJECT` → `stage: 'disqualified'`. Every transition appends to
  `DiscoveryExecutionRun.pipeline_transition_json.transitions` (capped at the
  last 500 entries).
- **Frontier with legacy workers (E.3).** Discovery V2 owns
  `lead → enriched → scored → outreach_ready/disqualified` for leads
  attributed to a run. `autonomousCommercialWorker` remains the single owner
  of `→ contacted` and now accepts both `scored` and `outreach_ready`
  candidates, so founder-accepted leads stay in the outreach pool instead of
  disappearing from it. Discovery V2 never sets `contacted`.
- **Fase D.1 finding — reported, not "fixed".** `buildResilientLeadScore`
  scores from observed firmography plus the ACTIVE COMMERCIAL POLICY binding
  (thresholds, market scope), not from per-run filter weights. The run's
  founder filters govern audience selection (stageDiscovery partitions),
  pre-fit exclusions and the high/medium/low classification threshold
  (`configuration_json.high_fit_threshold` used in stagePrefit/stageEnrich/
  stageScore). No run-relevant filter is silently ignored; per-run scoring
  weights would be a new feature, not a repair, and were not added.
- **Fase G.** `intelligence_contribution_json` is now populated at run
  completion (quality reconstruction, scoring coverage, contact-last outcome).
  `correction_refs` stays empty ON PURPOSE: no founder scoring-correction flow
  exists anywhere in the codebase today (verified by search); inventing one
  was out of scope. The field is documented here as reserved for the future
  correction flow, and populating it is NOT evidence this prompt must close.

## Test strategy (Fase H)

`src/lib/discoveryV2Stages.test.js` invokes the exported stage functions
against an in-memory entity store (same harness family as
`emergencyControlAdminBehavior.test.js`): cutover by simulated dates, the
manual Instantly lock, real endpoint for `searchCompanies`, provider dispatch
and failover inside `stageDiscovery` (including the OperationalLog record),
fail-visible no-provider, the firmography write-through that would have caught
this round's no-op (including "sparse Apollo payload → sparse fields, no
filler" and "no domain → no spend"), stageEnrich selectivity in both
directions, and resultAction's stage transitions + `pipeline_transition_json`
evidence + attribution/terminal guards.
`discoveryV2OperationalTruth.test.js` (concurrency/leasing) was deliberately
left untouched.
