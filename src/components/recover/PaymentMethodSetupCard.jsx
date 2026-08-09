// RECOVER-2 — Stripe-hosted payment method setup. Browser confirmation is never
// treated as evidence; backend reconciliation remains the source of truth.
import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import { getStripe } from "@/lib/stripeJs";
import { useLanguage } from "@/lib/i18n.jsx";
import { recoverUiCopy } from "./recoverUiCopy";

export default function PaymentMethodSetupCard({ dealActivationId, initialStatus }) {
  const { lang } = useLanguage();
  const c = recoverUiCopy(lang).payment;
  const [status, setStatus] = useState(initialStatus || "none");
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const mountRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const paymentElementRef = useRef(null);

  const start = async () => {
    if (starting || saving) return;
    setError("");
    setStarting(true);
    let r = null;
    try {
      r = await base44.functions.invoke("startPaymentMethodSetup", { deal_activation_id: dealActivationId });
    } catch {
      setError(c.startError);
      setStarting(false);
      return;
    }
    setStarting(false);
    if (!r?.data?.client_secret || r?.data?.error) {
      setError(c.startError);
      return;
    }
    stripeRef.current = await getStripe(r.data.publishable_key).catch(() => null);
    if (!stripeRef.current) {
      setError(c.stripeError);
      return;
    }
    elementsRef.current = stripeRef.current.elements({ clientSecret: r.data.client_secret });
    setReady(true);
  };

  useEffect(() => {
    if (!ready || !elementsRef.current || !mountRef.current || paymentElementRef.current) return;
    const element = elementsRef.current.create("payment");
    paymentElementRef.current = element;
    element.mount(mountRef.current);
    return () => {
      try { element.unmount(); } catch {}
      paymentElementRef.current = null;
    };
  }, [ready]);

  const submit = async () => {
    if (saving || starting || !stripeRef.current || !elementsRef.current) return;
    setError("");
    setSaving(true);
    try {
      const { error: stripeError } = await stripeRef.current.confirmSetup({ elements: elementsRef.current, redirect: "if_required" });
      if (stripeError) {
        setError(c.bankError);
        return;
      }
      const r = await base44.functions.invoke("refreshPaymentMethodStatus", { deal_activation_id: dealActivationId }).catch(() => null);
      if (r?.data?.payment_method_status === "ready") {
        setStatus("ready");
        setReady(false);
      } else {
        setError(c.pending);
      }
    } finally {
      setSaving(false);
    }
  };

  if (status === "ready") {
    return (
      <div className="flex items-start gap-2.5 text-[12.5px] text-white/70 leading-relaxed mt-5 pt-5 border-t border-white/10" role="status">
        <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: "#2FE0A8" }} />
        <span>{c.saved}</span>
      </div>
    );
  }

  return (
    <div className="mt-5 pt-5 border-t border-white/10">
      <p className="text-[12.5px] text-white/60 leading-relaxed mb-4">{c.intro}</p>
      {ready ? (
        <>
          <div ref={mountRef} className="cambra-card-inner-light p-4 mb-4" />
          <Button onClick={submit} disabled={saving || starting} className="rounded-full h-10 px-5 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
            {saving ? c.saving : c.save}
          </Button>
        </>
      ) : (
        <Button onClick={start} disabled={starting || saving} className="rounded-full h-10 px-5 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-2">
          {starting ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
          {starting ? c.preparing : c.add}
        </Button>
      )}
      {error && <p className="text-[12px] mt-3" style={{ color: "#F45B69" }} role="alert">{error}</p>}
    </div>
  );
}
