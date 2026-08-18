#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
export const OUTPUT_PATH = 'config/remediation/material-transition-saga-inventory.v1.json';

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const fail = (message) => { throw new Error(`remediation_r4_invalid:${message}`); };

const LOGICAL_CREATOR_FUNCTIONS = new Set(['founderMeetingAdmin']);

const APPROVAL_CREATORS = [
  ['aggregateAgreementWorker', ['aggregate_contract_execution']],
  ['blogAgent', ['publish_blog']],
  ['collectiveNegotiationAgent', ['aggregate_contract']],
  ['commercialReplyAgent', ['aggregate_procurement_review', 'commercial_reply_exception', 'provider_negotiation_review', 'schedule_founder_meeting']],
  ['developerMigrationEngine', ['developer_apply_patch', 'developer_rollback', 'migration_go_live']],
  ['followUpAgent', ['send_follow_up_email']],
  ['founderMeetingAdmin', ['post_meeting_commitment_review']],
  ['investorUpdateAgent', ['send_investor_update']],
  ['linkedinAgent', ['publish_linkedin_post']],
  ['meetingAgent', ['schedule_founder_meeting']],
  ['newsletterAgent', ['send_newsletter']],
  ['outreachAgent', ['send_outreach_email']],
  ['providerMonetizationAgent', ['aggregate_contract']],
  ['providerNegotiationAgent', ['final_provider_deal']],
  ['reviewProviderContract', ['contract_exception', 'contract_mismatch']],
  ['xTwitterAgent', ['publish_x_post']],
].map(([function_name, action_types]) => ({
  function_name,
  // AUDIT 2026-08-18 — logical-route implementations moved to base44/shared/logical/
  // so hosts can import them without escaping their bundle; creators that moved are
  // inventoried at their canonical shared path.
  source_path: LOGICAL_CREATOR_FUNCTIONS.has(function_name)
    ? `base44/shared/logical/${function_name}.ts`
    : `base44/functions/${function_name}/entry.ts`,
  action_types,
}));

const EXPECTED_CREATOR_ACTION_TYPES = [
  'aggregate_contract',
  'aggregate_contract_execution',
  'aggregate_procurement_review',
  'commercial_reply_exception',
  'contract_exception',
  'contract_mismatch',
  'developer_apply_patch',
  'developer_rollback',
  'final_provider_deal',
  'migration_go_live',
  'post_meeting_commitment_review',
  'provider_negotiation_review',
  'publish_blog',
  'publish_linkedin_post',
  'publish_x_post',
  'schedule_founder_meeting',
  'send_follow_up_email',
  'send_investor_update',
  'send_newsletter',
  'send_outreach_email',
].sort();

const EXPECTED_REGISTRY_ACTION_TYPES = [...EXPECTED_CREATOR_ACTION_TYPES].sort();

const EXTERNAL_EXECUTOR_ACTION_TYPES = [
  'publish_blog',
  'publish_linkedin_post',
  'publish_x_post',
  'schedule_founder_meeting',
  'send_follow_up_email',
  'send_newsletter',
  'send_outreach_email',
].sort();

const EXTERNAL_EXECUTOR_ROUTES = {
  publish_blog: 'base44/functions/blogAgent/entry.ts',
  publish_linkedin_post: 'base44/functions/linkedinAgent/entry.ts',
  publish_x_post: 'base44/functions/xTwitterAgent/entry.ts',
  schedule_founder_meeting: 'base44/functions/meetingAgent/entry.ts',
  send_follow_up_email: 'base44/functions/followUpAgent/entry.ts',
  send_newsletter: 'base44/functions/newsletterAgent/entry.ts',
  send_outreach_email: 'base44/functions/outreachAgent/entry.ts',
};

