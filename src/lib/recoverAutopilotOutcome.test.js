import { describe, expect, it } from 'vitest';
import {
  classifyRecoverChildOutcome,
  decodeRecoverInvocationError,
} from '../../base44/shared/recoverAutopilotOutcome.ts';

describe('Recover autopilot child outcomes', () => {
  it('decodes the Base44 error body instead of replacing it with Axios text', () => {
    const decoded = decodeRecoverInvocationError({
      message: 'Request failed with status code 409',
      response: {
        status: 409,
        data: JSON.stringify({ data: { ok: false, error: 'legal_identity_missing' } }),
      },
    });
    expect(decoded).toMatchObject({
      ok: false,
      error: 'legal_identity_missing',
      http_status: 409,
    });
  });

  it('classifies explicit pre-effect policy blocks as waiting input', () => {
    expect(classifyRecoverChildOutcome({
      ok: false,
      http_status: 409,
      failed: 1,
      results: [{ ok: false, error: 'report_not_approved' }],
    })).toMatchObject({ state: 'WAITING_INPUT', review_required: true });
  });

  it('keeps provider ambiguity and server errors as hard failures', () => {
    expect(classifyRecoverChildOutcome({
      ok: false,
      http_status: 409,
      failed: 1,
      results: [{ ok: false, error: 'recover_invoice_effect_unknown_review_required' }],
    })).toMatchObject({ state: 'FAILED', review_required: false });
    expect(classifyRecoverChildOutcome({
      ok: false,
      error: 'reconciliation_failed',
      http_status: 500,
    })).toMatchObject({ state: 'FAILED', review_required: false });
  });
});

