import React, { useEffect, useRef, useState } from "react";

/**
 * Animated cumulative savings curve.
 * Pure SVG, no external libs. Animates the path drawing + a moving counter.
 * Designed for the dark editorial hero.
 */
export default function SavingsCurveChart({
  // Final value the counter lands on (EUR)
  target = 127400,
  // Months on the X axis
  months = 12,
  // Curve shape — slightly concave-up (compounds over time)
  // values are 0..1 ratios of `target` for each month index
  curve = [0.00, 0.04, 0.10, 0.18, 0.26, 0.34, 0.44, 0.54, 0.64, 0.74, 0.86, 1.00],
  className = "",
}) {
  const [progress, setProgress] = useState(0); // 0..1
  const [hasAnimated, setHasAnimated] = useState(false);
  const wrapRef = useRef(null);

  // Trigger once when visible
  useEffect(() => {
    if (hasAnimated) return;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHasAnimated(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasAnimated]);

  // Drive progress with rAF over ~2.2s, ease-out
  useEffect(() => {
    if (!hasAnimated) return;
    const duration = 2200;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasAnimated]);

  // Geometry
  const W = 640;
  const H = 280;
  const PAD_L = 56;
  const PAD_R = 24;
  const PAD_T = 28;
  const PAD_B = 36;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Build the full path points
  const points = curve.map((v, i) => {
    const x = PAD_L + (i / (months - 1)) * innerW;
    const y = PAD_T + (1 - v) * innerH;
    return { x, y, v };
  });

  // Smooth path (cardinal-ish via simple cubic between points)
  const fullPath = (() => {
    if (!points.length) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const mx = (p0.x + p1.x) / 2;
      d += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  })();

  // Area under curve (for fill)
  const areaPath = `${fullPath} L ${points[points.length - 1].x} ${PAD_T + innerH} L ${points[0].x} ${PAD_T + innerH} Z`;

  // Marker position along the curve based on progress
  const idxFloat = progress * (months - 1);
  const i0 = Math.floor(idxFloat);
  const i1 = Math.min(months - 1, i0 + 1);
  const f = idxFloat - i0;
  const mx = points[i0].x + (points[i1].x - points[i0].x) * f;
  const my = points[i0].y + (points[i1].y - points[i0].y) * f;
  const mv = curve[i0] + (curve[i1] - curve[i0]) * f;
  const currentEUR = Math.round(mv * target);

  // Path "draw" effect — uses stroke-dashoffset
  const pathLengthApprox = 1100; // good enough for 640x280
  const dashOffset = pathLengthApprox * (1 - progress);

  // Axis ticks
  const monthLabels = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"];
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: PAD_T + (1 - r) * innerH,
    label: r === 0 ? "€0" : `€${Math.round((r * target) / 1000)}K`,
  }));

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Counter overlay */}
      <div className="absolute -top-3 left-0 z-10 flex items-end gap-3 select-none">
        <div className="flex flex-col">
          <span
            className="text-[10px] uppercase tracking-[0.24em]"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            Cumulative savings · 12 mo
          </span>
          <span
            className="text-white font-black tabular-nums"
            style={{
              fontSize: "clamp(36px, 5vw, 56px)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              textShadow: "0 0 32px rgba(96,165,250,0.35)",
            }}
          >
            €{currentEUR.toLocaleString("en-US")}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Cumulative savings curve over 12 months"
      >
        <defs>
          <linearGradient id="curveStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="60%" stopColor="#2CA7C1" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(96,165,250,0.32)" />
            <stop offset="100%" stopColor="rgba(96,165,250,0)" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={t.y}
              y2={t.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 10}
              y={t.y + 4}
              textAnchor="end"
              fill="rgba(255,255,255,0.40)"
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
              x={p.x}
              y={H - 12}
              textAnchor="middle"
              fill="rgba(255,255,255,0.35)"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {monthLabels[i]}
            </text>
          ) : null
        )}

        {/* Area fill — fades in with progress */}
        <path
          d={areaPath}
          fill="url(#curveFill)"
          opacity={progress * 0.9}
        />

        {/* Drawn curve */}
        <path
          d={fullPath}
          fill="none"
          stroke="url(#curveStroke)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow)"
          style={{
            strokeDasharray: pathLengthApprox,
            strokeDashoffset: dashOffset,
          }}
        />

        {/* Moving marker */}
        <g>
          <circle cx={mx} cy={my} r="14" fill="rgba(96,165,250,0.18)" />
          <circle cx={mx} cy={my} r="6" fill="#fff" />
          <circle cx={mx} cy={my} r="3" fill="#2CA7C1" />
        </g>

        {/* End label */}
        {progress > 0.96 && (
          <g transform={`translate(${points[points.length - 1].x - 96}, ${points[points.length - 1].y - 38})`}>
            <rect
              x="0"
              y="0"
              width="92"
              height="26"
              rx="6"
              fill="rgba(255,255,255,0.06)"
              stroke="rgba(255,255,255,0.18)"
            />
            <text x="10" y="17" fill="#fff" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, monospace">
              +€{Math.round(target / 1000)}K saved
            </text>
          </g>
        )}
      </svg>

      {/* Caption */}
      <div className="mt-3 flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
          <span className="w-2 h-2 rounded-full" style={{ background: "#60a5fa", boxShadow: "0 0 8px rgba(96,165,250,0.7)" }} />
          Verified recovered savings
        </span>
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          Live network median · DTC brands €1M–€10M revenue
        </span>
      </div>
    </div>
  );
}