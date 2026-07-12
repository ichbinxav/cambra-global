import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
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

  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />
      {/* Ambient backdrop */}
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

      <div className="relative pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-5">
          <div className="text-center mb-14">
            <div
              className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full backdrop-blur-sm"
              style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/60">
                Contact · We're here to help
              </span>
            </div>
            <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-4 text-white">
              Get in{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                touch.
              </span>
            </h1>
            <p className="text-base text-white/60 max-w-md mx-auto">
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
                className="group rounded-2xl p-6 text-center transition hover:-translate-y-0.5 backdrop-blur-sm"
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors"
                  style={{
                    border: "1px solid rgba(34,211,238,0.25)",
                    background: "rgba(34,211,238,0.10)",
                    color: "#67e8f9",
                  }}
                >
                  <c.icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold mb-1 text-white">{c.label}</p>
                <p className="text-sm text-white/60">{c.value}</p>
              </a>
            ))}
          </div>

          <div
            className="relative overflow-hidden rounded-[1.75rem] p-8 backdrop-blur-md"
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              boxShadow: "0 24px 60px -20px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl"
              style={{ background: "radial-gradient(closest-side, rgba(34,211,238,0.25), transparent 70%)" }}
            />
            <div className="relative">
              <h2 className="font-display text-xl font-black tracking-[-0.03em] mb-6 text-white">Send us a message</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold block mb-2 text-white/80">Name</label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your name"
                    className="h-12 text-white placeholder:text-white/30"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-2 text-white/80">Email</label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your@email.com"
                    className="h-12 text-white placeholder:text-white/30"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-2 text-white/80">Message</label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us how we can help..."
                    className="w-full min-h-32 p-4 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-300/50"
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
                    ? <>Sending... <Loader2 className="w-4 h-4 animate-spin" /></>
                    : submitted
                      ? "Message sent! ✓"
                      : <>Send message <ArrowRight className="w-4 h-4" /></>}
                </Button>
                {error && (
                  <p className="text-xs text-red-300 mt-2 text-center">{error}</p>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}