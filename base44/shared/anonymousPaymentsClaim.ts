export const ANONYMOUS_PAYMENTS_CLAIM_VERSION = "anonymous-payments-claim-cas-1.0.0";
export const ANONYMOUS_PAYMENTS_MATERIALIZATION_LEASE_MS = 5 * 60_000;

export const ANONYMOUS_PAYMENTS_BLOCKED_RESPONSE = Object.freeze({
  ok: false,
  error: "claim_not_available",
});

const CLAIMED_STATES = new Set([
  "CLAIMED",
  "MATERIALIZING",
  "RECONCILE_REQUIRED",
  "COMPLETED",
]);

type ClaimMutationOutcome =
  | "updated"
  | "conflict"
  | "authority_unavailable"
  | "authority_ambiguous";

function mutationOutcome(result: any): ClaimMutationOutcome {
  if (!result || typeof result !== "object") return "authority_unavailable";
  const counts = [result.updated, result.modified_count, result.matched_count]
    .filter((value) => value !== undefined && value !== null)
    .map(Number);
  if (!counts.length || counts.some((value) => !Number.isInteger(value) || value < 0)) {
    return "authority_unavailable";
  }
  if (new Set(counts).size !== 1 || counts[0] > 1) return "authority_ambiguous";
  return counts[0] === 1 ? "updated" : "conflict";
}

function authorityError(operation: string, outcome: ClaimMutationOutcome, cause?: unknown) {
  const suffix = outcome === "authority_ambiguous"
    ? "AUTHORITY_AMBIGUOUS"
    : "AUTHORITY_UNAVAILABLE";
  return Object.assign(
    new Error(`anonymous_payments_${operation}_${suffix.toLowerCase()}`),
    {
      code: `ANONYMOUS_PAYMENTS_${operation.toUpperCase()}_${suffix}`,
      status: 503,
      retryable: true,
      cause,
    },
  );
}

async function mutate(
  service: any,
  operation: string,
  filter: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  let result: any;
  try {
    result = await service.entities.PaymentsAnalysisSession.updateMany(
      filter,
      { $set: patch },
    );
  } catch (error) {
    throw authorityError(operation, "authority_unavailable", error);
  }
  const outcome = mutationOutcome(result);
  if (outcome === "authority_unavailable" || outcome === "authority_ambiguous") {
    throw authorityError(operation, outcome);
  }
  return outcome;
}

export function normalizeAnonymousClaimEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function selectAnonymousPaymentsClaimSession(
  rows: unknown,
  authenticatedEmail: string,
) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    return { eligible: false, response: ANONYMOUS_PAYMENTS_BLOCKED_RESPONSE };
  }
  const session = rows[0];
  const normalizedAuthenticatedEmail = normalizeAnonymousClaimEmail(authenticatedEmail);
  const normalizedSessionEmail = normalizeAnonymousClaimEmail(
    session?.contact_email || session?.input_snapshot?.email,
  );
  if (
    !normalizedAuthenticatedEmail ||
    !normalizedSessionEmail ||
    normalizedSessionEmail !== normalizedAuthenticatedEmail ||
    !session?.engine_result ||
    session.engine_result.ok !== true
  ) return { eligible: false, response: ANONYMOUS_PAYMENTS_BLOCKED_RESPONSE };
  return { eligible: true, session, normalized_email: normalizedAuthenticatedEmail };
}

function requireRevision(row: any) {
  const revision = Number(row?.claim_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw authorityError("claim_revision", "authority_unavailable");
  }
  return revision;
}

function claimState(row: any) {
  return String(row?.claim_state || "UNCLAIMED").toUpperCase();
}

function claimFromRow(row: any) {
  return {
    session_id: String(row.id),
    token: String(row.claim_token || ""),
    owner: normalizeAnonymousClaimEmail(row.claim_owner),
    revision: requireRevision(row),
    state: claimState(row),
  };
}

function nullableClaimValue(value: unknown) {
  return value === undefined || value === null || value === "" ? null : value;
}

async function readSession(service: any, sessionId: string) {
  try {
    return await service.entities.PaymentsAnalysisSession.get(sessionId);
  } catch (error) {
    throw authorityError("read", "authority_unavailable", error);
  }
}

async function initializeHistoricalClaimRevision(service: any, row: any) {
  if (row.claim_revision !== undefined && row.claim_revision !== null) return row;
  const state = claimState(row);
  if (state !== "UNCLAIMED" || row.claim_owner || row.claim_token) {
    throw authorityError("legacy_state", "authority_unavailable");
  }
  const outcome = await mutate(
    service,
    "initialize",
    {
      id: row.id,
      anon_session_id: row.anon_session_id,
      claim_revision: null,
      claim_owner: null,
      claim_token: null,
    },
    {
      claim_state: "UNCLAIMED",
      claim_revision: 0,
      claim_attempts: 0,
      claim_error_code: "",
    },
  );
  if (outcome !== "updated") return await readSession(service, String(row.id));
  return await readSession(service, String(row.id));
}

