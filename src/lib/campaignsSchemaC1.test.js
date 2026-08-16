// CAMP-C1 (2026-08-16) — schema and compatibility tests for the Campaigns +
// Inbox & Conversations canonical model (PROMPT_FIX_DISCOVERY_V2 Parte 4, C1).
//
// Per the spec's §26 anti-pattern rule, the behavior assertions here INVOKE the
// real adapters (canonicalCampaignState, projectThreadStatuses,
// suppressionMatches, buildCommercialMigrationDryRunReport) against real data.
// The purely structural assertions read the entity JSON — that is the artifact
// under test, not a proxy for behavior.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  buildCommercialMigrationDryRunReport,
  CAMPAIGN_CANONICAL_STATES,
  CAMPAIGN_LANE_TO_ENGINE,
  CAMPAIGN_LANES,
  canonicalCampaignState,
  ENROLLMENT_STATES,
  normalizeSuppressionScope,
  projectThreadStatuses,
  suppressionMatches,
  SUPPRESSION_REASON_MAP,
  THREAD_COMMERCIAL_STATUSES,
  THREAD_OPERATIONAL_STATUSES,
} from "../../base44/shared/campaignsCore.ts";

// Entity files carry a .jsonc extension but the repo convention is strict JSON:
// several existing suites (commercialOS, finalRevenueEngineSeal) parse them with
// a raw JSON.parse. This helper deliberately does the same so a comment
// introduced here fails loudly instead of breaking those suites later.
const entity = (name) => JSON.parse(fs.readFileSync(`base44/entities/${name}.jsonc`, "utf8"));

describe("C1 — entity files stay strict JSON", () => {
  it("every base44 entity parses with a raw JSON.parse (no // comments)", () => {
    const offenders = [];
    for (const file of fs.readdirSync("base44/entities").filter((name) => name.endsWith(".jsonc"))) {
      try {
        JSON.parse(fs.readFileSync(`base44/entities/${file}`, "utf8"));
      } catch (error) {
        offenders.push(`${file}: ${error.message}`);
      }
    }
    // Existing suites parse these files without stripping comments; a single
    // commented entity silently breaks them, so this guard fails first.
    expect(offenders).toEqual([]);
  });
});

describe("C1 — new canonical entities exist with the required authority shape", () => {
  const NEW_ENTITIES = [
    "CampaignAudienceVersion",
    "CampaignEnrollment",
    "CampaignContentVersion",
    "CampaignSequenceVersion",
  ];

  it("every new entity is admin-read and service-role-write only", () => {
    for (const name of NEW_ENTITIES) {
      const schema = entity(name);
      expect(schema.rls.read.user_condition.role, name).toBe("admin");
      expect(schema.rls.write.user_condition.role, name).toBe("__service_role_only__");
    }
  });

  it("the audience version records the full reconciliation, not just a count", () => {
    const properties = entity("CampaignAudienceVersion").properties;
    for (
      const field of [
        "selected_count",
        "deduplicated_person_count",
        "deduplicated_company_count",
        "recently_contacted_excluded_count",
        "suppressed_count",
        "invalid_email_count",
        "protected_market_count",
        "existing_merchant_excluded_count",
        "policy_blocked_count",
        "final_eligible_count",
        "exclusion_reasons_json",
        "content_hash",
      ]
    ) expect(properties, field).toHaveProperty(field);
    // Person-level and company-level dedupe are distinct and visible (§6.2).
    expect(properties.deduplicated_person_count).not.toEqual(undefined);
    expect(properties.deduplicated_company_count).not.toEqual(undefined);
  });

  it("the enrollment carries the shared effect identity that manual/scheduled/Command must reuse", () => {
    const properties = entity("CampaignEnrollment").properties;
    for (const field of ["enrollment_key", "operation_key", "effect_key", "revision"]) {
      expect(properties, field).toHaveProperty(field);
    }
    // Honest send lifecycle: accepted and delivered are separate states (§3.3).
    const states = properties.state.enum;
    expect(states).toContain("PROVIDER_ACCEPTED");
    expect(states).toContain("DELIVERED_OBSERVED");
    expect(states).toContain("REVIEW_REQUIRED");
    expect(states).toEqual([...ENROLLMENT_STATES]);
  });

  it("content and sequence versions can express a blocked claim and unresolved variables", () => {
    const content = entity("CampaignContentVersion").properties;
    expect(content).toHaveProperty("variable_schema_json");
    expect(content).toHaveProperty("unresolved_variables");
    expect(content).toHaveProperty("blocked_claims");
    expect(content.status.enum).toContain("SUPERSEDED");
    const sequence = entity("CampaignSequenceVersion").properties;
    expect(sequence).toHaveProperty("stop_conditions");
    expect(sequence).toHaveProperty("out_of_office_policy_json");
    expect(sequence).toHaveProperty("sequence_hash");
  });
});

