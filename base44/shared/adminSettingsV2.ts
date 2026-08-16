import { CAMBRA_PUBLIC_LEGAL_IDENTITY, readInternalFiscalProfile, readLegalIdentity } from './cambraLegalIdentity.ts';
import { costRuntimeSnapshot } from './costGovernance.ts';
import { configuredIncidentAlertRecipient, recipientFingerprint } from './incidentAlerting.ts';
import { LOCALE_REGISTRY, PRODUCT_LOCALES } from './generated/localeRegistry.ts';
import { RETENTION_POLICIES, RETENTION_POLICY_VERSION } from './retentionPolicy.ts';
import { runtimeGitSha } from './runtimeEvidence.ts';

export const ADMIN_SETTINGS_V2_VERSION = 'admin-settings-v2-1.0.0';

const SECTIONS = new Set([
  'overview', 'company', 'users_access', 'language_region', 'notifications',
  'integrations', 'ai_costs', 'data_privacy', 'advanced',
]);

const text = (value: any, limit = 240) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, limit);
const number = (value: any) => Number.isFinite(Number(value)) ? Number(value) : 0;
const at = () => new Date().toISOString();
const latest = (rows: any[] = []) => rows.slice().sort((a, b) => Date.parse(String(b?.updated_at || b?.created_at || b?.created_date || 0)) - Date.parse(String(a?.updated_at || a?.created_at || a?.created_date || 0)))[0] || null;

function integrationCatalogProjection(row: any) {
  return {
    integration_id: text(row.integration_id, 80),
    name: text(row.name, 120),
    category: text(row.category || 'other', 80),
    availability: text(row.status || 'planned', 40),
    auth_type: text(row.auth_type || 'manual', 40),
    connection_status: 'NOT_ASSESSED_IN_SETTINGS',
    // Tenant connections, credentials and arbitrary metadata are deliberately
    // absent. Settings lists supported adapters; merchant operations live elsewhere.
    secret_value_exposed: false,
  };
}

function providerProjection(row: any) {
  return {
    provider_key: text(row.provider_key, 80),
    role: text(row.role, 40),
    status: text(row.status, 40),
    secret_configured: row.secret_present === true,
    auth_test_pass: row.auth_test_pass === true,
    last_checked_at: row.last_checked_at || null,
    last_success_at: row.last_success_at || null,
    webhook_configured: Boolean(row.webhook_json && Object.keys(row.webhook_json).length),
    last_error_code: text(row.last_error_code, 120) || null,
    secret_value_exposed: false,
  };
}

function budgetProjection(snapshot: any) {
  const control = snapshot?.control || null;
  const usage = snapshot?.governed_usage || { daily_total_minor: 0, monthly_total_minor: 0, categories: {} };
  return {
    control: control ? {
      id: control.id,
      version: control.version,
      status: control.status,
      currency: control.currency,
      daily_total_limit_minor: number(control.daily_total_limit_minor),
      monthly_total_limit_minor: number(control.monthly_total_limit_minor),
      category_limits_json: control.category_limits_json || {},
      anomaly_warning_pct: number(control.anomaly_warning_pct),
      hard_stop_pct: number(control.hard_stop_pct),
      emergency_stop_active: control.emergency_stop_active === true,
      approved_by: control.approved_by || null,
      approved_at: control.approved_at || null,
      updated_at: control.updated_at || null,
    } : null,
    validation: snapshot?.validation || { ok: false, blockers: ['active_cost_budget_required'] },
    usage: {
      daily_total_minor: number(usage.daily_total_minor),
      monthly_total_minor: number(usage.monthly_total_minor),
      categories: usage.categories || {},
    },
    utilization: snapshot?.utilization || null,
    coverage_truncated: snapshot?.coverage_truncated === true,
  };
}

