import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const API = read('base44/functions/apiV1/entry.ts');
const MCP = read('base44/functions/mcpServer/entry.ts');
const CREATE_KEY = read('base44/functions/createApiKey/entry.ts');
const OPENAPI = read('base44/functions/apiOpenApiSpec/entry.ts');

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

  it('does not grant or advertise the deprecated economic mutation scope', () => {
    expect(CREATE_KEY).not.toContain('"update:trackers"');
    expect(OPENAPI).not.toContain('"update:trackers"');
    expect(OPENAPI).not.toContain('Update tracker');
  });
});
