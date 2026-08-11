# P11 — Production security and reliability

P11 treats the production seal as an evidence decision, not a label. The threat model in `config/p11-threat-model.json` covers tenant escape/IDOR, privilege escalation, secrets, prompt injection, SSRF, XSS, CSRF/replay, injection, uploads, webhooks, OAuth, API/model abuse, money integrity, disaster recovery and dependency supply chain.

Critical/high open `ProductionFinding` records block technical completeness. A full seal additionally requires remote GitHub CI on the final SHA, Base44 runtime proof, a real restore exercise meeting RPO/RTO, dependency-monitor proof and a multilingual redacted real-document extractor evaluation. Local mocks, plans and generated reports cannot satisfy those gates.

The canonical SLO catalog covers Analyzer submission, document extraction, commercial sending, billing reconciliation and the company orchestrator. Fewer than 20 observations is `INSUFFICIENT_EVIDENCE`, never green.

## Document and invoice extractor audit

The v2 extractor remains tenant-scoped and dual-model/fail-closed. P11 additionally requires field-level evidence/confidence, caps the response stream before buffering, verifies extension and magic bytes, stores no raw model response, blocks projection without independent agreement and only projects EUR payment statements spanning 20–35 days. Quarterly/annual totals and invoices remain auditable documents but cannot silently become monthly Analyzer inputs. Vault metadata creation accepts only Base44 media URLs, allowlisted types/categories and bounded file sizes.

Production verification still requires a DPA/retention decision and a redacted real multilingual golden corpus with field precision/recall, false-accept and manual-review rates.

## Disaster recovery

RPO target: 24 hours. RTO target: 8 hours for the first production stage. These are targets until a `REAL_RESTORE` exercise records backup identity, restored target, observed RPO/RTO and integrity checks. A tabletop is useful but cannot pass the release gate.

## Current truth

Local code can be technically complete while P11 remains `BLOCKED / NOT SEALED`. Remote CI, production runtime, real restore and extractor corpus evidence must be tied to the final immutable commit SHA where applicable.
