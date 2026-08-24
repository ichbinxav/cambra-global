import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('P6 · continuous commercial intelligence wiring', () => {
  const worker = read('base44/functions/alwaysOnLeadDiscoveryWorker/entry.ts');
  const schema = JSON.parse(read('base44/entities/CommercialIntelligenceSnapshot.jsonc'));

  it('persists market sizing, Top 100/1000, lead graph, forecast, learning and unknowns', () => {
    for (const field of ['market_sizing_json', 'prioritization_json', 'lead_graph_json', 'forecast_json', 'learning_json', 'data_quality_json', 'source_coverage_json', 'unknowns']) {
      expect(schema.properties[field]).toBeDefined();
    }
    expect(worker).toContain('buildCommercialIntelligence(leads, policy)');
    expect(worker).toContain('CommercialIntelligenceSnapshot.create');
  });

  it('keeps discovery capacity distinct from sending capacity', () => {
    expect(worker).toContain('safe_daily_send_capacity');
    expect(worker).not.toMatch(/commercialSendMessage|outboundVolumeWorker|resend\.emails|outlook.*send/i);
  });

  it('blocks paid external discovery in safe mode and cannot re-qualify a duplicate in the same run', () => {
    expect(worker).toContain('!emergency.safe_mode');
    expect(worker).toContain("'safe_mode_no_external_discovery'");
    expect(worker).toContain('duplicateLeadIds.add(lead.id)');
    expect(worker).toContain('duplicateLeadIds.has(lead.id)');
  });

  it('records source coverage rather than claiming it scanned all Europe', () => {
    expect(worker).toContain('countries_this_run');
    expect(read('base44/shared/commercialIntelligence.ts')).toContain('claimed_continuous_universe_coverage: false');
  });
});

describe('P7 · autonomous commercial truth and forecast', () => {
  const founderData = read('base44/shared/founderOSData.ts');

  it('uses the real lead stage fields for conversion instead of the nonexistent status field', () => {
    expect(founderData).toContain("String(x.revenue_stage||x.stage)==='won'");
    expect(founderData).not.toContain("String(x.status)==='won'");
  });

  it('excludes unknown values from weighted pipeline and exposes their count', () => {
    expect(founderData).toContain('weightedPipelineKnown');
    expect(founderData).toContain('unknown_value_count:leads.length-weightedPipelineKnown');
  });

  it('retains existing human gates around material commercial commitments', () => {
    const authority = read('base44/shared/commercialAutonomy.ts');
    const negotiation = read('base44/functions/providerNegotiationAgent/entry.ts');
    expect(authority).toMatch(/L4_CLASSIFICATIONS|material/i);
    expect(negotiation).toMatch(/action_type:\s*["']final_provider_deal["']/);
    expect(negotiation).toMatch(/status:\s*["']waiting_approval["']/);
  });
});

describe('P8 · company nervous system', () => {
  const orchestrator = read('base44/shared/logical/autonomousCompanyOrchestrator.ts');
  const automation = JSON.parse(read('base44/functions/autonomousCompanyOrchestrator/function.jsonc'));

  it('coordinates intelligence, pipeline learning and executive state on a durable schedule', () => {
    for (const worker of ['alwaysOnLeadDiscoveryWorker', 'salesPipelineWorker', 'outreachExperimentLearningWorker', 'executiveDigestWorker']) {
      expect(orchestrator).toContain(`'${worker}'`);
    }
    expect(automation.automations[0]).toMatchObject({ is_active: true, repeat_unit: 'hours', repeat_interval: 6 });
    expect(orchestrator).toContain("event_type: 'company.coordination.completed'");
    expect(orchestrator).toContain('observation_only: true');
    expect(orchestrator).not.toContain('service.functions.invoke(');
  });

  it('does not invoke external sending or material execution', () => {
    expect(orchestrator).not.toMatch(/commercialSendMessage|outboundVolumeWorker|providerNegotiationAgent|createEligibleRecoverInvoices|startPaymentsMigration|stripeBillingWebhook/);
    expect(orchestrator).toContain('material_execution_invoked: false');
  });

  it('turns evidence into a reversible founder proposal, never an automatic strategy mutation', () => {
    expect(orchestrator).toContain("decision_type: 'market_priority'");
    expect(orchestrator).toContain("recommended_option: 'research'");
    expect(orchestrator).toContain("reversibility: 'reversible'");
    expect(orchestrator).toContain("status: 'open'");
    expect(orchestrator).not.toMatch(/CommercialPolicy\.(update|delete)/);
  });

  it('projects P6 intelligence and open decisions into Founder OS', () => {
    const founderData = read('base44/shared/founderOSData.ts');
    expect(founderData).toContain('commercial_intelligence:commercial[0]||null');
    expect(founderData).toContain('open_founder_decisions:decisions.slice(0,100)');
  });
});
