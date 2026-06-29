import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, ShieldCheck, Sparkles, Layers, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Navbar from "@/components/landing/Navbar";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * AnalyzerTeaser — Public page shown to anonymous users at the end of the
 * Analyzer flow. Shows ONLY the hero number + minimal context. The breakdown,
 * recommendations and full report live behind the sign-up wall.
 *
 * Data shape (from getAnonResultTeaser — and only these fields, by design):
 *   { total_savings, country, tier, tools_count, brand_name }
 *
 * Navigation:
 *   - Sign up / Sign in → /auth/start?next=/Results?claim=<session_id>
 *   - On /Results, the claim param triggers claimAnonymousAnalysis, which
 *     reassigns the 3 records to the new user and clears anon_session_id.
 */
export default function AnalyzerTeaser() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const sessionId = new URLSearchParams(window.location.search).get("session") || "";

  const [teaser, setTeaser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Already signed in? Don't show the teaser — just claim and forward.
      try {
        const authed = await base44.auth.isAuthenticated();
        if (authed && sessionId) {
          if (!cancelled) navigate(`/Results?claim=${encodeURIComponent(sessionId)}`, { replace: true });
          return;
        }
      } catch { /* fall through */ }

      if (!sessionId) {
        if (!cancelled) { setError("missing_session"); setLoading(false); }
        return;
      }
      try {
        const res = await base44.functions.invoke("getAnonResultTeaser", { anon_session_id: sessionId });
        const payload = res?.data || res;
        if (!payload?.ok) {
          if (!cancelled) { setError(payload?.error || "load_failed"); setLoading(false); }
          return;
        }
        if (!cancelled) { setTeaser(payload.teaser); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(e?.message || "load_failed"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleAuth = () => {
    const next = `/Results?claim=${encodeURIComponent(sessionId)}`;
    try {
      sessionStorage.setItem("cambra_redirect_after_login", next);
    } catch { /* ignore */ }
    // /auth/start triggers Base44 login and bounces back to ?next
    window.location.href = `/auth/start?next=${encodeURIComponent(next)}`;
  };

  return (
    <div
      className="relative min-h-screen flex flex-col font-inter overflow-x-hidden"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #08090f 100%)",
      }}
    >
      {/* Ambient grid + glow — same vocabulary as the Analyzer flow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.3,
          maskImage: "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed z-0"
        style={{
          width: 720, height: 720, left: "50%", top: 60, transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <Navbar />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 pt-20 pb-16">
        <div className="w-full max-w-xl">
          {loading && (
            <div className="text-center">
              <Loader2 size={20} className="mx-auto mb-3 animate-spin text-cyan-300" />
              <p className="text-sm text-white/55">{t("progress_mapping") || "Loading your result…"}</p>
            </div>
          )}

          {!loading && error && (
            <div className="text-center">
              <p className="text-sm text-white/65 mb-5">
                We couldn't load your result. Try running the analysis again.
              </p>
              <button
                onClick={() => navigate("/Analyzer")}
                className="h-11 px-6 rounded-full bg-white text-black text-sm font-bold inline-flex items-center gap-2"
              >
                Run the audit <ArrowRight size={14} />
              </button>
            </div>
          )}

          {!loading && !error && teaser && (
            <div className="text-center animate-fade-up">
              {/* Eyebrow */}
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-7"
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/65">
                  Audit complete
                </span>
              </div>

              {/* Lead-in */}
              <p className="text-[14px] text-white/55 mb-4">
                {teaser.brand_name
                  ? <>For <span className="text-white/85 font-semibold">{teaser.brand_name}</span>, we identified</>
                  : <>We identified</>
                }
              </p>

              {/* The big number — the hook */}
              <div
                className="font-black tracking-[-0.055em] leading-none mb-4 tabular-nums"
                style={{
                  fontSize: "clamp(3.5rem, 14vw, 8rem)",
                  background: "linear-gradient(180deg, #ffffff 0%, #B8D8E0 45%, #2CA7C1 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 22px rgba(34,211,238,0.35))",
                }}
              >
                €{(teaser.total_savings || 0).toLocaleString("fr-FR")}
              </div>
              <p className="text-white/60 text-base mb-8">
                of recoverable margin per year, across your infrastructure.
              </p>

              {/* Context strip — country · tier · X tools detected */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
                {teaser.country && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white/75"
                    style={{ border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}
                  >
                    {teaser.country}
                  </span>
                )}
                {teaser.tier && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white/75 capitalize"
                    style={{ border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}
                  >
                    {teaser.tier} brand
                  </span>
                )}
                {teaser.tools_count > 0 && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-cyan-200"
                    style={{ border: "1px solid rgba(34,211,238,0.30)", background: "rgba(34,211,238,0.08)" }}
                  >
                    <Layers size={11} />
                    {teaser.tools_count} {teaser.tools_count === 1 ? "tool" : "tools"} detected in your stack
                  </span>
                )}
              </div>

              {/* The wall */}
              <div
                className="rounded-2xl p-6 sm:p-7 text-left"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  boxShadow: "0 24px 64px -28px rgba(0,0,0,0.55)",
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.25)" }}
                  >
                    <Lock size={12} className="text-cyan-300" />
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/65">
                    Unlock the full report
                  </p>
                </div>
                <p className="text-[14px] text-white/65 leading-relaxed mb-5">
                  Create your account to see the breakdown across payments, shipping and SaaS,
                  the providers and rates we benchmarked you against, and the prioritized
                  recommendations to recover this margin.
                </p>

                {/* CTA */}
                <button
                  onClick={handleAuth}
                  className="w-full h-12 rounded-full inline-flex items-center justify-center gap-2 text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors"
                  style={{
                    boxShadow:
                      "0 0 0 1px rgba(255,255,255,0.10), 0 12px 32px -12px rgba(34,211,238,0.55), 0 0 28px rgba(34,211,238,0.22)",
                  }}
                >
                  Create account & view breakdown
                  <ArrowRight size={15} />
                </button>

                <p className="mt-3 text-center text-[12px] text-white/45">
                  Already have an account?{" "}
                  <button
                    onClick={handleAuth}
                    className="underline underline-offset-2 hover:text-white/75 transition-colors font-medium"
                  >
                    Sign in
                  </button>
                </p>
              </div>

              {/* Trust microcopy */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-white/40">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={11} /> Private audit</span>
                <span className="inline-flex items-center gap-1.5"><Sparkles size={11} /> No credit card</span>
                <span className="inline-flex items-center gap-1.5"><Lock size={11} /> Your result is saved</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}