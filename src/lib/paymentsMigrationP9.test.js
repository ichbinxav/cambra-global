import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('P9 Recover Fulfilment & Payments Migration invariants', () => {
  const start = read('base44/functions/startPaymentsMigration/entry.ts');
  const update = read('base44/functions/updatePaymentsMigrationTask/entry.ts');
  const projection = read('base44/functions/getMyPaymentsMigration/entry.ts');
  const accept = read('base44/functions/acceptRecoverMandate/entry.ts');

  it('starts only after an active mandate and owns the migration', () => {
    expect(start).toContain("status: 'active'");
    expect(start).toContain("status: 'migrating'");
    expect(start).toContain("requires_brand_input: false");
    expect(accept).toContain("fireAndForget(base44, 'startPaymentsMigration'");
  });

  it('has the complete operational path and SLA metadata', () => {
    for (const step of ['provider_coordination','provider_ready','technical_configuration','migration_testing','cutover_ready','go_live','verify_savings']) {
      expect(start).toContain(`'${step}'`);
    }
    expect(start).toContain('sla_days');
    expect(start).toContain('due_date');
  });

  it('prevents unsafe completion and preserves retry/blocker evidence', () => {
    expect(update).toContain('earlier_tasks_incomplete');
    expect(update).toContain('go_live_requires_migrating');
    expect(update).toContain('conditions_activation_evidence_required');
    expect(update).toContain('retry_count');
    expect(update).toContain('merchant_required');
  });

  it('keeps internal migration mechanics out of the merchant projection', () => {
    expect(projection).toContain('merchant_blockers');
    expect(projection).toContain("t.requires_brand_input === true");
    expect(projection).not.toContain('last_note:');
    expect(projection).not.toContain('last_actor:');
  });
});
