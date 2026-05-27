import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Phone, MessageSquare, ArrowRight } from "lucide-react";
import Navbar from "@/components/landing/Navbar";

export default function Contact() {
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Send email or create contact record
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="relative min-h-screen bg-background font-inter overflow-hidden">
      <Navbar />
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 dot-grid opacity-50" />
        <div className="absolute -top-32 left-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.20]" />
        <div className="absolute top-1/3 -right-32 w-[30rem] h-[30rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.16]" />
      </div>

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {[
              { icon: Mail, label: "Email", value: "support@cambra.io", href: "mailto:support@cambra.io" },
              { icon: Phone, label: "Phone", value: "+33 (0) 1 23 45 67 89", href: "tel:+33123456789" },
              { icon: MessageSquare, label: "Chat", value: "Live support available", href: "#" },
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
                  className="w-full h-12 rounded-full font-bold gap-2"
                >
                  {submitted ? "Message sent! ✓" : "Send message"}
                  {!submitted && <ArrowRight className="w-4 h-4" />}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}