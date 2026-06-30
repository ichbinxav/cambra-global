// ─── Tests for pagination styles ────────────────────────────────────────────
// Lock the contract for each style. If the Deno copy in dataSyncAgent diverges,
// these tests in the source-of-truth module remain green; the engineer must
// realign the copy manually (same pattern as stripe.js).

import { describe, it, expect } from 'vitest';
import { getPaginator, __internal } from './paginators.js';

const { cursorStripe, cursorHalBody, pageNumber, linkHeader, offsetLimit, nullPaginator } = __internal;

describe('getPaginator — lookup', () => {
  it('returns the cursor_stripe paginator', () => {
    expect(getPaginator('cursor_stripe')).toBe(cursorStripe);
  });
  it('returns the cursor_hal_body paginator', () => {
    expect(getPaginator('cursor_hal_body')).toBe(cursorHalBody);
  });
  it('returns the page_number paginator', () => {
    expect(getPaginator('page_number')).toBe(pageNumber);
  });
  it('unknown style falls back to nullPaginator (graceful)', () => {
    expect(getPaginator('does_not_exist')).toBe(nullPaginator);
  });
  it('no style → nullPaginator (legacy single-fetch behaviour)', () => {
    expect(getPaginator(undefined)).toBe(nullPaginator);
    expect(getPaginator(null)).toBe(nullPaginator);
  });
});

