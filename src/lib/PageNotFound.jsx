import { useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Compass } from 'lucide-react';

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1) || "/";

  const { data: authData, isFetched } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const user = await base44.auth.me();
        return { user, isAuthenticated: true };
      } catch {
        return { user: null, isAuthenticated: false };
      }
    },
  });

  const isAdmin = isFetched && authData?.isAuthenticated && authData.user?.role === 'admin';

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden px-5"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 35%, #0a0d18 65%, #08090f 100%)",
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
          opacity: 0.4,
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 100%)",
        }}
      />
      {/* Halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 720,
          height: 720,
          background:
            "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative w-full max-w-lg text-center">
        {/* Wordmark */}
        <Link
          to="/"
          className="inline-block mb-10 text-white"
          style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: 18 }}
          aria-label="CAMBRA"
        >
          CAMBRA
        </Link>

        {/* 404 figure */}
        <div
          aria-hidden
          className="select-none"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontWeight: 900,
            letterSpacing: "-0.07em",
            lineHeight: 0.9,
            fontSize: "clamp(7rem, 22vw, 14rem)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(34,211,238,0.55) 80%, rgba(34,211,238,0.25) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 22px rgba(34,211,238,0.25))",
          }}
        >
          404
        </div>

        {/* Eyebrow */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 mt-2 mb-5"
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <Compass size={11} className="text-cyan-300" />
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">
            Off the map
          </span>
        </div>

        <h1
          className="text-white mb-3"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(24px, 4vw, 32px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
          }}
        >
          This page doesn't exist.
        </h1>

        <p className="text-[14px] text-white/55 mb-8 leading-relaxed">
          We couldn't find{" "}
          <span
            className="px-1.5 py-0.5 rounded text-white/85"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
              fontSize: 12,
            }}
          >
            /{pageName}
          </span>{" "}
          in this workspace.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-bold text-[13px] h-11 px-5 transition-opacity hover:opacity-90"
            style={{
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.1), 0 14px 36px -14px rgba(59,130,246,0.55), 0 0 28px rgba(59,130,246,0.22)",
            }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to home
          </Link>
          <Link
            to="/Dashboard"
            className="inline-flex items-center justify-center rounded-full text-white/80 hover:text-white font-semibold text-[13px] h-11 px-5 transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            Go to dashboard
          </Link>
        </div>

        {/* Admin note */}
        {isAdmin && (
          <div
            className="mt-10 mx-auto max-w-sm rounded-xl p-4 text-left"
            style={{
              border: "1px solid rgba(245,158,11,0.25)",
              background: "rgba(245,158,11,0.06)",
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-amber-300 mb-1">
              Admin note
            </p>
            <p className="text-[12px] text-white/70 leading-relaxed">
              This route may not be implemented yet. Ask the assistant to build it in chat.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}