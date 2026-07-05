import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/landing/Navbar";

const COOKIES = [
  { name: "cambra_session", type: "Strictly necessary", purpose: "Authentication & session continuity", duration: "Session", party: "First-party" },
  { name: "cambra_csrf", type: "Strictly necessary", purpose: "CSRF protection for state-changing requests", duration: "Session", party: "First-party" },
  { name: "cambra_copilot_open", type: "Functional", purpose: "Remembers whether the Copilot panel is open", duration: "12 months", party: "First-party" },
  { name: "cambra_consent", type: "Strictly necessary", purpose: "Stores your cookie preferences", duration: "12 months", party: "First-party" },
];

export default function Cookies() {
  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.35,
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
        }}
      />
      <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-16">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-8 -ml-2 h-8 text-xs rounded-full px-3 text-white/60 hover:text-white hover:bg-white/5">
            <ArrowLeft size={13} className="mr-1.5" /> Back
          </Button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div
            className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full backdrop-blur-sm"
            style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/60">Legal · Cookie policy</span>
          </div>
          <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.9] mb-3 text-white">
            Cookie Policy.
          </h1>
          <p className="text-white/50 text-sm mb-12">Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

          <div className="space-y-10 text-sm text-white/65 leading-relaxed">
            <section>
              <h2 className="text-base font-bold text-white mb-3">1. What are cookies</h2>
              <p>Cookies are small text files stored on your device when you visit a website. They allow the site to remember your actions and preferences (such as authentication or display settings) over time.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white mb-3">2. How CAMBRA uses cookies</h2>
              <p>CAMBRA uses cookies strictly to operate the platform: keep you signed in, remember UI preferences, and protect against CSRF attacks. We do not use advertising cookies, third-party trackers, behavioral profiling or cross-site identifiers.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white mb-3">3. Cookies we set</h2>
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-white" style={{ borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                      <th className="text-left font-semibold py-2 pr-3">Name</th>
                      <th className="text-left font-semibold py-2 pr-3">Type</th>
                      <th className="text-left font-semibold py-2 pr-3">Purpose</th>
                      <th className="text-left font-semibold py-2 pr-3">Duration</th>
                      <th className="text-left font-semibold py-2">Party</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COOKIES.map((c) => (
                      <tr key={c.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td className="py-3 pr-3 font-mono text-white/85">{c.name}</td>
                        <td className="py-3 pr-3">{c.type}</td>
                        <td className="py-3 pr-3">{c.purpose}</td>
                        <td className="py-3 pr-3">{c.duration}</td>
                        <td className="py-3">{c.party}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-base font-bold text-white mb-3">4. Managing cookies</h2>
              <p>Strictly necessary cookies cannot be disabled — the platform will not function without them. Functional cookies may be cleared from your browser's settings at any time. Disabling cookies may degrade the experience.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white mb-3">5. Contact</h2>
              <p>Questions about how CAMBRA uses cookies: privacy@cambra.io.</p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}