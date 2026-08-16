import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectFounderFeatureFlags, projectInternalAdminUsers } from '../../base44/shared/adminSettingsV2.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('Founder/Admin Settings V2 backend', () => {
  it('uses one section-lazy, sanitized projection without a new physical function', () => {
    const source = read('base44/shared/adminSettingsV2.ts');
    expect(source).toContain('section_lazy: true');
    expect(source).toContain('credentials and arbitrary metadata are deliberately');
    expect(source).toContain('raw_value_exposed: false');
    expect(source).toContain('configurable_preferences: false');
  });

  it('projects the real aggregate alert contract without claiming runtime delivery', () => {
    const source = read('base44/shared/adminSettingsV2.ts');
    expect(source).toContain("mode: 'AGGREGATED_15_MINUTE_WINDOW'");
    expect(source).toContain('window_minutes: 15');
    expect(source).toContain("implementation_evidence: 'PASSED_LOCAL'");
    expect(source).toContain("provider_delivery_receipt: 'RUNTIME_PENDING'");
    expect(source).toContain('provider_acceptance_is_delivery: false');
    expect(source).toContain('exact EmergencyControl authority with communications allowed');
    expect(source).toContain('exact OutboundControl authority with acquisition and Resend enabled');
    expect(source).toContain('SchedulerRun lease/fence authority');
  });

  it('routes Settings reads through the existing Founder aggregate and keeps locale writes audited', () => {
    expect(read('base44/functions/getFounderControlCenter/entry.ts')).toContain("body?.view||'').toLowerCase()==='settings'");
    const command = read('base44/functions/founderOSCommand/entry.ts');
    expect(command).toMatch(/action\s*===\s*["']save_admin_locale_preference["']/);
    expect(command).toContain('idempotent_replay');
    expect(command).toMatch(/intent:\s*["']admin_locale_preference["']/);
  });

  it('persists display formatting independently from language, market and currency', () => {
    const schema = read('base44/entities/LocalePreference.jsonc');
    for (const key of ['timezone_mode', 'date_format', 'number_format', 'currency_format', 'first_day_of_week']) expect(schema).toContain(`\"${key}\"`);
  });

  it('projects internal admins only and never leaks merchant/user accounts', () => {
    const projected = projectInternalAdminUsers([
      { id: 'founder', role: 'admin', email: 'founder@cambra.example', full_name: 'Founder' },
      { id: 'merchant', role: 'user', email: 'merchant@example.com', full_name: 'Merchant' },
      { id: 'unknown', email: 'unknown@example.com' },
    ]);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ id: 'founder', role: 'Admin' });
    expect(JSON.stringify(projected)).not.toContain('merchant@example.com');
    expect(JSON.stringify(projected)).not.toContain('unknown@example.com');
  });

  it('queries admins directly and does not derive authority from budget validity', () => {
    const source = read('base44/shared/adminSettingsV2.ts');
    expect(source).toContain("User.filter({ role: 'admin' }");
    expect(source).not.toContain("entities.User.list('-created_date'");
    expect(source).toContain("authorization_status: 'NOT_DERIVED_FROM_BUDGET'");
    expect(source).toContain('merchant_connections_excluded: true');
  });

  it('publishes the exact AI, privacy and Founder-visible feature contracts consumed by Settings', () => {
    const backend = read('base44/shared/adminSettingsV2.ts');
    const frontend = read('src/pages/admin/AdminSettings.jsx');
    for (const field of ['default_reasoning_tier', 'fallback_policy', 'authorization_status', 'run_level_limits']) {
      expect(backend).toContain(field);
    }
    for (const field of ['settings.ai_policy', 'settings.paid_enrichment', 'privacy.merchant_data_workflow', 'privacy.cross_tenant_intelligence', 'settings.feature_flags']) {
      expect(frontend).toContain(field);
    }
    expect(frontend).not.toContain('feature_flags:[]');

    const flags = projectFounderFeatureFlags({
      acquisition_enabled: true,
      premium_outlook_enabled: false,
      volume_resend_enabled: false,
      instantly_enabled: true,
    });
    expect(flags).toHaveLength(4);
    expect(flags.find((flag) => flag.key === 'acquisition_enabled')).toMatchObject({
      enabled: true,
      status: 'ENABLED',
      risk_level: 4,
      restart_required: false,
      editable_in_settings: false,
      manage_path: '/admin/founder-control',
    });
    expect(projectFounderFeatureFlags(null)).toEqual([]);
  });
});
