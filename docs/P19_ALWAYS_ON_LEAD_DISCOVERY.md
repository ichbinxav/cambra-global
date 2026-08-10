# CAMBRA Always-On Lead Discovery & Qualified Reservoir

Status: IMPLEMENTED. Discovery and outreach are separate machines.

## Machine A — Always-On Intelligence
`alwaysOnLeadDiscoveryWorker` runs hourly, all day. It invokes the existing company/contact discovery → enrichment → scoring → CRM chain only when reservoir coverage needs replenishment. It deduplicates company-first, checks suppression, classifies durable reservoir state, refreshes verification timestamps and records `LeadReservoirSnapshot` evidence.

Target: `outreach_ready / safe_daily_send_capacity`, with target days configured through founder-approved merchant acquisition policy (`icp_json.pipeline_coverage_days`, default 3). The target is policy-configurable, not a hard business rule. Healthy/excess coverage throttles paid discovery rather than accumulating low-quality records.

Unknown economics remain unknown. Discovery never fabricates GMV, PSP, fees, savings or decision-maker facts.

## Machine B — Governed Communication
`outboundVolumeWorker` no longer discovers leads. It consumes already-scored reservoir inventory only after OutboundControl, sending-profile warm-up/cap and CommercialPolicy business-hour gates pass. Therefore DISCOVERY CAPACITY != SEND CAPACITY.

## Maintenance
P17 Maintenance detects missing/stale reservoir snapshots, low coverage and elevated stale inventory. API/source errors remain visible through failed AgentTasks and degraded-agent detection.

## Durable states
OutboundLead `reservoir_state`: discovered, enriching, qualified, ready, queued, waiting_window, waiting_capacity, suppressed, disqualified, converted.
