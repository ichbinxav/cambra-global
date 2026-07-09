import { describe, it, expect } from 'vitest';
import { computeSyncWindow, applyDateRangeToUrl, CURSOR_READ_OVERLAP_MS } from './dateRange.js';

describe('computeSyncWindow — backfill vs incremental', () => {
  const NOW = new Date('2026-06-30T12:00:00Z');

  it('first sync (no last_synced_until) → 12 months back', () => {
    const { since, until } = computeSyncWindow({ lastSyncedUntil: null, now: NOW });
    expect(until.toISOString()).toBe(NOW.toISOString());
    // ~365 days back
    const days = Math.round((until - since) / (24 * 3600 * 1000));
    expect(days).toBe(365);
  });

  it('incremental → since = last_synced_until MINUS 24h overlap (BUG-4 fix)', () => {
    // Stored cursor = true high-water mark. Read applies 24h overlap
    // to absorb provider settlement delay (e.g. Stripe backdates).
    const last = '2026-05-01T00:00:00.000Z';
    const { since, until } = computeSyncWindow({ lastSyncedUntil: last, now: NOW });
    const expectedSince = new Date(new Date(last).getTime() - CURSOR_READ_OVERLAP_MS);
    expect(since.toISOString()).toBe(expectedSince.toISOString());
    expect(until.toISOString()).toBe(NOW.toISOString());
  });

  it('overlap constant is 24 hours', () => {
    expect(CURSOR_READ_OVERLAP_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('garbage last_synced_until → falls back to 12-month backfill (defensive)', () => {
    const { since } = computeSyncWindow({ lastSyncedUntil: 'not a date', now: NOW });
    const days = Math.round((NOW - since) / (24 * 3600 * 1000));
    expect(days).toBe(365);
  });

  it('always returns UTC ISO timestamps', () => {
    const { since, until } = computeSyncWindow({ lastSyncedUntil: null, now: NOW });
    expect(since.toISOString()).toMatch(/Z$/);
    expect(until.toISOString()).toMatch(/Z$/);
  });
});

describe('applyDateRangeToUrl — query param injection', () => {
  const window = {
    since: new Date('2026-01-01T00:00:00Z'),
    until: new Date('2026-06-30T12:00:00Z'),
  };

  it('no cfg → URL unchanged', () => {
    expect(applyDateRangeToUrl('https://api.x/v1/things', null, window))
      .toBe('https://api.x/v1/things');
  });

  it('injects unix-second timestamps (Stripe-style)', () => {
    const cfg = { since_param: 'created[gte]', until_param: 'created[lte]', format: 'unix' };
    const out = applyDateRangeToUrl('https://api.stripe.com/v1/balance_transactions', cfg, window);
    expect(out).toContain(`created%5Bgte%5D=${Math.floor(window.since.getTime() / 1000)}`);
    expect(out).toContain(`created%5Blte%5D=${Math.floor(window.until.getTime() / 1000)}`);
  });

  it('injects ISO timestamps when format=iso', () => {
    const cfg = { since_param: 'from', until_param: 'until', format: 'iso' };
    const out = applyDateRangeToUrl('https://api.mollie.com/v2/settlements', cfg, window);
    expect(out).toContain(`from=${encodeURIComponent(window.since.toISOString())}`);
    expect(out).toContain(`until=${encodeURIComponent(window.until.toISOString())}`);
  });

  it('injects YYYY-MM-DD when format=iso_date', () => {
    const cfg = { since_param: 'start_date', until_param: 'end_date', format: 'iso_date' };
    const out = applyDateRangeToUrl('https://api.x/payments', cfg, window);
    expect(out).toContain('start_date=2026-01-01');
    expect(out).toContain('end_date=2026-06-30');
  });

  it('supports since-only (no until_param)', () => {
    const cfg = { since_param: 'after', format: 'iso' };
    const out = applyDateRangeToUrl('https://api.x/orders', cfg, window);
    expect(out).toContain('after=');
    expect(out).not.toContain('until=');
  });

  it('preserves other existing query params', () => {
    const cfg = { since_param: 'created[gte]', format: 'unix' };
    const out = applyDateRangeToUrl('https://api.stripe.com/v1/balance_transactions?limit=100', cfg, window);
    expect(out).toContain('limit=100');
    expect(out).toContain('created%5Bgte%5D=');
  });
});