import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  requireExactBrandTask,
  requireOwnedBrand,
  tenantOwnershipErrorResponse,
  TenantOwnershipError,
} from '../../base44/shared/tenantOwnership.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const service = ({ brands = [], tasks = [], brandError, taskError } = {}) => ({
  entities: {
    Brand: { filter: async () => { if (brandError) throw brandError; return brands; } },
    AgentTask: { filter: async () => { if (taskError) throw taskError; return tasks; } },
  },
});

describe('canonical tenant ownership boundary', () => {
  it('allows an owner and an admin, while hiding another tenant brand', async () => {
    const brand = { id: 'b1', contact_email: 'owner@example.com' };
    await expect(requireOwnedBrand(service({ brands: [brand] }), { email: 'OWNER@example.com' }, 'b1'))
      .resolves.toEqual(brand);
    await expect(requireOwnedBrand(service({ brands: [brand] }), { email: 'other@example.com' }, 'b1'))
      .rejects.toMatchObject({ code: 'brand_not_found', status: 404 });
    await expect(requireOwnedBrand(service({ brands: [brand] }), { role: 'admin' }, 'b1'))
      .resolves.toEqual(brand);
  });

  it('fails closed when brand authority is unavailable or ambiguous', async () => {
    await expect(requireOwnedBrand(service({ brandError: new Error('down') }), { role: 'admin' }, 'b1'))
      .rejects.toMatchObject({ code: 'brand_authority_unavailable', status: 503 });
    await expect(requireOwnedBrand(service({ brands: [{ id: 'b1' }, { id: 'b1' }] }), { role: 'admin' }, 'b1'))
      .rejects.toMatchObject({ code: 'brand_authority_ambiguous', status: 503 });
    await expect(requireOwnedBrand({ entities: { Brand: { filter: async () => null } } }, { role: 'admin' }, 'b1'))
      .rejects.toMatchObject({ code: 'brand_authority_ambiguous', status: 503 });
  });

  it('returns byte-equivalent non-enumerable denials for non-owner, unknown actor and unknown target', async () => {
    const brand = { id: 'b1', contact_email: 'owner@example.com' };
    const denied = async (svc, user, id) => {
      try {
        await requireOwnedBrand(svc, user, id);
        throw new Error('expected_tenant_denial');
      } catch (error) {
        expect(error).toBeInstanceOf(TenantOwnershipError);
        const response = tenantOwnershipErrorResponse(error);
        return { status: response.status, body: await response.text() };
      }
    };
    const nonOwner = await denied(service({ brands: [brand] }), { email: 'other@example.com' }, 'b1');
    const unknownActor = await denied(service({ brands: [brand] }), {}, 'b1');
    const unknownTarget = await denied(service({ brands: [] }), { email: 'other@example.com' }, 'missing');
    expect(nonOwner).toEqual({
      status: 404,
      body: JSON.stringify({ ok: false, error: 'brand_not_found', tenant_scope_status: 'DENIED' }),
    });
    expect(unknownActor).toEqual(nonOwner);
    expect(unknownTarget).toEqual(nonOwner);
  });

  it('binds an explicit upstream task to exact brand, agent and terminal status', async () => {
    const task = { id: 't1', brand_id: 'b1', agent_name: 'spend_intelligence', status: 'completed' };
    await expect(requireExactBrandTask(service({ tasks: [task] }), 't1', {
      brandId: 'b1', agentName: 'spend_intelligence', status: 'completed',
    })).resolves.toEqual(task);
    await expect(requireExactBrandTask(service({ tasks: [task] }), 't1', {
      brandId: 'b2', agentName: 'spend_intelligence', status: 'completed',
    })).rejects.toMatchObject({ code: 'task_brand_binding_invalid', status: 409 });
  });

  it('wires every B1-B3 route to the dynamically exercised gate before task writes', () => {
    for (const name of ['brainOrchestrator', 'discoveryTechStackAgent', 'spendIntelligenceAgent', 'recommendationEngineAgent']) {
      const src = fs.readFileSync(path.join(ROOT, 'base44/functions', name, 'entry.ts'), 'utf8');
      expect(src).toContain('requireOwnedBrand');
      const ownershipCall = src.indexOf('await requireOwnedBrand');
      const taskWrite = name === 'brainOrchestrator'
        ? src.indexOf('parent = await createCanonicalAgentTask')
        : src.indexOf('task = await base44.asServiceRole.entities.AgentTask.create');
      expect(ownershipCall, `${name} ownership call`).toBeGreaterThan(-1);
      expect(taskWrite, `${name} first task write`).toBeGreaterThan(-1);
      expect(ownershipCall, name).toBeLessThan(taskWrite);
    }
    for (const name of ['spendIntelligenceAgent', 'recommendationEngineAgent']) {
      const src = fs.readFileSync(path.join(ROOT, 'base44/functions', name, 'entry.ts'), 'utf8');
      expect(src).toContain('requireExactBrandTask');
    }
  });
});
