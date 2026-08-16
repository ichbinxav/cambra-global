// v62.2.3 — the baseline must NEVER be approvable while typecheck:critical is
// red. Before this release the approve script inferred a green critical
// typecheck from "zero critical-set errors in the candidate", which is false:
// the candidate runs `tsc -p jsconfig.json`, a project that does not include
// the backend handlers at all. These tests pin the evidence contract and the
// fact that the approve script actually enforces it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { criticalTypecheckEvidenceStatus, CRITICAL_TYPECHECK_PROJECT, sealEvidence } from '../../scripts/lib/evidence.mjs';

const TREE = 'a'.repeat(64);
const green = (over = {}) => sealEvidence({
  command: `npx tsc -p ./${CRITICAL_TYPECHECK_PROJECT}`,
  sourceTreeHash: TREE,
  exitCode: 0,
  ...over,
});

describe('criticalTypecheckEvidenceStatus', () => {
  it('accepts fresh, green evidence from the critical project', () => {
    expect(criticalTypecheckEvidenceStatus(green(), TREE)).toBe('valid');
  });

  it('FAILS when the evidence is absent', () => {
    expect(criticalTypecheckEvidenceStatus(null, TREE)).toBe('missing');
    expect(criticalTypecheckEvidenceStatus(undefined, TREE)).toBe('missing');
  });

  it('FAILS when the evidence is stale (different tree)', () => {
    expect(criticalTypecheckEvidenceStatus(green({ sourceTreeHash: 'b'.repeat(64) }), TREE)).toBe('stale');
  });

  it('FAILS when exitCode is not 0', () => {
    expect(criticalTypecheckEvidenceStatus(green({ exitCode: 1 }), TREE)).toBe('failed');
    expect(criticalTypecheckEvidenceStatus(green({ exitCode: 2 }), TREE)).toBe('failed');
  });

  it('FAILS when a failed count is present and non-zero', () => {
    expect(criticalTypecheckEvidenceStatus(green({ failed: 3 }), TREE)).toBe('failed');
  });

  it('accepts an explicit failed: 0', () => {
    expect(criticalTypecheckEvidenceStatus(green({ failed: 0 }), TREE)).toBe('valid');
  });

  it('FAILS when diagnostics are present', () => {
    expect(criticalTypecheckEvidenceStatus(green({ diagnostics: [{ file: 'x.ts', code: 'TS2339' }] }), TREE)).toBe('diagnostics_present');
  });

  it('accepts an empty diagnostics array', () => {
    expect(criticalTypecheckEvidenceStatus(green({ diagnostics: [] }), TREE)).toBe('valid');
  });

  it('FAILS when the evidence came from another project (e.g. jsconfig)', () => {
    expect(criticalTypecheckEvidenceStatus(green({ command: 'npx tsc -p ./jsconfig.json' }), TREE)).toBe('wrong_command');
  });

  it('FAILS when a sealed artifact is edited after execution', () => {
    const tampered = green();
    tampered.exitCode = 1;
    expect(criticalTypecheckEvidenceStatus(tampered, TREE)).toBe('tampered');
  });

  it('a red critical typecheck can never yield valid evidence', () => {
    for (const red of [
      green({ exitCode: 1 }),
      green({ failed: 1 }),
      green({ diagnostics: [{ code: 'TS2345' }] }),
    ]) {
      expect(criticalTypecheckEvidenceStatus(red, TREE)).not.toBe('valid');
    }
  });
});

describe('typecheck-baseline-approve.mjs enforces the evidence gate', () => {
  const src = fs.readFileSync('scripts/typecheck-baseline-approve.mjs', 'utf8');

  it('no longer claims critical green is implied by the candidate', () => {
    expect(src).not.toContain('is implied by zero critical-set errors');
  });

  it('blocks approval unless the critical evidence status is valid', () => {
    expect(src).toContain('criticalTypecheckEvidenceStatus');
    expect(src).toMatch(/criticalStatus !== "valid"/);
    expect(src).toMatch(/die\(`typecheck:critical not proven green/);
  });

  it('does not re-run tsc inside the approve script', () => {
    expect(src).not.toMatch(/spawnSync|execSync/);
  });

  it('checks the evidence BEFORE writing the baseline', () => {
    expect(src.indexOf('criticalStatus !== "valid"')).toBeLessThan(src.indexOf('fs.writeFileSync(BASELINE'));
  });
});
