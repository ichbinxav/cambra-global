// ProviderGrid — replaces the native <select> with tap-friendly cards.
//
// PSP enum is the SINGLE source-of-truth mirror of the backend's
// ALLOWED_PROVIDER_SLUGS. Parent component owns the enum + label list and
// passes it in — this component is dumb about which providers exist. Same
// order as the backend (the ordering IS the product signal: verified rows
// first).

import { Check } from "lucide-react";

export default function ProviderGrid({ options, value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const selected = value === opt.slug;
        return (
          <button
            key={opt.slug}
            type="button"
            onClick={() => onChange(opt.slug)}
            className="relative rounded-xl px-3 py-3 text-left transition-all duration-150 min-h-[52px] focus:outline-none"
            style={
              selected
                ? {
                    background: "rgba(34,211,238,0.10)",
                    border: "1px solid rgba(34,211,238,0.55)",
                    boxShadow: "0 0 0 3px rgba(34,211,238,0.10), 0 6px 20px -8px rgba(34,211,238,0.45)",
                  }
                : {
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }
            }
            aria-pressed={selected}
          >
            <span
              className={`block text-[13px] font-semibold leading-tight ${selected ? "text-white" : "text-white/80"}`}
            >
              {opt.label}
            </span>
            {selected && (
              <span
                className="absolute top-2 right-2 inline-flex items-center justify-center h-4 w-4 rounded-full"
                style={{ background: "rgba(34,211,238,0.9)" }}
                aria-hidden="true"
              >
                <Check size={10} className="text-neutral-900" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}