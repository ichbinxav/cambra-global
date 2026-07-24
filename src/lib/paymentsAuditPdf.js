// paymentsAuditPdf — builds the "Download audit" PDF from a payments
// engine_result. PURE presentation of real engine output — NOTHING invented.
//
// Every number comes from engine_result / input_snapshot verbatim (the same
// source the on-screen report reads). Handles both single-channel and combined
// (online + in-store) analyses: combined gets an aggregate summary page + one
// section per channel.
//
// Sections per the spec:
//   1. Header: brand, date, provider, country, channel, Estimated/Verified badge
//   2. Summary: score/grade, recoverable € + range, current → achievable rate
//   3. Rate decomposed: regulated floor + optimizable zone (with €)
//   4. Cost: total fees/yr, GMV, %, cost/tx, cross-border, card mix
//   5. Benchmark: your position vs peers (percentile)
//   6. Recovery roadmap: recoverable + routes
//   7. Method/confidence footer: assumptions, engine version, estimate note
//
// Uses jsPDF (already installed). Reuses the same derivation libs the UI uses
// (paymentsInsights, paymentsBenchmark, paymentsScore, paymentsRoadmap) so the
// PDF and the screen can never disagree.

import { jsPDF } from "jspdf";
import { derivePaymentsInsights } from "@/lib/paymentsInsights.js";
import { computePaymentsBenchmark } from "@/lib/paymentsBenchmark.js";
import { computePaymentsScore } from "@/lib/paymentsScore.js";
import { buildRecoveryRoadmap } from "@/lib/paymentsRoadmap.js";

const NAVY = [11, 16, 32];
const CYAN = [34, 150, 190];
const INK = [30, 36, 48];
const MUTED = [110, 122, 140];
const LINE = [222, 228, 236];

function eur(n) {
  if (!isFinite(n)) return "—";
  return "EUR " + Math.round(n).toLocaleString("en-US");
}
function pctFromBps(bps) {
  if (!isFinite(bps)) return "—";
  return (bps / 100).toFixed(2) + "%";
}
function providerLabel(slug) {
  if (!slug) return "—";
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Builds the PDF for one channel's engine_result. Returns the new y cursor.
// Reused for the single-channel doc and for each channel of a combined doc.
function renderAnalysisBody(doc, { engineResult, inputSnapshot, rateTable }, startY, t) {
  let y = startY;
  const L = 48;       // left margin
  const R = 547;      // right edge (A4 portrait ≈ 595pt wide)
  const pageH = 842;
  const ensure = (needed) => {
    if (y + needed > pageH - 60) { doc.addPage(); y = 60; }
  };

  const insights = derivePaymentsInsights(engineResult, inputSnapshot || {});
  const bench = computePaymentsBenchmark(engineResult, { rateTable, country: inputSnapshot?.country });
  const score = computePaymentsScore(engineResult);
  const roadmap = buildRecoveryRoadmap(engineResult, inputSnapshot || {}, rateTable);

  const annual = engineResult?.annual_savings_eur || {};
  const current = engineResult?.current_effective_bps;
  const achievable = engineResult?.achievable_effective_bps;

  const sectionTitle = (label) => {
    ensure(34);
    doc.setFontSize(9);
    doc.setTextColor(...CYAN);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), L, y);
    y += 6;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(L, y, R, y);
    y += 16;
  };
  const row = (label, value) => {
    ensure(18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(String(label), L, y);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.text(String(value), R, y, { align: "right" });
    y += 17;
  };

  // 2 — SUMMARY
  sectionTitle(t("pdf_sec_summary"));
  if (score?.available) row(t("pdf_score"), `${score.grade} (${score.score}/100)`);
  ensure(40);
  doc.setFontSize(22);
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.text(`${t("pdf_recoverable")}: ${eur(annual.point)}${t("pdf_per_yr")}`, L, y);
  y += 18;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(`${t("pdf_range")}: ${eur(annual.lo)} – ${eur(annual.hi)}`, L, y);
  y += 20;
  row(t("pdf_current_rate"), pctFromBps(current));
  row(t("pdf_achievable_rate"), pctFromBps(achievable));
  y += 6;

  // 3 — RATE DECOMPOSED (regulated floor + optimizable zone). Online only —
  // in-store has no auditable interchange split (currentRate.available=false).
  const cr = insights?.currentRate;
  if (cr?.available) {
    sectionTitle(t("pdf_sec_rate_decomposed"));
    row(t("pdf_regulated_floor"), `${pctFromBps(cr.hard_floor_bps)}  (${eur(cr.hard_floor_annual)}${t("pdf_per_yr")})`);
    row(t("pdf_optimizable_zone"), `${pctFromBps(cr.movable_bps)}  (${eur(cr.movable_annual)}${t("pdf_per_yr")})`);
    y += 6;
  }

  // 4 — COST
  sectionTitle(t("pdf_sec_cost"));
  if (insights?.totalFees?.available) row(t("pdf_total_fees"), `${eur(insights.totalFees.annual)}${t("pdf_per_yr")}`);
  if (insights?.gmvEffective?.available) {
    row(t("pdf_gmv"), eur(insights.gmvEffective.annual_gmv));
    row(t("pdf_effective_pct"), `${insights.gmvEffective.effective_pct.toFixed(2)}%`);
  }
  if (insights?.perTransaction?.available) row(t("pdf_cost_per_tx"), `EUR ${insights.perTransaction.cost_per_tx.toFixed(2)}`);
  if (insights?.crossBorder?.available) row(t("pdf_cross_border"), `${insights.crossBorder.intl_pct.toFixed(0)}%`);
  if (insights?.debitCredit?.available) {
    row(t("pdf_card_mix"), `${insights.debitCredit.debit_pct}% ${t("ins_cardmix_debit")} / ${insights.debitCredit.credit_pct}% ${t("ins_cardmix_credit")}`);
  }
  y += 6;

  // 5 — BENCHMARK
  if (bench?.available) {
    sectionTitle(t("pdf_sec_benchmark"));
    row(t("pdf_your_rate"), pctFromBps(bench.markers?.youBps));
    row(t("pdf_peer_median"), pctFromBps(bench.markers?.medianBps));
    row(t("pdf_top10"), pctFromBps(bench.markers?.top10Bps));
    // Same flip as the on-screen benchmark: at/below the peer median the
    // merchant is "cheaper than ~X%", not "most expensive ~X%".
    if (isFinite(bench.expensivePct)) {
      const cheaper = bench.cheaperSide;
      const posPct = cheaper ? bench.cheaperPct : bench.expensivePct;
      row(t("pdf_percentile"), t(cheaper ? "pdf_percentile_val_cheaper" : "pdf_percentile_val", { pct: posPct }));
    }
    y += 6;
  }

  // 6 — RECOVERY ROADMAP
  if (roadmap && roadmap.state === "savings_opportunity") {
    sectionTitle(t("pdf_sec_roadmap"));
    row(t("pdf_recoverable"), `${eur(roadmap.recoverable_annual?.point)}${t("pdf_per_yr")}`);
    (roadmap.recommendations || []).forEach((rec) => {
      ensure(16);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK);
      const title = rec.title_key ? t(rec.title_key) : (rec.title || "");
      doc.text(`•  ${title}`, L, y);
      y += 15;
    });
    y += 6;
  } else if (roadmap && roadmap.state === "already_optimized") {
    sectionTitle(t("pdf_sec_roadmap"));
    ensure(16);
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(t("pdf_toptier"), L, y);
    y += 21;
  }

  // 7 — METHOD / CONFIDENCE
  sectionTitle(t("pdf_sec_method"));
  const assumptions = Array.isArray(engineResult?.assumptions) ? engineResult.assumptions : [];
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  assumptions.forEach((a) => {
    const lines = doc.splitTextToSize(`•  ${a}`, R - L);
    ensure(lines.length * 11 + 4);
    doc.text(lines, L, y);
    y += lines.length * 11 + 3;
  });
  ensure(14);
  doc.text(`${t("pdf_engine_version")}: ${engineResult?.engine_version || "—"}`, L, y);
  y += 20;

  return y;
}

