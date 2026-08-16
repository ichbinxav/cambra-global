import { RECOVERY_ECONOMICS_V2 } from "./recoveryEconomicsV2.ts";
import { requireCriticalOperation } from "./criticalExecution.ts";

export class RecoverEconomicMandateAuthorityError extends Error {
  code = "RECOVER_ECONOMIC_MANDATE_AUTHORITY_AMBIGUOUS";
  operation: string;
  count: number;

  constructor(operation: string, count: number) {
    super(`${operation}_ambiguous`);
    this.name = "RecoverEconomicMandateAuthorityError";
    this.operation = operation;
    this.count = count;
  }
}

async function exactMandateOrNull(
  svc: any,
  query: Record<string, unknown>,
  operation: string,
) {
  const rows = await requireCriticalOperation(
    operation,
    () => svc.entities.Mandate.filter(query, "-created_date", 2),
  );
  if (!Array.isArray(rows)) {
    throw new RecoverEconomicMandateAuthorityError(operation, -1);
  }
  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    throw new RecoverEconomicMandateAuthorityError(operation, rows.length);
  }
  return rows[0];
}

// Resolves the contract that governs economic billing. Before V2 activation an
// ACTIVE mandate is mandatory. Once a V2 Recover is evidenced and activated,
// DealActivation.recovery_mandate_id freezes the exact accepted contract whose
// economic term survives later operational/service cancellation or revocation.
export async function resolveRecoverEconomicMandate(svc: any, activation: any) {
  if (!activation?.id) return null;
  if (
    activation.recovery_economics_version === RECOVERY_ECONOMICS_V2 &&
    activation.economic_right_status === "active" &&
    activation.recovery_mandate_id
  ) {
    const m = await exactMandateOrNull(
      svc,
      { id: activation.recovery_mandate_id },
      "recover_pinned_economic_mandate_read",
    );
    if (
      m?.signed_at &&
      m?.acceptance_snapshot_json?.recovery_economics?.version ===
        RECOVERY_ECONOMICS_V2
    ) return m;
    return null; // fail closed: an active economic right without its pinned contract is a hard data-integrity failure.
  }
  return exactMandateOrNull(
    svc,
    { deal_activation_id: activation.id, status: "active" },
    "recover_active_economic_mandate_read",
  );
}
