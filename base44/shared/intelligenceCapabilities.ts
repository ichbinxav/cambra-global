export const INTELLIGENCE_CAPABILITIES=Object.freeze({
 provider_intelligence:new Set(['record_evidence','record_observation','upsert_claim','pricing_at_date','current_pricing','create_snapshot']),
 analyzer:new Set(['pricing_at_date','current_pricing','create_snapshot']),
 negotiation:new Set(['pricing_at_date','current_pricing','create_snapshot','record_outcome']),
 migration:new Set(['create_snapshot','record_outcome']),
 verification:new Set(['create_snapshot','record_outcome']),
 moat_curator:new Set(['pricing_at_date','current_pricing']),
 knowledge_integrity:new Set(['pricing_at_date','current_pricing']),
});
export function capabilityAllows(capability:string,action:string){return !!INTELLIGENCE_CAPABILITIES[capability as keyof typeof INTELLIGENCE_CAPABILITIES]?.has(action)}
