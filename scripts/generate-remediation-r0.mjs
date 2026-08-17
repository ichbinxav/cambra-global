#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

export const MATERIAL_BOUNDARY_OUTPUT =
  "config/remediation/material-boundary-registry.v1.json";
export const TENANT_AUTHORIZATION_OUTPUT =
  "config/remediation/material-tenant-authorization-inventory.v1.json";
export const RESEARCH_CORPUS_OUTPUT =
  "config/remediation/research-corpus-inventory.v1.json";
export const EFFECT_AUTHORITY_OUTPUT =
  "config/remediation/effect-authority-registry.v1.json";

const FOUNDER_CANONICAL_RESEARCH_CORPUS = Object.freeze({
  physical_files: 11,
  unique_sha256: 9,
  exact_duplicates: 2,
});

const RESEARCH_SAFETY_POLICY = Object.freeze({
  truth_level: "UNVERIFIED_EXTERNAL_RESEARCH",
  execution_eligible: false,
  training_eligible: false,
  model_input_eligible: false,
  calibration_eligible: false,
  auto_promote_eligible: false,
});

const MATERIAL_KINDS = new Set([
  "send",
  "negotiate",
  "terms",
  "sign_mandate",
  "migrate_go_live",
  "billing_charge",
  "paid_spend",
  "provider_effect",
  "material_schedule",
  "claim_outcome_dataset_promotion",
]);

export const EFFECT_CLASS_SPECS = Object.freeze([
  {
    key: "SEND",
    literal_label: "SEND",
    material_kinds: ["send"],
    existing_authorities: [
      "internal/user gate",
      "tenant binding",
      "commercial/communication policy",
      "EmergencyControl communications",
      "sender claim/receipt",
    ],
  },
  {
    key: "NEGOTIATE",
    literal_label: "NEGOTIATE",
    material_kinds: ["negotiate"],
    existing_authorities: [
      "internal/admin gate",
      "tenant binding",
      "legal execution",
      "commercial policy",
      "EmergencyControl negotiations",
    ],
  },
  {
    key: "SCHEDULE_MATERIAL",
    literal_label: "SCHEDULE_MATERIAL",
    material_kinds: ["material_schedule"],
    existing_authorities: [
      "schedulerRun lease/fence",
      "handler-specific actor/tenant policy",
      "handler-specific EmergencyControl capability",
    ],
  },
  {
    key: "EXECUTE",
    literal_label: "EXECUTE",
    material_kinds: ["provider_effect"],
    existing_authorities: [
      "provider/domain claim",
      "actor/tenant policy",
      "EmergencyControl epoch",
      "provider idempotency/reconciliation",
    ],
  },
  {
    key: "APPROVE",
    literal_label: "APPROVE",
    material_kinds: ["terms"],
    existing_authorities: [
      "approvalAuthority hash/nonce",
      "approvalResolutionSaga",
      "actor/tenant binding",
      "domain policy",
    ],
  },
  {
    key: "SIGN_MANDATE",
    literal_label: "SIGN/MANDATE",
    material_kinds: ["sign_mandate"],
    existing_authorities: [
      "legal execution",
      "mandate/acceptance CAS",
      "authenticated owner",
      "market capability policy",
    ],
  },
  {
    key: "SPEND",
    literal_label: "SPEND",
    material_kinds: ["paid_spend"],
    existing_authorities: [
      "CostBudgetControl CAS",
      "CostUsageEvent reservation",
      "actor/tenant binding",
      "EmergencyControl inherited by provider effect",
    ],
  },
  {
    key: "BILL_CHARGE",
    literal_label: "BILL/CHARGE",
    material_kinds: ["billing_charge"],
    existing_authorities: [
      "economicExecution/domain billing authority",
      "market BILL policy",
      "EmergencyControl billing_issuance",
      "immutable provider receipt",
    ],
  },
  {
    key: "MIGRATE_GO_LIVE",
    literal_label: "MIGRATE/GO_LIVE",
    material_kinds: ["migrate_go_live"],
    existing_authorities: [
      "migration saga/DealActivation CAS",
      "legal execution",
      "market MIGRATE policy",
      "EmergencyControl migrations",
    ],
  },
  {
    key: "PROMOTE_LEARNING",
    literal_label: "PROMOTE_LEARNING",
    material_kinds: ["claim_outcome_dataset_promotion"],
    existing_authorities: [
      "intelligence tenant scope",
      "lineage/learning eligibility",
      "admin/internal policy",
      "non-executable CONTRACT_ONLY gate",
    ],
  },
]);

const EFFECT_AUTHORITY_WIRING = Object.freeze({
  "MB-SEND-COMMERCIAL": {
    route_members: ["commercialSendMessage"],
    source_paths: ["base44/functions/commercialSendMessage/entry.ts"],
    effect_classes: ["SEND", "NEGOTIATE", "SPEND", "EXECUTE"],
  },
  "MB-MANDATE-ACCEPT": {
    route_members: ["acceptRecoverMandate"],
    source_paths: ["base44/functions/acceptRecoverMandate/entry.ts"],
    effect_classes: ["APPROVE", "SIGN_MANDATE"],
  },
  "MB-MIGRATE-PAYMENTS": {
    route_members: ["startPaymentsMigration"],
    source_paths: ["base44/functions/startPaymentsMigration/entry.ts"],
    effect_classes: ["SCHEDULE_MATERIAL", "MIGRATE_GO_LIVE"],
  },
  "MB-BILL-PAYMENT-LINK": {
    route_members: ["createPaymentLink"],
    source_paths: ["base44/functions/createPaymentLink/entry.ts"],
    effect_classes: ["EXECUTE", "BILL_CHARGE"],
  },
  "MB-INTEL-CLAIM-PROMOTE": {
    route_members: ["intelligenceAdmin:set_claim_state"],
    source_paths: ["base44/functions/intelligenceAdmin/entry.ts"],
    effect_classes: ["PROMOTE_LEARNING"],
  },
});

const EXPECTED_RESEARCH_TOPICS = [
  [
    "provider_pricing_intelligence",
    "Provider Pricing Intelligence",
    "PARTIAL",
    ["R5", "R6", "R8", "R9"],
    "Public/candidate pricing is present, but it is not a complete verified provider-rate universe.",
  ],
  [
    "country_payments_economics",
    "Country Payments Economics",
    "ARTIFACT_MISSING",
    ["R9"],
    "R9 references a package/dossiers that are not retained; exact 33/33 coverage is not demonstrable.",
  ],
  [
    "scheme_network_fee_intelligence",
    "Scheme & Network Fee Intelligence",
    "PARTIAL",
    ["R6", "R8", "R9"],
    "Some components and regulatory caps are discussed; a complete current fee ledger is absent.",
  ],
  [
    "real_achievable_rate_research",
    "Real Achievable Rate Research",
    "PARTIAL",
    ["R5", "R6", "R8"],
    "Negotiation priors and public rates are candidates, not verified achieved merchant outcomes.",
  ],
  [
    "merchant_payments_benchmarks",
    "Merchant Payments Benchmarks",
    "MISSING",
    [],
    "No dedicated physical benchmark research source is present.",
  ],
  [
    "dispute_chargeback_intelligence",
    "Dispute / Chargeback Intelligence",
    "MISSING",
    [],
    "No dedicated physical dispute/chargeback research source is present.",
  ],
  [
    "provider_authorization_regulatory_intelligence",
    "Provider Authorization / Regulatory Intelligence",
    "PARTIAL",
    ["R10"],
    "The retained legal report covers eIDAS and FR/ES/33-jurisdiction framing, not a complete provider authorization ledger.",
  ],
  [
    "provider_capability_intelligence",
    "Provider Capability Intelligence",
    "PARTIAL",
    ["R5", "R6", "R8"],
    "Provider capabilities appear incidentally; integration-grade capability coverage is incomplete.",
  ],
  [
    "integration_intelligence",
    "Integration Intelligence",
    "MISSING",
    [],
    "No dedicated physical provider integration research source is present.",
  ],
  [
    "merchant_discovery_signals",
    "Merchant Discovery Signals",
    "PARTIAL",
    ["GTM-FINAL", "R7"],
    "GTM/ICP and discovery guidance exists, but not a complete continuously verified signal corpus.",
  ],
  [
    "commercial_conversion_benchmarks",
    "Commercial Conversion Benchmarks",
    "PARTIAL",
    ["GTM-FINAL", "R7"],
    "GTM priors exist; realized conversion benchmarks are not fully evidenced.",
  ],
  [
    "decision_maker_intelligence",
    "Decision Maker Intelligence",
    "PARTIAL",
    ["GTM-FINAL", "R7"],
    "Role and targeting guidance exists, but no complete verified decision-maker dataset is retained.",
  ],
  [
    "negotiation_intelligence",
    "Negotiation Intelligence",
    "PARTIAL",
    ["R5", "R6"],
    "Negotiation priors/playbooks exist and remain non-executable external research.",
  ],
  [
    "continuous_competitor_intelligence",
    "Continuous Competitor Intelligence",
    "PARTIAL",
    ["GTM-FINAL", "R7"],
    "Only static captured research exists; continuous monitoring coverage is not a physical research dossier.",
  ],
  [
    "competitor_pricing_packaging",
    "Competitor Pricing & Packaging",
    "PARTIAL",
    ["GTM-FINAL", "R5", "R8"],
    "Static pricing/packaging candidates exist without complete current verification.",
  ],
  [
    "verified_realised_value_methodology",
    "Verified/Realised Value Methodology",
    "MISSING",
    [],
    "No dedicated physical methodology research source is present.",
  ],
  [
    "payment_leakage_taxonomy",
    "Payment Leakage Taxonomy",
    "MISSING",
    [],
    "No dedicated physical leakage taxonomy source is present.",
  ],
  [
    "routing_economics_shadow_only",
    "Routing Economics — shadow only",
    "MISSING",
    [],
    "No dedicated physical routing-economics research source is present.",
  ],
  [
    "fraud_authorization_conversion_tradeoffs",
    "Fraud / Authorization / Conversion Trade-offs",
    "MISSING",
    [],
    "No dedicated physical fraud/authorization/conversion source is present.",
  ],
  [
    "merchant_switching_migration_intelligence",
    "Merchant Switching & Migration Intelligence",
    "PARTIAL",
    ["R5", "R6"],
    "Negotiation and switching incentives are discussed; full migration intelligence is absent.",
  ],
  [
    "regulation_scheme_change_monitor",
    "Regulation & Scheme Change Monitor",
    "PARTIAL",
    ["R10"],
    "A static regulatory baseline exists; continuous change-monitor research is not demonstrated.",
  ],
  [
    "patents_ip_technical_literature",
    "Patents / IP / Technical Literature",
    "MISSING",
    [],
    "No dedicated physical patents/IP/technical-literature source is present.",
  ],
  [
    "source_quality_research",
    "Source Quality Research",
    "PARTIAL",
    ["R2", "R3"],
    "Corpus/source methodology exists, while 323 opaque citations still require URL recovery.",
  ],
  [
    "false_negative_research",
    "False Negative Research",
    "MISSING",
    [],
    "No dedicated physical false-negative research source is present.",
  ],
  [
    "external_economic_outcomes_unit_economics",
    "External Economic Outcomes / Unit Economics",
    "MISSING",
    [],
    "No dedicated physical external-outcomes/unit-economics source is present.",
  ],
].map(([topic_id, label, status, source_document_ids, gap]) => ({
  topic_id,
  label,
  status,
  source_document_ids,
  gap,
}));

