import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ShieldAlert, LogOut } from 'lucide-react';

const UserNotRegisteredError = () => {
  const handleLogout = async () => {
    try {
      await base44.auth.logout(`${window.location.origin}/`);
    } catch {
      window.location.href = "/";
    }
  };

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
      {/* Amber halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 720,
          height: 720,
          background:
            "radial-gradient(circle, rgba(245,158,11,0.16) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative w-full max-w-md text-center">
        {/* Wordmark */}
        <Link
          to="/"
          className="inline-block mb-10 text-white"
          style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: 18 }}
          aria-label="CAMBRA"
        >
          CAMBRA
        </Link>

        {/* Icon */}
        <div
          className="mx-auto mb-6 w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: "rgba(245,158,11,0.10)",
            border: "1px solid rgba(245,158,11,0.30)",
            boxShadow: "0 0 32px rgba(245,158,11,0.18)",
          }}
        >
          <ShieldAlert size={22} className="text-amber-300" />
        </div>

        {/* Eyebrow */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5"
          style={{
            border: "1px solid rgba(245,158,11,0.30)",
            background: "rgba(245,158,11,0.06)",
          }}
        >
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-amber-300">
            Access restricted
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
          You don't have access to this workspace.
        </h1>

        <p className="text-[14px] text-white/60 mb-8 leading-relaxed">
          Your account isn't registered for this app yet. Contact the workspace
          admin to request access, or sign in with a different account.
        </p>

        {/* Checklist */}
        <div
          className="rounded-xl p-4 mb-8 text-left"
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/55 mb-3">
            Quick checks
          </p>
          <ul className="space-y-2 text-[13px] text-white/75">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-cyan-300 shrink-0" />
              You signed in with the right email address.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-cyan-300 shrink-0" />
              An admin has invited you to this workspace.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-cyan-300 shrink-0" />
              You've accepted the invitation email.
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-bold text-[13px] h-11 px-5 transition-opacity hover:opacity-90"
            style={{
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.1), 0 14px 36px -14px rgba(59,130,246,0.5)",
            }}
          >
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
          <Link
            to="/Contact"
            className="inline-flex items-center justify-center rounded-full text-white/80 hover:text-white font-semibold text-[13px] h-11 px-5 transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;