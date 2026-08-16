import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  readRuntimeRows,
  requireRuntimeSource,
  runtimeSourceCoverage,
} from '../../base44/shared/runtimeSourceRead.ts';

describe('runtime source read fail-closed contract', () => {
  it('distinguishes observed empty data from an unavailable source', async () => {
    const empty = await readRuntimeRows({
      source: 'empty_source',
      read: async () => [],
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unavailable = await readRuntimeRows({
      source: 'failed_source',
      read: async () => {
        throw new Error('transport offline');
      },
    });
    errorSpy.mockRestore();

    expect(empty).toMatchObject({ ok: true, status: 'COMPLETE', value: [] });
    expect(unavailable).toMatchObject({
      ok: false,
      status: 'UNAVAILABLE',
      value: [],
      blockers: ['failed_source_unavailable'],
    });
    expect(() => requireRuntimeSource(unavailable)).toThrowError(
      /failed_source_unavailable/,
    );
  });

  it('marks a bounded page as incomplete instead of claiming full coverage', async () => {
    const page = await readRuntimeRows({
      source: 'bounded_source',
      limit: 2,
      read: async () => [{ id: 'a' }, { id: 'b' }],
    });
    const coverage = runtimeSourceCoverage({ page });

    expect(page).toMatchObject({
      ok: true,
      status: 'INCOMPLETE',
      truncated: true,
    });
    expect(coverage).toMatchObject({
      complete: false,
      status: 'INCOMPLETE',
      blockers: ['bounded_source_coverage_truncated'],
    });
    expect(() => requireRuntimeSource(page)).toThrowError(
      /bounded_source_coverage_truncated/,
    );
  });

  it('contains no silent empty/null fallbacks in the assigned admin slice', () => {
    const files = [
      'discoveryV2Admin.ts',
      'discoveryV2Execution.ts',
      'discoveryAdmin.ts',
      'commercialOperatingSystem.ts',
      'commercialActivationRuntime.ts',
      'commercialCampaignAdmin.ts',
      'founderMerchantsV2.ts',
      'incidentAlerting.ts',
      'disasterRecoveryRuntime.ts',
      'referralActivation.ts',
      'referralBilling.ts',
      'referralLink.ts',
    ];
    const silentFallback = /\.catch\(\(\)\s*=>\s*(?:\[\]|null|\(\{\}\)|\{\})/;
    for (const file of files) {
      const source = fs.readFileSync(`base44/shared/${file}`, 'utf8');
      expect(source, file).not.toMatch(silentFallback);
    }
  });
});
