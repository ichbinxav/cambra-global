import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const PUBLIC_HMAC_BOUNDARIES = Object.freeze([
  { name: 'getPaymentsGapTeaser', firstMaterialEffect: 'entities.PaymentsAnalysisSession' },
  { name: 'joinCollective', firstMaterialEffect: 'entities.CollectiveMember.create' },
  { name: 'submitCallRequest', firstMaterialEffect: 'entities.Lead.create' },
  { name: 'submitContactMessage', firstMaterialEffect: 'entities.Lead.create' },
  { name: 'submitPaymentsAnalysis', firstMaterialEffect: 'entities.ReferralLink' },
  { name: 'submitWaitlistSignup', rateGate: 'const rl = await checkRateLimit(base44, req)', firstMaterialEffect: 'entities.Lead.create' },
]);

const TECHNICAL_AUDIT_BOUNDARIES = Object.freeze(['apiV1', 'mcpServer']);
const readFunction = (name) => fs.readFileSync(`base44/functions/${name}/entry.ts`, 'utf8');

describe('public rate-limit HMAC boundary inventory', () => {
  it('enumerates every public material caller and gates before its first business effect', () => {
    expect(PUBLIC_HMAC_BOUNDARIES.map((entry) => entry.name)).toEqual([
      'getPaymentsGapTeaser',
      'joinCollective',
      'submitCallRequest',
      'submitContactMessage',
      'submitPaymentsAnalysis',
      'submitWaitlistSignup',
    ]);
    const discovered = fs.readdirSync('base44/functions', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => fs.existsSync(`base44/functions/${name}/entry.ts`))
      .filter((name) => readFunction(name).includes('consumePublicRequestRateLimit('))
      .sort();
    expect(discovered).toEqual(PUBLIC_HMAC_BOUNDARIES.map((entry) => entry.name).sort());
    for (const boundary of PUBLIC_HMAC_BOUNDARIES) {
      const source = readFunction(boundary.name);
      const handler = source.indexOf('Deno.serve(');
      const limiter = source.indexOf(boundary.rateGate || 'consumePublicRequestRateLimit(', handler);
      const effect = source.indexOf(boundary.firstMaterialEffect);
      expect(handler, `${boundary.name} handler marker missing`).toBeGreaterThanOrEqual(0);
      expect(limiter, `${boundary.name} must use the public HMAC authority`).toBeGreaterThanOrEqual(0);
      expect(effect, `${boundary.name} material effect marker missing`).toBeGreaterThan(limiter);
      expect(source.slice(handler, limiter)).not.toMatch(/entities\.[A-Za-z0-9_]+\.(?:create|update|updateMany|delete)\s*\(/);
      expect(source).not.toMatch(/req\.headers\.get\(['"](?:x-forwarded-for|x-real-ip|cf-connecting-ip)['"]\)/i);
      expect(source).not.toMatch(/principal_type\s*:\s*['"]ip['"]/i);
      expect(source).not.toMatch(/subtle\.digest|createHash\s*\([^)]*sha-?256/i);
    }
  });

  it('keeps the Analyzer HMAC gate after market validation but before referral access', () => {
    const source = readFunction('submitPaymentsAnalysis');
    const marketGate = source.indexOf('const launchMarket = validatePaymentsLaunchMarketInput(raw)');
    const limiter = source.indexOf('consumePublicRequestRateLimit(');
    const sloReceipt = source.indexOf('observeServiceLevelRequest(');
    const referral = source.indexOf('entities.ReferralLink');
    const sessionWrite = source.indexOf('entities.PaymentsAnalysisSession.create');
    expect(marketGate).toBeGreaterThanOrEqual(0);
    expect(limiter).toBeGreaterThan(marketGate);
    expect(sloReceipt).toBeGreaterThan(limiter);
    expect(referral).toBeGreaterThan(limiter);
    expect(sessionWrite).toBeGreaterThan(limiter);
    expect(source).toContain("const ipHash = String(rl.network_fingerprint || '')");
    expect(source).toContain('ip_hash: ipHash');
  });

  it('uses raw trusted addresses only in memory for API allowlists and persists only HMAC audit fields', () => {
    for (const name of TECHNICAL_AUDIT_BOUNDARIES) {
      const source = readFunction(name);
      expect(source).toContain('readTrustedClientAddress(req)');
      expect(source).toContain('deriveRequestNetworkFingerprints(req');
      expect(source).toContain('network_fingerprint: ctx.ip');
      expect(source).not.toContain('ip_address: ctx.ip');
      expect(source).not.toContain('last_used_ip: ctx.ip');
      expect(source).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:clientAddress|readTrustedClientAddress)/);
    }
  });

  it('locks schemas to service-role HMAC storage while retaining explicit legacy-field warnings', () => {
    const counter = JSON.parse(fs.readFileSync('base44/entities/RateLimitCounter.jsonc', 'utf8'));
    expect(counter.properties.principal_type.enum).toEqual(['api_key', 'oauth_token', 'network_hmac']);
    expect(counter.required).toContain('principal_type');
    expect(counter.rls.read.user_condition.role).toBe('__service_role_only__');
    expect(counter.rls.write.user_condition.role).toBe('__service_role_only__');
    expect(counter.properties.principal_id.description).toContain('Raw network addresses');

    for (const [file, legacyField] of [
      ['base44/entities/ApiActivityLog.jsonc', 'ip_address'],
      ['base44/entities/ApiKey.jsonc', 'last_used_ip'],
      ['base44/entities/OAuthToken.jsonc', 'last_used_ip'],
    ]) {
      const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(schema.properties[legacyField].description).toMatch(/Legacy deprecated field/i);
      expect(schema.properties[legacyField].description).toMatch(/raw (?:network addresses|IP)/i);
    }
    const session = JSON.parse(fs.readFileSync('base44/entities/PaymentsAnalysisSession.jsonc', 'utf8'));
    expect(session.properties.ip_hash.description).toContain('versioned, domain-separated HMAC');
    expect(session.properties.ip_hash.description).toContain('never a raw IP');
  });

  it('records bounded retention honestly and leaves PURGE-2 runtime pending', () => {
    const matrix = JSON.parse(fs.readFileSync('config/data-retention-matrix.json', 'utf8'));
    const row = matrix.categories.find((entry) => entry.category === 'rate_limit_counters');
    expect(row).toMatchObject({
      central_policy_key: 'rate_limit_counters',
      automation_status: 'RUNTIME_PENDING',
    });
    expect(row.retention_rule).toContain('2 days');
    expect(row.identifiability).toContain('raw IP and proxy headers prohibited');
    expect(row.runtime_pending_reason).toContain('PURGE-2');
    const maintenance = readFunction('maintenanceEngine');
    expect(maintenance).not.toMatch(/RateLimitCounter\.(?:delete|deleteMany)/);
  });
});
