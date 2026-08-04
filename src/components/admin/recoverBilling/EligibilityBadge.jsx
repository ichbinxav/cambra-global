const MAP = {
  eligible: { label: "Eligible", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25" },
  invoiced: { label: "Invoiced", cls: "bg-blue-500/10 text-blue-700 border-blue-500/25" },
  no_positive_savings: { label: "No savings", cls: "bg-muted text-muted-foreground border-border" },
  not_ready: { label: "Not reviewed", cls: "bg-muted text-muted-foreground border-border" },
  blocked_missing_evidence: { label: "No evidence", cls: "bg-amber-500/10 text-amber-700 border-amber-500/25" },
  blocked_tax: { label: "Tax blocked", cls: "bg-rose-500/10 text-rose-700 border-rose-500/25" },
  blocked_payment_method: { label: "No payment method", cls: "bg-rose-500/10 text-rose-700 border-rose-500/25" },
  blocked_contract: { label: "Contract blocked", cls: "bg-rose-500/10 text-rose-700 border-rose-500/25" },
};

export default function EligibilityBadge({ status }) {
  const s = MAP[status] || MAP.not_ready;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${s.cls}`}>
      {s.label}
    </span>
  );
}