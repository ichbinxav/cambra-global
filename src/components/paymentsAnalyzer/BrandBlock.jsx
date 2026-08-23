// BrandBlock — "About your brand" block for the anonymous PaymentsAnalyzer.
//
// Three fields, minimal by design:
//   - brand_name  (OPTIONAL since SWEEP-1 T2, 2026-07-24; 2-80 chars when
//                 present) — asking for a name before showing value was pure
//                 conversion friction and invited fake data. The claim flow
//                 falls back to a neutral name when absent.
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

import { useTranslation } from "@/lib/i18n.jsx";

export default function BrandBlock({
  brandName,
  onBrandNameChange,
  website,
  onWebsiteChange,
  sector,
  onSectorChange,
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.85)" }}>
          About your brand
        </span>
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>Compare vs. industry</span>
      </div>
      <p className="text-[11.5px] leading-relaxed -mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>
        Helps us compare you with similar businesses. Still no account, still anonymous.
      </p>

      {/* Brand name — OPTIONAL (SWEEP-1 T2) */}
      <div className="space-y-1.5">
        <label
          htmlFor="brand-name-input"
          className="text-[11px] font-medium"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          {t("brand_name_optional")}
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
          className="w-full h-11 px-3 rounded-md text-sm focus:outline-none transition-colors"
          style={{
            color: "#ffffff",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        />
      </div>

      {/* Website + sector — paired on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Website — OPTIONAL */}
        <div className="space-y-1.5">
          <label
            htmlFor="brand-website-input"
            className="text-[11px] font-medium"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            Website <span style={{ color: "rgba(255,255,255,0.5)" }}>(optional)</span>
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
            className="w-full h-11 px-3 rounded-md text-sm focus:outline-none transition-colors"
            style={{
              color: "#ffffff",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          />
        </div>

        {/* Sector — OPTIONAL */}
        <div className="space-y-1.5">
          <label
            htmlFor="brand-sector-input"
            className="text-[11px] font-medium"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            Sector <span style={{ color: "rgba(255,255,255,0.5)" }}>(optional)</span>
          </label>
          <select
            id="brand-sector-input"
            value={sector}
            onChange={(e) => onSectorChange(e.target.value)}
            className="w-full h-11 px-3 rounded-md text-sm focus:outline-none transition-colors"
            style={{
              color: "#ffffff",
              background: "rgba(30,26,60,0.9)",
              border: "1px solid rgba(255,255,255,0.14)",
              colorScheme: "dark",
            }}
          >
            <option value="">
              Select a sector…
            </option>
            {SECTOR_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}