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
    <div className="relative min-h-screen bg-background font-inter overflow-hidden">
      <Navbar />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 dot-grid opacity-40" />
      </div>
      <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-16">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-8 -ml-2 h-8 text-xs rounded-full px-3 text-muted-foreground">
            <ArrowLeft size={13} className="mr-1.5" /> Back
          </Button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
            <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">Legal · Cookie policy</span>
          </div>
          <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.9] mb-3 text-foreground">
            Cookie Policy.
          </h1>
          <p className="text-muted-foreground text-sm mb-12">Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

          <div className="space-y-10 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="text-base font-bold text-foreground mb-3">1. What are cookies</h2>
              <p>Cookies are small text files stored on your device when you visit a website. They allow the site to remember your actions and preferences (such as authentication or display settings) over time.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-3">2. How CAMBRA uses cookies</h2>
              <p>CAMBRA uses cookies strictly to operate the platform: keep you signed in, remember UI preferences, and protect against CSRF attacks. We do not use advertising cookies, third-party trackers, behavioral profiling or cross-site identifiers.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-3">3. Cookies we set</h2>
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 text-foreground">
                      <th className="text-left font-semibold py-2 pr-3">Name</th>
                      <th className="text-left font-semibold py-2 pr-3">Type</th>
                      <th className="text-left font-semibold py-2 pr-3">Purpose</th>
                      <th className="text-left font-semibold py-2 pr-3">Duration</th>
                      <th className="text-left font-semibold py-2">Party</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COOKIES.map((c) => (
                      <tr key={c.name} className="border-b border-border/30 last:border-0">
                        <td className="py-3 pr-3 font-mono text-foreground">{c.name}</td>
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
              <h2 className="text-base font-bold text-foreground mb-3">4. Managing cookies</h2>
              <p>Strictly necessary cookies cannot be disabled — the platform will not function without them. Functional cookies may be cleared from your browser's settings at any time. Disabling cookies may degrade the experience.</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-3">5. Contact</h2>
              <p>Questions about how CAMBRA uses cookies: privacy@cambra.io.</p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}