const SAGA_ROWS = [
  {
    saga_id: 'approval_confirmation_binding',
    otr_ids: ['ROOT-OTR-009'],
    domain: 'approval',
    authority_and_claim: 'Approval binding hash plus one-use nonce claimed by coherent CAS and exact readback',
    operation_or_effect_key: 'confirmation_nonce + approval_binding_hash + resolution_command_key',
    immutable_receipt: 'Approval binding snapshot/hash and consumed nonce; FounderCommandAudit binds the single confirmed command identity',
    compensation_or_reconciliation: 'No effect before exact revalidation; stale, changed, expired, replayed or ambiguous authority is rejected',
    local_status: 'REPO_REMEDIATED_RUNTIME_PENDING',
    local_test_status: 'PASSED_LOCAL',
    gaps: ['DEPLOYED_EXHAUSTIVE_TAMPER_AND_DUAL_CONFIRMATION_RECEIPTS_MISSING'],
    source_paths: ['base44/entities/Approval.jsonc', 'base44/entities/FounderCommandAudit.jsonc', 'base44/shared/approvalAuthority.ts', 'base44/functions/founderOSCommand/entry.ts', 'base44/functions/chatChiefOrchestrator/entry.ts', 'src/components/admin/approvals/ApprovalCard.jsx', 'src/pages/admin/AdminChat.jsx'],
    test_paths: ['src/lib/approvalAuthoritySaga.test.js', 'src/lib/founderApprovalRegistry.test.js'],
    required_markers: ['decision_status', 'confirmation_nonce', 'confirmation_preview_generation', 'resolution_binding_hash', 'resolution_command_key', 'resolution_actor_email', 'market_scope_version', 'emergency_control_revision'],
  },
  {
    saga_id: 'approval_decision_and_external_execution',
    otr_ids: ['ROOT-OTR-010'],
    domain: 'approval',
    authority_and_claim: 'Approval holds the decision; AgentTask holds the external execution lease/fence and receipt',
    operation_or_effect_key: 'approval id + action type + artifact/content hash',
    immutable_receipt: 'AgentTask execution receipt/reference and separate Approval decision projection',
    compensation_or_reconciliation: 'Post-effect ambiguity is REVIEW_REQUIRED; APPROVED never implies EXECUTED',
    local_status: 'REPO_REMEDIATED_RUNTIME_PENDING',
    local_test_status: 'PASSED_LOCAL',
    gaps: ['DEPLOYED_EXECUTOR_FAILURE_AND_RECEIPT_MATRIX_MISSING'],
    source_paths: ['base44/entities/Approval.jsonc', 'base44/entities/AgentTask.jsonc', 'base44/entities/FounderCommandAudit.jsonc', 'base44/shared/approvalResolutionSaga.ts', 'base44/shared/externalApprovalExecution.ts'],
    test_paths: ['src/lib/approvalAuthoritySaga.test.js', 'src/lib/externalApprovalExecution.test.js'],
    required_markers: ['decision_status', 'execution_status', 'execution_receipt_ref', 'REVIEW_REQUIRED'],
  },
  {
    saga_id: 'recover_acceptance_and_contract_delivery',
    otr_ids: ['ROOT-OTR-011'],
    domain: 'recover',
    authority_and_claim: 'DealActivation/Mandate CAS for acceptance; mutable Mandate delivery lease for PDF/email',
    operation_or_effect_key: 'mandate id + frozen acceptance snapshot hash + contract template/language',
    immutable_receipt: 'Accepted snapshot/evidence attestation is hash-bound; contract delivery does not yet have one common immutable step chain',
    compensation_or_reconciliation: 'Authorization can be compensated after mandate revocation; partial supersession and contract-upload crash windows remain review work',
    local_status: 'PARTIAL',
    local_test_status: 'PASSED_LOCAL',
    gaps: ['RECOVER_SUPERSESSION_PARTIAL_COMPENSATION_INCOMPLETE', 'CONTRACT_PDF_EMAIL_LEASE_AND_RECEIPT_CHAIN_INCOMPLETE', 'POST_ACCEPTANCE_FIRE_AND_FORGET_RECEIPT_MISSING'],
    source_paths: ['base44/shared/recoverAcceptance.ts', 'base44/shared/recoverEconomicMandate.ts', 'base44/functions/acceptRecoverMandate/entry.ts', 'base44/shared/recoverContractState.ts', 'base44/functions/generateRecoverContractPdf/entry.ts', 'base44/functions/sendRecoverContractEmail/entry.ts'],
    test_paths: ['src/lib/recoverFinancialHardening.test.js'],
    required_markers: ['acceptance_commit_token', 'authorization_mandate_id', 'acceptance_snapshot_hash', 'contract_pdf_status'],
  },
  {
    saga_id: 'recover_billing_issuance',
    otr_ids: ['ROOT-OTR-011'],
    domain: 'billing',
    authority_and_claim: 'Activation/month report singleton proof plus MonthlySavingsReport invoice claim CAS/lease and Stripe idempotency',
    operation_or_effect_key: 'activation/month report authority + recover report execution key + exact request descriptor fingerprint',
    immutable_receipt: 'Hash-chained PaymentEvent STARTED/OBSERVED/REVIEW receipt per response-bound Stripe request and invoice-issued event',
    compensation_or_reconciliation: 'Duplicate reports block; provider success resumes from OBSERVED receipt; Invoice/report projections are sandwiched and monotonic before terminal success',
    local_status: 'REPO_REMEDIATED_RUNTIME_PENDING',
    local_test_status: 'PASSED_LOCAL',
    gaps: ['DEPLOYED_STRIPE_ISSUANCE_CRASH_WINDOW_AND_RECEIPTS_MISSING'],
    source_paths: ['base44/shared/economicExecution.ts', 'base44/shared/recoverReportAuthority.ts', 'base44/functions/generateMonthlySavingsReport/entry.ts', 'base44/functions/approveRecoverReportForInvoicing/entry.ts', 'base44/functions/createEligibleRecoverInvoices/entry.ts', 'base44/entities/Invoice.jsonc', 'base44/entities/MonthlySavingsReport.jsonc', 'base44/entities/PaymentEvent.jsonc'],
    test_paths: ['src/lib/recoverBillingSaga.test.js', 'src/lib/recoverFinancialHardening.test.js', 'src/lib/financialEntityServiceRoleRls.test.js'],
    required_markers: ['RECOVER_BILLING_SAGA_VERSION', 'response_binding', 'assertBillingAccount', 'requireCanonicalRecoverReport', 'REVIEW_REQUIRED', 'invoice_issued'],
  },
  {
    saga_id: 'recover_billing_collection_reconciliation',
    otr_ids: ['ROOT-OTR-011'],
    domain: 'billing',
    authority_and_claim: 'Signed Stripe event id plus current remote invoice state, local PaymentEvent dedupe and fair bounded reconciler selection',
    operation_or_effect_key: 'Stripe event id + local invoice id',
    immutable_receipt: 'PaymentEvent processor_event_id and current-state reconciliation projection',
    compensation_or_reconciliation: 'Replay completes monotonic Invoice/report/activation projections even when the event receipt already exists; disputed/refunded/void cannot retain a paid report projection',
    local_status: 'REPO_REMEDIATED_RUNTIME_PENDING',
    local_test_status: 'PASSED_LOCAL',
    gaps: ['DEPLOYED_SIGNED_WEBHOOK_CRASH_WINDOW_AND_CURRENT_STATE_RECEIPT_MISSING'],
    source_paths: ['base44/functions/stripeBillingWebhook/entry.ts', 'base44/functions/reconcileRecoverBilling/entry.ts', 'base44/functions/onInvoiceStatusEvent/entry.ts', 'base44/shared/economicExecution.ts', 'base44/entities/Invoice.jsonc', 'base44/entities/MonthlySavingsReport.jsonc', 'base44/entities/PaymentEvent.jsonc'],
    test_paths: ['src/lib/recoverBillingSaga.test.js', 'src/lib/recoverFinancialHardening.test.js', 'src/lib/recoverBillingReconcilerSelection.test.js', 'src/lib/financialEntityServiceRoleRls.test.js'],
    required_markers: ['processor_event_id', 'reconciled_from_current_stripe_state', 'appendPaymentEventOnce', 'selectLeastRecentlyReconciledInvoices', 'recoverReportProjectionForInvoiceStatus', 'route_quarantined'],
  },
  {
    saga_id: 'payments_migration_go_live',
    otr_ids: ['ROOT-OTR-011'],
    domain: 'migration',
    authority_and_claim: 'MigrationTask.metadata_json CAS/fence plus exact Activation/Mandate/Approval authority binding',
    operation_or_effect_key: 'task + activation + mandate + authority snapshot + material payload hash',
    immutable_receipt: 'Hash-chained go-live receipt with Emergency/legal authority and exact activation readback',
    compensation_or_reconciliation: 'Post-effect ambiguity becomes RECONCILING; epoch drift attempts fenced live-to-paused compensation',
    local_status: 'PARTIAL',
    local_test_status: 'PASSED_LOCAL',
    gaps: ['PAYMENTS_PLAN_MULTIROW_MATERIALIZATION_SAGA_INCOMPLETE', 'NON_GO_LIVE_TASK_IMMUTABLE_RECEIPTS_INCOMPLETE', 'PAYMENTS_GO_LIVE_APPROVAL_PRODUCER_AND_ADVANCED_E_SIGNATURE_MISSING'],
    source_paths: ['base44/shared/paymentsMigrationSaga.ts', 'base44/functions/startPaymentsMigration/entry.ts', 'base44/functions/updatePaymentsMigrationTask/entry.ts', 'base44/shared/legalExecution.ts', 'src/components/admin/PaymentsMigrationOperations.jsx'],
    test_paths: ['src/lib/paymentsMigrationSaga.test.js', 'src/lib/paymentsMigrationP9.test.js'],
    required_markers: ['RECONCILING', 'receipts', 'authority_snapshot', 'emergency_control_revision'],
  },
  {
    saga_id: 'developer_migration_github',
    otr_ids: ['ROOT-OTR-011'],
    domain: 'migration',
    authority_and_claim: 'DeveloperMigrationRun lifecycle CAS/lease/fence with Approval/AgentTask/workspace hashes',
    operation_or_effect_key: 'lifecycle + content-addressed step + GitHub idempotency/binding',
    immutable_receipt: 'Each action has hash-chained lifecycle_steps; completed apply/cutover/rollback chains are archived in append-only prior_actions with an action hash/head',
    compensation_or_reconciliation: 'GitHub branch/PR/ref/SHA reconciliation; post-effect ambiguity is REVIEW_REQUIRED',
    local_status: 'REPO_REMEDIATED_RUNTIME_PENDING',
    local_test_status: 'PASSED_LOCAL',
    gaps: ['DEPLOYED_GITHUB_APPLY_CUTOVER_ROLLBACK_RECEIPTS_MISSING'],
    source_paths: ['base44/shared/developerMigrationLifecycle.ts', 'base44/functions/developerMigrationEngine/entry.ts'],
    test_paths: ['src/lib/developerMigrationLifecycle.test.js'],
    required_markers: ['lifecycle_steps', 'prior_actions', 'action_hash', 'receipt_hash', 'prior_receipt_hash', 'REVIEW_REQUIRED'],
  },
];

