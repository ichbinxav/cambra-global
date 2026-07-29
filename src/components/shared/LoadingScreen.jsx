import React from "react";
import { BRAND_ASSETS } from "@/lib/brandAssets";

/**
 * CAMBRA — Loading screen.
 * Used by ProtectedRoute, AdminRoute and the top-level auth bootstrap.
 * Same visual language as Landing / Analyzer (deep navy + grid + cyan glow).
 *
 * Props:
 *  - label   (optional) — small status text under the mark. Default: "Loading".
 *  - sublabel (optional) — secondary line shown under the label.
 *  - fullscreen (default true) — fixed inset-0 when true, otherwise fills its parent.
 */
export default function LoadingScreen({
  label = "Loading",
  sublabel = "",
  fullscreen = true,
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${fullscreen ? "fixed inset-0" : "min-h-[60vh] w-full"} flex flex-col items-center justify-center overflow-hidden`}
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 35%, #0a0d18 65%, #0E0E1A 100%)",
      }}
    >
      {/* Ambient grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.35,
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 100%)",
        }}
      />
      {/* Soft voltio halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 540,
          height: 540,
          background:
            "radial-gradient(circle, rgba(91,76,245,0.22) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      {/* Pulsing logo ring */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: 72, height: 72 }}
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            border: "1px solid rgba(139,123,255,0.4)",
            animation: "cambra-ping 2s cubic-bezier(0,0,0.2,1) infinite",
          }}
        />
        <img
          src={BRAND_ASSETS.cMarkVoltioPng}
          alt="CAMBRA"
          width={34}
          height={34}
          className="relative h-[34px] w-[34px]"
          style={{
            filter: "drop-shadow(0 0 16px rgba(91,76,245,0.65))",
            animation: "cambra-pulse 2s ease-in-out infinite",
          }}
          draggable={false}
        />
      </div>

      {/* Wordmark */}
      <p
        className="mt-8 text-white inline-flex items-center gap-2"
        style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontWeight: 900,
          letterSpacing: "-0.04em",
          fontSize: 18,
        }}
      >
        CAMBRA
      </p>

      {/* Label */}
      <p
        className="mt-2 text-[11px] uppercase font-bold"
        style={{
          letterSpacing: "0.28em",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        {label}
      </p>

      {sublabel && (
        <p
          className="mt-2 text-[12px]"
          style={{ color: "rgba(255,255,255,0.40)" }}
        >
          {sublabel}
        </p>
      )}

      <style>{`
        @keyframes cambra-ping {
          0%   { transform: scale(0.6); opacity: 0.9; }
          80%  { transform: scale(1.6); opacity: 0;   }
          100% { transform: scale(1.6); opacity: 0;   }
        }
        @keyframes cambra-pulse {
          0%, 100% { transform: scale(1);    opacity: 1;   }
          50%      { transform: scale(1.08); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}