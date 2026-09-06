import { describe, expect, it, vi } from 'vitest';
import {
  inspectCommandFunctionResponse,
  unwrapCommandFunctionResponse,
} from '../../base44/shared/commandFunctionResult.ts';
import {
  COMMAND_READ_SAFE_FIELDS,
  handleCommandReadState,
} from '../../base44/shared/commandReadState.ts';
import { CHAT_TOOLS, READ_ENTITIES } from '../../base44/shared/commandToolCatalog.ts';

describe('Command function response truth boundary', () => {
  it('decodes nested Base44 data/string layers before classifying success', () => {
    const response = { data: JSON.stringify({ data: JSON.stringify({ ok: false, error: 'compatibility_quarantined' }) }) };
    expect(unwrapCommandFunctionResponse(response)).toEqual({ ok: false, error: 'compatibility_quarantined' });
    expect(inspectCommandFunctionResponse(response, 'system_health_check')).toMatchObject({
      ok: false,
      ambiguous: false,
      error: 'compatibility_quarantined',
    });
  });

  it('does not turn confirmation or empty responses into completed tool effects', () => {
    expect(inspectCommandFunctionResponse({ data: '{"ok":true,"requires_confirmation":true}' })).toMatchObject({
      ok: true,
      ambiguous: true,
    });
    expect(inspectCommandFunctionResponse({ data: null })).toMatchObject({
      ok: false,
      error: 'empty_function_response',
    });
  });

  it('summarizes canonical maintenance evidence without inventing a missed scheduler', () => {
    const result = inspectCommandFunctionResponse({ data: JSON.stringify({
      ok: true,
      health: { status: 'healthy', score: 98 },
      metrics: { active_issues: 0, critical_incidents: 0, agent_failures_7d: 0 },
      scheduler_health: { active: true, missing_or_stale: [], duplicate_workers: [] },
    }) }, 'system_health_check');
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('scheduler_missing_or_stale=none');
    expect(result.summary).toContain('critical_incidents=0');
    expect(result.summary).not.toContain('missed schedule');
  });

  it('keeps configured, paused and send-ready mailboxes distinct for Ask CAMBRA', () => {
    const result = inspectCommandFunctionResponse({ data: JSON.stringify({
      ok: true,
      summary: {
        total_leads: 1243, high_fit: 5, verified_contacts: 0, outreach_ready: 0,
        configured_senders: 14, prepared_senders: 12, paused_senders: 14,
        ready_senders: 0, configured_daily_cap: 107, ready_daily_capacity: 0,
      },
      safety: { outbound_locked: true },
      attention: [{ code: 'no_ready_sender' }, { code: 'outbound_locked' }],
    }) }, 'commercial_os_status');
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('configured_senders=14');
    expect(result.summary).toContain('prepared_senders=12');
    expect(result.summary).toContain('paused_senders=14');
    expect(result.summary).toContain('send_ready_senders=0');
    expect(result.summary).toContain('outbound_locked=true');
    expect(result.summary).not.toContain('unconfigured');
  });
});

describe('Command read-state projection', () => {
  it('keeps the catalogue and safe-field projection in exact sync', () => {
    expect([...READ_ENTITIES].sort()).toEqual(Object.keys(COMMAND_READ_SAFE_FIELDS).sort());
    expect(CHAT_TOOLS.find((tool) => tool.name === 'system_health_check')).toMatchObject({
      function: 'getMaintenanceCenter',
      risk_level: 1,
    });
  });

  it('supports scheduler evidence in background runs without exposing lease tokens', async () => {
    const list = vi.fn().mockResolvedValue([{
      id: 'run-1', worker_key: 'maintenanceEngine', status: 'COMPLETED',
      control_token: 'must-not-leak', attempt_token: 'must-not-leak-either',
      started_at: '2026-08-24T00:00:00.000Z',
    }]);
    const svc = { entities: { SchedulerRun: { list } } };
    const result = await handleCommandReadState(svc, { entity: 'SchedulerRun', limit: 5 });
    expect(result).toMatchObject({ ok: true, entity: 'SchedulerRun', count: 1 });
    expect(result.rows[0]).toMatchObject({ id: 'run-1', worker_key: 'maintenanceEngine', status: 'COMPLETED' });
    expect(result.rows[0]).not.toHaveProperty('control_token');
    expect(result.rows[0]).not.toHaveProperty('attempt_token');
  });
});