// Public — generate + trigger download. `data` = { engineResult, inputSnapshot,
// rateTable, brandName }. `t` = the translator from useTranslation().
export function downloadPaymentsAuditPdf({ engineResult, inputSnapshot, rateTable, brandName }, t) {
  if (!engineResult) return;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 48, R = 547;
  const isCombined = engineResult.combined === true && Array.isArray(engineResult.channels);
  const dateStr = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  const isVerified = engineResult.mode === "verified";

  // ── 1 — HEADER (shared) ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 595, 96, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("CAMBRA", L, 44);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(t("pdf_doc_title"), L, 64);
  doc.setFontSize(9);
  doc.setTextColor(180, 200, 220);
  const channelLabel = isCombined
    ? t("pdf_channel_combined")
    : (engineResult?.cohort?.channel === "in_store" ? t("analyzer_channel_in_store") : t("analyzer_channel_online"));
  const headerMeta = [
    brandName || "—",
    dateStr,
    providerLabel(inputSnapshot?.provider_slug),
    inputSnapshot?.country || "—",
    channelLabel,
  ].join("   ·   ");
  doc.text(headerMeta, L, 82);
  // Badge
  const badgeLabel = isVerified ? t("pdf_badge_verified") : t("pdf_badge_estimated");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const badgeW = doc.getTextWidth(badgeLabel) + 16;
  doc.setFillColor(...(isVerified ? [22, 130, 100] : [180, 130, 30]));
  doc.roundedRect(R - badgeW, 30, badgeW, 18, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(badgeLabel, R - badgeW / 2, 42, { align: "center" });

  let y = 128;

  if (isCombined) {
    // Aggregate summary first.
    doc.setFontSize(9);
    doc.setTextColor(...CYAN);
    doc.setFont("helvetica", "bold");
    doc.text(t("pdf_sec_aggregate").toUpperCase(), L, y);
    y += 6;
    doc.setDrawColor(...LINE);
    doc.line(L, y, R, y);
    y += 18;
    const a = engineResult.annual_savings_eur || {};
    doc.setFontSize(22);
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.text(`${t("pdf_recoverable")}: ${eur(a.point)}${t("pdf_per_yr")}`, L, y);
    y += 18;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(`${t("pdf_range")}: ${eur(a.lo)} – ${eur(a.hi)}`, L, y);
    y += 26;
    // One section per channel.
    engineResult.channels.forEach((ch) => {
      doc.addPage();
      y = 60;
      doc.setFontSize(13);
      doc.setTextColor(...NAVY);
      doc.setFont("helvetica", "bold");
      const chLabel = ch.channel === "in_store" ? t("analyzer_channel_in_store") : t("analyzer_channel_online");
      doc.text(chLabel.toUpperCase(), L, y);
      y += 22;
      y = renderAnalysisBody(doc, { engineResult: ch.engine_result, inputSnapshot: ch.input_snapshot, rateTable }, y, t);
    });
  } else {
    y = renderAnalysisBody(doc, { engineResult, inputSnapshot, rateTable }, y, t);
  }

  // Footer note on last page.
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(t("pdf_footer_note"), L, 815);

  const safeBrand = (brandName || "audit").replace(/[^a-z0-9]/gi, "-").toLowerCase();
  doc.save(`cambra-payments-audit-${safeBrand}.pdf`);
}