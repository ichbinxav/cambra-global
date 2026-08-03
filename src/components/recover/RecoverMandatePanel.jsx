// RecoverMandatePanel — RECOVER-1 (2026-08-03).
//
// Entry point for the acceptance popup on /Reports. Renders NOTHING unless the
// merchant actually has an activation to authorize — no empty teaser, no promise
// of a flow they can't complete.
//
// When they are not eligible we say WHY in plain language instead of hiding a
// disabled button: "no verified baseline yet" is a real, actionable state (connect
// the provider / upload a statement), not an error.

import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import RecoverMandateModal from "./RecoverMandateModal";
import PaymentMethodSetupCard from "./PaymentMethodSetupCard";

const BLOCKER_COPY = {
  no_verified_baseline:
    "We need a verified starting figure before you can authorize us. Connect your provider or upload a statement — once our team confirms it, this unlocks.",
  mandate_already_active: null, // handled as the accepted state below
};

export default function RecoverMandatePanel() {
  const [ctx, setCtx] = useState(null);
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  // Kept so the payment-method card knows where the setup already stands
  // (an authorized activation with no method yet is a real, expected state).
  const [activation, setActivation] = useState(null);

  useEffect(() => {
    (async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) return;
      setEmail(me.email || "");
      const acts = await base44.entities.DealActivation
        .filter({ user_email: me.email }, "-created_date", 5)
        .catch(() => []);
      const target = (acts || []).find((a) => ["activated", "awaiting_authorization", "authorized"].includes(a.status));
      if (!target) return;
      setActivation(target);
      const r = await base44.functions
        .invoke("getRecoverAcceptanceContext", { deal_activation_id: target.id })
        .catch(() => null);
      if (r?.data?.ok) setCtx(r.data);
    })();
  }, []);

  if (!ctx) return null;

  const isAccepted = accepted || !!ctx.active_mandate_id;
  const blocker = (ctx.blockers || []).map((b) => BLOCKER_COPY[b]).find(Boolean);

  return (
    <div className="cambra-card p-7 mb-6">
      <div className="relative">
        <p className="cc-eyebrow mb-1">Recover margin</p>
        <p className="text-sm font-semibold text-white mb-4">
          {isAccepted ? "Authorization in place" : "Authorize us to recover your margin"}
        </p>

        {isAccepted ? (
          <div className="flex items-start gap-2.5 text-[12.5px] text-white/70 leading-relaxed">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: "#2FE0A8" }} />
            <span>
              You've authorized us at a {ctx.fee_pct}% fee on verified savings. We only charge on savings confirmed
              against your own statements. You can revoke it at any time.
            </span>
          </div>
        ) : blocker ? (

          <p className="text-[12.5px] text-white/60 leading-relaxed">{blocker}</p>
        ) : ctx.eligible ? (
          <>
            <p className="text-[12.5px] text-white/60 leading-relaxed mb-5">
              We'll negotiate with your provider, or move you to a better rate, and charge {ctx.fee_pct}% of what we
              actually recover — verified against your statements. No recovery, no fee.
            </p>
            <Button
              onClick={() => setOpen(true)}
              className="rounded-full h-10 px-5 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-2"
            >
              <ShieldCheck size={14} /> Review and authorize
            </Button>
          </>
        ) : (
          <p className="text-[12.5px] text-white/60 leading-relaxed">
            This deal isn't at the authorization stage yet — we'll let you know as soon as it is.
          </p>
        )}

        {isAccepted && activation && (
          <PaymentMethodSetupCard
            dealActivationId={ctx.deal_activation_id || activation.id}
            initialStatus={activation.payment_method_status}
          />
        )}
      </div>

      {open && (
        <RecoverMandateModal
          context={{ ...ctx, owner_email_display: email }}
          onClose={() => setOpen(false)}
          onAccepted={() => { setAccepted(true); setOpen(false); }}
        />
      )}
    </div>
  );
}