describe('cursorStripe — Stripe has_more + starting_after', () => {
  const url = 'https://api.stripe.com/v1/balance_transactions';
  it('continues when has_more=true and emits starting_after=<last_id>', () => {
    const raw = { has_more: true, data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
    const { nextUrl, nextCursor } = cursorStripe(raw, null, url, {});
    expect(nextCursor).toBe('c');
    expect(nextUrl).toContain('starting_after=c');
  });
  it('stops when has_more=false', () => {
    const raw = { has_more: false, data: [{ id: 'a' }] };
    expect(cursorStripe(raw, null, url, {})).toEqual({ nextUrl: null, nextCursor: null });
  });
  it('stops when data is empty even if has_more=true (defensive)', () => {
    const raw = { has_more: true, data: [] };
    expect(cursorStripe(raw, null, url, {})).toEqual({ nextUrl: null, nextCursor: null });
  });
  it('stops when last item has no id', () => {
    const raw = { has_more: true, data: [{ foo: 'bar' }] };
    expect(cursorStripe(raw, null, url, {})).toEqual({ nextUrl: null, nextCursor: null });
  });
  it('replaces existing starting_after rather than duplicating', () => {
    const seeded = url + '?starting_after=x&limit=100';
    const raw = { has_more: true, data: [{ id: 'z' }] };
    const { nextUrl } = cursorStripe(raw, null, seeded, {});
    // Only one starting_after, and it's the new value.
    const matches = nextUrl.match(/starting_after=/g) || [];
    expect(matches.length).toBe(1);
    expect(nextUrl).toContain('starting_after=z');
    expect(nextUrl).toContain('limit=100'); // preserves other params
  });
});

describe('cursorHalBody — Mollie HAL _links.next', () => {
  it('follows _links.next.href', () => {
    const raw = { _links: { next: { href: 'https://api.mollie.com/v2/settlements?from=abc' } }, _embedded: { settlements: [{ id: '1' }] } };
    const { nextUrl, nextCursor } = cursorHalBody(raw, null, 'https://api.mollie.com/v2/settlements', {});
    expect(nextUrl).toBe('https://api.mollie.com/v2/settlements?from=abc');
    expect(nextCursor).toBe('https://api.mollie.com/v2/settlements?from=abc');
  });
  it('stops when _links.next is null', () => {
    const raw = { _links: { next: null }, _embedded: { settlements: [] } };
    expect(cursorHalBody(raw, null, 'x', {})).toEqual({ nextUrl: null, nextCursor: null });
  });
  it('stops when _links is missing entirely', () => {
    expect(cursorHalBody({}, null, 'x', {})).toEqual({ nextUrl: null, nextCursor: null });
  });
  it('stops when _links.next.href is not a string', () => {
    expect(cursorHalBody({ _links: { next: { href: 42 } } }, null, 'x', {})).toEqual({ nextUrl: null, nextCursor: null });
  });
});

describe('pageNumber — ?page=N + per_page=<size>', () => {
  const url = 'https://api.payplug.com/v1/payments?page=1&per_page=100';
  const cfg = { page_param: 'page', size_param: 'per_page', page_size: 100, array_root: 'data' };

  it('continues to page 2 when current page is full', () => {
    const raw = { data: new Array(100).fill({ id: 'x' }) };
    const { nextUrl, nextCursor } = pageNumber(raw, null, url, cfg);
    expect(nextCursor).toBe('2');
    expect(nextUrl).toContain('page=2');
    expect(nextUrl).toContain('per_page=100');
  });

  it('stops when current page is shorter than page_size (last page)', () => {
    const raw = { data: new Array(37).fill({ id: 'x' }) };
    expect(pageNumber(raw, null, url, cfg)).toEqual({ nextUrl: null, nextCursor: null });
  });

  it('stops on empty page', () => {
    expect(pageNumber({ data: [] }, null, url, cfg)).toEqual({ nextUrl: null, nextCursor: null });
  });

  it('falls back to raw.data when array_root is not declared', () => {
    const cfgNoRoot = { page_param: 'page', size_param: 'per_page', page_size: 100 };
    const raw = { data: new Array(100).fill({}) };
    const r = pageNumber(raw, null, url, cfgNoRoot);
    expect(r.nextUrl).toContain('page=2');
  });

  it('handles a bare-array response (no wrapping object)', () => {
    const cfgArrRoot = { page_param: 'page', size_param: 'per_page', page_size: 100 };
    const raw = new Array(100).fill({ id: 'y' });
    const r = pageNumber(raw, null, url, cfgArrRoot);
    expect(r.nextUrl).toContain('page=2');
  });
});

describe('linkHeader — hook, parsing only', () => {
  const headers = (h) => ({ get: (name) => h[name.toLowerCase()] || null });
  it('extracts next URL from Link header', () => {
    const h = headers({ link: '<https://api.x/orders?page=3>; rel="next", <https://api.x/orders?page=1>; rel="prev"' });
    const { nextUrl } = linkHeader({}, h, 'irrelevant', {});
    expect(nextUrl).toBe('https://api.x/orders?page=3');
  });
  it('returns no-next when no rel=next is present', () => {
    const h = headers({ link: '<https://api.x/orders?page=1>; rel="prev"' });
    expect(linkHeader({}, h, 'x', {})).toEqual({ nextUrl: null, nextCursor: null });
  });
  it('handles unquoted rel=next', () => {
    const h = headers({ link: '<https://api.x/orders?page=3>; rel=next' });
    expect(linkHeader({}, h, 'x', {}).nextUrl).toBe('https://api.x/orders?page=3');
  });
});

describe('offsetLimit — hook, paging arithmetic', () => {
  const cfg = { offset_param: 'offset', limit_param: 'limit', page_size: 100, array_root: 'objects' };
  it('advances offset by page_size', () => {
    const raw = { objects: new Array(100).fill({}) };
    const r = offsetLimit(raw, null, 'https://api.x/v1/Voucher?offset=0&limit=100', cfg);
    expect(r.nextUrl).toContain('offset=100');
    expect(r.nextCursor).toBe('100');
  });
  it('stops on a short page', () => {
    const raw = { objects: new Array(20).fill({}) };
    expect(offsetLimit(raw, null, 'https://api.x/v1/Voucher?offset=0&limit=100', cfg)).toEqual({ nextUrl: null, nextCursor: null });
  });
});

describe('nullPaginator — legacy single-fetch behaviour', () => {
  it('always returns no-more-pages', () => {
    expect(nullPaginator({}, null, 'x', {})).toEqual({ nextUrl: null, nextCursor: null });
  });
});