async function collectCompany() {
  const legal = readLegalIdentity();
  const fiscal = readInternalFiscalProfile();
  const configured = legal.ok;
  return {
    canonical_identity: CAMBRA_PUBLIC_LEGAL_IDENTITY,
    internal_fiscal_profile: fiscal.ok ? fiscal.profile : null,
    internal_fiscal_profile_status: fiscal.ok ? 'CONFIGURED_ADMIN_ONLY' : 'CONFIGURATION_REQUIRED',
    internal_fiscal_profile_missing: fiscal.ok ? [] : fiscal.missing,
    editable: false,
    change_path: 'RELEASE_MANAGED',
    production_impact: 'Canonical legal and fiscal values are release/environment managed. CAMBRA does not pretend an in-app edit can safely change issued documents or deployment configuration.',
    consistency_check: {
      contracts: configured ? 'USES_CANONICAL_RUNTIME_SOURCE' : 'BLOCKED_LEGAL_IDENTITY_CONFIGURATION_REQUIRED',
      invoices: configured ? 'USES_CANONICAL_RUNTIME_SOURCE' : 'BLOCKED_LEGAL_IDENTITY_CONFIGURATION_REQUIRED',
      billing: configured ? 'USES_CANONICAL_RUNTIME_SOURCE' : 'BLOCKED_LEGAL_IDENTITY_CONFIGURATION_REQUIRED',
      legal_public_surface: 'BUILD_TIME_ASSERTED_NOT_RUNTIME_CRAWLED',
      evidence: {
        contract_generator: 'generateRecoverContractPdf -> readLegalIdentity',
        invoice_generator: 'createEligibleRecoverInvoices -> readLegalIdentity',
        public_surface_test: 'src/lib/legalIdentityConsistency.test.js',
      },
    },
    legal_identity_runtime_status: legal.ok ? 'CONFIGURED' : 'CONFIGURATION_REQUIRED',
    legal_identity_missing: legal.ok ? [] : legal.missing,
  };
}

export function projectInternalAdminUsers(rows: any[] = []) {
  return rows.filter((row: any) => row?.role === 'admin').map((row: any) => ({
    id: row.id,
    name: text(row.full_name || row.name || '', 160) || null,
    email: text(row.email, 240),
    role: 'Admin',
    status: 'PLATFORM_MANAGED_ACTIVE_STATE_UNKNOWN',
    date_added: row.created_date || row.created_at || null,
    last_access: null,
    mfa_status: 'PLATFORM_MANAGED_NOT_EXPOSED',
    permissions_summary: ['Founder/Admin surfaces', 'material approvals', 'integration configuration subject to canonical gates'],
  }));
}

async function collectUsers(svc: any) {
  // Query internal admins directly. Loading the whole User table would mix
  // merchant accounts into a Founder configuration surface and needlessly
  // expose their identifiers to this read model.
  const adminRows = await svc.entities.User.filter({ role: 'admin' }, '-created_date', 500);
  return {
    users: projectInternalAdminUsers(adminRows),
    internal_roles: [{ key: 'admin', label: 'Admin', supported: true }],
    merchant_accounts_excluded: true,
    excluded_merchant_account_count: null,
    excluded_count_reason: 'Merchant accounts are intentionally not loaded by Settings, so no sampled or incomplete count is presented.',
    capabilities: {
      invite_or_promote_admin: 'CANONICAL_FUNCTION_EXISTS_AUDIT_HARDENING_REQUIRED',
      granular_internal_roles: false,
      suspend_user: false,
      revoke_sessions: false,
      mfa_visibility: false,
    },
    result_truncated: adminRows.length >= 500,
    truth_boundary: 'Role-scoped in canonical authorization',
    truth_boundary_detail: 'Only role=admin records are loaded and projected. Base44 currently exposes no granular internal role model, so Settings must not invent Finance, Commercial, Operations or Read-only authority.',
  };
}

async function collectLanguageRegion(svc: any, user: any) {
  const preferenceKey = `admin:${String(user.id || user.email || '')}`;
  const preference = latest(await svc.entities.LocalePreference.filter({ preference_key: preferenceKey }, '-updated_at', 5));
  const markets = (LOCALE_REGISTRY.markets || []).map((market: any) => ({
    market_code: market.market_code,
    default_locale: market.default_locale,
    supported_product_locales: market.supported_product_locales || [],
    currency: market.currency || 'EUR',
    timezone: market.timezone || 'UTC',
    translation_readiness: market.translation_readiness,
  }));
  return {
    preference_key: preferenceKey,
    current: preference ? {
      locale: preference.locale,
      language: preference.language,
      market_code: preference.market_code || null,
      currency: preference.currency || null,
      timezone: preference.timezone || null,
      timezone_mode: preference.timezone_mode || 'automatic',
      date_format: preference.date_format || 'locale_default',
      number_format: preference.number_format || 'locale_default',
      currency_format: preference.currency_format || 'locale_default',
      first_day_of_week: Number.isInteger(Number(preference.first_day_of_week)) ? Number(preference.first_day_of_week) : null,
      updated_at: preference.updated_at || null,
    } : null,
    supported_product_locales: PRODUCT_LOCALES.map((locale: any) => ({
      locale: locale.locale,
      language: locale.language,
      translation_status: locale.translation_status,
      quality_status: locale.quality_status,
    })),
    markets,
    currencies: [...new Set(markets.map((market: any) => market.currency).filter(Boolean))].sort(),
    timezones: [...new Set(markets.map((market: any) => market.timezone).filter(Boolean))].sort(),
    invariant: 'Language, market context, currency and timezone are stored and validated independently. Original financial currency is never rewritten by this preference.',
    save_action: 'save_admin_locale_preference',
  };
}

