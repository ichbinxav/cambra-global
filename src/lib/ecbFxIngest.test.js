import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ECB_BASE_CURRENCY,
  ECB_SOURCE,
  ECB_SOURCE_TYPE,
  REQUIRED_QUOTE_CURRENCIES,
  buildFxSnapshotRows,
  parseEcbDailyXml,
} from '../../base44/shared/ecbFxIngest.ts';
import { analyzerReliableFxSnapshots } from '../../base44/shared/analyzerFx.ts';
import { resolveFX } from '../../base44/shared/marketMoney.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// A faithful excerpt of the real ECB daily file, including the namespaces and
// the single-quoted attributes the ECB actually emits.
const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
	<Cube>
		<Cube time='2026-08-14'>
			<Cube currency='USD' rate='1.0954'/>
			<Cube currency='GBP' rate='0.86550'/>
			<Cube currency='CHF' rate='0.9412'/>
			<Cube currency='CZK' rate='24.755'/>
			<Cube currency='DKK' rate='7.4589'/>
			<Cube currency='HUF' rate='395.28'/>
			<Cube currency='ISK' rate='148.30'/>
			<Cube currency='NOK' rate='11.7325'/>
			<Cube currency='PLN' rate='4.2938'/>
			<Cube currency='RON' rate='4.9768'/>
			<Cube currency='SEK' rate='11.2055'/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;

const RETRIEVED_AT = '2026-08-14T16:05:00.000Z';

describe('ECB FX ingest — parsing', () => {
  it('reads the published date and rates verbatim', () => {
    const parsed = parseEcbDailyXml(ECB_XML);
    expect(parsed.ok).toBe(true);
    expect(parsed.effective_at).toBe('2026-08-14T00:00:00.000Z');
    // The stored string must be character-identical to the source, so an
    // auditor comparing row against ECB file sees the same number.
    expect(parsed.rates.CZK).toBe('24.755');
    expect(parsed.rates.GBP).toBe('0.86550');
  });

  it('refuses an empty or shapeless payload instead of guessing', () => {
    expect(parseEcbDailyXml('').ok).toBe(false);
    expect(parseEcbDailyXml('<html>maintenance</html>').ok).toBe(false);
    // A file with a date but no rates must not pass as "zero rates today".
    expect(parseEcbDailyXml("<Cube time='2026-08-14'></Cube>")).toMatchObject({ ok: false, error: 'ecb_no_rates_parsed' });
  });

  it('drops a malformed rate rather than coercing it', () => {
    const parsed = parseEcbDailyXml("<Cube time='2026-08-14'><Cube currency='CZK' rate='24.755'/><Cube currency='HUF' rate='0'/></Cube>");
    expect(parsed.ok).toBe(true);
    expect(parsed.rates.CZK).toBe('24.755');
    expect(parsed.rates.HUF).toBeUndefined();
  });
});

describe('ECB FX ingest — row construction', () => {
  it('builds one auditable row per required currency', () => {
    const built = buildFxSnapshotRows({ parsed: parseEcbDailyXml(ECB_XML), retrieved_at: RETRIEVED_AT });
    expect(built.ok).toBe(true);
    expect(built.missing).toEqual([]);
    expect(built.rows.map((r) => r.quote_currency).sort()).toEqual([...REQUIRED_QUOTE_CURRENCIES].sort());

    const czk = built.rows.find((r) => r.quote_currency === 'CZK');
    // Direction: stored exactly as the ECB quotes it (EUR base).
    expect(czk.base_currency).toBe(ECB_BASE_CURRENCY);
    expect(czk.rate_decimal).toBe('24.755');
    expect(czk.rate_scaled_1e12).toBe(24755000000000);
    // Provenance the analyzer's reliability filter demands.
    expect(czk.source).toBe(ECB_SOURCE);
    expect(czk.source_type).toBe(ECB_SOURCE_TYPE);
    expect(czk.source_url).toContain('ecb.europa.eu');
    expect(czk.rate_kind).toBe('REFERENCE');
    expect(czk.status).toBe('CURRENT');
    expect(czk.effective_at).toBe('2026-08-14T00:00:00.000Z');
  });

  it('reports currencies the ECB did not publish instead of inventing them', () => {
    const partial = parseEcbDailyXml("<Cube time='2026-08-14'><Cube currency='CZK' rate='24.755'/></Cube>");
    const built = buildFxSnapshotRows({ parsed: partial, retrieved_at: RETRIEVED_AT });
    expect(built.ok).toBe(true);
    expect(built.rows).toHaveLength(1);
    // Every other required currency is named as missing — silence would let a
    // gap look like a success.
    expect(built.missing).toContain('HUF');
    expect(built.missing).toContain('GBP');
    expect(built.rows.some((r) => r.quote_currency === 'HUF')).toBe(false);
  });

  it('keys rows deterministically so a same-day re-run is idempotent', () => {
    const a = buildFxSnapshotRows({ parsed: parseEcbDailyXml(ECB_XML), retrieved_at: RETRIEVED_AT });
    const b = buildFxSnapshotRows({ parsed: parseEcbDailyXml(ECB_XML), retrieved_at: '2026-08-14T23:59:00.000Z' });
    expect(a.rows.map((r) => r.fx_key)).toEqual(b.rows.map((r) => r.fx_key));
    expect(a.rows.find((r) => r.quote_currency === 'CZK').fx_key).toBe('ECB:EUR:CZK:2026-08-14');
  });

  it('refuses to build without a retrieval timestamp', () => {
    expect(buildFxSnapshotRows({ parsed: parseEcbDailyXml(ECB_XML), retrieved_at: null }).ok).toBe(false);
  });
});