function readSource(root, relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) fail(`missing_source:${relative}`);
  return fs.readFileSync(file, 'utf8');
}

function exactSet(actual, expected, label) {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  if (JSON.stringify(a) !== JSON.stringify(e)) fail(`${label}:${JSON.stringify(a)}`);
}

function buildArtifact(root = REPO_ROOT) {
  const approvalCreatorFiles = [];
  for (const creator of APPROVAL_CREATORS) {
    const source = readSource(root, creator.source_path);
    if (!source.includes('Approval.create')) fail(`approval_creator_without_create:${creator.source_path}`);
    for (const action of creator.action_types) {
      if (!source.includes(action)) fail(`approval_creator_action_missing:${creator.source_path}:${action}`);
    }
    approvalCreatorFiles.push({
      ...creator,
      source_sha256: sha256File(path.join(root, creator.source_path)),
    });
  }
  const functionRoot = path.join(root, 'base44/functions');
  const logicalRoot = path.join(root, 'base44/shared/logical');
  const observedCreators = fs.readdirSync(functionRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `base44/functions/${entry.name}/entry.ts`)
    .concat(fs.readdirSync(logicalRoot)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => `base44/shared/logical/${name}`))
    .filter((relative) => relative !== 'base44/functions/founderOSCommand/entry.ts')
    .filter((relative) => fs.existsSync(path.join(root, relative)) && readSource(root, relative).includes('Approval.create'))
    .sort();
  exactSet(observedCreators, APPROVAL_CREATORS.map((row) => row.source_path), 'approval_creator_inventory_drift');
  exactSet(APPROVAL_CREATORS.flatMap((row) => row.action_types), EXPECTED_CREATOR_ACTION_TYPES, 'approval_action_inventory_drift');

  const founderSource = readSource(root, 'base44/functions/founderOSCommand/entry.ts');
  for (const action of EXPECTED_REGISTRY_ACTION_TYPES) {
    if (!founderSource.includes(`\"${action}\"`) && !founderSource.includes(`'${action}'`)) {
      fail(`approval_registry_action_missing:${action}`);
    }
  }
  for (const action of EXTERNAL_EXECUTOR_ACTION_TYPES) {
    const sourcePath = EXTERNAL_EXECUTOR_ROUTES[action];
    if (!sourcePath) fail(`external_executor_route_missing:${action}`);
    const source = readSource(root, sourcePath);
    const markers = action === 'schedule_founder_meeting'
      ? ['claimExternalApprovalExecution', 'external_execution_managed:true', 'completeExternalApprovalExecution']
      : ['claimExternalApprovalExecution', 'beginExternalApprovalEffects', 'completeExternalApprovalExecution'];
    for (const marker of markers) {
      if (!source.includes(marker)) fail(`external_executor_contract_missing:${sourcePath}:${marker}`);
    }
  }

  const evidencePaths = new Set(['base44/functions/founderOSCommand/entry.ts']);
  for (const row of SAGA_ROWS) {
    for (const relative of [...row.source_paths, ...row.test_paths]) {
      const source = readSource(root, relative);
      evidencePaths.add(relative);
      if (row.source_paths.includes(relative)) {
        for (const marker of row.required_markers) {
          const presentSomewhere = row.source_paths.some((candidate) => readSource(root, candidate).includes(marker));
          if (!presentSomewhere) fail(`saga_marker_missing:${row.saga_id}:${marker}`);
        }
      }
      if (!source.trim()) fail(`empty_evidence:${relative}`);
    }
    if (row.local_status === 'CLOSED' || row.local_status === 'RUNTIME_VERIFIED') fail(`false_closure:${row.saga_id}`);
  }

  const evidence = [...evidencePaths].sort().map((relative) => ({
    path: relative,
    sha256: sha256File(path.join(root, relative)),
  }));
  const localStatusCounts = Object.fromEntries(
    [...new Set(SAGA_ROWS.map((row) => row.local_status))].sort().map((status) => [status, SAGA_ROWS.filter((row) => row.local_status === status).length]),
  );
  return {
    schema_version: 'cambra-material-transition-saga-inventory-v1',
    catalog_version: 'remediation-r4.2',
    generated_at: '2026-08-14T00:00:00.000Z',
    authority_rule: 'This inventory describes existing domain authorities and never creates a second claim plane. Binary OTR closure remains NOT_MET without final-SHA deployed drills and receipts.',
    approval_inventory: {
      creator_file_count: approvalCreatorFiles.length,
      action_type_count: EXPECTED_REGISTRY_ACTION_TYPES.length,
      external_executor_action_count: EXTERNAL_EXECUTOR_ACTION_TYPES.length,
      creator_files: approvalCreatorFiles,
      action_types: EXPECTED_REGISTRY_ACTION_TYPES,
      observed_creator_action_types: EXPECTED_CREATOR_ACTION_TYPES,
      external_executor_action_types: EXTERNAL_EXECUTOR_ACTION_TYPES,
      registry_source: 'base44/functions/founderOSCommand/entry.ts',
    },
    summary: {
      saga_row_count: SAGA_ROWS.length,
      local_status_counts: localStatusCounts,
      binary_closed_count: 0,
      runtime_verified_count: 0,
      otr_status: {
        'ROOT-OTR-009': { implementation_status: 'REPO_REMEDIATED_RUNTIME_PENDING', binary_closure_status: 'NOT_MET' },
        'ROOT-OTR-010': { implementation_status: 'REPO_REMEDIATED_RUNTIME_PENDING', binary_closure_status: 'NOT_MET' },
        'ROOT-OTR-011': { implementation_status: 'PARTIAL', binary_closure_status: 'NOT_MET' },
      },
    },
    sagas: SAGA_ROWS,
    evidence,
  };
}

