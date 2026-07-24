import React from "react";
import { Check, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * CanCannotTable — "What we can see" vs "What we can never do" on /Security.
 * Light paper panels matching the landing: the "can" column uses the voltio
 * accent, the "never" column uses coral. Labels in JetBrains Mono (.mono-num).
 */
/* I18N-GAP — copy lives in the i18n dictionary (sec_can_* / sec_cannot_*). */
const CAN_SEE_KEYS = ["sec_can_1", "sec_can_2", "sec_can_3", "sec_can_4"];
const CANNOT_DO_KEYS = ["sec_cannot_1", "sec_cannot_2", "sec_cannot_3", "sec_cannot_4"];

function Column({ label, items, positive }) {
  const Icon = positive ? Check : X;
  const color = positive ? "#5B4CF5" : "#F45B69";
  const soft = positive ? "rgba(91,76,245,0.06)" : "rgba(244,91,105,0.06)";
  return (
    <div
      className="relative rounded-2xl p-6 overflow-hidden"
      style={{
        background: soft,
        border: `1px solid ${color}26`,
      }}
    >
      <p
        className="relative mono-num text-[11px] font-semibold uppercase tracking-[0.16em] mb-5 flex items-center gap-2"
        style={{ color }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </p>
      <ul className="relative space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[14px]" style={{ color: "var(--ink)" }}>
            <span
              className="inline-flex items-center justify-center h-5 w-5 rounded-full shrink-0 mt-0.5"
              style={{ background: `${color}1f`, color }}
            >
              <Icon size={12} strokeWidth={2.6} />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CanCannotTable() {
  const { t } = useTranslation();
  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Column label={t("sec_can_title")} items={CAN_SEE_KEYS.map((k) => t(k))} positive />
      <Column label={t("sec_cannot_title")} items={CANNOT_DO_KEYS.map((k) => t(k))} positive={false} />
    </div>
  );
}