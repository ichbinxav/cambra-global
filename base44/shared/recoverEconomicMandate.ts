import { RECOVERY_ECONOMICS_V2 } from './recoveryEconomicsV2.ts';

// Resolves the contract that governs economic billing. Before V2 activation an
// ACTIVE mandate is mandatory. Once a V2 Recover is evidenced and activated,
// DealActivation.recovery_mandate_id freezes the exact accepted contract whose
// economic term survives later operational/service cancellation or revocation.
export async function resolveRecoverEconomicMandate(svc:any, activation:any){
  if (!activation?.id) return null;
  if (activation.recovery_economics_version === RECOVERY_ECONOMICS_V2 &&
      activation.economic_right_status === 'active' && activation.recovery_mandate_id) {
    const pinned = await svc.entities.Mandate.filter({ id: activation.recovery_mandate_id }, '-created_date', 1).catch(()=>[]);
    const m = pinned?.[0] || null;
    if (m?.signed_at && m?.acceptance_snapshot_json?.recovery_economics?.version === RECOVERY_ECONOMICS_V2) return m;
    return null; // fail closed: an active economic right without its pinned contract is a hard data-integrity failure.
  }
  const active = await svc.entities.Mandate.filter({ deal_activation_id: activation.id, status: 'active' }, '-created_date', 1).catch(()=>[]);
  return active?.[0] || null;
}
