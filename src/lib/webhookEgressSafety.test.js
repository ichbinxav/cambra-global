import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('webhook egress safety', () => {
  for (const name of ['dispatchWebhook', 'processWebhookDeadLetters']) {
    it(`${name} routes delivery through public HTTPS validation`, () => {
      const source = fs.readFileSync(`base44/functions/${name}/entry.ts`, 'utf8');
      expect(source).toContain('fetchPublicHttps');
      expect(source).toContain('webhook_redirect_forbidden');
      expect(source).toContain('maxRedirects: 0');
      expect(source).not.toMatch(/await\s+fetch\(\s*(?:webhook|endpoint)\.url/);
    });
  }

  it('keeps the legacy admin test endpoint quarantined with zero provider effect', () => {
    const source = fs.readFileSync('base44/functions/sendTestWebhook/entry.ts', 'utf8');
    expect(source).toContain('SEND_TEST_WEBHOOK_MATERIAL_EFFECT_AUTHORITY_REQUIRED');
    expect(source).toContain('send_test_webhook_quarantined');
    expect(source).toContain('provider_effect_started: false');
    expect(source).toContain('retry_allowed: false');
    expect(source).toContain('{ status: 410 }');
    expect(source).not.toContain('fetchPublicHttps');
    expect(source).not.toContain('WebhookDelivery.create');
  });
});
