import React, { useMemo, useState } from "react";
import { Check, Search, Sparkles, Plus, Flame, Star, Zap } from "lucide-react";
import { CATALOG, TOOL_CATEGORIES, getCatalogMeta } from "@/lib/analyzerToolCatalog";

/**
 * Essentials — tools that every DTC/commerce brand needs SOMETHING in,
 * regardless of vertical. Used to mark category gaps that hurt the score.
 * One representative per category-bucket the founder almost certainly uses.
 */
const ESSENTIAL_TOOLS = new Set([
  // Founders need *a* payment processor
  "Stripe", "Shopify Payments", "PayPal", "Adyen", "Mollie",
  // …and *a* commerce platform
  "Shopify", "WooCommerce", "Prestashop",
  // …and *a* shipping carrier
  "DHL", "UPS", "Colissimo", "Sendcloud",
  // …and *a* business bank
  "Qonto", "Revolut Business", "Wise Business",
]);

/**
 * Vertical → set of tools that are *especially popular* in that sector.
 * Used to surface a "Recommended for {sector}" band at the top of the
 * picker AND to badge those tools inside their category sections.
 *
 * Curated from common DTC stacks per category — not exhaustive, just the
 * ones founders in that vertical recognize immediately.
 */
const VERTICAL_POPULAR = {
  Fashion: [
    "Shopify", "Stripe", "Klaviyo", "Meta Ads", "DHL", "Colissimo",
    "Sendcloud", "Yotpo", "Gorgias", "Klarna", "Alma",
  ],
  Beauty: [
    "Shopify", "Stripe", "Klaviyo", "Attentive", "Meta Ads", "Yotpo",
    "Gorgias", "Sendcloud", "Colissimo",
  ],
  "Food & Beverage": [
    "Shopify", "Stripe", "Klaviyo", "Sendcloud", "Chronopost",
    "Mondial Relay", "Meta Ads", "Gorgias",
  ],
  Electronics: [
    "Shopify", "WooCommerce", "Stripe", "PayPal", "DHL", "UPS",
    "Zendesk", "Gorgias", "Klaviyo", "Google Ads",
  ],
  "Home & Living": [
    "Shopify", "WooCommerce", "Stripe", "DHL", "GLS", "Sendcloud",
    "Klaviyo", "Meta Ads", "Yotpo",
  ],
  "Sports & Outdoors": [
    "Shopify", "Stripe", "DHL", "Sendcloud", "Klaviyo", "Meta Ads",
    "Gorgias", "Yotpo",
  ],
  "Health & Wellness": [
    "Shopify", "Stripe", "Klaviyo", "Attentive", "Meta Ads",
    "Gorgias", "Yotpo", "Sendcloud",
  ],
  "Toys & Kids": [
    "Shopify", "Stripe", "Klaviyo", "Sendcloud", "Colissimo",
    "Meta Ads", "Gorgias",
  ],
  Pets: [
    "Shopify", "Stripe", "Klaviyo", "Sendcloud", "Meta Ads",
    "Gorgias", "Yotpo",
  ],
  "Jewelry & Accessories": [
    "Shopify", "Stripe", "Klaviyo", "Meta Ads", "DHL", "Colissimo",
    "Yotpo", "Gorgias", "Klarna",
  ],
  "Books & Media": [
    "Shopify", "WooCommerce", "Stripe", "Sendcloud", "Colissimo",
    "Klaviyo", "Meta Ads",
  ],
  Automotive: [
    "WooCommerce", "Shopify", "Stripe", "PayPal", "DHL", "UPS",
    "Zendesk", "Google Ads",
  ],
  "B2B & Wholesale": [
    "Stripe", "GoCardless", "Qonto", "Revolut Business", "Pennylane",
    "Quickbooks", "HubSpot", "Notion", "Slack", "Linear",
  ],
  Other: [],
};