const BOUNDARY_SPECS = [
  {
    boundary_id: "MB-SEND-COMMERCIAL",
    material_kinds: ["send", "negotiate", "paid_spend", "provider_effect"],
    logical_route: "commercialSendMessage",
    physical_host: "commercialSendMessage",
    route_selector: null,
    callers: [
      "aggregateAgreementWorker",
      "autonomousCommercialWorker",
      "autonomousPartnerWorker",
      "collectionOperationsWorker",
      "collectiveNegotiationAgent",
      "commercialFollowUpWorker",
      "commercialReplyAgent",
      "createMerchantInformationRequest",
      "followUpAgent",
      "missingInformationWorker",
      "onboardingConciergeWorker",
      "outboundVolumeWorker",
      "outreachAgent",
      "postMeetingWorker",
      "providerMonetizationAgent",
      "providerNegotiationAgent",
      "providerRevenueRecoveryAgent",
      "resolveCommercialApproval",
    ],
    actor: "requireAdminOrInternal",
    tenant_key:
      "CommunicationThread.brand_id; _platform only for explicitly platform-scoped negotiation",
    policy: [
      "CommercialPolicy exact key/version",
      "MarketCapability production rollout",
      "AgentAuthority CAN_SEND/CAN_NEGOTIATE",
      "OutboundControl, sending profile, caps, suppression",
    ],
    emergency: {
      capabilities: ["communications", "negotiations_when_negotiating"],
      epoch: "capture/inherit + pre-effect + post-effect",
    },
    claim_primitive:
      "claimCommercialSendSlot CAS; CommunicationMessage outbound idempotency lookup",
    effect_key: "email:${idempotency_key}",
    provider_idempotency:
      "Resend Idempotency-Key; local claim for Outlook/Instantly",
    provider_reconciliation:
      "Instantly reconciliation workers; Outlook post-send reconciliation is not conclusive",
    receipt: [
      "CommunicationMessage provider/provider_message_id/idempotency_key",
      "CostUsageEvent",
      "send-slot state",
      "OperationalLog",
    ],
    status: "PARTIAL",
    gap_codes: [
      "OUTLOOK_PROVIDER_IDEMPOTENCY_PARTIAL",
      "OUTLOOK_POST_SEND_RECONCILIATION_PARTIAL",
    ],
    source_paths: [
      "base44/functions/commercialSendMessage/entry.ts",
      "base44/shared/commercialSendSafety.ts",
      "base44/shared/costGovernance.ts",
    ],
  },
  {
    boundary_id: "MB-SEND-CORE-EMAIL",
    material_kinds: ["send", "paid_spend", "provider_effect"],
    logical_route: "sendCostGovernedEmail",
    physical_host: "shared/costGovernance",
    route_selector: null,
    callers: [
      "joinCollective",
      "newsletterAgent",
      "onBrandCreated",
      "recoverBillingDigest",
      "sendMonthlySavingsSummary",
      "sendRecoverContractEmail",
      "submitCallRequest",
    ],
    actor: "Inherited from each physical caller",
    tenant_key: "Caller entity brand_id or _platform",
    policy: ["CostBudgetControl", "caller-specific communication policy"],
    emergency: {
      capabilities: ["communications"],
      epoch: "capture + pre-effect + post-effect",
    },
    claim_primitive:
      "CostUsageEvent.event_key reservation and CostBudgetControl CAS",
    effect_key: "Caller-supplied stable key, otherwise UUID-suffixed key",
    provider_idempotency:
      "Base44 Core.SendEmail exposes no independently proven idempotency key",
    provider_reconciliation:
      "No durable provider-final delivery reconciliation in shared primitive",
    receipt: [
      "CostUsageEvent",
      "caller domain log; provider message id only when returned",
    ],
    status: "PARTIAL",
    gap_codes: [
      "STABLE_EFFECT_KEY_CALLER_DEPENDENT",
      "PROVIDER_FINAL_RECEIPT_MISSING",
    ],
    source_paths: [
      "base44/shared/costGovernance.ts",
      "base44/functions/sendRecoverContractEmail/entry.ts",
    ],
  },
  {
    boundary_id: "MB-SEND-RESEND-PUBLIC-NOTIFY",
    material_kinds: ["send", "paid_spend", "provider_effect"],
    logical_route: "submitContactMessage|submitWaitlistSignup",
    physical_host: "submitContactMessage|submitWaitlistSignup",
    route_selector: null,
    callers: [],
    actor: "Public form caller after validation/rate limit",
    tenant_key: "_platform",
    policy: ["CostBudgetControl", "public form validation/rate limit"],
    emergency: {
      capabilities: ["communications"],
      epoch:
        "captured by reservation and reused immediately before/after paidProviderFetch",
    },
    claim_primitive:
      "Stable CostUsageEvent reservation keyed to the persisted Lead",
    effect_key:
      "Stable email:<form-notification>:<lead.id> plus deterministic Resend Idempotency-Key",
    provider_idempotency:
      "Stable Resend key and identical payload for the same persisted Lead; guarantee remains limited to the provider window",
    provider_reconciliation:
      "CostUsageEvent stores HTTP observation but generic paidProviderFetch does not yet retain the Resend response ID",
    receipt: ["CostUsageEvent", "Lead/contact row"],
    status: "PARTIAL",
    gap_codes: [
      "PROVIDER_FINAL_RECEIPT_MISSING",
      "RESEND_IDEMPOTENCY_WINDOW_RUNTIME_PROOF_MISSING",
    ],
    source_paths: [
      "base44/functions/submitContactMessage/entry.ts",
      "base44/functions/submitWaitlistSignup/entry.ts",
      "base44/shared/costGovernance.ts",
    ],
  },
  {
    boundary_id: "MB-PUBLISH-SOCIAL-APPROVED",
    material_kinds: ["send", "paid_spend", "provider_effect"],
    logical_route: "linkedinAgent|xTwitterAgent|newsletterAgent",
    physical_host: "linkedinAgent|xTwitterAgent|newsletterAgent",
    route_selector: "approved external task artifact",
    callers: [],
    actor: "requireAdminOrInternal and finalized founder approval",
    tenant_key: "Approval/ExternalTask.brand_id or _platform",
    policy: ["External approval saga", "exact approved artifact hash"],
    emergency: {
      capabilities: ["communications"],
      epoch: "paid-provider pre/post guard",
    },
    claim_primitive:
      "ExternalTask approval execution lease + CostUsageEvent reservation",
    effect_key:
      "api:taplio:publish:${approval.id}; api:typefully:publish:${approval.id}; email approval+recipient",
    provider_idempotency: "Stable local event key; provider behavior varies",
    provider_reconciliation:
      "Provider response id stored in ExternalTask/CostUsageEvent; final-cost reconciliation partial",
    receipt: [
      "ExternalTask",
      "Approval",
      "CostUsageEvent",
      "provider response id when returned",
    ],
    status: "PARTIAL",
    gap_codes: ["PROVIDER_FINAL_COST_RECEIPT_PARTIAL"],
    source_paths: [
      "base44/functions/linkedinAgent/entry.ts",
      "base44/functions/xTwitterAgent/entry.ts",
      "base44/functions/newsletterAgent/entry.ts",
      "base44/shared/externalApprovalExecution.ts",
    ],
  },
  {
    boundary_id: "MB-SCHEDULE-MEETING",
    material_kinds: ["material_schedule", "provider_effect"],
    logical_route: "outlookMeetingCoordinator",
    physical_host: "outlookMeetingCoordinator",
    route_selector: "mode=execute after meetingAgent approval",
    callers: ["meetingAgent"],
    actor: "requireAdminOrInternal",
    tenant_key: "CommunicationThread.brand_id",
    policy: ["Exact Approval/ExternalTask/thread binding"],
    emergency: {
      capabilities: ["communications"],
      epoch: "capture + guarded provider effect",
    },
    claim_primitive:
      "External approval saga; CommunicationThread.meeting_event_id",
    effect_key: "Graph calendar transactionId for create; event id for cancel",
    provider_idempotency:
      "Microsoft Graph transactionId on create; DELETE by event id on cancel",
    provider_reconciliation:
      "Graph event id persisted; cancel reconciliation is partial",
    receipt: [
      "CommunicationThread.meeting_event_id",
      "ExternalTask",
      "OperationalLog",
    ],
    status: "PARTIAL",
    gap_codes: ["CALENDAR_CANCEL_RECONCILIATION_PARTIAL"],
    source_paths: [
      "base44/functions/outlookMeetingCoordinator/entry.ts",
      "base44/functions/meetingAgent/entry.ts",
      "base44/shared/externalApprovalExecution.ts",
    ],
  },
  {
    boundary_id: "MB-WEBHOOK-DISPATCH",
    material_kinds: ["send", "provider_effect"],
    logical_route: "dispatchWebhook",
    physical_host: "dispatchWebhook",
    route_selector: null,
    callers: [
      "sendTestWebhook (legacy compatibility endpoint quarantined with HTTP 410 and zero provider effect)",
    ],
    actor:
      "Admin or timing-safe INTERNAL_CALL_SECRET; route is PURGE-2 quarantined but callable; legacy sendTestWebhook is hard-quarantined HTTP 410",
    tenant_key: "_platform fan-out to active WebhookEndpoint rows",
    policy: [
      "Supported event allowlist",
      "per-event payload allowlist",
      "public HTTPS egress",
    ],
    emergency: {
      capabilities: ["communications"],
      epoch:
        "one captured epoch across fan-out; guarded immediately before and after each receiver effect",
    },
    claim_primitive:
      "WebhookDeadLetter dispatch intent + token/revision CAS before transport; EFFECT_STARTED fence; exact receipt/finalization",
    effect_key:
      "Deterministic operation + endpoint + event + payload hash; mandatory caller idempotency key; stable delivery ID",
    provider_idempotency:
      "X-CAMBRA-Delivery is advisory because arbitrary receivers offer no universal idempotency contract; ambiguity is REVIEW_REQUIRED with no replay",
    provider_reconciliation:
      "WebhookDelivery is persisted before terminal EXECUTED; receipt/finalizer ambiguity quarantines the intent; endpoint health projection remains independently repairable",
    receipt: [
      "WebhookDelivery",
      "WebhookDeadLetter on failure",
      "quarantine_probe",
    ],
    status: "QUARANTINED_PARTIAL",
    gap_codes: [
      "CUSTOM_RECEIVER_IDEMPOTENCY_NOT_PROVEN",
      "CUSTOM_RECEIVER_RECONCILIATION_UNAVAILABLE",
      "ENDPOINT_HEALTH_PROJECTION_RECONCILIATION_PARTIAL",
    ],
    source_paths: [
      "base44/functions/dispatchWebhook/entry.ts",
      "base44/functions/sendTestWebhook/entry.ts",
      "base44/shared/webhookPublicPayload.ts",
    ],
  },
  {
    boundary_id: "MB-WEBHOOK-DLQ-RETRY",
    material_kinds: ["send", "provider_effect", "material_schedule"],
    logical_route: "processWebhookDeadLetters",
    physical_host: "processWebhookDeadLetters",
    route_selector: null,
    callers: ["maintenanceEngine"],
    actor: "requireAdminOrInternal plus SchedulerRun",
    tenant_key: "_platform; WebhookEndpoint.id",
    policy: [
      "Only due pending_retry rows; manual replay requires exhausted + explicit confirmation",
    ],
    emergency: {
      capabilities: ["communications"],
      epoch:
        "captured after claim and guarded immediately before/after the receiver effect",
    },
    claim_primitive:
      "SchedulerRun claim + claimWebhookDeadLetter CAS + effects_started fence",
    effect_key:
      "Stable claim_attempt_key + operation/effect binding; manual replay reuses the same durable identity",
    provider_idempotency:
      "Stable delivery/attempt headers; arbitrary receiver enforcement remains external",
    provider_reconciliation:
      "WebhookDelivery plus terminal DLQ state; any post-effect uncertainty is REVIEW_REQUIRED and is never rescheduled",
    receipt: [
      "WebhookDelivery",
      "WebhookDeadLetter final state",
      "AgentTask",
      "SchedulerRun",
    ],
    status: "PARTIAL",
    gap_codes: [
      "CUSTOM_RECEIVER_IDEMPOTENCY_NOT_PROVEN",
      "CUSTOM_RECEIVER_RECONCILIATION_UNAVAILABLE",
      "DEPLOYED_CONCURRENT_REPLAY_RECEIPT_MISSING",
    ],
    source_paths: [
      "base44/functions/processWebhookDeadLetters/entry.ts",
      "base44/shared/webhookDeadLetterClaim.ts",
      "base44/shared/schedulerRun.ts",
    ],
  },
  {
    boundary_id: "MB-NEGOTIATE-PROVIDER",
    material_kinds: ["negotiate", "terms", "send", "paid_spend"],
    logical_route: "startProviderNegotiation|providerNegotiationAgent",
    physical_host: "startProviderNegotiation|providerNegotiationAgent",
    route_selector: null,
    callers: [],
    actor: "requireAdminOrInternal",
    tenant_key: "DealActivation.brand_id",
    policy: [
      "Active Mandate renegotiate_with_provider",
      "Market NEGOTIATE",
      "LegalExecution NEGOTIATE_PRICING",
      "CommercialPolicy provider_negotiation",
      "AgentAuthority",
    ],
    emergency: {
      capabilities: ["negotiations", "communications_on_send"],
      epoch: "captured/inherited across agent and send",
    },
    claim_primitive:
      "Lookup of existing open NegotiationCase; no unique/CAS preclaim at start",
    effect_key:
      "Commercial send idempotency key; AI event key per model attempt",
    provider_idempotency:
      "Delegated to commercialSendMessage; AI provider has no proven idempotency",
    provider_reconciliation:
      "CommunicationMessage/provider receipt; NegotiationCase/Offer state",
    receipt: [
      "NegotiationCase",
      "IntelligenceSnapshot",
      "AgentTask",
      "NegotiationOffer",
      "CommunicationMessage",
      "Approval(final_provider_deal)",
    ],
    status: "PARTIAL",
    gap_codes: [
      "NEGOTIATION_START_CAS_MISSING",
      "EMERGENCY_CAPABILITY_MISSING_AI",
    ],
    source_paths: [
      "base44/functions/startProviderNegotiation/entry.ts",
      "base44/functions/providerNegotiationAgent/entry.ts",
      "base44/functions/commercialSendMessage/entry.ts",
    ],
  },
  {
    boundary_id: "MB-NEGOTIATE-COLLECTIVE",
    material_kinds: ["negotiate", "terms", "send", "material_schedule"],
    logical_route:
      "aggregateProcurementWorker|collectiveNegotiationAgent|aggregateAgreementWorker",
    physical_host:
      "aggregateProcurementWorker|collectiveNegotiationAgent|aggregateAgreementWorker",
    route_selector: null,
    callers: [],
    actor: "Admin/internal scheduler",
    tenant_key: "_platform",
    policy: [
      "Founder-approved aggregate_procurement CommercialPolicy",
      "exact pool/RFP/contract references",
    ],
    emergency: {
      capabilities: ["negotiations", "communications_on_send"],
      epoch: "scheduler claim plus negotiation/send epochs",
    },
    claim_primitive:
      "SchedulerRun + negotiation case/task + commercial send claim",
    effect_key: "Negotiation case/task ids and commercial send idempotency key",
    provider_idempotency: "Delegated to commercialSendMessage",
    provider_reconciliation: "Aggregate/Negotiation/Communication state",
    receipt: [
      "AggregatePool/RFP",
      "NegotiationCase",
      "AgentTask",
      "Approval",
      "CommunicationMessage",
      "SchedulerRun",
    ],
    status: "PARTIAL",
    gap_codes: ["EMERGENCY_CAPABILITY_MISSING_AI"],
    source_paths: [
      "base44/functions/aggregateProcurementWorker/entry.ts",
      "base44/functions/collectiveNegotiationAgent/entry.ts",
      "base44/functions/aggregateAgreementWorker/entry.ts",
      "base44/shared/schedulerRun.ts",
    ],
  },
  {
    boundary_id: "MB-TERMS-APPROVAL-EXECUTION",
    material_kinds: ["terms", "sign_mandate", "negotiate", "send"],
    logical_route: "resolveCommercialApproval",
    physical_host: "resolveCommercialApproval",
    route_selector: "approval_type branch",
    callers: [],
    actor: "Strict admin plus founder-command-created Approval",
    tenant_key: "Approval.brand_id or _platform",
    policy: [
      "Resolution command key",
      "expected authority hash",
      "decision/reason/content hash",
      "exact contract/terms hash",
    ],
    emergency: {
      capabilities: ["negotiations", "communications_for_send_branches"],
      epoch: "approval resolution saga + branch epoch",
    },
    claim_primitive: "Approval resolution CAS/lease/effects_started/finalize",
    effect_key: "resolution_command_key and downstream commercial send key",
    provider_idempotency:
      "Downstream send provider-specific; local term activation hash-bound",
    provider_reconciliation: "Approval finalization and postcondition reads",
    receipt: [
      "Approval",
      "DynamicAgreement/NegotiationCase/Aggregate postconditions",
      "OperationalLog",
      "CommunicationMessage when sent",
    ],
    status: "PARTIAL",
    gap_codes: [
      "EMERGENCY_CAPABILITY_MISSING_SIGN_MANDATE",
      "AGGREGATE_EXECUTION_LEGAL_ENFORCEMENT_NOT_PROVEN",
    ],
    source_paths: [
      "base44/functions/resolveCommercialApproval/entry.ts",
      "base44/shared/approvalResolutionSaga.ts",
    ],
  },
  {
    boundary_id: "MB-LEGAL-AUTHORITY-ADMIN",
    material_kinds: ["terms", "sign_mandate"],
    logical_route: "manageLegalExecution",
    physical_host: "marketPolicyAdmin",
    route_selector: { action: "manage_legal_execution" },
    callers: [],
    actor: "Strict admin",
    tenant_key: "Jurisdiction/global/_platform or Mandate.brand_id",
    policy: [
      "Legal execution policy/kill switch/signer capacity/authority grant",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "No durable command-idempotency/CAS claim proven",
    effect_key: "Action + legal authority/policy entity id",
    provider_idempotency: "Not applicable; local authority mutation",
    provider_reconciliation: "Entity readback/Event only",
    receipt: ["Legal authority/policy entity", "Event"],
    status: "PARTIAL",
    gap_codes: [
      "EMERGENCY_CAPABILITY_MISSING_SIGN_MANDATE",
      "PRE_EFFECT_CLAIM_MISSING",
    ],
    source_paths: [
      "base44/deployment-topology.json",
      "base44/functions/marketPolicyAdmin/entry.ts",
    ],
  },
  {
    boundary_id: "MB-MANDATE-ACCEPT",
    material_kinds: ["terms", "sign_mandate"],
    logical_route: "startRecoverAcceptance|acceptRecoverMandate",
    physical_host: "startRecoverAcceptance|acceptRecoverMandate",
    route_selector: null,
    callers: [],
    actor: "Authenticated owner; session email binds signature",
    tenant_key: "DealActivation.brand_id",
    policy: [
      "Market MANDATE/CONTRACT",
      "product policy/ECL/contract snapshot",
      "LegalExecution ACCEPT_RECOVER_MANDATE",
      "active-mandate invariant",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive:
      "Start idempotency key; claimRecoverAcceptanceAuthority CAS; DealActivation authorization CAS",
    effect_key: "Mandate id + immutable acceptance_snapshot_hash",
    provider_idempotency: "Not applicable; local legal acceptance",
    provider_reconciliation: "Mandate and DealActivation readback/attestation",
    receipt: [
      "Mandate.acceptance_snapshot_hash",
      "DealActivation",
      "OperationalLog/attestation",
    ],
    status: "PARTIAL",
    gap_codes: ["EMERGENCY_CAPABILITY_MISSING_SIGN_MANDATE"],
    source_paths: [
      "base44/functions/startRecoverAcceptance/entry.ts",
      "base44/functions/acceptRecoverMandate/entry.ts",
      "base44/shared/recoverAcceptance.ts",
    ],
  },
  {
    boundary_id: "MB-MANDATE-REVOKE",
    material_kinds: ["sign_mandate", "terms"],
    logical_route: "revokeMandate",
    physical_host: "revokeMandate",
    route_selector: null,
    callers: [],
    actor: "Authenticated owner/signer/brand contact or admin",
    tenant_key: "Mandate -> DealActivation.brand_id",
    policy: ["Explicit ownership", "future-action-only revocation semantics"],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive:
      "Mandate status CAS, then DealActivation status/authority CAS with reread/retry",
    effect_key: "Mandate.id",
    provider_idempotency: "Not applicable; local legal revocation",
    provider_reconciliation: "Mandate and DealActivation readback",
    receipt: ["Mandate", "DealActivation", "OperationalLog"],
    status: "PARTIAL",
    gap_codes: ["EMERGENCY_CAPABILITY_MISSING_SIGN_MANDATE"],
    source_paths: ["base44/functions/revokeMandate/entry.ts"],
  },
  {
    boundary_id: "MB-CONDITIONS-ACTIVATION",
    material_kinds: ["terms", "billing_charge"],
    logical_route: "recordConditionsActivation",
    physical_host: "recordConditionsActivation",
    route_selector: null,
    callers: [],
    actor: "Strict admin",
    tenant_key: "DealActivation.brand_id",
    policy: [
      "live/monetizing activation",
      "active Mandate",
      "named evidence source/note",
      "explicit correction confirmation",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "No CAS claim; correction guard is value-based",
    effect_key: "DealActivation.id + conditions_activated_at",
    provider_idempotency: "Not applicable; local contractual calendar",
    provider_reconciliation: "DealActivation state and OperationalLog",
    receipt: ["DealActivation contractual calendar", "OperationalLog"],
    status: "PARTIAL",
    gap_codes: [
      "PRE_EFFECT_CLAIM_MISSING",
      "EMERGENCY_CAPABILITY_MISSING_SIGN_MANDATE",
    ],
    source_paths: ["base44/functions/recordConditionsActivation/entry.ts"],
  },
  {
    boundary_id: "MB-TERMS-PROVIDER-MONETIZATION-LEGAL",
    material_kinds: ["terms", "billing_charge"],
    logical_route: "approveProviderMonetizationLegalReview",
    physical_host: "approveProviderMonetizationLegalReview",
    route_selector: null,
    callers: [],
    actor: "Strict admin and approved=true",
    tenant_key: "_platform DynamicAgreement.provider_id",
    policy: [
      "Legal opinion",
      "jurisdiction",
      "vertical",
      "disclosure",
      "tax treatment",
      "settlement mode",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "No CAS/idempotent command claim proven",
    effect_key: "DynamicAgreement.id",
    provider_idempotency: "Not applicable; local agreement/provider activation",
    provider_reconciliation:
      "DynamicAgreement/Provider readback and OperationalLog",
    receipt: [
      "DynamicAgreement legal_review",
      "Provider monetization state",
      "OperationalLog",
    ],
    status: "PARTIAL",
    gap_codes: [
      "PRE_EFFECT_CLAIM_MISSING",
      "EMERGENCY_CAPABILITY_MISSING_SIGN_MANDATE",
    ],
    source_paths: [
      "base44/functions/approveProviderMonetizationLegalReview/entry.ts",
    ],
  },
  {
    boundary_id: "MB-CONTRACT-PDF-STORAGE",
    material_kinds: ["terms", "provider_effect", "material_schedule"],
    logical_route: "generateRecoverContractPdf|retryPendingRecoverContracts",
    physical_host: "generateRecoverContractPdf|retryPendingRecoverContracts",
    route_selector: null,
    callers: [],
    actor: "Admin/internal; retry worker additionally SchedulerRun",
    tenant_key: "Mandate.brand_id",
    policy: [
      "Immutable accepted snapshot/hash/template",
      "CAMBRA legal identity",
      "private storage only",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive:
      "Mandate contract_pdf_status/timestamp lease; update is not proven CAS",
    effect_key:
      "Opaque deterministic storage filename and contract delivery idempotency key",
    provider_idempotency: "Private-file upload behavior not proven idempotent",
    provider_reconciliation:
      "Signed-URL readback and SHA-256 comparison before generated state",
    receipt: [
      "Mandate storage URI/SHA-256/size/template",
      "contract events",
      "SchedulerRun on retry",
    ],
    status: "PARTIAL",
    gap_codes: [
      "EMERGENCY_CAPABILITY_MISSING_PROVIDER_EFFECT",
      "ATOMIC_LEASE_NOT_PROVEN",
    ],
    source_paths: [
      "base44/functions/generateRecoverContractPdf/entry.ts",
      "base44/functions/retryPendingRecoverContracts/entry.ts",
      "base44/shared/recoverContractState.ts",
    ],
  },
  {
    boundary_id: "MB-CONTRACT-EMAIL",
    material_kinds: ["send", "terms", "paid_spend"],
    logical_route: "sendRecoverContractEmail",
    physical_host: "sendRecoverContractEmail",
    route_selector: null,
    callers: ["generateRecoverContractPdf", "retryPendingRecoverContracts"],
    actor: "Admin/internal; resend only admin",
    tenant_key: "Mandate.brand_id and signed_by_email",
    policy: [
      "Generated/hash-verified contract PDF",
      "immutable contract economic view",
    ],
    emergency: {
      capabilities: ["communications"],
      epoch: "capture + pre/post send",
    },
    claim_primitive:
      "Mandate email lease/status plus CostUsageEvent reservation",
    effect_key: "email:recover-contract:${mandate.id}:${contract_version}",
    provider_idempotency:
      "Stable local cost key; Base44 Core provider idempotency not independently proven",
    provider_reconciliation:
      "Mandate provider_message_id when returned; ambiguity becomes permanent review",
    receipt: [
      "Mandate contract email state/provider id",
      "CostUsageEvent",
      "contract event",
    ],
    status: "PARTIAL",
    gap_codes: ["PROVIDER_FINAL_RECEIPT_MISSING"],
    source_paths: [
      "base44/functions/sendRecoverContractEmail/entry.ts",
      "base44/shared/costGovernance.ts",
      "base44/shared/recoverContractState.ts",
    ],
  },
  {
    boundary_id: "MB-MIGRATE-PAYMENTS",
    material_kinds: ["migrate_go_live", "material_schedule"],
    logical_route: "startPaymentsMigration|updatePaymentsMigrationTask",
    physical_host: "startPaymentsMigration|updatePaymentsMigrationTask",
    route_selector: null,
    callers: [],
    actor: "Owner/admin/internal at start; admin for task/go-live update",
    tenant_key: "DealActivation.brand_id",
    policy: [
      "Market MIGRATE",
      "active Mandate",
      "LegalExecution COORDINATE_MIGRATION",
      "AUTHORIZE_MIGRATION exact payload hash at go-live",
      "sequential tasks",
    ],
    emergency: {
      capabilities: ["migrations"],
      epoch: "point-in-time assertOperationAllowed only",
    },
    claim_primitive:
      "DealActivation status CAS; MigrationTask CAS; go-live CAS with compensation",
    effect_key: "DealActivation.id + MigrationTask.id",
    provider_idempotency:
      "Not applicable; no provider mutation in these routes",
    provider_reconciliation:
      "MigrationTask/DealActivation readback and OperationalLog",
    receipt: [
      "MigrationPlan/Task",
      "DealActivation",
      "snapshots",
      "OperationalLog",
    ],
    status: "PARTIAL",
    gap_codes: ["POINT_CHECK_NOT_EPOCH"],
    source_paths: [
      "base44/functions/startPaymentsMigration/entry.ts",
      "base44/functions/updatePaymentsMigrationTask/entry.ts",
      "base44/shared/operationalControl.ts",
    ],
  },
  {
    boundary_id: "MB-MIGRATE-DEVELOPER-GITHUB",
    material_kinds: ["migrate_go_live", "provider_effect"],
    logical_route: "developerMigrationEngine",
    physical_host: "developerMigrationEngine",
    route_selector: "apply_plan|cutover|rollback",
    callers: [],
    actor: "Strict admin with finalized Approval/AgentTask",
    tenant_key: "DeveloperMigrationRun workspace/brand binding",
    policy: [
      "Exact approval/task/run/workspace hashes",
      "migration lifecycle authority",
    ],
    emergency: {
      capabilities: ["migrations"],
      epoch: "capture and revalidate immediately around provider writes",
    },
    claim_primitive:
      "Lifecycle CAS/lease/checkpoint/effects_started/singleton revision",
    effect_key: "DeveloperMigrationRun lifecycle key + stable step key",
    provider_idempotency: "GitHub refs/SHA/PR identity and step checkpoints",
    provider_reconciliation:
      "GitHub refs, head SHA, PR and checks; ambiguous network result => REVIEW_REQUIRED without blind retry",
    receipt: [
      "DeveloperMigrationRun.lifecycle_steps",
      "GitHub refs/SHA/PR/check ids",
      "Approval",
      "AgentTask",
    ],
    status: "CONTROLLED",
    gap_codes: [],
    source_paths: [
      "base44/functions/developerMigrationEngine/entry.ts",
      "base44/shared/developerMigrationLifecycle.ts",
    ],
  },
  {
    boundary_id: "MB-BILL-RECOVER-ELIGIBILITY",
    material_kinds: ["billing_charge"],
    logical_route: "approveRecoverReportForInvoicing",
    physical_host: "approveRecoverReportForInvoicing",
    route_selector: null,
    callers: [],
    actor: "Strict admin",
    tenant_key: "MonthlySavingsReport/DealActivation.brand_id",
    policy: ["Exact report/activation/mandate/legal/contract/ECL gates"],
    emergency: {
      capabilities: [],
      epoch:
        "no provider effect; billing eligibility mutation has no epoch recorded in registry review",
    },
    claim_primitive:
      "Report state transition checks; exact CAS must be verified per source revision",
    effect_key: "MonthlySavingsReport.id",
    provider_idempotency: "Not applicable; eligibility only",
    provider_reconciliation: "Report readback and OperationalLog",
    receipt: ["MonthlySavingsReport billing eligibility", "OperationalLog"],
    status: "PARTIAL",
    gap_codes: ["BILLING_ELIGIBILITY_EPOCH_NOT_PROVEN"],
    source_paths: [
      "base44/functions/approveRecoverReportForInvoicing/entry.ts",
    ],
  },
  {
    boundary_id: "MB-BILL-RECOVER-REPORT-GENERATION",
    material_kinds: ["billing_charge", "claim_outcome_dataset_promotion"],
    logical_route: "generateMonthlySavingsReport",
    physical_host: "generateMonthlySavingsReport",
    route_selector: null,
    callers: ["recoverAutopilotWorker"],
    actor: "Admin/internal/scheduler",
    tenant_key: "DealActivation.brand_id + activation/month report scope",
    policy: [
      "Product scope",
      "accepted Recover mandate/contract",
      "Baseline/BillingRule provenance",
      "non-void activation-month singleton",
    ],
    emergency: {
      capabilities: [],
      epoch:
        "no provider charge; financial evidence promotion has no universal Emergency epoch contract",
    },
    claim_primitive:
      "readRecoverReportAuthority cap-two read plus mandatory post-create and pre-return singleton proof; duplicate rows fail closed",
    effect_key: "recover-report:${deal_activation_id}:${month}",
    provider_idempotency:
      "Not applicable to the local report write; no datastore uniqueness guarantee is assumed",
    provider_reconciliation:
      "Duplicate non-void reports block approval and all Stripe effects until explicit reconciliation",
    receipt: [
      "MonthlySavingsReport",
      "IntelligenceSnapshot report snapshot/hash",
      "OperationalLog",
    ],
    status: "PARTIAL",
    gap_codes: [
      "RECOVER_REPORT_CREATE_ATOMIC_CLAIM_MISSING",
      "DUPLICATE_REPORT_RUNTIME_RECONCILIATION_PENDING",
    ],
    source_paths: [
      "base44/functions/generateMonthlySavingsReport/entry.ts",
      "base44/shared/recoverReportAuthority.ts",
    ],
  },
  {
    boundary_id: "MB-BILL-INVOICE-PDF-STORAGE",
    material_kinds: ["billing_charge", "provider_effect"],
    logical_route: "generateInvoicePdf",
    physical_host: "generateInvoicePdf",
    route_selector: null,
    callers: [],
    actor: "Strict admin",
    tenant_key: "Invoice.brand_id",
    policy: [
      "Recover or Stripe-authoritative invoices are rejected",
      "legacy non-Recover local invoice only",
      "positive invoice authority",
    ],
    emergency: {
      capabilities: [],
      epoch: "legacy external storage upload has no Emergency epoch wrapper",
    },
    claim_primitive:
      "Exact cap-two Invoice read; no durable upload lease/claim",
    effect_key: "invoice_pdf:${invoice.id}:${rendered_content_hash}",
    provider_idempotency: "Base44 UploadFile idempotency is not proven",
    provider_reconciliation:
      "Invoice PDF URL readback only; upload-success/local-write-failure cannot be universally reconciled",
    receipt: ["Invoice PDF URL for non-Recover legacy invoices"],
    status: "PARTIAL",
    gap_codes: [
      "COMMON_PROVIDER_EFFECT_CLAIM_MISSING",
      "COMMON_PROVIDER_RECONCILIATION_MISSING",
      "EMERGENCY_CAPABILITY_MISSING_PROVIDER_EFFECT",
    ],
    source_paths: ["base44/functions/generateInvoicePdf/entry.ts"],
  },
  {
    boundary_id: "MB-BILL-RECOVER-STRIPE",
    material_kinds: ["billing_charge", "provider_effect", "material_schedule"],
    logical_route:
      "createEligibleRecoverInvoices|reconcileRecoverBilling|stripeBillingWebhook",
    physical_host:
      "createEligibleRecoverInvoices|reconcileRecoverBilling|stripeBillingWebhook",
    route_selector: null,
    callers: ["recoverAutopilotWorker"],
    actor:
      "Admin/internal/scheduler; webhook authenticated by Stripe signature",
    tenant_key: "MonthlySavingsReport/DealActivation/Invoice.brand_id",
    policy: [
      "Market BILL",
      "LegalExecution AUTHORIZE_CAMBRA_BILLING",
      "ECL/contract",
      "frozen report economics",
    ],
    emergency: {
      capabilities: ["billing_issuance"],
      epoch: "capture + guarded pre/post around every create/finalize effect",
    },
    claim_primitive:
      "claimRecoverInvoiceDraft renew/finalize; Stripe event id dedupe; SchedulerRun for reconcile",
    effect_key: "recoverExecutionKey(report.id)",
    provider_idempotency: "Deterministic Stripe keys r4:*:${report.id}",
    provider_reconciliation:
      "Fresh Stripe GET validates invoice/customer/currency/amount/metadata binding",
    receipt: [
      "Invoice frozen snapshot/hash/Stripe ids/legal number",
      "PaymentEvent once",
      "OperationalLog",
      "SchedulerRun",
    ],
    status: "CONTROLLED",
    gap_codes: [],
    source_paths: [
      "base44/functions/createEligibleRecoverInvoices/entry.ts",
      "base44/functions/reconcileRecoverBilling/entry.ts",
      "base44/functions/stripeBillingWebhook/entry.ts",
      "base44/shared/economicExecution.ts",
    ],
  },
  {
    boundary_id: "MB-BILL-PAYMENT-METHOD",
    material_kinds: ["billing_charge", "provider_effect"],
    logical_route: "startPaymentMethodSetup",
    physical_host: "startPaymentMethodSetup",
    route_selector: null,
    callers: [],
    actor: "Authenticated owner",
    tenant_key: "Brand/DealActivation.brand_id",
    policy: ["Active Mandate and ownership"],
    emergency: {
      capabilities: ["billing_issuance"],
      epoch: "capture + provider effect guard",
    },
    claim_primitive:
      "Local Stripe ids/readback and deterministic provider keys",
    effect_key: "Brand/deal activation customer and setup-intent identity",
    provider_idempotency:
      "Deterministic Stripe Customer/SetupIntent idempotency keys",
    provider_reconciliation:
      "Local Stripe ids plus ambiguity OperationalLog; webhook completion remains external",
    receipt: ["Brand/DealActivation Stripe ids", "OperationalLog"],
    status: "PARTIAL",
    gap_codes: ["SETUP_INTENT_COMPLETION_RECONCILIATION_EXTERNAL"],
    source_paths: [
      "base44/functions/startPaymentMethodSetup/entry.ts",
      "base44/shared/operationalControl.ts",
    ],
  },
  {
    boundary_id: "MB-BILL-PAYMENT-LINK",
    material_kinds: ["billing_charge", "provider_effect"],
    logical_route: "createPaymentLink",
    physical_host: "createPaymentLink",
    route_selector: null,
    callers: [],
    actor: "Strict admin",
    tenant_key: "Invoice.brand_id",
    policy: [
      "Recover invoices rejected to prevent a second payable surface",
      "positive immutable invoice amount",
    ],
    emergency: {
      capabilities: ["billing_issuance"],
      epoch: "capture + guarded provider effect + local pre/post checks",
    },
    claim_primitive: "Stripe provider idempotency plus Invoice binding",
    effect_key: "stripe_checkout_session:${invoice.id}",
    provider_idempotency: "cambra-payment-link-${invoice.id}",
    provider_reconciliation:
      "Session id stored in Invoice snapshot; ambiguity marks reconciliation error/review",
    receipt: ["Invoice", "PaymentEvent", "Stripe Checkout Session id/url"],
    status: "CONTROLLED",
    gap_codes: [],
    source_paths: [
      "base44/functions/createPaymentLink/entry.ts",
      "base44/shared/operationalControl.ts",
    ],
  },
  {
    boundary_id: "MB-BILL-API-OVERAGE",
    material_kinds: ["billing_charge", "material_schedule"],
    logical_route: "billApiUsage",
    physical_host: "billApiUsage",
    route_selector: null,
    callers: [],
    actor: "Admin/internal plus SchedulerRun",
    tenant_key: "Organization.id + period_month",
    policy: ["Organization quota/pricing and exact closed period"],
    emergency: {
      capabilities: ["billing_issuance"],
      epoch: "capture + before/after invoice checks",
    },
    claim_primitive:
      "ApiUsageRecord CAS on billing_claim_revision/billing_run_id; stale claim => review",
    effect_key: "api-overage-invoice:${organizationId}:${periodMonth}",
    provider_idempotency: "Not applicable; creates local Invoice only",
    provider_reconciliation:
      "Invoice execution_key/snapshot and closed usage-row readback",
    receipt: [
      "Invoice.billing_snapshot_json",
      "closed ApiUsageRecord rows",
      "SchedulerRun",
    ],
    status: "CONTROLLED",
    gap_codes: [],
    source_paths: [
      "base44/functions/billApiUsage/entry.ts",
      "base44/shared/apiUsageBilling.ts",
      "base44/shared/schedulerRun.ts",
    ],
  },
  {
    boundary_id: "MB-BILL-PROVIDER-REVENUE",
    material_kinds: ["billing_charge", "material_schedule"],
    logical_route:
      "providerRevenueBillingWorker|recordProviderRevenueInvoiceIssued|recordProviderRevenuePayment",
    physical_host:
      "providerRevenueBillingWorker|recordProviderRevenueInvoiceIssued|recordProviderRevenuePayment",
    route_selector: null,
    callers: [],
    actor: "Admin/internal; billing preparation also SchedulerRun",
    tenant_key: "_platform agreement_id/provider_id/period/currency",
    policy: [
      "DynamicAgreement compensation legal approval/activation",
      "settlement mode",
      "tax/opinion references",
    ],
    emergency: {
      capabilities: ["billing_issuance"],
      epoch: "capture + before/after local issuance record",
    },
    claim_primitive:
      "Lookup by provider invoice key/external number/payment ref; no unique/CAS create claim",
    effect_key:
      "provider-invoice:${agreement}|${provider}|${period}|${currency}",
    provider_idempotency:
      "No external issuance call; local duplicate checks only",
    provider_reconciliation:
      "Reconciled provider statement or manually supplied external invoice/payment evidence",
    receipt: [
      "ProviderRevenueInvoice",
      "ProviderRevenueLedger",
      "ProviderRevenuePayment",
      "Event",
      "SchedulerRun",
    ],
    status: "PARTIAL",
    gap_codes: ["LOCAL_INVOICE_CREATE_CAS_MISSING"],
    source_paths: [
      "base44/functions/providerRevenueBillingWorker/entry.ts",
      "base44/functions/recordProviderRevenueInvoiceIssued/entry.ts",
      "base44/functions/recordProviderRevenuePayment/entry.ts",
    ],
  },
  {
    boundary_id: "MB-BILL-MANUAL-RECORD",
    material_kinds: ["billing_charge"],
    logical_route: "recordPayment",
    physical_host: "recordPayment",
    route_selector: null,
    callers: [],
    actor: "Admin/internal",
    tenant_key: "Invoice.brand_id",
    policy: ["Manual non-Stripe payment only"],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "external_ref duplicate lookup; no CAS command claim",
    effect_key: "external_ref",
    provider_idempotency: "Not applicable; records already-observed payment",
    provider_reconciliation: "Invoice/PaymentEvent local readback",
    receipt: ["Invoice", "PaymentEvent"],
    status: "PARTIAL",
    gap_codes: [
      "BILLING_TRUTH_MUTATION_EPOCH_MISSING",
      "LOCAL_PAYMENT_CAS_MISSING",
    ],
    source_paths: ["base44/functions/recordPayment/entry.ts"],
  },
  {
    boundary_id: "MB-BILL-LOCAL-RECONCILE-OVERRIDE",
    material_kinds: ["billing_charge"],
    logical_route: "reconcileInvoice",
    physical_host: "reconcileInvoice",
    route_selector: null,
    callers: [],
    actor: "Strict admin",
    tenant_key: "Invoice.brand_id",
    policy: [
      "State transition allowlist",
      "Stripe-authoritative Recover blocked",
      "draft-only amount adjustment",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "No CAS/idempotent command key",
    effect_key: "Invoice.id + target_status",
    provider_idempotency: "Not applicable; local override",
    provider_reconciliation:
      "Invoice state and PaymentEvent(status_overridden)",
    receipt: ["Invoice", "PaymentEvent"],
    status: "PARTIAL",
    gap_codes: [
      "BILLING_TRUTH_MUTATION_EPOCH_MISSING",
      "PRE_EFFECT_CLAIM_MISSING",
    ],
    source_paths: ["base44/functions/reconcileInvoice/entry.ts"],
  },
  {
    boundary_id: "MB-BILL-LEGACY-INVOICE-EVENT-QUARANTINE",
    material_kinds: ["billing_charge"],
    logical_route: "onInvoiceStatusEvent",
    physical_host: "onInvoiceStatusEvent",
    route_selector: "terminal PURGE-2 quarantine",
    callers: [],
    actor: "DENIED_FOR_ALL",
    tenant_key:
      "No tenant is resolved because the route terminates before request parsing",
    policy: [
      "Unconditional HTTP 410 route_quarantined; canonical signed webhook/reconciliation routes only",
    ],
    emergency: {
      capabilities: [],
      epoch:
        "not applicable because every invocation terminates before effects",
    },
    claim_primitive: "NONE; hard quarantine before reads or writes",
    effect_key: "NONE; effects_committed=false",
    provider_idempotency: "NOT_APPLICABLE",
    provider_reconciliation: "NOT_APPLICABLE",
    receipt: ["HTTP 410 route_quarantined response"],
    status: "QUARANTINED",
    gap_codes: ["PURGE_2_RUNTIME_PENDING"],
    source_paths: ["base44/functions/onInvoiceStatusEvent/entry.ts"],
  },
  {
    boundary_id: "MB-PAID-API-ENRICHMENT",
    material_kinds: ["paid_spend", "provider_effect"],
    logical_route:
      "paidProviderFetch|reservePaidOperation|guardReservedPaidProviderEffect",
    physical_host: "shared/costGovernance",
    route_selector: "category api|enrichment|email",
    callers: "__DYNAMIC_PAID_CALLERS__",
    actor: "Inherited from physical caller",
    tenant_key: "Caller brand/entity or _platform",
    policy: ["CostBudgetControl", "CostUsageEvent reservation"],
    emergency: {
      capabilities: [
        "paid_discovery_for_api_enrichment",
        "communications_for_email",
      ],
      epoch: "pre/post only when guarded helper is used",
    },
    claim_primitive: "CostUsageEvent.event_key + CostBudgetControl CAS",
    effect_key: "Caller event_key; UUID suffix unless stable_event_key=true",
    provider_idempotency: "Provider-specific and caller-dependent",
    provider_reconciliation:
      "Provider-final only when reconciled=true + PROVIDER_FINAL_RECEIPT + reconciliation_ref",
    receipt: ["CostUsageEvent; commonly OBSERVED rather than provider-final"],
    status: "PARTIAL",
    gap_codes: [
      "STABLE_EFFECT_KEY_CALLER_DEPENDENT",
      "GUARDED_PROVIDER_EFFECT_CALLER_DEPENDENT",
      "PROVIDER_FINAL_RECEIPT_MISSING",
    ],
    source_paths: ["base44/shared/costGovernance.ts"],
  },
  {
    boundary_id: "MB-PAID-AI",
    material_kinds: ["paid_spend", "provider_effect"],
    logical_route: "callCambraClaude|callCambraModel",
    physical_host: "shared/commercialModelRouter|shared/commandModelRouter",
    route_selector: "category=ai",
    callers: "__DYNAMIC_AI_CALLERS__",
    actor: "Inherited from 38 physical callers",
    tenant_key: "Caller brand/entity or _platform",
    policy: ["CostBudgetControl", "CostUsageEvent reservation"],
    emergency: {
      capabilities: [],
      epoch: "AI category is omitted by paidProviderEmergencyCapabilities",
    },
    claim_primitive:
      "CostUsageEvent reservation; router uses a new UUID for each attempt",
    effect_key: "ai:${source}:${logicalKey}:${attempt}:${uuid}",
    provider_idempotency: "No provider idempotency proven",
    provider_reconciliation:
      "Cost settlement is generally OBSERVED, not provider-final",
    receipt: ["CostUsageEvent", "caller AgentTask/domain output"],
    status: "PARTIAL_HARD_GAP",
    gap_codes: [
      "EMERGENCY_CAPABILITY_MISSING_AI",
      "AI_RETRY_EFFECT_KEY_UNSTABLE",
      "PROVIDER_FINAL_RECEIPT_MISSING",
    ],
    source_paths: [
      "base44/shared/commercialModelRouter.ts",
      "base44/shared/costGovernance.ts",
      "base44/functions/processUploadedFile/entry.ts",
      "base44/shared/operationalControl.ts",
    ],
  },
  {
    boundary_id: "MB-PROVIDER-DR-SHAREPOINT",
    material_kinds: ["provider_effect", "material_schedule"],
    logical_route: "disasterRecoveryBackup",
    physical_host: "maintenanceEngine",
    route_selector: { host_action: "disaster_recovery_backup" },
    callers: [],
    actor: "Internal scheduler or strict admin",
    tenant_key: "_platform release identity",
    policy: [
      "DR policy",
      "SharePoint CAMBRA INFRASTRUCTURE/Production Backups",
      "encrypted payload only",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "SchedulerRun; deterministic backup path/manifest",
    effect_key: "Backup id/path in SharePoint",
    provider_idempotency:
      "Microsoft Graph upload path with conflictBehavior=replace/upload session",
    provider_reconciliation: "Upload/read manifest and restore-evidence flow",
    receipt: [
      "Encrypted backup object",
      "manifest",
      "OperationalLog",
      "Restore Evidence for restore",
    ],
    status: "PARTIAL",
    gap_codes: ["EMERGENCY_CAPABILITY_MISSING_PROVIDER_EFFECT"],
    source_paths: [
      "base44/deployment-topology.json",
      "base44/functions/maintenanceEngine/entry.ts",
      "base44/shared/disasterRecoveryRuntime.ts",
    ],
  },
  {
    boundary_id: "MB-PROVIDER-INTEGRATIONS-READ-AUTH",
    material_kinds: ["provider_effect"],
    logical_route:
      "oauthConnector|stripeOAuthConnect|dataSyncAgent|stripeDataSync|computeStripeVerifiedGap|checkVatVies|rateIntelligenceWatchWorker",
    physical_host: "respective physical routes",
    route_selector: null,
    callers: [],
    actor: "Authenticated/admin/internal according to route",
    tenant_key: "Integration.brand_id or provider/brand binding",
    policy: [
      "Connector scope/state",
      "source provenance",
      "read-only data sync where declared",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive:
      "Integration/source-specific state; no common provider-effect claim",
    effect_key: "Provider/account/integration-specific; no common key",
    provider_idempotency:
      "OAuth token exchanges and read calls are provider-specific",
    provider_reconciliation:
      "Integration/observation/candidate evidence and logs; no common reconciliation primitive",
    receipt: [
      "Integration state",
      "PaymentObservation/candidate evidence",
      "OperationalLog as route-specific",
    ],
    status: "PARTIAL",
    gap_codes: [
      "COMMON_PROVIDER_EFFECT_CLAIM_MISSING",
      "COMMON_PROVIDER_RECONCILIATION_MISSING",
    ],
    source_paths: [
      "base44/functions/oauthConnector/entry.ts",
      "base44/functions/stripeOAuthConnect/entry.ts",
      "base44/functions/dataSyncAgent/entry.ts",
      "base44/functions/stripeDataSync/entry.ts",
      "base44/functions/computeStripeVerifiedGap/entry.ts",
      "base44/functions/checkVatVies/entry.ts",
      "base44/functions/rateIntelligenceWatchWorker/entry.ts",
    ],
  },
  {
    boundary_id: "MB-SCHEDULER-BASE",
    material_kinds: ["material_schedule"],
    logical_route: "all Base44 scheduled automations",
    physical_host: "69 inventory rows across physical/logical hosts",
    route_selector: "function.jsonc automation",
    callers: "__DYNAMIC_SCHEDULER_KEYS__",
    actor:
      "Handler-specific admin/internal gate; existing scheduler inventory has UNKNOWN for many rows",
    tenant_key:
      "Handler-specific; existing scheduler inventory records UNKNOWN",
    policy: [
      "SchedulerRun slot/lease; downstream policy remains handler-specific",
    ],
    emergency: {
      capabilities: ["handler-specific"],
      epoch: "not supplied by scheduler claim; downstream route must enforce",
    },
    claim_primitive:
      "guardedScheduledServe/claimSchedulerRun run_key, lease, heartbeat, revision, effects_started, finalize",
    effect_key:
      "SchedulerRun key only; not a substitute for downstream effect idempotency",
    provider_idempotency: "Downstream route-specific",
    provider_reconciliation: "SchedulerRun plus downstream receipt",
    receipt: ["SchedulerRun", "downstream domain/provider receipt"],
    status: "PARTIAL",
    gap_codes: [
      "SCHEDULER_METADATA_UNKNOWN",
      "DOWNSTREAM_EFFECT_IDEMPOTENCY_REQUIRED",
    ],
    source_paths: [
      "config/scheduler-inventory.json",
      "base44/shared/schedulerRun.ts",
    ],
  },
  {
    boundary_id: "MB-INTEL-CLAIM-UPSERT",
    material_kinds: ["claim_outcome_dataset_promotion"],
    logical_route: "intelligenceAccess",
    physical_host: "intelligenceAccess",
    route_selector: { action: "upsert_claim" },
    callers: [],
    actor: "Admin/internal plus actor capability",
    tenant_key:
      "Exact request tenant; evidence/observations must bind to same tenant",
    policy: [
      "Truth/lineage assessment",
      "inferred cannot promote",
      "training/model/calibration flags false",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "Claim dedupe/version/content hash",
    effect_key: "Claim identity/content hash",
    provider_idempotency: "Not applicable; local intelligence ledger",
    provider_reconciliation: "Claim/evidence lineage readback",
    receipt: ["IntelligenceClaim", "evidence lineage", "log"],
    status: "PARTIAL",
    gap_codes: ["EMERGENCY_CAPABILITY_MISSING_KNOWLEDGE_PROMOTION"],
    source_paths: [
      "base44/functions/intelligenceAccess/entry.ts",
      "base44/shared/intelligenceFoundationContracts.ts",
    ],
  },
  {
    boundary_id: "MB-INTEL-OUTCOME-RECORD",
    material_kinds: ["claim_outcome_dataset_promotion"],
    logical_route: "intelligenceAccess",
    physical_host: "intelligenceAccess",
    route_selector: { action: "record_outcome" },
    callers: [],
    actor: "Admin/internal plus actor capability",
    tenant_key:
      "Terminal MonthlySavingsReport/NegotiationCase/MigrationTask tenant",
    policy: [
      "Exact verification source",
      "terminal state",
      "descriptive PENDING_PROVENANCE quarantine",
      "no training/model/calibration",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "Outcome dedupe key",
    effect_key: "Outcome key",
    provider_idempotency: "Not applicable; local intelligence ledger",
    provider_reconciliation: "Outcome/source binding readback",
    receipt: ["IntelligenceOutcome"],
    status: "CONTROLLED_NON_PROMOTING",
    gap_codes: [],
    source_paths: [
      "base44/functions/intelligenceAccess/entry.ts",
      "base44/shared/intelligenceFoundationContracts.ts",
    ],
  },
  {
    boundary_id: "MB-INTEL-CLAIM-PROMOTE",
    material_kinds: ["claim_outcome_dataset_promotion"],
    logical_route: "intelligenceAdmin",
    physical_host: "intelligenceAdmin",
    route_selector: { action: "set_claim_state" },
    callers: [],
    actor: "Strict admin with reason",
    tenant_key: "Exact claim tenant",
    policy: [
      "Verified/active require eligible lineage",
      "inferred prohibited",
      "learning flags remain false",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "Claim state/version update; no emergency epoch",
    effect_key: "Claim.id + target state",
    provider_idempotency: "Not applicable; local intelligence ledger",
    provider_reconciliation: "Claim readback and intelligence_override log",
    receipt: [
      "IntelligenceClaim version/state",
      "OperationalLog intelligence_override",
    ],
    status: "PARTIAL",
    gap_codes: ["EMERGENCY_CAPABILITY_MISSING_KNOWLEDGE_PROMOTION"],
    source_paths: [
      "base44/functions/intelligenceAdmin/entry.ts",
      "base44/shared/intelligenceFoundationContracts.ts",
    ],
  },
  {
    boundary_id: "MB-INTEL-OUTCOME-SCHEDULED",
    material_kinds: ["claim_outcome_dataset_promotion", "material_schedule"],
    logical_route: "outcomeLearningWorker",
    physical_host: "outcomeLearningWorker",
    route_selector: null,
    callers: [],
    actor: "Admin/internal plus SchedulerRun",
    tenant_key: "Verified terminal source entity tenant",
    policy: [
      "Only verified/terminal sources",
      "always descriptive PENDING_PROVENANCE quarantine",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "SchedulerRun + outcome dedupe key",
    effect_key: "Outcome key",
    provider_idempotency: "Not applicable; local outcome ledger",
    provider_reconciliation: "Outcome/source binding readback",
    receipt: ["IntelligenceOutcome", "SchedulerRun"],
    status: "CONTROLLED_NON_PROMOTING",
    gap_codes: [],
    source_paths: [
      "base44/functions/outcomeLearningWorker/entry.ts",
      "base44/shared/schedulerRun.ts",
    ],
  },
  {
    boundary_id: "MB-INTEL-P3-LEGACY-PROMOTION",
    material_kinds: ["claim_outcome_dataset_promotion", "material_schedule"],
    logical_route: "intelligenceMaintenanceWorker",
    physical_host: "intelligenceMaintenanceWorker",
    route_selector: null,
    callers: [],
    actor: "Admin/internal plus SchedulerRun",
    tenant_key: "Exact provider/country key",
    policy: [
      "Only verified P3 ProviderPricingVersion+RateComponent projects down",
      "legacy estimates never promote up",
    ],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "SchedulerRun and exact canonical pricing identity",
    effect_key: "Provider/country pricing version",
    provider_idempotency: "Not applicable; local compatibility projection",
    provider_reconciliation:
      "P3 version/change/conflict and exact legacy row readback",
    receipt: [
      "ProviderPricingVersion/RateComponent change/conflict",
      "PaymentsRateTable compatibility update",
      "SchedulerRun",
    ],
    status: "PARTIAL",
    gap_codes: ["EMERGENCY_CAPABILITY_MISSING_KNOWLEDGE_PROMOTION"],
    source_paths: [
      "base44/functions/intelligenceMaintenanceWorker/entry.ts",
      "src/docs/PRODUCTION_FUNCTIONS.md",
      "base44/shared/schedulerRun.ts",
    ],
  },
  {
    boundary_id: "MB-INTEL-P3-SEED",
    material_kinds: ["claim_outcome_dataset_promotion", "material_schedule"],
    logical_route: "seedP3RateIntelligence",
    physical_host: "seedP3RateIntelligence",
    route_selector: null,
    callers: [],
    actor: "Admin/internal; scheduled automation currently inactive",
    tenant_key: "_platform provider/country evidence universe",
    policy: ["Deterministic researched P3 bootstrap; temporary seed"],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "Deterministic/idempotent canonical ledger keys",
    effect_key: "P3 provider/country/source identity",
    provider_idempotency: "Not applicable; local seed",
    provider_reconciliation: "Canonical ledger readback",
    receipt: ["ProviderPricingVersion", "RateComponent", "evidence rows"],
    status: "PARTIAL_INACTIVE",
    gap_codes: ["EMERGENCY_CAPABILITY_MISSING_KNOWLEDGE_PROMOTION"],
    source_paths: [
      "base44/functions/seedP3RateIntelligence/entry.ts",
      "base44/functions/seedP3RateIntelligence/function.jsonc",
    ],
  },
  {
    boundary_id: "MB-DATASET-PROMOTION-ABSENT",
    material_kinds: ["claim_outcome_dataset_promotion"],
    logical_route: "NONE_FOUND",
    physical_host: "NONE_FOUND",
    route_selector: null,
    callers: [],
    actor: "NONE",
    tenant_key: "NONE",
    policy: ["Dataset/model registries remain CONTRACT_ONLY"],
    emergency: { capabilities: [], epoch: "none" },
    claim_primitive: "NONE",
    effect_key: "NONE",
    provider_idempotency: "NOT_APPLICABLE",
    provider_reconciliation: "NOT_APPLICABLE",
    receipt: ["NONE"],
    status: "ABSENT",
    gap_codes: [
      "DATASET_PROMOTION_ROUTE_ABSENT",
      "LEARNING_ELIGIBILITY_CLEARED_RUNTIME_ISSUER_ABSENT",
    ],
    source_paths: [
      "base44/shared/intelligenceFoundationContracts.ts",
      "config/intelligence/model-registry.v1.json",
    ],
  },
];

const MATERIAL_SCHEDULED_ROUTES = {
  aggregateAgreementWorker: ["negotiate", "send"],
  aggregateProcurementWorker: ["negotiate", "send"],
  alwaysOnLeadDiscoveryWorker: ["paid_spend", "provider_effect"],
  autonomousPartnerWorker: ["paid_spend", "send"],
  billApiUsage: ["billing_charge"],
  collectionOperationsWorker: ["send"],
  commercialFollowUpWorker: ["send", "negotiate"],
  disasterRecoveryBackup: ["provider_effect"],
  intelligenceMaintenanceWorker: ["claim_outcome_dataset_promotion"],
  missingInformationWorker: ["send"],
  onboardingConciergeWorker: ["send"],
  outcomeLearningWorker: ["claim_outcome_dataset_promotion"],
  outboundVolumeWorker: ["send"],
  postMeetingWorker: ["send"],
  processWebhookDeadLetters: ["provider_effect", "send"],
  providerMonitorAgent: ["paid_spend", "provider_effect"],
  providerRevenueBillingWorker: ["billing_charge"],
  rateIntelligenceWatchWorker: ["provider_effect"],
  reconcileRecoverBilling: ["billing_charge", "provider_effect"],
  recoverAutopilotWorker: ["billing_charge"],
  recoverBillingDigest: ["send"],
  regulatoryMonitoringWorker: ["provider_effect"],
  retryPendingRecoverContracts: ["send", "provider_effect"],
};

const TENANT_AUTHORIZATION_PROOF_SPECS = {};

function registerTenantAuthorizationProof(boundaryIds, spec) {
  for (const boundaryId of boundaryIds) {
    TENANT_AUTHORIZATION_PROOF_SPECS[boundaryId] = {
      ...spec,
      gate_refs: [...(spec.gate_refs || [])],
      test_refs: [...(spec.test_refs || [])],
      covered_route_members: [...(spec.covered_route_members || [])],
      assertions: [...(spec.assertions || [])],
      remaining_gaps: [...(spec.remaining_gaps || [])],
    };
  }
}

registerTenantAuthorizationProof([
  "MB-NEGOTIATE-COLLECTIVE",
  "MB-BILL-PROVIDER-REVENUE",
  "MB-BILL-MANUAL-RECORD",
  "MB-INTEL-P3-SEED",
], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: ["base44/shared/internalGate.ts"],
  test_refs: ["src/lib/materialTenantAuthorization.test.js"],
  covered_route_members: ["requireAdminOrInternal"],
  assertions: [
    "non-admin and unknown actors receive the same 403 forbidden response",
    "authentication-authority read failure returns 503 and does not authorize",
  ],
  actor_denial_equivalence: "PASSED_LOCAL",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "NOT_APPLICABLE",
  remaining_gaps: [
    "route wiring is source-observed, not a dynamic invocation of every physical handler",
    "route-specific tenant/entity binding beyond the shared admin/internal gate is not universally proven",
  ],
});

registerTenantAuthorizationProof([
  "MB-SEND-COMMERCIAL",
  "MB-NEGOTIATE-PROVIDER",
], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: [
    "base44/shared/communicationTenant.ts",
    "base44/shared/commercialSendSafety.ts",
  ],
  test_refs: [
    "src/lib/commercialSendSafety.test.js",
    "src/lib/approvalAuthoritySaga.test.js",
  ],
  covered_route_members: ["commercialSendMessage", "providerNegotiationAgent"],
  assertions: [
    "communication tenant is derived from durable related entities and persisted before send",
    "unresolved, unavailable, conflicting or ambiguous tenant evidence pauses automation and denies the send path",
  ],
  actor_denial_equivalence: "NOT_PROVEN",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "PASSED_LOCAL",
  remaining_gaps: [
    "non-owner versus unknown-actor response equivalence is not exercised through the complete route",
    "Outlook provider-final reconciliation remains partial in the material registry",
  ],
});

registerTenantAuthorizationProof([
  "MB-PUBLISH-SOCIAL-APPROVED",
  "MB-SCHEDULE-MEETING",
], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: [
    "base44/shared/externalApprovalExecution.ts",
    "base44/shared/approvalAuthority.ts",
  ],
  test_refs: ["src/lib/externalApprovalExecution.test.js"],
  covered_route_members: [
    "linkedinAgent",
    "xTwitterAgent",
    "newsletterAgent",
    "meetingAgent",
  ],
  assertions: [
    "different and missing actors are rejected by the same external_execution_actor_mismatch gate",
    "approval/task tenant mismatch, immutable-content mismatch and stale execution ownership deny before the provider effect",
  ],
  actor_denial_equivalence: "PASSED_LOCAL",
  authority_unavailable: "NOT_PROVEN",
  authority_ambiguous: "NOT_PROVEN",
  remaining_gaps: [
    "physical handler invocation with Base44 auth and provider adapters is not executed locally",
    "provider-final receipt and cost reconciliation remain partial",
  ],
});

registerTenantAuthorizationProof(["MB-WEBHOOK-DLQ-RETRY"], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: [
    "base44/shared/internalGate.ts",
    "base44/shared/webhookDeadLetterClaim.ts",
  ],
  test_refs: [
    "src/lib/materialTenantAuthorization.test.js",
    "src/lib/webhookDeadLetterClaim.test.js",
  ],
  covered_route_members: ["processWebhookDeadLetters"],
  assertions: [
    "admin/internal actor gate denies non-admin and unknown actors identically",
    "dead-letter ownership is CAS-claimed and ambiguous post-effect work is fenced",
  ],
  actor_denial_equivalence: "PASSED_LOCAL",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "NOT_APPLICABLE",
  remaining_gaps: [
    "receiver-side webhook idempotency and deployed authorization traces are external",
  ],
});

registerTenantAuthorizationProof(["MB-TERMS-APPROVAL-EXECUTION"], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: [
    "base44/shared/approvalResolutionSaga.ts",
    "base44/shared/approvalAuthority.ts",
  ],
  test_refs: ["src/lib/approvalAuthoritySaga.test.js"],
  covered_route_members: ["resolveCommercialApproval"],
  assertions: [
    "resolution actor, authority hash, command key and approval tenant bindings are checked before effects",
    "stale or conflicting saga ownership is denied and post-effect ambiguity becomes review-required",
  ],
  actor_denial_equivalence: "NOT_PROVEN",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "PASSED_LOCAL",
  remaining_gaps: [
    "non-owner and unknown-actor HTTP response equivalence is not exercised through resolveCommercialApproval",
  ],
});

registerTenantAuthorizationProof([
  "MB-MANDATE-ACCEPT",
  "MB-BILL-PAYMENT-METHOD",
], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: ["base44/shared/recoverAcceptance.ts"],
  test_refs: ["src/lib/contractPolicyE2E.test.js"],
  covered_route_members: [
    "acceptRecoverMandate",
    "startRecoverAcceptance",
    "startPaymentMethodSetup",
  ],
  assertions: [
    "owner succeeds while non-owner, missing actor and unknown activation receive the same non-enumerable denial",
    "unavailable and duplicate activation/brand authority reads fail closed before material work",
  ],
  actor_denial_equivalence: "PASSED_LOCAL",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "PASSED_LOCAL",
  remaining_gaps: [
    "Base44 request/auth and provider-effect handlers are not executed end-to-end locally",
  ],
});

registerTenantAuthorizationProof([
  "MB-MANDATE-REVOKE",
  "MB-BILL-RECOVER-ELIGIBILITY",
  "MB-BILL-RECOVER-STRIPE",
], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: [
    "base44/shared/recoverAcceptance.ts",
    "base44/shared/economicExecution.ts",
  ],
  test_refs: ["src/lib/recoverFinancialHardening.test.js"],
  covered_route_members: [
    "revokeMandate",
    "approveRecoverReportForInvoicing",
    "createEligibleRecoverInvoices",
  ],
  assertions: [
    "financial authority reads and CAS ownership are exercised with injected failures and concurrency",
    "lost claim ownership denies the provider effect",
  ],
  actor_denial_equivalence: "NOT_PROVEN",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "NOT_PROVEN",
  remaining_gaps: [
    "non-owner and unknown-actor HTTP response equivalence is not proven for every route member",
  ],
});

registerTenantAuthorizationProof(["MB-MIGRATE-DEVELOPER-GITHUB"], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: ["base44/shared/developerMigrationLifecycle.ts"],
  test_refs: ["src/lib/developerMigrationLifecycle.test.js"],
  covered_route_members: ["developerMigrationEngine"],
  assertions: [
    "workspace/run ownership, lease fencing and emergency epoch changes deny stale commits",
  ],
  actor_denial_equivalence: "NOT_PROVEN",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "NOT_PROVEN",
  remaining_gaps: [
    "non-owner and unknown-actor route responses are not proven identical",
  ],
});

registerTenantAuthorizationProof(["MB-BILL-API-OVERAGE"], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: [
    "base44/shared/apiUsageBilling.ts",
    "base44/shared/internalGate.ts",
  ],
  test_refs: [
    "src/lib/apiUsageBillingConcurrency.test.js",
    "src/lib/materialTenantAuthorization.test.js",
  ],
  covered_route_members: ["billApiUsage"],
  assertions: [
    "admin/internal denial equivalence is executed",
    "organization-period authority is bounded, fail-closed and single-winner under concurrency",
  ],
  actor_denial_equivalence: "PASSED_LOCAL",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "NOT_PROVEN",
  remaining_gaps: [
    "deployed scheduler identity and organization tenancy are not runtime-verified",
  ],
});

registerTenantAuthorizationProof(["MB-BILL-LEGACY-INVOICE-EVENT-QUARANTINE"], {
  proof_class: "REAL_PURE_GATE_EXECUTION",
  gate_refs: ["base44/functions/onInvoiceStatusEvent/entry.ts"],
  test_refs: ["src/lib/financialEntityServiceRoleRls.test.js"],
  covered_route_members: ["onInvoiceStatusEvent"],
  assertions: [
    "every actor and payload receives HTTP 410 before parsing, authority reads, or financial writes",
    "the legacy route cannot create PaymentEvent or mutate Invoice/MonthlySavingsReport",
  ],
  actor_denial_equivalence: "PASSED_LOCAL",
  authority_unavailable: "NOT_APPLICABLE",
  authority_ambiguous: "NOT_APPLICABLE",
  remaining_gaps: [
    "physical removal and production log verification belong to PURGE-2 and were not executed",
  ],
});

registerTenantAuthorizationProof(["MB-PAID-API-ENRICHMENT"], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: ["base44/shared/costGovernance.ts"],
  test_refs: ["src/lib/p4CostGovernance.test.js"],
  covered_route_members: [
    "paidProviderFetch",
    "reservePaidOperation",
    "guardReservedPaidProviderEffect",
  ],
  assertions: [
    "cost authority and reservation behavior are executed against local failure/concurrency fixtures",
  ],
  actor_denial_equivalence: "NOT_PROVEN",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "NOT_PROVEN",
  remaining_gaps: [
    "caller-specific tenant ownership is not proven for the complete dynamic caller census",
  ],
});

registerTenantAuthorizationProof(["MB-PAID-AI"], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: [
    "base44/shared/tenantOwnership.ts",
    "base44/shared/costGovernance.ts",
  ],
  test_refs: [
    "src/lib/tenantOwnership.test.js",
    "src/lib/p4CostGovernance.test.js",
  ],
  covered_route_members: [
    "discoveryTechStackAgent",
    "spendIntelligenceAgent",
    "recommendationEngineAgent",
  ],
  assertions: [
    "canonical Brand ownership returns byte-equivalent denial for non-owner, unknown actor and unknown target",
    "Brand authority outage/non-array/duplicates fail closed before the covered AI task writes",
  ],
  actor_denial_equivalence: "PASSED_LOCAL",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "PASSED_LOCAL",
  remaining_gaps: [
    "only 3 of the dynamically inventoried AI callers are wired to the canonical owner gate",
    "the material registry still records paid-AI emergency and provider-receipt hard gaps",
  ],
});

registerTenantAuthorizationProof(["MB-PROVIDER-DR-SHAREPOINT"], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: [
    "base44/shared/internalGate.ts",
    "base44/shared/disasterRecoveryRuntime.ts",
  ],
  test_refs: [
    "src/lib/materialTenantAuthorization.test.js",
    "src/lib/disasterRecovery.test.js",
  ],
  covered_route_members: ["disasterRecoveryBackup"],
  assertions: [
    "admin/internal actor denial and repository DR gate behavior are locally exercised",
  ],
  actor_denial_equivalence: "PASSED_LOCAL",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "NOT_APPLICABLE",
  remaining_gaps: [
    "SharePoint/Entra runtime authorization and real backup/restore evidence remain runtime-pending",
  ],
});

