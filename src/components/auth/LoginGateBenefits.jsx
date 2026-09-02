// UX-1 T5 — the value block of the pre-login gate.
//
// Base44 owns the actual credential UI (Google / email), so the only thing we
// can design is the screen BEFORE it. This panel answers "why should I create
// an account?" with the exact items that are locked in the anonymous report
// (achievable rate · fee breakdown · recovery plan + PDF), plus the trust
// chips that lower the friction of signing up.

import { Check, Lock, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

export default function LoginGateBenefits({ title, items: providedItems }) {
  const { t } = useTranslation();
  const items = providedItems || [t("login_gate_b1"), t("login_gate_b2"), t("login_gate_b3")];
  const chips = [
    { icon: ShieldCheck, label: t("login_gate_trust_1") },
    { icon: Lock, label: t("login_gate_trust_2") },
    { icon: Check, label: t("login_gate_trust_3") },
  ];

  return (
    <div className="mt-8">
      <div
        className="rounded-2xl p-5"
        style={{
          background:
            "radial-gradient(120% 100% at 100% 0%, rgba(34,211,238,0.10) 0%, transparent 60%), rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/90 mb-3">
          {title || t("login_gate_benefits_title")}
        </p>
        <ul className="space-y-2.5">
          {items.map((label) => (
            <li key={label} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-full"
                style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.35)" }}
              >
                <Check size={10} className="text-cyan-300" />
              </span>
              <span className="text-[13px] leading-snug text-white/75">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
        {chips.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white/50"
            style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}
          >
            <Icon size={11} className="text-white/45" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
