# CAMBRA Founder Control V2 — implementation matrix

Status: implemented in the canonical v0.97 tree. This document describes code
capability, not proof that every external production dependency is healthy.

## Architecture and quota

- Read model: existing physical function `getFounderControlCenter`, backed by
  `base44/shared/founderControlV2.ts`.
- Material mutations: existing `emergencyControlAdmin`,
  `outboundControlAdmin`, `goLiveControlAdmin` and `founderOSCommand` trust
  boundaries.
- Deployment topology before/after this change: **276 physical functions and 27
  logical routes**. No Founder Control physical function or parallel control
  entity was added.
- Stripe, billing and public webhook functions retain their isolated trust
  boundaries.

## Requirement mapping

| Requirement | Canonical implementation | Result |
|---|---|---|
| Global status | Aggregates authority, incidents and dependencies; states SAFE, LIMITED, PAUSED, EMERGENCY_STOPPED, RESUME_CHECK_REQUIRED or DEGRADED | Implemented |
| Eight capability cards | Existing controls projected for Outbound, Discovery, AI Workforce, Negotiation, Contracts/Mandates, Migration, Billing and Provider Intelligence | Implemented |
| Configured ≠ connected ≠ healthy ≠ authorized ≠ active | Explicit outbound/provider projection and effective capacity calculation | Implemented |
| Global Emergency Stop | Preview-bound confirmation, reason, idempotency key, optimistic-CAS transition, local containment, Instantly pause attempt and immutable audit | Implemented |
| Paid Discovery containment | Paid start/stage/scheduler blocked; zero-cost manual intelligence preserved | Implemented |
| Safe Resume | Selective capabilities, fresh dependency hash and checklist; no blind state restore | Implemented |
| Outbound after resume | Remains OFF; commercial policies remain paused; separate fresh CANARY preflight required | Implemented |
| Material approvals | L3/L4 only in compact view; canonical resolver, fresh state fingerprint, expiry check, atomic approve/reject claim and replay protection | Implemented |
| EN/FR/ES UI | One locale per render across states, explanations, dependencies, modals, dates, money and Ask CAMBRA scope | Implemented |
| Budget changes | Old/new/impact preview, confirmation, hard-cap validation, idempotency and audit | Implemented |
| Canary and shadow | Real commercial CANARY plus existing routing/growth shadow only; no fictitious global shadow | Implemented |
| Ask CAMBRA | Fresh bounded snapshot; prose may explain/propose but cannot mutate authority | Implemented |
| Change history | FounderCommandAudit + material OperationalLog projection | Implemented |
| Fail-closed authority read | Missing/unreadable EmergencyControl produces contained state and denies material effects | Implemented |
| Closed budget dialog | Preview fields use null-safe reads while no material preview exists; opening or confirming still requires the canonical preview flow | Implemented |

## Safe Resume gates

The selected domain is not reopened unless the required checks pass: canonical
authority sources, critical incidents, scheduler freshness, duplicate
execution, cost budget, suppression, Stripe and blocked migrations as
applicable. Security, legal and financial authority cannot be overridden by the
resume command.

## Truth boundary

This surface is a control projection, not a new source of authority. A green
card describes current canonical evidence; it does not manufacture provider,
legal, financial or production proof. Missing authority is UNKNOWN/DEGRADED and
material execution fails closed.

The closed budget dialog must remain render-safe when its modal state is null.
This is a presentation guard only: it does not synthesize a preview, relax a
confirmation requirement or change any authority, budget or outbound state.