/**
 * Impact-by-category — qualitative signal for the picker. The Analyzer's
 * actual savings come from scoreEngine, so this is purely a visual nudge
 * that helps founders pick what matters most for their score.
 *
 *   high   → directly drives savings (payments, shipping)
 *   medium → recurring cost line items (saas, marketing, banking, commerce)
 *   low    → ops/visibility (analytics, support)
 */
const CATEGORY_IMPACT = {
  payments:  "high",
  shipping:  "high",
  saas:      "medium",
  marketing: "medium",
  banking:   "medium",
  commerce:  "medium",
  analytics: "low",
  support:   "low",
};

/**
 * Vertical → priority order. The first category listed is shown first when
 * the founder's brand category matches. Falls back to TOOL_CATEGORIES order.
 */
const VERTICAL_PRIORITY = {
  Fashion:                  ["commerce", "payments", "shipping", "marketing", "saas", "analytics", "support", "banking"],
  Beauty:                   ["commerce", "payments", "shipping", "marketing", "saas", "analytics", "support", "banking"],
  "Food & Beverage":        ["commerce", "shipping", "payments", "marketing", "saas", "analytics", "support", "banking"],
  Electronics:              ["commerce", "payments", "shipping", "marketing", "support", "saas", "analytics", "banking"],
  "Home & Living":          ["commerce", "shipping", "payments", "marketing", "saas", "analytics", "support", "banking"],
  "Sports & Outdoors":      ["commerce", "shipping", "payments", "marketing", "saas", "analytics", "support", "banking"],
  "Health & Wellness":      ["commerce", "payments", "marketing", "shipping", "saas", "analytics", "support", "banking"],
  "Toys & Kids":            ["commerce", "shipping", "payments", "marketing", "saas", "analytics", "support", "banking"],
  Pets:                     ["commerce", "shipping", "payments", "marketing", "saas", "analytics", "support", "banking"],
  "Jewelry & Accessories":  ["commerce", "payments", "shipping", "marketing", "saas", "analytics", "support", "banking"],
  "Books & Media":          ["commerce", "shipping", "payments", "marketing", "saas", "analytics", "support", "banking"],
  Automotive:               ["commerce", "shipping", "payments", "marketing", "saas", "support", "analytics", "banking"],
  "B2B & Wholesale":        ["payments", "banking", "saas", "commerce", "shipping", "marketing", "analytics", "support"],
  Other:                    null, // use default order
};

/**
 * ToolPicker — Step 2 grid where the founder ticks every tool in their stack.
 *
 * Always rendered — even when discovery returned nothing. That's the whole
 * point: the founder shouldn't be staring at a blank screen wondering whether
 * to type tool names into a select.
 *
 * Props (kept narrow on purpose):
 *   - detected:           array of provider names already detected on the site
 *                         (rendered as a pre-selected band at the top).
 *   - confirmedNames:     Set<string> of provider names already confirmed
 *                         (catalog matches by name, case-insensitive).
 *   - onToggleByName:     (name: string, action: 'confirm' | 'dismiss') => void
 *                         Same contract as DetectedToolsGrid.onToggle but
 *                         keyed by name rather than `${category}|${name}`.
 *   - onAddCustom:        (name: string, category: string) => void
 *                         Called when the founder types a tool not in the
 *                         catalog. Optional — picker still works without it.
 */
