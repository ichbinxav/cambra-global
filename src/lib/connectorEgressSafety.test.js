import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('credential-bearing connector egress', () => {
  it('validates user-supplied shop domains before encrypted credential storage', () => {
    const source = fs.readFileSync('base44/functions/oauthConnector/entry.ts', 'utf8');
    expect(source).toContain('shopPlaceholderIsHostname');
    expect(source).toContain('shop_identifier_invalid');
    expect(source.match(/await validateShopValue\(cfg, rawShopDomain\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain('shopDomain = rawShopDomain.trim().toLowerCase()');
  });

  it('pins every credentialed page to the verified initial origin and refuses redirects', () => {
    const source = fs.readFileSync('base44/functions/dataSyncAgent/entry.ts', 'utf8');
    expect(source).toContain('provider_pagination_origin_mismatch');
    expect(source).toContain('nextUrl = await assertCredentialTarget(nextUrl, credentialOrigin)');
    expect(source).toContain("redirect: 'error'");
    expect(source).toContain('await assertPublicDns(url)');
  });

  it('keeps synthetic demo adapters offline without requiring their reserved hosts to resolve', () => {
    const source = fs.readFileSync('base44/functions/dataSyncAgent/entry.ts', 'utf8');
    expect(source).toContain('if (!cfg.demo_mode) currentUrl = await assertCredentialTarget(currentUrl, null)');
    expect(source).toContain('if (cfg.demo_mode) {');
    expect(source).toContain('raw = demoMockResponse(epKey)');
  });
});
