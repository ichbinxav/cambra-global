import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import SectionLabel from "@/components/shared/SectionLabel";

const COOKIES = [
  { name: "cambra_session", type: "Strictly necessary", purpose: "Authentication & session continuity", duration: "Session", party: "First-party" },
  { name: "cambra_csrf", type: "Strictly necessary", purpose: "CSRF protection for state-changing requests", duration: "Session", party: "First-party" },
  { name: "cambra_copilot_open", type: "Functional", purpose: "Remembers whether the Copilot panel is open", duration: "12 months", party: "First-party" },
  { name: "cambra_consent", type: "Strictly necessary", purpose: "Stores your cookie preferences", duration: "12 months", party: "First-party" },
];

export default function Cookies() {
  return (
    <PublicPageShell>
      <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-16">
        <Link to="/">
          <button
            className="mb-8 -ml-2 h-8 text-xs rounded-full px-3 inline-flex items-center transition-colors"
            style={{ color: "var(--gris-1)" }}
          >
            <ArrowLeft size={13} className="mr-1.5" /> Back
          </button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-5">
            <SectionLabel>Legal · Cookie policy</SectionLabel>
          </div>
          <h1
            className="font-display font-black mb-3"
            style={{
              color: "var(--ink)",
              fontSize: "clamp(2.2rem,5.5vw,4rem)",
              letterSpacing: "-0.045em",
              lineHeight: 0.9,
            }}
          >
            Cookie Policy.
          </h1>
          <p className="text-sm mb-12" style={{ color: "var(--gris-2)" }}>
            Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <div className="space-y-10 text-sm leading-relaxed" style={{ color: "var(--gris-1)" }}>
            <section>
              <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>1. What are cookies</h2>
              <p>Cookies are small text files stored on your device when you visit a website. They allow the site to remember your actions and preferences (such as authentication or display settings) over time.</p>
            </section>

            <section>
              <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>2. How CAMBRA uses cookies</h2>
              <p>CAMBRA uses cookies strictly to operate the platform: keep you signed in, remember UI preferences, and protect against CSRF attacks. We do not use advertising cookies, third-party trackers, behavioral profiling or cross-site identifiers.</p>
            </section>

            <section>
              <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>3. Cookies we set</h2>
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--linea)", color: "var(--ink)" }}>
                      <th className="text-left font-semibold py-2 pr-3">Name</th>
                      <th className="text-left font-semibold py-2 pr-3">Type</th>
                      <th className="text-left font-semibold py-2 pr-3">Purpose</th>
                      <th className="text-left font-semibold py-2 pr-3">Duration</th>
                      <th className="text-left font-semibold py-2">Party</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COOKIES.map((c) => (
                      <tr key={c.name} style={{ borderBottom: "1px solid var(--linea)" }}>
                        <td className="py-3 pr-3 font-mono" style={{ color: "var(--ink)" }}>{c.name}</td>
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
              <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>4. Managing cookies</h2>
              <p>Strictly necessary cookies cannot be disabled — the platform will not function without them. Functional cookies may be cleared from your browser's settings at any time. Disabling cookies may degrade the experience.</p>
            </section>

            <section>
              <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>5. Contact</h2>
              <p>Questions about how CAMBRA uses cookies: privacy@cambra.global. Publisher: CAMBRA GLOBAL SASU, SIREN 105 452 916, 42 rue Vivienne, 75002 Paris, France.</p>
            </section>
          </div>
        </motion.div>
      </div>
    </PublicPageShell>
  );
}