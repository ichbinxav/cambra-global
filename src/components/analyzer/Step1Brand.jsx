import { Loader2, MapPin, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RevenueSlider from "./RevenueSlider";

/**
 * Step1Brand — Step 1 of the Analyzer (Brand basics).
 *
 * Single primary task: the website URL (anchors the audit). Brand name,
 * country, revenue and category sit underneath as required-but-secondary.
 *
 * Extracted from Analyzer.jsx purely as a presentation component — all
 * state still lives in the parent. No business logic here.
 *
 * Props are kept narrow on purpose; the parent owns refs, validation,
 * resume offers and discovery status.
 */
export default function Step1Brand({
  t,
  // form values
  brandName, setBrandName,
  websiteUrl, setWebsiteUrl,
  country, setCountry,
  revenueEur, setRevenueEur,
  category, setCategory,
  // discovery feedback
  discoveryStatus,
  discoveryEmpty,
  // events
  onWebsiteBlur,
  // catalog
  COUNTRIES,
  CATEGORY_OPTIONS,
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5"
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">Step 01 · Brand</span>
      </div>
      <h1
        className="text-white mb-3"
        style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: "clamp(28px, 4vw, 36px)",
          fontWeight: 900,
          letterSpacing: "-0.04em",
          lineHeight: 1.02,
        }}
      >
        {t("az_step1_title")}
      </h1>
      <p className="text-[14px] text-white/55 mb-7">{t("az_step1_sub")}</p>

      <div className="space-y-5">
        {/* Website — protagonist */}
        <div className="space-y-1.5">
          <Label htmlFor="az-website" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_website")}</Label>
          <Input
            id="az-website"
            value={websiteUrl}
            onChange={e => setWebsiteUrl(e.target.value)}
            onBlur={onWebsiteBlur}
            placeholder="yourbrand.com"
            className="h-12 text-sm text-white placeholder:text-white/30"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            inputMode="url"
            aria-required="true"
          />
          {discoveryStatus === "running" && (
            <div className="flex items-center gap-1.5 text-[11px] text-white/55">
              <Loader2 size={11} className="animate-spin text-cyan-400" />
              {t("analyzing_your_infra")}
            </div>
          )}
          {discoveryEmpty && (
            <p className="text-[11px] text-white/40">{t("no_public_signals")}</p>
          )}
        </div>

        {/* Brand name */}
        <div className="space-y-1.5">
          <Label htmlFor="az-brand" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_brand_name")}</Label>
          <Input
            id="az-brand"
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            placeholder={t("your_brand_placeholder")}
            className="h-12 text-sm text-white placeholder:text-white/30"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            aria-required="true"
          />
        </div>

        {/* Country */}
        <div className="space-y-1.5">
          <Label htmlFor="az-country" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_country")}</Label>
          <div className="relative">
            <select
              id="az-country"
              value={country}
              onChange={e => setCountry(e.target.value)}
              aria-required="true"
              className="w-full h-12 pl-9 pr-3 rounded-md text-sm appearance-none text-white"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <option value="" style={{ background: "#0a0a0a" }}>{t("select_country")}</option>
              {COUNTRIES.map(c => <option key={c} value={c} style={{ background: "#0a0a0a" }}>{c}</option>)}
            </select>
            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" aria-hidden="true" />
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" aria-hidden="true" />
          </div>
        </div>

        {/* Revenue */}
        <div className="space-y-2">
          <Label id="az-revenue-label" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_revenue")}</Label>
          <div
            className="rounded-2xl px-4 py-4"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <RevenueSlider valueEur={revenueEur} onChangeEur={setRevenueEur} />
          </div>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label id="az-category-label" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_category")}</Label>
          <div role="radiogroup" aria-labelledby="az-category-label" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CATEGORY_OPTIONS.map(c => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={category === c.key}
                onClick={() => setCategory(c.key)}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  category === c.key
                    ? "bg-white text-black"
                    : "text-white/80 hover:text-white"
                }`}
                style={
                  category === c.key
                    ? { border: "1px solid rgba(255,255,255,0.95)" }
                    : { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }
                }
              >
                {t(c.i18n)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}