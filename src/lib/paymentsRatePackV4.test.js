import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  PAYMENTS_RATE_PACK_V4_MANIFEST as manifest,
  PAYMENTS_RATE_PACK_V4_TABLES as tables,
} from '../../base44/shared/generated/paymentsRatePackV4.ts';

const root = process.cwd();
const byEntity = new Map(tables.map((table) => [table.entityName, table.rows]));

describe('CAMBRA payments rate pack v4', () => {
  it('preserves every declared data row with stable unique identities', () => {
    expect(manifest.totals).toMatchObject({
      records: 692,
      rates: 548,
      blocked_quarantine: 9,
      surcharges: 22,
      bank_references: 36,
      market_baselines: 41,
      contract_terms: 36,
    });
    const rows = tables.flatMap((table) => table.rows);
    expect(rows).toHaveLength(692);
    expect(new Set(rows.map((row) => row.source_row_key)).size).toBe(692);
    expect(rows.every((row) => /^[a-f0-9]{64}$/.test(String(row.source_row_sha256)))).toBe(true);
    expect(rows.every((row) => /^[a-f0-9]{64}$/.test(String(row.materialized_row_sha256)))).toBe(true);
  });

  it('matches the exact source file hashes committed with the package', async () => {
    for (const [fileName, expected] of Object.entries(manifest.files)) {
      const bytes = await readFile(path.join(root, 'config', 'payments-rate-pack-v4', fileName));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected.sha256);
    }
  });

  it('keeps source and materialized hashes independently auditable', () => {
    for (const row of tables.flatMap((table) => table.rows)) {
      const { materialized_row_sha256: expected, ...materialized } = row;
      expect(createHash('sha256').update(JSON.stringify(materialized)).digest('hex')).toBe(expected);
    }
  });

  it('never stores card_class and derives selection dimensions instead', () => {
    for (const row of tables.flatMap((table) => table.rows)) {
      expect(Object.hasOwn(row, 'card_class')).toBe(false);
      expect(Object.hasOwn(row.blocked_record_json || {}, 'card_class')).toBe(false);
    }
    for (const row of byEntity.get('PaymentsRateTable')) {
      expect(row.scheme).toBeTruthy();
      expect(row.funding).toBeTruthy();
      expect(row.issuer_region).toBeTruthy();
      expect(row.tier).toBeTruthy();
    }
  });

  it('keeps all blocked rows quarantined and all imported rows non-synthetic', () => {
    const blocked = byEntity.get('PaymentsRateImportQuarantine');
    expect(blocked).toHaveLength(9);
    expect(blocked.every((row) => row.active === false && row.quarantine_status === 'BLOCKED_SOURCE_CONFLICT')).toBe(true);
    expect(tables.flatMap((table) => table.rows).every((row) => row.is_synthetic === false)).toBe(true);
  });

  it('keeps legacy selection off while exposing a separate v4 eligibility decision', () => {
    const rates = byEntity.get('PaymentsRateTable');
    expect(rates.every((row) => row.active === false)).toBe(true);
    expect(rates.filter((row) => row.calculation_eligible_v4)).toHaveLength(288);
    expect(rates.filter((row) => row.calculation_eligible_v4).every((row) => row.commercial_eligibility === 'ACTIVE_MARKET')).toBe(true);
  });

  it('uses exactly the ten launch markets and preserves licensing gates', () => {
    expect([...manifest.active_launch_markets].sort()).toEqual(['CY', 'CZ', 'DE', 'ES', 'GB', 'GR', 'HR', 'IT', 'PL', 'PT']);
    expect([...manifest.licensing_protected_markets].sort()).toEqual(['BE', 'FR', 'NL']);
    expect(manifest.rate_market_status_counts).toEqual({
      ACTIVE_MARKET: 359,
      INACTIVE_MARKET: 150,
      LICENSING_PROTECTED: 39,
    });
  });

  it('records the evidence-index mismatch without guessing row provenance', () => {
    expect(manifest.totals).toMatchObject({
      evidence_index_declared_pending_url_reverification: 174,
      row_marked_pending_url_reverification: 148,
      source_reference_missing: 6,
      evidence_index_unmapped_rows: 20,
    });
    expect(manifest.rate_verification_status_counts.PENDING_URL_REVERIFICATION).toBe(148);
    expect(manifest.rate_verification_status_counts.SOURCE_NOT_FOUND).toBe(6);
  });
});