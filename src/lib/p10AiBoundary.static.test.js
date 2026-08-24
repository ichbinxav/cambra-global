import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const CHAT = read('base44/functions/chatChiefOrchestrator/entry.ts');
const ADMIN_AGENTS = read('base44/functions/adminAgentOperations/entry.ts');
const READ_STATE = read('base44/shared/commandReadState.ts');

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
    expect(CHAT).toContain("from '../../shared/commandReadState.ts'");
    expect(CHAT).toContain('handleCommandReadState');
    expect(READ_STATE).toContain('COMMAND_READ_SAFE_FIELDS');
    expect(READ_STATE).toContain('rows.map((row: any) => projectRow(entity, row))');
    const safeMap = READ_STATE.slice(
      READ_STATE.indexOf('COMMAND_READ_SAFE_FIELDS'),
      READ_STATE.indexOf('function projectRow'),
    );
    for (const forbidden of ['access_token','refresh_token','file_url','metadata_json','billing_address_line1','contact_email']) {
      expect(safeMap).not.toContain(forbidden);
    }
    expect(READ_STATE).not.toContain('return { ok: true, entity, count: rows.length, rows };');
  });
});
