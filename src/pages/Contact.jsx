import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import SectionLabel from "@/components/shared/SectionLabel";
import { base44 } from "@/api/base44Client";

export default function Contact() {
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
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
      // Landing opt-in → Lead population (the right one for contact-form intake).
      // Lead schema accepts: email, whatsapp, benchmark_opt_in, consent, source_page, notes.
      // We pack name + message into `notes` since the schema has no name/message fields,
      // and mark consent=true (the user explicitly submitted the contact form).
      await base44.entities.Lead.create({
        email: formData.email,
        consent: true,
        source_page: "/Contact",
        notes: `Name: ${formData.name}\n\n${formData.message}`,
      });
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
      <div className="relative pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-5">
          <div className="text-center mb-14">
            <div className="flex justify-center mb-6">
              <SectionLabel>Contact · We're here to help</SectionLabel>
            </div>
            <h1
              className="font-display font-black mb-4"
              style={{
                color: "var(--ink)",
                fontSize: "clamp(2.2rem,5.5vw,4rem)",
                letterSpacing: "-0.045em",
                lineHeight: 0.92,
              }}
            >
              Get in <span className="kw">touch.</span>
            </h1>
            <p className="text-base max-w-md mx-auto" style={{ color: "var(--gris-1)" }}>
              Questions about CAMBRA? We're here to help.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            {[
              { icon: Mail, label: "General", value: "hello@cambra.global", href: "mailto:hello@cambra.global" },
              { icon: MessageSquare, label: "Support", value: "support@cambra.global", href: "mailto:support@cambra.global" },
            ].map((c, i) => (
              <a
                key={i}
                href={c.href}
                className="group p-6 text-center transition hover:-translate-y-0.5"
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
              </a>
            ))}
          </div>

          <div
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
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}