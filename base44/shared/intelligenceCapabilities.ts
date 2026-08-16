const RESEARCH_READ_ACTIONS=['search_research_knowledge','research_source_summary','research_persistence_plan'];
export const INTELLIGENCE_CAPABILITIES=Object.freeze({
 provider_intelligence:new Set(['record_evidence','record_observation','upsert_claim','pricing_at_date','current_pricing','create_snapshot',...RESEARCH_READ_ACTIONS]),
 analyzer:new Set(['pricing_at_date','current_pricing','get_benchmark','create_snapshot',...RESEARCH_READ_ACTIONS]),
 negotiation:new Set(['pricing_at_date','current_pricing','get_benchmark','get_comparable_outcomes','create_snapshot','record_outcome',...RESEARCH_READ_ACTIONS]),
 migration:new Set(['create_snapshot','record_outcome']),
 verification:new Set(['create_snapshot','record_outcome']),
 moat:new Set(RESEARCH_READ_ACTIONS),
 moat_curator:new Set(['pricing_at_date','current_pricing',...RESEARCH_READ_ACTIONS]),
 knowledge_integrity:new Set(['pricing_at_date','current_pricing',...RESEARCH_READ_ACTIONS]),
});
export function capabilityAllows(capability:string,action:string){return !!INTELLIGENCE_CAPABILITIES[capability as keyof typeof INTELLIGENCE_CAPABILITIES]?.has(action)}
