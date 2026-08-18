// GENERATED MIRROR — source of truth: config/dashboard/pipeline-stage-registry.v1.json
// The platform bundler cannot import JSON from outside base44/ into a backend
// function, so the registry is mirrored here as a TS module (2026-08-18).
// If the JSON changes, this file must be regenerated to match byte-for-byte.
const registry = {
  "schema_version": "cambra-pipeline-stage-registry-v1",
  "registry_version": "pipeline-stage-registry-1.0.0",
  "generated_for": "DASHBOARD CORE C2",
  "truth_boundary": "This registry declares the CANONICAL reading of pipeline stage. It does NOT change what any entity stores. The per-lane entity columns remain the authority; migrating fifteen writers onto a new vocabulary would be a live data migration and is out of scope. Frontend and backend both read stages from here so they cannot drift.",
  "conflict_rule": "When several source columns disagree about the same subject, take the LEAST-ADVANCED canonical stage and record the disagreement. Claiming progress that cannot be proven is the error class this rule exists to prevent.",
  "lane_source": "base44/shared/campaignsCore.ts:13 (CAMPAIGN_LANES) — already frozen, not redefined here.",
  "lanes": {
    "MERCHANT_ACQUISITION": {
      "authority": {
        "entity": "OutboundLead",
        "columns": ["stage", "revenue_stage", "reservoir_state"],
        "note": "THREE overlapping mutable vocabularies. The projection reads all three, maps each, and applies the conflict rule."
      },
      "stages": [
        { "key": "DISCOVERED", "order": 10, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "QUALIFIED", "order": 20, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONTACT_READY", "order": 30, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONTACTED", "order": 40, "terminal": false, "semantics": "open", "allowed_source_events": ["message_delivered_observed"], "material": false, "history_required": false },
        { "key": "ENGAGED", "order": 50, "terminal": false, "semantics": "open", "allowed_source_events": ["inbound_reply_observed"], "material": false, "history_required": false },
        { "key": "MEETING_PROPOSED", "order": 60, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "MEETING_BOOKED", "order": 70, "terminal": false, "semantics": "open", "allowed_source_events": ["meeting_booking_receipt"], "material": false, "history_required": false },
        { "key": "ANALYZER_STARTED", "order": 80, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONNECTION_REQUESTED", "order": 90, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONNECTED", "order": 100, "terminal": false, "semantics": "open", "allowed_source_events": ["connection_completed_readback"], "note": "Merchants/Integration/ConnectionSession remain the authority. Pipeline projects this milestone and never owns it.", "material": false, "history_required": false },
        { "key": "AUDIT_IN_PROGRESS", "order": 110, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "OPPORTUNITY_IDENTIFIED", "order": 120, "terminal": false, "semantics": "open", "material": true, "material_kinds": ["economic"], "history_required": true },
        { "key": "RECOVER_PROPOSED", "order": 130, "terminal": false, "semantics": "open", "material": true, "material_kinds": ["economic"], "history_required": true },
        { "key": "WON", "order": 140, "terminal": true, "semantics": "win", "note": "Reaching WON does not create a merchant. Brand/Organization onboarding is the sole authority for that.", "material": true, "material_kinds": ["economic", "terminal"], "history_required": true },
        { "key": "NURTURE", "order": 150, "terminal": false, "semantics": "nurture", "material": false, "history_required": false },
        { "key": "LOST", "order": 160, "terminal": true, "semantics": "loss", "required_fields": ["reason_code"], "material": true, "material_kinds": ["terminal"], "history_required": true },
        { "key": "DISQUALIFIED", "order": 170, "terminal": true, "semantics": "loss", "required_fields": ["reason_code"], "material": true, "material_kinds": ["terminal"], "history_required": true }
      ],
      "legacy_mappings": {
        "stage": {
          "lead": "DISCOVERED",
          "enriched": "DISCOVERED",
          "scored": "QUALIFIED",
          "outreach_ready": "CONTACT_READY",
          "waiting_window": "CONTACT_READY",
          "waiting_capacity": "CONTACT_READY",
          "suppressed": "DISQUALIFIED",
          "disqualified": "DISQUALIFIED",
          "contacted": "CONTACTED",
          "meeting": "MEETING_BOOKED",
          "won": "WON",
          "lost": "LOST"
        },
        "revenue_stage": {
          "discovered": "DISCOVERED",
          "enriched": "DISCOVERED",
          "qualified": "QUALIFIED",
          "outreach_ready": "CONTACT_READY",
          "contacted": "CONTACTED",
          "engaged": "ENGAGED",
          "discovery": "ENGAGED",
          "analysis_pending": "ANALYZER_STARTED",
          "analyzed": "AUDIT_IN_PROGRESS",
          "proposal": "RECOVER_PROPOSED",
          "recover": "RECOVER_PROPOSED",
          "won": "WON",
          "lost": "LOST",
          "nurture": "NURTURE",
          "reactivation": "NURTURE"
        },
        "reservoir_state": {
          "discovered": "DISCOVERED",
          "enriching": "DISCOVERED",
          "qualified": "QUALIFIED",
          "ready": "CONTACT_READY",
          "queued": "CONTACT_READY",
          "waiting_window": "CONTACT_READY",
          "waiting_capacity": "CONTACT_READY",
          "suppressed": "DISQUALIFIED",
          "disqualified": "DISQUALIFIED",
          "converted": "WON"
        }
      },
      "mapping_notes": {
        "enriched": "Enrichment adds data; it is not commercial qualification. Mapped to DISCOVERED on purpose.",
        "waiting_window": "Waiting is an operational gate, not a stage. Mapped to CONTACT_READY.",
        "analyzed": "Analysis complete does not prove an opportunity exists, so it maps to AUDIT_IN_PROGRESS rather than OPPORTUNITY_IDENTIFIED.",
        "converted": "reservoir_state converted means it left the reservoir. Mapped to WON, and the conflict rule will demote it if the other columns disagree."
      }
    },
    "PARTNER_ACQUISITION": {
      "authority": { "entity": "PartnerProspect", "columns": ["stage"] },
      "stages": [
        { "key": "DISCOVERED", "order": 10, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "QUALIFIED", "order": 20, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONTACT_READY", "order": 30, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONTACTED", "order": 40, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "ENGAGED", "order": 50, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "MEETING_PROPOSED", "order": 60, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "MEETING_BOOKED", "order": 70, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "APPLICATION_STARTED", "order": 80, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "APPLICATION_SUBMITTED", "order": 90, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "APPROVED", "order": 100, "terminal": false, "semantics": "open", "material": true, "material_kinds": ["contractual"], "history_required": true },
        { "key": "ACTIVATED", "order": 110, "terminal": false, "semantics": "open", "material": true, "material_kinds": ["contractual"], "history_required": true },
        { "key": "FIRST_REFERRAL", "order": 120, "terminal": false, "semantics": "open", "material": true, "material_kinds": ["economic"], "history_required": true },
        { "key": "PRODUCTIVE", "order": 130, "terminal": true, "semantics": "win", "material": true, "material_kinds": ["economic", "terminal"], "history_required": true },
        { "key": "NURTURE", "order": 140, "terminal": false, "semantics": "nurture", "material": false, "history_required": false },
        { "key": "LOST", "order": 150, "terminal": true, "semantics": "loss", "required_fields": ["reason_code"], "material": true, "material_kinds": ["terminal"], "history_required": true },
        { "key": "DISQUALIFIED", "order": 160, "terminal": true, "semantics": "loss", "required_fields": ["reason_code"], "material": true, "material_kinds": ["terminal"], "history_required": true }
      ],
      "legacy_mappings": {
        "stage": {
          "discovered": "DISCOVERED",
          "enriched": "DISCOVERED",
          "scored": "QUALIFIED",
          "contacted": "CONTACTED",
          "replied": "ENGAGED",
          "meeting": "MEETING_BOOKED",
          "qualified": "QUALIFIED",
          "won": "APPROVED",
          "lost": "LOST",
          "suppressed": "DISQUALIFIED"
        }
      },
      "mapping_notes": {
        "won": "PartnerProspect.stage won means vetted and accepted, which is APPROVED. ACTIVATED, FIRST_REFERRAL and PRODUCTIVE require evidence this column does not carry, so they are never inferred from it."
      }
    },
    "PROVIDER_RELATIONS": {
      "authority": {
        "entity": "Provider",
        "columns": ["provider_monetization_status"],
        "note": "Written by providerMonetizationAgent. NegotiationCase.status is scoped to one Recover/provider pair, not to the relationship, and ProviderCandidate.state is identity discovery — neither is this lane's authority."
      },
      "stages": [
        { "key": "IDENTIFIED", "order": 10, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONTACT_RESOLUTION", "order": 20, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONTACT_READY", "order": 30, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONTACTED", "order": 40, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "ENGAGED", "order": 50, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "INFORMATION_REQUESTED", "order": 60, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "MEETING_PROPOSED", "order": 70, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "MEETING_BOOKED", "order": 80, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "PROPOSAL_REQUESTED", "order": 90, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "PROPOSAL_RECEIVED", "order": 100, "terminal": false, "semantics": "open", "material": true, "material_kinds": ["contractual"], "history_required": true },
        { "key": "NEGOTIATION_OPEN", "order": 110, "terminal": false, "semantics": "open", "material": true, "material_kinds": ["contractual"], "history_required": true },
        { "key": "RELATIONSHIP_ACTIVE", "order": 120, "terminal": true, "semantics": "win", "material": true, "material_kinds": ["contractual", "economic", "terminal"], "history_required": true },
        { "key": "NURTURE", "order": 130, "terminal": false, "semantics": "nurture", "material": false, "history_required": false },
        { "key": "CLOSED", "order": 140, "terminal": true, "semantics": "loss", "material": true, "material_kinds": ["terminal"], "history_required": true },
        { "key": "DISQUALIFIED", "order": 150, "terminal": true, "semantics": "loss", "required_fields": ["reason_code"], "material": true, "material_kinds": ["terminal"], "history_required": true }
      ],
      "legacy_mappings": {
        "provider_monetization_status": {
          "unknown": "IDENTIFIED",
          "opportunity": "IDENTIFIED",
          "negotiating": "NEGOTIATION_OPEN",
          "contracted": "RELATIONSHIP_ACTIVE",
          "active": "RELATIONSHIP_ACTIVE",
          "prohibited": "DISQUALIFIED"
        }
      },
      "mapping_notes": {
        "unknown": "unknown maps to IDENTIFIED, the weakest stage, never to a later one.",
        "prohibited": "Prohibited is a hard commercial block and maps to DISQUALIFIED."
      }
    },
    "MERCHANT_LIFECYCLE": {
      "authority": {
        "entity": "DealActivation",
        "columns": ["status"],
        "note": "PROJECTION ONLY. This lane never writes. The direct mutator is retired (HTTP 410), guardDealActivationStatus reverts illegal transitions, and every real move uses CAS."
      },
      "projection_only": true,
      "stages": [
        { "key": "REGISTERED", "order": 10, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONNECTION_REQUIRED", "order": 20, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "AUTHORIZATION_STARTED", "order": 30, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "CONNECTED", "order": 40, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "DATA_INCOMPLETE", "order": 50, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "ANALYZER_READY", "order": 60, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "AUDIT_IN_PROGRESS", "order": 70, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "OPPORTUNITY_READY", "order": 80, "terminal": false, "semantics": "open", "material": false, "history_required": false },
        { "key": "RECOVER_PENDING", "order": 90, "terminal": false, "semantics": "open", "material": true, "material_kinds": ["mandate"], "history_required": true },
        { "key": "RECOVER_ACTIVE", "order": 100, "terminal": false, "semantics": "open", "material": true, "material_kinds": ["mandate", "migration"], "history_required": true },
        { "key": "LIVE", "order": 110, "terminal": false, "semantics": "win", "material": true, "material_kinds": ["migration", "billing"], "history_required": true },
        { "key": "BLOCKED", "order": 120, "terminal": false, "semantics": "blocked", "material": true, "material_kinds": ["terminal"], "history_required": true },
        { "key": "CHURN_RISK", "order": 130, "terminal": false, "semantics": "blocked", "material": false, "history_required": false },
        { "key": "COMPLETED", "order": 140, "terminal": true, "semantics": "win", "material": true, "material_kinds": ["verification", "billing", "terminal"], "history_required": true }
      ],
      "legacy_mappings": {
        "status": {
          "detected": "REGISTERED",
          "proposed": "RECOVER_PENDING",
          "activated": "RECOVER_ACTIVE",
          "awaiting_authorization": "AUTHORIZATION_STARTED",
          "authorized": "RECOVER_ACTIVE",
          "migrating": "RECOVER_ACTIVE",
          "live": "LIVE",
          "monetizing": "LIVE",
          "paused": "BLOCKED",
          "revoked": "BLOCKED",
          "closed": "COMPLETED"
        }
      },
      "mapping_notes": {
        "revoked": "A revoked mandate is a block, not a completion.",
        "monetizing": "Monetizing is LIVE with billing attached; billing eligibility is Finance's authority, not a pipeline stage."
      }
    }
  },
  "retired_authority": {
    "entity": "DealApplication",
    "state": "ZERO_PRODUCERS",
    "evidence": "No .create() exists anywhere in the tree. submitDealApplication was deleted in FASE 1.2 with the entity at 0 rows (Decision_Log_PURGE2.md).",
    "mapping": "DEAL_STATUSES from src/lib/adminStatusConstants.js was a FRONTEND constant, never the entity enum. No mapping is provided because there is nothing to map: zero rows.",
    "rule": "Do not extend, do not project, do not resurrect."
  },
  "material_transition_rule": "A transition into a stage carrying any material kind (contractual, economic, verification, billing, mandate, migration, terminal) REQUIRES the PipelineStageEvent to persist as a condition of success. For those transitions history failure is FAIL-CLOSED: the authority move is rolled back and the call reports failure. A material change with no durable history is indistinguishable from one that never happened, and for contractual or economic effects that ambiguity is unacceptable. Non-material transitions remain fail-open: the move stands and history_recorded reports false.",
  "material_kinds": ["contractual", "economic", "verification", "billing", "mandate", "migration", "terminal"]
};

export default registry;