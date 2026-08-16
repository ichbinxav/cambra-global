export function updatedExactlyOne(result: any) {
  if (!result || typeof result !== "object") return false;
  if (
    Object.prototype.hasOwnProperty.call(result, "success") &&
    result.success !== true
  ) return false;
  if (
    Object.prototype.hasOwnProperty.call(result, "ok") &&
    result.ok !== true
  ) return false;
  const observed = ["updated", "modified_count", "matched_count"]
    .filter((key) => result[key] !== undefined && result[key] !== null)
    .map((key) => Number(result[key]));
  // Contradictory adapter counters are ambiguous authority, not a successful
  // CAS. Every counter actually returned must agree that exactly one row was
  // both matched and changed.
  return observed.length > 0 &&
    observed.every((value) => Number.isInteger(value) && value === 1);
}

export async function finalizeApproval(
  svc: any,
  approval: any,
  resolutionKey: string,
  status: string,
  patch: any = {},
) {
  const allowedDecisionStatuses = new Set(["approved", "rejected", "expired"]);
  if (!allowedDecisionStatuses.has(status)) {
    throw new Error("approval_resolution_terminal_status_invalid");
  }
  const approvalRevision = Number(approval.approval_revision || 0),
    phaseRevision = Number(approval.resolution_phase_revision || 0),
    attemptToken = String(approval.resolution_attempt_token || "");
  const completedAt = new Date().toISOString();
  const decisionStatus = status === "approved"
    ? "APPROVED"
    : status === "expired"
    ? "EXPIRED"
    : "REJECTED";
  let executionStatus = patch.execution_status ||
    (decisionStatus === "APPROVED" &&
        approval.resolution_effects_started === true
      ? "REVIEW_REQUIRED"
      : "NOT_STARTED");
  const executionReceiptRef = String(patch.execution_receipt_ref || "");
  const allowedExecutionStatuses = new Set([
    "NOT_STARTED",
    "CLAIMED",
    "EFFECTING",
    "EXECUTED",
    "FAILED_RETRYABLE",
    "FAILED_TERMINAL",
    "REVIEW_REQUIRED",
  ]);
  if (!allowedExecutionStatuses.has(executionStatus)) {
    throw new Error("approval_execution_status_invalid");
  }
  if (
    executionStatus === "EXECUTED" &&
    !/^[a-z][a-z0-9._-]{1,63}:[^\s].+$/i.test(executionReceiptRef)
  ) executionStatus = "REVIEW_REQUIRED";
  const changed = await svc.entities.Approval.updateMany(
    {
      id: approval.id,
      status: "resolving",
      resolution_command_key: resolutionKey,
      approval_revision: approvalRevision,
      resolution_phase: "applying",
      resolution_phase_revision: phaseRevision,
      resolution_attempt_token: attemptToken,
    },
    {
      $set: {
        status,
        ...patch,
        decision_status: decisionStatus,
        decision_status_recorded_at: completedAt,
        execution_status: executionStatus,
        execution_status_recorded_at: completedAt,
        execution_receipt_ref: executionReceiptRef,
        approval_revision: approvalRevision + 1,
        resolution_phase: "finalized",
        resolution_phase_revision: phaseRevision + 1,
        resolution_lease_expires_at: "",
        resolution_completed_at: completedAt,
      },
    },
  );
  if (!updatedExactlyOne(changed)) {
    throw new Error("approval_resolution_claim_lost");
  }
  const observed = await svc.entities.Approval.get(approval.id);
  if (
    !observed ||
    observed.status !== status ||
    observed.decision_status !== decisionStatus ||
    observed.execution_status !== executionStatus ||
    String(observed.execution_receipt_ref || "") !== executionReceiptRef ||
    Number(observed.approval_revision) !== approvalRevision + 1 ||
    observed.resolution_phase !== "finalized" ||
    Number(observed.resolution_phase_revision) !== phaseRevision + 1 ||
    String(observed.resolution_command_key || "") !== resolutionKey
  ) throw new Error("approval_resolution_finalization_readback_mismatch");
  return observed;
}

