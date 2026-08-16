import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync('src/pages/admin/AdminMerchants.jsx', 'utf8');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const layout = fs.readFileSync('src/pages/admin/AdminLayout.jsx', 'utf8');

describe('Founder/Admin Merchants V2 UI contract', () => {
  it('adds one lazy Founder/Admin route and localized navigation without a new backend resource', () => {
    expect(app).toContain("const AdminMerchants = lazy(() => import('@/pages/admin/AdminMerchants'))");
    expect(app).toContain('path="/admin/merchants"');
    expect(layout).toContain('{ path: "/admin/merchants", label: "Merchants"');
    expect(layout).toContain('"nav.Merchants": "Marchands"');
    expect(layout).toContain('"nav.Merchants": "Merchants"');
    expect(page).toContain('base44.functions.invoke("getFounderControlCenter", { view:"merchants"');
    expect(page).not.toContain('base44.entities.');
  });

  it('renders the exact 12 KPI and 12 lazy merchant-block architecture', () => {
    for (const key of [
      'total_merchants','active_merchants','total_payment_volume','average_payment_cost',
      'potential_savings','verified_savings','realized_savings','cambra_revenue',
      'recover_active','needs_attention','average_data_confidence','new_merchants',
    ]) expect(page).toContain(`${key}:`);
    for (const key of [
      'overview','payments_infrastructure','analyzer_opportunities','recover_savings',
      'data_documents','cambra_activity','attention_approvals','company_contacts',
      'billing_revenue','contracts_legal','communications','technical_audit',
    ]) expect(page).toContain(`"${key}"`);
    expect(page).toContain('callMerchants("merchant_block"');
    expect(page).toContain('loadBlock(row.id,key)');
    expect(page).toContain('openBlocks[definition[0]]');
  });

  it('keeps deterministic controls and conservative read-only global actions', () => {
    for (const action of ['"portfolio"','"kpi_detail"','"compare"','"export"','"save_view"','"delete_view"']) {
      expect(page).toContain(action);
    }
    expect(page).toContain('compare_requires_2_to_5_merchants');
    expect(page).toContain('selected.size<2||selected.size>5');
    expect(page).toContain('new Blob([data.content||""]');
    expect(page).not.toMatch(/bulk_(approve|reject|delete|send)/i);
  });

  it('uses canonical contextual Ask CAMBRA descriptors and never sends browser metrics', () => {
    expect(page).toContain('context_scope:"MERCHANT_PORTFOLIO"');
    expect(page).toContain('merchant_context:context');
    expect(page).toContain('conversation_history:conversationHistory');
    expect(page).toContain('messages.slice(-12)');
    expect(page).toContain('slice(0,2000)');
    expect(page).toContain('context_level:"KPI"');
    expect(page).toContain('context_level:"SEGMENT"');
    expect(page).toContain('context_level:"MERCHANT"');
    expect(page).not.toContain('merchantPortfolioContext:');
    expect(page).not.toContain('client_context_authoritative:true');
  });

  it('renders specialist drilldowns and fail-closed unavailable merchant values', () => {
    expect(page).toContain('breakdown.potential_savings');
    expect(page).toContain('breakdown.revenue');
    expect(page).toContain('breakdown.data_confidence');
    expect(page).toContain('breakdown.direct_founder_decisions');
    expect(page).toContain('source_coverage?.verified_savings==="UNAVAILABLE"');
    expect(page).toContain('row.needs_attention==null?t("unavailable")');
  });

  it('routes approval decisions to canonical Founder Approvals instead of mutating inline', () => {
    expect(page).toContain('to="/admin/approvals"');
    expect(page).not.toContain('founderOSCommand');
    expect(page).not.toMatch(/onClick=\{[^}]*approve/i);
    expect(page).not.toMatch(/onClick=\{[^}]*reject/i);
  });

  it('includes EN/FR/ES copy, responsive 3-column KPI rows and honest unknown states', () => {
    expect(page).toContain('export const MERCHANTS_V2_COPY');
    expect(page).toContain('fr: {');
    expect(page).toContain('es: {');
    expect(page).toContain('md:grid-cols-3');
    expect(page).toContain('No canonical evidence');
    expect(page).toContain('CAMBRA no convierte prospects en merchants');
    expect(page).toContain('Unknown values remain unknown');
  });
});
