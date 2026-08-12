# CAMBRA Base44 Backend Deployment Topology

## Purpose

CAMBRA keeps its logical backend modules and contracts while respecting the
physical-function limit of the linked Base44 application. The canonical source
contains 300 function directories plus the shared commercial-campaign handler.
The deployment compiler publishes 276 physical Base44 functions and hosts 25
logical handlers behind compatible, already-deployed entry points.

This is a packaging and routing boundary only. It does not change commercial
economics, authorization rules, request/response contracts or fail-closed
controls.

## Canonical files

- `base44/deployment-topology.json` is the reviewed logical-to-physical routing
  map and records the security boundary of every hosted handler.
- `scripts/build-base44-functions.mjs` builds the deployable tree.
- `base44/.deploy/functions` is generated and ignored. It is never edited by
  hand and is not the source of truth.
- `base44/config.jsonc` points the Base44 CLI at that generated tree.
- `config/scheduler-inventory.json` records both physical schedules and the
  logical workers hosted by them.

The compiler resolves each physical entry point's relative-import closure,
copies it inside that physical function and rewrites imports so no deployed
function imports outside its own directory. Nested source files named
`entry.ts` are renamed in the generated tree so Base44 cannot mistake them for
additional physical functions. The build fails if the physical count changes,
if a route or host is missing, or if a staged import escapes its function root.

## Trust boundaries

Stripe endpoints, billing operations, public webhooks and other sensitive
functions remain isolated physical entry points. The Instantly public webhook
is hosted only by the existing authenticated inbound-webhook boundary; it is
not exposed through an admin router. Founder, legal, financial and commercial
operations retain their existing strict-admin or internal-service checks.

Generic routing is limited to handlers with compatible trust boundaries:

- admin search and campaign administration use `adminSummaries`;
- commercial readiness, provider and go-live controls use
  `outboundControlAdmin`;
- legal/regulatory evaluation uses `checkMarketCapability` while legal mutation
  and regulatory scheduling use `marketPolicyAdmin`;
- cost and production-readiness work uses `maintenanceEngine`;
- P4 projection and estimate requests use `rateIntelligenceQuery`;
- European growth work uses `getEuropeMarketsCommandCenter`;
- provider reconciliation and retry work uses
  `processWebhookDeadLetters`; and
- the autonomous company coordinator uses
  `autonomousOperationsSupervisor`.

The two consolidated Admin status surfaces project their internal results to
the fields consumed by Founder Control and Growth before returning them. Gate
decisions still evaluate the complete immutable evidence, while historical
`details_json`, duplicate diagnostics and unused entity fields are omitted from
the HTTP response. This keeps responses safely below Base44's runtime payload
ceiling without weakening a gate or hiding its status, blocker, provenance,
SHA or observation time.

The complete route-level mapping is deliberately machine-readable in
`base44/deployment-topology.json` and is protected by
`src/lib/base44DeploymentTopology.test.js`.

## Workers and schedules

Hosted scheduled workers execute through active automations on their physical
hosts. Each host passes an explicit internal action to the logical worker. The
logical worker keeps its own cadence, idempotency and scheduler-claim guard.
The scheduler inventory generator rejects inactive or missing production
automations and records each hosted worker so quota consolidation cannot make a
worker silently unreachable.

## Reproducible verification

From the repository root, using the release-pinned Node and npm versions:

```bash
npm ci
npm run base44:functions:check
npm run verify
```

The Base44 deployment sequence is:

```bash
npm run base44:functions:bundle
npx base44@latest functions deploy --force
npx base44@latest site deploy -y
```

After deployment, list the remote functions and require an exact count of 276,
rerun the functions deployment and require every function to be reported as
unchanged, then run `scripts/base44-runtime-smoke.ts` against production. The
smoke suite exercises representative physical and logical routes, extractor and
Founder control reads, and confirms unsigned Stripe/public webhook requests
fail closed.

Repository verification and a successful backend deployment prove deployment
structure. They do not by themselves prove Stripe LIVE, email deliverability,
a completed scheduler cadence, backup/restore or a merchant golden path. Those
remain separate Production Seal gates and must never be inferred from this
backend deployment result.
