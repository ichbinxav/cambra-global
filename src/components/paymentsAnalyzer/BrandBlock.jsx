// BrandBlock — "About your brand" block for the anonymous PaymentsAnalyzer.
//
// Three fields, minimal by design:
//   - brand_name  (required, 2-80 chars)  — the single mandatory addition;
//                 without a name every analysis is anonymous noise in the
//                 lead intelligence layer.
//   - website     (optional, URL-ish)      — captured to enable future
//                 auto-detection (stack, geo, size proxies) without asking.
//   - sector      (optional, enum)         — enables cohort-aware benchmarking
//                 and outbound segmentation later.
//
// Design contract:
//   - This block does NOT change any engine input. It is metadata attached
//     to the session (input_snapshot) so lead intelligence and future
//     benchmarks can join on it.
//   - Server-side re-validates every field (see submitPaymentsAnalysis).
//   - Microcopy makes the value exchange honest: "helps us benchmark you,
//     still anonymous, no account".
//
// Sectors reuse the same 7 categories we've always used across the product
// (see Brand entity's `category` enum + the marketing copy on Landing).
// Kept as a plain <select> — one-shot input, low frequency, no need for a
// custom control.

const SECTOR_OPTIONS = [
  { value: "fashion",       label: "Fashion" },
  { value: "beauty",        label: "Beauty" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "home_living",   label: "Home & Living" },
  { value: "electronics",   label: "Electronics" },
  { value: "health_wellness", label: "Health & Wellness" },
  { value: "other",         label: "Other" },
];

// Exported so the parent (and tests) can reuse the enum without drift.
export const BRAND_SECTOR_SLUGS = SECTOR_OPTIONS.map((s) => s.value);

export default function BrandBlock({
  brandName,
  onBrandNameChange,
  website,
  onWebsiteChange,
  sector,
  onSectorChange,
}) {
  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      {/* Section header */}
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          About your brand
        </span>
        <span className="text-[10px] text-white/35">Cohort benchmark</span>
      </div>
      <p className="text-[11.5px] text-white/45 leading-relaxed -mt-1">
        Helps us benchmark you against similar brands. Still no account, still anonymous.
      </p>

      {/* Brand name — REQUIRED */}
      <div className="space-y-1.5">
        <label
          htmlFor="brand-name-input"
          className="text-[11px] font-medium text-white/60"
        >
          Brand name <span className="text-red-300/90">*</span>
        </label>
        <input
          id="brand-name-input"
          type="text"
          inputMode="text"
          autoComplete="organization"
          maxLength={80}
          value={brandName}
          onChange={(e) => onBrandNameChange(e.target.value)}
          placeholder="e.g. Aime Studio"
          className="w-full h-11 px-3 rounded-md text-sm text-white placeholder-white/25 focus:outline-none focus:border-cyan-400/60 transition-colors"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        />
      </div>

      {/* Website + sector — paired on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Website — OPTIONAL */}
        <div className="space-y-1.5">
          <label
            htmlFor="brand-website-input"
            className="text-[11px] font-medium text-white/60"
          >
            Website <span className="text-white/35">(optional)</span>
          </label>
          <input
            id="brand-website-input"
            type="url"
            inputMode="url"
            autoComplete="url"
            maxLength={200}
            value={website}
            onChange={(e) => onWebsiteChange(e.target.value)}
            placeholder="aimestudio.com"
            className="w-full h-11 px-3 rounded-md text-sm text-white placeholder-white/25 focus:outline-none focus:border-cyan-400/60 transition-colors"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          />
        </div>

        {/* Sector — OPTIONAL */}
        <div className="space-y-1.5">
          <label
            htmlFor="brand-sector-input"
            className="text-[11px] font-medium text-white/60"
          >
            Sector <span className="text-white/35">(optional)</span>
          </label>
          <select
            id="brand-sector-input"
            value={sector}
            onChange={(e) => onSectorChange(e.target.value)}
            className="w-full h-11 px-3 rounded-md text-sm text-white focus:outline-none focus:border-cyan-400/60 transition-colors"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <option value="" className="bg-neutral-900">
              Select a sector…
            </option>
            {SECTOR_OPTIONS.map((s) => (
              <option key={s.value} value={s.value} className="bg-neutral-900">
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}