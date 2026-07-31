import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";

// LEGAL-2 — the footer's discreet "Data requests" link lands here with
// ?topic=data-request and pre-fills the message so a GDPR access/erasure
// request reaches us through the normal contact pipeline.
const DATA_REQUEST_PREFILL =
  "Data request: I would like to exercise my GDPR rights (access / rectification / erasure / portability / objection) regarding the personal data CAMBRA holds about me.";

function initialMessage() {
  try {
    const topic = new URLSearchParams(window.location.search).get("topic");
    return topic === "data-request" ? DATA_REQUEST_PREFILL : "";
  } catch {
    return "";
  }
}

export default function Contact() {
  const { lang } = useTranslation();
  const [formData, setFormData] = useState({ name: "", email: "", message: initialMessage() });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // SECURITY-2 Fase 3.1 — the direct Lead.create from the browser ALWAYS
      // failed for anonymous visitors (Lead is admin-write RLS). The public
      // backend function persists via service role, validates and rate-limits;
      // success is only shown AFTER the row exists.
      const res = await base44.functions.invoke("submitContactMessage", {
        name: formData.name,
        email: formData.email,
        message: formData.message,
        locale: lang, // EMAIL-1 T2 — so our reply starts in their language
      });
      if (!res?.data?.ok) throw new Error(res?.data?.error || "send_failed");
      setSubmitted(true);
      setFormData({ name: "", email: "", message: "" });
      setTimeout(() => setSubmitted(false), 4000);
    } catch (err) {
      setError(err?.message || "Could not send your message. Please email us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { background: "#FFFFFF", border: "1px solid var(--linea)", color: "var(--ink)" };

  return (
    <PublicPageShell>
      <PublicPageHero
        eyebrow="Contact · We're here to help"
        title={<>Get in <span className="kw">touch.</span></>}
        subtitle="Questions about CAMBRA? We're here to help."
      />

      <div className="relative pt-16 pb-20">
        <div className="max-w-3xl mx-auto px-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            {[
              { icon: Mail, label: "General", value: "hello@cambra.global", href: "mailto:hello@cambra.global" },
              { icon: MessageSquare, label: "Support", value: "support@cambra.global", href: "mailto:support@cambra.global" },
            ].map((c, i) => (
              <motion.a
                key={i}
                href={c.href}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="group p-6 text-center transition hover:-translate-y-1 hover:shadow-lg block"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid var(--linea)",
                  borderRadius: 14,
                  boxShadow: "0 8px 24px rgba(12,12,22,.06)",
                }}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ border: "1px solid rgba(58,43,176,0.20)", background: "rgba(58,43,176,0.06)", color: "var(--voltio)" }}
                >
                  <c.icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--ink)" }}>{c.label}</p>
                <p className="text-sm" style={{ color: "var(--gris-1)" }}>{c.value}</p>
              </motion.a>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden p-8"
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--linea)",
              borderRadius: 14,
              boxShadow: "0 8px 24px rgba(12,12,22,.06)",
            }}
          >
            <div className="relative">
              <h2 className="font-display text-xl font-black tracking-[-0.03em] mb-6" style={{ color: "var(--ink)" }}>Send us a message</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "var(--ink)" }}>Name</label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your name"
                    className="h-12"
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "var(--ink)" }}>Email</label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your@email.com"
                    className="h-12"
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "var(--ink)" }}>Message</label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us how we can help..."
                    className="w-full min-h-32 p-4 rounded-lg focus:outline-none focus:ring-1"
                    style={{ ...inputStyle }}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-full font-bold gap-2 text-white hover:opacity-90"
                  style={{ background: "var(--ink)" }}
                >
                  {submitting
                    ? <>Sending... <Loader2 className="w-4 h-4 animate-spin" /></>
                    : submitted
                      ? "Message sent! ✓"
                      : <>Send message <ArrowRight className="w-4 h-4" /></>}
                </Button>
                {error && (
                  <p className="text-xs mt-2 text-center" style={{ color: "var(--coral)" }}>{error}</p>
                )}
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </PublicPageShell>
  );
}