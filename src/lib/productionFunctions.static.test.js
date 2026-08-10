// productionFunctions.static.test.js — CONSOLIDATE-1 T1 (2026-07-24).
//
// Tripwire del manifiesto de superficie (src/docs/PRODUCTION_FUNCTIONS.md):
// cada función backend es un endpoint HTTP de producción. Este test falla si
//   (a) aparece una función NUEVA no censada → hay superficie sin clasificar
//       (clase, auth, entidades). Añádela al manifiesto Y a MANIFEST.
//   (b) desaparece una función listada → el manifiesto quedó desactualizado
//       (esperado en el barrido PURGE-2 del 15-ago: quitar de ambos sitios).
//
// NO valida la clasificación en sí — solo que el censo esté completo. Mismo
// patrón fs-estático que tenantGuard.static.test.js.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");
const FUNCTIONS_DIR = path.join(REPO_ROOT, "base44", "functions");

// Censo actualizado para ECL P4 — fuente: src/docs/PRODUCTION_FUNCTIONS.md.
const MANIFEST = [
  "_tenantGuard", "adminAgentOperations", "adminOverrides", "adminSummaries", "adminUpdateApplicationStatus",
  // P14 Aggregate + Final Autonomous Revenue Engine technical seal (2026-08-10).
  "aggregateAgreementWorker", "aggregateDemandWorker", "aggregateEligibilityWorker", "aggregateProcurementWorker", "collectiveNegotiationAgent", "getAggregateCommandCenter",
  "getFinancialControlTower", "getFounderControlCenter", "operatingHealthWorker", "realWorldValidationWorker", "revenueGoldenPathSelfTest", "revenueLifecycleWorker",
  "salesPipelineWorker", "collectionOperationsWorker", "agentPerformanceWorker", "executiveDigestWorker", "customerSuccessWorker", "unitEconomicsWorker", "developerSignalWorker",
  // P15 Provider Revenue Share & Dual-Sided Economics (2026-08-10).
  "providerEconomicsAssessmentWorker", "providerMonetizationAgent", "providerRevenueAttributionWorker", "providerRevenueLifecycleWorker", "providerRevenueReconciliationWorker", "providerRevenueRecoveryAgent", "providerRevenueTierWorker", "providerRevenueBillingWorker", "recordProviderRevenueInvoiceIssued", "recordProviderRevenuePayment", "approveProviderMonetizationLegalReview", "getProviderEconomicsCommandCenter", "providerEconomicsIntelligenceWorker",
  // P16 Founder OS & Autonomous Company Command Center (2026-08-10).
  "getFounderOSCommandCenter", "founderOSQuery", "founderOSCommand", "founderOSSimulation", "founderChiefOfStaff",
  // P17 Autonomous Maintenance & Self-Healing Engine (2026-08-10).
  "maintenanceEngine", "getMaintenanceCenter", "dependencySecurityWorker", "alwaysOnLeadDiscoveryWorker", "missingInformationWorker",
  // P18 Operating Bible, Founder Handbook & Living Documentation (2026-08-10).
  "documentationQuery", "documentationMaintenanceWorker", "emergencyControlAdmin",
  // FINAL AUTONOMOUS PLATFORM SEAL (2026-08-09) — policy-gated commercial loops.
  "acquisitionAttributionWorker", "acquisitionLearningWorker", "autonomousCommercialWorker", "autonomousOperationsSupervisor", "autonomousPartnerWorker", "commercialFollowUpWorker", "commercialPolicyAdmin", "commercialReplyAgent", "commercialSendMessage",
  "getRoutingIntelligenceCommandCenter", "recordRoutingObservation", "routingHistoricalBackfill", "routingPerformanceWorker", "routingReadinessWorker", "routingSimulator", "shadowRoutingEngine",
  "negotiationMemoryWorker", "onboardingConciergeWorker", "outlookInboundRouter", "outlookMeetingCoordinator", "outboundControlAdmin", "outboundDeliverabilityManager", "outboundVolumeWorker", "outreachExperimentLearningWorker", "postMeetingWorker", "providerContactResolver", "createMerchantInformationRequest", "providerNegotiationAgent", "recoverAutopilotWorker", "resendInboundWebhook", "resolveCommercialApproval", "reviewProviderContract", "startProviderNegotiation",
  // REFERRAL-1 / REFERRAL-2 (2026-08-03) — referral programme surface.
  "applyReferralActivation", "getMyReferralStatus",
  // RECOVER-1 (2026-08-03) — Recover Margin mandate acceptance surface.
  "getRecoverAcceptanceContext", "startRecoverAcceptance", "acceptRecoverMandate",
  // RECOVER-2 (2026-08-03) — Stripe billing: diagnostics + payment-method setup.
  "stripeBillingKeyCheck", "startPaymentMethodSetup", "refreshPaymentMethodStatus",
  "stripeBillingWebhook",
  // RECOVER-3 (2026-08-03) — contractual PDF generation, storage and delivery.
  "generateRecoverContractPdf", "sendRecoverContractEmail", "getRecoverContractStatus",
  "downloadRecoverContract", "retryPendingRecoverContracts",
  // RECOVER-4 (2026-08-04) — monthly measurement, FR/ES tax, Stripe invoicing.
  "recordConditionsActivation", "checkVatVies", "approveRecoverReportForInvoicing",
  "createEligibleRecoverInvoices",
  // v61 Checkpoint D (2026-08-06) — merchant billing records, server-side scope.
  "getMyBillingRecords", "getMyInformationRequests", "respondMerchantInformationRequest",
  // P9 (2026-08-09) — Recover fulfilment & payments migration operations.
  "getMyPaymentsMigration", "startPaymentsMigration", "updatePaymentsMigrationTask",
  "answerAgentQuestion", "apiAuth", "apiOpenApiSpec", "apiV1", "approveAgentRun",
  "authzScope", "benchmarkLearningEngine", "billApiUsage", "blogAgent",
  "brainOrchestrator", "buildInfrastructureGraph", "chatChiefOrchestrator",
  "cancelCambraService", "claimAnonPaymentsResult", "codeReviewAgent", "competitorMonitorAgent",
  "complianceAgent", "computeStripeVerifiedGap", "computeVerticalStatus",
  "contractIPAgent", "copilotChat", "createApiKey", "createDocument",
  "createPaymentLink", "createSelfTestBrand", "crmAgent", "dataSyncAgent", "developerMigrationEngine",
  "discoverCompanyInfrastructure", "discoveryTechStackAgent", "dispatchWebhook",
  "driveConnectionCheck",
  // v62.5 ECL P3 — único límite I/O del motor de ciclo de vida de evidencia.
  "eclProcessEvidence", "eclLifecycleScheduler", "eclReviewWorkflow", "eclProductionHealth", "eclIncidentWorkflow", "engineeringReportAgent", "fixValidatorAgent",
  "followUpAgent", "founderCopilotAgent", "gdprAgent", "generateInvoiceFromReport",
  "generateInvoicePdf", "generateMonthlySavingsReport", "generateRecommendations",
  "getActivationAdminDetail", "getAdminOperationsCockpit", "getAdminRecommendationQueue", "getBenchmarkForReport",
  "getBrandSavings", "getCommandCenterPulse", "getInfrastructureGraph",
  "getIntegrationStatus", "getMyPaymentsHistory", "getMyRecoveryCommitments", "getMyReferralLink",
  "getOnboardingStatus",
  "getPaymentsAnalysisVerified", "getPaymentsGapTeaser", "getUploadCapability",
  "getWaitlistAggregate", "getWaitlistLeads", "gmailConnectionCheck",
  "guardDealActivationStatus", "inferVendorsFromBankData", "initiateConnection",
  "integrationRegistry", "integritySummary", "intelligenceAccess", "intelligenceAdmin", "intelligenceBackfill", "intelligenceMaintenanceWorker", "knowledgeIntegrityWorker", "moatCuratorWorker", "outcomeLearningWorker", "getIntelligenceCommandCenter", "investorUpdateAgent",
  "inviteAdminUser", "joinCollective", "leadDiscoveryAgent", "leadEnrichmentAgent",
  "leadOrchestrator", "leadScoringAgent", "legalReviewAgent", "linkDocument",
  "linkedinAgent", "listDocuments", "marketingOrchestrator", "mcpServer",
  "meetingAgent", "newsletterAgent", "oauthAuthorize", "oauthConnector",
  "oauthRevoke", "oauthToken", "onBrandCreated", "onInvoiceStatusEvent",
  "onSavingsEvidenceEvent", "outreachAgent", "outreachOrchestrator",
  "phase2CleanupLegacyFields", "processUploadedFile", "processWebhookDeadLetters",
  "promoteMeToAdmin", "providerMonitorAgent", "providerResearchAgent",
  "purgeInactiveLeads", "purgePaymentsAnalysisSessions", "qaAgent", "qaMonitorAgent",
  "recommendationEngineAgent", "reconcileInvoice", "reconcileRecoverBilling", "recordPayment",
  "recoverBillingDigest",
  "regenerateMigrationTasks", "regenerateRecommendationsForBrand",
  "researchOrchestrator", "revokeApiKey", "revokeMandate", "runApiSelfTests",
  "runContinuousDiscovery", "runFlowSelfTests", "scheduledBenchmarkRecompute",
  "securityAgent", "securityAuditLog", "seedBenchmarkCohorts",
  "seedComplianceRules", "seedDemoData", "seedIntegrationCatalog",
  "seedPaymentsRateTable", "seedStripeTestData", "sendMonthlySavingsSummary",
  "sendTestWebhook", "seoAgent", "sheetsConnectionCheck", "sitemap",
  "slackConnectionCheck", "spendIntelligenceAgent", "startSubscription",
  "stripeConnectionDisconnect", "stripeDataSync", "stripeDisconnect",
  "stripeHealthCheck", "stripeOAuthConnect", "stripeTestGroundTruth",
  "submitCallRequest", "submitContactMessage", "submitPaymentsAnalysis",
  "submitWaitlistSignup", "systemHealthAgent", "unlinkDocument",
  "updateDealActivationStatus", "updateDocumentMeta", "updateMigrationTaskStatus",
  "verifyRegistrySync", "xTwitterAgent",
];

