// MandateTermsSummary — RECOVER-1 (2026-08-03). v61 Checkpoint H (2026-08-06).
//
// Renders the FROZEN acceptance snapshot exactly as the server hashed it. Every
// figure here comes from `snapshot` — nothing is recomputed client-side, because
// the hash of that object is what the signature is verified against.
//
// CHECKPOINT H — the LABELS now come from the server too, via `copy`
// (getRecoverAcceptanceContext → mandate_copy.summary), which is the same module
// the contractual PDF is built from. Before this, these labels and the duration
// were hardcoded English here while the PDF printed the merchant's language: a
// merchant on FR/ES accepted "24 months from go-live" on screen and received
// "24 mois à compter de l'activation" in the document. Same terms, two wordings,
// which is precisely the drift recoverMandateCopy.ts exists to prevent.
//
// The EN constants below are a FALLBACK for a context that predates mandate_copy
// — they are the v1 wording, not a second source of truth.

const EN_FALLBACK = {
  fee_label: "Success fee on verified savings",
  duration_label: "Duration",
  duration_value: "24 months from go-live",
  baseline_label: "Verified baseline",
  baseline_verified_on: "verified",
  projected_label: "Projected annual savings",
};

const eur = (n) => `€${Math.round(Number(n) || 0).toLocaleString()}`;

export default function MandateTermsSummary({ snapshot, baseline, copy }) {
  if (!snapshot) return null;

  const c = { ...EN_FALLBACK, ...(copy || {}) };

  const rows = [
    { label: c.fee_label, value: `${snapshot.fee_pct}%` },
    { label: c.duration_label, value: c.duration_value },
    {
      label: c.baseline_label,
      value: baseline?.baseline_value != null ? eur(baseline.baseline_value) : "—",
      hint: baseline?.verified_at
        ? `${c.baseline_verified_on} ${new Date(baseline.verified_at).toLocaleDateString()}`
        : null,
    },
    {
      label: c.projected_label,
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