registerTenantAuthorizationProof(["MB-SCHEDULER-BASE"], {
  proof_class: "REAL_SHARED_GATE_EXECUTION",
  gate_refs: ["base44/shared/internalGate.ts", "base44/shared/schedulerRun.ts"],
  test_refs: [
    "src/lib/materialTenantAuthorization.test.js",
    "src/lib/schedulerLeaseFencing.test.js",
  ],
  covered_route_members: ["all Base44 scheduled automations"],
  assertions: [
    "admin/internal denial and scheduler lease/fence/review transitions are locally exercised",
  ],
  actor_denial_equivalence: "PASSED_LOCAL",
  authority_unavailable: "PASSED_LOCAL",
  authority_ambiguous: "NOT_APPLICABLE",
  remaining_gaps: [
    "per-worker tenant scope and complete downstream material-effect authorization remain partial",
  ],
});

registerTenantAuthorizationProof([
  "MB-INTEL-CLAIM-UPSERT",
  "MB-INTEL-OUTCOME-RECORD",
  "MB-INTEL-CLAIM-PROMOTE",
  "MB-INTEL-OUTCOME-SCHEDULED",
  "MB-INTEL-P3-LEGACY-PROMOTION",
], {
  proof_class: "REAL_PURE_GATE_EXECUTION",
  gate_refs: [
    "base44/shared/intelligenceTenantScope.ts",
    "base44/shared/intelligenceFoundationContracts.ts",
  ],
  test_refs: [
    "src/lib/intelligenceTenantScope.test.js",
    "src/lib/intelligenceFoundationContracts.test.js",
  ],
  covered_route_members: [
    "intelligenceAccess",
    "outcomeLearningWorker",
    "intelligenceMaintenanceWorker",
  ],
  assertions: [
    "missing, global-forbidden and cross-tenant bindings are rejected by executable tenant-scope gates",
    "same-tenant lineage is required before governed writes and learning eligibility",
  ],
  actor_denial_equivalence: "NOT_PROVEN",
  authority_unavailable: "NOT_APPLICABLE",
  authority_ambiguous: "NOT_PROVEN",
  remaining_gaps: [
    "actor ownership and deployed service-role row reads are not exercised for every physical writer",
  ],
});

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function pathEvidence(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(
    fs.existsSync(absolutePath),
    `remediation_r0_source_missing:${relativePath}`,
  );
  const bytes = fs.readFileSync(absolutePath);
  return { path: relativePath, sha256: sha256(bytes), bytes: bytes.length };
}

