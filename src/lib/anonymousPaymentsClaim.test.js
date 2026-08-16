import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  ANONYMOUS_PAYMENTS_BLOCKED_RESPONSE,
  acquireAnonymousPaymentsClaim,
  assertAnonymousPaymentsClaimOwned,
  markAnonymousPaymentsClaimRetryable,
  readCanonicalAnonymousPaymentsResult,
  readCanonicalAnonymousPaymentsSnapshot,
  selectAnonymousPaymentsClaimSession,
  transitionAnonymousPaymentsClaim,
} from '../../base44/shared/anonymousPaymentsClaim.ts';

const SESSION_EMAIL = 'owner@example.com';

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    const actual = row[key];
    return value === null ? actual == null : actual === value;
  });
}

function state(overrides = {}) {
  let row = {
    id: 'payments-session-row-1',
    anon_session_id: '9c4dd490-967f-4d56-bae7-d672651ff32d',
    contact_email: SESSION_EMAIL,
    claim_state: 'UNCLAIMED',
    claim_revision: 0,
    claim_token: null,
    claim_owner: null,
    claim_attempts: 0,
    ...overrides,
  };
  const writes = [];
  const analyzerResults = [];
  const intelligenceSnapshots = [];
  return {
    row: () => structuredClone(row),
    writes,
    analyzerResults,
    intelligenceSnapshots,
    service: {
      entities: {
        PaymentsAnalysisSession: {
          async updateMany(filter, update) {
            await Promise.resolve();
            if (!matches(row, filter)) return { updated: 0 };
            row = { ...row, ...(update.$set || {}) };
            writes.push(structuredClone(update.$set || {}));
            return { updated: 1 };
          },
          async get(id) {
            return id === row.id ? structuredClone(row) : null;
          },
        },
        AnalyzerResult: {
          async get(id) {
            return structuredClone(analyzerResults.find((candidate) => candidate.id === id) || null);
          },
          async filter(filter) {
            return structuredClone(analyzerResults.filter((candidate) => matches(candidate, filter)));
          },
        },
        IntelligenceSnapshot: {
          async get(id) {
            return structuredClone(intelligenceSnapshots.find((candidate) => candidate.id === id) || null);
          },
          async filter(filter) {
            return structuredClone(intelligenceSnapshots.filter((candidate) => matches(candidate, filter)));
          },
        },
      },
    },
  };
}

