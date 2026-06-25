import React, { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, Globe, Calculator } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * WhatHappensNext — expandable hint shown below the Step 1 CTA.
 * Reassures the user about what runs after they continue.
 */
export default function WhatHappensNext() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const items = [
    { icon: Globe,      title: t("wh_step1_title"), desc: t("wh_step1_desc") },
    { icon: Calculator, title: t("wh_step2_title"), desc: t("wh_step2_desc") },
    { icon: Sparkles,   title: t("wh_step3_title"), desc: t("wh_step3_desc") },
  ];

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl min-h-[44px] text-left transition-colors hover:bg-white/5"
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.025)",
        }}
      >
        <span className="text-[12px] font-bold text-white/75">
          {t("what_happens_next")}
        </span>
        {open ? (
          <ChevronUp size={14} className="text-white/55" />
        ) : (
          <ChevronDown size={14} className="text-white/55" />
        )}
      </button>

      {open && (
        <div
          className="mt-2 p-4 rounded-xl space-y-3 animate-fade-up"
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {items.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  background: "rgba(34,211,238,0.08)",
                  border: "1px solid rgba(34,211,238,0.20)",
                }}
              >
                <Icon size={12} className="text-cyan-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-white">{title}</p>
                <p className="text-[11px] text-white/55 leading-snug mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}