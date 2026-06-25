import { useState } from "react";
import { Mail, MessageSquare, ArrowRight } from "lucide-react";
import MarketingPageShell from "@/components/landing/MarketingPageShell";

export default function Contact() {
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const fieldStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#ffffff",
  };

  return (
    <MarketingPageShell
      eyebrow="Contact · We're here to help"
      title="Get in"
      titleAccent="touch."
      subtitle="Questions about CAMBRA? We're here to help."
      maxWidth="max-w-3xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {[
          { icon: Mail, label: "General", value: "support@cambra.io", href: "mailto:support@cambra.io" },
          { icon: MessageSquare, label: "Operators", value: "operators@cambra.io", href: "mailto:operators@cambra.io" },
        ].map((c, i) => (
          <a
            key={i}
            href={c.href}
            className="group rounded-2xl p-6 text-center transition-all hover:-translate-y-0.5"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors"
              style={{
                background: "rgba(96,165,250,0.10)",
                border: "1px solid rgba(96,165,250,0.20)",
              }}
            >
              <c.icon className="w-5 h-5 text-cyan-300" />
            </div>
            <p className="text-sm font-semibold mb-1 text-white">{c.label}</p>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{c.value}</p>
          </a>
        ))}
      </div>

      <div
        className="relative overflow-hidden rounded-2xl p-8"
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2
          className="mb-6 text-white"
          style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em" }}
        >
          Send us a message
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[13px] font-semibold block mb-2 text-white/85">Name</label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your name"
              className="w-full h-12 px-4 rounded-lg outline-none focus:border-cyan-400/50 transition"
              style={fieldStyle}
              required
            />
          </div>
          <div>
            <label className="text-[13px] font-semibold block mb-2 text-white/85">Email</label>
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="your@email.com"
              className="w-full h-12 px-4 rounded-lg outline-none focus:border-cyan-400/50 transition"
              style={fieldStyle}
              required
            />
          </div>
          <div>
            <label className="text-[13px] font-semibold block mb-2 text-white/85">Message</label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Tell us how we can help..."
              className="w-full min-h-32 p-4 rounded-lg outline-none focus:border-cyan-400/50 transition placeholder:text-white/30"
              style={fieldStyle}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full h-12 rounded-full font-bold text-[14px] inline-flex items-center justify-center gap-2 transition-all hover:translate-y-[-1px]"
            style={{
              background: "#ffffff",
              color: "#06080F",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px -12px rgba(34,211,238,0.45)",
            }}
          >
            {submitted ? "Message sent! ✓" : "Send message"}
            {!submitted && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </MarketingPageShell>
  );
}