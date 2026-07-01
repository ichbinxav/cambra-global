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
            <div className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                Contact · We're here to help
              </span>
            </div>
            <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-4">
              Get in <span className="text-saas-gradient">touch.</span>
            </h1>
            <p className="text-base text-foreground/65 max-w-md mx-auto">
              Questions about CAMBRA? We're here to help.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            {[
              { icon: Mail, label: "General", value: "support@cambra.io", href: "mailto:support@cambra.io" },
              { icon: MessageSquare, label: "Operators", value: "operators@cambra.io", href: "mailto:operators@cambra.io" },
            ].map((c, i) => (
              <a
                key={i}
                href={c.href}
                className="group rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm p-6 text-center hover:border-foreground/30 hover:-translate-y-0.5 transition shadow-[0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_14px_30px_rgba(0,0,0,0.08)]"
              >
                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4 group-hover:bg-foreground group-hover:text-background transition-colors">
                  <c.icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold mb-1">{c.label}</p>
                <p className="text-sm text-foreground/65">{c.value}</p>
              </a>
            ))}
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/95 backdrop-blur-md p-8 shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
            <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl bg-ambient-mint opacity-[0.18]" />
            <div className="relative">
              <h2 className="font-display text-xl font-black tracking-[-0.03em] mb-6">Send us a message</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold block mb-2">Name</label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your name"
                    className="h-12 border-border/60"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-2">Email</label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your@email.com"
                    className="h-12 border-border/60"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-2">Message</label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us how we can help..."
                    className="w-full min-h-32 p-4 rounded-lg border border-border/60 bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-full font-bold gap-2"
                >
                  {submitting
                    ? <>Sending... <Loader2 className="w-4 h-4 animate-spin" /></>
                    : submitted
                      ? "Message sent! ✓"
                      : <>Send message <ArrowRight className="w-4 h-4" /></>}
                </Button>
                {error && (
                  <p className="text-xs text-rose-600 mt-2 text-center">{error}</p>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}