import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { base44 } from "@/api/base44Client";

/**
 * PartnerApplicationForm — the partner application form on /Partners.
 * Submits through the existing submitContactMessage backend function with
 * topic='partner_application'. Never writes to Lead directly from the browser.
 */
export default function PartnerApplicationForm() {
  const { t, lang } = useTranslation();
  const [form, setForm] = useState({
    name: "",
    email: "",
    organisation: "",
    role: "",
    country: "",
    partner_type: "",
    support_description: "",
    website: "",
    business_count: "",
    additional_context: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const partnerTypes = [
    { value: "adviser", label: t("pt_type_adviser") },
    { value: "agency", label: t("pt_type_agency") },
    { value: "association", label: t("pt_type_association") },
    { value: "finance", label: t("pt_type_finance") },
    { value: "accelerator", label: t("pt_type_accelerator") },
    { value: "other", label: t("pt_type_other") },
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("submitContactMessage", {
        topic: "partner_application",
        name: form.name,
        email: form.email,
        organisation: form.organisation,
        role: form.role,
        country: form.country,
        partner_type: form.partner_type,
        support_description: form.support_description,
        website: form.website,
        business_count: form.business_count,
        additional_context: form.additional_context,
        locale: lang,
      });
      if (!res?.data?.ok) throw new Error(res?.data?.error || "send_failed");
      setSuccess(true);
      setForm({
        name: "", email: "", organisation: "", role: "", country: "",
        partner_type: "", support_description: "", website: "",
        business_count: "", additional_context: "",
      });
    } catch (err) {
      setError(t("pt_form_error"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff" };
  const labelStyle = { color: "rgba(255,255,255,0.65)" };

  if (success) {
    return (
      <div className="relative overflow-hidden text-center py-14 px-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 16 }}>
        <span aria-hidden className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "linear-gradient(90deg, var(--voltio), var(--cian))" }} />
        <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--menta)" }} />
        <p className="text-lg font-semibold text-white">{t("pt_form_success")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative overflow-hidden space-y-4 p-6 sm:p-8" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 16 }}>
      <span aria-hidden className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "linear-gradient(90deg, var(--voltio), var(--cian))" }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="block mb-2" style={labelStyle}>{t("pt_form_name")} *</Label>
          <Input name="name" value={form.name} onChange={handleChange} required className="h-11" style={inputStyle} />
        </div>
        <div>
          <Label className="block mb-2" style={labelStyle}>{t("pt_form_email")} *</Label>
          <Input name="email" type="email" value={form.email} onChange={handleChange} required className="h-11" style={inputStyle} />
        </div>
        <div>
          <Label className="block mb-2" style={labelStyle}>{t("pt_form_org")} *</Label>
          <Input name="organisation" value={form.organisation} onChange={handleChange} required className="h-11" style={inputStyle} />
        </div>
        <div>
          <Label className="block mb-2" style={labelStyle}>{t("pt_form_role")} *</Label>
          <Input name="role" value={form.role} onChange={handleChange} required className="h-11" style={inputStyle} />
        </div>
        <div>
          <Label className="block mb-2" style={labelStyle}>{t("pt_form_country")} *</Label>
          <Input name="country" value={form.country} onChange={handleChange} required className="h-11" style={inputStyle} />
        </div>
        <div>
          <Label className="block mb-2" style={labelStyle}>{t("pt_form_type")} *</Label>
          <select
            name="partner_type"
            value={form.partner_type}
            onChange={handleChange}
            required
            className="h-11 w-full rounded-md px-3 text-sm focus:outline-none focus:ring-1"
            style={inputStyle}
          >
            <option value="" disabled>—</option>
            {partnerTypes.map((pt) => (
              <option key={pt.value} value={pt.value} style={{ color: "#111" }}>{pt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label className="block mb-2" style={labelStyle}>{t("pt_form_support")} *</Label>
        <textarea
          name="support_description"
          value={form.support_description}
          onChange={handleChange}
          required
          rows={4}
          className="w-full p-3 rounded-lg focus:outline-none focus:ring-1 resize-y"
          style={inputStyle}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="block mb-2" style={labelStyle}>{t("pt_form_website")}</Label>
          <Input name="website" value={form.website} onChange={handleChange} className="h-11" style={inputStyle} />
        </div>
        <div>
          <Label className="block mb-2" style={labelStyle}>{t("pt_form_count")}</Label>
          <Input name="business_count" value={form.business_count} onChange={handleChange} className="h-11" style={inputStyle} />
        </div>
      </div>

      <div>
        <Label className="block mb-2" style={labelStyle}>{t("pt_form_context")}</Label>
        <textarea
          name="additional_context"
          value={form.additional_context}
          onChange={handleChange}
          rows={3}
          className="w-full p-3 rounded-lg focus:outline-none focus:ring-1 resize-y"
          style={inputStyle}
        />
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full h-12 rounded-full font-bold gap-2 text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        style={{ background: "var(--g-voltio)", boxShadow: "0 8px 24px rgba(91,76,245,.35)" }}
      >
        {submitting ? (
          <>{t("pt_form_submit")}… <Loader2 className="w-4 h-4 animate-spin" /></>
        ) : (
          <>{t("pt_form_submit")} <ArrowRight className="w-4 h-4" /></>
        )}
      </Button>

      {error && (
        <p className="text-sm text-center" style={{ color: "var(--coral)" }} role="alert">{error}</p>
      )}
    </form>
  );
}