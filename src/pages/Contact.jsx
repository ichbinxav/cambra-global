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
    <div className="min-h-screen bg-background font-inter">
      <Navbar />
      <div className="pt-20 pb-16">
        <div className="max-w-3xl mx-auto px-5">
          <div className="text-center mb-12">
            <h1 className="text-[clamp(2.2rem,5vw,3.8rem)] font-black tracking-[-0.04em] leading-[0.92] mb-4">
              Get in touch
            </h1>
            <p className="text-base text-muted-foreground/70">
              Questions about CAMBRA? We're here to help.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              { icon: Mail, label: "Email", value: "support@cambra.io", href: "mailto:support@cambra.io" },
              { icon: Phone, label: "Phone", value: "+33 (0) 1 23 45 67 89", href: "tel:+33123456789" },
              { icon: MessageSquare, label: "Chat", value: "Live support available", href: "#" },
            ].map((c, i) => (
              <a
                key={i}
                href={c.href}
                className="rounded-xl border border-border/40 bg-card p-6 text-center hover:border-foreground/20 transition"
              >
                <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-4">
                  <c.icon className="w-5 h-5 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-semibold mb-1">{c.label}</p>
                <p className="text-sm text-muted-foreground/70">{c.value}</p>
              </a>
            ))}
          </div>

          <div className="rounded-2xl border border-border/40 bg-card p-8">
            <h2 className="text-xl font-black mb-6">Send us a message</h2>
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
  );
}