describe("C1 — evolutions stay backward compatible", () => {
  it("CommercialCampaign keeps every legacy status valid while adding the canonical set", () => {
    const statuses = entity("CommercialCampaign").properties.status.enum;
    // Legacy values that existing rows already hold:
    for (const legacy of ["DRAFT", "READY_FOR_PILOT", "PILOT", "PAUSED", "ACTIVE", "COMPLETED", "ARCHIVED"]) {
      expect(statuses, legacy).toContain(legacy);
    }
    for (const canonical of CAMPAIGN_CANONICAL_STATES) {
      expect(statuses, canonical).toContain(canonical);
    }
  });

  it("CommercialCampaign keeps lead_ids required so old readers never break", () => {
    const schema = entity("CommercialCampaign");
    expect(schema.required).toContain("lead_ids");
    // ...while the versioned authorities are addressable:
    for (
      const field of [
        "audience_current_version_id",
        "content_current_version_id",
        "sequence_current_version_id",
        "approval_binding_json",
        "lane",
      ]
    ) expect(schema.properties, field).toHaveProperty(field);
  });

  it("ContactSuppression adds scopes without making any new field required", () => {
    const schema = entity("ContactSuppression");
    expect(schema.required).toEqual(["email", "reason", "active", "suppressed_at"]);
    expect(schema.properties.scope_type.enum).toEqual(["EMAIL", "PERSON", "COMPANY", "DOMAIN", "CAMPAIGN"]);
    expect(schema.properties.scope_type.default).toBe("EMAIL");
    for (const field of ["company_key", "domain", "campaign_id", "legal_basis_or_policy_ref", "created_by"]) {
      expect(schema.properties, field).toHaveProperty(field);
    }
  });

  it("OutboundProviderEvent adds signature/normalization/reconciliation without new required fields", () => {
    const schema = entity("OutboundProviderEvent");
    expect(schema.required).toEqual([
      "event_key", "provider", "event_type", "raw_event_json",
      "normalized_event_json", "status", "attempts", "first_received_at",
    ]);
    expect(schema.properties.signature_verified).toBeTruthy();
    expect(schema.properties.normalized_event_type.enum).toContain("REPLY_RECEIVED");
    expect(schema.properties.normalized_event_type.enum).toContain("HARD_BOUNCE");
    expect(schema.properties.reconciliation_status.enum).toContain("REVIEW_REQUIRED");
    expect(schema.properties).toHaveProperty("related_campaign_id");
    expect(schema.properties).toHaveProperty("related_enrollment_id");
  });

  it("CommunicationThread splits commercial from operational status without touching legacy required fields", () => {
    const schema = entity("CommunicationThread");
    expect(schema.required).toEqual(["thread_key", "engine", "status"]);
    expect(schema.properties.commercial_status.enum).toEqual([...THREAD_COMMERCIAL_STATUSES]);
    expect(schema.properties.operational_status.enum).toEqual([...THREAD_OPERATIONAL_STATUSES]);
    // The legacy fields survive untouched — old readers keep working.
    for (const legacy of ["status", "conversation_state", "classification", "automation_paused"]) {
      expect(schema.properties, legacy).toHaveProperty(legacy);
    }
  });
});

