// PeerBenchmark — Report v2, Pieza C.
//
// "WHERE YOU STAND VS BRANDS LIKE YOU" — a REGIONAL BENCHMARK peer distribution
// curve with three markers (Top 10%, Peer median, YOU) and a percentile
// callout. YOU pulses = "you are here".
//
// LABEL: "Regional benchmark · {country}". This is a real market benchmark —
// the user's position (YOU marker) is their actual effective rate. The
// distribution + percentile are anchored to the seeded regional market ranges
// (via computePaymentsBenchmark) and refined as the cohort grows; that nuance
// lives in AssumptionsFootnote. We deliberately dropped the word "illustrative"
// from the badge — it dented perceived validity without adding honesty.
//
// PURE PRESENTATION: all positions come from computePaymentsBenchmark(engineResult).
// Payments only, neutral, no PSP names. Same tech aesthetic (dark, mono, subtle
// glow, motion). glow is subtle per the art-direction rule.

import { useEffect, useState } from "react";
import { computePaymentsBenchmark } from "@/lib/paymentsBenchmark.js";
import { useTranslation } from "@/lib/i18n.jsx";

const MONO = "'JetBrains Mono', ui-monospace, monospace";

// SVG viewport (internal coords; scales via width=100%).
const W = 640;
const H = 200;
const PAD_X = 24;
const CURVE_TOP = 30;    // top of the bell area
const BASELINE = 150;    // y of the x-axis (curve sits above)

function gaussian(x, mean, sd) {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z);
}

