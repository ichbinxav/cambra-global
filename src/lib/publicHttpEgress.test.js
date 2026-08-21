import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchPublicHttps,
  isPublicIpAddress,
  normalizePublicHttpsUrl,
} from '../../base44/shared/publicHttpEgress.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('public HTTPS egress boundary', () => {
  it('rejects localhost, credentials, non-HTTPS, non-standard ports and private/reserved IPs', () => {
    const blocked = [
      'http://example.com', 'https://localhost', 'https://svc.internal',
      'https://user:pass@example.com', 'https://example.com:8443',
      'https://example.com/?email=person@example.test',
      'https://example.com/#reset-token',
      'https://127.0.0.1', 'https://10.0.0.1', 'https://169.254.169.254',
      'https://192.168.1.2', 'https://[::1]', 'https://[fd00::1]', 'https://[fe80::1]',
    ];
    for (const url of blocked) expect(() => normalizePublicHttpsUrl(url), url).toThrow();
  });

  it('classifies representative public and non-public addresses conservatively', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIpAddress('100.64.0.1')).toBe(false);
    expect(isPublicIpAddress('203.0.113.1')).toBe(false);
    expect(isPublicIpAddress('::ffff:127.0.0.1')).toBe(false);
  });

  it('checks DNS before fetch and revalidates every redirect target', async () => {
    const fetchImpl = vi.fn(async () => new Response('', {
      status: 302,
      headers: { location: 'https://169.254.169.254/latest/meta-data' },
    }));
    await expect(fetchPublicHttps('https://public.example/start', {}, {
      fetchImpl,
      resolver: async () => ['93.184.216.34'],
    })).rejects.toThrow('public_url_private_address_forbidden');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('blocks a hostname whose DNS set contains any private answer', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchPublicHttps('https://public.example', {}, {
      fetchImpl,
      resolver: async () => ['93.184.216.34', '10.0.0.8'],
    })).rejects.toThrow('public_dns_private_or_ambiguous');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses redirect manual and returns a verified public response', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init.redirect).toBe('manual');
      return new Response('<html>ok</html>', { status: 200 });
    });
    const result = await fetchPublicHttps('example.com', {}, {
      fetchImpl,
      resolver: async () => ['93.184.216.34'],
    });
    expect(result.finalUrl).toBe('https://example.com/');
    expect(result.response.status).toBe(200);
  });

  it('forces the infrastructure scanner through the canonical egress guard', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'base44/functions/discoverCompanyInfrastructure/entry.ts'),
      'utf8',
    );
    expect(src).toContain('fetchPublicHttps');
    expect(src).not.toMatch(/fetch\(url[\s\S]{0,120}redirect:\s*['"]follow/);
    expect(src.indexOf('requireOwnedBrand')).toBeLessThan(src.indexOf('entities.DiscoveryJob.create'));
    expect(src).toContain('isEligibleDiscoveryHttpResponse');
    expect(src).not.toContain('fetchErr.message');
    const b1 = fs.readFileSync(
      path.join(ROOT, 'base44/functions/discoveryTechStackAgent/entry.ts'),
      'utf8',
    );
    expect(b1).toContain('normalizePublicHttpsUrl(website_url)');
    expect(b1).not.toContain('claudeErr.message');
    expect(b1).not.toContain('error.message');
  });
});
