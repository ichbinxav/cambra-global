# P10 — European regulatory control

P10 supplies a deterministic, versioned market × activity control layer. It covers 33 markets and 17 material activities. The conservative seed creates 561 `LEGAL_REVIEW_REQUIRED` policies and zero permission claims. Missing policy, stale policy, uncertain evidence or unknown status is never `ALLOW`.

An `ALLOW` decision requires a current policy plus current, human-verified primary-authority evidence. Registration, authorization, partner mandate, passporting, host notification and policy conditions are checked separately. An EU/EEA relationship is never treated as automatic passporting. `PROHIBITED`, missing authority and missing conditions cannot be averaged away or overridden by AI, growth value or a generic admin policy override.

The P10 decision is composed into CAMBRA's existing production `assertMarketCapabilityAllowed` gate. Existing shadow/legacy rollout remains observable, while an explicitly enforced or production market must pass both P1 and P10. Decisions are persisted in `ComplianceDecision` and linked to policy/evidence versions.

Continuous monitoring flags policy/evidence review debt and expiring registrations. It cannot update or promote a legal conclusion.

## Seal boundary

The software control architecture and conservative coverage can be verified locally. P10 cannot be declared legally sealed until qualified review has supplied and approved current primary-authority evidence for every market/activity CAMBRA intends to execute. The repository intentionally contains no fabricated authorizations, registrations or legal conclusions.