describe('ECB FX ingest — actually unblocks the verified analyzer', () => {
  // This is the test that matters: rows are worthless if the analyzer's own
  // reliability filter or resolveFX reject them.
  const rows = buildFxSnapshotRows({ parsed: parseEcbDailyXml(ECB_XML), retrieved_at: RETRIEVED_AT }).rows;

  it('passes the analyzer reliability filter', () => {
    expect(analyzerReliableFxSnapshots(rows)).toHaveLength(rows.length);
  });

  it('resolves the non-EUR currencies that were blocked before', () => {
    // Before this ingest existed the table was empty and every one of these
    // returned fx_rate_missing, which fails the whole verified analysis.
    const asked = '2026-08-14T12:00:00.000Z';
    for (const currency of ['GBP', 'CHF', 'CZK', 'DKK', 'SEK', 'NOK', 'PLN', 'RON', 'HUF', 'ISK']) {
      const r = resolveFX(rows, {
        base_currency: currency,
        quote_currency: 'EUR',
        effective_at: asked,
        purpose: 'ANALYZER_VERIFIED_PAYMENTS',
        source_policy: { stale_after_days: 7 },
      });
      expect(r.ok, `${currency} must resolve`).toBe(true);
      expect(['CURRENT', 'VERIFIED_REFERENCE'], `${currency} status`).toContain(r.status);
      expect(r.source).toBe('ECB');
    }
  });

  it('inverts the ECB direction correctly (1 EUR = 24.755 CZK → 1 CZK ≈ 0.0404 EUR)', () => {
    const r = resolveFX(rows, {
      base_currency: 'CZK', quote_currency: 'EUR',
      effective_at: '2026-08-14T12:00:00.000Z', purpose: 'ANALYZER_VERIFIED_PAYMENTS',
    });
    expect(r.ok).toBe(true);
    expect(Number(r.rate_decimal)).toBeCloseTo(1 / 24.755, 6);
  });

  it('still goes STALE past the policy window rather than pretending to be fresh', () => {
    const r = resolveFX(rows, {
      base_currency: 'CZK', quote_currency: 'EUR',
      effective_at: '2026-09-30T12:00:00.000Z', purpose: 'ANALYZER_VERIFIED_PAYMENTS',
      source_policy: { stale_after_days: 7 },
    });
    expect(r.status).toBe('STALE');
  });
});

describe('ECB FX ingest — currency list stays tied to the declared markets', () => {
  it('covers every non-EUR market currency and nothing invented', () => {
    const markets = JSON.parse(read('config/europe-markets.json'));
    const list = Array.isArray(markets) ? markets : markets.markets;
    const needed = [...new Set(list.map((m) => m.primary_currency).filter((c) => c && c !== 'EUR'))].sort();
    // If a market changes currency this fails, forcing a deliberate revisit of
    // REQUIRED_QUOTE_CURRENCIES rather than a silent coverage hole.
    expect([...REQUIRED_QUOTE_CURRENCIES].sort()).toEqual(needed);
  });
});