export async function acquireResolutionAttempt(
  svc: any,
  approval: any,
  resolutionKey: string,
  nowMs = Date.now(),
) {
  const phase = String(approval.resolution_phase || "claimed"),
    phaseRevision = Number(approval.resolution_phase_revision || 0),
    leaseUntil = Date.parse(String(approval.resolution_lease_expires_at || ""));
  const approvalExpiresAt = approval.expires_at
    ? Date.parse(String(approval.expires_at))
    : null;
  if (
    approvalExpiresAt !== null &&
    (!Number.isFinite(approvalExpiresAt) || approvalExpiresAt <= nowMs)
  ) {
    return {
      acquired: false,
      in_progress: false,
      review_required: true,
      error: "approval_resolution_expired",
      approval,
    };
  }
  // Effects evidence makes an attempt non-takeoverable even when a malformed
  // legacy row still reports the pre-effect `claimed` phase.
  if (approval.resolution_effects_started === true) {
    return {
      acquired: false,
      in_progress: false,
      review_required: true,
      error: "approval_resolution_effect_state_requires_reconciliation",
      approval,
    };
  }
  if (phase === "applying") {
    if (!Number.isFinite(leaseUntil)) {
      return {
        acquired: false,
        in_progress: false,
        review_required: true,
        error: "approval_resolution_lease_unknown",
        approval,
      };
    }
    if (leaseUntil > nowMs) {
      return { acquired: false, in_progress: true, approval };
    }
  }
  if (!["claimed", "applying"].includes(phase)) {
    return { acquired: false, in_progress: false, approval };
  }
  const attemptToken = `approval-attempt:${crypto.randomUUID()}`;
  const changed = await svc.entities.Approval.updateMany(
    {
      id: approval.id,
      status: "resolving",
      resolution_command_key: resolutionKey,
      approval_revision: Number(approval.approval_revision || 0),
      resolution_phase: phase,
      resolution_phase_revision: phaseRevision,
    },
    {
      $set: {
        resolution_phase: "applying",
        resolution_phase_revision: phaseRevision + 1,
        resolution_attempt_token: attemptToken,
        resolution_lease_expires_at: new Date(
          nowMs + 10 * 60_000,
        ).toISOString(),
      },
    },
  );
  if (!updatedExactlyOne(changed)) {
    return {
      acquired: false,
      in_progress: true,
      approval: await svc.entities.Approval.get(approval.id),
    };
  }
  const observed = await svc.entities.Approval.get(approval.id);
  if (
    !observed ||
    observed.status !== "resolving" ||
    observed.resolution_phase !== "applying" ||
    Number(observed.resolution_phase_revision) !== phaseRevision + 1 ||
    String(observed.resolution_attempt_token || "") !== attemptToken ||
    String(observed.resolution_command_key || "") !== resolutionKey
  ) throw new Error("approval_resolution_claim_readback_mismatch");
  return {
    acquired: true,
    in_progress: false,
    approval: observed,
  };
}

/**
 * Return a claimed approval to pending only while the saga can prove that no
 * domain effect started. The nonce remains durably consumed on Approval, the
 * existing authority plane: retry therefore requires a new preview/nonce.
 * Once effects_started is true the durable saga must be resumed with the same
 * command key instead.
 */
