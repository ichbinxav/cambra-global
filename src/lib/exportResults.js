// Lightweight CSV (Excel-compatible) exporter for Analyzer results.
// Generates a multi-section file that Excel/Numbers/Sheets opens natively.

function esc(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Escape double-quotes and wrap if contains comma, quote or newline
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows) {
  return rows.map(r => r.map(esc).join(",")).join("\n");
}

export function buildResultsCsv({ brand, result, input, scoreReport, resultWithTpe }) {
  const total = result?.total_savings || 0;
  const score = scoreReport?.total ?? result?.infra_score ?? 0;
  const generated = new Date().toLocaleString();

  const sections = [];

  // Header
  sections.push(rowsToCsv([
    ["CAMBRA — Infrastructure Savings Report"],
    ["Generated", generated],
    ["Brand", brand?.name || "—"],
    ["Country", brand?.country || input?.country || "—"],
    ["Category", brand?.category || input?.category || "—"],
    [],
    ["Summary"],
    ["Metric", "Value"],
    ["Total annual savings (€)", total],
    ["Infrastructure Score", `${score}/100`],
    ["Monthly revenue (€)", input?.monthly_revenue ?? "—"],
    ["Avg order value (€)", input?.avg_order_value ?? "—"],
  ]));

  // Savings breakdown
  sections.push(rowsToCsv([
    [],
    ["Savings breakdown (annual)"],
    ["Category", "Estimated savings (€)"],
    ["Online Payments", resultWithTpe?.online_payment_savings || 0],
    ["In-Store / TPE", resultWithTpe?.tpe_savings || 0],
    ["Shipping", resultWithTpe?.shipping_savings || 0],
    ["SaaS & Tools", resultWithTpe?.saas_savings || 0],
    ["Insurance", resultWithTpe?.insurance_savings || 0],
    ["Total", total],
  ]));

  // Benchmarks
  const d = result?.details || {};
  sections.push(rowsToCsv([
    [],
    ["Benchmark comparison"],
    ["Metric", "Your value", "Network target", "Gap"],
    [
      "Payment fee (%)",
      d.payment_current_rate ?? "—",
      d.payment_optimal_rate ?? "—",
      d.payment_current_rate && d.payment_optimal_rate
        ? (d.payment_current_rate - d.payment_optimal_rate).toFixed(2)
        : "—",
    ],
    [
      "TPE effective rate (%)",
      d.tpe_effective_rate ?? "—",
      d.tpe_optimal_rate ?? "—",
      d.tpe_effective_rate && d.tpe_optimal_rate
        ? (d.tpe_effective_rate - d.tpe_optimal_rate).toFixed(2)
        : "—",
    ],
    [
      "Cost per shipment (€)",
      d.shipping_current_avg ?? "—",
      d.shipping_optimal_avg ?? "—",
      d.shipping_current_avg && d.shipping_optimal_avg
        ? (d.shipping_current_avg - d.shipping_optimal_avg).toFixed(2)
        : "—",
    ],
    [
      "SaaS spend monthly (€)",
      d.saas_current_total ?? input?.total_saas_spend ?? "—",
      d.saas_optimal_total ?? "—",
      d.saas_current_total && d.saas_optimal_total
        ? d.saas_current_total - d.saas_optimal_total
        : "—",
    ],
  ]));

  // Inputs snapshot
  if (input) {
    sections.push(rowsToCsv([
      [],
      ["Inputs snapshot"],
      ["Field", "Value"],
      ["Payment provider", input.payment_provider || "—"],
      ["Payment fee (%)", input.payment_fee_pct ?? "—"],
      ["Shipping provider", input.shipping_provider || "—"],
      ["Monthly shipping cost (€)", input.monthly_shipping_cost ?? "—"],
      ["Monthly shipments", input.monthly_shipments ?? "—"],
      ["TPE provider", input.tpe_provider || "—"],
      ["Terminal count", input.terminal_count ?? "—"],
      ["In-store GMV monthly (€)", input.in_store_gmv ?? "—"],
      ["SaaS spend monthly (€)", input.total_saas_spend ?? "—"],
      ["Insurance annual cost (€)", input.annual_insurance_cost ?? "—"],
    ]));
  }

  return sections.join("\n");
}

export function downloadCsv(filename, csvContent) {
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}