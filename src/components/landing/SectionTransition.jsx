/**
 * SectionTransition — subtle gradient divider used between landing sections
 * to create smoother visual flow without breaking ambient backdrop.
 */
export default function SectionTransition({ variant = "default" }) {
  if (variant === "strong") {
    return (
      <div className="relative h-px w-full overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(31,78,216,0.18) 30%, rgba(44,167,193,0.22) 50%, rgba(31,78,216,0.18) 70%, transparent 100%)",
          }}
        />
      </div>
    );
  }
  return (
    <div className="relative h-px w-full overflow-hidden pointer-events-none" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, hsl(var(--border) / 0.6) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}