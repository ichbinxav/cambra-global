import React, { useEffect, useMemo, useRef, useState } from "react";
import { TrendingUp, Sparkles } from "lucide-react";

/**
 * WOW Savings Curve — cinematic, animated, premium.
 * - Massive animated counter with green up-arrow
 * - Glowing area fill + path-draw with traveling shimmer
 * - Floating particles rising from the curve
 * - Pulsing marker + ghost rings
 * - Live ticker row at the bottom
 */
export default function SavingsCurveChart({
  target = 127400,
  months = 12,
  curve = [0.00, 0.04, 0.10, 0.18, 0.26, 0.34, 0.44, 0.54, 0.64, 0.74, 0.86, 1.00],
  className = "",
}) {
  const [progress, setProgress] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const wrapRef = useRef(null);

  // Trigger when visible
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

  // Drive progress
  useEffect(() => {
    if (!hasAnimated) return;
    const duration = 2600;
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
  const W = 640, H = 300;
  const PAD_L = 56, PAD_R = 28, PAD_T = 24, PAD_B = 40;
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

  // Stroke draw
  const pathLengthApprox = 1200;
  const dashOffset = pathLengthApprox * (1 - progress);

  // Axis
  const monthLabels = ["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","M11","M12"];
  const yTicks = [0, 0.5, 1].map((r) => ({
    y: PAD_T + (1 - r) * innerH,
    label: r === 0 ? "€0" : `€${Math.round((r * target) / 1000)}K`,
  }));

  // Floating particles seeded along the curve (rise + fade)
  const particles = useMemo(() => {
    const seed = [0.15, 0.32, 0.48, 0.62, 0.78, 0.9];
    return seed.map((r, i) => {
      const idx = Math.floor(r * (months - 1));
      const p = points[idx];
      return { id: i, x: p.x + (i % 2 === 0 ? -4 : 6), y: p.y, delay: i * 0.6 };
    });
  }, [points, months]);

  // Counter formatted
  const formatted = `€${currentEUR.toLocaleString("en-US")}`;
  const deltaPct = Math.round(mv * 100);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* ===== Counter overlay ===== */}
      <div className="relative z-10 mb-3 select-none">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-[0.24em] font-bold"
            style={{ color: "rgba(255,255,255,0.50)" }}
          >
            Avg. brand recovers · 12 mo
          </span>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
            style={{
              background: "rgba(34,197,94,0.12)",
              border: "1px solid rgba(34,197,94,0.35)",
              color: "rgb(134,239,172)",
              boxShadow: "0 0 16px rgba(34,197,94,0.25)",
            }}
          >
            <TrendingUp size={10} />
            +{deltaPct}%
          </span>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <span
            className="font-black tabular-nums"
            style={{
              fontSize: "clamp(48px, 7.5vw, 80px)",
              letterSpacing: "-0.05em",
              lineHeight: 0.95,
              background:
                "linear-gradient(135deg, #ffffff 0%, #b8d8e0 45%, #22d3ee 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 28px rgba(34,211,238,0.5))",
            }}
          >
            {formatted}
          </span>
          {progress > 0.97 && (
            <span
              className="mb-2 inline-flex items-center gap-1 text-[11px] font-bold"
              style={{
                color: "rgb(165,243,252)",
                animation: "wowPulse 1.4s ease-in-out infinite",
              }}
            >
              <Sparkles size={12} />
              recovered
            </span>
          )}
        </div>

        {/* WOW stats strip — three quick proof points */}
        <div
          className="mt-4 grid grid-cols-3 gap-2 rounded-xl p-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <div
              className="font-black tabular-nums text-white"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(16px, 2.2vw, 22px)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              €10.6k
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-bold mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              /month
            </div>
          </div>
          <div style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }} className="pl-3">
            <div
              className="font-black tabular-nums"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(16px, 2.2vw, 22px)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                color: "rgb(134,239,172)",
              }}
            >
              23%
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-bold mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              cost cut
            </div>
          </div>
          <div style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }} className="pl-3">
            <div
              className="font-black tabular-nums text-white"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(16px, 2.2vw, 22px)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              3 min
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] font-bold mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
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
        aria-label="Animated cumulative savings curve over 12 months"
      >
        <defs>
          {/* Multi-stop premium stroke gradient */}
          <linearGradient id="curveStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="40%" stopColor="#3b82f6" />
            <stop offset="75%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>

          {/* Vertical fill — strong cyan glow under the line */}
          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.55)" />
            <stop offset="40%" stopColor="rgba(59,130,246,0.20)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0)" />
          </linearGradient>

          {/* Traveling shimmer along the path */}
          <linearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Glow filter for the stroke */}
          <filter id="strongGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Soft glow for the marker */}
          <radialGradient id="markerHalo">
            <stop offset="0%" stopColor="rgba(34,211,238,0.65)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </radialGradient>

          {/* Target line gradient */}
          <linearGradient id="targetLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(34,197,94,0)" />
            <stop offset="50%" stopColor="rgba(34,197,94,0.55)" />
            <stop offset="100%" stopColor="rgba(34,197,94,0)" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? "0" : "3 4"}
            />
            <text
              x={PAD_L - 10} y={t.y + 4}
              textAnchor="end"
              fill="rgba(255,255,255,0.45)"
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
              x={p.x} y={H - 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.35)"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {monthLabels[i]}
            </text>
          ) : null
        )}

        {/* Target line at 100% (subtle, animated dash) */}
        <line
          x1={PAD_L} x2={W - PAD_R}
          y1={PAD_T} y2={PAD_T}
          stroke="url(#targetLine)"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          opacity={progress * 0.9}
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.6s" repeatCount="indefinite" />
        </line>
        <text
          x={W - PAD_R - 4}
          y={PAD_T - 6}
          textAnchor="end"
          fill="rgba(134,239,172,0.85)"
          fontSize="9"
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          opacity={progress}
        >
          TARGET
        </text>

        {/* Area fill */}
        <path d={areaPath} fill="url(#curveFill)" opacity={progress * 0.95} />

        {/* Curve — main stroke */}
        <path
          d={fullPath}
          fill="none"
          stroke="url(#curveStroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#strongGlow)"
          style={{
            strokeDasharray: pathLengthApprox,
            strokeDashoffset: dashOffset,
          }}
        />

        {/* Traveling shimmer overlay along the curve (only after path is drawn) */}
        {progress > 0.95 && (
          <path
            d={fullPath}
            fill="none"
            stroke="url(#shimmer)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="60 1140"
            opacity="0.85"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="1200" to="0"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </path>
        )}

        {/* Floating particles rising from the curve */}
        {progress > 0.5 && particles.map((p) => (
          <g key={p.id} opacity="0.85">
            <circle cx={p.x} cy={p.y} r="2" fill="#22d3ee">
              <animate attributeName="cy" from={p.y} to={p.y - 60} dur="2.6s" begin={`${p.delay}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.9" to="0" dur="2.6s" begin={`${p.delay}s`} repeatCount="indefinite" />
              <animate attributeName="r" from="2.5" to="0.5" dur="2.6s" begin={`${p.delay}s`} repeatCount="indefinite" />
            </circle>
          </g>
        ))}

        {/* Marker — pulsing rings + core */}
        <g>
          {/* outer halo */}
          <circle cx={mx} cy={my} r="22" fill="url(#markerHalo)">
            <animate attributeName="r" values="18;26;18" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0.95;0.6" dur="2s" repeatCount="indefinite" />
          </circle>
          {/* expanding ping ring */}
          <circle cx={mx} cy={my} r="6" fill="none" stroke="rgba(34,211,238,0.7)" strokeWidth="1.5">
            <animate attributeName="r" from="6" to="22" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.9" to="0" dur="1.8s" repeatCount="indefinite" />
          </circle>
          {/* core white dot */}
          <circle cx={mx} cy={my} r="6" fill="#fff" />
          <circle cx={mx} cy={my} r="3" fill="#06b6d4" />
        </g>

        {/* Vertical drop guide from marker */}
        <line
          x1={mx} x2={mx}
          y1={my + 8} y2={PAD_T + innerH}
          stroke="rgba(34,211,238,0.25)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />

        {/* End label */}
        {progress > 0.96 && (
          <g transform={`translate(${points[points.length - 1].x - 110}, ${points[points.length - 1].y - 44})`}>
            <rect
              x="0" y="0" width="106" height="28" rx="14"
              fill="rgba(6,182,212,0.12)"
              stroke="rgba(34,211,238,0.55)"
            />
            <text
              x="53" y="18"
              textAnchor="middle"
              fill="#a5f3fc"
              fontSize="11"
              fontWeight="700"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              +€{Math.round(target / 1000)}K saved
            </text>
          </g>
        )}
      </svg>

      {/* ===== Live ticker row ===== */}
      <div
        className="mt-4 flex items-center justify-between gap-3 pt-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
          </span>
          <span className="text-white/65">RECOVERING</span>
          <span className="text-white/30">·</span>
          <span className="text-white/45">DTC €1M–€10M</span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
          <span style={{ color: "rgb(134,239,172)" }}>
            ↗ +€{Math.round((currentEUR / 12)).toLocaleString("en-US")}/mo
          </span>
        </div>
      </div>

      <style>{`
        @keyframes wowPulse {
          0%, 100% { opacity: 0.7; transform: translateY(0); }
          50%      { opacity: 1;    transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}