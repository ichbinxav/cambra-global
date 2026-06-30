import { describe, it, expect } from 'vitest';
import { fetchWithBackoff, createRateState, __internal } from './rateLimit.js';

const { parseRetryAfter, minDelayMs } = __internal;

// Fake Response helper.
function makeRes({ ok = true, status = 200, headers = {} } = {}) {
  const map = new Map(Object.entries(headers));
  return { ok, status, headers: { get: (k) => map.get(k) || null } };
}

describe('parseRetryAfter', () => {
  it('parses integer seconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter('0')).toBe(0);
  });
  it('handles null/empty', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
  });
  it('parses HTTP-date format (absolute future date)', () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(10_000 + 500); // leeway
  });
});

describe('minDelayMs', () => {
  it('rps=4 → 250ms per call', () => {
    expect(minDelayMs({ rps: 4 })).toBe(250);
  });
  it('absent rps → 0', () => {
    expect(minDelayMs({})).toBe(0);
    expect(minDelayMs(null)).toBe(0);
    expect(minDelayMs({ rps: 0 })).toBe(0);
  });
});

describe('fetchWithBackoff — success on first try', () => {
  it('returns response immediately when ok', async () => {
    let calls = 0;
    const fetchFn = async () => { calls++; return makeRes({ ok: true, status: 200 }); };
    const state = createRateState();
    const res = await fetchWithBackoff(fetchFn, null, state, 3);
    expect(res.status).toBe(200);
    expect(calls).toBe(1);
  });

  it('non-retryable 4xx returns immediately (no retry)', async () => {
    let calls = 0;
    const fetchFn = async () => { calls++; return makeRes({ ok: false, status: 401 }); };
    const res = await fetchWithBackoff(fetchFn, null, createRateState(), 3);
    expect(res.status).toBe(401);
    expect(calls).toBe(1);
  });
});

describe('fetchWithBackoff — retries on 429 and 5xx', () => {
  it('retries on 429 until success', async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls++;
      // 1st + 2nd → 429, 3rd → 200.
      if (calls < 3) return makeRes({ ok: false, status: 429, headers: { 'Retry-After': '0' } });
      return makeRes({ ok: true, status: 200 });
    };
    const res = await fetchWithBackoff(fetchFn, null, createRateState(), 3);
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it('retries on 503 until success', async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls++;
      if (calls < 2) return makeRes({ ok: false, status: 503 });
      return makeRes({ ok: true, status: 200 });
    };
    const res = await fetchWithBackoff(fetchFn, null, createRateState(), 3);
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('gives up after maxRetries and returns last response', async () => {
    let calls = 0;
    const fetchFn = async () => { calls++; return makeRes({ ok: false, status: 429, headers: { 'Retry-After': '0' } }); };
    const res = await fetchWithBackoff(fetchFn, null, createRateState(), 2);
    expect(res.status).toBe(429);
    expect(calls).toBe(3); // initial + 2 retries
  });

  it('throws after maxRetries when network error keeps firing', async () => {
    let calls = 0;
    const fetchFn = async () => { calls++; throw new Error('ECONNRESET'); };
    await expect(fetchWithBackoff(fetchFn, null, createRateState(), 2)).rejects.toThrow('ECONNRESET');
    expect(calls).toBe(3);
  });
});

describe('fetchWithBackoff — proactive throttling via rps', () => {
  it('respects min delay between consecutive calls', async () => {
    const cfg = { rps: 10 }; // 100ms per call
    const state = createRateState();
    const fetchFn = async () => makeRes({ ok: true });
    const t0 = Date.now();
    await fetchWithBackoff(fetchFn, cfg, state, 0);
    await fetchWithBackoff(fetchFn, cfg, state, 0);
    const elapsed = Date.now() - t0;
    // Second call must wait ~100ms after the first.
    expect(elapsed).toBeGreaterThanOrEqual(95);
  });

  it('no throttling when rps is absent', async () => {
    const fetchFn = async () => makeRes({ ok: true });
    const state = createRateState();
    const t0 = Date.now();
    await fetchWithBackoff(fetchFn, null, state, 0);
    await fetchWithBackoff(fetchFn, null, state, 0);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(100);
  });
});