async function collectNotifications() {
  const recipient = configuredIncidentAlertRecipient();
  return {
    effective_policy: {
      channels: ['EMAIL'],
      required_push_policy: [
        { severity: 'CRITICAL', delivery: 'EMAIL', disable_allowed: false },
        { severity: 'HIGH', delivery: 'EMAIL', disable_allowed: false },
      ],
      admin_visibility: 'SOURCE_INCIDENTS_VISIBLE_IN_MAINTENANCE',
      delivery_dependencies: [
        'configured Founder/Admin recipient',
        'exact EmergencyControl authority with communications allowed',
        'exact OutboundControl authority with acquisition and Resend enabled',
        'valid CostBudgetControl reservation',
        'available email provider',
        'SchedulerRun lease/fence authority',
      ],
      digest: {
        mode: 'AGGREGATED_15_MINUTE_WINDOW',
        window_minutes: 15,
        implementation_evidence: 'PASSED_LOCAL',
        provider_delivery_receipt: 'RUNTIME_PENDING',
        provider_acceptance_is_delivery: false,
      },
      quiet_hours: 'NOT_CONFIGURED',
    },
    effective_recipient: recipient ? {
      configured: true,
      fingerprint: recipientFingerprint(recipient),
      raw_value_exposed: false,
    } : { configured: false, fingerprint: null, raw_value_exposed: false },
    configurable_preferences: false,
    truth_boundary: 'CAMBRA has a locally verified, SchedulerRun-fenced 15-minute HIGH/CRITICAL aggregate transport path. Provider acceptance is not delivery; real delivery receipts and reconciliation remain runtime pending. Per-category and quiet-hour preferences have no canonical consumer and remain non-editable.',
    system_path: '/admin/maintenance',
  };
}

async function collectIntegrations(svc: any) {
  const [catalog, providers, profiles] = await Promise.all([
    svc.entities.IntegrationCatalog.list('priority', 200),
    svc.entities.CommercialProviderState.list('-last_checked_at', 100),
    svc.entities.OutboundSendingProfile.list('-created_date', 100),
  ]);
  return {
    supported_integrations: catalog.map(integrationCatalogProjection),
    merchant_connections_excluded: true,
    commercial_providers: providers.map(providerProjection),
    sending_profiles: profiles.map((profile: any) => ({
      profile_key: text(profile.profile_key, 160),
      provider: text(profile.provider, 80),
      status: text(profile.status, 40),
      domain: text(profile.domain, 160) || null,
      from_address: text(profile.from_address, 240) || null,
      webhook_status: text(profile.webhook_status || 'NOT_CONFIGURED', 40),
      current_daily_cap: number(profile.current_daily_cap),
      secret_value_exposed: false,
    })),
    actions: {
      integration_catalog: '/admin/integrations',
      api_webhooks: '/admin/api-integrations',
      system_health: '/admin/maintenance',
      instantly_status_action: 'instantly_status',
    },
    truth_boundary: 'Secrets are never returned. Provider-specific connect, reconnect, rotate and disconnect flows remain the only supported mutation paths.',
  };
}

