import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(process.cwd());
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

describe("owned payments history detail contract", () => {
  const history = read("src/components/paymentsResults/ResultsHistory.jsx");
  const results = read("src/pages/PaymentsResults.jsx");
  const reader = read("base44/functions/getMyPaymentsHistory/entry.ts");
  const reportsHistory = read("src/components/reports/AuditHistoryList.jsx");

  it("deep-links history cards by owned result id, not a disposable session id", () => {
    expect(history).toContain("/Results?result=${encodeURIComponent(item.id)}");
    expect(history).not.toContain("/Results?session=${encodeURIComponent(item.anon_session_id)}");
    expect(results).toContain('const resultId = params.get("result")');
  });

  it("loads an owned result through the tenant-guarded backend reader", () => {
    expect(results).toMatch(/invoke\("getMyPaymentsHistory",\s*\{\s*result_id:\s*resultId\s*\}\)/);
    expect(reader).toContain("const OBJECT_ID = /^[0-9a-f]{24}$/i");
    expect(reader).toContain(".filter({ id: result_id, created_by: user.email }, '-created_date', 2)");
    expect(reader).toContain("normalizeEmail(candidate?.created_by) === email");
    expect(reader).toContain("if (!row || !row?.details?.engine_result)");
  });

  it("keeps legacy report summaries visible without linking them to a blank detail", () => {
    expect(reportsHistory).toContain("const hasDetail = !!r?.details?.engine_result");
    expect(reportsHistory).toContain("? <Link key={r.id} to={`/Results?result=${encodeURIComponent(r.id)}`}");
    expect(reportsHistory).not.toContain("/Results?id=");
  });

  it("returns each history amount with its own currency", () => {
    expect(reader).toContain("currency: r.currency || r.details?.input_snapshot?.currency || 'EUR'");
    expect(history).toContain('const currency = item.currency || "EUR"');
    expect(history).not.toContain("function fmtEUR");
  });
});

describe("key customer surfaces are localized", () => {
  const brand = read("src/components/paymentsAnalyzer/BrandBlock.jsx");
  const reports = read("src/components/reports/ReportsKPIStrip.jsx");
  const history = read("src/components/paymentsResults/ResultsHistory.jsx");

  it("has Spanish Analyzer brand copy", () => {
    expect(brand).toContain('about: "Sobre tu marca"');
    expect(brand).toContain('selectSector: "Selecciona un sector..."');
  });

  it("has Spanish Reports KPI copy", () => {
    expect(reports).toContain('latestOpportunity: "Última oportunidad"');
    expect(reports).toContain('dataQuality: "Calidad de datos"');
  });

  it("has Spanish history and action copy", () => {
    expect(history).toContain('title: "Historial de auditorías de pagos"');
    expect(history).toContain('openReport: "Abrir informe"');
  });
});

describe("Founder OS loading truthfulness", () => {
  const overview = read("src/pages/admin/AdminOverview.jsx");

  it("renders a retryable unavailable state instead of an endless spinner", () => {
    expect(overview).toContain('data-testid="founder-os-data-unavailable"');
    expect(overview).toContain("No incomplete totals are being shown");
    expect(overview).toContain("onClick={retryLoad}");
  });

  it("labels stale data after a refresh failure", () => {
    expect(overview).toContain("Displayed values are the last complete snapshot.");
  });
});
