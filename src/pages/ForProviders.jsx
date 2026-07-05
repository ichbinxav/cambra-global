import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, ShieldCheck, Users, TrendingUp, Handshake, Scale, Lock } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import SectionLabel from "@/components/shared/SectionLabel";
import AnimatedSection from "@/components/landing/AnimatedSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

/**
 * ForProviders — public partnership page addressed to PSPs, carriers, SaaS
 * vendors. Not to brands. Kept fully separate from /Pricing (which speaks
 * to merchants) to avoid mixing the two audiences.
 *
 * Content is deliberately marketing/positioning only — no rev-share logic,
 * no numbers, no partnership engine. The Golden Rule (CAMBRA is buy-side,
 * always recommends the best rate for the brand) is a dedicated block, not
 * a footnote, because it's what makes the model credible.
 *
 * CTA reuses the existing Lead entity (same pattern as Contact.jsx) with
 * source_page="/ForProviders" so partnership inbound is separable from
 * brand inbound in the admin waitlist view. Zero new backend.
 */
export default function ForProviders() {
  const [formData, setFormData] = useState({ company: "", name: "", email: "", category: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // Reuse Lead entity — same pattern as Contact form. All partnership
      // context is packed into `notes` so admin can triage by source_page.
      await base44.entities.Lead.create({
        email: formData.email,
        consent: true,
        source_page: "/ForProviders",
        notes: `Partnership inquiry\nCompany: ${formData.company}\nName: ${formData.name}\nCategory: ${formData.category}\n\n${formData.message}`,
      });
      setSubmitted(true);
      setFormData({ company: "", name: "", email: "", category: "", message: "" });
    } catch (err) {
      setError(err?.message || "Could not send. Please email partnerships@cambra.io directly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />
      {/* Ambient backdrop — same treatment as landing/contact for visual consistency */}
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

      <main className="relative pt-24 pb-20">
        {/* ─────────── HERO ─────────── */}
        <section className="relative py-16 sm:py-24">
          <div className="max-w-4xl mx-auto px-6 sm:px-10 text-center">
            <motion.div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-8 text-[11px] uppercase tracking-[0.22em]"
              style={{
                border: "1px solid rgba(96,165,250,0.30)",
                color: "rgba(255,255,255,0.85)",
                background: "rgba(59,130,246,0.06)",
              }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Handshake size={12} />
              For Providers · Partnership
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              style={{
                fontSize: "clamp(38px, 6vw, 76px)",
                fontWeight: 900,
                letterSpacing: "-0.05em",
                lineHeight: 0.96,
              }}
            >
              Reach independent brands{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                at scale.
              </span>
            </motion.h1>

            <motion.p
              className="mt-8 mx-auto text-white/60"
              style={{ maxWidth: 640, fontSize: 18, lineHeight: 1.6 }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              CAMBRA aggregates demand from independent European brands. Partner with us to offer your rates to a pooled network of merchants you wouldn't reach individually — through one relationship, not hundreds.
            </motion.p>
          </div>
        </section>

        {/* ─────────── PROPOSITION ─────────── */}
        <section className="relative py-14">
          <div className="max-w-6xl mx-auto px-6 sm:px-10">
            <AnimatedSection>
              <div className="text-center mb-12">
                <SectionLabel className="mb-4 inline-block">The proposition</SectionLabel>
                <h2 className="text-display text-white max-w-3xl mx-auto">
                  One relationship.{" "}
                  <span
                    style={{
                      background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    Aggregated volume.
                  </span>
                </h2>
              </div>
            </AnimatedSection>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              {[
                {
                  Icon: Users,
                  title: "Aggregated demand",
                  desc: "Independent brands are hard to reach one by one. CAMBRA pools them into a single addressable network — you sign one partnership, we route qualified merchants.",
                },
                {
                  Icon: TrendingUp,
                  title: "Pre-qualified fit",
                  desc: "Every brand routed to you comes with structured infrastructure data: volume, current stack, geography. No cold intros, no wrong-fit meetings.",
                },
                {
                  Icon: Handshake,
                  title: "Revenue share on volume",
                  desc: "Compensation is a revenue share structured on the aggregated volume CAMBRA brings. Terms are set per partnership — no fixed listing fees, no pay-to-play.",
                },
              ].map((b) => (
                <AnimatedSection key={b.title} delay={0.1}>
                  <div
                    className="h-full p-7 rounded-2xl"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                      style={{
                        background: "rgba(34,211,238,0.10)",
                        border: "1px solid rgba(34,211,238,0.25)",
                        color: "#67e8f9",
                      }}
                    >
                      <b.Icon size={16} />
                    </div>
                    <h3 className="text-[18px] font-bold tracking-tight mb-2">{b.title}</h3>
                    <p className="text-[14px] text-white/60 leading-relaxed">{b.desc}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────── GOLDEN RULE — dedicated, prominent, not buried ─────────── */}
        <section className="relative py-16">
          <div className="max-w-5xl mx-auto px-6 sm:px-10">
            <AnimatedSection>
              <motion.div
                whileHover={{ y: -2 }}
                transition={{ duration: 0.3 }}
                className="relative p-8 sm:p-12 rounded-3xl overflow-hidden"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(52,211,153,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                  border: "1px solid rgba(52,211,153,0.25)",
                  backdropFilter: "blur(12px)",
                }}
              >
                {/* Ambient emerald halo */}
                <div
                  aria-hidden
                  className="absolute pointer-events-none"
                  style={{
                    width: 480, height: 480, right: "-10%", top: "-30%",
                    background: "radial-gradient(circle, rgba(52,211,153,0.15) 0%, transparent 70%)",
                    filter: "blur(60px)",
                  }}
                />
                <div className="relative">
                  <div
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6 text-[10px] uppercase tracking-[0.22em] font-bold"
                    style={{
                      background: "rgba(52,211,153,0.14)",
                      border: "1px solid rgba(52,211,153,0.35)",
                      color: "#6ee7b7",
                    }}
                  >
                    <Scale size={11} />
                    The Golden Rule
                  </div>

                  <h2
                    className="text-white font-black tracking-tight leading-[1.05] mb-6"
                    style={{ fontSize: "clamp(28px, 4vw, 44px)" }}
                  >
                    Recommendations follow the{" "}
                    <span style={{ color: "#6ee7b7" }}>brand's best interest.</span>
                  </h2>

                  <p className="text-white/70 text-[16px] leading-relaxed max-w-3xl mb-8">
                    CAMBRA is buy-side. When we surface an option to a brand, it's because it fits their infrastructure and their savings profile. Partnership economics are a separate conversation.
                  </p>

                  <ul className="space-y-3 max-w-3xl">
                    {[
                      {
                        Icon: ShieldCheck,
                        text: "Rankings are driven by fit and savings — not by partnership tier.",
                      },
                      {
                        Icon: Lock,
                        text: "No pay-to-be-recommended, no paid placement.",
                      },
                      {
                        Icon: Users,
                        text: "Brands see the full comparison, including non-partner options.",
                      },
                    ].map((r) => (
                      <li key={r.text} className="flex items-start gap-3 text-[14px] text-white/80">
                        <r.Icon size={14} className="mt-1 shrink-0" style={{ color: "#34d399" }} strokeWidth={2.5} />
                        <span>{r.text}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-8 text-[13px] text-white/50">
                    It's the only way an aggregated demand network holds up over time — for the brands, and for the providers who partner with us.
                  </p>
                </div>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        {/* ─────────── CTA — reuse Lead entity ─────────── */}
        <section id="partnership" className="relative py-16">
          <div className="max-w-3xl mx-auto px-6 sm:px-10">
            <AnimatedSection>
              <div className="text-center mb-10">
                <SectionLabel className="mb-4 inline-block">Get in touch</SectionLabel>
                <h2 className="text-display text-white">Explore a partnership.</h2>
                <p className="mt-4 text-white/60 text-[15px] max-w-lg mx-auto">
                  If you're a PSP, carrier, or SaaS vendor serving independent brands, tell us about your offer. We'll come back within a few days.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.15}>
              {submitted ? (
                <div
                  className="rounded-2xl p-8 text-center"
                  style={{
                    background: "rgba(52,211,153,0.06)",
                    border: "1px solid rgba(52,211,153,0.25)",
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "rgba(52,211,153,0.15)", color: "#6ee7b7" }}
                  >
                    <ShieldCheck size={18} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Thanks — we'll be in touch.</h3>
                  <p className="text-[13px] text-white/60">
                    We review every partnership inquiry personally. Expect a reply within a few working days.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="relative p-7 rounded-2xl space-y-4"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[12px] font-semibold block mb-2 text-white/75">Company</label>
                      <Input
                        name="company" value={formData.company} onChange={handleChange}
                        placeholder="Your company"
                        className="h-11 text-white placeholder:text-white/30"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[12px] font-semibold block mb-2 text-white/75">Your name</label>
                      <Input
                        name="name" value={formData.name} onChange={handleChange}
                        placeholder="Full name"
                        className="h-11 text-white placeholder:text-white/30"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[12px] font-semibold block mb-2 text-white/75">Work email</label>
                      <Input
                        name="email" type="email" value={formData.email} onChange={handleChange}
                        placeholder="you@company.com"
                        className="h-11 text-white placeholder:text-white/30"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[12px] font-semibold block mb-2 text-white/75">Category</label>
                      <select
                        name="category" value={formData.category} onChange={handleChange}
                        className="w-full h-11 rounded-md px-3 text-white text-[14px] focus:outline-none focus:ring-1 focus:ring-cyan-300/50"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                        required
                      >
                        <option value="" style={{ background: "#0b0e1a" }}>Select…</option>
                        <option value="payments" style={{ background: "#0b0e1a" }}>Payments / PSP</option>
                        <option value="shipping" style={{ background: "#0b0e1a" }}>Shipping / Carrier</option>
                        <option value="saas" style={{ background: "#0b0e1a" }}>SaaS / Software</option>
                        <option value="banking" style={{ background: "#0b0e1a" }}>Banking / Finance</option>
                        <option value="other" style={{ background: "#0b0e1a" }}>Other infrastructure</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[12px] font-semibold block mb-2 text-white/75">
                      What do you offer independent brands?
                    </label>
                    <textarea
                      name="message" value={formData.message} onChange={handleChange}
                      placeholder="Your offer, the segment you serve, why you'd be a fit for CAMBRA's network."
                      className="w-full min-h-28 p-3 rounded-md text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-300/50 text-[14px]"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-12 rounded-full font-bold gap-2 bg-white text-black hover:bg-white/90"
                  >
                    {submitting
                      ? <>Sending… <Loader2 className="w-4 h-4 animate-spin" /></>
                      : <>Send partnership inquiry <ArrowRight className="w-4 h-4" /></>}
                  </Button>

                  {error && (
                    <p className="text-xs text-red-300 text-center">{error}</p>
                  )}
                  <p className="text-[11px] text-white/40 text-center pt-1">
                    Or email us directly at <a href="mailto:partnerships@cambra.io" className="underline hover:text-white/70">partnerships@cambra.io</a>
                  </p>
                </form>
              )}
            </AnimatedSection>
          </div>
        </section>
      </main>
    </div>
  );
}