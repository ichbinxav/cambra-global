import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, MessageSquare, ArrowRight, CalendarDays, Loader2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import BookCallModal from "@/components/paymentsResults/BookCallModal";
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
  const { lang, t } = useTranslation();
  const [formData, setFormData] = useState({ name: "", email: "", message: initialMessage() });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [callOpen, setCallOpen] = useState(false);

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
      setError(err?.message || t("ct_error"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { background: "#FFFFFF", border: "1px solid var(--linea)", color: "var(--ink)" };

  return (
    <PublicPageShell>
      <PublicPageHero
        eyebrow={t("ct_eyebrow")}
        title={<>{t("ct_title_pre")}<br /><span className="kw">{t("ct_title_kw")}</span></>}
        subtitle={t("ct_subtitle")}
      />

      <div className="relative pb-20 pt-16">
        <div className="cambra-public-container grid items-stretch gap-6 lg:grid-cols-[minmax(340px,.74fr)_minmax(0,1.26fr)]">
          <motion.aside
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="cambra-dark-panel flex flex-col p-7 sm:p-9"
          >
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#AFA2FF]">{t("ct_eyebrow")}</p>
            <h2 className="mt-5 text-[clamp(29px,3vw,44px)] font-black leading-[1.02] tracking-[-.045em] text-white">{t("call_title")}</h2>
            <p className="mt-4 max-w-md text-[13px] leading-relaxed text-white/65">{t("call_sub")}</p>

            <div className="mt-8 space-y-3">
              {[
                { icon: Mail, label: t("ct_general"), value: "hello@cambra.global", href: "mailto:hello@cambra.global" },
                { icon: MessageSquare, label: t("ct_support"), value: "support@cambra.global", href: "mailto:support@cambra.global" },
              ].map(({ icon: Icon, label, value, href }) => (
                <a key={href} href={href} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.055] p-4 transition-colors hover:bg-white/[.09]">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[.07] text-[#AFA2FF]"><Icon size={17} /></span>
                  <span className="min-w-0"><strong className="block text-[11px] font-bold text-white">{label}</strong><span className="mt-1 block truncate text-[12px] text-white/60">{value}</span></span>
                  <ArrowRight size={14} className="ml-auto text-white/35 transition-transform group-hover:translate-x-0.5" />
                </a>
              ))}
            </div>

            <button type="button" onClick={() => setCallOpen(true)} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[13px] font-bold text-[#10172D] transition-transform hover:-translate-y-0.5">
              <CalendarDays size={16} /> {t("hero_cta_secondary")}
            </button>
            <p className="mt-auto flex items-start gap-2 pt-8 text-[11px] leading-relaxed text-white/50"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#AFA2FF]" />{t("trust_sec_b4_d")}</p>
          </motion.aside>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden p-7 sm:p-9"
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--linea)",
              borderRadius: 24,
              boxShadow: "0 24px 70px -50px rgba(12,12,22,.34)",
            }}
          >
            <div className="relative">
              <h2 className="font-display text-xl font-black tracking-[-0.03em] mb-6" style={{ color: "var(--ink)" }}>{t("ct_form_title")}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "var(--ink)" }}>{t("ct_name")}</label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder={t("ct_name_ph")}
                    className="h-12"
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "var(--ink)" }}>{t("ct_email")}</label>
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
                  <label className="text-sm font-semibold block mb-2" style={{ color: "var(--ink)" }}>{t("ct_message")}</label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder={t("ct_message_ph")}
                    className="w-full min-h-32 p-4 rounded-lg focus:outline-none focus:ring-1"
                    style={{ ...inputStyle }}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-full font-bold gap-2 text-white hover:opacity-90"
                  style={{ background: "var(--g-voltio)", boxShadow: "0 14px 30px -18px rgba(91,76,245,.7)" }}
                >
                  {submitting
                    ? <>{t("ct_sending")} <Loader2 className="w-4 h-4 animate-spin" /></>
                    : submitted
                      ? t("ct_sent")
                      : <>{t("ct_send")} <ArrowRight className="w-4 h-4" /></>}
                </Button>
                {error && (
                  <p className="text-xs mt-2 text-center" style={{ color: "var(--coral)" }}>{error}</p>
                )}
              </form>
            </div>
          </motion.div>
        </div>
      </div>
      <BookCallModal open={callOpen} onClose={() => setCallOpen(false)} context={{ source: "contact_page" }} />
    </PublicPageShell>
  );
}