async function collectAiCosts(svc: any) {
  const snapshot = await costRuntimeSnapshot(svc);
  return {
    budget: budgetProjection(snapshot),
    ai_policy: {
      routing: 'TASK_SPECIFIC_POLICY',
      default_reasoning_tier: 'TASK_SPECIFIC_POLICY',
      fallback_policy: 'CANONICAL_TASK_POLICY',
      timeout_policy: 'TASK_SPECIFIC_POLICY',
      retry_policy: 'TASK_SPECIFIC_POLICY',
      editable: false,
      reason: 'Model routing and authority remain task-specific and environment-managed; Settings cannot bypass them.',
    },
    paid_enrichment: {
      globally_authorized: null,
      authorization_status: 'NOT_DERIVED_FROM_BUDGET',
      budget_gate_pass: snapshot?.validation?.ok === true,
      hard_cap_category: 'enrichment',
      run_level_limits: 'DiscoveryExecutionRun hard caps remain independent and authoritative.',
    },
    budget_change_action: 'configure_cost_budget',
    budget_change_host: 'goLiveControlAdmin',
  };
}

async function collectDataPrivacy(svc: any) {
  const evidence = await svc.entities.RetentionExecutionEvidence.list('-completed_at', 80);
  return {
    retention_policy_version: RETENTION_POLICY_VERSION,
    retention_policies: Object.entries(RETENTION_POLICIES).map(([key, policy]: any) => ({ key, ...policy })),
    recent_execution_evidence: evidence.map((row: any) => ({
      id: row.id,
      policy_key: row.policy_key,
      policy_version: row.policy_version,
      category: row.category,
      action: row.action,
      status: row.status,
      started_at: row.started_at,
      completed_at: row.completed_at || null,
      candidate_count: number(row.candidate_count),
      succeeded_count: number(row.succeeded_count),
      failed_count: number(row.failed_count),
    })),
    privacy_invariants: {
      merchant_data_workflow: 'GOVERNED_WORKFLOW_REQUIRED',
      cross_tenant_intelligence: 'privacy-safe aggregates only',
      minimum_cohort: 10,
      raw_identifier_retention_for_aggregates: false,
      editable_in_settings: false,
    },
    truth_boundary: 'Retention, anonymization and k-anonymity are policy-governed safeguards, not arbitrary founder toggles. Material legal changes require the canonical reviewed process.',
  };
}

export function projectFounderFeatureFlags(outbound: any) {
  if (!outbound) return [];
  const flags = [
    {
      key: 'acquisition_enabled',
      label: 'Merchant acquisition outbound',
      purpose: 'Authorizes merchant acquisition only after canonical go-live gates.',
      enabled: outbound.acquisition_enabled === true,
      risk_level: 4,
      dependencies: ['fresh preflight', 'commercial policy', 'deliverability', 'suppression', 'cost budget'],
    },
    {
      key: 'premium_outlook_enabled',
      label: 'Premium Outlook transport',
      purpose: 'Allows premium mailbox delivery through Outlook.',
      enabled: outbound.premium_outlook_enabled === true,
      risk_level: 3,
      dependencies: ['outbound authority', 'healthy mailbox profile', 'deliverability'],
    },
    {
      key: 'volume_resend_enabled',
      label: 'Resend volume transport',
      purpose: 'Allows volume delivery through Resend.',
      enabled: outbound.volume_resend_enabled === true,
      risk_level: 3,
      dependencies: ['outbound authority', 'webhook lifecycle', 'suppression'],
    },
    {
      key: 'instantly_enabled',
      label: 'Instantly transport',
      purpose: 'Allows commercial delivery through Instantly.',
      enabled: outbound.instantly_enabled === true,
      risk_level: 3,
      dependencies: ['outbound authority', 'sending profiles', 'suppression'],
    },
  ];
  return flags.map((flag) => ({
    ...flag,
    status: flag.enabled ? 'ENABLED' : 'DISABLED',
    restart_required: false,
    editable_in_settings: false,
    manage_path: '/admin/founder-control',
  }));
}

