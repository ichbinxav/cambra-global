import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAX_CHUNK_CHARACTERS,
  canonicalizeText,
  cleanUrl,
  countLines,
  extractOpaqueCitations,
  extractSourceUrls,
  parseArgs,
  parseHeadings,
  sha256,
  validateArtifacts,
} from '../../scripts/import-research-knowledge.mjs';
import {
  RESEARCH_KNOWLEDGE_CHUNKS,
  RESEARCH_KNOWLEDGE_DOCUMENTS,
  researchKnowledgeChunks,
  researchKnowledgeDocuments,
} from '../../base44/shared/generated/researchKnowledgeDocuments.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, '..', '..');
const MANIFEST_PATH = path.join(
  ROOT,
  'config',
  'intelligence',
  'research-source-manifest.v1.json',
);
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'import-research-knowledge.mjs');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('research knowledge preservation pipeline', () => {
  it('preserves every physical original and records byte-level evidence', () => {
    expect(manifest.schema_version).toBe('1.0.0');
    expect(manifest.totals).toMatchObject({
      physical_originals: 11,
      unique_documents: 9,
      exact_duplicates: 2,
    });
    expect(manifest.sources).toHaveLength(11);

    for (const source of manifest.sources) {
      const storedPath = path.join(ROOT, source.stored_path);
      const bytes = fs.readFileSync(storedPath);
      const text = bytes.toString('utf8');
      expect(fs.existsSync(storedPath)).toBe(true);
      expect(fileSha256(storedPath)).toBe(source.sha256);
      expect(bytes.length).toBe(source.byte_count);
      expect(countLines(text)).toBe(source.line_count);
      expect(sha256(canonicalizeText(text))).toBe(source.canonical_sha256);
      expect(parseHeadings(text)).toEqual(source.headings);
      expect(source.trust).toMatchObject({
        truth_level: 'UNVERIFIED_EXTERNAL_RESEARCH',
        untrusted_input: true,
        auto_promote_facts: false,
        training_eligible: false,
      });
    }
  });

  it('keeps exact duplicates as physical aliases but indexes one canonical document', () => {
    const aliasesBySha = new Map();
    for (const source of manifest.sources) {
      aliasesBySha.set(source.sha256, [...(aliasesBySha.get(source.sha256) ?? []), source]);
    }
    const duplicateGroups = [...aliasesBySha.values()].filter((sources) => sources.length > 1);
    expect(duplicateGroups).toHaveLength(2);
    for (const group of duplicateGroups) {
      expect(group.filter((source) => source.duplicate_of === null)).toHaveLength(1);
      expect(group.filter((source) => source.duplicate_of !== null)).toHaveLength(group.length - 1);
    }
    expect(new Set(RESEARCH_KNOWLEDGE_DOCUMENTS.map((document) => document.document_sha256)).size)
      .toBe(9);
  });

  it('emits bounded, source-addressable and explicitly untrusted retrieval chunks', () => {
    expect(RESEARCH_KNOWLEDGE_DOCUMENTS).toHaveLength(9);
    expect(RESEARCH_KNOWLEDGE_CHUNKS).toHaveLength(manifest.totals.chunks);
    expect(researchKnowledgeDocuments).toBe(RESEARCH_KNOWLEDGE_DOCUMENTS);
    expect(researchKnowledgeChunks).toBe(RESEARCH_KNOWLEDGE_CHUNKS);
    expect(new Set(RESEARCH_KNOWLEDGE_CHUNKS.map((chunk) => chunk.chunk_id)).size)
      .toBe(RESEARCH_KNOWLEDGE_CHUNKS.length);

    const documentShas = new Set(
      RESEARCH_KNOWLEDGE_DOCUMENTS.map((document) => document.document_sha256),
    );
    for (const chunk of RESEARCH_KNOWLEDGE_CHUNKS) {
      expect(documentShas.has(chunk.document_sha256)).toBe(true);
      expect(chunk.document_sha).toBe(chunk.document_sha256);
      expect(chunk.source_id).toBe(`research:${chunk.document_sha256}`);
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARACTERS);
      expect(chunk.locator).toMatch(/^research\/external\/\d{4}-\d{2}-\d{2}\/originals\/.+:L\d+-L\d+$/);
      expect(chunk.title).toEqual(expect.any(String));
      expect(chunk.heading).toEqual(expect.any(String));
      expect(chunk.source_urls).toEqual(expect.any(Array));
      expect(chunk.opaque_citations).toEqual(expect.any(Array));
      expect(chunk).toMatchObject({
        truth_level: 'UNVERIFIED_EXTERNAL_RESEARCH',
        confidence: 'UNASSESSED',
        untrusted: true,
        auto_promote_facts: false,
        training_eligible: false,
      });
    }
  });

  it('keeps opaque turn citations opaque and rejects non-production source hosts', () => {
    const text = [
      'Official: https://docs.stripe.com/payments.',
      'Fake: https://example.com/rate https://api.sandbox.vendor.test/value',
      'Opaque: citeturn19search2turn18view0',
    ].join('\n');
    expect(extractSourceUrls(text)).toEqual(['https://docs.stripe.com/payments']);
    expect(extractOpaqueCitations(text)).toEqual(['turn18view0', 'turn19search2']);
    expect(cleanUrl('https://localhost/source')).toBeNull();
    expect(cleanUrl('https://vendor.example/source')).toBeNull();
    expect(extractSourceUrls(text).every((url) => !url.includes('turn19search2'))).toBe(true);
  });

  it('fails closed on unsafe URLs, absolute local paths and oversized chunks', () => {
    expect(() => validateArtifacts(
      { sources: [{ stored_path: '/Users/operator/Downloads/report.md' }] },
      [],
      [],
    )).toThrow('absolute_local_path_leak');
    expect(() => validateArtifacts(
      { sources: [{ stored_path: 'research/report.md' }] },
      [{ source_urls: ['https://example.com/rates'] }],
      [],
    )).toThrow('unsafe_source_url');
    expect(() => validateArtifacts(
      { sources: [{ stored_path: 'research/report.md' }] },
      [],
      [{
        chunk_id: 'oversized',
        text: 'x'.repeat(MAX_CHUNK_CHARACTERS + 1),
        locator: 'research/report.md:L1-L1',
        source_urls: [],
      }],
    )).toThrow('chunk_exceeds_character_limit');
  });

  it('makes check mode source-independent and refuses external inputs in check mode', () => {
    expect(() => parseArgs(['--check', '--source', '/tmp/report.md']))
      .toThrow('check_reads_only_imported_originals');
    const result = spawnSync(process.execPath, [SCRIPT_PATH, '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('research-knowledge:check PASS');
  });
});