export async function acquireAnonymousPaymentsClaim(
  service: any,
  row: any,
  input: { authenticated_email: string; now?: Date; token?: string },
) {
  const authenticatedEmail = normalizeAnonymousClaimEmail(input.authenticated_email);
  const sessionEmail = normalizeAnonymousClaimEmail(
    row?.contact_email || row?.input_snapshot?.email,
  );
  if (!authenticatedEmail || !sessionEmail || authenticatedEmail !== sessionEmail) {
    return { acquired: false, reason: "claim_not_available" };
  }

  let authority = await initializeHistoricalClaimRevision(service, row);
  let state = claimState(authority);
  const currentOwner = normalizeAnonymousClaimEmail(authority?.claim_owner);
  if (CLAIMED_STATES.has(state)) {
    if (currentOwner !== authenticatedEmail || !authority?.claim_token) {
      return { acquired: false, reason: "claim_not_available" };
    }
    const claimUpdatedAt = Date.parse(String(authority.claim_updated_at || ""));
    const materializationStale = state === "MATERIALIZING" &&
      Number.isFinite(claimUpdatedAt) &&
      (input.now || new Date()).getTime() - claimUpdatedAt >=
        ANONYMOUS_PAYMENTS_MATERIALIZATION_LEASE_MS;
    return {
      acquired: false,
      replay: true,
      in_progress: state === "MATERIALIZING" && !materializationStale,
      materialization_stale: materializationStale,
      claim: claimFromRow(authority),
      session: authority,
    };
  }
  if (state !== "UNCLAIMED") throw authorityError("state", "authority_unavailable");
  if (currentOwner || authority?.claim_token) {
    throw authorityError("unclaimed_binding", "authority_unavailable");
  }

  const revision = requireRevision(authority);
  const token = String(input.token || `anon-payments:${crypto.randomUUID()}`);
  const now = input.now || new Date();
  const at = now.toISOString();
  const outcome = await mutate(
    service,
    "claim",
    {
      id: authority.id,
      anon_session_id: authority.anon_session_id,
      claim_state: "UNCLAIMED",
      claim_revision: revision,
      claim_owner: nullableClaimValue(authority.claim_owner),
      claim_token: nullableClaimValue(authority.claim_token),
    },
    {
      claim_state: "CLAIMED",
      claim_revision: revision + 1,
      claim_token: token,
      claim_owner: authenticatedEmail,
      claim_acquired_at: at,
      claim_updated_at: at,
      claim_attempts: Number(authority.claim_attempts || 0) + 1,
      claim_error_code: "",
    },
  );
  const observed = await readSession(service, String(authority.id));
  const won = outcome === "updated" &&
    claimState(observed) === "CLAIMED" &&
    normalizeAnonymousClaimEmail(observed.claim_owner) === authenticatedEmail &&
    String(observed.claim_token || "") === token &&
    Number(observed.claim_revision) === revision + 1;
  if (!won) {
    if (
      CLAIMED_STATES.has(claimState(observed)) &&
      normalizeAnonymousClaimEmail(observed.claim_owner) === authenticatedEmail &&
      observed.claim_token
    ) {
      return { acquired: false, replay: true, claim: claimFromRow(observed), session: observed };
    }
    return { acquired: false, reason: "claim_not_available" };
  }
  return { acquired: true, replay: false, claim: claimFromRow(observed), session: observed };
}

function ownedFilter(claim: any, expectedState: string) {
  return {
    id: String(claim.session_id),
    claim_state: expectedState,
    claim_revision: Number(claim.revision),
    claim_token: String(claim.token),
    claim_owner: normalizeAnonymousClaimEmail(claim.owner),
  };
}

export async function transitionAnonymousPaymentsClaim(
  service: any,
  claim: any,
  input: {
    from: string;
    to: string;
    patch?: Record<string, unknown>;
    now?: Date;
  },
) {
  const nextRevision = Number(claim.revision) + 1;
  const outcome = await mutate(
    service,
    "transition",
    ownedFilter(claim, input.from),
    {
      ...(input.patch || {}),
      claim_state: input.to,
      claim_revision: nextRevision,
      claim_updated_at: (input.now || new Date()).toISOString(),
    },
  );
  if (outcome !== "updated") return { ok: false, reason: "claim_fence_lost" };
  const observed = await readSession(service, String(claim.session_id));
  const owned = claimState(observed) === input.to &&
    normalizeAnonymousClaimEmail(observed.claim_owner) === normalizeAnonymousClaimEmail(claim.owner) &&
    String(observed.claim_token || "") === String(claim.token) &&
    Number(observed.claim_revision) === nextRevision;
  if (!owned) throw authorityError("transition_readback", "authority_ambiguous");
  return { ok: true, claim: claimFromRow(observed), session: observed };
}

