import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireAdminOrInternal } from '../../base44/shared/internalGate.ts';

afterEach(() => vi.unstubAllGlobals());

const request = () => new Request('https://example.test/material-route');

async function denialFor(user) {
  const gate = await requireAdminOrInternal(request(), {
    auth: { me: vi.fn().mockResolvedValue(user) },
  });
  return { status: gate.response.status, body: await gate.response.text() };
}

describe('material route actor authorization gate', () => {
  it('returns a byte-equivalent non-enumerable denial for a non-admin and an unknown actor', async () => {
    vi.stubGlobal('Deno', { env: { get: vi.fn().mockReturnValue('') } });
    const nonAdmin = await denialFor({ email: 'merchant@example.test', role: 'user' });
    const unknown = await denialFor(null);
    expect(nonAdmin).toEqual({ status: 403, body: JSON.stringify({ error: 'forbidden' }) });
    expect(unknown).toEqual(nonAdmin);
  });

  it('fails closed and distinguishably when authentication authority is unavailable', async () => {
    vi.stubGlobal('Deno', { env: { get: vi.fn().mockReturnValue('') } });
    const gate = await requireAdminOrInternal(request(), {
      auth: { me: vi.fn().mockRejectedValue(new Error('authority_down')) },
    });
    expect(gate.ok).toBe(false);
    expect(gate.response.status).toBe(503);
    await expect(gate.response.json()).resolves.toEqual({ error: 'auth_authority_unavailable' });
  });
});
