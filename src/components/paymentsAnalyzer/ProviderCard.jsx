// ProviderCard — one PSP option, rendered as a tap-friendly mini card.
//
// Design decisions:
//
// • LOGO SOURCE. Inline monochrome SVGs (see providerLogos.jsx) sourced from
//   Simple Icons under CC0. Bundling kills two problems at once:
//   (1) the cross-origin race that would flash the initial fallback before
//   the CDN image loaded in the preview browser, and (2) any runtime
//   dependency on a third-party CDN staying up.
//
// • NOMINATIVE USE. Showing "Stripe" / "PayPal" logos to let the user pick
//   their processor is nominative use — identical to how a checkout page
//   shows Visa/Mastercard glyphs to say "we accept these". Identifying a
//   provider is not the same as endorsing CAMBRA with their brands.
//
// • COHESIVE TINTING. Every logo renders with `fill="currentColor"`, so the
//   whole grid inherits one color from the card (white/70 when idle, cyan
//   when selected). No brand-color salad, no per-slug CSS.
//
// • FALLBACKS.
//     - Slug without an inline SVG (mollie, checkout_com, sumup today) →
//       initial-in-circle mark. Same monochrome treatment, same size box,
//       never a broken image, never a layout hole.
//     - "other" → lucide CreditCard icon (generic, monochrome).
//
// • ACCESSIBILITY. Cards are ≥ 56px tall (comfortable for a thumb on 375px),
//   have real focus rings, and report state via aria-pressed. The image is
//   decorative (aria-hidden) — the visible label carries the meaning.
//
// This component renders ONE option. The parent (ProviderGrid) decides grid
// density. Same enum, same payload — only presentation changed.

import { Check, CreditCard } from "lucide-react";
import { ProviderLogoSvg, hasProviderLogo } from "@/components/paymentsAnalyzer/providerLogos";

function LogoMark({ slug, label, selected }) {
  // Every mark occupies the same 32×32 tile so lines stay aligned regardless
  // of which fallback branch fires.
  const wrapClass = "inline-flex items-center justify-center h-8 w-8 shrink-0";
  const tint = selected ? "text-cyan-300" : "text-white/70";

  // Branch 1 — vendor has an inline SVG.
  if (hasProviderLogo(slug)) {
    return (
      <span className={`${wrapClass} ${tint}`}>
        <ProviderLogoSvg slug={slug} size={20} />
      </span>
    );
  }

  // Branch 2 — "other" is generic on purpose (no vendor). Uses lucide's
  // CreditCard so it visually belongs to the same monochrome family.
  if (slug === "other") {
    return (
      <span className={wrapClass} aria-hidden="true">
        <CreditCard
          size={20}
          className={tint}
          strokeWidth={1.75}
        />
      </span>
    );
  }

  // Branch 3 — initial-in-circle for slugs we don't have a mark for yet.
  const initial = (label || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className={wrapClass}
      aria-hidden="true"
      style={{
        borderRadius: 999,
        background: selected ? "rgba(34,211,238,0.18)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${selected ? "rgba(34,211,238,0.55)" : "rgba(255,255,255,0.14)"}`,
      }}
    >
      <span
        className={`text-[13px] font-bold ${selected ? "text-cyan-200" : "text-white/70"}`}
        style={{ letterSpacing: "-0.02em" }}
      >
        {initial}
      </span>
    </span>
  );
}

export default function ProviderCard({ option, value, onChange }) {
  const selected = value === option.slug;
  return (
    <button
      type="button"
      onClick={() => onChange(option.slug)}
      // min-h-14 = 56px → clears the 44px thumb-target floor on 375px.
      className="relative rounded-xl px-3 py-3 min-h-14 flex items-center gap-2.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 hover:border-white/25"
      style={
        selected
          ? {
              background: "rgba(34,211,238,0.10)",
              border: "1px solid rgba(34,211,238,0.55)",
              boxShadow:
                "0 0 0 3px rgba(34,211,238,0.10), 0 6px 20px -8px rgba(34,211,238,0.45)",
            }
          : {
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.10)",
            }
      }
      aria-pressed={selected}
      aria-label={option.label}
    >
      <LogoMark slug={option.slug} label={option.label} selected={selected} />
      <span
        className={`text-[13px] font-semibold leading-tight ${
          selected ? "text-white" : "text-white/85"
        }`}
      >
        {option.label}
      </span>
      {selected && (
        <span
          className="absolute top-1.5 right-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full"
          style={{ background: "rgba(34,211,238,0.9)" }}
          aria-hidden="true"
        >
          <Check size={10} className="text-neutral-900" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}