describe("C1 — legacy state adapter (behavior)", () => {
  it("maps every legacy campaign status onto a canonical one without losing meaning", () => {
    expect(canonicalCampaignState("READY_FOR_PILOT")).toEqual({
      canonical: "READY_FOR_APPROVAL", legacy: true, stored: "READY_FOR_PILOT",
    });
    expect(canonicalCampaignState("PILOT").canonical).toBe("RUNNING");
    expect(canonicalCampaignState("ACTIVE").canonical).toBe("RUNNING");
    expect(canonicalCampaignState("PAUSED")).toEqual({
      canonical: "PAUSED", legacy: false, stored: "PAUSED",
    });
  });

  it("never normalizes an unknown status into something runnable", () => {
    for (const unknown of ["", "  ", "SOMETHING_ELSE", null, undefined, 42]) {
      expect(canonicalCampaignState(unknown).canonical).toBe("REVIEW_REQUIRED");
    }
  });

  it("maps each lane to its existing engine key", () => {
    expect(Object.keys(CAMPAIGN_LANE_TO_ENGINE).sort()).toEqual([...CAMPAIGN_LANES].sort());
    expect(CAMPAIGN_LANE_TO_ENGINE.PROVIDER_RELATIONS).toBe("provider_negotiation");
    expect(CAMPAIGN_LANE_TO_ENGINE.MERCHANT_LIFECYCLE).toBe("merchant_operations");
  });
});

describe("C1 — thread status projection (behavior)", () => {
  it("prefers explicit canonical fields when present", () => {
    const projected = projectThreadStatuses({
      commercial_status: "MEETING_BOOKED",
      operational_status: "AI_HANDLING",
      classification: "objection",
    });
    expect(projected).toEqual({
      commercial_status: "MEETING_BOOKED",
      operational_status: "AI_HANDLING",
      derived_from_legacy: false,
    });
  });

  it("derives from legacy fields when the canonical ones are absent", () => {
    const projected = projectThreadStatuses({
      classification: "positive_interest",
      conversation_state: "waiting_reply",
      status: "open",
    });
    expect(projected.commercial_status).toBe("INTERESTED");
    expect(projected.operational_status).toBe("WAITING_ON_COUNTERPARTY");
    expect(projected.derived_from_legacy).toBe(true);
  });

  it("shows a founder-paused thread as paused, not as AI handling", () => {
    const projected = projectThreadStatuses({ status: "open", automation_paused: true });
    expect(projected.operational_status).toBe("PAUSED_BY_FOUNDER");
  });

  it("falls back to REVIEW_REQUIRED instead of inventing a healthy state", () => {
    const projected = projectThreadStatuses({ status: "weird_legacy_value" });
    expect(projected.operational_status).toBe("REVIEW_REQUIRED");
    expect(projected.commercial_status).toBeNull();
  });
});

describe("C1 — suppression scope evolution (behavior)", () => {
  it("treats a legacy row with no scope_type as EMAIL scope over `email`", () => {
    const normalized = normalizeSuppressionScope({ email: "Person@Example.com", reason: "opt_out", active: true });
    expect(normalized.scope_type).toBe("EMAIL");
    expect(normalized.scope_value).toBe("person@example.com");
    expect(normalized.canonical_reason).toBe("UNSUBSCRIBE");
  });

  it("maps every legacy reason onto the canonical taxonomy", () => {
    for (const legacy of Object.keys(SUPPRESSION_REASON_MAP)) {
      expect(normalizeSuppressionScope({ reason: legacy }).canonical_reason)
        .toBe(SUPPRESSION_REASON_MAP[legacy]);
    }
  });

  it("blocks a recipient through a legacy email row and through each new scope", () => {
    const recipient = {
      email: "cfo@acme.example",
      contact_id: "contact-1",
      company_key: "acme",
      campaign_id: "camp-1",
    };
    const legacyRow = { email: "cfo@acme.example", active: true, reason: "complaint" };
    expect(suppressionMatches([legacyRow], recipient).suppressed).toBe(true);
    for (
      const row of [
        { scope_type: "PERSON", scope_value: "contact-1", active: true, reason: "manual" },
        { scope_type: "COMPANY", company_key: "acme", active: true, reason: "customer_exclusion" },
        { scope_type: "DOMAIN", domain: "acme.example", active: true, reason: "legal" },
        { scope_type: "CAMPAIGN", campaign_id: "camp-1", active: true, reason: "manual" },
      ]
    ) {
      expect(suppressionMatches([row], recipient).suppressed, row.scope_type).toBe(true);
    }
  });

  it("ignores inactive rows and never matches on an empty scope value", () => {
    const recipient = { email: "cfo@acme.example" };
    expect(suppressionMatches([{ email: "cfo@acme.example", active: false }], recipient).suppressed).toBe(false);
    expect(suppressionMatches([{ scope_type: "COMPANY", active: true }], recipient).suppressed).toBe(false);
    expect(suppressionMatches([], recipient).suppressed).toBe(false);
  });
});

