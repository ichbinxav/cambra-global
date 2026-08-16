import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ENGINE = read('base44/functions/developerMigrationEngine/entry.ts');
const APP = read('src/App.jsx');
const NAV = read('src/pages/admin/AdminLayout.jsx');
const UI = read('src/pages/admin/AdminDeveloper.jsx');

describe('CAMBRA Developer migration engine', () => {
  it('is mounted only in the protected admin shell', () => {
    const shell = APP.indexOf('<Route element={<AdminRoute><AdminLayout /></AdminRoute>}>');
    expect(APP.indexOf('path="/admin/developer"')).toBeGreaterThan(shell);
    expect(NAV).toContain('CAMBRA Developer');
  });

  it('requires GitHub connector and admin auth', () => {
    expect(ENGINE).toMatch(/getConnection\(["']github["']\)/);
    expect(ENGINE).toMatch(/user\.role\s*!==\s*["']admin["']/);
    expect(ENGINE).toContain('github_connector_required');
  });

  it('never applies generated code directly to the default branch', () => {
    expect(ENGINE).toMatch(/branch_only\s*:\s*true/);
    expect(ENGINE).toMatch(/direct_default_branch_writes\s*:\s*false/);
    expect(ENGINE).toContain('refs/heads/${branch}');
    expect(ENGINE).toMatch(/action\s*===\s*["']apply_plan["']/);
    expect(ENGINE).toContain('validateDeveloperExecutionAuthority');
    expect(ENGINE).toContain('acquireDeveloperLifecycle');
    expect(UI).toContain('Approve L3 plan');
  });

  it('opens a PR and keeps merge/cutover behind a separate L4 approval', () => {
    expect(ENGINE).toContain('/pulls`');
    expect(ENGINE).toMatch(/action_type\s*:\s*["']migration_go_live["']/);
    expect(ENGINE).toMatch(/risk_level\s*:\s*4/);
    expect(ENGINE).toMatch(/action\s*===\s*["']cutover["']/);
    expect(ENGINE).toContain('l4_cutover_approval_required');
    expect(UI).toContain('Approve L4 cutover');
  });

  it('fails closed on branch drift and rollback drift', () => {
    expect(ENGINE).toContain('base_branch_changed_rescan_required');
    expect(ENGINE).toContain('default_branch_changed_before_cutover');
    expect(ENGINE).toContain('rollback_refused_head_changed');
    expect(ENGINE).toMatch(/force\s*:\s*false/);
  });

  it('uses CI/check-run evidence before cutover can be requested', () => {
    expect(ENGINE).toContain('/check-runs?per_page=100');
    expect(ENGINE).toContain('checks_not_green');
    expect(UI).toContain('Refresh CI');
  });
});
