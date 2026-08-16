import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  consumePublicRequestRateLimit,
  consumeRateLimit,
  deriveRequestNetworkFingerprints,
  RATE_LIMIT_FINGERPRINT_VERSION,
  rateLimitWindow,
  readTrustedClientAddress,
} from '../../base44/shared/rateLimit.ts';

const CURRENT_SECRET = 'current-rate-limit-secret-material-0001';
const PREVIOUS_SECRET = 'previous-rate-limit-secret-material-01';
const CURRENT_VERSION = 'key-2026-08-b';
const PREVIOUS_VERSION = 'key-2026-08-a';

function service(initial = [], options = {}) {
  let rows = initial.map((row, index) => ({ id: `r${index}`, ...row }));
  let sequence = rows.length;
  return {
    rows,
    entities: {
      RateLimitCounter: {
        filter: async (query) => {
          if (options.readFails) throw new Error('counter_read_down');
          return rows.filter((row) => row.principal_id === query.principal_id && row.window_start === query.window_start);
        },
        create: async (row) => {
          if (options.createFails) throw new Error('counter_create_down');
          const saved = { id: `r${sequence++}`, created_date: `2026-08-11T00:00:${String(sequence).padStart(2, '0')}Z`, ...row };
          rows.push(saved);
          return saved;
        },
        updateMany: async (query, patch) => {
          if (options.updateFails) throw new Error('counter_update_down');
          const row = rows.find((item) => item.id === query.id && item.window_start === query.window_start && item.count === query.count);
          if (!row) return { updated: 0 };
          Object.assign(row, patch.$set);
          return { updated: 1 };
        },
      },
    },
  };
}

function request(headers = {}) {
  return new Request('https://cambra.invalid/public', { headers });
}

const currentConfig = {
  secret: CURRENT_SECRET,
  secret_version: CURRENT_VERSION,
  trusted_header: 'x-real-ip',
};

