import { describe, expect, it } from 'vitest';
import { PAYMENTS_RATE_PACK_V4_MANIFEST as manifest } from '../../base44/shared/generated/paymentsRatePackV4.ts';
import { handlePaymentsRatePackAdmin } from '../../base44/shared/paymentsRatePackAdmin.ts';

function mockService() {
  const stores = new Map();
  let nextId = 1;
  const entity = (name) => {
    if (!stores.has(name)) stores.set(name, []);
    const records = stores.get(name);
    return {
      async filter(query) {
        return records.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value));
      },
      async bulkCreate(rows) {
        const created = rows.map((row) => ({ ...row, id: `mock-${nextId++}` }));
        records.push(...created);
        return created;
      },
      async bulkUpdate(rows) {
        return rows.map((row) => {
          const index = records.findIndex((record) => record.id === row.id);
          if (index < 0) throw new Error(`missing mock row ${row.id}`);
          records[index] = { ...records[index], ...row };
          return records[index];
        });
      },
      async deleteMany(query) {
        let deleted = 0;
        for (let index = records.length - 1; index >= 0; index -= 1) {
          if (Object.entries(query).every(([key, value]) => records[index][key] === value)) {
            records.splice(index, 1);
            deleted += 1;
          }
        }
        return { deleted };
      },
    };
  };
  const entities = new Proxy({
    OperationalLog: { async create() { return { id: 'audit' }; } },
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return entity(String(property));
    },
  });
  return { service: { entities }, stores };
}

async function json(response) {
  return response.json();
}

describe('payments rate pack admin lifecycle', () => {
  it('previews, applies exactly once, retries idempotently, and can roll back by pack id', async () => {
    const { service, stores } = mockService();
    const user = { role: 'admin', email: 'founder@example.test' };

    const preview = await json(await handlePaymentsRatePackAdmin(user, { action: 'preview' }, service));
    expect(preview.ok).toBe(true);
    expect(preview.tables.reduce((sum, table) => sum + table.create_count, 0)).toBe(692);

    const refused = await handlePaymentsRatePackAdmin(user, { action: 'apply' }, service);
    expect(refused.status).toBe(409);

    const first = await json(await handlePaymentsRatePackAdmin(user, {
      action: 'apply',
      confirm_manifest_sha256: manifest.aggregate_sha256,
    }, service));
    expect(first.complete).toBe(true);
    expect(first.live_pack_total).toBe(692);
    expect(first.applied.reduce((sum, item) => sum + item.created, 0)).toBe(692);

    const second = await json(await handlePaymentsRatePackAdmin(user, {
      action: 'apply',
      confirm_manifest_sha256: manifest.aggregate_sha256,
    }, service));
    expect(second.complete).toBe(true);
    expect(second.applied.reduce((sum, item) => sum + item.created + item.updated, 0)).toBe(0);
    expect(second.applied.reduce((sum, item) => sum + item.unchanged, 0)).toBe(692);

    const rollback = await json(await handlePaymentsRatePackAdmin(user, {
      action: 'rollback',
      confirm: 'DELETE_RATE_PACK_V4',
      confirm_manifest_sha256: manifest.aggregate_sha256,
    }, service));
    expect(rollback.removed.reduce((sum, item) => sum + item.deleted, 0)).toBe(692);
    expect([...stores.values()].flat()).toHaveLength(0);
  });

  it('fails closed for non-admin callers', async () => {
    const { service } = mockService();
    const response = await handlePaymentsRatePackAdmin({ role: 'user' }, { action: 'status' }, service);
    expect(response.status).toBe(403);
  });
});