describe("C1 — migration dry-run reads only and flags ambiguity", () => {
  function svcWith(rows) {
    return {
      entities: new Proxy({}, {
        get(_target, name) {
          const key = String(name);
          return {
            async list() {
              if (rows[key] === "FAIL") throw new Error(`${key}_unavailable`);
              return rows[key] || [];
            },
            async update() {
              throw new Error("dry_run_must_not_write");
            },
            async create() {
              throw new Error("dry_run_must_not_write");
            },
          };
        },
      }),
    };
  }

  it("never writes, and reports what a backfill WOULD create", async () => {
    const report = await buildCommercialMigrationDryRunReport(svcWith({
      CommercialCampaign: [
        { id: "c1", lead_ids: ["l1", "l2"], audience_snapshot_json: { lead_count: 2 }, message_json: { subject: "hi" } },
        { id: "c2", lead_ids: [], audience_snapshot_json: {}, message_json: { status: "NOT_PREPARED" } },
      ],
      CommunicationThread: [{ id: "t1", brand_id: "", tenant_scope: "", sending_profile_key: "" }],
      ContactSuppression: [
        { email: "a@x.com" },
        { email: "a@x.com" },
        { email: "b@x.com" },
      ],
    }));
    expect(report.dry_run).toBe(true);
    expect(report.external_effects_performed).toBe(false);
    // Complete legacy campaign → READY; incomplete → REVIEW_REQUIRED (never guessed).
    expect(report.audience_backfill.find((row) => row.campaign_id === "c1").status).toBe("READY");
    expect(report.audience_backfill.find((row) => row.campaign_id === "c2").status).toBe("REVIEW_REQUIRED");
    expect(report.content_backfill.find((row) => row.campaign_id === "c2").status).toBe("SKIP_EMPTY");
    expect(report.risk_flags.threads_without_tenant).toBe(1);
    expect(report.risk_flags.threads_without_sending_profile).toBe(1);
    expect(report.risk_flags.duplicate_suppression_emails).toBe(1);
  });

  it("marks an unreadable source as not-ok instead of reporting zero rows", async () => {
    const report = await buildCommercialMigrationDryRunReport(svcWith({ CommunicationThread: "FAIL" }));
    expect(report.sources.threads.ok).toBe(false);
    expect(report.sources.threads.error).toContain("CommunicationThread_unavailable");
    expect(report.sources.campaigns.ok).toBe(true);
  });
});

describe("C1 — retention and disaster-recovery coverage", () => {
  it("registers the new personal-data entities in the retention matrix", () => {
    const matrix = JSON.parse(fs.readFileSync("config/data-retention-matrix.json", "utf8"));
    const categories = new Map(matrix.categories.map((row) => [row.category, row]));
    const enrollment = categories.get("campaign_audience_and_enrollment_records");
    expect(enrollment).toBeTruthy();
    expect(enrollment.automation_reference).toBe("base44/entities/CampaignEnrollment.jsonc");
    expect(enrollment.automation_status).toBe("LEGAL_REVIEW_REQUIRED");
    const content = categories.get("campaign_content_and_sequence_versions");
    expect(content).toBeTruthy();
    expect(content.automation_reference).toBe("base44/entities/CampaignContentVersion.jsonc");
  });

  it("includes every new entity in the generated disaster-recovery catalog", () => {
    const catalog = fs.readFileSync("base44/shared/generated/disasterRecoveryEntityCatalog.ts", "utf8");
    for (
      const name of [
        "CampaignAudienceVersion",
        "CampaignEnrollment",
        "CampaignContentVersion",
        "CampaignSequenceVersion",
      ]
    ) expect(catalog, name).toContain(`"${name}"`);
  });
});
