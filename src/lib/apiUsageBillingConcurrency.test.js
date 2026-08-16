import { describe, expect, it } from 'vitest';
import {
  billApiUsageOrganization,
  listApiUsageOrganizationIds,
} from '../../base44/shared/apiUsageBilling.ts';

function service(initialRows, organization = {}) {
  let usage = structuredClone(initialRows);
  let invoices = [];
  let invoiceCreates = 0;
  const svc = { entities: {
    ApiUsageRecord: {
      filter: async (filter, _sort, limit = 100) => usage.filter((row) =>
        Object.entries(filter).every(([key, value]) => row[key] === value)
      ).slice(0, limit).map((row) => structuredClone(row)),
      get: async (id) => structuredClone(usage.find((row) => row.id === id) || null),
      updateMany: async (filter, update) => {
        const matches = usage.filter((row) => Object.entries(filter).every(([key, value]) => {
          if (value === null) return row[key] == null;
          return row[key] === value;
        }));
        for (const row of matches) Object.assign(row, structuredClone(update.$set));
        return { updated: matches.length };
      },
    },
    Organization: {
      get: async (id) => ({
        id,
        name: 'ACME',
        monthly_api_quota: 10,
        overage_price_per_1k: 1_000,
        ...organization,
      }),
    },
    Invoice: {
      filter: async (filter, _sort, limit = 100) => invoices.filter((invoice) => {
        return Object.entries(filter).every(([key, value]) => {
          if (key === 'billing_snapshot_json.organization_id') {
            return invoice.billing_snapshot_json?.organization_id === value;
          }
          if (key === 'billing_snapshot_json.period_month') {
            return invoice.billing_snapshot_json?.period_month === value;
          }
          return invoice[key] === value;
        });
      }).slice(0, limit).map((row) => structuredClone(row)),
      create: async (record) => {
        invoiceCreates += 1;
        const invoice = { id: `inv${invoiceCreates}`, created_date: new Date().toISOString(), ...structuredClone(record) };
        invoices.push(invoice);
        return structuredClone(invoice);
      },
      update: async (id, patch) => {
        const invoice = invoices.find((row) => row.id === id);
        if (!invoice) throw new Error('not_found');
        Object.assign(invoice, structuredClone(patch));
        return structuredClone(invoice);
      },
    },
  } };
  return { svc, rows: () => structuredClone(usage), invoices: () => structuredClone(invoices), invoiceCreates: () => invoiceCreates };
}

const rows = [
  { id: 'u1', organization_id: 'o1', period_month: '2026-07', request_count: 8, billing_claim_revision: 0, billed: false, created_date: '2026-07-01' },
  { id: 'u2', organization_id: 'o1', period_month: '2026-07', request_count: 7, billing_claim_revision: 0, billed: false, created_date: '2026-07-02' },
];

