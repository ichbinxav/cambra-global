import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const API = read('base44/functions/apiV1/entry.ts');
const MCP = read('base44/functions/mcpServer/entry.ts');
const CREATE_KEY = read('base44/functions/createApiKey/entry.ts');
// DASHBOARD-C12: the scope list moved out of createApiKey into one shared catalog, because
// it existed there AND in runApiSelfTests while OAuth apps had none at all.
const SCOPE_CATALOG = read('base44/shared/apiScopeCatalog.ts');
const OPENAPI = read('base44/functions/apiOpenApiSpec/entry.ts');
const OVERRIDES = read('base44/functions/adminOverrides/entry.ts');
const ADMIN_REPORTS = read('src/components/admin/MonthlyReportsTable.jsx');
const ADMIN_ACTIVATION = read('src/pages/admin/AdminActivationDetail.jsx');
const LEGACY_ACT = read('base44/functions/updateDealActivationStatus/entry.ts');
const LEGACY_TASK = read('base44/functions/updateMigrationTaskStatus/entry.ts');
const LEGACY_GENERATOR = read('base44/functions/regenerateMigrationTasks/entry.ts');

// P10: clients and LLM-facing protocols may observe economic state, but they
// are never authority for DealActivation status or realized savings. Those
// values advance only through deterministic Recover/P9/ECL/payment gates.
describe('P10 — external/AI economic authority boundary', () => {
  it('keeps the legacy REST tracker mutation endpoint fail-closed', () => {
    expect(API).toContain('economic_tracker_state_is_server_managed');
    const patch = API.slice(API.indexOf('"PATCH /v1/trackers/:id"'), API.indexOf('// ---------- REPORTS'));
    expect(patch).not.toContain('DealActivation.update');
    expect(patch).not.toContain('realized_savings_monthly');
    expect(patch).not.toContain('realized_savings_yearly');
  });

  it('does not expose tracker mutation as an MCP tool', () => {
    expect(MCP).not.toContain('name: "update_tracker"');
    expect(MCP).toContain('tracker mutations deliberately NOT exposed through MCP');
  });


  it('requires an explicit platform boundary for unbound API keys', () => {
    for (const source of [API, MCP]) {
      expect(source).toContain('scope === "admin" || scope === "platform"');
      expect(source).not.toContain('return principal.type === "api_key" && !principal.raw?.organization_id;');
    }
    // The whole chain, not just the string: the catalog declares the boundary scope, and
    // createApiKey validates against that catalog rather than a private copy.
    expect(SCOPE_CATALOG).toContain("'platform'");
    expect(CREATE_KEY).toContain("from '../../shared/apiScopeCatalog.ts'");
    expect(CREATE_KEY).toContain('VALID_SCOPES');
  });


  it('does not let admin UI or legacy overrides manufacture economic verification', () => {
    expect(OVERRIDES).not.toContain("measurement_mode: 'fully_verified'");
    expect(OVERRIDES).not.toContain('MonthlySavingsReport.update(report_id, { node_fee');
    expect(OVERRIDES).toContain('economic_override_retired_use_canonical_recover_flow');
    for (const source of [ADMIN_REPORTS, ADMIN_ACTIVATION]) {
      expect(source).not.toContain("openOverride('verify_report'");
      expect(source).not.toContain('MonthlySavingsReport.update');
    }
    expect(ADMIN_ACTIVATION).not.toContain("openOverride('void_invoice'");
  });


  it('keeps every pre-P9 state mutator fail-closed', () => {
    expect(LEGACY_ACT).toContain('legacy_activation_mutator_retired');
    expect(LEGACY_TASK).toContain('legacy_migration_mutator_retired');
    expect(LEGACY_GENERATOR).toContain('legacy_migration_generator_retired');
    for (const source of [LEGACY_ACT, LEGACY_TASK, LEGACY_GENERATOR]) {
      expect(source).not.toContain('DealActivation.update');
      expect(source).not.toContain('MigrationTask.update');
      expect(source).not.toContain('bulkCreate');
    }
    expect(OVERRIDES).toContain("case 'pause_activation': throw new Error('activation_state_override_retired_use_canonical_operation')");
    expect(OVERRIDES).toContain("case 'resume_activation': throw new Error('activation_state_override_retired_use_canonical_operation')");
    expect(OVERRIDES).not.toContain("status: 'paused'");
  });

  it('does not grant or advertise the deprecated economic mutation scope', () => {
    expect(CREATE_KEY).not.toContain('"update:trackers"');
    expect(OPENAPI).not.toContain('"update:trackers"');
    expect(OPENAPI).not.toContain('Update tracker');
  });
});