function sortStrings(values) {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en")
  );
}

function listFunctionEntrySources(root) {
  const functionsRoot = path.join(root, "base44/functions");
  return fs.readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      functionName: entry.name,
      relativePath: `base44/functions/${entry.name}/entry.ts`,
    }))
    .filter((entry) => fs.existsSync(path.join(root, entry.relativePath)))
    .sort((left, right) =>
      left.functionName.localeCompare(right.functionName, "en")
    );
}

function findFunctionCallers(root, pattern) {
  return listFunctionEntrySources(root)
    .filter((entry) =>
      pattern.test(fs.readFileSync(path.join(root, entry.relativePath), "utf8"))
    )
    .map((entry) => entry.functionName);
}

function inputFingerprint(evidence) {
  return sha256(
    Buffer.from(
      evidence.map((row) => `${row.path}\0${row.sha256}\0${row.bytes}\n`).join(
        "",
      ),
    ),
  );
}

function statusCounts(rows) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row.status))].sort().map((status) => [
      status,
      rows.filter((row) => row.status === status).length,
    ]),
  );
}

function kindCounts(rows) {
  return Object.fromEntries(
    [...MATERIAL_KINDS].sort().map((kind) => [
      kind,
      rows.filter((row) => row.material_kinds.includes(kind)).length,
    ]),
  );
}

