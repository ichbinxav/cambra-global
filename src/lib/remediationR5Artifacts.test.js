import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  OUTPUT_PATH,
  REPO_ROOT,
  buildArtifact,
  checkArtifact,
  generateArtifact,
  validateArtifact,
} from '../../scripts/generate-remediation-r5.mjs';

describe('R5 authority, trace and operational-plane evidence', () => {
  it('binds all four source-derived component inventories', () => {
    const artifact = buildArtifact(REPO_ROOT);
    expect(artifact.catalog_version).toBe('remediation-r5.1');
    expect(artifact.components.map((row) => row.key)).toEqual([
      'effect_authority',
      'agent_task_trace',
      'workforce',
      'operational_planes',
    ]);
    expect(artifact.summary).toMatchObject({
      effect_class_count: 10,
      material_boundary_count: 42,
      material_boundary_facade_wired_count: 5,
      material_trace_adapted_creator_count: 3,
      material_terminal_adapted_creator_count: 3,
      active_general_supervisor_count: 1,
      health_plane_surface_count: 5,
      authoritative_specialized_sweep_count: 1,
      incident_entity_count: 3,
      third_incident_entity_count: 0,
      agent_run_writer_count: 0,
      declared_agent_count: 34,
      declared_orchestrator_count: 5,
    });
  });

  it('keeps OTR-012/013 partial and promotes only locally complete R5 axes', () => {
    const artifact = buildArtifact(REPO_ROOT);
    expect(artifact.otr_rows.map((row) => [
      row.otr_id,
      row.implementation_status,
    ])).toEqual([
      ['ROOT-OTR-012', 'PARTIAL'],
      ['ROOT-OTR-013', 'PARTIAL'],
      ['ROOT-OTR-014', 'REPO_REMEDIATED_RUNTIME_PENDING'],
      ['ROOT-OTR-015', 'REPO_REMEDIATED_RUNTIME_PENDING'],
      ['ROOT-OTR-020', 'REPO_REMEDIATED_RUNTIME_PENDING'],
    ]);
    expect(artifact.summary).toMatchObject({
      implementation_partial_count: 2,
      implementation_repo_remediated_runtime_pending_count: 3,
      binary_not_met_count: 5,
      binary_closed_count: 0,
      runtime_verified_count: 0,
    });
  });

  it('records literal coverage gaps instead of claiming universal authority or trace', () => {
    const artifact = buildArtifact(REPO_ROOT);
    const authority = artifact.otr_rows.find((row) =>
      row.otr_id === 'ROOT-OTR-012'
    );
    const trace = artifact.otr_rows.find((row) =>
      row.otr_id === 'ROOT-OTR-013'
    );
    expect(authority.blockers).toContain(
      '37 of 42 material boundaries remain SOURCE_OBSERVED_ONLY and are not wired to the common facade',
    );
    expect(trace.blockers).toContain(
      '104 material route file(s) do not expose the full source-local root/terminal/Event adapter surface',
    );
  });

  it('refuses runtime or binary closure claims', () => {
    const artifact = buildArtifact(REPO_ROOT);
    const tampered = structuredClone(artifact);
    tampered.otr_rows[0].runtime_verified = true;
    expect(() => validateArtifact(tampered)).toThrow(
      'false_runtime_or_binary_closure',
    );
  });

  it('regenerates deterministically and detects output drift', () => {
    const first = generateArtifact(REPO_ROOT);
    const second = generateArtifact(REPO_ROOT);
    expect(second).toEqual(first);
    expect(checkArtifact(REPO_ROOT)).toEqual(first);

    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cambra-r5-evidence-'));
    try {
      fs.cpSync(REPO_ROOT, fixture, {
        recursive: true,
        filter: (source) => ![
          'node_modules', '.deploy', '.git', 'dist', '.release-evidence',
        ].some((segment) => source.includes(`${path.sep}${segment}${path.sep}`)),
      });
      const target = path.join(fixture, OUTPUT_PATH);
      const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
      parsed.summary.binary_closed_count = 1;
      fs.writeFileSync(target, `${JSON.stringify(parsed, null, 2)}\n`);
      expect(() => checkArtifact(fixture)).toThrow('generated_drift');
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  }, 15_000);
});
