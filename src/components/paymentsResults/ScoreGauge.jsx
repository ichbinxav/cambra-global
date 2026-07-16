// ScoreGauge — Report v2, Pieza A.
//
// Animated circular gauge for the CAMBRA payments-efficiency Score.
// On mount: the amber arc SWEEPS from 0 to the score's % (stroke-dashoffset
// transition) and the big number COUNTS UP 0 → score in sync.
//
// PURE PRESENTATION: the score/grade/tone/contextLine come verbatim from
// computePaymentsScore() via props. This component never computes the score.
// Tone → concrete gauge color (amber for the score ring per the art-direction
// spec; the tone still tints so an A reads teal, an F reads red).

import { useEffect, useRef, useState } from "react";

// Tone → arc color. Score ring is amber-forward per spec, but we keep the
// grade tone so extremes read correctly (A teal / F red).
const ARC = {
  excellent: "#2dd4bf",
  good:      "#8B7BFF",
  medium:    "#F5A623",
  risk:      "#F45B69",
};

export default function ScoreGauge({ score = 0, grade = "F", tone = "medium", muted = false, size = 132 }) {
  const [displayScore, setDisplayScore] = useState(0);
  const [swept, setSwept] = useState(false);
  const rafRef = useRef(null);

  const color = ARC[tone] || ARC.medium;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  // Full-circle gauge. dashoffset goes from full circumference (empty) to
  // circumference * (1 - pct) (filled to score).
  const targetOffset = circumference * (1 - pct);

  // Count-up the number in sync with the sweep.
  useEffect(() => {
    const reduce = typeof window !== "undefined" &&
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplayScore(score);
      setSwept(true);
      return;
    }
    // Kick the arc sweep on the next frame so the transition applies.
    const t = requestAnimationFrame(() => setSwept(true));

    const duration = 1400;
    const startTs = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplayScore(Math.round(score * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [score]);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block -rotate-90" style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        {/* Filled arc — sweeps in via dashoffset transition */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={swept ? targetOffset : circumference}
          style={{
            transition: "stroke-dashoffset 1400ms cubic-bezier(0.22,1,0.36,1)",
            filter: `drop-shadow(0 0 5px ${color}59)`,
            opacity: muted ? 0.75 : 1,
          }}
        />
      </svg>
      {/* Center readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="tabular-nums font-black leading-none"
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: size * 0.30,
            color,
            textShadow: `0 0 5px ${color}59`,
            letterSpacing: "-0.02em",
          }}
        >
          {muted && <span className="opacity-70">~</span>}{displayScore}
        </div>
        <div
          className="uppercase font-bold tracking-[0.2em]"
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 9,
            color: "rgba(255,255,255,0.45)",
            marginTop: 2,
          }}
        >
          Grade {grade}
        </div>
      </div>
    </div>
  );
}