describe('central CAS rate limiter', () => {
  it('uses deterministic windows and fails at the configured boundary', async () => {
    const at = new Date('2026-08-11T12:34:30Z');
    const svc = service();
    expect(rateLimitWindow(60, at).window_start).toBe('2026-08-11T12:34:00.000Z');
    expect((await consumeRateLimit(svc, { principal_id: 'api-key-1', principal_type: 'api_key', limit: 2, window_seconds: 60, at })).ok).toBe(true);
    expect((await consumeRateLimit(svc, { principal_id: 'api-key-1', principal_type: 'api_key', limit: 2, window_seconds: 60, at })).ok).toBe(true);
    expect(await consumeRateLimit(svc, { principal_id: 'api-key-1', principal_type: 'api_key', limit: 2, window_seconds: 60, at })).toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  it('sums duplicate bucket rows so a create race cannot increase capacity', async () => {
    const window = '2026-08-11T12:00:00.000Z';
    const svc = service([
      { principal_id: 'oauth-1', window_start: window, count: 2 },
      { principal_id: 'oauth-1', window_start: window, count: 2 },
    ]);
    expect(await consumeRateLimit(svc, {
      principal_id: 'oauth-1', principal_type: 'oauth_token', limit: 4, window_seconds: 3600, at: new Date('2026-08-11T12:30:00Z'),
    })).toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  it('derives a stable versioned HMAC for IPv4 without exposing the address', async () => {
    const req = request({ 'x-real-ip': '198.51.100.24', 'x-forwarded-for': '203.0.113.99' });
    const first = await deriveRequestNetworkFingerprints(req, 'submit-contact-message', currentConfig);
    const second = await deriveRequestNetworkFingerprints(req, 'submit-contact-message', currentConfig);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ secret_version: CURRENT_VERSION, network_address_persisted: false });
    expect(first.current).toMatch(/^rlh:key-2026-08-b:[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toContain('198.51.100.24');
    expect(JSON.stringify(first)).not.toContain('203.0.113.99');
  });

  it('canonicalizes equivalent IPv6 forms and bracketed ports', async () => {
    const expanded = await deriveRequestNetworkFingerprints(request({ 'x-real-ip': '2001:0db8:0:0:0:0:0:1' }), 'ipv6-test', currentConfig);
    const compressed = await deriveRequestNetworkFingerprints(request({ 'x-real-ip': '2001:db8::1' }), 'ipv6-test', currentConfig);
    const bracketed = await deriveRequestNetworkFingerprints(request({ 'x-real-ip': '[2001:db8::1]:443' }), 'ipv6-test', currentConfig);
    expect(expanded.current).toBe(compressed.current);
    expect(bracketed.current).toBe(compressed.current);
    expect(readTrustedClientAddress(request({ 'x-real-ip': '[2001:db8::1]:443' }), 'x-real-ip')).toBe('2001:db8::1');
  });

  it('ignores untrusted proxy headers and fails closed on missing or invalid trusted input', async () => {
    const trusted = request({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.1' });
    const spoofed = request({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '192.0.2.200' });
    expect((await deriveRequestNetworkFingerprints(trusted, 'proxy-test', currentConfig)).current)
      .toBe((await deriveRequestNetworkFingerprints(spoofed, 'proxy-test', currentConfig)).current);

    const forwardedConfig = { ...currentConfig, trusted_header: 'x-forwarded-for' };
    const chainA = request({ 'x-forwarded-for': '203.0.113.10, 192.0.2.44' });
    const chainB = request({ 'x-forwarded-for': '198.51.100.90, 192.0.2.44' });
    expect((await deriveRequestNetworkFingerprints(chainA, 'proxy-test', forwardedConfig)).current)
      .toBe((await deriveRequestNetworkFingerprints(chainB, 'proxy-test', forwardedConfig)).current);
    await expect(deriveRequestNetworkFingerprints(request({ 'x-forwarded-for': '198.51.100.1' }), 'proxy-test', currentConfig))
      .rejects.toMatchObject({ code: 'rate_limit_trusted_address_unavailable', status: 503 });
    expect(() => readTrustedClientAddress(trusted, 'forwarded')).toThrow('rate_limit_trusted_proxy_header_invalid');
  });

  it('fails closed with 503 before touching the counter store when secret authority is absent', async () => {
    const svc = service();
    const result = await consumePublicRequestRateLimit(svc, request({ 'x-real-ip': '198.51.100.8' }), {
      namespace: 'submit-waitlist-signup', limit: 5, window_seconds: 3600,
    }, { secret: '', secret_version: CURRENT_VERSION, trusted_header: 'x-real-ip' });
    expect(result).toMatchObject({ ok: false, status: 503, reason: 'rate_limit_secret_unavailable', network_fingerprint: null });
    expect(svc.rows).toEqual([]);
  });

  it('requires an explicit key version and preserves limits across rotation', async () => {
    await expect(deriveRequestNetworkFingerprints(request({ 'x-real-ip': '198.51.100.9' }), 'rotation-test', {
      secret: CURRENT_SECRET, trusted_header: 'x-real-ip',
    })).rejects.toMatchObject({ code: 'rate_limit_secret_version_unavailable' });

    const rotationConfig = {
      ...currentConfig,
      previous_secret: PREVIOUS_SECRET,
      previous_secret_version: PREVIOUS_VERSION,
    };
    const req = request({ 'x-real-ip': '198.51.100.9' });
    const derived = await deriveRequestNetworkFingerprints(req, 'rotation-test', rotationConfig);
    expect(derived.principals).toHaveLength(2);
    expect(new Set(derived.principals).size).toBe(2);
    expect(derived.principals[0]).toContain(`:${CURRENT_VERSION}:`);
    expect(derived.principals[1]).toContain(`:${PREVIOUS_VERSION}:`);

    const at = new Date('2026-08-11T12:30:00Z');
    const window = rateLimitWindow(3600, at).window_start;
    const svc = service([{ principal_id: derived.principals[1], window_start: window, count: 1 }]);
    expect(await consumePublicRequestRateLimit(svc, req, {
      namespace: 'rotation-test', limit: 1, window_seconds: 3600, at,
    }, rotationConfig)).toMatchObject({ ok: false, status: 429, reason: 'rate_limited' });
  });

  it('maps unavailable durable storage to a fail-closed 503', async () => {
    const result = await consumePublicRequestRateLimit(service([], { readFails: true }), request({ 'x-real-ip': '198.51.100.10' }), {
      namespace: 'store-test', limit: 5, window_seconds: 3600,
    }, currentConfig);
    expect(result).toMatchObject({ ok: false, status: 503, reason: 'rate_limit_store_unavailable' });
  });

  it('uses WebCrypto HMAC rather than an unkeyed SHA digest', () => {
    const source = fs.readFileSync('base44/shared/rateLimit.ts', 'utf8');
    expect(RATE_LIMIT_FINGERPRINT_VERSION).toBe('rate-limit-hmac-sha256-v1');
    expect(source).toContain("{name:'HMAC',hash:'SHA-256'}");
    expect(source).toContain("crypto.subtle.sign('HMAC'");
    expect(source).not.toMatch(/subtle\.digest|createHash\s*\(/);
  });
});
