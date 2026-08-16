import {
  readSingletonAuthority,
  type SingletonAuthorityRead,
} from "./singletonAuthority.ts";
import { recoverCasUpdatedExactlyOne } from "./recoverAcceptance.ts";
import { hashCalculation } from "./recoverBillingMath.ts";

// `void` reports are historical artifacts, not contenders for the economic
// authority of an activation/month. Every other schema-valid status remains in
// scope so a stale/pending duplicate blocks instead of being silently ignored.
export const RECOVER_REPORT_AUTHORITY_STATUSES = [
  "pending",
  "calculated",
  "invoiced",
  "paid",
] as const;

export type RecoverReportAuthorityRead = SingletonAuthorityRead<any> & {
  expected_report_id: string | null;
  canonical_report_id: string | null;
};

/**
 * Domain projection of the existing singleton authority primitive.
 *
 * It creates no claim, row or second control plane. The authority remains the
 * set of non-void MonthlySavingsReport rows for one activation/month. A second
 * row is split-brain and blocks approval and every Stripe provider effect.
 */
export async function readRecoverReportAuthority(
  svc: any,
  input: {
    dealActivationId: string;
    month: string;
    expectedReportId?: string | null;
  },
): Promise<RecoverReportAuthorityRead> {
  const dealActivationId = String(input.dealActivationId || "").trim();
  const month = String(input.month || "").trim();
  const expectedReportId = String(input.expectedReportId || "").trim() || null;
  if (!dealActivationId || !month) {
    return {
      ok: false,
      status: "UNAVAILABLE",
      row: null,
      rows: [],
      count: 0,
      authority: "recover_report",
      blocker: "recover_report_scope_invalid",
      expected_report_id: expectedReportId,
      canonical_report_id: null,
    };
  }

  const authority = await readSingletonAuthority<any>(svc, {
    entity: "MonthlySavingsReport",
    query: {
      deal_activation_id: dealActivationId,
      month,
      status: { $in: [...RECOVER_REPORT_AUTHORITY_STATUSES] },
    },
    sort: "-created_date",
    authority: "recover_report",
  });
  const canonicalReportId = authority.ok
    ? String(authority.row?.id || "").trim() || null
    : null;
  if (
    authority.ok && expectedReportId &&
    canonicalReportId !== expectedReportId
  ) {
    return {
      ...authority,
      ok: false,
      row: null,
      blocker: "recover_report_authority_mismatch",
      expected_report_id: expectedReportId,
      canonical_report_id: canonicalReportId,
    };
  }
  return {
    ...authority,
    expected_report_id: expectedReportId,
    canonical_report_id: canonicalReportId,
  };
}

export async function requireCanonicalRecoverReport(
  svc: any,
  input: {
    dealActivationId: string;
    month: string;
    reportId: string;
  },
) {
  const authority = await readRecoverReportAuthority(svc, {
    dealActivationId: input.dealActivationId,
    month: input.month,
    expectedReportId: input.reportId,
  });
  if (authority.ok && authority.row) return authority.row;
  const error: any = new Error(
    authority.blocker || "recover_report_authority_unavailable",
  );
  error.code = "RECOVER_REPORT_AUTHORITY_BLOCKED";
  error.status = 409;
  error.authority_state = authority;
  throw error;
}

/**
 * Exact CAS + exact postcondition for the admin approval projection. Unknown or
 * contradictory SDK counters never become permission, and an acknowledged
 * write is not reported as complete until every persisted field is observed.
 */
export async function persistRecoverReportApprovalDecision(
  svc: any,
  original: any,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; reason?: string; report?: any }> {
  if (!original?.updated_date) {
    return { ok: false, reason: "report_version_missing" };
  }
  const rows = await svc.entities.MonthlySavingsReport.filter(
    { id: original.id },
    "-created_date",
    2,
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    return { ok: false, reason: "report_authority_unavailable" };
  }
  const fresh = rows[0];
  if (
    String(fresh.updated_date || "") !== String(original.updated_date) ||
    String(fresh.billing_eligibility_status || "") !==
      String(original.billing_eligibility_status || "") ||
    String(fresh.invoice_id || "") !== String(original.invoice_id || "")
  ) {
    return { ok: false, reason: "report_changed_retry" };
  }
  const casFilter: Record<string, unknown> = {
    id: original.id,
    updated_date: original.updated_date,
  };
  for (
    const key of [
      "billing_eligibility_status",
      "invoice_id",
      "verification_status",
      "calculation_hash",
    ]
  ) {
    if (original[key] !== undefined) casFilter[key] = original[key];
  }
  const persistedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  const changed = await svc.entities.MonthlySavingsReport.updateMany(
    casFilter,
    { $set: persistedPatch },
  );
  if (!recoverCasUpdatedExactlyOne(changed)) {
    return { ok: false, reason: "report_cas_result_ambiguous" };
  }
  const readbackRows = await svc.entities.MonthlySavingsReport.filter(
    { id: original.id },
    "-created_date",
    2,
  );
  if (!Array.isArray(readbackRows) || readbackRows.length !== 1) {
    return { ok: false, reason: "report_approval_readback_unavailable" };
  }
  const readback = readbackRows[0];
  for (const [key, expected] of Object.entries(persistedPatch)) {
    if (
      await hashCalculation(readback[key] ?? null) !==
        await hashCalculation(expected ?? null)
    ) {
      return {
        ok: false,
        reason: `report_approval_readback_mismatch:${key}`,
      };
    }
  }
  return { ok: true, report: readback };
}
