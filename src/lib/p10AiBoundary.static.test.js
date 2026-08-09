import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const CHAT = read('base44/functions/chatChiefOrchestrator/entry.ts');
const ADMIN_AGENTS = read('base44/functions/adminAgentOperations/entry.ts');

const ECONOMIC_AUTHORITIES = [
  'approveRecoverReportForInvoicing', 'createEligibleRecoverInvoices',
  'updatePaymentsMigrationTask', 'recordConditionsActivation', 'adminOverrides',
  'updateDealActivationStatus', 'updateMigrationTaskStatus', 'regenerateMigrationTasks',
  'recordPayment', 'reconcileInvoice',
];

describe('P10 — AI/tool authority and data minimization', () => {
  it('does not expose canonical economic authority as a Chief Copilot tool', () => {
    for (const fn of ECONOMIC_AUTHORITIES) expect(CHAT).not.toContain(`function: "${fn}"`);
    expect(CHAT).toContain('tool whitelist');
    expect(CHAT).toContain('risk_level >= 2');
    expect(CHAT).toContain('effectiveInput.mode = "draft"');
  });

  it('keeps manual admin agent execution behind a fixed allowlist', () => {
    expect(ADMIN_AGENTS).toContain('const ALLOWED = new Set([');
    expect(ADMIN_AGENTS).toContain('ALLOWED.has(functionName)');
    for (const fn of ECONOMIC_AUTHORITIES) expect(ADMIN_AGENTS).not.toContain(`'${fn}'`);
  });

  it('projects read_state through an explicit allowlist instead of raw rows', () => {
    expect(CHAT).toContain('READ_SAFE_FIELDS');
    expect(CHAT).toContain('projectReadRow(entity, row)');
    const safeMap = CHAT.slice(CHAT.indexOf('READ_SAFE_FIELDS'), CHAT.indexOf('async function handleReadState'));
    for (const forbidden of ['access_token','refresh_token','file_url','metadata_json','billing_address_line1','contact_email']) {
      expect(safeMap).not.toContain(forbidden);
    }
    expect(CHAT).not.toContain('return { ok: true, entity, count: rows.length, rows };');
  });
});
