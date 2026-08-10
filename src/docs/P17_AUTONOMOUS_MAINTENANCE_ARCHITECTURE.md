# CAMBRA P17 — Autonomous Maintenance & Self-Healing Engine

Status target: technical closure from repository evidence only.

## Actual architecture

P17 integrates existing CAMBRA recovery primitives instead of replacing them. `maintenanceEngine` runs every 10 minutes and may also be invoked by an authenticated admin. It reads authoritative operational entities, produces `MaintenanceRun` evidence, materializes or updates `AutonomyIncident`, performs only allowlisted reversible recovery, verifies the post-condition, and writes observed repair outcomes to `RemediationKnowledge`.

Core loop:

`MONITOR → DETECT → DIAGNOSE → SAFE FIX → VERIFY → LOG → LEARN → ESCALATE WHEN REQUIRED`

## Automatic repair allowlist

Only these actions are automatic:

- OAuth refresh through the existing encrypted `oauthConnector` refresh path.
- Webhook recovery through the existing bounded dead-letter processor.
- Recover billing reconciliation through the existing convergent reconciler; no charge/refund/payment creation is authorized by P17.
- Provider pricing intelligence refresh through the existing maintenance worker.
- Closure of AgentTasks that remain `running` for more than six hours, marking them failed rather than re-running potentially side-effectful work.

A repair is not recorded as resolved until its post-action verification succeeds. Failed repair attempts remain evidence and force human review.

## Human-required boundaries

Security, contracts, permissions, authentication policy, production database changes and money movement are never self-healed. Technical critical incidents may create a Developer investigation signal, but code application, merge, production cutover and guarded rollback remain governed by `developerMigrationEngine` approvals and CI evidence.

The global agent authority assertion continues to prohibit autonomous APPROVE, SIGN, SPEND and CHARGE authority.

## Monitoring coverage

The unified engine detects at minimum:

- expired OAuth tokens and integration error state;
- webhook dead-letter backlog and exhausted deliveries;
- AgentTasks stuck for more than six hours;
- statistically degraded recent agent runs;
- stale verified provider pricing (>90 days);
- Recover invoice reconciliation mismatch/error;
- provider-revenue statement mismatch;
- repeated security audit failures.

Existing scheduled subsystems remain active for ECL production health, billing reconciliation, webhook retries, provider intelligence maintenance, provider-revenue reconciliation and broader autonomous operations.

`dependencySecurityWorker` adds a six-hour GitHub Dependabot watch for repositories registered as `DeveloperWorkspace`. Findings are always human-required. The CAMBRA repository itself is additionally checked with `npm audit` during technical closure/release verification; runtime Dependabot coverage requires the relevant repository to be registered and the GitHub connector to have Dependabot-read permission.

## Maintenance Center

`/admin/maintenance` exposes the latest advisory health score, active/critical issues, integrations, stale provider intelligence, agent failures, validated repair knowledge and the exact authority/truth boundary. Missing data is not promoted to healthy truth. Founder OS links directly to this surface.

## Truth model

`MaintenanceRun.health_score` is advisory. It never replaces source-domain truth.

Financial truth remains in the deterministic Invoice/Payment/ProviderRevenue ledgers and reconciliation workers. AI may explain incidents but does not calculate authoritative money state.

## Learning

`RemediationKnowledge` records successful and failed observed outcomes. Confidence is the observed success ratio over validation attempts. It cannot grant a new action permission: the code-level allowlist remains authoritative.

## Known operational dependency

Dependabot monitoring is conditional on a live GitHub connector and registered Developer workspaces. If that capability is absent or cannot query alerts, P17 creates a security-domain incident instead of silently claiming the dependency surface is healthy.