describe('anonymous payments durable ownership claim', () => {
  it('normalizes the authenticated email and acquires the matching session', async () => {
    const s = state({ contact_email: ' Owner@Example.COM ' });
    const result = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: ' owner@example.com ',
      token: 'claim-token-owner',
      now: new Date('2026-08-13T10:00:00Z'),
    });
    expect(result).toMatchObject({ acquired: true, replay: false });
    expect(s.row()).toMatchObject({
      claim_state: 'CLAIMED',
      claim_revision: 1,
      claim_token: 'claim-token-owner',
      claim_owner: SESSION_EMAIL,
    });
  });

  it.each([
    ['different authenticated email', { contact_email: SESSION_EMAIL }, 'other@example.com'],
    ['missing session email', { contact_email: '', input_snapshot: {} }, SESSION_EMAIL],
  ])('blocks %s without any durable mutation', async (_name, session, authenticatedEmail) => {
    const s = state(session);
    const before = s.row();
    await expect(acquireAnonymousPaymentsClaim(s.service, before, {
      authenticated_email: authenticatedEmail,
      token: 'must-not-land',
    })).resolves.toEqual({ acquired: false, reason: 'claim_not_available' });
    expect(s.row()).toEqual(before);
    expect(s.writes).toHaveLength(0);
  });

  it('returns the identical non-enumerable contract for missing UUID, wrong email and missing session email', () => {
    const valid = {
      id: 'session-row',
      contact_email: SESSION_EMAIL,
      engine_result: { ok: true },
    };
    const responses = [
      selectAnonymousPaymentsClaimSession([], SESSION_EMAIL),
      selectAnonymousPaymentsClaimSession([valid], 'other@example.com'),
      selectAnonymousPaymentsClaimSession([{ ...valid, contact_email: '' }], SESSION_EMAIL),
    ];
    expect(responses.every((result) => result.eligible === false)).toBe(true);
    expect(responses.map((result) => result.response)).toEqual([
      ANONYMOUS_PAYMENTS_BLOCKED_RESPONSE,
      ANONYMOUS_PAYMENTS_BLOCKED_RESPONSE,
      ANONYMOUS_PAYMENTS_BLOCKED_RESPONSE,
    ]);
  });

  it('allows exactly one winner when two users race the same UUID', async () => {
    const s = state();
    const snapshot = s.row();
    const [owner, loser] = await Promise.all([
      acquireAnonymousPaymentsClaim(s.service, snapshot, {
        authenticated_email: SESSION_EMAIL,
        token: 'winner-token',
      }),
      acquireAnonymousPaymentsClaim(s.service, snapshot, {
        authenticated_email: 'loser@example.com',
        token: 'loser-token',
      }),
    ]);
    expect(owner.acquired).toBe(true);
    expect(loser).toEqual({ acquired: false, reason: 'claim_not_available' });
    expect(s.row()).toMatchObject({
      claim_owner: SESSION_EMAIL,
      claim_token: 'winner-token',
      claim_revision: 1,
    });
    expect(s.writes).toHaveLength(1);
  });

  it('fails closed on an inconsistent unclaimed authority row', async () => {
    const s = state({ claim_owner: SESSION_EMAIL, claim_token: 'orphan-token' });
    await expect(acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: SESSION_EMAIL,
    })).rejects.toMatchObject({
      code: 'ANONYMOUS_PAYMENTS_UNCLAIMED_BINDING_AUTHORITY_UNAVAILABLE',
    });
    expect(s.writes).toHaveLength(0);
  });

  it('returns a resumable replay only to the canonical owner', async () => {
    const s = state();
    const won = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: SESSION_EMAIL,
      token: 'winner-token',
    });
    const replay = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: ' OWNER@EXAMPLE.COM ',
      token: 'ignored-replay-token',
    });
    const loser = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: 'loser@example.com',
      token: 'loser-token',
    });
    expect(won.acquired).toBe(true);
    expect(replay).toMatchObject({
      acquired: false,
      replay: true,
      claim: { owner: SESSION_EMAIL, token: 'winner-token', revision: 1 },
    });
    expect(loser).toEqual({ acquired: false, reason: 'claim_not_available' });
    expect(s.row().claim_token).toBe('winner-token');
  });

  it('keeps a fresh materialization single-owner and fences a stale attempt on recovery', async () => {
    const s = state();
    const won = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: SESSION_EMAIL,
      token: 'winner-token',
      now: new Date('2026-08-13T10:00:00Z'),
    });
    const materializing = await transitionAnonymousPaymentsClaim(s.service, won.claim, {
      from: 'CLAIMED',
      to: 'MATERIALIZING',
      now: new Date('2026-08-13T10:00:01Z'),
    });
    const freshReplay = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: SESSION_EMAIL,
      now: new Date('2026-08-13T10:01:00Z'),
    });
    expect(freshReplay).toMatchObject({
      replay: true,
      in_progress: true,
      materialization_stale: false,
    });

    const staleReplay = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: SESSION_EMAIL,
      now: new Date('2026-08-13T10:06:00Z'),
    });
    expect(staleReplay).toMatchObject({
      replay: true,
      in_progress: false,
      materialization_stale: true,
    });
    const recovered = await transitionAnonymousPaymentsClaim(s.service, staleReplay.claim, {
      from: 'MATERIALIZING',
      to: 'RECONCILE_REQUIRED',
      now: new Date('2026-08-13T10:06:00Z'),
    });
    expect(recovered.ok).toBe(true);
    await expect(
      assertAnonymousPaymentsClaimOwned(s.service, materializing.claim),
    ).rejects.toMatchObject({ code: 'ANONYMOUS_PAYMENTS_CLAIM_FENCE_LOST' });
    expect(s.row()).toMatchObject({
      claim_owner: SESSION_EMAIL,
      claim_token: 'winner-token',
      claim_state: 'RECONCILE_REQUIRED',
    });
  });

  it('preserves owner/token and becomes retryable after failure before AnalyzerResult', async () => {
    const s = state();
    const won = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: SESSION_EMAIL,
      token: 'winner-token',
    });
    const failed = await markAnonymousPaymentsClaimRetryable(
      s.service,
      won.claim,
      'fault_before_analyzer_result',
    );
    expect(failed.ok).toBe(true);
    expect(s.row()).toMatchObject({
      claim_state: 'RECONCILE_REQUIRED',
      claim_revision: 2,
      claim_owner: SESSION_EMAIL,
      claim_token: 'winner-token',
      claim_error_code: 'fault_before_analyzer_result',
    });
  });

  it('resumes after a local result write and binds the canonical result once', async () => {
    const s = state();
    const won = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: SESSION_EMAIL,
      token: 'winner-token',
    });
    const materializing = await transitionAnonymousPaymentsClaim(s.service, won.claim, {
      from: 'CLAIMED',
      to: 'MATERIALIZING',
      patch: { claim_brand_id: 'brand-winner' },
    });
    s.analyzerResults.push({
      id: 'analyzer-result-winner',
      brand_id: 'brand-winner',
      created_by: SESSION_EMAIL,
      anonymous_claim_session_id: s.row().id,
      anonymous_claim_token: 'winner-token',
      anonymous_claim_owner: SESSION_EMAIL,
    });
    const afterLocalWriteFailure = await markAnonymousPaymentsClaimRetryable(
      s.service,
      materializing.claim,
      'fault_after_result_create_before_session_bind',
    );
    const resumed = await transitionAnonymousPaymentsClaim(
      s.service,
      afterLocalWriteFailure.claim,
      {
        from: 'RECONCILE_REQUIRED',
        to: 'MATERIALIZING',
        patch: { claim_analyzer_result_id: 'analyzer-result-winner' },
      },
    );
    const recoveredResult = await readCanonicalAnonymousPaymentsResult(
      s.service,
      resumed.session,
      resumed.claim,
    );
    expect(resumed.ok).toBe(true);
    expect(recoveredResult.id).toBe('analyzer-result-winner');
    expect(s.analyzerResults).toHaveLength(1);
    expect(s.row()).toMatchObject({
      claim_analyzer_result_id: 'analyzer-result-winner',
      claim_owner: SESSION_EMAIL,
      claim_token: 'winner-token',
      claim_state: 'MATERIALIZING',
    });
  });

  it('fences a loser from modifying winner materialization or snapshot state', async () => {
    const s = state();
    const won = await acquireAnonymousPaymentsClaim(s.service, s.row(), {
      authenticated_email: SESSION_EMAIL,
      token: 'winner-token',
    });
    const forged = { ...won.claim, owner: 'loser@example.com', token: 'loser-token' };
    await expect(assertAnonymousPaymentsClaimOwned(s.service, forged)).rejects.toMatchObject({
      code: 'ANONYMOUS_PAYMENTS_CLAIM_FENCE_LOST',
    });
    await expect(transitionAnonymousPaymentsClaim(s.service, forged, {
      from: 'CLAIMED',
      to: 'MATERIALIZING',
      patch: { claim_intelligence_snapshot_id: 'loser-snapshot' },
    })).resolves.toEqual({ ok: false, reason: 'claim_fence_lost' });
    expect(s.row().claim_intelligence_snapshot_id).toBeUndefined();
    expect(s.row().claim_owner).toBe(SESSION_EMAIL);
  });

  it('recovers the winner snapshot by canonical claim and rejects cross-tenant binding', async () => {
    const s = state({
      claim_state: 'MATERIALIZING',
      claim_revision: 3,
      claim_token: 'winner-token',
      claim_owner: SESSION_EMAIL,
      claim_brand_id: 'brand-winner',
      claim_analyzer_result_id: 'analyzer-result-winner',
    });
    const claim = {
      session_id: s.row().id,
      token: 'winner-token',
      owner: SESSION_EMAIL,
      revision: 3,
      state: 'MATERIALIZING',
    };
    const result = {
      id: 'analyzer-result-winner',
      brand_id: 'brand-winner',
      created_by: SESSION_EMAIL,
      anonymous_claim_session_id: s.row().id,
      anonymous_claim_token: 'winner-token',
      anonymous_claim_owner: SESSION_EMAIL,
    };
    s.intelligenceSnapshots.push({
      id: 'snapshot-winner',
      related_entity_id: result.id,
      brand_id: result.brand_id,
      anonymous_claim_session_id: s.row().id,
      anonymous_claim_token: 'winner-token',
      anonymous_claim_owner: SESSION_EMAIL,
    });
    await expect(readCanonicalAnonymousPaymentsSnapshot(
      s.service,
      s.row(),
      claim,
      result,
    )).resolves.toMatchObject({ id: 'snapshot-winner', brand_id: 'brand-winner' });

    const crossTenant = structuredClone(s.intelligenceSnapshots[0]);
    crossTenant.brand_id = 'brand-loser';
    s.intelligenceSnapshots.splice(0, 1, crossTenant);
    await expect(readCanonicalAnonymousPaymentsSnapshot(
      s.service,
      s.row(),
      claim,
      result,
    )).rejects.toThrow('anonymous_claim_snapshot_binding_mismatch');
  });

  it('keeps missing UUID, wrong email and missing session email non-enumerable at the function boundary', () => {
    const source = fs.readFileSync('base44/functions/claimAnonPaymentsResult/entry.ts', 'utf8');
    const helper = fs.readFileSync('base44/shared/anonymousPaymentsClaim.ts', 'utf8');
    expect(helper).toContain('claim_not_available');
    expect(source).not.toContain("error: 'session_not_found'");
    expect(source).not.toContain("error: 'already_claimed'");
    expect(source).not.toContain('pickWinner');
    expect(source).not.toContain('AnalyzerResult.delete');
    expect(source).not.toContain('create-then-oldest');
    expect(source).not.toContain("filter({ anon_session_id }, '-created_date', 20)");
  });

  it('wires durable session claim before Brand, AnalyzerResult and winner-only snapshot effects', () => {
    const source = fs.readFileSync('base44/functions/claimAnonPaymentsResult/entry.ts', 'utf8');
    const helper = fs.readFileSync('base44/shared/anonymousPaymentsClaim.ts', 'utf8');
    const schema = JSON.parse(fs.readFileSync('base44/entities/PaymentsAnalysisSession.jsonc', 'utf8'));
    const analyzer = JSON.parse(fs.readFileSync('base44/entities/AnalyzerResult.jsonc', 'utf8'));
    const snapshot = JSON.parse(fs.readFileSync('base44/entities/IntelligenceSnapshot.jsonc', 'utf8'));
    const claimIndex = source.indexOf('await acquireAnonymousPaymentsClaim');
    expect(claimIndex).toBeGreaterThan(0);
    for (const effect of [
      'base44.entities.Brand.create',
      'base44.entities.AnalyzerResult.create',
      'service.entities.IntelligenceSnapshot.create',
    ]) expect(claimIndex).toBeLessThan(source.indexOf(effect));
    expect(source).toContain('await assertAnonymousPaymentsClaimOwned');
    expect(helper).toContain('anonymous_claim_snapshot_binding_mismatch');
    expect(helper).toContain('anonymous_claim_result_binding_mismatch');
    for (const field of [
      'claim_state',
      'claim_revision',
      'claim_token',
      'claim_owner',
      'claim_analyzer_result_id',
      'claim_brand_id',
      'claim_intelligence_snapshot_id',
    ]) expect(schema.properties[field]).toBeTruthy();
    for (const field of [
      'anonymous_claim_session_id',
      'anonymous_claim_token',
      'anonymous_claim_owner',
    ]) {
      expect(analyzer.properties[field]).toBeTruthy();
      expect(snapshot.properties[field]).toBeTruthy();
    }
    expect(snapshot.rls.write.user_condition.role).toBe('admin');
  });
});
