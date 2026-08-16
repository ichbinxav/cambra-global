# CAMBRA Research Knowledge Base v1

## Outcome

The eleven supplied Markdown reports are preserved byte-for-byte and integrated as a persistent, reusable, source-cited research layer. The layer reuses CAMBRA P12 intelligence ledgers and the existing `intelligenceAccess` physical function. It adds no Base44 entity, physical function, or logical route.

This is an external-research candidate system, not a truth-promotion system. No row produced by this pipeline can directly authorize execution, become a verified rate or regulatory rule, calibrate CPIC, or enter ML training.

## Preserved corpus

- Physical originals: 11
- Unique byte identities: 9
- Exact duplicate aliases: 2
- Bounded Markdown chunks: 260
- Physical bytes: 516,994
- Unique bytes: 419,567
- Valid source URLs retained: 36
- Opaque citation tokens retained but never treated as URLs: 323

Originals live under `research/external/2026-08-13/originals/`. The source manifest pins filename, repository locator, SHA-256, canonical hash, line/byte counts, capture date, headings, URLs, opaque citations and duplicate relationships. The two duplicate pairs remain physically preserved and are deduplicated only for indexing and persistence.

## Normalized knowledge

`config/intelligence/research-knowledge.v1.json` contains 31 curated, review-pending candidate records:

- 18 official-source legal candidates, each still pending direct legal review;
- provider negotiation program and historical anecdote families;
- merchant-rate, provider-coverage and country-economics candidate families;
- deliverability requirements and a separate proposed internal policy;
- time-bounded GTM events;
- two competing ICP proposals and two competing corpus proposals;
- one missing-artifact record for the non-existent package claimed by report 9.

Every record carries country or explicit country-set scope, provider, value/unit/currency where present, observed/effective/expiry dates, truth level, confidence, evidence tier/quality, provenance, freshness, source hashes/locators/URLs and target systems. All authority flags are fixed to false.

`config/intelligence/research-conflicts.v1.json` records nine explicit duplicate, contradiction, scope, evidence and staleness conflicts. Important examples are the incompatible “33-country” sets, IFR caps versus merchant discount rates, unresolved `turn…` citations, the missing report-9 ZIP, and the rule that an official URL inside a compiled report is not independent verification.

## Persistence and retrieval

The admin-confirmed `sync_research_knowledge` action writes only:

- one immutable `IntelligenceEvidence` row per unique source hash;
- one candidate `IntelligenceObservation` per normalized record;
- one `KnowledgeConflict` row per structured conflict.

The operation is idempotent, performs exact read-back checks and fails closed on ambiguous duplicates. Preview requires no write; execution requires the exact confirmation text `SYNC CANDIDATE RESEARCH`. It never writes `PaymentsRateTable`, `ProviderPricingVersion`, regulatory policy, a CPIC model/prior, or `KnowledgeClaim`.

`search_research_knowledge` performs deterministic, bounded lexical retrieval across source chunks and curated records. It supports query, country, provider, topic, truth level, date, staleness and target-system filters. Results carry citations, source date, URL/locator, truth/confidence, conflict state and explicit non-authority flags. Source excerpts are treated as prompt-injection-capable untrusted text.

## CAMBRA connections

The normalized records expose candidate adapters for:

| Existing system | Candidate records | Use boundary |
|---|---:|---|
| Agent retrieval | 31 | Source-cited advisory context only |
| Regulatory evidence queue | 18 | Direct official/legal review required |
| CPIC prior candidate | 10 | Advisory prior input only; no calibration/model claim |
| Country payments economics | 2 | Dated candidate metrics; unknown/mixed scopes remain blocked |
| Negotiation prior | 3 | Research context, never numeric anchor or commitment |
| Payments rate table candidate | 1 | Manual source/scope/freshness review before canonical promotion |

Copilot can reconstruct an admin research context server-side. Chief can call the fixed read-only research tool. Provider Research and Provider Negotiation receive bounded local context without another paid lookup. They preserve source citations and are instructed that stored mandate, current verified facts and operational policy always win.

## Future imports

Run:

```bash
npm run research:import -- --capture-date YYYY-MM-DD --source /path/to/file-or-directory
npm run research:check
```

The importer copies originals without modification, hashes and deduplicates them, extracts safe URLs and citations, creates bounded chunks and regenerates the deterministic source module. The review gate then requires every physical source to be bound into the curated catalog before the repository check passes. No automatic promotion follows ingestion.

## Verification boundary

Source, unit and build checks prove repository behavior only. Runtime persistence is not claimed until this exact source tree is deployed and an authenticated admin performs the confirmed sync against Base44, followed by entity-count and read-back evidence. No production or intelligence seal is issued by this integration.
