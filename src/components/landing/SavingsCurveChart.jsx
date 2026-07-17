import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Savings Curve — illustrative projection.
 * Canonical reference brand: GMV €1M/yr · current 2.21% · achievable 1.47%
 * · gap 0.74 pts → ~€7,400/yr → ~€15,000 over 24 months.
 * Organic monotone 24-point cubic ease-out curve, animated on scroll.
 */

function buildCurve(months) {
  const pts = [];
  for (let i = 0; i < months; i++) {
    const t = months > 1 ? i / (months - 1) : 1;
    const v = 1 - Math.pow(1 - t, 2.6);
    pts.push(Number(v.toFixed(4)));
  }
  return pts;
}

const DEFAULT_MONTHS = 24;
const DEFAULT_CURVE = buildCurve(DEFAULT_MONTHS);

export default function SavingsCurveChart({
  target = 15000,
  months = DEFAULT_MONTHS,
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

  // Geometry — smaller viewBox = SVG text renders proportionally LARGER
  // once the chart scales to full width.
  const W = 440, H = 240;
  const PAD_L = 54, PAD_R = 22, PAD_T = 18, PAD_B = 40;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const points = useMemo(() => curve.map((v, i) => ({
    x: PAD_L + (months > 1 ? i / (months - 1) : 0) * innerW,
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

  // Guard: if for any reason we have no points, render nothing rather than crash.
  if (!points.length) {
    return <div ref={wrapRef} className={className} style={{ minHeight: 200 }} />;
  }

  const lastPoint = points[points.length - 1];
  const areaPath = `${fullPath} L ${lastPoint.x} ${PAD_T + innerH} L ${points[0].x} ${PAD_T + innerH} Z`;

  // Marker
  const idxFloat = progress * (months - 1);
  const i0 = Math.max(0, Math.min(months - 1, Math.floor(idxFloat)));
  const i1 = Math.min(months - 1, i0 + 1);
  const f = idxFloat - i0;
  const mx = points[i0].x + (points[i1].x - points[i0].x) * f;
  const my = points[i0].y + (points[i1].y - points[i0].y) * f;
  const mv = curve[i0] + (curve[i1] - curve[i0]) * f;
  const currentEUR = Math.round(mv * target);
  const currentMonth = Math.max(1, Math.round(idxFloat) + 1);

  const pathLengthApprox = 1200;
  const dashOffset = pathLengthApprox * (1 - progress);

  const monthLabels = Array.from({ length: months }, (_, i) => `M${i + 1}`);

  const halfK = Math.round((target / 2) / 1000);
  const fullK = Math.round(target / 1000);
  const yTicks = [
    { r: 0,   label: "€0" },
    { r: 0.5, label: `€${halfK}K` },
    { r: 1,   label: `€${fullK}K+` },
  ].map(({ r, label }) => ({ y: PAD_T + (1 - r) * innerH, label }));

  const formatted = `€${currentEUR.toLocaleString("en-US")}+`;

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
              color: "var(--menta-dark)",
            }}
          >
            {formatted}
          </span>
          <span className="text-[12px] font-medium" style={{ color: "var(--gris-1)" }}>
            recovered over 24 months
          </span>
        </div>

        <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--gris-1)" }}>
          ≈ 7% of annual profit — recovered without selling one more unit.
        </p>

        {/* Sober stats strip */}
        <div
          className="mt-4 grid grid-cols-3 gap-2 rounded-lg p-3"
          style={{ background: "rgba(12,12,22,0.02)", border: "1px solid var(--linea)" }}
        >
          <div>
            <div
              className="font-bold tabular-nums"
              style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "20px", letterSpacing: "-0.02em", lineHeight: 1, color: "var(--ink)" }}
            >
              {perMonthStr}
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] font-semibold mt-1.5" style={{ color: "var(--gris-1)" }}>
              /month
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--linea)" }} className="pl-3">
            <div
              className="font-bold tabular-nums"
              style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "20px", letterSpacing: "-0.02em", lineHeight: 1, color: "var(--coral)" }}
            >
              0.74pts
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] font-semibold mt-1.5" style={{ color: "var(--gris-1)" }}>
              rate saved
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--linea)" }} className="pl-3">
            <div
              className="font-bold tabular-nums"
              style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "20px", letterSpacing: "-0.02em", lineHeight: 1, color: "var(--menta-dark)" }}
            >
              ~7%
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] font-semibold mt-1.5" style={{ color: "var(--gris-1)" }}>
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
            <stop offset="100%" stopColor="#8B7BFF" />
          </linearGradient>
          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(91,76,245,0.20)" />
            <stop offset="100%" stopColor="rgba(91,76,245,0)" />
          </linearGradient>
          <radialGradient id="endpointHalo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(139,123,255,0.55)" />
            <stop offset="60%" stopColor="rgba(139,123,255,0.10)" />
            <stop offset="100%" stopColor="rgba(139,123,255,0)" />
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
              x={PAD_L - 10} y={t.y + 5}
              textAnchor="end"
              fill="rgba(12,12,22,0.62)"
              fontSize="14"
              fontWeight="600"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* X labels — every 4th month */}
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          if (i % 4 !== 0 && !isLast) return null;
          return (
            <text
              key={i}
              x={p.x} y={H - 12}
              textAnchor="middle"
              fill="rgba(12,12,22,0.58)"
              fontSize="13"
              fontWeight="600"
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
          }}
        />

        {/* Endpoint halo */}
        {progress > 0.05 && (
          <circle cx={mx} cy={my} r={22} fill="url(#endpointHalo)" opacity={progress} />
        )}

        {/* Marker */}
        <g>
          <circle cx={mx} cy={my} r="6" fill="#0b1020" stroke="rgba(139,123,255,1)" strokeWidth="1.75" />
          <circle cx={mx} cy={my} r="2.5" fill="#8B7BFF" />
        </g>

        {/* Live M{n} pill — flips to the LEFT of the marker near the right
            edge so the label never gets clipped when the curve reaches the end. */}
        {progress > 0.15 && (() => {
          const pillW = 34;
          const flip = mx + 12 + pillW > W - PAD_R;
          const pillX = flip ? mx - 12 - pillW : mx + 12;
          // Clamp vertically so the pill never gets clipped at the top edge
          // (near M24 the marker sits high, pushing the pill above the viewBox).
          const pillY = Math.max(PAD_T + 11, my - 11);
          return (
            <g transform={`translate(${pillX}, ${pillY})`} opacity={progress}>
              <rect
                x="0" y="-11" width={pillW} height="20" rx="10"
                fill="#0b1020"
                stroke="rgba(139,123,255,0.5)"
                strokeWidth="0.75"
              />
              <text
                x={pillW / 2} y="3"
                textAnchor="middle"
                fill="#8B7BFF"
                fontSize="12"
                fontWeight="700"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
                letterSpacing="0.05em"
              >
                M{currentMonth}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* ===== Footer meta ===== */}
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--linea)" }}>
        <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--gris-2)" }}>
          <span className="font-mono">Cohort · DTC €200k–€2M</span>
          <span className="font-mono">Benchmark methodology</span>
        </div>
        <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--gris-1)" }}>
          <span className="font-semibold" style={{ color: "var(--ink)" }}>Range:</span>{" "}
          €3,000 to €30,000+ over 24 months depending on your volume (€200k–€2M GMV).
        </p>
        <p className="mt-1.5 text-[10.5px] leading-snug" style={{ color: "var(--gris-2)" }}>
          Illustrative — €1M GMV brand, 2.21% effective vs 1.47% achievable. Run the analyzer for your real number.
        </p>
      </div>
    </div>
  );
}