export function validateArtifact(artifact) {
  if (artifact.schema_version !== 'cambra-material-transition-saga-inventory-v1') fail('schema_version');
  if (artifact.catalog_version !== 'remediation-r4.2') fail('catalog_version');
  if (artifact.summary.saga_row_count !== 7 || artifact.sagas.length !== 7) fail('saga_count');
  if (artifact.approval_inventory.creator_file_count !== 16) fail('creator_count');
  if (artifact.approval_inventory.action_type_count !== 20) fail('action_count');
  if (artifact.approval_inventory.external_executor_action_count !== 7) fail('external_executor_count');
  for (const requiredPath of [
    'base44/entities/FounderCommandAudit.jsonc',
    'base44/shared/recoverReportAuthority.ts',
    'base44/functions/onInvoiceStatusEvent/entry.ts',
    'src/components/admin/approvals/ApprovalCard.jsx',
    'src/lib/recoverBillingReconcilerSelection.test.js',
    'src/lib/financialEntityServiceRoleRls.test.js',
  ]) {
    if (!artifact.evidence.some((row) => row.path === requiredPath)) fail(`required_evidence_missing:${requiredPath}`);
  }
  if (artifact.summary.binary_closed_count !== 0 || artifact.summary.runtime_verified_count !== 0) fail('false_runtime_or_closure');
  if (artifact.summary.otr_status['ROOT-OTR-011']?.implementation_status !== 'PARTIAL') fail('otr011_must_remain_partial');
  for (const id of ['ROOT-OTR-009', 'ROOT-OTR-010', 'ROOT-OTR-011']) {
    if (artifact.summary.otr_status[id]?.binary_closure_status !== 'NOT_MET') fail(`false_binary_closure:${id}`);
  }
  return artifact;
}

