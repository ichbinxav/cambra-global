import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
const report = JSON.parse(fs.readFileSync('docs/CAMBRA_EUROPE_V1_FINAL_SEAL_REPORT.json','utf8'));
describe('CAMBRA Europe V1 closure evidence', () => {
  it('contains exactly the canonical 33 markets', () => { expect(report.market_count).toBe(33); expect(report.market_matrix).toHaveLength(33); expect(new Set(report.market_matrix.map((x) => x.market)).size).toBe(33); });
  it('contains the required launch dimensions for every market', () => { for (const row of report.market_matrix) for (const key of ['launch_status','launch_readiness','market_attractiveness','data_maturity','p3_coverage','p4_maturity','p5_opportunity_maturity','p6_lead_availability','p7_commercial_readiness','p9_localization_readiness','p10_regulatory_readiness','p11_production_readiness','recommended_strategy','main_blocker','next_action','TECH_READY','DATA_READY','LOCALIZED','REGULATORY_READY','COMMERCIAL_READY','LAUNCH_READY']) expect(row).toHaveProperty(key); });
  it('does not fake closure while P10/P11 external evidence is absent', () => { expect(report.classification).toBe('EUROPE_V1_NOT_SEALED'); expect(report.final_status).toBe('P12 BLOCKED / NOT SEALED'); expect(report.market_matrix.every((x) => x.REGULATORY_READY === false && x.LAUNCH_READY === false)).toBe(true); expect(report.remote_ci).toBe('NOT_VERIFIED_FOR_FINAL_SHA'); });
});
