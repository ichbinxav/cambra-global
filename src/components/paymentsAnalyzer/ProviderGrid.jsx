// ProviderGrid — renders every PSP option as a ProviderCard in a responsive
// grid. Density is a page-level decision (parent can override className) but
// we set a sensible default that reads well from 375px up to 1440px+.
//
// Contract unchanged: same enum, same order, same payload.

import ProviderCard from "@/components/paymentsAnalyzer/ProviderCard";

export default function ProviderGrid({ options, value, onChange, className }) {
  return (
    <div
      className={
        className ||
        // 2 cols mobile / 3 cols tablet / 4 cols desktop
        "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2"
      }
    >
      {options.map((opt) => (
        <ProviderCard
          key={opt.slug}
          option={opt}
          value={value}
          onChange={onChange}
        />
      ))}
    </div>
  );
}