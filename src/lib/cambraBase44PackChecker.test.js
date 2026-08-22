import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditCambraBase44Pack, parseCsv } from '../../scripts/check-cambra-base44-pack.mjs';

const fixtureDirectory = path.resolve('src/lib/fixtures/cambra-base44-pack-invalid');

function snapshotDirectory(directory) {
  return Object.fromEntries(fs.readdirSync(directory).sort().map((fileName) => [fileName, fs.readFileSync(path.join(directory, fileName), 'utf8')]));
}

describe('CAMBRA Base44 pack read-only checker', () => {
  it('detects counts, attachment mismatch, truncation, evidence gaps and invalid enums', () => {
    const before = snapshotDirectory(fixtureDirectory);
    const report = auditCambraBase44Pack(fixtureDirectory);
    const codes = report.findings.map((item) => item.code);

    expect(report.verdict).toBe('NO-GO');
    expect(codes).toEqual(expect.arrayContaining([
      'RATE_ROW_COUNT',
      'RATE_COUNTRY_COUNT',
      'RATE_PROVIDER_COUNT',
      'BLOCKED_ROW_COUNT',
      'BANK_ROW_COUNT',
      'BASELINE_ROW_COUNT',
      'CONTRACT_ROW_COUNT',
      'SURCHARGE_ROW_COUNT',
      'ATTACHMENT_NAME_MISMATCH',
      'PROHIBITED_CARD_CLASS_COLUMN',
      'TRUNCATED_FIELDS',
      'INCOMPLETE_EVIDENCE',
      'INVALID_ENUM',
      'INVALID_BOOLEAN',
      'BASELINE_MARKET_COVERAGE',
      'MALFORMED_CSV',
    ]));
    expect(snapshotDirectory(fixtureDirectory)).toEqual(before);
  });

  it('fails closed for a missing directory', () => {
    const report = auditCambraBase44Pack(path.join(fixtureDirectory, 'does-not-exist'));
    expect(report.verdict).toBe('NO-GO');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'PACK_DIRECTORY_INVALID' }));
  });

  it('reports malformed quoting and inconsistent record widths instead of silently normalizing them', () => {
    expect(parseCsv('a,b\n"unterminated,1').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'unclosed_quote' }),
      expect.objectContaining({ reason: 'column_count_mismatch', row: 2 }),
    ]));
  });

  it('rejects two competing contract attachments without modifying either one', () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cambra-pack-contracts-'));
    try {
      fs.cpSync(fixtureDirectory, temporaryDirectory, { recursive: true });
      fs.copyFileSync(path.join(fixtureDirectory, 'contratos_seed_v1.csv'), path.join(temporaryDirectory, 'B_contratos.csv'));
      const before = snapshotDirectory(temporaryDirectory);
      const report = auditCambraBase44Pack(temporaryDirectory);
      expect(report.findings).toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_CONTRACT_ATTACHMENTS' }));
      expect(snapshotDirectory(temporaryDirectory)).toEqual(before);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
