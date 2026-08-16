import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Founder/Admin Settings V2 surface', () => {
  it('adds one lightweight settings route and secondary navigation without moving operations into it', () => {
    const app = read('src/App.jsx');
    const nav = read('src/pages/admin/AdminLayout.jsx');
    const settings = read('src/pages/admin/AdminSettings.jsx');
    expect(app).toContain("lazy(() => import('@/pages/admin/AdminSettings'))");
    expect(app).toContain('path="/admin/settings"');
    expect(nav).toContain('label: "Settings"');
    for (const section of ['Company', 'Users & Access', 'Language & Region', 'Notifications', 'Integrations', 'AI & Costs', 'Data & Privacy', 'Developer / Advanced']) expect(settings).toContain(section);
    expect(settings).toContain('getFounderControlCenter');
    expect(settings).not.toContain('EmergencyControl.update');
    expect(settings).not.toContain('OutboundControl.update');
    expect(settings).not.toContain('CostBudgetControl.update');
  });

  it('keeps sensitive values out of the frontend and persists only locale preferences through the governed command gateway', () => {
    const settings = read('src/pages/admin/AdminSettings.jsx');
    expect(settings).toContain("action: \"save_admin_locale_preference\"");
    expect(settings).toContain('setLang(draft.language)');
    expect(settings).not.toContain('entities.Integration');
    expect(settings).not.toContain('access_token');
    expect(settings).not.toContain('refresh_token');
    expect(settings).not.toContain('ROF IS1');
    expect(settings).not.toContain('FR50105452916');
  });

  it('consumes the exact sanitized Settings V2 response contract', () => {
    const settings = read('src/pages/admin/AdminSettings.jsx');
    expect(settings).toContain('access.internal_roles');
    expect(settings).toContain('effective_policy?.required_push_policy');
    expect(settings).toContain('settings.supported_integrations');
    expect(settings).toContain('settings.commercial_providers');
    expect(settings).toContain('settings.ai_policy');
    expect(settings).toContain('settings.paid_enrichment');
    expect(settings).toContain('privacy.merchant_data_workflow');
    expect(settings).toContain('privacy.cross_tenant_intelligence');
    expect(settings).toContain('settings.feature_flags');
    expect(settings).not.toContain('access.canonical_roles');
    expect(settings).not.toContain('effective_policy?.mandatory');
    expect(settings).not.toContain('feature_flags:[]');
    expect(settings).not.toContain('<DeepLink to="/admin/users">');
  });

  it('keeps the complete Settings surface localized in EN/FR/ES and saves every regional format', () => {
    const settings = read('src/pages/admin/AdminSettings.jsx');
    const copy = settings.match(/const SETTINGS_COPY = \{\s*fr: \{([\s\S]*?)\n  \},\s*es: \{([\s\S]*?)\n  \},\s*\};/);
    expect(copy).not.toBeNull();
    const keys = (block) => [...block.matchAll(/^\s{4}"([^"]+)":/gm)].map((match) => match[1]).sort();
    const frenchKeys = keys(copy[1]);
    expect(frenchKeys).toEqual(keys(copy[2]));
    expect(frenchKeys.length).toBeGreaterThan(140);
    const requiredCopy = new Set();
    for (const pattern of [/ui\("([^"]+)"\)/g, /(?:label|title|eyebrow|body)="([^"]+)"/g, /<DeepLink[^>]*>([^<{]+)<\/DeepLink>/g]) {
      for (const match of settings.matchAll(pattern)) requiredCopy.add(match[1]);
    }
    const languageNeutral = new Set(['CAMBRA Global SASU', 'SIREN', 'SIRET', 'VAT', 'APE / NAF', 'CFE', 'CVAE / RCM', 'API & Webhooks']);
    expect([...requiredCopy].filter((key) => !frenchKeys.includes(key) && !languageNeutral.has(key))).toEqual([]);
    expect(settings).toContain('useSettingsCopy');
    expect(settings).toContain('Array.isArray(settings.markets)');
    expect(settings).toContain('Array.isArray(settings.currencies)');
    expect(settings).toContain('Array.isArray(settings.timezones)');
    for (const field of ['date_format:', 'number_format:', 'currency_format:', 'first_day_of_week:']) expect(settings).toContain(field);
    expect(settings).toContain('normalized.startsWith(`${value}_`)');
  });
});
