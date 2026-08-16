// AvgTicketInput — clean numeric input + quick-pick chips.
//
// No slider: the range (5..5000) is too wide for a slider AND precision
// matters (a €48 ticket is materially different from €52 when amortizing a
// €0.25 fixed fee). Chips give a one-tap common-case; typing gives precision.

import { useTranslation } from "@/lib/i18n.jsx";

const QUICK_TICKETS = [25, 50, 80, 150];

export default function AvgTicketInput({ value, onChange }) {
  const { t, formatCurrency } = useTranslation();
  const active = (chip) => Number(value) === chip;

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.85)" }}>
          {t("az_lbl_ticket")}
        </span>
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{t("az_hint_preset_or_type")}</span>
      </div>

      <input
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("az_ticket_placeholder")}
        className="cambra-num-input w-full h-11 rounded-md px-3 text-sm focus:outline-none transition-colors"
        style={{ color: "#ffffff", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}
      />

      <div className="flex flex-wrap gap-2 pt-1">
        {QUICK_TICKETS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(String(v))}
            className="h-8 px-3 rounded-full text-[12px] font-semibold transition-colors"
            style={
              active(v)
                ? {
                    background: "rgba(91,76,245,0.12)",
                    color: "var(--voltio)",
                    border: "1px solid rgba(91,76,245,0.55)",
                  }
                : {
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.8)",
                    border: "1px solid rgba(255,255,255,0.14)",
                  }
            }
          >
            {formatCurrency(v)}
          </button>
        ))}
      </div>

      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
        {t("az_ticket_help")}
      </p>
    </div>
  );
}