# P2 — European Provider Intelligence Foundation

P2 extends the existing `Provider`, P1 market registry, P12 evidence/conflict ledger and existing Knowledge Graph semantics. It does not create a second provider system and does not implement P3 pricing normalization.

Hard invariants: exactly 33 markets; FR included; LI independent from CH; BG current currency EUR; provider ≠ legal entity ≠ product ≠ payment method; availability is provider × product × market × channel; UNKNOWN ≠ UNAVAILABLE; negative availability requires evidence; no country-to-country inheritance without explicit source scope; estimates never become verified economic truth; unverified observations do not receive `verified_at`; pricing visibility and pricing model are independent; achievable rates remain outside P2.

Legacy `PaymentsRateTable` remains compatibility-only. Generic placeholders and estimates are not canonical Provider facts. P2 is additive and downstream migration should use adapters/shadow reads until P3/P4 replace legacy economics safely.
