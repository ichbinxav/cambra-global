// AUDIT 2026-08-18 — moved out of base44/functions/productionReadinessWorker/entry.ts. Host functions
// import this module directly: a relative import into another function's tree
// cannot be bundled, so every host of this logical route silently failed to
// deploy and kept serving stale code.
import {
  claimSchedulerRun,
  finishSchedulerRunOrThrow,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
} from "../schedulerRun.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../internalGate.ts";
import { evaluateProductionSeal } from "../productionReadiness.ts";
import { produceServiceLevelSnapshots } from "../serviceLevelRuntime.ts";
import {
  recordRuntimeGateEvidence,
  runtimeDeploymentIdentity,
  validateReleaseIdentityExpectation,
  verifyFinalRealRestoreGateAuthority,
  verifyRuntimeGateEvidence,
} from "../runtimeEvidence.ts";
import {
  observeSupervisorCollection,
  publicSupervisorDependency,
  summarizeSupervisorDependencies,
  type SupervisorDependency,
  unavailableSupervisorDependency,
} from "../supervisorObservation.ts";

export const OPERATIONAL_PLANE_DECLARATION = Object.freeze({"function_name":"productionReadinessWorker","classification":"RELEASE_READINESS_EVALUATOR","status":"ACTIVE_NON_AUTHORITATIVE","authoritative_for":["fail-closed release readiness projection only"]});

async function criticalRead(
  label: string,
  read: () => Promise<any>,
  limit: number,
): Promise<SupervisorDependency<any>> {
  return observeSupervisorCollection(label, read, { limit });
}

function newest(
  rows: any[],
  predicate: (row: any) => boolean,
  dateKey = "verified_at",
) {
  return rows.filter(predicate).sort((a: any, b: any) =>
    Date.parse(String(b?.[dateKey] || "")) -
    Date.parse(String(a?.[dateKey] || ""))
  )[0] || null;
}

function localChecksFromRemoteCi(remote: any, finalSha: string) {
  if (
    remote?.status !== "PASS" || remote?.evidence_integrity !== "VERIFIED" ||
    String(remote?.git_sha || "") !== finalSha
  ) return {};
  const raw = remote?.metrics_json?.local_checks;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map((
      [key, value],
    ) => [key, value === "PASS" ? "PASS" : "FAIL"]),
  );
}

async function verifiedRuntimeGate(
  rows: any[],
  gateKey: string,
  input: any = {},
) {
  const row = newest(
    rows,
    (candidate) => candidate.gate_key === gateKey,
    "observed_at",
  );
  if (!row) {
    return {
      gate_key: gateKey,
      status: "NOT_RUN",
      evidence_integrity: "BLOCKED",
      evidence_integrity_blockers: ["runtime_gate_evidence_missing"],
    };
  }
  const realRestoreAuthority=gateKey==='REAL_RESTORE'&&typeof input.resolve_real_restore_exercise_authority==='function'
    ? await input.resolve_real_restore_exercise_authority(row)
    : undefined;
  const verification = await verifyRuntimeGateEvidence(row, {
    environment: "production",
    allow_external: input.allow_external === true,
    sha_bound: input.sha_bound === true,
    final_sha: input.final_sha,
    max_age_hours: input.max_age_hours,
    real_restore_exercise_authority: realRestoreAuthority,
  });
  const finalGateAuthority=gateKey==='REAL_RESTORE'&&typeof input.resolve_real_restore_gate_authority==='function'
    ?await input.resolve_real_restore_gate_authority(row)
    :undefined;
  const finalGate=gateKey==='REAL_RESTORE'
    ?await verifyFinalRealRestoreGateAuthority(row,finalGateAuthority,{
      environment:'production',
      allow_external:input.allow_external===true,
      sha_bound:input.sha_bound===true,
      final_sha:input.final_sha,
      max_age_hours:input.max_age_hours,
      real_restore_exercise_authority:realRestoreAuthority,
    })
    :{ok:true,blockers:[] as string[]};
  const kindAllowed = (input.kinds || []).includes(
    String(row.evidence_kind || ""),
  );
  const blockers = [
    ...verification.blockers,
    ...finalGate.blockers,
    ...(!kindAllowed ? ["runtime_gate_evidence_kind_not_acceptable"] : []),
  ];
  return {
    ...row,
    status: verification.ok && finalGate.ok && kindAllowed && row.status === "PASS"
      ? "PASS"
      : "BLOCKED",
    evidence_integrity: blockers.length ? "BLOCKED" : "VERIFIED",
    evidence_integrity_blockers: [...new Set(blockers)],
  };
}