export default function ToolPicker({
  detected = [],
  confirmedNames,
  onToggleByName,
  onAddCustom,
  vertical = "",
}) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [customName, setCustomName] = useState("");
  const [customCat, setCustomCat] = useState("saas");

  // Reorder category tabs and group rendering based on the brand's vertical.
  const orderedCategories = useMemo(() => {
    const priority = VERTICAL_PRIORITY[vertical];
    if (!priority) return TOOL_CATEGORIES;
    const byKey = new Map(TOOL_CATEGORIES.map(c => [c.key, c]));
    const ordered = [];
    for (const k of priority) {
      const c = byKey.get(k);
      if (c) { ordered.push(c); byKey.delete(k); }
    }
    // Append any categories not in the priority list
    return [...ordered, ...byKey.values()];
  }, [vertical]);

  // Set of tool names that are popular in the brand's vertical.
  // Used both for the "Recommended" band and for the individual badges.
  const popularSet = useMemo(() => {
    const list = VERTICAL_POPULAR[vertical] || [];
    return new Set(list.map(n => n.toLowerCase()));
  }, [vertical]);

  // Tools to feature in the "Recommended for {sector}" band, in order.
  const recommendedItems = useMemo(() => {
    if (!vertical || !popularSet.size) return [];
    // Preserve VERTICAL_POPULAR's curated order (already curated by hand).
    const orderedNames = VERTICAL_POPULAR[vertical] || [];
    const byName = new Map(CATALOG.map(c => [c.name.toLowerCase(), c]));
    return orderedNames
      .map(n => byName.get(n.toLowerCase()))
      .filter(Boolean);
  }, [vertical, popularSet]);

  const confirmedLower = useMemo(() => {
    const s = new Set();
    confirmedNames?.forEach(n => s.add(String(n).toLowerCase()));
    return s;
  }, [confirmedNames]);

  const detectedSet = useMemo(() => {
    const s = new Set();
    detected.forEach(n => s.add(String(n).toLowerCase()));
    return s;
  }, [detected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter(item => {
      if (activeCat !== "all" && item.category !== activeCat) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, activeCat]);

  // Group filtered items by category for nicer rendering — ordered by the
  // brand's vertical priority (so the most relevant categories come first).
  // Within each category, popular-in-vertical tools float to the top.
  const grouped = useMemo(() => {
    const map = new Map();
    // Seed the map in vertical-priority order so iteration follows it.
    for (const c of orderedCategories) map.set(c.key, []);
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category).push(item);
    }
    // Sort each bucket so popular-in-vertical tools come first.
    for (const [k, items] of map) {
      items.sort((a, b) => {
        const aPop = popularSet.has(a.name.toLowerCase()) ? 0 : 1;
        const bPop = popularSet.has(b.name.toLowerCase()) ? 0 : 1;
        return aPop - bPop;
      });
      if (items.length === 0) map.delete(k);
    }
    return map;
  }, [filtered, orderedCategories, popularSet]);

  const handleAddCustom = (e) => {
    e?.preventDefault?.();
    const name = customName.trim();
    if (!name) return;
    onAddCustom?.(name, customCat);
    setCustomName("");
  };

  // Detected band (pre-selected by discovery) — only those not already in the catalog
  // need their own visual; catalog matches show as confirmed in the grid below.
  const detectedNotInCatalog = useMemo(() => {
    return detected.filter(n => !getCatalogMeta(n));
  }, [detected]);

  return (
    <div className="space-y-5">
      {/* Detected band */}
      {detected.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{
            background: "rgba(34,211,238,0.06)",
            border: "1px solid rgba(34,211,238,0.22)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={13} className="text-cyan-300" />
            <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-200">
              Detected on your site
            </span>
            <span className="text-[10px] text-white/45 tabular-nums">{detected.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {detected.map(name => (
              <ToolChip
                key={`det-${name}`}
                name={name}
                selected
                onClick={() => onToggleByName?.(name, "dismiss")}
              />
            ))}
            {detectedNotInCatalog.length > 0 && (
              <p className="basis-full mt-1 text-[10px] text-white/45">
                Tap any to remove if it's not yours.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recommended-for-vertical band — only shown when the brand has a
          known vertical AND the user isn't searching/filtering. Gives an
          instant "this is for you" entry point before the full grid. */}
      {recommendedItems.length > 0 && !query.trim() && activeCat === "all" && (
        <div
          className="rounded-2xl p-4"
          style={{
            background:
              "linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(236,72,153,0.05) 100%)",
            border: "1px solid rgba(168,85,247,0.25)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Star size={13} className="text-fuchsia-300" />
            <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-fuchsia-200">
              Recommended for {vertical}
            </span>
            <span className="text-[10px] text-white/45 tabular-nums">
              {recommendedItems.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {recommendedItems.slice(0, 9).map(item => {
              const selected = confirmedLower.has(item.name.toLowerCase());
              const wasDetected = detectedSet.has(item.name.toLowerCase());
              return (
                <ToolCard
                  key={`rec-${item.name}`}
                  item={item}
                  selected={selected}
                  detected={wasDetected}
                  popular
                  essential={ESSENTIAL_TOOLS.has(item.name)}
                  onClick={() =>
                    onToggleByName?.(item.name, selected ? "dismiss" : "confirm")
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Search + category tabs */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search providers, tools, SaaS…"
            className="w-full h-11 pl-9 pr-3 rounded-xl text-sm text-white placeholder:text-white/30"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          <CategoryPill
            label="All"
            active={activeCat === "all"}
            onClick={() => setActiveCat("all")}
            count={CATALOG.length}
          />
          {orderedCategories.map(c => {
            const count = CATALOG.filter(i => i.category === c.key).length;
            return (
              <CategoryPill
                key={c.key}
                label={c.label}
                active={activeCat === c.key}
                onClick={() => setActiveCat(c.key)}
                count={count}
              />
            );
          })}
        </div>
      </div>

      {/* Grid grouped by category */}
      {filtered.length === 0 ? (
        <div
          className="rounded-2xl p-6 text-center"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.14)",
          }}
        >
          <p className="text-sm text-white/65 mb-1">No tool matches "{query}".</p>
          <p className="text-[11px] text-white/40">Add it manually below.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(grouped.entries()).map(([catKey, items]) => {
            const cat = TOOL_CATEGORIES.find(c => c.key === catKey);
            const impact = CATEGORY_IMPACT[catKey] || "low";
            return (
              <div key={catKey}>
                <div className="flex items-baseline gap-2 mb-2 px-1">
                  <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/55">
                    {cat?.label || catKey}
                  </p>
                  <ImpactBadge impact={impact} />
                  <p className="text-[10px] text-white/30 ml-auto truncate">{cat?.blurb}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {items.map(item => {
                    const selected = confirmedLower.has(item.name.toLowerCase());
                    const wasDetected = detectedSet.has(item.name.toLowerCase());
                    const isPopular = popularSet.has(item.name.toLowerCase());
                    const isEssential = ESSENTIAL_TOOLS.has(item.name);
                    return (
                      <ToolCard
                        key={item.name}
                        item={item}
                        selected={selected}
                        detected={wasDetected}
                        popular={isPopular}
                        essential={isEssential}
                        onClick={() =>
                          onToggleByName?.(item.name, selected ? "dismiss" : "confirm")
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add custom */}
      {onAddCustom && (
        <form
          onSubmit={handleAddCustom}
          className="rounded-2xl p-4"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Plus size={12} className="text-white/55" />
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/55">
              Don't see your tool?
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="e.g. Cookie-bot, MyBank, Customer.io"
              className="flex-1 h-10 px-3 rounded-lg text-sm text-white placeholder:text-white/30"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            />
            <select
              value={customCat}
              onChange={e => setCustomCat(e.target.value)}
              className="h-10 px-3 rounded-lg text-sm text-white"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {TOOL_CATEGORIES.map(c => (
                <option key={c.key} value={c.key} style={{ background: "#0a0a0a" }}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!customName.trim()}
              className="h-10 px-4 rounded-lg text-xs font-bold bg-white text-black disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ───────────────── helpers ───────────────── */

function ToolCard({ item, selected, detected, popular, essential, onClick }) {
  // Visual states, ordered by intensity:
  //   selected           → solid white border, strongest signal
  //   detected (auto)    → cyan-tinted border, "we found this"
  //   popular (vertical) → subtle fuchsia tint, "common in your sector"
  //   default            → neutral
  const cardStyle = selected
    ? {
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.12) inset",
      }
    : detected
    ? {
        background: "rgba(34,211,238,0.05)",
        border: "1px solid rgba(34,211,238,0.42)",
        boxShadow: "0 0 14px rgba(34,211,238,0.10)",
      }
    : popular
    ? {
        background: "rgba(168,85,247,0.05)",
        border: "1px solid rgba(168,85,247,0.32)",
      }
    : {
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.10)",
      };

  // Sub-label priority: Detected > Popular > Essential (only one is shown).
  let sublabel = null;
  if (detected && !selected) {
    sublabel = (
      <p className="text-[10px] text-cyan-300 leading-tight mt-0.5 flex items-center gap-1">
        <Sparkles size={9} aria-hidden="true" /> Detected
      </p>
    );
  } else if (popular && !selected) {
    sublabel = (
      <p className="text-[10px] text-fuchsia-300 leading-tight mt-0.5 flex items-center gap-1">
        <Star size={9} aria-hidden="true" /> Popular
      </p>
    );
  } else if (essential && !selected) {
    sublabel = (
      <p className="text-[10px] text-amber-300/80 leading-tight mt-0.5 flex items-center gap-1">
        <Zap size={9} aria-hidden="true" /> Essential
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="relative flex items-center gap-2.5 px-3 py-3 rounded-xl text-left min-h-[60px] transition-all"
      style={cardStyle}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black"
        style={{
          background: item.color,
          color: pickFg(item.color),
        }}
        aria-hidden="true"
      >
        {item.monogram}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white truncate leading-tight">{item.name}</p>
        {sublabel}
      </div>
      {selected && (
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "#22d3ee", color: "#000" }}
          aria-hidden="true"
        >
          <Check size={12} strokeWidth={3} />
        </div>
      )}
    </button>
  );
}

function ImpactBadge({ impact }) {
  // Qualitative badge — drives founder attention without making numeric
  // promises. Tied to CATEGORY_IMPACT, not to scoreEngine output.
  const map = {
    high:   { label: "High impact",   color: "#fb923c", bg: "rgba(251,146,60,0.10)",  border: "rgba(251,146,60,0.35)" },
    medium: { label: "Medium impact", color: "#facc15", bg: "rgba(250,204,21,0.08)",  border: "rgba(250,204,21,0.28)" },
    low:    { label: "Visibility",    color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.24)" },
  };
  const v = map[impact] || map.low;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.14em]"
      style={{ background: v.bg, border: `1px solid ${v.border}`, color: v.color }}
    >
      {impact === "high" && <Flame size={8} aria-hidden="true" />}
      {v.label}
    </span>
  );
}

function ToolChip({ name, selected, onClick }) {
  const meta = getCatalogMeta(name);
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors"
      style={
        selected
          ? { background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.35)", color: "#a5f3fc" }
          : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)" }
      }
    >
      {meta && (
        <span
          className="w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-black shrink-0"
          style={{ background: meta.color, color: pickFg(meta.color) }}
          aria-hidden="true"
        >
          {meta.monogram}
        </span>
      )}
      {name}
      {selected && <Check size={10} strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}

function CategoryPill({ label, active, onClick, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[11px] font-semibold shrink-0 transition-colors"
      style={
        active
          ? { background: "#ffffff", color: "#000", border: "1px solid #ffffff" }
          : { background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }
      }
    >
      {label}
      <span className={`text-[9px] tabular-nums ${active ? "text-black/55" : "text-white/40"}`}>
        {count}
      </span>
    </button>
  );
}

/**
 * Decide if a hex background needs black or white foreground for legibility.
 * Quick luminance check — no need for a perfect WCAG calc on a 9×9 tile.
 */
function pickFg(hex) {
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#0a0a0a" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}