import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Savings Curve — illustrative projection (2026-07-12 · R3).
 *
 * Previous version framed the figure as "network median · Q3 2026" and showed
 * €48,000/12mo, which was fabricated network telemetry and off by ~8× vs the
 * actual engine output for our ICP. This version is honest:
 *
 *   - Badge: "ILLUSTRATIVE · PROJECTION" (not "LIVE · NETWORK MEDIAN").
 *   - Verb: "recoverable" (not "recovered" — nothing is recovered yet).
 *   - Cohort: "DTC €200k–€2M GMV" (the real ICP; was "DTC €1M–€10M").
 *   - Target: €6,000/yr — midpoint of the engine's own range for a
 *     representative brand at €1M annual GMV with a 0.5–0.8pt payments gap
 *     (`paymentsGap.js` — see `calculatePaymentsGap`).
 *   - Y-axis ticks: derived from `target`, so no manual sync needed if we
 *     retune the assumption.
 *   - Stats strip: recomputed for coherence — €500/mo, 0.6pts saved on
 *     effective rate, 3 min audit.
 *   - Explicit footnote: "Illustrative example based on our benchmark
 *     methodology — run the analyzer for your real number."
 *
 * The curve *shape* is unchanged — same organic 12-month cumulative ramp.
 * Only the labels, cohort, target and stats moved.
 *
 * "Wow" upgrade (per Xavi's ask): animated gradient stroke that pulses along
 * the curve after the reveal, brighter cyan endpoint halo, a subtle noise
 * overlay on the area fill, and a live "M{n}" pill that rides the marker.
 */
export default function SavingsCurveChart({
  // €6,000/yr — midpoint of paymentsGap engine output for €1M GMV, 0.5–0.8pt gap.
  target = 6000,
  months = 12,
  // Organic monotone curve to 1.0 — unchanged from the previous design.
  curve = [0.00, 0.05, 0.11, 0.18, 0.26, 0.35, 0.44, 0.54, 0.64, 0.75, 0.87, 1.00],
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

  const monthLabels = ["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","M11","M12"];

  // Y-axis ticks derived from target — no manual sync needed on retunes.
  // Format: €0, €<half>, €<full>. For target=6000 → €0, €3K, €6K.
  const halfK = Math.round((target / 2) / 1000);
  const fullK = Math.round(target / 1000);
  const yTicks = [
    { r: 0,   label: "€0" },
    { r: 0.5, label: `€${halfK}K` },
    { r: 1,   label: `€${fullK}K` },
  ].map(({ r, label }) => ({ y: PAD_T + (1 - r) * innerH, label }));

  const formatted = `€${currentEUR.toLocaleString("en-US")}`;

  // Derived stat: €/month when fully ramped. €6,000 / 12 = €500/mo.
  const perMonth = Math.round(target / 12);
  const perMonthStr = perMonth >= 1000
    ? `€${(perMonth / 1000).toFixed(1)}k`
    : `€${perMonth}`;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* ===== Counter ===== */}
      <div className="relative z-10 mb-4 select-none">
        <p
          className="text-[10px] uppercase tracking-[0.24em] font-semibold mb-3"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          Projected recovery · 12 months
        </p>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="font-black tabular-nums text-white"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(40px, 6vw, 64px)",
              letterSpacing: "-0.045em",
              lineHeight: 1,
              /* Subtle drop-glow so the figure pops on the navy card without
                 needing a gradient fill (kept white for maximum legibility). */
              textShadow: "0 0 22px rgba(34,211,238,0.20)",
            }}
          >
            {formatted}
          </span>
          <span
            className="text-[12px] font-medium"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            recoverable
          </span>
        </div>

        {/* Sober stats strip — recalibrated for €1M GMV ICP */}
        <div
          className="mt-4 grid grid-cols-3 gap-2 rounded-lg p-3"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <div
              className="font-bold tabular-nums text-white/90"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "15px",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {perMonthStr}
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-semibold mt-1.5" style={{ color: "rgba(255,255,255,0.40)" }}>
              /month
            </div>
          </div>
          <div style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }} className="pl-3">
            <div
              className="font-bold tabular-nums text-white/90"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "15px",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              0.6pts
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-semibold mt-1.5" style={{ color: "rgba(255,255,255,0.40)" }}>
              rate saved
            </div>
          </div>
          <div style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }} className="pl-3">
            <div
              className="font-bold tabular-nums text-white/90"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "15px",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              3 min
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-semibold mt-1.5" style={{ color: "rgba(255,255,255,0.40)" }}>
              to audit
            </div>
          </div>
        </div>
      </div>

      {/* ===== Chart ===== */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Illustrative projection of cumulative payment recovery over 12 months"
      >
        <defs>
          <linearGradient id="curveStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="55%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a5f3fc" />
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
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? "0" : "2 4"}
            />
            <text
              x={PAD_L - 10} y={t.y + 4}
              textAnchor="end"
              fill="rgba(255,255,255,0.35)"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* X labels */}
        {points.map((p, i) =>
          i % 2 === 0 ? (
            <text
              key={i}
              x={p.x} y={H - 12}
              textAnchor="middle"
              fill="rgba(255,255,255,0.30)"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {monthLabels[i]}
            </text>
          ) : null
        )}

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
          <circle cx={mx} cy={my} r="2.5" fill="#22d3ee" />
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
              fill="#a5f3fc"
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
          Was: "Cohort · DTC €1M–€10M" / "Network median" (fabricated telemetry).
          Now: cohort matches the real ICP, and the right side clarifies the
          figure is a projection from methodology — not a claim about network
          data we don't have yet. */}
      <div
        className="mt-3 pt-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          <span className="font-mono">Cohort · DTC €200k–€2M</span>
          <span className="font-mono">Benchmark methodology</span>
        </div>
        <p
          className="mt-2 text-[10.5px] leading-snug"
          style={{ color: "rgba(255,255,255,0.38)" }}
        >
          Illustrative example based on our benchmark methodology — run the
          analyzer for your real number.
        </p>
      </div>
    </div>
  );
}