async function persistReadinessSnapshot(svc: any, payload: any) {
  let existing: any;
  try {
    existing = await svc.entities.ProductionReadinessSnapshot.filter(
      { snapshot_key: payload.snapshot_key },
      "-calculated_at",
      2,
    );
  } catch {
    throw new Error("production_readiness_snapshot_read_unavailable");
  }
  if (!Array.isArray(existing)) {
    throw new Error("production_readiness_snapshot_read_unavailable");
  }
  if (existing.length > 1) {
    throw new Error("production_readiness_snapshot_authority_ambiguous");
  }
  if (existing[0]) return existing[0];
  const created = await svc.entities.ProductionReadinessSnapshot.create(
    payload,
  );
  let post: any;
  try {
    post = await svc.entities.ProductionReadinessSnapshot.filter(
      { snapshot_key: payload.snapshot_key },
      "-calculated_at",
      2,
    );
  } catch {
    throw new Error(
      "production_readiness_snapshot_post_create_read_unavailable",
    );
  }
  if (
    !Array.isArray(post) || post.length !== 1 ||
    String(post[0]?.id || "") !== String(created?.id || "")
  ) throw new Error("production_readiness_snapshot_create_ambiguous");
  return created;
}

export async function handleProductionReadinessWorker(req: Request) {
  let schedulerSvc: any = null, schedulerClaim: any = null, schedulerOk = true;
  try {
    const base44 = createClientFromRequest(req),
      body = await req.json().catch(() => ({})),
      gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole;
    schedulerSvc = svc;
    schedulerClaim = await claimSchedulerRun(svc, req, {
      worker_key: "productionReadinessWorker",
      cadence_seconds: 86400,
    });
    {
      const rejected = schedulerClaimDeniedResponse(schedulerClaim);
      if (rejected) return rejected;
    }
    // Caller payloads never define deployed identity or local verification.
    const runtimeIdentity = runtimeDeploymentIdentity(),
      finalSha = String(runtimeIdentity.git_sha || "");
    const [findingsRead, verificationRead, restoreRead, runtimeGateRead] =
      await Promise.all([
        criticalRead(
          "production_findings",
          () =>
            svc.entities.ProductionFinding.filter(
              { status: { $in: ["OPEN", "REMEDIATING", "ACCEPTED"] } },
              "-updated_at",
              1000,
            ),
          1000,
        ),
        finalSha
          ? criticalRead(
            "release_verifications",
            () =>
              svc.entities.ReleaseVerification.filter(
                { git_sha: finalSha },
                "-verified_at",
                100,
              ),
            100,
          )
          : Promise.resolve(
            unavailableSupervisorDependency(
              "release_verifications",
              "RUNTIME_GIT_SHA_MISSING",
              "RUNTIME_IDENTITY_UNAVAILABLE",
            ),
          ),
        criticalRead(
          "restore_exercises",
          () =>
            svc.entities.DisasterRecoveryExercise.filter(
              { exercise_type: "REAL_RESTORE" },
              "-completed_at",
              20,
            ),
          20,
        ),
        criticalRead(
          "runtime_gate_evidence",
          () => svc.entities.RuntimeGateEvidence.list("-observed_at", 1000),
          1000,
        ),
      ]);
    const coverage = [
      findingsRead,
      verificationRead,
      restoreRead,
      runtimeGateRead,
    ];
    const dependencySummary = summarizeSupervisorDependencies(coverage);
    const coverageBlockers = coverage
      .filter((row) => row.availability !== "COMPLETE")
      .map((row) => row.error_code || `${row.dependency}_unavailable`);
    if (!dependencySummary.automated_action_allowed) {
      schedulerOk = false;
      return Response.json({
        ok: false,
        error: "production_readiness_dependencies_unknown",
        health_status: "DEGRADED",
        readiness_status: "UNKNOWN",
        automated_action_allowed: false,
        blocked_dependencies: dependencySummary.blocked_dependencies,
        dependencies: coverage.map(publicSupervisorDependency),
      }, { status: 503 });
    }
    // Runtime evidence writes begin only after every critical source read is
    // complete. UNKNOWN/ERROR therefore cannot trigger an automated action.
    schedulerClaim = await markSchedulerEffectStarted(svc, schedulerClaim);
    {
      const rejected = schedulerClaimDeniedResponse(schedulerClaim);
      if (rejected) return rejected;
    }
    const verifications = verificationRead.rows,
      verification = (source: string) =>
        newest(verifications, (row) => row.source === source) ||
        { status: "NOT_RUN" };
    const remoteCi = verification("GITHUB_ACTIONS"),
      expectedIdentity = remoteCi?.metrics_json?.release_identity || null;
    const expectedValidation = expectedIdentity
      ? validateReleaseIdentityExpectation(expectedIdentity)
      : { ok: false, blockers: ["expected_release_identity_required"] };
    const parity = await recordRuntimeGateEvidence(svc, {
      gate_key: "BASE44_RUNTIME_PARITY",
      environment: "production",
      git_sha: finalSha,
      status: remoteCi?.status === "PASS" &&
          String(remoteCi?.git_sha || "") === finalSha && expectedValidation.ok
        ? "PASS"
        : "BLOCKED",
      evidence_kind: "REAL_RUNTIME",
      source: "productionReadinessWorker",
      expected_identity: expectedIdentity,
      external_run_id: String(remoteCi?.external_run_id || ""),
      evidence_refs: [remoteCi?.evidence_url].filter(Boolean),
      details_json: {
        remote_ci_verification_key: remoteCi?.verification_key || null,
        expected_identity_blockers: expectedValidation.blockers || [],
      },
      observed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      recorded_by: String(
        (gate as any).user?.email || "productionReadinessWorker",
      ),
    });
    const parityVerification = await verifyRuntimeGateEvidence(parity, {
      environment: "production",
    });
    const verifiedParity = {
      ...parity,
      evidence_integrity: parityVerification.ok ? "VERIFIED" : "BLOCKED",
      evidence_integrity_blockers: parityVerification.blockers,
    };
    const resolveRealRestoreExerciseAuthority=async(row:any)=>{
      const exerciseKey=String(row?.details_json?.exercise_key||''),incidentKey=String(row?.details_json?.compensation_incident_key||'');
      if(!exerciseKey||!incidentKey)return{available:false,exact_query:false,rows:[],compensation_markers:[],blockers:['real_restore_authority_binding_missing']};
      const[exerciseAuthority,compensationAuthority]=await Promise.all([
        criticalRead('real_restore_exercise_exact_authority',()=>svc.entities.DisasterRecoveryExercise.filter({exercise_key:exerciseKey},'-updated_date',2),2),
        criticalRead('real_restore_compensation_exact_authority',()=>svc.entities.AutonomyIncident.filter({dedupe_key:incidentKey},'-last_seen_at',2),2),
      ]);
      return{available:exerciseAuthority.availability!=='UNAVAILABLE'&&compensationAuthority.availability!=='UNAVAILABLE',exact_query:true,rows:exerciseAuthority.rows,compensation_markers:compensationAuthority.rows,blockers:[exerciseAuthority.error_code,compensationAuthority.error_code].filter(Boolean)};
    };
    const resolveRealRestoreGateAuthority=async(row:any)=>{
      const evidenceKey=String(row?.evidence_key||'');
      if(!evidenceKey)return{available:false,exact_query:false,latest_query:false,exact_rows:[],latest_rows:[],blockers:['real_restore_final_gate_binding_missing']};
      const exactAuthority=await criticalRead('real_restore_gate_exact_authority',()=>svc.entities.RuntimeGateEvidence.filter({gate_key:'REAL_RESTORE',evidence_key:evidenceKey},'-observed_at',2),2);
      // Latest must be the last datastore read in this authority fence. A
      // concurrent compensation appended before it is therefore observed.
      const latestAuthority=await criticalRead('real_restore_gate_latest_authority',()=>svc.entities.RuntimeGateEvidence.filter({gate_key:'REAL_RESTORE'},'-observed_at',2),2);
      return{available:exactAuthority.availability!=='UNAVAILABLE'&&latestAuthority.availability!=='UNAVAILABLE',exact_query:true,latest_query:true,exact_rows:exactAuthority.rows,latest_rows:latestAuthority.rows,blockers:[exactAuthority.error_code,latestAuthority.error_code].filter(Boolean)};
    };
    const [remoteGate, restoreGate, documentGate, dependencyGate] =
      await Promise.all([
        verifiedRuntimeGate(runtimeGateRead.rows, "REMOTE_CI_FINAL_SHA", {
          allow_external: true,
          sha_bound: true,
          final_sha: finalSha,
          max_age_hours: 168,
          kinds: ["EXTERNAL"],
        }),
        verifiedRuntimeGate(runtimeGateRead.rows, "REAL_RESTORE", {
          allow_external: true,
          sha_bound: false,
          final_sha: finalSha,
          max_age_hours: 2160,
          kinds: ["EXTERNAL", "OPERATOR_EXERCISE"],
          resolve_real_restore_exercise_authority:resolveRealRestoreExerciseAuthority,
          resolve_real_restore_gate_authority:resolveRealRestoreGateAuthority,
        }),
        verifiedRuntimeGate(runtimeGateRead.rows, "DOCUMENT_GOLDEN_CORPUS", {
          allow_external: true,
          sha_bound: true,
          final_sha: finalSha,
          max_age_hours: 720,
          kinds: ["EXTERNAL", "REAL_RUNTIME"],
        }),
        verifiedRuntimeGate(runtimeGateRead.rows, "DEPENDENCY_MONITOR", {
          allow_external: true,
          sha_bound: true,
          final_sha: finalSha,
          max_age_hours: 168,
          kinds: ["EXTERNAL", "REAL_RUNTIME"],
        }),
      ]);
    const remoteBindingOk = Boolean(remoteCi?.external_run_id) &&
      String(remoteGate.external_run_id || "") ===
        String(remoteCi.external_run_id) &&
      String(remoteGate.git_sha || "") === finalSha;
    const verifiedRemoteCi = {
      ...remoteCi,
      status: remoteCi?.status === "PASS" && remoteGate.status === "PASS" &&
          remoteBindingOk
        ? "PASS"
        : "BLOCKED",
      evidence_integrity: remoteGate.evidence_integrity,
      evidence_integrity_blockers: [
        ...(remoteGate.evidence_integrity_blockers || []),
        ...(!remoteBindingOk
          ? ["remote_ci_runtime_gate_binding_mismatch"]
          : []),
      ],
    };
    const restoreExercise = newest(
      restoreRead.rows,
      (row) => row.status === "PASS",
      "completed_at",
    );
    let sloResult: any = {
      snapshots: [],
      runtime_identity: runtimeIdentity,
      runtime_identity_hash: parity.identity_hash || "",
      identity_validation: {
        ok: false,
        blockers: ["service_level_producer_failed"],
      },
    };
    try {
      sloResult = await produceServiceLevelSnapshots(svc, {
        environment: "production",
      });
    } catch (error: any) {
      coverageBlockers.push(
        `service_level_producer_failed:${
          String(error?.message || error).slice(0, 120)
        }`,
      );
    }
    for (const row of sloResult.snapshots || []) {
      if (row.coverage_status !== "COMPLETE") {
        coverageBlockers.push(
          ...(row.coverage_blockers ||
            [`slo_${row.slo_key}_coverage_incomplete`]),
        );
      }
      if (row.snapshot_integrity !== "VERIFIED") {
        coverageBlockers.push(
          ...(row.snapshot_integrity_blockers ||
            [`slo_${row.slo_key}_integrity_unverified`]),
        );
      }
    }
    const findings = [...findingsRead.rows];
    if (findingsRead.availability !== "COMPLETE") {
      findings.push({
        finding_id: "runtime_source_unavailable:production_findings",
        severity: "CRITICAL",
        status: "OPEN",
      });
    }
    // Re-run the REAL_RESTORE fence after all asynchronous SLO production and
    // immediately before deriving/persisting readiness. A compensation write
    // during those reads must turn the snapshot into NOT_GO, never leave a
    // previously selected PASS authoritative.
    const finalRestoreGate=await verifiedRuntimeGate([restoreGate], "REAL_RESTORE", {
      allow_external:true,
      sha_bound:false,
      final_sha:finalSha,
      max_age_hours:2160,
      kinds:["EXTERNAL","OPERATOR_EXERCISE"],
      resolve_real_restore_exercise_authority:resolveRealRestoreExerciseAuthority,
      resolve_real_restore_gate_authority:resolveRealRestoreGateAuthority,
    });
    const finalRestoreBindingOk=Boolean(restoreExercise?.id)&&
      String(finalRestoreGate?.details_json?.exercise_id||'')===String(restoreExercise.id);
    const finalVerifiedRestore={
      ...finalRestoreGate,
      status:finalRestoreGate.status==='PASS'&&finalRestoreBindingOk?'PASS':'BLOCKED',
      evidence_integrity:finalRestoreGate.evidence_integrity==='VERIFIED'&&finalRestoreBindingOk?'VERIFIED':'BLOCKED',
      evidence_integrity_blockers:[
        ...(finalRestoreGate.evidence_integrity_blockers||[]),
        ...(!finalRestoreBindingOk?['restore_runtime_gate_exercise_binding_mismatch']:[]),
      ],
    };
    const decision = evaluateProductionSeal({
      findings,
      final_sha: finalSha,
      local_checks: localChecksFromRemoteCi(verifiedRemoteCi, finalSha),
      remote_ci: verifiedRemoteCi,
      base44_runtime: verifiedParity,
      restore_exercise: finalVerifiedRestore,
      document_extraction_eval: documentGate,
      dependency_monitor: dependencyGate,
      runtime_identity: {
        status: parityVerification.ok ? "PASS" : "BLOCKED",
        identity_hash: parity.identity_hash || sloResult.runtime_identity_hash,
      },
      service_levels: sloResult.snapshots,
      source_coverage: {
        status: coverageBlockers.length ? "INCOMPLETE" : "COMPLETE",
        blockers: coverageBlockers,
        dependencies: coverage.map(publicSupervisorDependency),
      },
    });
    const now = new Date().toISOString(),
      identityHash = String(
        parity.identity_hash || sloResult.runtime_identity_hash || "",
      );
    const snapshotPayload = {
      snapshot_key: `p11:${finalSha || "UNVERIFIED"}:${now}:${
        identityHash.slice(0, 16) || "NO_IDENTITY"
      }`,
      git_sha: finalSha,
      runtime_identity_hash: identityHash,
      status: decision.status,
      technically_complete: decision.technically_complete,
      sealed: decision.sealed,
      internal_blockers: decision.internal_blockers,
      external_blockers: decision.external_blockers,
      failed_local_checks: decision.failed_local_checks,
      slo_status_json: {
        snapshots: sloResult.snapshots,
        note:
          "Only complete measured rows bound to this runtime identity can satisfy an SLO.",
      },
      decision_json: {
        ...decision,
        source_coverage: {
          status: coverageBlockers.length ? "INCOMPLETE" : "COMPLETE",
          blockers: coverageBlockers,
          dependencies: coverage.map(publicSupervisorDependency),
        },
      },
      version: decision.version,
      calculated_at: now,
    };
    const snapshot = await persistReadinessSnapshot(svc, snapshotPayload);
    return Response.json({ ok: true, snapshot });
  } catch (error) {
    schedulerOk = false;
    console.error(error);
    return Response.json({
      ok: false,
      error: "production_readiness_failed",
      health_status: "DEGRADED",
      readiness_status: "UNKNOWN",
      automated_action_allowed: false,
    }, { status: 500 });
  } finally {
    if (schedulerSvc && schedulerClaim) {
      await finishSchedulerRunOrThrow(schedulerSvc, schedulerClaim, {
        worker_key: "productionReadinessWorker",
      }, schedulerOk);
    }
  }
}
