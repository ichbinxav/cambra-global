import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, Database, Layers, Lock, Scale, Power } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "@/components/landing/Navbar";
import PublicFooter from "@/components/shared/PublicFooter";
import SecurityHero from "@/components/security/SecurityHero";
import SecurityBlock from "@/components/security/SecurityBlock";
import CanCannotTable from "@/components/security/CanCannotTable";

/**
 * /Security — public page. The honest answer to "what can CAMBRA see, and what
 * can it do?". Copy is calibrated and must NOT be paraphrased. No certifications
 * are ever claimed. Cybersecurity-flavored dark canvas with animated grid,
 * scanline hero (SecurityHero) and glowing glass blocks. DA tokens only.
 */
const CONTACT_EMAIL = "support@cambra.global";

export default function Security() {
  return (
    <div className="min-h-screen font-inter relative" style={{ background: "#07060F", color: "#fff" }}>
      {/* Fixed cyber grid + green scan glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(47,224,168,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(47,224,168,0.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, #000 30%, transparent 90%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, #000 30%, transparent 90%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(60% 40% at 50% -5%, rgba(74,58,209,0.28), transparent 70%), radial-gradient(50% 40% at 90% 20%, rgba(47,224,168,0.12), transparent 70%)",
        }}
      />

      <div className="relative z-10">
        <Navbar />

        <SecurityHero />

        <div className="max-w-4xl mx-auto px-5 pb-8 space-y-6 sm:space-y-8 mt-12 sm:mt-16">
          {/* BLOCK 1 — What we can and cannot do */}
          <SecurityBlock
            index="01"
            icon={Eye}
            accent="menta"
            title="Read-only. By design, not by promise."
          >
            <p>
              When you connect your payment provider, you grant CAMBRA read-only access through the
              provider's official OAuth flow. That access lets us read your transaction fees and volumes.
              It does not let us create charges, issue refunds, move funds, or modify anything in your
              account. This isn't a policy we follow — it's a technical boundary set by the provider.
              Even if we wanted to touch your money, we couldn't.
            </p>
            <CanCannotTable />
          </SecurityBlock>

          {/* BLOCK 2 — What data we actually use */}
          <SecurityBlock
            index="02"
            icon={Database}
            accent="cian"
            title="Aggregates, not identities."
          >
            <p>
              Our analysis runs on aggregate numbers: volumes, fees, rates, payment mix. We do not need —
              and do not process — your end customers' personal data. No names, no emails, no card numbers.
              Card data never touches CAMBRA at any point: it stays within your payment provider's certified
              infrastructure. Statement uploads are used solely to compute your effective rate, and the
              figures we benchmark are anonymized and aggregated.
            </p>
          </SecurityBlock>

          {/* BLOCK 3 — Isolation */}
          <SecurityBlock
            index="03"
            icon={Layers}
            accent="menta"
            title="Your numbers never leak into anyone else's."
          >
            <p>
              Every brand's data lives in strict isolation, enforced at the database layer. Benchmarks are
              built from anonymized aggregates — no brand can ever see another brand's rates, volumes, or
              identity. When your data contributes to a benchmark, it does so as a number in a cohort, never
              as your name.
            </p>
          </SecurityBlock>

          {/* BLOCK 4 — Encryption & infrastructure */}
          <SecurityBlock
            index="04"
            icon={Lock}
            accent="cian"
            title="Encrypted everywhere it travels, everywhere it rests."
          >
            <p>
              All data is encrypted in transit (TLS) and at rest. Access to production data is restricted and
              logged. We keep what we need to run your analysis and monitoring — nothing more.
            </p>
          </SecurityBlock>

          {/* BLOCK 5 — GDPR */}
          <SecurityBlock
            index="05"
            icon={Scale}
            accent="menta"
            title="European company. European rules."
          >
            <p>
              CAMBRA Global SASU is incorporated in France and operates under GDPR. You can request access to
              your data or its deletion at any time. A Data Processing Agreement is available for brands that
              require one — ask us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#7DE3FF", fontWeight: 600 }}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </SecurityBlock>

          {/* BLOCK 6 — Disconnect anytime */}
          <SecurityBlock
            index="06"
            icon={Power}
            accent="coral"
            title="Leaving takes one click."
          >
            <p>
              You can disconnect your payment provider at any moment from your dashboard, and the connection
              is revoked immediately at the provider level. Your access, your call — always.
            </p>
          </SecurityBlock>

          {/* CLOSING */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-center pt-8 pb-4"
          >
            <h2
              style={{
                color: "#fff",
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 4vw, 44px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
              }}
            >
              Questions? Ask before you connect.
            </h2>
            <p className="mt-5 max-w-xl mx-auto text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              If anything here is unclear, write to us before connecting anything. We'd rather earn your trust
              slowly than lose it fast.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/Analyzer"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-medium text-[14px] text-white transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--g-voltio)", boxShadow: "0 12px 32px -12px rgba(91,76,245,0.5)" }}
              >
                See my payment gap
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/Contact"
                className="inline-flex items-center gap-1.5 rounded-full px-7 py-3.5 text-[14px] font-medium transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.04)" }}
              >
                Contact us
                <ArrowRight size={14} />
              </Link>
            </div>
          </motion.section>
        </div>

        <PublicFooter />
      </div>
    </div>
  );
}