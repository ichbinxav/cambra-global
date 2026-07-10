import { describe, it, expect } from 'vitest';
import { normalizeEmail, checkOwnership } from './tenantGuard.js';

describe('tenantGuard — normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Foo@Bar.com  ')).toBe('foo@bar.com');
  });
  it('returns empty string for non-strings', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(42)).toBe('');
    expect(normalizeEmail({})).toBe('');
  });
});

describe('tenantGuard — checkOwnership', () => {
  const brand = { created_by: 'xavi@cambra.global' };

  it('accepts the owner (exact match)', () => {
    const res = checkOwnership({ email: 'xavi@cambra.global' }, brand);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.owner_email).toBe('xavi@cambra.global');
  });

  it('accepts the owner despite casing/whitespace drift on either side', () => {
    const res = checkOwnership({ email: '  Xavi@Cambra.Global  ' }, brand);
    expect(res.ok).toBe(true);
  });

  it('rejects a stranger (authenticated, wrong brand)', () => {
    const res = checkOwnership({ email: 'stranger@example.com' }, brand);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_owner');
  });

  it('rejects an anonymous caller (no user)', () => {
    const res = checkOwnership(null, brand);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('no_user');
  });

  it('rejects a user object with no email', () => {
    const res = checkOwnership({}, brand);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('no_user');
  });

  it('rejects a missing brand', () => {
    const res = checkOwnership({ email: 'xavi@cambra.global' }, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('no_brand');
  });

  it('rejects a brand with no created_by', () => {
    const res = checkOwnership({ email: 'xavi@cambra.global' }, {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('no_brand');
  });

  it('does NOT accept a service-role brand as owned by any human', () => {
    // Regression: service-created brands must never accidentally match a
    // human user just because the strings share a prefix.
    const serviceBrand = { created_by: 'service+ed332dd1-1b57-4179-8ef0-925fee70df46@no-reply.base44.com' };
    const res = checkOwnership({ email: 'xavi@cambra.global' }, serviceBrand);
    expect(res.ok).toBe(false);
  });
});