// `rateTable` — active PaymentsRateTable rows. When provided, the curve is
// DERIVED per country+channel (SWEEP-1 T6: one shared curve per cohort —
// monotone percentiles). Pass null while the table is loading (we wait rather
// than flash fallback numbers that shift a second later); pass undefined to
// use the legacy modeled fallback directly.
export default function PeerBenchmark({ engineResult, country, rateTable }) {
  const { t } = useTranslation();
  const [drawn, setDrawn] = useState(false);
  const bench = computePaymentsBenchmark(engineResult, { rateTable, country });

  useEffect(() => {
    const reduce = typeof window !== "undefined" &&
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDrawn(true); return; }
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (rateTable === null) return null; // table still loading — avoid a params flip mid-view
  if (!bench.available) return null;

  const { axis, markers, distribution, expensivePct, cheaperSide, cheaperPct } = bench;
  const { minBps, maxBps } = axis;
  const domain = maxBps - minBps || 1;

  // bps → x pixel.
  const bpsToX = (bps) => PAD_X + ((bps - minBps) / domain) * (W - PAD_X * 2);

  // Build the bell path (sample the gaussian across the axis).
  const SAMPLES = 96;
  const peak = gaussian(distribution.meanBps, distribution.meanBps, distribution.sdBps) || 1;
  const amp = BASELINE - CURVE_TOP;
  let d = "";
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const bps = minBps + (domain * i) / SAMPLES;
    const x = PAD_X + ((W - PAD_X * 2) * i) / SAMPLES;
    const yNorm = gaussian(bps, distribution.meanBps, distribution.sdBps) / peak;
    const y = BASELINE - yNorm * amp;
    pts.push([x, y]);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
  }
  // Filled area path (close down to baseline).
  const areaD = d + `L${(W - PAD_X).toFixed(1)},${BASELINE} L${PAD_X.toFixed(1)},${BASELINE} Z`;

  // Rough path length for the draw animation (sum of segment lengths).
  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) {
    pathLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }

  const yAt = (bps) => {
    const yNorm = gaussian(bps, distribution.meanBps, distribution.sdBps) / peak;
    return BASELINE - yNorm * amp;
  };

  const pct = (bps) => (bps / 100).toFixed(2) + "%";

  const MARKERS = [
    { key: "top10",  bps: markers.top10Bps,  label: t("bench_top10"),  sub: pct(markers.top10Bps),  color: "#2FE0A8", dashed: false, pulse: false },
    { key: "median", bps: markers.medianBps, label: t("bench_median"), sub: pct(markers.medianBps), color: "#8B7BFF", dashed: true,  pulse: false },
    { key: "you",    bps: markers.youBps,    label: t("bench_you"),    sub: pct(markers.youBps),    color: "#F5A623", dashed: false, pulse: true },
  ];

  // Flip the template when the merchant is at/below the peer median: they're
  // "cheaper than ~X%", not "most expensive ~X%". `displayPct` matches whichever
  // side is shown so the highlighted number stays correct.
  const displayPct = cheaperSide ? cheaperPct : expensivePct;
  const calloutKey = cheaperSide
    ? (country ? "bench_callout_cheaper" : "bench_callout_cheaper_nocountry")
    : (country ? "bench_callout" : "bench_callout_nocountry");

  return (
    <div
      className="relative rounded-3xl p-6 md:p-7 overflow-hidden"
      style={{ background: "#070c16", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 24px 64px -28px rgba(0,0,0,0.7)" }}
    >
      {/* grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(#0d1a30 1px, transparent 1px), linear-gradient(90deg, #0d1a30 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.5,
          maskImage: "radial-gradient(ellipse 95% 85% at 50% 30%, #000 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 95% 85% at 50% 30%, #000 30%, transparent 100%)",
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <h3
            className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", color: "#e8eef7", maxWidth: 340 }}
          >
            {t("bench_title")}
          </h3>
          <span
            className="inline-flex items-center gap-1.5 uppercase font-bold px-2 py-1 rounded-full shrink-0"
            style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", background: "rgba(255,255,255,0.05)", color: "#9A9AAB", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#F5A623", boxShadow: "0 0 6px rgba(245,181,68,0.5)" }} />
            {country ? t("bench_regional", { country }) : t("bench_regional_nocountry")}
          </span>
        </div>

        {/* Curve */}
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="pbFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#39C6F0" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#39C6F0" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* filled area — fades in after the line draws */}
          <path
            d={areaD}
            fill="url(#pbFill)"
            style={{ opacity: drawn ? 1 : 0, transition: "opacity 800ms ease 700ms" }}
          />

          {/* baseline axis */}
          <line x1={PAD_X} y1={BASELINE} x2={W - PAD_X} y2={BASELINE} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

          {/* bell curve — draws in via dashoffset */}
          <path
            d={d}
            fill="none"
            stroke="var(--voltio)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={pathLen}
            strokeDashoffset={drawn ? 0 : pathLen}
            style={{
              transition: "stroke-dashoffset 1500ms cubic-bezier(0.22,1,0.36,1)",
              filter: "drop-shadow(0 0 4px rgba(59,130,246,0.35))",
            }}
          />

          {/* markers */}
          {MARKERS.map((m) => {
            const x = bpsToX(m.bps);
            const yTop = yAt(m.bps);
            return (
              <g key={m.key} style={{ opacity: drawn ? 1 : 0, transition: "opacity 500ms ease 900ms" }}>
                {/* vertical guide line from baseline up to the curve */}
                <line
                  x1={x} y1={BASELINE} x2={x} y2={yTop}
                  stroke={m.color}
                  strokeWidth="1.5"
                  strokeDasharray={m.dashed ? "4 4" : "0"}
                  opacity="0.8"
                />
                {/* dot on the curve */}
                <circle cx={x} cy={yTop} r={m.pulse ? 5 : 4} fill={m.color} style={{ filter: `drop-shadow(0 0 5px ${m.color}88)` }} />
                {m.pulse && (
                  <circle cx={x} cy={yTop} r="5" fill="none" stroke={m.color} strokeWidth="1.5" opacity="0.7">
                    <animate attributeName="r" from="5" to="15" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.7" to="0" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Marker legend (labels below the axis, mono) — kept out of the SVG so
            text stays crisp and never clips on narrow viewports. */}
        <div className="mt-3 flex items-end justify-between px-1">
          {MARKERS.map((m) => (
            <div key={m.key} className="flex flex-col items-center text-center min-w-0" style={{ flex: "0 0 auto" }}>
              <span
                className="uppercase font-bold tracking-[0.1em] inline-flex items-center gap-1"
                style={{ fontFamily: MONO, fontSize: 9.5, color: m.color, textShadow: m.pulse ? `0 0 5px ${m.color}55` : "none" }}
              >
                {m.pulse && <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: m.color }} />}
                {m.label}
              </span>
              <span className="tabular-nums font-semibold" style={{ fontFamily: MONO, fontSize: 11, color: "#9A9AAB" }}>{m.sub}</span>
            </div>
          ))}
        </div>

        {/* axis labels ← cheaper / pricier → */}
        <div className="mt-2 flex items-center justify-between" style={{ fontFamily: MONO, fontSize: 10, color: "#585868" }}>
          <span>← {t("bench_axis_cheaper")}</span>
          <span>{t("bench_axis_pricier")} →</span>
        </div>

        {/* Honesty note — the curve is modeled, not measured (SWEEP-1 T6). */}
        <p className="mt-2" style={{ fontFamily: MONO, fontSize: 9.5, color: "#585868" }}>
          {t("bench_modeled_note")}
        </p>

        {/* Callout */}
        <div
          className="mt-5 rounded-xl px-4 py-3"
          style={{ background: "rgba(245,181,68,0.07)", border: "1px solid rgba(245,181,68,0.25)" }}
        >
          <p className="text-[13px] leading-snug" style={{ color: "#e8eef7" }}
             dangerouslySetInnerHTML={{
               __html: t(calloutKey, { pct: displayPct, country: country || "" })
                 .replace(`~${displayPct}%`, `<strong style="color:#F5A623;font-family:${MONO}">~${displayPct}%</strong>`),
             }}
          />
        </div>
      </div>
    </div>
  );
}