export async function releaseResolutionClaimIfNoEffects(
  svc: any,
  approval: any,
  resolutionKey: string,
) {
  if (!approval || approval.resolution_effects_started === true) {
    return { released: false, approval };
  }
  const approvalRevision = Number(approval.approval_revision || 0),
    phaseRevision = Number(approval.resolution_phase_revision || 0),
    phase = String(approval.resolution_phase || "claimed"),
    attemptToken = String(approval.resolution_attempt_token || ""),
    consumedNonceHash = String(approval.resolution_nonce_hash || ""),
    consumedNonceAt = String(approval.resolution_nonce_used_at || ""),
    consumedPreviewGeneration = Number(
      approval.resolution_preview_generation || 0,
    );
  if (!["claimed", "applying"].includes(phase)) {
    return { released: false, approval };
  }
  if (!consumedNonceHash || !consumedNonceAt) {
    throw new Error("approval_resolution_release_nonce_evidence_missing");
  }
  const changed = await svc.entities.Approval.updateMany(
    {
      id: approval.id,
      status: "resolving",
      resolution_command_key: resolutionKey,
      approval_revision: approvalRevision,
      resolution_phase: phase,
      resolution_phase_revision: phaseRevision,
      resolution_attempt_token: attemptToken,
      resolution_effects_started: false,
    },
    {
      $set: {
        status: "pending",
        resolution_command_key: "",
        resolution_authority_hash: "",
        resolution_content_hash: "",
        resolution_preview_hash: "",
        resolution_binding_hash: "",
        resolution_binding_json: {},
        resolution_policy_key: "",
        resolution_policy_version: "",
        resolution_authority_snapshot_id: "",
        resolution_intelligence_snapshot_id: "",
        resolution_intelligence_snapshot_hash: "",
        resolution_economic_terms_hash: "",
        resolution_legal_terms_hash: "",
        resolution_market_scope_version: "",
        resolution_emergency_control_id: "",
        resolution_emergency_control_revision: 0,
        // Deliberately retained: a failed pre-effect preflight does not make a
        // consumed Founder confirmation reusable.
        resolution_nonce_hash: consumedNonceHash,
        resolution_nonce_used_at: consumedNonceAt,
        resolution_preview_generation: consumedPreviewGeneration,
        resolution_actor_email: "",
        resolution_decision: "",
        resolution_reason: "",
        resolution_phase: "claimed",
        resolution_phase_revision: 0,
        resolution_attempt_token: "",
        resolution_effects_started: false,
        resolution_lease_expires_at: "",
        resolution_started_at: "",
        resolution_completed_at: "",
        approval_revision: approvalRevision + 1,
      },
    },
  );
  const observed = await svc.entities.Approval.get(approval.id);
  const released = updatedExactlyOne(changed) &&
    observed?.status === "pending" &&
    Number(observed?.approval_revision || 0) === approvalRevision + 1 &&
    String(observed?.resolution_command_key || "") === "" &&
    String(observed?.resolution_phase || "") === "claimed" &&
    Number(observed?.resolution_phase_revision || 0) === 0 &&
    String(observed?.resolution_attempt_token || "") === "" &&
    String(observed?.resolution_nonce_hash || "") === consumedNonceHash &&
    String(observed?.resolution_nonce_used_at || "") === consumedNonceAt &&
    Number(observed?.resolution_preview_generation || 0) ===
      consumedPreviewGeneration &&
    observed?.resolution_effects_started === false &&
    String(observed?.resolution_lease_expires_at || "") === "";
  if (updatedExactlyOne(changed) && !released) {
    throw new Error("approval_resolution_release_readback_mismatch");
  }
  return {
    released,
    retry_requires_new_preview: released,
    approval: observed,
  };
}

export async function markResolutionEffectsStarted(
  svc: any,
  approval: any,
  resolutionKey: string,
) {
  if (approval.resolution_effects_started === true) return approval;
  if (approval.expires_at) {
    const expiresAt = Date.parse(String(approval.expires_at));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("approval_resolution_expired_before_effect");
    }
  }
  const changed = await svc.entities.Approval.updateMany(
    {
      id: approval.id,
      status: "resolving",
      resolution_command_key: resolutionKey,
      approval_revision: Number(approval.approval_revision || 0),
      resolution_phase: "applying",
      resolution_phase_revision: Number(
        approval.resolution_phase_revision || 0,
      ),
      resolution_attempt_token: String(approval.resolution_attempt_token || ""),
      resolution_effects_started: false,
    },
    { $set: { resolution_effects_started: true } },
  );
  if (!updatedExactlyOne(changed)) {
    throw new Error("approval_resolution_effect_start_claim_lost");
  }
  const observed = await svc.entities.Approval.get(approval.id);
  if (
    !observed || observed.status !== "resolving" ||
    String(observed.resolution_command_key || "") !== resolutionKey ||
    Number(observed.approval_revision || 0) !==
      Number(approval.approval_revision || 0) ||
    observed.resolution_phase !== "applying" ||
    Number(observed.resolution_phase_revision || 0) !==
      Number(approval.resolution_phase_revision || 0) ||
    String(observed.resolution_attempt_token || "") !==
      String(approval.resolution_attempt_token || "") ||
    observed.resolution_effects_started !== true
  ) throw new Error("approval_resolution_effect_start_readback_mismatch");
  return observed;
}

