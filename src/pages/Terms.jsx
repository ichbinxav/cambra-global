import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/landing/Navbar";

export default function Terms() {
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
            <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/60">Legal</span>
          </div>
          <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.9] mb-3 text-white">
            Terms &amp; Conditions.
          </h1>
          <p className="text-white/50 text-sm mb-14">Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

          <div className="space-y-10 text-sm text-white/65 leading-relaxed">
            {[
              { title: "1. Publisher & legal identity", content: "The CAMBRA platform is published by CAMBRA GLOBAL SASU, a French société par actions simplifiée unipersonnelle registered under SIREN 105 452 916, with registered office at 42 rue Vivienne, 75002 Paris, France. Contact: support@cambra.global. Publication director: the legal representative of CAMBRA GLOBAL SASU. Hosting is provided by Base44 in EU-based infrastructure." },
              { title: "2. Acceptance", content: "By accessing or using the CAMBRA platform, you agree to be bound by these Terms & Conditions. If you do not agree, do not use the platform. CAMBRA reserves the right to update these terms with reasonable advance notice (at least 30 days for material changes) communicated by email and in-app notification." },
              { title: "3. Platform purpose", content: "CAMBRA provides payment-cost analysis, benchmarking and recovery services for independent commerce brands, covering both online and in-store card payments. The platform is intended for business use only (B2B). You must be at least 18 years old and duly authorized to represent the brand or entity you register on behalf of." },
              { title: "4. Audit outputs & estimates", content: "All Analyzer outputs, payment savings estimates and benchmark comparisons are estimates derived from your inputs and the CAMBRA network dataset. They are operational guidance — not financial, legal, accounting or fiscal advice. CAMBRA does not guarantee any specific savings outcome. Always consult qualified advisors before material decisions." },
              { title: "5. Data ownership & licence", content: "You retain full ownership of all data you submit. By using the platform, you grant CAMBRA a limited, worldwide, non-exclusive, revocable licence to process that data for the sole purpose of delivering the service. Aggregated and fully anonymized data (from which no individual brand can be re-identified) may be used to improve benchmarks. We will never share identifiable data with third parties without your explicit consent, except as required by law." },
              { title: "6. Pricing — free audit", content: "Access to the Analyzer, benchmarks, scoring and dashboard is currently offered free of charge to early-partner brands. No credit card is required. CAMBRA may introduce paid tiers in the future with at least 30 days' advance notice; early partners will be honoured under their original commercial conditions for a reasonable transition period." },
              { title: "7. Recovery service — success fee", content: "If you opt in to the Recovery service, CAMBRA acts on your behalf to renegotiate your card-payment rates — online (PSP) and in-store (TPV / physical terminal) — with your current provider, or migrate you to a better one where relevant. The fee is 25% of verified payment savings, calculated over a 24-month agreement from the moment savings become measurable on your real PSP or provider statements. Key rules: (a) no upfront fee, no subscription, no minimum; (b) if no verified savings are recovered, you owe nothing; (c) 'verified savings' means the delta between your baseline effective rate and your new effective rate, evidenced by actual PSP or TPV provider statements reconciled by CAMBRA; (d) after the 24-month agreement, 100% of ongoing savings stay with you; (e) the specific terms of each recovery mandate are formalized in a separate written mandate signed before any negotiation is undertaken." },
              { title: "8. Provider compensation", content: "CAMBRA may receive compensation from service providers (revenue share) based on the aggregated volume it directs to them. This compensation never influences our recommendations: CAMBRA always recommends the option that saves the brand the most. Provider partnership terms are disclosed to any interested provider upon written request to support@cambra.global." },
              { title: "9. Network directory", content: "The member directory is accessible only to authenticated, verified members. Listings are not endorsements. Brands are responsible for the accuracy of their own profile. Contact information visible in the directory may only be used for legitimate business collaboration between members — never for unsolicited prospecting, mass mailing or resale." },
              { title: "10. Acceptable use", content: "You agree not to: reverse-engineer the platform, scrape benchmark data, misrepresent your brand, upload unlawful content, attempt to access another user's data, or use CAMBRA to build a directly competing service. Violations may result in immediate suspension without refund." },
              { title: "11. Intellectual property", content: "The CAMBRA platform, brand, methodology, benchmarks and software are the exclusive property of CAMBRA GLOBAL SASU. No provision of these Terms transfers any intellectual property right to you, except the limited licence to use the service." },
              { title: "12. Limitation of liability", content: "To the maximum extent permitted by French law, CAMBRA is not liable for indirect, incidental, special or consequential damages arising from use of the platform. Total aggregate liability is capped at the greater of (a) the amounts paid by you to CAMBRA in the twelve months preceding the claim, or (b) €5,000. Nothing in these Terms limits liability for gross negligence, wilful misconduct or death/personal injury." },
              { title: "13. Withdrawal (B2B)", content: "The platform is a professional B2B service. The 14-day consumer withdrawal right under the French Consumer Code does not apply. You may nevertheless terminate your account at any time from Account settings under Section 14 below." },
              { title: "14. Termination", content: "You may terminate your account at any time from Account settings. Ongoing recovery mandates continue under their existing terms unless the mandate itself is revoked in writing. CAMBRA may suspend or terminate access for material violations of these terms or for prolonged inactivity (>24 months). Upon termination, your data is handled according to our Privacy Policy." },
              { title: "15. Governing law & jurisdiction", content: "These Terms are governed by French law. Any dispute will first be addressed through good-faith negotiation. If unresolved within 60 days, the parties may resort to mediation (CMAP, Paris). Failing amicable resolution, exclusive jurisdiction lies with the competent commercial courts of Paris, France." },
              { title: "16. Contact", content: "For any contractual question: support@cambra.global. For legal notices: 42 rue Vivienne, 75002 Paris, France." },
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