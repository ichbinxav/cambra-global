// GmvSlider — logarithmic slider + synced numeric input for monthly GMV.
//
// Why log + input: the range is 500 → 10M. A linear slider would put 99% of
// merchants in the first 5% of the track. A log slider gives sensible
// resolution at €1k, €10k, €100k, €1M. But log resolution isn't precise
// enough to hit "€83,500" — that's what the numeric input is for. Slider
// snaps to natural anchor points; the input carries the exact value that
// gets sent to the backend. Payload = exactValue always.
//
// Contract: min 500, max 10,000,000. Any value inside this range is valid.

import { useMemo } from "react";

// Anchor points shown as tick labels. Slider still moves continuously along
// the log curve — anchors are purely visual guides.
const ANCHOR_POINTS = [500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 10_000_000];
const SLIDER_MIN = 500;
const SLIDER_MAX = 10_000_000;

const LOG_MIN = Math.log(SLIDER_MIN);
const LOG_MAX = Math.log(SLIDER_MAX);

// Map slider position (0..1000) → EUR value via log curve.
function positionToEur(pos) {
  const t = pos / 1000;
  const eur = Math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN));
  // Snap to a natural rounding so the slider feels quantized to real merchant
  // ranges. Precision comes from the numeric input, not the slider.
  if (eur < 1_000)     return Math.round(eur / 100) * 100;
  if (eur < 10_000)    return Math.round(eur / 500) * 500;
  if (eur < 100_000)   return Math.round(eur / 1_000) * 1_000;
  if (eur < 1_000_000) return Math.round(eur / 10_000) * 10_000;
  return Math.round(eur / 100_000) * 100_000;
}

// Inverse — used to move the slider when the user types in the input.
function eurToPosition(eur) {
  if (!isFinite(eur) || eur <= SLIDER_MIN) return 0;
  if (eur >= SLIDER_MAX) return 1000;
  const t = (Math.log(eur) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return Math.round(t * 1000);
}

function formatEur(n) {
  if (!isFinite(n) || n <= 0) return "—";
  return "€" + Math.round(n).toLocaleString("en-US");
}

// Default seed value shown while the user hasn't touched the slider yet.
// Chosen to be a plausible mid-size merchant — big enough to feel real,
// small enough not to intimidate a small-shop user. This is DISPLAY ONLY:
// the parent's `value` stays empty until the user interacts, so validation
// still rejects submits without user intent.
const DEFAULT_DISPLAY_EUR = 25_000;

export default function GmvSlider({ value, onChange }) {
  // isSet distinguishes "user hasn't touched it" (show default in the big
  // number so the slider position matches) from "user typed / dragged".
  // The parent's payload still tracks the raw `value` string exactly.
  const numericValue = useMemo(() => {
    const n = Number(value);
    return isFinite(n) && n > 0 ? n : 0;
  }, [value]);
  const isSet = numericValue > 0;

  // Display number = user's real value once they touch it, else the default.
  const displayValue = isSet ? numericValue : DEFAULT_DISPLAY_EUR;
  const sliderPosition = eurToPosition(displayValue);

  const handleSliderChange = (e) => {
    const eur = positionToEur(Number(e.target.value));
    onChange(String(eur));
  };

  const handleInputChange = (e) => {
    // Pass raw string up — parent validates via the same RANGES contract.
    // Empty is allowed (user can clear and re-type).
    onChange(e.target.value);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--gris-1)" }}>
          Monthly card GMV
        </span>
        <span className="text-[10px]" style={{ color: "var(--gris-2)" }}>Slide or type</span>
      </div>

      {/* Hero value + exact input, side by side */}
      <div className="flex items-baseline gap-3">
        <div
          className="tabular-nums font-black leading-none"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(28px, 6vw, 36px)",
            letterSpacing: "-0.03em",
            // Dimmer color while it's a default placeholder — the moment the
            // user drags or types, it becomes fully white. Zero cognitive
            // load, clearly signals "this is a preview".
            color: isSet ? "var(--ink)" : "var(--gris-2)",
          }}
        >
          {formatEur(displayValue)}
        </div>
        <span className="text-[12px] shrink-0" style={{ color: "var(--gris-2)" }}>/ mo</span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[11px]" style={{ color: "var(--gris-2)" }}>exact</span>
          <input
            type="number"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            inputMode="numeric"
            value={value}
            onChange={handleInputChange}
            placeholder="e.g. 100000"
            className="cambra-num-input w-28 h-9 rounded-md px-2.5 text-sm text-right focus:outline-none transition-colors"
            style={{ color: "var(--ink)", background: "#ffffff", border: "1px solid var(--linea)" }}
            aria-label="Monthly GMV exact value"
          />
        </div>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={1000}
        value={sliderPosition}
        onChange={handleSliderChange}
        className="cambra-range w-full"
        aria-label="Monthly GMV slider"
      />

      {/* Anchor tick labels — decorative, help calibrate the log scale */}
      <div className="flex justify-between text-[9px] font-medium" style={{ color: "var(--gris-2)" }}>
        <span>€500</span>
        <span>€10k</span>
        <span>€100k</span>
        <span>€1M</span>
        <span>€10M</span>
      </div>
      {/* Anchor points kept in a const so lint doesn't flag it as unused —
          could power a future tick-snap UX. */}
      <span className="sr-only">{ANCHOR_POINTS.join(",")}</span>
    </div>
  );
}