async function collectAdvanced(svc: any) {
  const [outboundRows, emergencyRows, policies] = await Promise.all([
    svc.entities.OutboundControl.filter({ control_key: 'global' }, '-created_date', 1),
    svc.entities.EmergencyControl.filter({ control_key: 'global' }, '-updated_at', 1),
    svc.entities.CommercialPolicy.list('-approved_at', 100),
  ]);
  const outbound = outboundRows[0] || null;
  const emergency = emergencyRows[0] || null;
  return {
    runtime_platform: 'BASE44',
    environment: text(Deno.env.get('CAMBRA_ENVIRONMENT') || '', 40) || null,
    deployment_identity: {
      git_sha: runtimeGitSha() || null,
      source_tree_hash: text(Deno.env.get('CAMBRA_SOURCE_TREE_HASH') || '', 128) || null,
      release_version: text(Deno.env.get('CAMBRA_RELEASE_VERSION') || '', 80) || null,
      app_identifier: text(Deno.env.get('BASE44_APP_ID') || '', 120) || null,
      values_missing_are_not_inferred: true,
    },
    founder_safe_flags: {
      outbound: outbound ? {
        acquisition_enabled: outbound.acquisition_enabled === true,
        premium_outlook_enabled: outbound.premium_outlook_enabled === true,
        volume_resend_enabled: outbound.volume_resend_enabled === true,
        instantly_enabled: outbound.instantly_enabled === true,
        preflight_status: outbound.preflight_status || 'NOT_RUN',
      } : null,
      emergency: emergency ? {
        safe_mode: emergency.safe_mode === true,
        communications_paused: emergency.communications_paused === true,
        negotiations_paused: emergency.negotiations_paused === true,
        migrations_paused: emergency.migrations_paused === true,
        billing_issuance_paused: emergency.billing_issuance_paused === true,
        paid_discovery_paused: emergency.paid_discovery_paused === true,
      } : null,
      commercial_policy_counts: {
        active: policies.filter((row: any) => row.status === 'active').length,
        paused: policies.filter((row: any) => row.status === 'paused').length,
        draft: policies.filter((row: any) => row.status === 'draft').length,
      },
    },
    feature_flags: projectFounderFeatureFlags(outbound),
    editable: false,
    debug_links: {
      founder_control: '/admin/founder-control',
      system_health: '/admin/maintenance',
      integrations: '/admin/integrations',
      api_webhooks: '/admin/api-integrations',
      workers: '/admin/automations',
      incidents: '/admin/maintenance',
      release_evidence: '/admin/documentation',
    },
    truth_boundary: 'This is a curated, founder-safe projection of canonical controls. It is not an environment-variable editor and it cannot bypass release, legal, security or activation gates.',
  };
}

const COLLECTORS: Record<string, (svc: any, user: any) => Promise<any>> = {
  company: async () => collectCompany(),
  users_access: async (svc) => collectUsers(svc),
  language_region: collectLanguageRegion,
  notifications: async () => collectNotifications(),
  integrations: async (svc) => collectIntegrations(svc),
  ai_costs: async (svc) => collectAiCosts(svc),
  data_privacy: async (svc) => collectDataPrivacy(svc),
  advanced: async (svc) => collectAdvanced(svc),
};

export function normalizeSettingsSection(value: any) {
  const section = String(value || 'overview').trim().toLowerCase();
  return SECTIONS.has(section) ? section : null;
}

/**
 * Section-lazy, admin-only Settings read model. It projects the existing
 * configuration stores and intentionally omits secrets, logs and operational
 * datasets. Call with a single concrete section; overview is navigation only.
 */
export async function collectAdminSettingsSnapshot(svc: any, user: any, requestedSection: any = 'overview') {
  const section = normalizeSettingsSection(requestedSection);
  if (!section) return { ok: false, error: 'settings_section_invalid', supported_sections: [...SECTIONS] };
  const response: any = {
    ok: true,
    version: ADMIN_SETTINGS_V2_VERSION,
    captured_at: at(),
    section,
    section_lazy: true,
    supported_sections: [...SECTIONS],
  };
  if (section === 'overview') {
    response.data = {
      sections: [
        { key: 'company', label: 'Company', description: 'Canonical legal and fiscal identity' },
        { key: 'users_access', label: 'Users & Access', description: 'Internal Founder/Admin access' },
        { key: 'language_region', label: 'Language & Region', description: 'Display preferences independent of market and currency' },
        { key: 'notifications', label: 'Notifications', description: 'Effective interruption policy' },
        { key: 'integrations', label: 'Integrations', description: 'Connection configuration status' },
        { key: 'ai_costs', label: 'AI & Costs', description: 'Hard spending controls and policy' },
        { key: 'data_privacy', label: 'Data & Privacy', description: 'Retention and privacy safeguards' },
        { key: 'advanced', label: 'Developer / Advanced', description: 'Read-only deployment and safe flags' },
      ],
      settings_are_not_operations: true,
    };
    return response;
  }
  try {
    response.data = await COLLECTORS[section](svc, user);
    return response;
  } catch (error) {
    return {
      ...response,
      ok: false,
      error: 'settings_section_unavailable',
      section_error: text((error as Error)?.message || error, 160),
    };
  }
}
