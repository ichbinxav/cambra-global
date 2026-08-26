import {
  PAYMENTS_RATE_PACK_V4_MANIFEST,
  PAYMENTS_RATE_PACK_V4_TABLES,
} from './generated/paymentsRatePackV4.ts';

type PackRow = Record<string, unknown> & {
  source_row_key: string;
  source_row_sha256: string;
  materialized_row_sha256: string;
};

type PackTable = {
  fileName: string;
  entityName: string;
  rows: PackRow[];
};

const PACK_ID = PAYMENTS_RATE_PACK_V4_MANIFEST.pack_id;
const MANIFEST_SHA256 = PAYMENTS_RATE_PACK_V4_MANIFEST.aggregate_sha256;
const BATCH_SIZE = 50;
const TABLES = PAYMENTS_RATE_PACK_V4_TABLES as unknown as PackTable[];

function chunks<T>(items: T[], size = BATCH_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function entityApi(service: any, entityName: string) {
  const api = service?.entities?.[entityName];
  if (!api) throw new Error(`rate_pack_entity_unavailable:${entityName}`);
  return api;
}

async function inspectTable(service: any, table: PackTable) {
  const api = entityApi(service, table.entityName);
  const existing = await api.filter({ pack_id: PACK_ID }, 'source_row_number', 5000, 0);
  const byKey = new Map<string, any[]>();
  for (const record of existing) {
    const key = String(record?.source_row_key || '');
    const matches = byKey.get(key) || [];
    matches.push(record);
    byKey.set(key, matches);
  }

  const desiredKeys = new Set(table.rows.map((row) => row.source_row_key));
  const duplicateKeys = [...byKey.entries()].filter(([, rows]) => rows.length > 1).map(([key]) => key);
  const unexpected = existing.filter((row: any) => !desiredKeys.has(String(row?.source_row_key || '')));
  const create: PackRow[] = [];
  const update: Array<PackRow & { id: string; ingested_at?: string }> = [];
  let unchanged = 0;

  for (const desired of table.rows) {
    const current = byKey.get(desired.source_row_key)?.[0];
    if (!current) {
      create.push(desired);
    } else if (String(current.materialized_row_sha256 || '') !== desired.materialized_row_sha256) {
      update.push({ ...desired, id: current.id, ingested_at: current.ingested_at });
    } else {
      unchanged += 1;
    }
  }

  return {
    entity_name: table.entityName,
    source_file: table.fileName,
    expected: table.rows.length,
    existing: existing.length,
    create_count: create.length,
    update_count: update.length,
    unchanged_count: unchanged,
    duplicate_keys: duplicateKeys,
    unexpected_pack_record_ids: unexpected.map((row: any) => row.id),
    create,
    update,
  };
}

function publicInspection(inspection: Awaited<ReturnType<typeof inspectTable>>) {
  const { create: _create, update: _update, ...summary } = inspection;
  return summary;
}

async function inspectAll(service: any) {
  const inspections = [];
  for (const table of TABLES) inspections.push(await inspectTable(service, table));
  return inspections;
}

function assertSafe(inspections: Awaited<ReturnType<typeof inspectAll>>) {
  const duplicates = inspections.flatMap((item) => item.duplicate_keys.map((key) => `${item.entity_name}:${key}`));
  const unexpected = inspections.flatMap((item) => item.unexpected_pack_record_ids.map((id) => `${item.entity_name}:${id}`));
  if (duplicates.length) throw new Error(`rate_pack_duplicate_live_keys:${duplicates.slice(0, 10).join(',')}`);
  if (unexpected.length) throw new Error(`rate_pack_unexpected_live_rows:${unexpected.slice(0, 10).join(',')}`);
}

async function status(service: any) {
  const inspections = await inspectAll(service);
  const tables = inspections.map(publicInspection);
  const complete = tables.every((table) =>
    table.existing === table.expected
    && table.create_count === 0
    && table.update_count === 0
    && table.duplicate_keys.length === 0
    && table.unexpected_pack_record_ids.length === 0);
  return {
    ok: true,
    action: 'status',
    pack_id: PACK_ID,
    manifest_sha256: MANIFEST_SHA256,
    complete,
    expected_total: PAYMENTS_RATE_PACK_V4_MANIFEST.totals.records,
    live_pack_total: tables.reduce((sum, table) => sum + table.existing, 0),
    tables,
    truth_boundary: {
      evidence_index_declared_pending_url_reverification: PAYMENTS_RATE_PACK_V4_MANIFEST.totals.evidence_index_declared_pending_url_reverification,
      row_marked_pending_url_reverification: PAYMENTS_RATE_PACK_V4_MANIFEST.totals.row_marked_pending_url_reverification,
      source_reference_missing: PAYMENTS_RATE_PACK_V4_MANIFEST.totals.source_reference_missing,
      evidence_index_unmapped_rows: PAYMENTS_RATE_PACK_V4_MANIFEST.totals.evidence_index_unmapped_rows,
      blocked_rows_active: 0,
      legacy_engine_pack_rows_active: 0,
    },
  };
}

async function applyPack(service: any, user: any, body: any) {
  if (String(body?.confirm_manifest_sha256 || '') !== MANIFEST_SHA256) {
    return Response.json({ ok: false, error: 'manifest_confirmation_required', manifest_sha256: MANIFEST_SHA256 }, { status: 409 });
  }
  const inspections = await inspectAll(service);
  assertSafe(inspections);
  const now = new Date().toISOString();
  const applied = [];

  for (const inspection of inspections) {
    const api = entityApi(service, inspection.entity_name);
    let created = 0;
    let updated = 0;
    for (const batch of chunks(inspection.create)) {
      await api.bulkCreate(batch.map((row) => ({
        ...row,
        ingestion_batch_id: PACK_ID,
        ingested_at: now,
      })));
      created += batch.length;
    }
    for (const batch of chunks(inspection.update)) {
      await api.bulkUpdate(batch.map((row) => ({
        ...row,
        ingestion_batch_id: PACK_ID,
        ingested_at: row.ingested_at || now,
        last_reconciled_at: now,
      })));
      updated += batch.length;
    }
    applied.push({ entity_name: inspection.entity_name, created, updated, unchanged: inspection.unchanged_count });
  }

  const post = await status(service);
  if (!post.complete) throw new Error('rate_pack_post_apply_integrity_failed');
  await service.entities.OperationalLog.create({
    event_type: 'payments_rate_pack_v4_applied',
    message: `Applied ${PACK_ID} with ${post.live_pack_total} records`,
    data_json: {
      pack_id: PACK_ID,
      manifest_sha256: MANIFEST_SHA256,
      applied,
      blocked_rows_active: 0,
      legacy_engine_pack_rows_active: 0,
    },
    actor_email: user?.email,
    created_at: now,
  }).catch(() => null);
  return Response.json({ ...post, action: 'apply', applied });
}

async function rollbackPack(service: any, user: any, body: any) {
  if (String(body?.confirm_manifest_sha256 || '') !== MANIFEST_SHA256 || body?.confirm !== 'DELETE_RATE_PACK_V4') {
    return Response.json({ ok: false, error: 'rollback_confirmation_required', manifest_sha256: MANIFEST_SHA256 }, { status: 409 });
  }
  const removed = [];
  for (const table of TABLES) {
    const result = await entityApi(service, table.entityName).deleteMany({ pack_id: PACK_ID });
    removed.push({ entity_name: table.entityName, deleted: Number(result?.deleted || 0) });
  }
  await service.entities.OperationalLog.create({
    event_type: 'payments_rate_pack_v4_rolled_back',
    message: `Rolled back ${PACK_ID}`,
    data_json: { pack_id: PACK_ID, manifest_sha256: MANIFEST_SHA256, removed },
    actor_email: user?.email,
    created_at: new Date().toISOString(),
  }).catch(() => null);
  return Response.json({ ok: true, action: 'rollback', pack_id: PACK_ID, manifest_sha256: MANIFEST_SHA256, removed });
}

export async function handlePaymentsRatePackAdmin(user: any, body: any, service: any) {
  if (!user || user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  const action = String(body?.action || 'status').toLowerCase();
  try {
    if (action === 'preview') {
      const inspections = await inspectAll(service);
      assertSafe(inspections);
      return Response.json({
        ok: true,
        action,
        pack_id: PACK_ID,
        manifest_sha256: MANIFEST_SHA256,
        expected_total: PAYMENTS_RATE_PACK_V4_MANIFEST.totals.records,
        tables: inspections.map(publicInspection),
      });
    }
    if (action === 'apply') return applyPack(service, user, body);
    if (action === 'rollback') return rollbackPack(service, user, body);
    if (action === 'status') return Response.json(await status(service));
    return Response.json({ ok: false, error: 'unsupported_rate_pack_action' }, { status: 400 });
  } catch (error) {
    console.error('paymentsRatePackAdmin failed', error);
    return Response.json({ ok: false, error: 'payments_rate_pack_admin_failed' }, { status: 500 });
  }
}
