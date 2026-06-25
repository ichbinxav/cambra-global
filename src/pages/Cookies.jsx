import MarketingPageShell from "@/components/landing/MarketingPageShell";

const COOKIES = [
  { name: "cambra_session", type: "Strictly necessary", purpose: "Authentication & session continuity", duration: "Session", party: "First-party" },
  { name: "cambra_csrf", type: "Strictly necessary", purpose: "CSRF protection for state-changing requests", duration: "Session", party: "First-party" },
  { name: "cambra_copilot_open", type: "Functional", purpose: "Remembers whether the Copilot panel is open", duration: "12 months", party: "First-party" },
  { name: "cambra_consent", type: "Strictly necessary", purpose: "Stores your cookie preferences", duration: "12 months", party: "First-party" },
];

export default function CookiesPage() {
  return (
    <MarketingPageShell
      eyebrow="Legal · Cookie policy"
      title="Cookie"
      titleAccent="Policy."
      subtitle={`Last updated: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`}
      heroAlign="left"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-8" style={{ color: "rgba(255,255,255,0.65)" }}>
        <section>
          <h2 className="text-[16px] font-bold text-white mb-3">1. What are cookies</h2>
          <p className="text-[14px] leading-relaxed">
            Cookies are small text files stored on your device when you visit a website. They allow the site to remember your actions and preferences (such as authentication or display settings) over time.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-white mb-3">2. How CAMBRA uses cookies</h2>
          <p className="text-[14px] leading-relaxed">
            CAMBRA uses cookies strictly to operate the platform: keep you signed in, remember UI preferences, and protect against CSRF attacks. We do not use advertising cookies, third-party trackers, behavioral profiling or cross-site identifiers.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-white mb-3">3. Cookies we set</h2>
          <div
            className="overflow-x-auto rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th className="text-left font-bold py-3 px-4 text-white">Name</th>
                  <th className="text-left font-bold py-3 px-4 text-white">Type</th>
                  <th className="text-left font-bold py-3 px-4 text-white">Purpose</th>
                  <th className="text-left font-bold py-3 px-4 text-white">Duration</th>
                  <th className="text-left font-bold py-3 px-4 text-white">Party</th>
                </tr>
              </thead>
              <tbody>
                {COOKIES.map((c, i) => (
                  <tr key={c.name} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
                    <td className="py-3 px-4 font-mono text-cyan-300">{c.name}</td>
                    <td className="py-3 px-4">{c.type}</td>
                    <td className="py-3 px-4">{c.purpose}</td>
                    <td className="py-3 px-4">{c.duration}</td>
                    <td className="py-3 px-4">{c.party}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-white mb-3">4. Managing cookies</h2>
          <p className="text-[14px] leading-relaxed">
            Strictly necessary cookies cannot be disabled — the platform will not function without them. Functional cookies may be cleared from your browser's settings at any time. Disabling cookies may degrade the experience.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-white mb-3">5. Contact</h2>
          <p className="text-[14px] leading-relaxed">
            Questions about how CAMBRA uses cookies: privacy@cambra.io.
          </p>
        </section>
      </div>
    </MarketingPageShell>
  );
}