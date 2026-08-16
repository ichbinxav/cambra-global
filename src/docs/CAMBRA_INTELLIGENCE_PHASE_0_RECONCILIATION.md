# CAMBRA Intelligence — Phase 0 Reconciliation

Status: **static Phase 0 governance implemented; runtime and production unverified**  
Baseline captured: 2026-08-13T03:49:26Z  
Git HEAD observed: `a52b65949d30635a794d6823564b5c54a89688a7`  
Working tree at capture: dirty (81 modified/staged, 43 untracked)  
Observed tree hash: `sha256-tree-v1:69950239cf6dd1b86ab50fd0b65d96c29fa6468621d52096de0c30f8f4f7f51d` (1,601 files)

The observed hash is a point-in-time audit baseline, not a release identity. Concurrent edits were active, `RELEASE.json` remained `NOT_GO_READY`, and no Base44 runtime parity was established. It cannot support a production or intelligence seal.

## Source specifications

> Supersession notice (2026-08-13): the v1 ledger below is retained only for
> read compatibility. The authoritative composition is now
> `docs/INTELLIGENCE_CANONICAL_RECONCILIATION_V2.md` plus
> `config/intelligence/composition-manifest.v2.json`. Those artifacts bind the
> expanded `SPECxx` orchestration root and `SPECx` CPIC bytes explicitly; the
> old filenames in this historical table are not loader-eligible authority.

| Namespace | Specification | SHA-256 | Major ledger rows |
|---|---|---:|---:|
| CIV2 | `CAMBRA_INTELLIGENCE_V2_MASTER_SPEC.md` | `48f781020c8893a439c84743703152d337e5a917348297dbb015a5bf448905c6` | 37 |
| ORCH | `CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPEC.md` | `4cdaa0daded4576eb297fd752f4b09aeb44830db28ebe7ab96a4511c61eafb06` | 38 |
| CPIC | `CAMBRA_CPIC_ULTRA_MASTER_SPEC.md` | `3d4f178a0092ad798be7a874e15571e1b40352ead9a417ddc4e0c1afa771e086` | 56 |
| ALI | `CAMBRA_ADAPTIVE_LEAD_INTELLIGENCE_FUNNEL_MASTER_SPEC.md` | `78236a93e571ce6aa4ec095294df91e8e1c1a51f43c266cf99ff944823157d4f` | 46 |

The persistent ledger contains 177 major requirements. It separates:

- `capability_state`: `EXISTING | PARTIAL | TARGET`;
- `delivery_status`: `NOT_STARTED | IN_PROGRESS | IMPLEMENTED | VERIFIED | BLOCKED | DEFERRED | SUPERSEDED`.

No requirement is `VERIFIED`; no gate is `PASSED`.

## ADR — Shared contracts and reuse before new resources

Decision: CAMBRA Intelligence will integrate existing authorities through eight shared semantic contracts—Identity, Time, Evidence, Decision, Execution, Outcome, Learning and Model. A shared contract may use adapters over several domain records; it does not imply one new physical table.

Binding decisions:

1. `IntelligenceEvidence` remains the intelligence evidence ledger. Domain `EvidenceAssertion` / `EvidenceAttestation` retain verification roles and reference it where appropriate.
2. `IntelligenceOutcome` is the learning projection, while Verified Savings, billing, acquisition and growth outcomes remain their domain truth.
3. `Brand` remains merchant/tenant authority; `OutboundLead` remains the outbound company candidate; `Provider` remains operational provider authority until runtime data proves a `CanonicalProvider` migration path.
4. P4 statistical primitives are extended for CPIC. No parallel benchmark or probabilistic store is created.
5. `CostBudgetControl` / `CostUsageEvent` / `costGovernance` remain the single paid-action control plane.
6. `Approval`, authority snapshots, mandates and emergency controls remain deterministic. Models never approve, sign, spend, charge or certify value.
7. Universal Experience is one semantic envelope over existing sources where safe. It is not automatically a new table.
8. No Feature Registry, Label Registry, Dataset Registry, Model Registry or Training Run is created in Phase 0. Each remains `TARGET_NEW_AFTER_GATE` and requires an ADR, data sufficiency, lifecycle design, privacy/deletion analysis and Base44 quota assessment.
9. Existing bounded orchestrators and shared modules are reused. A new physical “brain” or super-orchestrator requires proof that current routed entry points cannot safely host the behavior.
10. Static source presence never proves runtime integration.

## Machine-readable artifacts

The following are legacy v1 artifacts. They are not the canonical v2 write
target and cannot issue a root seal:

- `config/intelligence/requirement-ledger.v1.json`
- `config/intelligence/spec-compatibility-matrix.v1.json`
- `config/intelligence/resource-reuse-matrix.v1.json`
- `config/intelligence/shared-contract-map.v1.json`
- `config/intelligence/gates.v1.json`

Validate with:

```bash
node scripts/check-intelligence-ledger.mjs
```

If the four source specification files are available, verify their real bytes too:

```bash
CAMBRA_INTELLIGENCE_SPEC_DIR=/path/to/specs node scripts/check-intelligence-ledger.mjs
```

## Gate posture

All 32 section/seal gates remain fail-closed. The most immediate blockers are:

- immutable clean source identity;
- Base44 artifact/runtime parity;
- Discovery backend continuity, filter fidelity and immutable result attribution;
- shared identity and Universal Experience;
- CPIC distribution/calibration/support contracts;
- defensible learning eligibility, dataset and model lifecycle;
- tenant, authority, cost and full golden-path runtime evidence.

The next implementation slice must start from these artifacts and update them continuously. It must not declare `INTELLIGENCE_FOUNDATION_INTEGRATED`, `CPIC_INTEGRATED`, `ADAPTIVE_LEAD_INTEGRATED`, a model-ready seal or `FULL_CAMBRA_INTELLIGENCE_LOOP_VERIFIED` from code presence or local tests alone.