export async function assertAnonymousPaymentsClaimOwned(service: any, claim: any) {
  const observed = await readSession(service, String(claim.session_id));
  if (
    !CLAIMED_STATES.has(claimState(observed)) ||
    normalizeAnonymousClaimEmail(observed.claim_owner) !== normalizeAnonymousClaimEmail(claim.owner) ||
    String(observed.claim_token || "") !== String(claim.token) ||
    Number(observed.claim_revision) !== Number(claim.revision)
  ) throw Object.assign(new Error("anonymous_payments_claim_fence_lost"), {
    code: "ANONYMOUS_PAYMENTS_CLAIM_FENCE_LOST",
    status: 409,
  });
  return { claim: claimFromRow(observed), session: observed };
}

export function anonymousPaymentsResultMatches(result: any, session: any, claim: any) {
  return Boolean(
    result?.id &&
    String(result.id) === String(session.claim_analyzer_result_id || result.id) &&
    String(result.anonymous_claim_session_id || "") === String(session.id) &&
    String(result.anonymous_claim_token || "") === String(claim.token) &&
    normalizeAnonymousClaimEmail(result.anonymous_claim_owner) ===
      normalizeAnonymousClaimEmail(claim.owner) &&
    normalizeAnonymousClaimEmail(result.created_by) ===
      normalizeAnonymousClaimEmail(claim.owner) &&
    (!session.claim_brand_id ||
      String(result.brand_id || "") === String(session.claim_brand_id))
  );
}

export async function readCanonicalAnonymousPaymentsResult(
  service: any,
  session: any,
  claim: any,
) {
  let result: any = null;
  if (session.claim_analyzer_result_id) {
    result = await service.entities.AnalyzerResult.get(
      String(session.claim_analyzer_result_id),
    );
  } else {
    const rows = await service.entities.AnalyzerResult.filter({
      anonymous_claim_session_id: String(session.id),
      anonymous_claim_token: String(claim.token),
      anonymous_claim_owner: normalizeAnonymousClaimEmail(claim.owner),
    }, "-created_date", 2);
    if (!Array.isArray(rows) || rows.length > 1) {
      throw new Error("anonymous_claim_result_authority_ambiguous");
    }
    result = rows[0] || null;
  }
  if (result && !anonymousPaymentsResultMatches(result, session, claim)) {
    throw new Error("anonymous_claim_result_binding_mismatch");
  }
  return result;
}

export async function readCanonicalAnonymousPaymentsSnapshot(
  service: any,
  session: any,
  claim: any,
  result: any,
) {
  let snapshot: any = null;
  if (session.claim_intelligence_snapshot_id) {
    snapshot = await service.entities.IntelligenceSnapshot.get(
      String(session.claim_intelligence_snapshot_id),
    );
  } else {
    const rows = await service.entities.IntelligenceSnapshot.filter({
      anonymous_claim_session_id: String(session.id),
      anonymous_claim_token: String(claim.token),
      anonymous_claim_owner: normalizeAnonymousClaimEmail(claim.owner),
    }, "-captured_at", 2);
    if (!Array.isArray(rows) || rows.length > 1) {
      throw new Error("anonymous_claim_snapshot_authority_ambiguous");
    }
    snapshot = rows[0] || null;
  }
  if (snapshot && (
    String(snapshot.related_entity_id || "") !== String(result.id) ||
    String(snapshot.brand_id || "") !== String(result.brand_id) ||
    String(snapshot.anonymous_claim_session_id || "") !== String(session.id) ||
    String(snapshot.anonymous_claim_token || "") !== String(claim.token) ||
    normalizeAnonymousClaimEmail(snapshot.anonymous_claim_owner) !==
      normalizeAnonymousClaimEmail(claim.owner)
  )) throw new Error("anonymous_claim_snapshot_binding_mismatch");
  return snapshot;
}

export async function markAnonymousPaymentsClaimRetryable(
  service: any,
  claim: any,
  errorCode: string,
) {
  const state = String(claim.state || "");
  if (!CLAIMED_STATES.has(state) || state === "COMPLETED") return { ok: false };
  return transitionAnonymousPaymentsClaim(service, claim, {
    from: state,
    to: "RECONCILE_REQUIRED",
    patch: { claim_error_code: String(errorCode || "materialization_failed").slice(0, 120) },
  });
}
