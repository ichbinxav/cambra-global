// PaymentMethodSetupCard — RECOVER-2 (2026-08-03).
//
// Collects the payment method for FUTURE success-fee invoices. Card data is typed
// into Stripe's own iframe (Payment Element) and never touches our code or servers.
//
// Nothing here is trusted as proof: after confirmSetup we ask the BACKEND to read
// the SetupIntent from Stripe (refreshPaymentMethodStatus) and only its answer
// decides whether the method is ready.

import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import { getStripe } from "@/lib/stripeJs";

export default function PaymentMethodSetupCard({ dealActivationId, initialStatus }) {
  const [status, setStatus] = useState(initialStatus || "none");
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const mountRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);

  const start = async () => {
    setError("");
    setStarting(true);
    const r = await base44.functions
      .invoke("startPaymentMethodSetup", { deal_activation_id: dealActivationId })
      .catch((e) => ({ data: { error: e?.message || "network_error" } }));
    setStarting(false);
    if (!r?.data?.client_secret) {
      setError(r?.data?.error || "We couldn't start the setup. Please try again.");
      return;
    }
    stripeRef.current = await getStripe(r.data.publishable_key).catch(() => null);
    if (!stripeRef.current) {
      setError("We couldn't reach Stripe. Please check your connection and retry.");
      return;
    }
    elementsRef.current = stripeRef.current.elements({ clientSecret: r.data.client_secret });
    setReady(true);
  };

  useEffect(() => {
    if (ready && elementsRef.current && mountRef.current) {
      elementsRef.current.create("payment").mount(mountRef.current);
    }
  }, [ready]);

  const submit = async () => {
    setError("");
    setSaving(true);
    const { error: stripeError } = await stripeRef.current.confirmSetup({
      elements: elementsRef.current,
      redirect: "if_required",
    });
    if (stripeError) {
      setSaving(false);
      setError(stripeError.message || "Your bank declined the authorization.");
      return;
    }
    // The browser's word is not evidence — the server reads the SetupIntent.
    const r = await base44.functions
      .invoke("refreshPaymentMethodStatus", { deal_activation_id: dealActivationId })
      .catch(() => null);
    setSaving(false);
    if (r?.data?.payment_method_status === "ready") {
      setStatus("ready");
      setReady(false);
    } else {
      setError(r?.data?.error || "Stripe hasn't confirmed the method yet. Give it a moment and retry.");
    }
  };

  if (status === "ready") {
    return (
      <div className="flex items-start gap-2.5 text-[12.5px] text-white/70 leading-relaxed mt-5 pt-5 border-t border-white/10">
        <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: "#2FE0A8" }} />
        <span>Payment method saved. It is only charged against savings we've verified — never before.</span>
      </div>
    );
  }

  return (
    <div className="mt-5 pt-5 border-t border-white/10">
      <p className="text-[12.5px] text-white/60 leading-relaxed mb-4">
        Add a payment method for future success-fee invoices. Nothing is charged now — we only invoice once savings are
        verified against your own statements.
      </p>

      {ready ? (
        <>
          <div ref={mountRef} className="cambra-card-inner-light p-4 mb-4" />
          <Button
            onClick={submit}
            disabled={saving}
            className="rounded-full h-10 px-5 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
            {saving ? "Saving" : "Save payment method"}
          </Button>
        </>
      ) : (
        <Button
          onClick={start}
          disabled={starting}
          className="rounded-full h-10 px-5 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-2"
        >
          {starting ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
          {starting ? "Preparing" : "Add payment method"}
        </Button>
      )}

      {error && <p className="text-[12px] text-white/70 mt-3" style={{ color: "#F45B69" }}>{error}</p>}
    </div>
  );
}