function listFunctionDirs() {
  return fs
    .readdirSync(FUNCTIONS_DIR)
    .filter((d) => fs.existsSync(path.join(FUNCTIONS_DIR, d, "entry.ts")))
    .sort();
}

describe("production functions manifest tripwire (CONSOLIDATE-1 T1)", () => {
  const actual = listFunctionDirs();

  it("manifest has no duplicates (sanity)", () => {
    expect(new Set(MANIFEST).size).toBe(MANIFEST.length);
  });

  it("every deployed function is censused in PRODUCTION_FUNCTIONS.md", () => {
    const unlisted = actual.filter((n) => !MANIFEST.includes(n));
    expect(
      unlisted,
      `Funciones backend NUEVAS sin censar. Cada función es un endpoint HTTP ` +
        `de producción: clasifícala (clase/auth/entidades) en ` +
        `src/docs/PRODUCTION_FUNCTIONS.md y añádela a MANIFEST en este test:\n  ` +
        unlisted.join("\n  ")
    ).toEqual([]);
  });

  it("every censused function still exists (manifest not stale)", () => {
    const missing = MANIFEST.filter((n) => !actual.includes(n));
    expect(
      missing,
      `Funciones listadas en el manifiesto que ya no existen (¿PURGE-2?). ` +
        `Quítalas de PRODUCTION_FUNCTIONS.md y de MANIFEST:\n  ` +
        missing.join("\n  ")
    ).toEqual([]);
  });
});