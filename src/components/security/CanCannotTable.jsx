import React from "react";
import { Check, X } from "lucide-react";

/**
 * CanCannotTable — the "What we can see" vs "What we can never do" two-column
 * comparison on /Security Block 1. Column labels in JetBrains Mono (.mono-num),
 * items in Inter. The "never" column uses --coral for its X marks (semantic
 * negative), the "can" column uses --menta-dark for its checks.
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
  const iconColor = positive ? "var(--menta-dark)" : "var(--coral)";
  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "#ffffff", border: "1px solid var(--linea)" }}
    >
      <p
        className="mono-num text-[11px] font-semibold uppercase tracking-[0.14em] mb-4"
        style={{ color: "var(--gris-2)" }}
      >
        {label}
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[14px]" style={{ color: "var(--gris-1)" }}>
            <span
              className="inline-flex items-center justify-center h-5 w-5 rounded-full shrink-0 mt-0.5"
              style={{
                background: positive ? "rgba(15,169,122,0.10)" : "rgba(244,91,105,0.10)",
                color: iconColor,
              }}
            >
              <Icon size={12} strokeWidth={2.4} />
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