function validateTopologyBindings(topology) {
  const expected = [
    ["manageLegalExecution", "marketPolicyAdmin", {
      action: "manage_legal_execution",
    }],
    ["disasterRecoveryBackup", "maintenanceEngine", {
      host_action: "disaster_recovery_backup",
    }],
  ];
  for (const [logical, host, selector] of expected) {
    const actual = topology.logical_routes?.[logical];
    assert(
      actual?.host === host,
      `remediation_r0_topology_host_drift:${logical}`,
    );
    assert(
      JSON.stringify(actual.route) === JSON.stringify(selector),
      `remediation_r0_topology_selector_drift:${logical}`,
    );
  }
}

export function validateMaterialBoundaryRegistry(document) {
  assert(
    document?.schema_version === "cambra-material-boundary-registry-v1",
    "material_registry_schema_invalid",
  );
  assert(
    Array.isArray(document.boundaries) && document.boundaries.length > 0,
    "material_registry_boundaries_required",
  );
  const ids = new Set();
  for (const row of document.boundaries) {
    assert(
      row.boundary_id && !ids.has(row.boundary_id),
      `material_registry_boundary_id_invalid:${row.boundary_id || "missing"}`,
    );
    ids.add(row.boundary_id);
    assert(
      Array.isArray(row.material_kinds) && row.material_kinds.length > 0,
      `material_registry_kind_missing:${row.boundary_id}`,
    );
    for (const kind of row.material_kinds) {
      assert(
        MATERIAL_KINDS.has(kind),
        `material_registry_kind_invalid:${row.boundary_id}:${kind}`,
      );
    }
    for (
      const field of [
        "logical_route",
        "physical_host",
        "actor",
        "tenant_key",
        "claim_primitive",
        "effect_key",
        "provider_idempotency",
        "provider_reconciliation",
        "status",
      ]
    ) {
      assert(
        typeof row[field] === "string" && row[field].length > 0,
        `material_registry_field_missing:${row.boundary_id}:${field}`,
      );
    }
    assert(
      Array.isArray(row.policy) && row.policy.length > 0,
      `material_registry_policy_missing:${row.boundary_id}`,
    );
    assert(
      Array.isArray(row.receipt) && row.receipt.length > 0,
      `material_registry_receipt_missing:${row.boundary_id}`,
    );
    assert(
      Array.isArray(row.source_evidence) && row.source_evidence.length > 0,
      `material_registry_source_evidence_missing:${row.boundary_id}`,
    );
    assert(
      Array.isArray(row.emergency?.capabilities),
      `material_registry_emergency_missing:${row.boundary_id}`,
    );
  }
  assert(
    document.scheduler_inventory.scheduled_automation_count ===
      document.scheduler_inventory.automations.length,
    "material_registry_scheduler_count_drift",
  );
  assert(
    document.scheduler_inventory.active_count ===
      document.scheduler_inventory.automations.filter((row) => row.is_active)
        .length,
    "material_registry_scheduler_active_drift",
  );
  assert(
    document.scheduler_inventory.guarded_count ===
      document.scheduler_inventory.automations.filter((row) =>
        row.protection_classification === "SLOT_GUARDED"
      ).length,
    "material_registry_scheduler_guarded_drift",
  );
  assert(
    document.paid_ai_inventory.callers.length ===
      document.paid_ai_inventory.caller_count,
    "material_registry_ai_count_drift",
  );
  // This guard exists so nobody can quietly claim the AI emergency gap is closed
  // without doing the work. COMMAND-C0 did the work: category=ai now maps onto
  // the paid_discovery capability and reservePaidOperation captures the epoch
  // from it. The guard stays exactly as strict — the pinned value simply moved
  // to the truth. Changing it again requires the same burden of proof.
  assert(
    document.paid_ai_inventory.emergency_capability === "paid_discovery",
    "material_registry_ai_gap_must_be_explicit",
  );
  return document;
}

