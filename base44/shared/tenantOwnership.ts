import { requireCriticalOperation } from './criticalExecution.ts';
import { isBrandOwnedBy } from './merchantBillingScope.ts';

export const TENANT_OWNERSHIP_VERSION = 'tenant-ownership-1.0.0';

export class TenantOwnershipError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'TenantOwnershipError';
    this.code = code;
    this.status = status;
  }
}

const clean = (value: unknown) => String(value ?? '').trim();

/** Resolve the exact Brand with service role, then enforce the authenticated owner. */
export async function requireOwnedBrand(svc: any, user: any, brandId: unknown) {
  const id = clean(brandId);
  if (!id) throw new TenantOwnershipError('brand_id_required', 400);
  let rows: any[];
  try {
    rows = await requireCriticalOperation(
      'tenant_owned_brand_read',
      () => svc.entities.Brand.filter({ id }, '-created_date', 2),
    );
  } catch {
    throw new TenantOwnershipError('brand_authority_unavailable', 503);
  }
  if (!Array.isArray(rows) || rows.length > 1) {
    throw new TenantOwnershipError('brand_authority_ambiguous', 503);
  }
  const brand = rows[0] || null;
  if (!brand || clean(brand.id) !== id) {
    throw new TenantOwnershipError('brand_not_found', 404);
  }
  if (String(user?.role || '').toLowerCase() !== 'admin' &&
    !isBrandOwnedBy(brand, user?.email)) {
    // Do not disclose whether another tenant's Brand exists.
    throw new TenantOwnershipError('brand_not_found', 404);
  }
  return brand;
}

/** Explicit upstream task IDs never fall back to a different task. */
export async function requireExactBrandTask(
  svc: any,
  taskId: unknown,
  expected: { brandId: unknown; agentName: string; status?: string },
) {
  const id = clean(taskId);
  if (!id) throw new TenantOwnershipError('task_id_required', 400);
  let rows: any[];
  try {
    rows = await requireCriticalOperation(
      'tenant_bound_agent_task_read',
      () => svc.entities.AgentTask.filter({ id }, '-created_date', 2),
    );
  } catch {
    throw new TenantOwnershipError('task_authority_unavailable', 503);
  }
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new TenantOwnershipError(
      rows?.length > 1 ? 'task_authority_ambiguous' : 'task_brand_binding_invalid',
      rows?.length > 1 ? 503 : 409,
    );
  }
  const task = rows[0];
  const valid = task && clean(task.id) === id &&
    clean(task.brand_id) === clean(expected.brandId) &&
    clean(task.agent_name) === clean(expected.agentName) &&
    (!expected.status || clean(task.status) === clean(expected.status));
  if (!valid) throw new TenantOwnershipError('task_brand_binding_invalid', 409);
  return task;
}

export function tenantOwnershipErrorResponse(error: unknown): Response | null {
  if (!(error instanceof TenantOwnershipError)) return null;
  return Response.json({
    ok: false,
    error: error.code,
    tenant_scope_status: 'DENIED',
  }, { status: error.status });
}
