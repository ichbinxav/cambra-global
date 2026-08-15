// negotiationLaunchAuthority — who is allowed to start a provider negotiation,
// and who is only allowed to continue one that a human already started.
//
// WHY THIS EXISTS
// A negotiation's first email is an external commercial act performed in a
// merchant's name under a signed mandate. Today nothing enforces that a human
// authorised it:
//
//   * providerNegotiationAgent creates its AgentTask with
//     requires_approval:false, risk_level:3 and sends. Only a final/material
//     offer produces an Approval — the opening contact does not.
//   * startProviderNegotiation accepts requireAdminOrInternal, and "internal"
//     means any caller holding INTERNAL_CALL_SECRET, including scheduled
//     workers. A worker could therefore open a negotiation with a real
//     provider with no person in the loop.
//
// THE RULE
// The founder's LAUNCH click *is* the authorisation. A machine may resume a
// negotiation a human launched — that is how missingInformationWorker retries
// a case that stalled waiting for a provider contact — but a machine may never
// originate one.
//
// This module holds only the decision. It takes plain facts and returns a
// verdict, so the rule is testable without a runtime; entry.ts supplies the
// facts and obeys the verdict.

export type LaunchMode = "launch" | "resume";

export type LaunchActor = {
  /** requireAdminOrInternal: caller authenticated as a human admin. */
  isAdmin?: boolean;
  /** requireAdminOrInternal: caller presented INTERNAL_CALL_SECRET. */
  isInternal?: boolean;
  /** Identity of the human, when there is one. */
  email?: string | null;
};

export type ExistingCaseFacts = {
  id?: string | null;
  status?: string | null;
  /** Email of the human who launched this case. Absent = never launched. */
  launched_by?: string | null;
} | null;

// Note on shape: the repo compiles with strict:false, which disables the
// control-flow narrowing that would let `if (!d.ok)` reveal `error`/`status` on
// a discriminated union. The failure fields are therefore declared optional on
// the success variants. Callers still branch on `ok`; the contract is unchanged.
export type LaunchDecision =
  | { ok: true; mode: "launch"; launched_by: string; error?: undefined; status?: undefined }
  | {
    ok: true;
    mode: "resume";
    launched_by: string;
    case_id: string;
    error?: undefined;
    status?: undefined;
  }
  | { ok: false; error: string; status: number; mode?: undefined; launched_by?: undefined };

const TERMINAL = new Set(["closed", "rejected", "expired"]);

/**
 * Decide whether this caller may start or continue a provider negotiation.
 *
 * `mode` must be explicit. An absent or unknown mode is refused rather than
 * defaulted: defaulting is how an automated caller ends up originating outbound
 * contact by accident, which is the exact failure this guard exists to prevent.
 */
export function resolveLaunchAuthority(input: {
  mode?: unknown;
  actor: LaunchActor;
  existingCase?: ExistingCaseFacts;
  /**
   * Launch attribution carried forward from the original human launch.
   *
   * A launch can fail before the NegotiationCase exists — provider contact
   * resolution runs first, and when it cannot find an address it opens a
   * MerchantInformationRequest and stops. The later resume therefore has no
   * case to inspect. The human's identity is stamped into that request's
   * resume_args_json at launch time and travels back here, so the chain of
   * custody survives without letting a worker invent one.
   */
  carriedLaunchedBy?: string | null;
}): LaunchDecision {
  const mode = String(input?.mode ?? "");
  const actor = input?.actor ?? {};
  const existing = input?.existingCase ?? null;
  const carried = String(input?.carriedLaunchedBy ?? "").trim().toLowerCase();

  if (mode !== "launch" && mode !== "resume") {
    return {
      ok: false,
      error: "launch_mode_required",
      status: 400,
    };
  }

  if (mode === "launch") {
    // Only a human admin can originate. An internal secret is proof that a
    // machine called us, not that a person decided anything.
    if (!actor.isAdmin) {
      return {
        ok: false,
        error: "human_launch_authorization_required",
        status: 403,
      };
    }
    const email = String(actor.email ?? "").trim().toLowerCase();
    if (!email) {
      // An admin session with no identity cannot be recorded on the case, and
      // an unattributable launch is not an authorisation.
      return {
        ok: false,
        error: "launch_actor_identity_required",
        status: 403,
      };
    }
    return { ok: true, mode: "launch", launched_by: email };
  }

  // resume — continue something a human already launched.
  if (!actor.isAdmin && !actor.isInternal) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  if (existing && existing.id) {
    if (TERMINAL.has(String(existing.status ?? "").toLowerCase())) {
      return { ok: false, error: "case_is_terminal", status: 409 };
    }
    const launchedBy = String(existing.launched_by ?? "").trim().toLowerCase() || carried;
    if (!launchedBy) {
      // A case with no recorded launcher was never authorised by a person.
      // Resuming it would let a worker originate contact through the back door.
      return {
        ok: false,
        error: "case_was_never_human_launched",
        status: 409,
      };
    }
    return {
      ok: true,
      mode: "resume",
      launched_by: launchedBy,
      case_id: String(existing.id),
    };
  }

  // No case yet — the original launch stopped before it could be created.
  // Only a carried attribution from that human launch authorises the retry.
  if (!carried) {
    return {
      ok: false,
      error: "resume_requires_launch_attribution",
      status: 409,
    };
  }
  return { ok: true, mode: "resume", launched_by: carried, case_id: "" };
}

/**
 * Whether a scheduled/automated caller may send an opening contact at all.
 *
 * Collective (pool) outreach currently originates from a daily worker. Until
 * that path has its own human gate, it is disabled unless explicitly enabled by
 * environment configuration — fail-closed, consistent with EmergencyControl.
 */
export function collectiveOutboundEnabled(env: {
  get(key: string): string | undefined;
}): boolean {
  const raw = String(env?.get?.("COLLECTIVE_OUTBOUND_ENABLED") ?? "").trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "enabled";
}