export function buildMaterialBoundaryRegistry(root = REPO_ROOT) {
  const topology = readJson(root, "base44/deployment-topology.json");
  const scheduler = readJson(root, "config/scheduler-inventory.json");
  validateTopologyBindings(topology);

  const functionEntries = listFunctionEntrySources(root);
  // COMMAND-C5 (2026-08-17): callCambraModel is the second AI primitive
  // (commandModelRouter). Matching only callCambraClaude made a real AI
  // spender invisible to this census the moment a caller was migrated.
  const aiCallers = findFunctionCallers(root, /\bcallCambra(?:Claude|Model)\b/);
  const paidPrimitiveCallers = findFunctionCallers(
    root,
    /\b(?:paidProviderFetch|sendCostGovernedEmail|reservePaidOperation)\b/,
  );
  const schedulerKeys = scheduler.automations.map((row) => row.worker_key);
  const activeSchedulerKeys = scheduler.automations.filter((row) =>
    row.is_active
  ).map((row) => row.worker_key);

  const boundaries = BOUNDARY_SPECS.map((spec) => {
    let callers = spec.callers;
    if (callers === "__DYNAMIC_AI_CALLERS__") callers = aiCallers;
    if (callers === "__DYNAMIC_PAID_CALLERS__") callers = paidPrimitiveCallers;
    if (callers === "__DYNAMIC_SCHEDULER_KEYS__") callers = schedulerKeys;
    const sourcePaths = sortStrings([
      ...spec.source_paths,
      ...(spec.boundary_id === "MB-PAID-AI"
        ? aiCallers.map((name) => `base44/functions/${name}/entry.ts`)
        : []),
      ...(spec.boundary_id === "MB-PAID-API-ENRICHMENT"
        ? paidPrimitiveCallers.map((name) =>
          `base44/functions/${name}/entry.ts`
        )
        : []),
    ]);
    return {
      ...spec,
      callers: [...callers].sort((left, right) =>
        left.localeCompare(right, "en")
      ),
      source_evidence: sourcePaths.map((relativePath) =>
        pathEvidence(root, relativePath)
      ),
      source_paths: undefined,
    };
  });

  const materialScheduledRoutes = Object.entries(MATERIAL_SCHEDULED_ROUTES)
    .map(([worker_key, material_kinds]) => {
      const matches = scheduler.automations.filter((row) =>
        row.worker_key === worker_key
      );
      assert(
        matches.length === 1,
        `remediation_r0_material_scheduler_binding_invalid:${worker_key}`,
      );
      return {
        worker_key,
        material_kinds,
        is_active: matches[0].is_active,
        function_directory: matches[0].function_directory,
        config_path: matches[0].config_path,
      };
    })
    .sort((left, right) =>
      left.worker_key.localeCompare(right.worker_key, "en")
    );

  const schedulerRows = scheduler.automations.map((row) => ({
    worker_key: row.worker_key,
    function_directory: row.function_directory,
    config_path: row.config_path,
    is_active: row.is_active,
    protection_classification: row.protection_classification,
    authority: row.authority,
    tenant_scope: row.tenant_scope,
    idempotency: row.idempotency,
  }));

  const inputPaths = sortStrings([
    "base44/deployment-topology.json",
    "base44/shared/operationalControl.ts",
    "config/scheduler-inventory.json",
    "src/docs/PRODUCTION_SURFACE_INVENTORY.md",
    ...boundaries.flatMap((row) =>
      row.source_evidence.map((entry) => entry.path)
    ),
  ]);
  const inputEvidence = inputPaths.map((relativePath) =>
    pathEvidence(root, relativePath)
  );
  const staleSurfaceText = fs.readFileSync(
    path.join(root, "src/docs/PRODUCTION_SURFACE_INVENTORY.md"),
    "utf8",
  );
  const staleDeclaredCount = Number(
    staleSurfaceText.match(/Censo:[^\n]*?([0-9]+) backend functions/)?.[1] || 0,
  );

  const document = {
    schema_version: "cambra-material-boundary-registry-v1",
    registry_status: "COMPLETE_INVENTORY_WITH_DECLARED_GAPS",
    truth_boundary:
      "This is a repository-derived control inventory, not runtime proof. PARTIAL/ABSENT rows remain hard-gate gaps until their receipts and runtime evidence exist.",
    generated_from: [
      "physical base44/functions entry sources",
      "base44/deployment-topology.json",
      "config/scheduler-inventory.json",
      "shared claim/emergency/cost primitives",
    ],
    input_fingerprint_sha256: inputFingerprint(inputEvidence),
    input_file_count: inputEvidence.length,
    surface_snapshot: {
      source_function_directories:
        fs.readdirSync(path.join(root, "base44/functions"), {
          withFileTypes: true,
        }).filter((entry) => entry.isDirectory()).length,
      source_entry_files: functionEntries.length,
      physical_function_target: topology.physical_function_target,
      logical_route_count: Object.keys(topology.logical_routes || {}).length,
      stale_production_surface_inventory_declared_functions: staleDeclaredCount,
      stale_production_surface_inventory_detected:
        staleDeclaredCount !== functionEntries.length,
    },
    summary: {
      boundary_count: boundaries.length,
      status_counts: statusCounts(boundaries),
      material_kind_counts: kindCounts(boundaries),
      declared_gap_codes: sortStrings(
        boundaries.flatMap((row) => row.gap_codes),
      ),
    },
    paid_ai_inventory: {
      primitive: "callCambraClaude|callCambraModel",
      caller_count: aiCallers.length,
      callers: aiCallers,
      cost_category: "ai",
      // COMMAND-C0 (2026-08-17) mapped category=ai onto the paid_discovery
      // emergency capability in paidProviderEmergencyCapabilities, and
      // reservePaidOperation captures/inherits the epoch from it. This field
      // read "NONE" and the EMERGENCY_CAPABILITY_MISSING_AI gap stayed listed
      // after that fix landed, so the registry claimed an open gap the code had
      // already closed. Proven by src/lib/aiSpendEmergencyCoverage.test.js,
      // which asserts zero provider calls under safe mode end to end.
      emergency_capability: "paid_discovery",
      gap_codes: [
        "AI_RETRY_EFFECT_KEY_UNSTABLE",
        "PROVIDER_FINAL_RECEIPT_MISSING",
      ],
    },
    paid_primitive_inventory: {
      primitives: [
        "paidProviderFetch",
        "sendCostGovernedEmail",
        "reservePaidOperation",
      ],
      caller_count: paidPrimitiveCallers.length,
      callers: paidPrimitiveCallers,
    },
    scheduler_inventory: {
      schema_version: scheduler.schema_version,
      scheduled_automation_count: scheduler.scheduled_automation_count,
      active_count: scheduler.active_count,
      guarded_count: scheduler.guarded_count,
      unguarded_active: scheduler.unguarded_active,
      active_worker_keys: activeSchedulerKeys,
      inactive_worker_keys: scheduler.automations.filter((row) =>
        !row.is_active
      ).map((row) => row.worker_key),
      metadata_gap:
        "Existing inventory leaves tenant_scope and much authority/retry/reconciliation metadata UNKNOWN; scheduler claim does not prove downstream idempotency.",
      material_scheduled_routes: materialScheduledRoutes,
      automations: schedulerRows,
    },
    global_gap_codes: [
      "EMERGENCY_CAPABILITY_MISSING_AI",
      "EMERGENCY_CAPABILITY_MISSING_SIGN_MANDATE",
      "EMERGENCY_CAPABILITY_MISSING_KNOWLEDGE_PROMOTION",
      "MATERIAL_BOUNDARY_REGISTRY_WAS_MISSING",
      "PROVIDER_FINAL_RECEIPT_MISSING",
      "SCHEDULER_METADATA_UNKNOWN",
      "STALE_SURFACE_INVENTORY",
    ],
    boundaries,
  };
  return validateMaterialBoundaryRegistry(document);
}

function effectClassesForBoundary(boundary) {
  return EFFECT_CLASS_SPECS
    .filter((spec) =>
      spec.material_kinds.some((kind) => boundary.material_kinds.includes(kind))
    )
    .map((spec) => spec.key);
}

export function validateEffectAuthorityRegistry(document, materialRegistry) {
  assert(
    document?.schema_version === "cambra-effect-authority-registry-v1",
    "effect_authority_registry_schema_invalid",
  );
  assert(
    materialRegistry?.schema_version === "cambra-material-boundary-registry-v1",
    "effect_authority_material_registry_invalid",
  );
  assert(
    document.material_registry_sha256 ===
      sha256(Buffer.from(serializeArtifact(materialRegistry))),
    "effect_authority_material_registry_hash_drift",
  );
  assert(
    Array.isArray(document.effect_classes) &&
      document.effect_classes.length === 10,
    "effect_authority_class_count_invalid",
  );
  assert(
    Array.isArray(document.boundaries) &&
      document.boundaries.length === materialRegistry.boundaries.length,
    "effect_authority_boundary_count_drift",
  );
  assert(
    document.summary.effect_class_count === 10,
    "effect_authority_summary_class_count_drift",
  );
  assert(
    document.summary.boundary_count === materialRegistry.boundaries.length,
    "effect_authority_summary_boundary_count_drift",
  );
  assert(
    document.summary.binary_closed_count === 0,
    "effect_authority_binary_closure_forbidden",
  );
  assert(
    document.summary.runtime_verified_count === 0,
    "effect_authority_runtime_claim_forbidden",
  );

  const expectedKeys = EFFECT_CLASS_SPECS.map((row) => row.key);
  assert(
    JSON.stringify(document.effect_classes.map((row) => row.key)) ===
      JSON.stringify(expectedKeys),
    "effect_authority_class_key_drift",
  );
  const boundaryById = new Map(
    materialRegistry.boundaries.map((row) => [row.boundary_id, row]),
  );
  const projectedById = new Map(
    document.boundaries.map((row) => [row.boundary_id, row]),
  );
  assert(
    projectedById.size === document.boundaries.length,
    "effect_authority_boundary_duplicate",
  );
  for (const boundary of materialRegistry.boundaries) {
    const projected = projectedById.get(boundary.boundary_id);
    assert(
      projected,
      `effect_authority_boundary_missing:${boundary.boundary_id}`,
    );
    assert(
      JSON.stringify(projected.effect_classes) ===
        JSON.stringify(effectClassesForBoundary(boundary)),
      `effect_authority_boundary_class_drift:${boundary.boundary_id}`,
    );
    assert(
      projected.implementation_status === "PARTIAL",
      `effect_authority_boundary_must_remain_partial:${boundary.boundary_id}`,
    );
    assert(
      projected.binary_closure_status === "NOT_MET",
      `effect_authority_boundary_closure_forbidden:${boundary.boundary_id}`,
    );
    assert(
      projected.runtime_verified === false,
      `effect_authority_runtime_verified_forbidden:${boundary.boundary_id}`,
    );
    assert(
      Array.isArray(projected.existing_authority_primitives) &&
        projected.existing_authority_primitives.length > 0,
      `effect_authority_existing_primitive_missing:${boundary.boundary_id}`,
    );
    assert(
      Array.isArray(projected.remaining_gaps) &&
        projected.remaining_gaps.length > 0,
      `effect_authority_remaining_gap_missing:${boundary.boundary_id}`,
    );
    if (projected.wiring_status === "PARTIAL_ROUTE_WIRING") {
      const configured = EFFECT_AUTHORITY_WIRING[boundary.boundary_id];
      assert(
        configured,
        `effect_authority_wiring_config_missing:${boundary.boundary_id}`,
      );
      assert(
        configured.effect_classes.every((key) =>
          projected.effect_classes.includes(key)
        ),
        `effect_authority_wiring_class_invalid:${boundary.boundary_id}`,
      );
      assert(
        projected.wired_source_evidence.length > 0,
        `effect_authority_wiring_evidence_missing:${boundary.boundary_id}`,
      );
    } else {
      assert(
        projected.wiring_status === "SOURCE_OBSERVED_ONLY",
        `effect_authority_wiring_status_invalid:${boundary.boundary_id}`,
      );
    }
  }
  for (const effectClass of document.effect_classes) {
    assert(
      effectClass.boundary_ids.length > 0,
      `effect_authority_class_unmapped:${effectClass.key}`,
    );
    assert(
      effectClass.wired_boundary_ids.length > 0,
      `effect_authority_class_without_local_wiring:${effectClass.key}`,
    );
    for (const id of effectClass.boundary_ids) {
      assert(
        boundaryById.has(id),
        `effect_authority_class_boundary_unknown:${effectClass.key}:${id}`,
      );
    }
  }
  return document;
}

