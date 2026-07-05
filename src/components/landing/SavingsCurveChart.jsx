import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Savings Curve — editorial redesign.
 * Calm, credible, network-median framing. No sparkles, no +100% pill, no
 * fluorescent tickers, no floating particles. One line, one endpoint, one
 * number. Realistic cohort figures.
 */
export default function SavingsCurveChart({
  // Realistic median cumulative recovery over 12 months for a DTC €1M–€10M brand.
  // Payments + Shipping + SaaS combined, network-median (not top-decile).
  target = 48000,
  months = 12,
  // Slight organic wave, monotonically increasing to 1.0.
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

  const pathLengthApprox = 1200;
  const dashOffset = pathLengthApprox * (1 - progress);

  const monthLabels = ["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","M11","M12"];
  const yTicks = [0, 0.5, 1].map((r) => ({
    y: PAD_T + (1 - r) * innerH,
    label: r === 0 ? "€0" : `€${Math.round((r * target) / 1000)}K`,
  }));

  const formatted = `€${currentEUR.toLocaleString("en-US")}`;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* ===== Counter ===== */}
      <div className="relative z-10 mb-4 select-none">
        <p
          className="text-[10px] uppercase tracking-[0.24em] font-semibold mb-3"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          Median recovery · 12 months
        </p>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="font-black tabular-nums text-white"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(40px, 6vw, 64px)",
              letterSpacing: "-0.045em",
              lineHeight: 1,
            }}
          >
            {formatted}
          </span>
          <span
            className="text-[12px] font-medium"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            recovered
          </span>
        </div>

        {/* Sober stats strip */}
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
              €4.0k
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
              15%
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-semibold mt-1.5" style={{ color: "rgba(255,255,255,0.40)" }}>
              cost cut
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
        aria-label="Median cumulative recovery over 12 months"
      >
        <defs>
          <linearGradient id="curveStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.18)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0)" />
          </linearGradient>
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
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: pathLengthApprox,
            strokeDashoffset: dashOffset,
          }}
        />

        {/* Marker — minimal */}
        <g>
          <circle cx={mx} cy={my} r="5" fill="#0b1020" stroke="rgba(34,211,238,0.9)" strokeWidth="1.5" />
          <circle cx={mx} cy={my} r="2" fill="#22d3ee" />
        </g>
      </svg>

      {/* ===== Footer meta ===== */}
      <div
        className="mt-3 flex items-center justify-between gap-3 pt-3 text-[11px]"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}
      >
        <span className="font-mono">Cohort · DTC €1M–€10M</span>
        <span className="font-mono">Network median</span>
      </div>
    </div>
  );
}