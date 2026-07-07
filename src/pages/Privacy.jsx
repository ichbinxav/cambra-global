import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/landing/Navbar";

export default function Privacy() {
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
            <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/60">Legal · GDPR compliant</span>
          </div>
          <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.9] mb-3 text-white">
            Privacy Policy.
          </h1>
          <p className="text-white/50 text-sm mb-14">Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

          <div className="space-y-10 text-sm text-white/65 leading-relaxed">
            {[
              { title: "1. Data controller", content: "The data controller is CAMBRA GLOBAL SASU, a French société par actions simplifiée unipersonnelle registered under SIREN 105 452 916, with registered office at 42 rue Vivienne, 75002 Paris, France. For any data-related request, contact us at privacy@cambra.global." },
              { title: "2. What we collect", content: "We collect information you provide directly: name, professional email, brand information, infrastructure cost data, uploaded statements and operational metrics entered through the Analyzer. When you connect a third-party account (e.g. Stripe, Shopify), we collect the data authorized by your OAuth scope — read-only. We also collect non-identifying usage telemetry to improve the platform." },
              { title: "3. How we use your data", content: "Your data is used to deliver CAMBRA's infrastructure intelligence — generating audits, calculating benchmarks, identifying optimization opportunities and personalizing your dashboard. Legal basis: performance of contract (Art. 6(1)(b) GDPR) and legitimate interest for benchmarking (Art. 6(1)(f) GDPR). We never sell your data. Aggregated, fully anonymized benchmarks may inform network-wide intelligence." },
              { title: "4. File upload & AI processing", content: "When you upload statements or invoices (PDF, Excel, CSV) through the Analyzer or Connect Tools, they are processed by large language models to extract structured cost and operational data. Uploaded files are stored encrypted and remain your property. AI processing is confined to your account scope and is not used to train provider models. AI providers may retain processed content temporarily in accordance with their API policies, and are contractually restricted from further use through the data processing agreements described in section 5." },
              { title: "5. Sub-processors", content: "To operate the service, CAMBRA relies on the following sub-processors, each bound by GDPR-compliant data processing agreements: Base44 (application hosting & database, EU region); Anthropic PBC (AI processing — document extraction, product intelligence and the in-app Copilot); OpenAI Ireland Ltd. (AI extraction cross-check); Resend, Inc. (transactional and outbound email delivery); Stripe Payments Europe Ltd. (payment processing when applicable). A current, complete list is available on request at privacy@cambra.global." },
              { title: "6. Storage & security", content: "All data is stored in encrypted EU-based infrastructure. We use TLS 1.3 in transit, AES-256 at rest, role-based access control and continuous audit logging. Third-party API credentials (OAuth tokens, API keys) are encrypted with AES-256-GCM using a dedicated key never exposed to the application layer. Access to your data is strictly restricted to systems and personnel that require it to operate the service." },
              { title: "7. Your rights (GDPR)", content: "If you are located in the European Economic Area, the United Kingdom or Switzerland, you have the right to access, rectify, erase, restrict, port and object to the processing of your data. You may also withdraw consent at any time. To exercise any of these rights, contact privacy@cambra.global — we respond within 30 days." },
              { title: "8. Data retention", content: "We retain personal and operational data only for as long as your account is active or as required to provide the service. Upon account deletion, identifiable data is deleted within 90 days. Billing and invoicing data is retained for 10 years to comply with French commercial and tax law (Code de commerce Art. L123-22). Anonymized, aggregated benchmarks may be retained indefinitely." },
              { title: "9. Cookies", content: "We use strictly necessary cookies for authentication and session management. We do not use advertising or third-party tracking cookies. See our Cookie Policy for the complete list." },
              { title: "10. International transfers", content: "Where data is transferred outside the EEA (e.g. for AI inference by Anthropic PBC or OpenAI, or email delivery by Resend, Inc.), we rely on Standard Contractual Clauses approved by the European Commission (Decision 2021/914) and apply equivalent technical and organizational safeguards." },
              { title: "11. Data breach notification", content: "In the event of a personal data breach likely to result in a risk to your rights and freedoms, CAMBRA will notify the competent supervisory authority (CNIL) within 72 hours and, where the risk is high, inform affected users without undue delay, in accordance with Art. 33-34 GDPR." },
              { title: "12. Contact & supervisory authority", content: "For any privacy-related question, request or complaint: privacy@cambra.global. You also have the right to lodge a complaint with the Commission Nationale de l'Informatique et des Libertés (CNIL, www.cnil.fr) or your local data protection authority." },
            ].map((section, i) => (
              <div key={i} className="pb-10 last:border-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <h2 className="text-base font-bold text-white mb-3">{section.title}</h2>
                <p>{section.content}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}