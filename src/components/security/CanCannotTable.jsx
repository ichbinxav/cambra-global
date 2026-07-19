import React from "react";
import { Check, X } from "lucide-react";

/**
 * CanCannotTable — "What we can see" vs "What we can never do" on /Security.
 * Cybersecurity dark styling: two glass panels, the "can" column glows menta,
 * the "never" column glows coral. Labels in JetBrains Mono (.mono-num).
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
  const color = positive ? "#2FE0A8" : "#FF8A6B";
  const glow = positive ? "rgba(47,224,168,0.18)" : "rgba(244,91,105,0.18)";
  return (
    <div
      className="relative rounded-2xl p-6 overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${color}30`,
        boxShadow: `inset 0 0 40px -20px ${glow}`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full"
        style={{ background: glow, filter: "blur(30px)" }}
      />
      <p
        className="relative mono-num text-[11px] font-semibold uppercase tracking-[0.16em] mb-5 flex items-center gap-2"
        style={{ color }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </p>
      <ul className="relative space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[14px]" style={{ color: "rgba(255,255,255,0.8)" }}>
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