export function buildEffectAuthorityRegistry(
  root = REPO_ROOT,
  materialRegistry = buildMaterialBoundaryRegistry(root),
) {
  const materialRegistrySha = sha256(
    Buffer.from(serializeArtifact(materialRegistry)),
  );
  const boundaries = materialRegistry.boundaries.map((boundary) => {
    const effectClasses = effectClassesForBoundary(boundary);
    const wiring = EFFECT_AUTHORITY_WIRING[boundary.boundary_id] || null;
    const wiredSourceEvidence = wiring
      ? wiring.source_paths.map((relativePath) => {
        const source = fs.readFileSync(path.join(root, relativePath), "utf8");
        assert(
          /requireEffectAuthorit(?:y|ies)/.test(source),
          `effect_authority_route_marker_missing:${boundary.boundary_id}:${relativePath}`,
        );
        return pathEvidence(root, relativePath);
      })
      : [];
    const classPrimitives = effectClasses.flatMap((key) =>
      EFFECT_CLASS_SPECS.find((row) => row.key === key)?.existing_authorities ||
      []
    );
    return {
      boundary_id: boundary.boundary_id,
      logical_route: boundary.logical_route,
      physical_host: boundary.physical_host,
      effect_classes: effectClasses,
      existing_authority_primitives: sortStrings([
        ...classPrimitives,
        ...boundary.policy,
        boundary.claim_primitive,
        `Emergency: ${boundary.emergency.epoch}`,
      ]),
      wiring_status: wiring ? "PARTIAL_ROUTE_WIRING" : "SOURCE_OBSERVED_ONLY",
      wired_route_members: wiring ? wiring.route_members : [],
      wired_effect_classes: wiring ? wiring.effect_classes : [],
      wired_source_evidence: wiredSourceEvidence,
      implementation_status: "PARTIAL",
      binary_closure_status: "NOT_MET",
      runtime_verified: false,
      remaining_gaps: sortStrings([
        ...boundary.gap_codes,
        wiring
          ? "only the listed route members revalidate through requireEffectAuthority at the local commit/effect boundary"
          : "no executable requireEffectAuthority route wiring is present for this boundary",
        "deployed actor/tenant/policy/market authority trace is missing",
      ]),
    };
  });
  const effectClasses = EFFECT_CLASS_SPECS.map((spec) => {
    const boundaryIds = boundaries.filter((row) =>
      row.effect_classes.includes(spec.key)
    ).map((row) => row.boundary_id);
    const wiredBoundaryIds = boundaries.filter((row) =>
      row.wired_effect_classes.includes(spec.key)
    ).map((row) => row.boundary_id);
    return {
      key: spec.key,
      literal_label: spec.literal_label,
      material_kinds: spec.material_kinds,
      existing_authorities: spec.existing_authorities,
      boundary_ids: boundaryIds,
      wired_boundary_ids: wiredBoundaryIds,
      implementation_status: "PARTIAL",
      binary_closure_status: "NOT_MET",
      runtime_verified: false,
      blockers: [
        "not every registered material route is wired to the facade",
        "deployed final-SHA authority traces and zero-effect denial receipts are absent",
      ],
    };
  });
  const evidencePaths = sortStrings([
    "base44/shared/effectAuthority.ts",
    "base44/shared/marketLaunchScope.ts",
    "base44/shared/operationalControl.ts",
    ...boundaries.flatMap((row) =>
      row.wired_source_evidence.map((entry) => entry.path)
    ),
  ]);
  const evidence = evidencePaths.map((relativePath) =>
    pathEvidence(root, relativePath)
  );
  const document = {
    schema_version: "cambra-effect-authority-registry-v1",
    registry_version: "effect-authority-registry.v1",
    registry_status: "PARTIAL_LOCAL_WIRING_RUNTIME_PENDING",
    truth_boundary:
      "This generated projection reuses existing domain authorities and records local facade wiring. It creates no durable authority and proves neither universal route coverage nor deployed runtime authorization.",
    material_registry_path: MATERIAL_BOUNDARY_OUTPUT,
    material_registry_sha256: materialRegistrySha,
    material_registry_input_fingerprint_sha256:
      materialRegistry.input_fingerprint_sha256,
    input_fingerprint_sha256: inputFingerprint(evidence),
    facade: {
      source: "base44/shared/effectAuthority.ts",
      function: "requireEffectAuthority",
      batch_function: "requireEffectAuthorities",
      creates_entity_or_control_plane: false,
      failure_semantics:
        "unknown actor, tenant/subject mismatch, protected/unknown market, unavailable/stale policy or Emergency authority => non-2xx and effects=false",
    },
    summary: {
      effect_class_count: effectClasses.length,
      boundary_count: boundaries.length,
      locally_wired_boundary_count:
        boundaries.filter((row) => row.wiring_status === "PARTIAL_ROUTE_WIRING")
          .length,
      source_observed_only_boundary_count:
        boundaries.filter((row) => row.wiring_status === "SOURCE_OBSERVED_ONLY")
          .length,
      implementation_partial_count:
        boundaries.filter((row) => row.implementation_status === "PARTIAL")
          .length,
      binary_closed_count: 0,
      runtime_verified_count: 0,
    },
    effect_classes: effectClasses,
    boundaries,
    evidence,
  };
  return validateEffectAuthorityRegistry(document, materialRegistry);
}

function valueCounts(rows, field) {
  return Object.fromEntries(
    sortStrings(rows.map((row) => row[field])).map((value) => [
      value,
      rows.filter((row) => row[field] === value).length,
    ]),
  );
}

export function validateTenantAuthorizationInventory(
  document,
  materialRegistry,
) {
  assert(
    document?.schema_version ===
      "cambra-material-tenant-authorization-inventory-v1",
    "tenant_authorization_schema_invalid",
  );
  assert(
    materialRegistry?.schema_version === "cambra-material-boundary-registry-v1",
    "tenant_authorization_material_registry_invalid",
  );
  assert(
    document.material_registry_sha256 ===
      sha256(Buffer.from(serializeArtifact(materialRegistry))),
    "tenant_authorization_material_registry_hash_drift",
  );
  assert(
    Array.isArray(document.routes) &&
      document.routes.length === materialRegistry.boundaries.length,
    "tenant_authorization_route_count_drift",
  );
  assert(
    document.summary.route_count === document.routes.length,
    "tenant_authorization_summary_count_drift",
  );
  assert(
    document.summary.runtime_verified_count === 0,
    "tenant_authorization_runtime_claim_forbidden",
  );
  assert(
    document.summary.binary_closed_count === 0,
    "tenant_authorization_binary_closure_forbidden",
  );

  const routeById = new Map(
    document.routes.map((row) => [row.boundary_id, row]),
  );
  assert(
    routeById.size === document.routes.length,
    "tenant_authorization_boundary_duplicate",
  );
  for (const boundary of materialRegistry.boundaries) {
    const row = routeById.get(boundary.boundary_id);
    assert(
      row,
      `tenant_authorization_boundary_missing:${boundary.boundary_id}`,
    );
    assert(
      row.logical_route === boundary.logical_route,
      `tenant_authorization_route_drift:${boundary.boundary_id}`,
    );
    assert(
      row.physical_host === boundary.physical_host,
      `tenant_authorization_host_drift:${boundary.boundary_id}`,
    );
    assert(
      row.tenant_key === boundary.tenant_key,
      `tenant_authorization_tenant_key_drift:${boundary.boundary_id}`,
    );
    assert(
      row.implementation_status === "PARTIAL",
      `tenant_authorization_must_remain_partial:${boundary.boundary_id}`,
    );
    assert(
      row.binary_closure_status === "NOT_MET",
      `tenant_authorization_closure_forbidden:${boundary.boundary_id}`,
    );
    assert(
      row.local_test_scope === "PARTIAL_CRITERION_ONLY",
      `tenant_authorization_test_scope_invalid:${boundary.boundary_id}`,
    );
    assert(
      row.runtime_verified === false,
      `tenant_authorization_runtime_verified_forbidden:${boundary.boundary_id}`,
    );
    assert(
      [
        "SOURCE_OBSERVED_ONLY",
        "REAL_SHARED_GATE_EXECUTION",
        "REAL_PURE_GATE_EXECUTION",
        "NO_PHYSICAL_ROUTE",
      ].includes(row.proof_class),
      `tenant_authorization_proof_class_invalid:${boundary.boundary_id}`,
    );
    assert(
      ["NOT_RUN", "PASSED_LOCAL"].includes(row.test_status),
      `tenant_authorization_test_status_invalid:${boundary.boundary_id}`,
    );
    assert(
      ["SOURCE_OBSERVED", "LOCAL_FAILURE_INJECTION"].includes(
        row.verification_level,
      ),
      `tenant_authorization_verification_level_invalid:${boundary.boundary_id}`,
    );
    for (
      const field of [
        "actor_denial_equivalence",
        "authority_unavailable",
        "authority_ambiguous",
      ]
    ) {
      assert(
        ["PASSED_LOCAL", "NOT_PROVEN", "NOT_APPLICABLE"].includes(
          row.gate_coverage[field],
        ),
        `tenant_authorization_gate_status_invalid:${boundary.boundary_id}:${field}`,
      );
    }
    assert(
      Array.isArray(row.route_source_refs) && row.route_source_refs.length > 0,
      `tenant_authorization_route_sources_missing:${boundary.boundary_id}`,
    );
    assert(
      Array.isArray(row.remaining_gaps) && row.remaining_gaps.length > 0,
      `tenant_authorization_remaining_gap_missing:${boundary.boundary_id}`,
    );
    assert(
      Array.isArray(row.gate_evidence) && Array.isArray(row.test_evidence),
      `tenant_authorization_evidence_invalid:${boundary.boundary_id}`,
    );
    for (const evidence of [...row.gate_evidence, ...row.test_evidence]) {
      assert(
        /^[a-f0-9]{64}$/.test(evidence.sha256),
        `tenant_authorization_evidence_hash_invalid:${boundary.boundary_id}:${evidence.path}`,
      );
    }
    if (row.test_status === "PASSED_LOCAL") {
      assert(
        row.test_evidence.length > 0,
        `tenant_authorization_pass_without_test:${boundary.boundary_id}`,
      );
      assert(
        row.proof_class.startsWith("REAL_"),
        `tenant_authorization_pass_without_real_gate:${boundary.boundary_id}`,
      );
    }
  }

  for (
    const boundaryId of [
      "MB-PAID-AI",
      "MB-MANDATE-ACCEPT",
      "MB-BILL-PAYMENT-METHOD",
    ]
  ) {
    const row = routeById.get(boundaryId);
    assert(
      row?.gate_coverage.actor_denial_equivalence === "PASSED_LOCAL",
      `tenant_authorization_non_enumerable_proof_missing:${boundaryId}`,
    );
    assert(
      row?.gate_coverage.authority_unavailable === "PASSED_LOCAL",
      `tenant_authorization_unavailable_proof_missing:${boundaryId}`,
    );
    assert(
      row?.gate_coverage.authority_ambiguous === "PASSED_LOCAL",
      `tenant_authorization_ambiguous_proof_missing:${boundaryId}`,
    );
  }
  return document;
}

export function buildTenantAuthorizationInventory(
  root = REPO_ROOT,
  materialRegistry = buildMaterialBoundaryRegistry(root),
) {
  const routes = materialRegistry.boundaries.map((boundary) => {
    const configured = TENANT_AUTHORIZATION_PROOF_SPECS[boundary.boundary_id];
    const absent = boundary.logical_route === "NONE_FOUND";
    const spec = configured || {
      proof_class: absent ? "NO_PHYSICAL_ROUTE" : "SOURCE_OBSERVED_ONLY",
      gate_refs: [],
      test_refs: [],
      covered_route_members: [],
      assertions: [],
      actor_denial_equivalence: "NOT_PROVEN",
      authority_unavailable: "NOT_PROVEN",
      authority_ambiguous: "NOT_PROVEN",
      remaining_gaps: [
        absent
          ? "no physical material route exists to authorize or execute"
          : "no executable route-specific tenant authorization proof is mapped",
      ],
    };
    const gateEvidence = sortStrings(spec.gate_refs).map((relativePath) =>
      pathEvidence(root, relativePath)
    );
    const testEvidence = sortStrings(spec.test_refs).map((relativePath) =>
      pathEvidence(root, relativePath)
    );
    const passedLocal = testEvidence.length > 0 &&
      spec.proof_class.startsWith("REAL_");
    return {
      boundary_id: boundary.boundary_id,
      logical_route: boundary.logical_route,
      physical_host: boundary.physical_host,
      material_kinds: boundary.material_kinds,
      actor: boundary.actor,
      tenant_key: boundary.tenant_key,
      material_registry_status: boundary.status,
      material_registry_gap_codes: boundary.gap_codes,
      implementation_status: "PARTIAL",
      binary_closure_status: "NOT_MET",
      test_status: passedLocal ? "PASSED_LOCAL" : "NOT_RUN",
      verification_level: passedLocal
        ? "LOCAL_FAILURE_INJECTION"
        : "SOURCE_OBSERVED",
      local_test_scope: "PARTIAL_CRITERION_ONLY",
      runtime_verified: false,
      proof_class: spec.proof_class,
      route_wiring_status: "SOURCE_OBSERVED",
      route_source_refs: boundary.source_evidence.map((entry) => entry.path),
      covered_route_members: sortStrings(spec.covered_route_members),
      gate_coverage: {
        assertions: spec.assertions,
        actor_denial_equivalence: spec.actor_denial_equivalence,
        authority_unavailable: spec.authority_unavailable,
        authority_ambiguous: spec.authority_ambiguous,
      },
      gate_evidence: gateEvidence,
      test_evidence: testEvidence,
      remaining_gaps: sortStrings([
        ...spec.remaining_gaps,
        "no deployed Base44 authorization trace proves this complete material path",
      ]),
    };
  });

  const evidence = sortStrings(routes.flatMap((row) => [
    ...row.gate_evidence.map((entry) => entry.path),
    ...row.test_evidence.map((entry) => entry.path),
  ])).map((relativePath) => pathEvidence(root, relativePath));
  const materialRegistrySha = sha256(
    Buffer.from(serializeArtifact(materialRegistry)),
  );
  const testFiles = sortStrings(
    routes.flatMap((row) => row.test_evidence.map((entry) => entry.path)),
  );
  const document = {
    schema_version: "cambra-material-tenant-authorization-inventory-v1",
    inventory_status: "PARTIAL_LOCAL_PROOF_RUNTIME_PENDING",
    truth_boundary:
      "This inventory maps every R0 material boundary to source wiring and executable shared/pure authorization tests where they exist. A shared-gate test is partial criterion evidence, not proof that every physical handler and deployed provider effect is authorized end-to-end.",
    closure_rule:
      "No route closes unless its complete handler-to-effect path is locally exercised, non-owner and unknown actors are non-enumerably denied where applicable, authority outages/ambiguity fail closed, and deployed runtime evidence exists.",
    material_registry_path: MATERIAL_BOUNDARY_OUTPUT,
    material_registry_sha256: materialRegistrySha,
    material_registry_input_fingerprint_sha256:
      materialRegistry.input_fingerprint_sha256,
    input_fingerprint_sha256: sha256(
      Buffer.from(`${materialRegistrySha}\n${inputFingerprint(evidence)}\n`),
    ),
    reproducible_local_test_run: {
      command: `node_modules/.bin/vitest run ${testFiles.join(" ")}`,
      test_files: testFiles,
      test_file_count: testFiles.length,
      test_status: "PASSED_LOCAL",
      local_test_scope: "PARTIAL_CRITERION_ONLY",
      limitation:
        "The command exercises mapped gates and failure fixtures; it does not invoke all Base44 HTTP handlers or establish runtime closure.",
    },
    summary: {
      route_count: routes.length,
      proof_class_counts: valueCounts(routes, "proof_class"),
      test_status_counts: valueCounts(routes, "test_status"),
      actor_denial_equivalence_counts: valueCounts(
        routes.map((row) => ({
          value: row.gate_coverage.actor_denial_equivalence,
        })),
        "value",
      ),
      authority_unavailable_counts: valueCounts(
        routes.map((row) => ({
          value: row.gate_coverage.authority_unavailable,
        })),
        "value",
      ),
      authority_ambiguous_counts: valueCounts(
        routes.map((row) => ({ value: row.gate_coverage.authority_ambiguous })),
        "value",
      ),
      implementation_partial_count:
        routes.filter((row) => row.implementation_status === "PARTIAL").length,
      binary_closed_count:
        routes.filter((row) => row.binary_closure_status === "CLOSED").length,
      runtime_verified_count:
        routes.filter((row) => row.runtime_verified).length,
    },
    routes,
  };
  return validateTenantAuthorizationInventory(document, materialRegistry);
}

