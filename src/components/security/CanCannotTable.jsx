import React from "react";
import { Check, X } from "lucide-react";

/**
 * CanCannotTable — "What we can see" vs "What we can never do" on /Security.
 * Light paper panels matching the landing: the "can" column uses the voltio
 * accent, the "never" column uses coral. Labels in JetBrains Mono (.mono-num).
 */
const CAN_SEE = [
  "Transaction amounts and fees",
  "Payment methods and card types",
  "Currencies and regions",
  "Payout schedules",
];

const CANNOT_DO = [
  "Move or hold money",
  "Create or refund charges",
  "See your customers' card numbers",
  "Change anything in your account",
];

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
  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Column label="What we can see" items={CAN_SEE} positive />
      <Column label="What we can never do" items={CANNOT_DO} positive={false} />
    </div>
  );
}