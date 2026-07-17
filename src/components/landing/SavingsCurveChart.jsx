import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Savings Curve — illustrative projection · R6 canonical recalibration (2026-07-13).
 *
 * Derived from the SINGLE CANONICAL REFERENCE BRAND (see Decision_Log ·
 * "Landing reference brand", identical to ProblemSectionWow):
 *
 *   GMV €1M/yr · current effective 2.21% · achievable 1.47% · gap 0.74 pts
 *   → overpaying   = €1M × 0.74% ≈ €7,400/yr
 *   → over 24 mo   = €7,400 × 2  ≈ €15,000    ← hero figure
 *   → per month    = €15,000 / 24 ≈ €625/mo   (fully ramped, what the code renders)
 *
 * The "+" on the hero acknowledges the ICP tail — brands closer to €2M GMV
 * project ~€30,000 over the same window (see `Range` copy in the footer).
 *
 * Historical notes preserved:
 *   - R2/R3: reframed from "LIVE · NETWORK MEDIAN / €48,000" (fabricated
 *     telemetry, off by ~8×) to "ILLUSTRATIVE · PROJECTION".
 *   - R4: recalibrated ProblemSectionWow to close the same gap from
 *     the "bleed" side.
 *   - R5: pushed the window from 12mo to 24mo to match the pricing model's
 *     declared recovery window.
 *   - R6 (this): unified the reference brand across the whole public
 *     surface. €6k/yr → €7,400/yr, €12k/24mo → €15,000, per-month €500 →
 *     €625, ICP tail €24k → €30k. All three headline figures (H2 "up to
 *     40%", ProblemSection €7,400/yr, this chart €15,000) now close the
 *     SAME account from €1M GMV. Any future gap change must re-derive
 *     ALL surfaces at once (see Decision_Log rule).
 *
 * Everything else honest: badge ILLUSTRATIVE · PROJECTION, verb "recovered
 * over 24 months" (the pricing window IS 24 months), cohort DTC €200k–€2M,
 * "run the analyzer for your real number".
 *
 * Curve *shape* stays organic and monotone — 24 points via cubic ease.
 * Axis ticks and stats strip stay derived from `target`; retunes only need
 * a single number.
 */

/**
 * Build a 24-point monotone cumulative curve using the same cubic ease-out
 * used for the 12-point original. Values in [0,1], last point = 1.
 * Extracted so future window changes only require touching `months`.
 */
function buildCurve(months) {
  const pts = [];
  for (let i = 0; i < months; i++) {
    const t = i / (months - 1);
    // Cubic ease-out — matches the organic feel of the previous hand-tuned array.
    const v = 1 - Math.pow(1 - t, 2.6);
    pts.push(Number(v.toFixed(4)));
  }
  return pts;
}

const DEFAULT_MONTHS = 24;
const DEFAULT_CURVE = buildCurve(DEFAULT_MONTHS);

export default function SavingsCurveChart({
  // €15,000 — €7,400/yr × 24mo window on the canonical reference brand
  // (€1M GMV, gap 0.74pts, engine `paymentsGap.js` v1.5.0). Value is the
  // commercial rounding of €14,800 to the nearest €1k for cleaner axis
  // ticks (€0 / €7.5K / €15K) and hero legibility. See file header for
  // the full arithmetic and Decision_Log for the canonical rule.
  target = 15000,
  months = DEFAULT_MONTHS,
  // 24-point monotone curve, cubic ease-out to 1.0.
  curve = DEFAULT_CURVE,
  className = "",
}) {
  const [progress, setProgress] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (hasAnimated) return;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { setHasAnimated(true); io.disconnect(); }
      }),
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasAnimated]);

  useEffect(() => {
    if (!hasAnimated) return;
    const duration = 2200;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasAnimated]);

  // Geometry
  const W = 640, H = 260;
  const PAD_L = 52, PAD_R = 24, PAD_T = 20, PAD_B = 36;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const points = useMemo(() => curve.map((v, i) => ({
    x: PAD_L + (i / (months - 1)) * innerW,
    y: PAD_T + (1 - v) * innerH,
    v,
  })), [curve, months, innerW, innerH]);

  const fullPath = useMemo(() => {
    if (!points.length) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const mx = (p0.x + p1.x) / 2;
      d += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  }, [points]);

  const areaPath = `${fullPath} L ${points[points.length - 1].x} ${PAD_T + innerH} L ${points[0].x} ${PAD_T + innerH} Z`;

  // Marker
  const idxFloat = progress * (months - 1);
  const i0 = Math.floor(idxFloat);
  const i1 = Math.min(months - 1, i0 + 1);
  const f = idxFloat - i0;
  const mx = points[i0].x + (points[i1].x - points[i0].x) * f;
  const my = points[i0].y + (points[i1].y - points[i0].y) * f;
  const mv = curve[i0] + (curve[i1] - curve[i0]) * f;
  const currentEUR = Math.round(mv * target);
  const currentMonth = Math.max(1, Math.round(idxFloat) + 1);

  const pathLengthApprox = 1200;
  const dashOffset = pathLengthApprox * (1 - progress);

  // Month labels — generated to match `months`. Only every 4th month rendered
  // on the X-axis (see label filter below) so 24 points don't overlap.
  const monthLabels = useMemo(
    () => Array.from({ length: months }, (_, i) => `M${i + 1}`),
    [months]
  );

  // Y-axis ticks derived from target — no manual sync needed on retunes.
  // Format: €0, €<half>, €<full>. For target=12000 → €0, €6K, €12K.
  const halfK = Math.round((target / 2) / 1000);
  const fullK = Math.round(target / 1000);
  const yTicks = [
    { r: 0,   label: "€0" },
    { r: 0.5, label: `€${halfK}K` },
    { r: 1,   label: `€${fullK}K+` },
  ].map(({ r, label }) => ({ y: PAD_T + (1 - r) * innerH, label }));

  // Hero figure carries a "+" because the reference brand is the ICP midpoint,
  // not the ceiling — brands at €2M GMV project ~2× this.
  const formatted = `€${currentEUR.toLocaleString("en-US")}+`;

  // Derived stat: €/month when fully ramped. €15,000 / 24 ≈ €625/mo.
  const perMonth = Math.round(target / months);
  const perMonthStr = perMonth >= 1000
    ? `€${(perMonth / 1000).toFixed(1)}k`
    : `€${perMonth}`;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* ===== Counter ===== */}
      <div className="relative z-10 mb-4 select-none">
        <p
          className="text-[10px] uppercase tracking-[0.24em] font-semibold mb-3"
          style={{ color: "var(--gris-2)" }}
        >
          Projected recovery · 24 months
        </p>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="font-black tabular-nums"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(40px, 6vw, 64px)",
              letterSpacing: "-0.045em",
              lineHeight: 1,
              /* DA v1.1 Chunk 1d — paper-first: sobre card blanca, menta grande
                 usa --menta-dark para contraste AA. */
              color: "var(--menta-dark)",
            }}
          >
            {formatted}
          </span>
          <span
            className="text-[12px] font-medium"
            style={{ color: "var(--gris-1)" }}
          >
            recovered over 24 months
          </span>
        </div>

        {/* Microcopy under the hero figure — anchors it emotionally: recovered
            money is bottom-line, not revenue. €7,400/yr against a typical
            10% net margin (€1M GMV → ~€100k profit) ≈ 7% of annual profit
            for the reference brand. "Without selling one more unit" is the
            point — this is pure margin, not top-line growth. */}
        <p
          className="mt-2 text-[11px] leading-snug"
          style={{ color: "var(--gris-1)" }}
        >
          ≈ 7% of annual profit — recovered without selling one more unit.
        </p>

        {/* Sober stats strip — recalibrated for €1M GMV ICP over 24-month window */}
        <div
          className="mt-4 grid grid-cols-3 gap-2 rounded-lg p-3"
          style={{
            background: "rgba(12,12,22,0.02)",
            border: "1px solid var(--linea)",
          }}
        >
          <div>
            <div
              className="font-bold tabular-nums"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "15px",
                letterSpacing: "-0.02em",
                lineHeight: 1,
                color: "var(--ink)",
              }}
            >
              {perMonthStr}
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-semibold mt-1.5" style={{ color: "var(--gris-2)" }}>
              /month
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--linea)" }} className="pl-3">
            <div
              className="font-bold tabular-nums"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "15px",
                letterSpacing: "-0.02em",
                lineHeight: 1,
                /* DA v1.1 Chunk 1d — paper-first: gap/negative → --coral. */
                color: "var(--coral)",
              }}
            >
              0.74pts
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-semibold mt-1.5" style={{ color: "var(--gris-2)" }}>
              rate saved
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--linea)" }} className="pl-3">
            <div
              className="font-bold tabular-nums"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "15px",
                letterSpacing: "-0.02em",
                lineHeight: 1,
                /* DA v1.1 Chunk 1d — paper-first: positive → --menta-dark (AA). */
                color: "var(--menta-dark)",
              }}
            >
              ~7%
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-semibold mt-1.5" style={{ color: "var(--gris-2)" }}>
              of profit
            </div>
          </div>
        </div>
      </div>

      {/* ===== Chart ===== */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Illustrative projection of cumulative payment recovery over 24 months"
      >
        <defs>
          <linearGradient id="curveStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5B4CF5" />
            <stop offset="55%" stopColor="#39C6F0" />
            <stop offset="100%" stopColor="#7BD9F0" />
          </linearGradient>
          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.22)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0)" />
          </linearGradient>
          {/* Soft halo around the endpoint marker — brighter than before */}
          <radialGradient id="endpointHalo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(34,211,238,0.55)" />
            <stop offset="60%" stopColor="rgba(34,211,238,0.10)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </radialGradient>
        </defs>

        {/* Grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y}
              stroke="rgba(12,12,22,0.08)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? "0" : "2 4"}
            />
            <text
              x={PAD_L - 10} y={t.y + 4}
              textAnchor="end"
              fill="rgba(12,12,22,0.45)"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* X labels — every 4th month for 24-point curve (M1, M5, M9, …, M24)
            so the axis stays legible without visual overlap. */}
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          if (i % 4 !== 0 && !isLast) return null;
          return (
            <text
              key={i}
              x={p.x} y={H - 12}
              textAnchor="middle"
              fill="rgba(12,12,22,0.40)"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {monthLabels[i]}
            </text>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#curveFill)" opacity={progress * 0.9} />

        {/* Curve */}
        <path
          d={fullPath}
          fill="none"
          stroke="url(#curveStroke)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: pathLengthApprox,
            strokeDashoffset: dashOffset,
            filter: "drop-shadow(0 0 6px rgba(34,211,238,0.35))",
          }}
        />

        {/* Endpoint halo — grows with progress */}
        {progress > 0.05 && (
          <circle
            cx={mx} cy={my} r={22}
            fill="url(#endpointHalo)"
            opacity={progress}
          />
        )}

        {/* Marker — minimal, brighter core */}
        <g>
          <circle cx={mx} cy={my} r="6" fill="#0b1020" stroke="rgba(34,211,238,1)" strokeWidth="1.75" />
          <circle cx={mx} cy={my} r="2.5" fill="#39C6F0" />
        </g>

        {/* Live M{n} pill riding the marker — only after ~15% progress so it
            doesn't appear stuck on M1 during the first frames. */}
        {progress > 0.15 && (
          <g transform={`translate(${mx + 12}, ${my - 10})`} opacity={progress}>
            <rect
              x="0" y="-9" width="30" height="16" rx="8"
              fill="rgba(11,16,32,0.85)"
              stroke="rgba(34,211,238,0.5)"
              strokeWidth="0.75"
            />
            <text
              x="15" y="2.5"
              textAnchor="middle"
              fill="#7BD9F0"
              fontSize="9"
              fontWeight="700"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
              letterSpacing="0.05em"
            >
              M{currentMonth}
            </text>
          </g>
        )}
      </svg>

      {/* ===== Footer meta — honest framing =====
          R6 canonical range — same 0.74pt gap on the canonical reference
          brand, extrapolated linearly to the ICP endpoints:
            €200k × 0.74% × 2mo  ≈ €3,000/24mo    (floor)
            €1M   × 0.74% × 2mo  ≈ €15,000/24mo   (midpoint · hero)
            €2M   × 0.74% × 2mo  ≈ €30,000/24mo   (ceiling)
          The "+" on the hero figure exists because the reference brand is
          the midpoint of the ICP, not its ceiling. */}
      <div
        className="mt-3 pt-3"
        style={{ borderTop: "1px solid var(--linea)" }}
      >
        <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--gris-2)" }}>
          <span className="font-mono">Cohort · DTC €200k–€2M</span>
          <span className="font-mono">Benchmark methodology</span>
        </div>
        <p
          className="mt-2 text-[11px] leading-snug"
          style={{ color: "var(--gris-1)" }}
        >
          <span className="font-semibold" style={{ color: "var(--ink)" }}>Range:</span>{" "}
          €3,000 to €30,000+ over 24 months depending on your volume
          (€200k–€2M GMV).
        </p>
        <p
          className="mt-1.5 text-[10.5px] leading-snug"
          style={{ color: "var(--gris-2)" }}
        >
          Illustrative — €1M GMV brand, 2.21% effective vs 1.47% achievable.
          Run the analyzer for your real number.
        </p>
      </div>
    </div>
  );
}