export function assertFreshApprovalConfirmationNonce(
  approval: any,
  nonceHash: string,
  previewGeneration?: number,
) {
  const consumedHash = String(approval?.resolution_nonce_hash || "");
  const consumedAt = String(approval?.resolution_nonce_used_at || "");
  const installedHash = String(approval?.confirmation_nonce_hash || "");
  const installedGeneration = Number(approval?.confirmation_preview_generation);
  const consumedGeneration = Number(
    approval?.resolution_preview_generation || 0,
  );
  const requestedGeneration = Number(previewGeneration);
  if (
    !installedHash ||
    installedHash !== String(nonceHash || "") ||
    !Number.isInteger(installedGeneration) ||
    installedGeneration < 1 ||
    !Number.isInteger(requestedGeneration) ||
    requestedGeneration !== installedGeneration
  ) {
    const error: any = new Error("approval_confirmation_preview_not_current");
    error.status = 409;
    error.retry_requires_new_preview = true;
    throw error;
  }
  if (
    (consumedHash && consumedHash === installedHash) ||
    (consumedAt && consumedGeneration === installedGeneration)
  ) {
    const error: any = new Error("approval_confirmation_nonce_already_consumed");
    error.status = 409;
    error.retry_requires_new_preview = true;
    throw error;
  }
  if (!String(nonceHash || "")) {
    const error: any = new Error("approval_confirmation_nonce_required");
    error.status = 409;
    throw error;
  }
  return true;
}

export async function installApprovalConfirmationPreview(
  svc: any,
  approval: any,
  input: {
    commandKey: string;
    actorEmail: string;
    nonceHash: string;
    previewHash: string;
  },
) {
  if (!approval || approval.status !== "pending") {
    throw new Error("approval_confirmation_preview_not_installable");
  }
  if (
    !input.commandKey || !input.actorEmail || !input.nonceHash ||
    !input.previewHash
  ) throw new Error("approval_confirmation_preview_evidence_missing");
  const currentGeneration = Number(
    approval.confirmation_preview_generation || 0,
  );
  if (!Number.isInteger(currentGeneration) || currentGeneration < 0) {
    throw new Error("approval_confirmation_preview_generation_invalid");
  }
  const nextGeneration = currentGeneration + 1;
  const revision = Number(approval.approval_revision || 0);
  const filter: any = {
    id: approval.id,
    status: "pending",
    approval_revision: revision,
  };
  if (approval.updated_date) filter.updated_date = approval.updated_date;
  const installedAt = new Date().toISOString();
  const changed = await svc.entities.Approval.updateMany(filter, {
    $set: {
      confirmation_preview_generation: nextGeneration,
      confirmation_preview_command_key: input.commandKey,
      confirmation_preview_actor_email: input.actorEmail,
      confirmation_preview_hash: input.previewHash,
      confirmation_nonce_hash: input.nonceHash,
      confirmation_preview_installed_at: installedAt,
      approval_revision: revision + 1,
    },
  });
  if (!updatedExactlyOne(changed)) {
    throw new Error("approval_confirmation_preview_install_race_lost");
  }
  const observed = await svc.entities.Approval.get(approval.id);
  if (
    !observed || observed.status !== "pending" ||
    Number(observed.approval_revision) !== revision + 1 ||
    Number(observed.confirmation_preview_generation) !== nextGeneration ||
    String(observed.confirmation_preview_command_key || "") !==
      input.commandKey ||
    String(observed.confirmation_preview_actor_email || "") !==
      input.actorEmail ||
    String(observed.confirmation_preview_hash || "") !== input.previewHash ||
    String(observed.confirmation_nonce_hash || "") !== input.nonceHash
  ) throw new Error("approval_confirmation_preview_install_readback_mismatch");
  return observed;
}

