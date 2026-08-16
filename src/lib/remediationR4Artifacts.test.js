import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  OUTPUT_PATH,
  REPO_ROOT,
  checkArtifact,
  generateArtifact,
  validateArtifact,
} from '../../scripts/generate-remediation-r4.mjs';

describe('R4 material transition saga evidence', () => {
  it('binds the exact approval creator/action/executor inventory', () => {
    const artifact = generateArtifact(REPO_ROOT);
    expect(artifact.catalog_version).toBe('remediation-r4.2');
    expect(artifact.approval_inventory.creator_file_count).toBe(16);
    expect(artifact.approval_inventory.action_type_count).toBe(20);
    expect(artifact.approval_inventory.external_executor_action_count).toBe(7);
    expect(new Set(artifact.approval_inventory.creator_files.map((row) => row.source_path)).size).toBe(16);
    expect(artifact.approval_inventory.action_types).toContain('migration_go_live');
    expect(artifact.approval_inventory.external_executor_action_types).toContain('send_outreach_email');
    expect(artifact.approval_inventory.external_executor_action_types).toContain('send_follow_up_email');
    expect(artifact.evidence.map((row) => row.path)).toEqual(expect.arrayContaining([
      'base44/entities/FounderCommandAudit.jsonc',
      'base44/shared/recoverReportAuthority.ts',
      'base44/functions/onInvoiceStatusEvent/entry.ts',
      'src/components/admin/approvals/ApprovalCard.jsx',
      'src/lib/recoverBillingReconcilerSelection.test.js',
      'src/lib/financialEntityServiceRoleRls.test.js',
    ]));
  });

  it('keeps all three OTR binary closures NOT_MET and OTR-011 PARTIAL', () => {
    const artifact = generateArtifact(REPO_ROOT);
    expect(artifact.summary.binary_closed_count).toBe(0);
    expect(artifact.summary.runtime_verified_count).toBe(0);
    expect(artifact.summary.otr_status['ROOT-OTR-009'].binary_closure_status).toBe('NOT_MET');
    expect(artifact.summary.otr_status['ROOT-OTR-010'].binary_closure_status).toBe('NOT_MET');
    expect(artifact.summary.otr_status['ROOT-OTR-011']).toEqual({
      implementation_status: 'PARTIAL',
      binary_closure_status: 'NOT_MET',
    });
  });

  it('records exact unresolved Recover and Payments saga gaps', () => {
    const artifact = generateArtifact(REPO_ROOT);
    const recover = artifact.sagas.find((row) => row.saga_id === 'recover_acceptance_and_contract_delivery');
    const payments = artifact.sagas.find((row) => row.saga_id === 'payments_migration_go_live');
    expect(recover.local_status).toBe('PARTIAL');
    expect(recover.gaps).toContain('CONTRACT_PDF_EMAIL_LEASE_AND_RECEIPT_CHAIN_INCOMPLETE');
    expect(payments.local_status).toBe('PARTIAL');
    expect(payments.gaps).toContain('PAYMENTS_PLAN_MULTIROW_MATERIALIZATION_SAGA_INCOMPLETE');
    expect(payments.gaps).toContain('PAYMENTS_GO_LIVE_APPROVAL_PRODUCER_AND_ADVANCED_E_SIGNATURE_MISSING');
    const issuance = artifact.sagas.find((row) => row.saga_id === 'recover_billing_issuance');
    const collection = artifact.sagas.find((row) => row.saga_id === 'recover_billing_collection_reconciliation');
    expect(issuance.required_markers).toContain('requireCanonicalRecoverReport');
    expect(issuance.required_markers).toContain('response_binding');
    expect(collection.required_markers).toContain('selectLeastRecentlyReconciledInvoices');
    expect(collection.required_markers).toContain('route_quarantined');
  });

  it('fails validation if evidence claims runtime or binary closure', () => {
    const artifact = generateArtifact(REPO_ROOT);
    const tampered = structuredClone(artifact);
    tampered.summary.binary_closed_count = 1;
    expect(() => validateArtifact(tampered)).toThrow('false_runtime_or_closure');
  });

  it('detects generated artifact drift', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cambra-r4-evidence-'));
    try {
      fs.cpSync(REPO_ROOT, fixture, {
        recursive: true,
        filter: (source) => !['node_modules', '.deploy', '.git', 'dist', '.release-evidence']
          .some((segment) => source.includes(`${path.sep}${segment}${path.sep}`)),
      });
      const target = path.join(fixture, OUTPUT_PATH);
      const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
      parsed.summary.binary_closed_count = 1;
      fs.writeFileSync(target, `${JSON.stringify(parsed, null, 2)}\n`);
      expect(() => checkArtifact(fixture)).toThrow('generated_drift');
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  }, 15_000);
});
