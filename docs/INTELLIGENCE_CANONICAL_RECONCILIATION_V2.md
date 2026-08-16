# CAMBRA Intelligence canonical reconciliation v2

Baseline date: 2026-08-13  
Scope: documentary and machine-readable canonical reconciliation only  
Runtime/deployment authority: none  
Root seal verdict: **8/8 `NOT_SEALED`**

## Outcome

The v2 reconciliation binds the attached normative specifications to unambiguous physical locators, imports every root requirement and acceptance-test identifier under hash-bound UIDs, records all P0 orchestration gates as open, and defines the canonical precedence, alias and compositional-seal taxonomies.

It does not add or change a Base44 function, entity, logical route, deployment artifact, release artifact, send boundary or CPIC runtime path. The topology contract remains 276 physical functions and 27 logical routes.

## Canonical source decision

`ADR-INTELLIGENCE-PHYSICAL-SOURCE-LOCATORS-001` selects these physical files only:

| Spec | Authoritative physical locator | SHA-256 | Lines |
| --- | --- | --- | ---: |
| ORCH | `CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPECxx.md` | `f64a20bd69cb46c0f767f024ebaff4cf7145ff746f80ff0e01534da316bc5123` | 7,921 |
| CIV2 | `CAMBRA_INTELLIGENCE_V2_MASTER_SPEC.md` | `48f781020c8893a439c84743703152d337e5a917348297dbb015a5bf448905c6` | 4,859 |
| ALIF | `CAMBRA_ADAPTIVE_LEAD_INTELLIGENCE_FUNNEL_MASTER_SPEC.md` | `78236a93e571ce6aa4ec095294df91e8e1c1a51f43c266cf99ff944823157d4f` | 5,989 |
| CPIC | `CAMBRA_CPIC_ULTRA_MASTER_SPECx.md` | `6279c2cb83bc9bdbab31167a6d1acbaca1a6a8c1ee5a400eb418800d599a6502` | 7,929 |

The old root and CPIC names declared inside the documents are legacy logical aliases. Physical files also exist under those old names with different bytes. They are recorded as `CONTENT_MISMATCH` + `SUPERSEDED`, with `loader_eligible=false`; no loader may resolve them by filename.

Local SHA-256 and line-count recomputation makes `source_binding=PASS`. That result is deliberately separate from `SPEC_SET_RECONCILED`, which remains `NOT_SEALED` because signed approval, complete applicability mapping and independent seal evidence are absent.

## Canonical artifacts

| Artifact | Purpose |
| --- | --- |
| `config/intelligence/composition-manifest.v2.json` | Source identities, locator ADR, artifact receipts, legacy inventory and topology constraint |
| `config/intelligence/requirement-ledger.v2.json` | All 538 `ORCH-R-*` requirements with composite UIDs and normalized-text hashes |
| `config/intelligence/acceptance-test-catalog.v2.json` | 200 ORCH tests plus 692 child tests; 22 CIV2/ALIF literal collisions remain distinct |
| `config/intelligence/orchestration-p0-remediation.v2.json` | `ROOT-OTR-001..020`, all binary closure `NOT_MET` and tests `NOT_RUN` |
| `config/intelligence/canonical-alias-map.v2.json` | Mandatory contract, document, status and legacy-seal aliases |
| `config/intelligence/scope-precedence.v2.json` | Scope-specific precedence and canonical ownership; no global file order |
| `config/intelligence/compatibility-ledger.v2.json` | Eight explicit root supersessions plus open compatibility decisions |
| `config/intelligence/root-seals.v2.json` | The exact Appendix K eight-seal DAG; every seal is `NOT_SEALED` |

Every v1 JSON artifact remains present and readable. The composition manifest marks v1 as `SUPERSEDED_FOR_CANONICAL_V2_RECONCILIATION` and `write_target=false`; no v1 file was rewritten.

## Status honesty

- The 538 root requirements are source-bound, but implementation assessment and acceptance execution are not implied. Their initial progress is `NOT_STARTED`, implementation status `TARGET`, and verification level `UNKNOWN`.
- All 892 catalogued acceptance tests are `NOT_RUN`. Structural checker tests do not retroactively become normative acceptance-test executions.
- All 20 P0 orchestration items have a useful existing base (`PARTIAL`) but binary closure is `NOT_MET`; runtime evidence arrays are empty.
- The source-binding receipt is local documentary evidence only. Runtime parity, production, external providers, legal review, data/model sufficiency and real-world validation remain unknown or blocked.

## Current source integration posture

The implementation has advanced beyond the original point-in-time audit, but
binary seals remain unchanged:

- deterministic CPIC V0/V1 contracts, P4 server-resolved context, conservative
  cost receipts and Adaptive company-first/contact-last logic exist in source;
- tenant scope, k≥10 privacy aggregates, native-currency isolation, exact P12
  lineage/eligibility gates and append-only Universal Experience projections
  exist in source;
- runtime identity now requires deployment-owned Git/source/bundle/topology/
  scheduler hashes and exact 276/27 topology; caller assertions cannot create a
  PASS;
- the five canonical SLOs remain `UNKNOWN` until complete durable attempt
  receipts and real measurement windows exist;
- AgentTask envelope migration remains partial (the generated inventory, not a
  claim, is the authority for adapted versus unadapted writers);
- emergency, scheduler, approval, send, suppression and cost boundaries have
  expanded source hardening, but authenticated race/containment/runtime drills
  are still required by their OTR closure criteria.

These facts update `source_evidence_refs` and blocker wording only. They do not
change any of the 20 `NOT_MET` OTR items, 892 `NOT_RUN` acceptance tests or eight
`NOT_SEALED` root seals.

## Validation

Run the repository-only integrity check:

```bash
npm run intelligence:canonical:check
```

Reverify the attached source bytes as well:

```bash
CAMBRA_INTELLIGENCE_SPEC_DIR=/path/to/attached/specs npm run intelligence:canonical:check
```

Regeneration is explicit and requires the same source directory:

```bash
CAMBRA_INTELLIGENCE_SPEC_DIR=/path/to/attached/specs npm run intelligence:canonical:generate
```

The checker fails on source identity, artifact hash, UID/text hash, count, collision, P0 status, alias, precedence, v1 lifecycle or seal-DAG drift. External source reverification is reported as `NOT_RUN` unless the source directory is provided; it is never silently reported as passed.

## Remaining blockers

This slice does not close any compositional seal. At minimum, closure still needs attributable approval/signature evidence, requirement-to-test and applicability mapping, resolved open compatibility ADRs, executable test evidence, authenticated runtime parity, child seal attestations, P0 binary closure, SLO/drill evidence and scope-bound real-world outcomes. Until those exist, the mandatory response is `NOT_SEALED`.