export async function claimApprovalConfirmation(
  svc: any,
  approval: any,
  input: {
    commandKey: string;
    actorEmail: string;
    nonceHash: string;
    previewGeneration: number;
  },
) {
  assertFreshApprovalConfirmationNonce(
    approval,
    input.nonceHash,
    input.previewGeneration,
  );
  const revision = Number(approval.approval_revision || 0);
  const consumedAt = new Date().toISOString();
  const changed = await svc.entities.Approval.updateMany({
    id: approval.id,
    status: "pending",
    approval_revision: revision,
    confirmation_preview_generation: input.previewGeneration,
    confirmation_preview_command_key: input.commandKey,
    confirmation_preview_actor_email: input.actorEmail,
    confirmation_nonce_hash: input.nonceHash,
  }, {
    $set: {
      status: "resolving",
      resolution_command_key: input.commandKey,
      resolution_nonce_hash: input.nonceHash,
      resolution_nonce_used_at: consumedAt,
      resolution_preview_generation: input.previewGeneration,
      resolution_actor_email: input.actorEmail,
      resolution_phase: "claimed",
      resolution_phase_revision: 0,
      resolution_attempt_token: "",
      resolution_effects_started: false,
      resolution_lease_expires_at: "",
      approval_revision: revision + 1,
    },
  });
  if (!updatedExactlyOne(changed)) {
    throw new Error("approval_confirmation_claim_race_lost");
  }
  const observed = await svc.entities.Approval.get(approval.id);
  if (
    !observed || observed.status !== "resolving" ||
    Number(observed.approval_revision) !== revision + 1 ||
    Number(observed.resolution_preview_generation) !==
      input.previewGeneration ||
    String(observed.resolution_nonce_hash || "") !== input.nonceHash ||
    !String(observed.resolution_nonce_used_at || "") ||
    String(observed.resolution_command_key || "") !== input.commandKey
  ) throw new Error("approval_confirmation_claim_readback_mismatch");
  return observed;
}

/** Atomically renew the fencing lease before every material effect batch. */
export async function renewResolutionLease(
  svc: any,
  approval: any,
  resolutionKey: string,
  nowMs = Date.now(),
) {
  if (approval.resolution_effects_started !== true) {
    throw new Error("approval_resolution_effect_start_not_observed");
  }
  const leaseExpiresAt = new Date(nowMs + 10 * 60_000).toISOString();
  const changed = await svc.entities.Approval.updateMany(
    {
      id: approval.id,
      status: "resolving",
      resolution_command_key: resolutionKey,
      approval_revision: Number(approval.approval_revision || 0),
      resolution_phase: "applying",
      resolution_phase_revision: Number(
        approval.resolution_phase_revision || 0,
      ),
      resolution_attempt_token: String(approval.resolution_attempt_token || ""),
      resolution_effects_started: true,
    },
    { $set: { resolution_lease_expires_at: leaseExpiresAt } },
  );
  if (!updatedExactlyOne(changed)) {
    throw new Error("approval_resolution_claim_lost");
  }
  const observed = await svc.entities.Approval.get(approval.id);
  if (
    !observed || observed.status !== "resolving" ||
    String(observed.resolution_command_key || "") !== resolutionKey ||
    Number(observed.approval_revision || 0) !==
      Number(approval.approval_revision || 0) ||
    observed.resolution_phase !== "applying" ||
    Number(observed.resolution_phase_revision || 0) !==
      Number(approval.resolution_phase_revision || 0) ||
    String(observed.resolution_attempt_token || "") !==
      String(approval.resolution_attempt_token || "") ||
    observed.resolution_effects_started !== true ||
    String(observed.resolution_lease_expires_at || "") !== leaseExpiresAt
  ) throw new Error("approval_resolution_lease_readback_mismatch");
  return observed;
}