describe('API usage aggregate billing authority', () => {
  it('aggregates duplicate shards, reads live Organization economics and closes every shard against one invoice', async () => {
    const state = service(rows);
    const result = await billApiUsageOrganization(state.svc, {
      organization_id: 'o1', period_month: '2026-07', run_id: 'run-a', now: new Date('2026-08-01T02:00:00Z'),
    });
    expect(result).toMatchObject({ status: 'invoiced', total_requests: 15, overage_count: 5, amount_eur: 5 });
    expect(state.invoiceCreates()).toBe(1);
    expect(state.invoices()[0]).toMatchObject({
      execution_key: 'api-overage-invoice:o1:2026-07',
      organization_id: 'o1',
      total_amount: 5,
      billing_snapshot_json: { total_requests: 15, included_quota: 10, overage_count: 5 },
    });
    expect(state.rows().every((row) => row.billed && row.invoice_id === 'inv1')).toBe(true);
  });

  it('allows only one concurrent organization-period invoice', async () => {
    const state = service(rows);
    const [first, second] = await Promise.all([
      billApiUsageOrganization(state.svc, { organization_id: 'o1', period_month: '2026-07', run_id: 'run-a', now: new Date('2026-08-01T02:00:00Z') }),
      billApiUsageOrganization(state.svc, { organization_id: 'o1', period_month: '2026-07', run_id: 'run-b', now: new Date('2026-08-01T02:00:00Z') }),
    ]);
    expect([first.status, second.status]).toContain('invoiced');
    expect(state.invoiceCreates()).toBe(1);
    expect(state.invoices()).toHaveLength(1);
  });

  it('closes an included-quota period without creating an invoice', async () => {
    const state = service([{ ...rows[0], request_count: 3 }]);
    const result = await billApiUsageOrganization(state.svc, {
      organization_id: 'o1', period_month: '2026-07', run_id: 'run-a', now: new Date('2026-08-01T02:00:00Z'),
    });
    expect(result.status).toBe('closed_no_charge');
    expect(state.invoiceCreates()).toBe(0);
    expect(state.rows()[0].billed).toBe(true);
  });

  it('fails closed on a truncated billing read and never creates an invoice', async () => {
    const state = service(Array.from({ length: 100 }, (_, index) => ({
      ...rows[0], id: `u${index}`, request_count: 1, created_date: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
    })));
    await expect(billApiUsageOrganization(state.svc, {
      organization_id: 'o1', period_month: '2026-07', run_id: 'run-a', now: new Date('2026-08-01T02:00:00Z'),
    })).rejects.toThrow('api_usage_billing_group_read_truncated');
    expect(state.invoiceCreates()).toBe(0);
  });

  it('never steals a stale economic claim without a unique invoice constraint', async () => {
    const state = service([{ ...rows[0], billing_run_id: 'old-run', billing_claimed_at: '2026-07-31T00:00:00Z' }]);
    await expect(billApiUsageOrganization(state.svc, {
      organization_id: 'o1', period_month: '2026-07', run_id: 'new-run', now: new Date('2026-08-01T02:00:00Z'),
    })).rejects.toThrow('api_usage_billing_stale_claim_review_required');
    expect(state.invoiceCreates()).toBe(0);
  });

  it('treats a lost invoice-create response as committed only after deterministic readback', async () => {
    const state = service(rows);
    const original = state.svc.entities.Invoice.create;
    state.svc.entities.Invoice.create = async (record) => {
      await original(record);
      throw new Error('response_lost_after_commit');
    };
    const result = await billApiUsageOrganization(state.svc, {
      organization_id: 'o1', period_month: '2026-07', run_id: 'run-a', now: new Date('2026-08-01T02:00:00Z'),
    });
    expect(result.status).toBe('invoiced');
    expect(state.invoiceCreates()).toBe(1);
    expect(state.rows().every((row) => row.billed)).toBe(true);
  });

  it('keeps an emergency epoch race visible after the invoice exists', async () => {
    const state = service(rows);
    const result = await billApiUsageOrganization(state.svc, {
      organization_id: 'o1', period_month: '2026-07', run_id: 'run-a', now: new Date('2026-08-01T02:00:00Z'),
      assert_after_invoice: async () => { throw new Error('epoch_changed'); },
    });
    expect(result).toMatchObject({ status: 'review_required', review_required: true, invoice_id: 'inv1' });
    expect(state.invoices()[0].reconciliation_status).toBe('error');
    expect(state.rows().every((row) => row.billed)).toBe(true);
  });

  it('enumerates unique organizations and fails closed at the period page boundary', async () => {
    const state = service([...rows, { ...rows[0], id: 'u3', organization_id: 'o2' }]);
    await expect(listApiUsageOrganizationIds(state.svc, '2026-07')).resolves.toEqual(['o1', 'o2']);
    const full = service(Array.from({ length: 5_000 }, (_, index) => ({ ...rows[0], id: `u${index}` })));
    await expect(listApiUsageOrganizationIds(full.svc, '2026-07')).rejects.toThrow('api_usage_billing_period_read_truncated');
  });
});
