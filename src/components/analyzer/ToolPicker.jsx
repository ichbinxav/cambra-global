import React, { useMemo, useState } from "react";
import { Check, Search, Sparkles, Plus } from "lucide-react";
import { CATALOG, TOOL_CATEGORIES, getCatalogMeta } from "@/lib/analyzerToolCatalog";

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
}) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [customName, setCustomName] = useState("");
  const [customCat, setCustomCat] = useState("saas");

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

  // Group filtered items by category for nicer rendering
  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category).push(item);
    }
    return map;
  }, [filtered]);

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
          {TOOL_CATEGORIES.map(c => {
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
            return (
              <div key={catKey}>
                <div className="flex items-baseline gap-2 mb-2 px-1">
                  <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/55">
                    {cat?.label || catKey}
                  </p>
                  <p className="text-[10px] text-white/30">{cat?.blurb}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {items.map(item => {
                    const selected = confirmedLower.has(item.name.toLowerCase());
                    const wasDetected = detectedSet.has(item.name.toLowerCase());
                    return (
                      <ToolCard
                        key={item.name}
                        item={item}
                        selected={selected}
                        hint={wasDetected ? "Detected" : null}
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

function ToolCard({ item, selected, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="relative flex items-center gap-2.5 px-3 py-3 rounded-xl text-left min-h-[60px] transition-all"
      style={
        selected
          ? {
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.12) inset",
            }
          : {
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.10)",
            }
      }
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
        {hint && (
          <p className="text-[10px] text-cyan-300 leading-tight mt-0.5">{hint}</p>
        )}
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