export function generateArtifact(root = REPO_ROOT) {
  return validateArtifact(buildArtifact(root));
}

export function writeArtifact(root = REPO_ROOT) {
  const artifact = generateArtifact(root);
  const target = path.join(root, OUTPUT_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, canonicalJson(artifact));
  return artifact;
}

export function checkArtifact(root = REPO_ROOT) {
  const expected = canonicalJson(generateArtifact(root));
  const target = path.join(root, OUTPUT_PATH);
  if (!fs.existsSync(target)) fail(`missing_output:${OUTPUT_PATH}`);
  const actual = fs.readFileSync(target, 'utf8');
  if (actual !== expected) fail(`generated_drift:${OUTPUT_PATH}`);
  return JSON.parse(actual);
}

if (path.resolve(process.argv[1] || '') === SCRIPT_PATH) {
  const check = process.argv.includes('--check');
  try {
    const artifact = check ? checkArtifact(REPO_ROOT) : writeArtifact(REPO_ROOT);
    console.log(`remediation-r4:${check ? 'check' : 'generate'} PASS — ${artifact.summary.saga_row_count} saga rows; ${artifact.approval_inventory.creator_file_count} approval creator files; ${artifact.approval_inventory.action_type_count} action types; 0 CLOSED; 0 runtime-verified; OTR-011 PARTIAL`);
  } catch (error) {
    console.error(`remediation-r4:${check ? 'check' : 'generate'} FAIL — ${error?.message || error}`);
    process.exitCode = 1;
  }
}