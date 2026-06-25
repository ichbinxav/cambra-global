import React from "react";

/**
 * Renders a list of {title, content} sections in the dark editorial style.
 * Reused by Privacy, Terms.
 */
export default function LegalSections({ sections }) {
  return (
    <div className="space-y-8" style={{ color: "rgba(255,255,255,0.65)" }}>
      {sections.map((section, i) => (
        <div
          key={i}
          className="pb-8"
          style={{ borderBottom: i === sections.length - 1 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
        >
          <h2 className="text-[16px] font-bold text-white mb-3">{section.title}</h2>
          <p className="text-[14px] leading-relaxed">{section.content}</p>
        </div>
      ))}
    </div>
  );
}