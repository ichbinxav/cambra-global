// MandateTermsSummary — RECOVER-1 (2026-08-03).
//
// Renders the FROZEN acceptance snapshot exactly as the server hashed it. Every
// figure here comes from `snapshot` — nothing is recomputed client-side, because
// the hash of that object is what the signature is verified against.

const eur = (n) => `€${Math.round(Number(n) || 0).toLocaleString()}`;

export default function MandateTermsSummary({ snapshot, baseline }) {
  if (!snapshot) return null;

  const rows = [
    { label: "Success fee on verified savings", value: `${snapshot.fee_pct}%` },
    { label: "Duration", value: "24 months from go-live" },
    {
      label: "Verified baseline",
      value: baseline?.baseline_value != null ? eur(baseline.baseline_value) : "—",
      hint: baseline?.verified_at ? `verified ${new Date(baseline.verified_at).toLocaleDateString()}` : null,
    },
    {
      label: "Projected annual savings",
      value: snapshot.projected_savings_annual != null ? eur(snapshot.projected_savings_annual) : "—",
    },
  ];

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-white/55 mb-1.5">{r.label}</p>
          <p className="text-base font-black text-white tabular-nums">{r.value}</p>
          {r.hint && <p className="text-[11px] text-white/45 font-mono mt-1">{r.hint}</p>}
        </div>
      ))}
    </div>
  );
}