function countLf(bytes) {
  let count = 0;
  for (const byte of bytes) if (byte === 10) count += 1;
  return count;
}

export function validateResearchCorpusInventory(document) {
  assert(
    document?.schema_version === "cambra-research-corpus-inventory-v1",
    "research_corpus_schema_invalid",
  );
  const sources = document.physical_sources;
  assert(Array.isArray(sources), "research_corpus_sources_required");
  assert(
    document.physical.physical_files === sources.length,
    "research_corpus_physical_count_drift",
  );
  assert(
    document.physical.unique_sha256 ===
      new Set(sources.map((row) => row.sha256)).size,
    "research_corpus_unique_count_drift",
  );
  assert(
    document.physical.exact_duplicates ===
      sources.length - document.physical.unique_sha256,
    "research_corpus_duplicate_count_drift",
  );
  assert(
    document.status === "FOUNDER_CORPUS_PRESENT_UNTRUSTED_INTEGRATED",
    "research_corpus_integration_status_invalid",
  );
  assert(
    document.canonical_corpus?.authority === "FOUNDER_DECISION" &&
      document.canonical_corpus?.scope === "EXACT_DECLARED_CORPUS" &&
      document.canonical_corpus?.complete_as_declared === true,
    "research_corpus_founder_scope_invalid",
  );
  for (const [key, expected] of Object.entries(
    FOUNDER_CANONICAL_RESEARCH_CORPUS,
  )) {
    assert(
      document.canonical_corpus?.[key] === expected &&
        document.physical?.[key] === expected,
      `research_corpus_founder_count_drift:${key}`,
    );
  }
  for (const [key, expected] of Object.entries(RESEARCH_SAFETY_POLICY)) {
    assert(
      document.research_policy?.[key] === expected,
      `research_corpus_safety_policy_drift:${key}`,
    );
  }
  assert(
    sources.every((row) =>
      row.truth_level === RESEARCH_SAFETY_POLICY.truth_level
    ),
    "research_corpus_source_truth_level_drift",
  );
  assert(
    document.external_source_reverification === "NOT_RUN" &&
      document.near_duplicate_detection === "NOT_RUN",
    "research_corpus_external_verification_not_run_required",
  );
  assert(
    document.r6_gate?.status ===
        "REPO_INTEGRATED_RUNTIME_REVERIFICATION_PENDING" &&
      document.r6_gate?.closure_scope === "REPOSITORY_INTAKE_ONLY" &&
      document.r6_gate?.may_mark_pass === true &&
      document.r6_gate?.production_seal_eligible === false,
    "research_corpus_r6_local_gate_invalid",
  );
  assert(
    document.country_payments_economics_gate?.status === "INCOMPLETE" &&
      document.country_payments_economics_gate
          ?.exact_33_of_33_demonstrated === false,
    "research_corpus_country_economics_must_remain_incomplete",
  );
  assert(
    document.conflict_snapshot?.conflicts?.some((row) =>
      row.conflict_id === "research-conflict:r9-missing-package" &&
      row.status === "OPEN_ARTIFACT_RECOVERY_REQUIRED"
    ),
    "research_corpus_r9_missing_package_conflict_required",
  );
  assert(
    document.expected_topic_coverage.length === 25,
    "research_corpus_expected_topic_count_invalid",
  );
  assert(
    new Set(document.expected_topic_coverage.map((row) => row.topic_id))
      .size === 25,
    "research_corpus_topic_duplicate",
  );
  return document;
}

export function buildResearchCorpusInventory(root = REPO_ROOT) {
  const originalsRelative = "research/external/2026-08-13/originals";
  const originalsRoot = path.join(root, originalsRelative);
  const manifestPath = "config/intelligence/research-source-manifest.v1.json";
  const knowledgePath = "config/intelligence/research-knowledge.v1.json";
  const conflictsPath = "config/intelligence/research-conflicts.v1.json";
  const manifest = readJson(root, manifestPath);
  const knowledge = readJson(root, knowledgePath);
  const conflicts = readJson(root, conflictsPath);
  const fileNames = fs.readdirSync(originalsRoot)
    .filter((name) =>
      name.endsWith(".md") &&
      fs.statSync(path.join(originalsRoot, name)).isFile()
    )
    .sort((left, right) => left.localeCompare(right, "en"));
  const manifestByFilename = new Map(
    manifest.sources.map((row) => [row.original_filename, row]),
  );
  const knowledgeByFilename = new Map(
    (knowledge.source_documents || []).map((row) => [row.filename, row]),
  );
  assert(
    manifest.sources.length === fileNames.length,
    "research_corpus_manifest_physical_count_drift",
  );

  const rawRows = fileNames.map((fileName) => {
    const relativePath = `${originalsRelative}/${fileName}`;
    const bytes = fs.readFileSync(path.join(root, relativePath));
    const digest = sha256(bytes);
    const manifestRow = manifestByFilename.get(fileName);
    assert(manifestRow, `research_corpus_manifest_binding_missing:${fileName}`);
    assert(
      manifestRow.stored_path === relativePath,
      `research_corpus_manifest_path_drift:${fileName}`,
    );
    assert(
      manifestRow.sha256 === digest,
      `research_corpus_manifest_sha_drift:${fileName}`,
    );
    assert(
      manifestRow.byte_count === bytes.length,
      `research_corpus_manifest_bytes_drift:${fileName}`,
    );
    const knowledgeRow = knowledgeByFilename.get(fileName);
    assert(
      knowledgeRow?.sha256 === digest,
      `research_corpus_knowledge_binding_drift:${fileName}`,
    );
    return {
      file_name: fileName,
      stored_path: relativePath,
      document_id: knowledgeRow.doc_id,
      title: manifestRow.title,
      sha256: digest,
      bytes: bytes.length,
      lf_count: countLf(bytes),
      manifest_line_count: manifestRow.line_count,
      duplicate_of_document_id: knowledgeRow.duplicate_of,
      topics: manifestRow.topics,
      source_url_count: Array.isArray(manifestRow.source_urls)
        ? manifestRow.source_urls.length
        : 0,
      opaque_citation_count: Number(manifestRow.opaque_citations || 0),
      capture_date: manifestRow.capture_date,
      truth_level: manifestRow.trust?.truth_level ||
        manifest.trust_policy.default_truth_level,
    };
  });

  const canonicalBySha = new Map();
  for (const row of rawRows) {
    if (!canonicalBySha.has(row.sha256)) {
      canonicalBySha.set(row.sha256, row.stored_path);
    }
  }
  const sources = rawRows.map((row) => ({
    ...row,
    duplicate_of_path: canonicalBySha.get(row.sha256) === row.stored_path
      ? null
      : canonicalBySha.get(row.sha256),
  }));
  const uniqueRows = sources.filter((row) => row.duplicate_of_path === null);
  const physicalBytes = sources.reduce((sum, row) => sum + row.bytes, 0);
  const uniqueBytes = uniqueRows.reduce((sum, row) => sum + row.bytes, 0);
  const totalLf = sources.reduce((sum, row) => sum + row.lf_count, 0);
  const uniqueCount = uniqueRows.length;
  const conflictRows = Array.isArray(conflicts.conflicts)
    ? conflicts.conflicts
    : [];
  const r9Conflict = conflictRows.find((row) =>
    row.conflict_id === "research-conflict:r9-missing-package"
  );
  assert(
    r9Conflict?.status === "OPEN_ARTIFACT_RECOVERY_REQUIRED",
    "research_corpus_r9_missing_package_conflict_required",
  );

  assert(
    manifest.totals.physical_originals === sources.length,
    "research_corpus_manifest_physical_total_drift",
  );
  assert(
    manifest.totals.unique_documents === uniqueCount,
    "research_corpus_manifest_unique_total_drift",
  );
  assert(
    manifest.totals.exact_duplicates === sources.length - uniqueCount,
    "research_corpus_manifest_duplicate_total_drift",
  );
  assert(
    manifest.totals.bytes_physical === physicalBytes,
    "research_corpus_manifest_physical_bytes_drift",
  );
  assert(
    manifest.totals.bytes_unique === uniqueBytes,
    "research_corpus_manifest_unique_bytes_drift",
  );
  assert(
    manifest.trust_policy?.default_truth_level ===
        RESEARCH_SAFETY_POLICY.truth_level &&
      manifest.trust_policy?.source_material_is_untrusted_input === true &&
      manifest.trust_policy?.instructions_inside_sources_are_executable ===
        false &&
      manifest.trust_policy?.facts_auto_promoted_to_operational_tables ===
        false &&
      manifest.trust_policy?.eligible_for_direct_ml_training === false,
    "research_corpus_manifest_safety_policy_drift",
  );
  assert(
    knowledge.safety_contract?.default_execution_eligible === false &&
      knowledge.safety_contract?.default_training_eligible === false &&
      knowledge.safety_contract?.default_model_input_eligible === false &&
      knowledge.safety_contract?.default_calibration_eligible === false &&
      knowledge.safety_contract?.default_auto_promote_eligible === false,
    "research_corpus_knowledge_default_safety_policy_drift",
  );
  assert(
    (knowledge.records || []).every((row) =>
      row.execution_eligible === false &&
      row.training_eligible === false &&
      row.model_input_eligible === false &&
      row.calibration_eligible === false &&
      row.auto_promote_eligible === false
    ),
    "research_corpus_knowledge_record_safety_policy_drift",
  );
  for (const [key, expected] of Object.entries(
    FOUNDER_CANONICAL_RESEARCH_CORPUS,
  )) {
    assert(
      {
        physical_files: sources.length,
        unique_sha256: uniqueCount,
        exact_duplicates: sources.length - uniqueCount,
      }[key] === expected,
      `research_corpus_founder_input_count_drift:${key}`,
    );
  }

  const inputEvidence = [
    manifestPath,
    knowledgePath,
    conflictsPath,
    ...sources.map((row) => row.stored_path),
  ]
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((relativePath) => pathEvidence(root, relativePath));
  const document = {
    schema_version: "cambra-research-corpus-inventory-v1",
    status: "FOUNDER_CORPUS_PRESENT_UNTRUSTED_INTEGRATED",
    truth_boundary:
      "Research is untrusted candidate evidence. Exact duplicates do not inflate coverage; no source is executable or training-eligible without later governed verification.",
    canonical_corpus: {
      authority: "FOUNDER_DECISION",
      scope: "EXACT_DECLARED_CORPUS",
      complete_as_declared: true,
      ...FOUNDER_CANONICAL_RESEARCH_CORPUS,
    },
    research_policy: RESEARCH_SAFETY_POLICY,
    external_source_reverification: "NOT_RUN",
    near_duplicate_detection: "NOT_RUN",
    deduplication_key: "sha256",
    line_count_algorithm: "count of LF bytes (POSIX wc -l semantics)",
    input_fingerprint_sha256: inputFingerprint(inputEvidence),
    physical: {
      physical_files: sources.length,
      unique_sha256: uniqueCount,
      exact_duplicates: sources.length - uniqueCount,
      bytes_physical: physicalBytes,
      bytes_unique: uniqueBytes,
      lf_count_physical: totalLf,
      chunks_manifested: manifest.totals.chunks,
      valid_source_urls_manifested: manifest.totals.valid_source_urls,
      opaque_citations_manifested: manifest.totals.opaque_citations,
    },
    r6_gate: {
      status: "REPO_INTEGRATED_RUNTIME_REVERIFICATION_PENDING",
      reason: "FOUNDER_CANONICAL_CORPUS_BOUND_AS_UNTRUSTED_INPUT",
      closure_scope: "REPOSITORY_INTAKE_ONLY",
      may_mark_pass: true,
      production_seal_eligible: false,
    },
    country_payments_economics_gate: {
      status: "INCOMPLETE",
      exact_33_of_33_demonstrated: false,
      missing_markets: "UNKNOWN_INPUT_ARTIFACT_MISSING",
      reason:
        "R9 references a package/dossiers that are not retained; country-universe conflicts are still open.",
    },
    manifest_verification: {
      path: manifestPath,
      matches_physical_hashes_and_bytes: true,
      declared_default_truth_level: manifest.trust_policy.default_truth_level,
      generation_contract: manifest.generation_contract,
    },
    normalized_knowledge_snapshot: {
      path: knowledgePath,
      candidate_records: (knowledge.records || []).length,
      domain_counts: Object.fromEntries(
        sortStrings((knowledge.records || []).map((row) => row.domain)).map((
          domain,
        ) => [
          domain,
          knowledge.records.filter((row) => row.domain === domain).length,
        ]),
      ),
      target_counts: Object.fromEntries(
        sortStrings(
          (knowledge.records || []).flatMap((row) => row.target_systems || []),
        ).map((target) => [
          target,
          knowledge.records.filter((row) =>
            (row.target_systems || []).includes(target)
          ).length,
        ]),
      ),
    },
    conflict_snapshot: {
      path: conflictsPath,
      conflict_count: conflictRows.length,
      conflicts: conflictRows.map((row) => ({
        conflict_id: row.conflict_id,
        status: row.status,
      })),
    },
    physical_sources: sources,
    expected_topic_coverage: EXPECTED_RESEARCH_TOPICS,
  };
  return validateResearchCorpusInventory(document);
}

export function serializeArtifact(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function artifactMatches(document, text) {
  return serializeArtifact(document) === text;
}

export function buildArtifacts(root = REPO_ROOT) {
  const materialRegistry = buildMaterialBoundaryRegistry(root);
  return {
    [MATERIAL_BOUNDARY_OUTPUT]: materialRegistry,
    [EFFECT_AUTHORITY_OUTPUT]: buildEffectAuthorityRegistry(
      root,
      materialRegistry,
    ),
    [TENANT_AUTHORIZATION_OUTPUT]: buildTenantAuthorizationInventory(
      root,
      materialRegistry,
    ),
    [RESEARCH_CORPUS_OUTPUT]: buildResearchCorpusInventory(root),
  };
}

export function writeArtifacts(root = REPO_ROOT) {
  const artifacts = buildArtifacts(root);
  for (const [relativePath, document] of Object.entries(artifacts)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, serializeArtifact(document));
  }
  return artifacts;
}

export function checkArtifacts(root = REPO_ROOT) {
  const artifacts = buildArtifacts(root);
  const drift = [];
  for (const [relativePath, document] of Object.entries(artifacts)) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      drift.push(`${relativePath}:missing`);
      continue;
    }
    if (!artifactMatches(document, fs.readFileSync(absolutePath, "utf8"))) {
      drift.push(`${relativePath}:drift`);
    }
  }
  if (drift.length) {
    throw new Error(`remediation_r0_artifact_drift:${drift.join(",")}`);
  }
  return artifacts;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (isMain) {
  try {
    if (process.argv.includes("--check")) {
      const artifacts = checkArtifacts(REPO_ROOT);
      console.log(
        `remediation-r0:check PASS — ${
          artifacts[MATERIAL_BOUNDARY_OUTPUT].summary.boundary_count
        } boundaries; ${
          artifacts[TENANT_AUTHORIZATION_OUTPUT].summary.route_count
        } tenant authorization rows; ${
          artifacts[RESEARCH_CORPUS_OUTPUT].physical.physical_files
        }/${artifacts[RESEARCH_CORPUS_OUTPUT].physical.unique_sha256}/${
          artifacts[RESEARCH_CORPUS_OUTPUT].physical.exact_duplicates
        } research physical/unique/duplicates`,
      );
    } else {
      const artifacts = writeArtifacts(REPO_ROOT);
      console.log(
        `remediation-r0:generate PASS — ${Object.keys(artifacts).join(", ")}`,
      );
    }
  } catch (error) {
    console.error(`remediation-r0 FAIL — ${error?.message || error}`);
    process.exitCode = 1;
  }
}
