# Commercial Anthropic egress policy

The protected commercial agents are fail-closed. They cannot reserve paid AI
capacity or call Anthropic unless the deployed Base44 environment contains an
explicit, observed policy binding for the exact processing purpose.

Protected functions:

- `codeReviewAgent`
- `founderCopilotAgent`
- `qaAgent`
- `qaMonitorAgent`
- `securityAgent`

## Deployment values

Configure these values in the Base44 deployment environment, never in source:

| Variable | Contract |
|---|---|
| `CAMBRA_ANTHROPIC_EGRESS_POLICY_STATUS` | Exact value `APPROVED` only after the referenced policy has actually been approved. |
| `CAMBRA_ANTHROPIC_EGRESS_POLICY_ID` | Stable non-secret identifier for the approved policy artifact. |
| `CAMBRA_ANTHROPIC_EGRESS_POLICY_SHA256` | Lowercase 64-hex SHA-256 of that exact artifact. A placeholder hash is not approval. |
| `CAMBRA_ANTHROPIC_EGRESS_POLICY_PURPOSES` | Comma-separated allowlist of exact purposes implemented in `commercialProtectedEgress.ts`. |
| `CAMBRA_ANTHROPIC_EGRESS_POLICY_EXPIRES_AT` | Required, finite, future canonical UTC timestamp in exact `YYYY-MM-DDTHH:mm:ss.sssZ` form. Missing, offset/non-canonical, invalid, or expired values fail closed. |

The policy is observed before the AgentTask is bound, checked again in the
model router before service access/cost reservation, and re-observed a final
time after reservation immediately before network transport. A
missing, invalid, expired, or purpose-mismatched binding closes the task as
review-required with HTTP 409 and blocks automatic retry.

If approval is revoked or expires during reservation, no provider request is
started. The real reservation is settled as a no-transport failure when its
ledger reference is known; an ambiguous reservation or settlement remains
`REVIEW_REQUIRED` and is never replaced by a synthetic cost reference.

## Activation checklist

1. Approve a concrete policy document that identifies Anthropic, the five
   purposes, permitted data classes, retention, region, subprocessors, and the
   responsible owner.
2. Calculate the SHA-256 of the approved bytes and retain that artifact outside
   the application repository.
3. Configure the exact ID, hash, purpose allowlist, status, and review expiry in
   Base44.
4. Verify one blocked-policy test and one approved-policy test per purpose.
5. Confirm CostUsageEvent, provider message ID, AgentTask effect refs, and
   terminal outbox evidence reconcile for the deployed final SHA.

Do not set `STATUS=APPROVED` merely to restore functionality. Without observed
approval, the intended production state is blocked.
