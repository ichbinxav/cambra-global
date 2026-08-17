# AUDIT — Domain H: dead code by disconnection

**Date:** 2026-08-17
**Instrument:** `scripts/audit-sweep.mjs` pattern P6 (definition versus real use), then each candidate
verified by hand.

---

## Finding H-1 — six modules are built, tested, documented, and called by nothing

This is the class the audit prompt named: `campaignExecutionEngine.ts` before C6, the
`CommandReceipt` ledger before C6. Dead by **disconnection**, not by design — the code works, the
tests pass, a decision log says the capability was delivered, and no production path reaches it.

Each one was verified individually with a full-tree search, not assumed from the import graph.

| Module | Built in | Every reference outside itself |
| --- | --- | --- |
| `base44/shared/campaignMetrics.ts` | Campaigns C4 | its test, its decision log |
| `base44/shared/campaignsIntegration.ts` | Campaigns C8/C9 | its test, its decision log |
| `base44/shared/conversationFollowUp.ts` | Campaigns C6/C7 | its test, its decision log, the C0 gap map |
| `base44/shared/evidenceReviewCore.ts` | **Dashboard C5 (mine)** | its test, its decision log |
| `base44/shared/commandLegacyChatMigration.ts` | Command C1/C2 | its test, two decision logs |
| `base44/shared/senderHealthAndSuppressions.ts` | — | its test only |

`evidenceReviewCore.ts` is mine. I built it in Dashboard C5, wrote its decision log, and never
wired it to a route or a page. The decision log reads as though the capability exists.

**Why this matters more than ordinary dead code:** the decision logs are the record the founder
reads to know what the platform can do. Six of them describe capabilities with no way to invoke
them. That is not a tidiness problem, it is a **documentation defect** — the log and the runtime
disagree, and the log is the one people trust.

### Not fixed here, and why

Wiring a module to a surface is a **scope decision**, not a bug fix. Each of these has a real
choice behind it:

- `evidenceReviewCore` — the Audits workspace could host an evidence-review tab, or review could
  stay a Merchants-side action. C5 did not decide, and neither should this audit.
- `campaignMetrics` / `campaignsIntegration` / `conversationFollowUp` — Campaigns already renders
  metrics from somewhere; whether these replace that path or duplicate it needs a look at both.
- `commandLegacyChatMigration` — a one-shot migration may be correct to leave unwired until it is
  run deliberately. That is arguably its design.
- `senderHealthAndSuppressions` — sender health has a real owner somewhere in the outbound path;
  this may be a second implementation.

Per the prompt's authority rule, these are recorded as findings with recommendations. The
recommendation for all six is the same and it is cheap: **either wire it or delete it, and in both
cases correct the decision log that claims it exists.** Leaving a third state — built, documented,
unreachable — is what produced this finding.

### False positives the sweep produced, and why they matter

Three modules the pattern flagged are genuinely wired, and the detector missed them because it only
followed static `from '…/name.ts'` imports:

- `p3SeedData.ts` → `seedP3RateIntelligence/entry.ts`
- `commandCitationGuard.ts` → `founderChiefOfStaff/entry.ts`
- `maintenanceCore.ts` → `maintenanceEngine/entry.ts` and `documentationRegistry.ts`

Recorded because a sweep whose false-positive rate is undocumented gets used as a verdict. The
detector is a **candidate generator**; every one of the twelve was read before six were confirmed.

---

## Finding H-2 (negative, verified) — the EmergencyControl category class is clean

Pattern P7 checked every value declared in any enum on `EmergencyControl.jsonc` against the code
that actually blocks on it. **Zero categories are declared without blocking code.**

The `ai` category that lacked an emergency capability was an instance of a class, and the prompt
asked for the class rather than the instance. The class has no other members. Reported as a
negative result because "we checked and there is nothing" is a finding, and leaving it unsaid
would let the same question be re-asked forever.

---

## Finding H-3 (negative, verified) — Recover billing math is exact

Domain A's sweep flagged `base44/shared/recoverBillingMath.ts` for float money arithmetic with no
`BigInt` import. **Read, and it is correct.** Integer minor units throughout, a documented
half-up rounding policy, `divRoundHalfUp` operating in integer space, tax computed on the
already-rounded net fee, and `eurToMinor` carrying an explicit IEEE-754 epsilon guard for the
`19.995 * 100 = 1999.4999…` case.

Integer cents in a JS `Number` are exact to 2^53 — about 90 trillion euros — so `BigInt` is not
required for this module and its absence is not a defect. **The heuristic over-flagged.**

This is recorded because the sweep's output includes 223 lines of "float money arithmetic with no
exact-money import", and the single most important file in that list is right. Any use of that
list has to start from that fact.
