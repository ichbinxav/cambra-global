/**
 * RouteProbe — TEMPORARY DEBUG ONLY.
 *
 * High-visibility fixed banner that proves a component reached render and
 * shows which branch of its render tree is active. Sits at the top-right
 * with z-index 2147483647 (max int) so nothing can cover it, on a saturated
 * red background that no theme token can accidentally hide.
 *
 * Usage:
 *   <RouteProbe label="Analyzer" state={{ loading, needsAuth, hasResult: !!result }} />
 *
 * Remove all <RouteProbe /> usages once the black-screen bug is fixed.
 */
export default function RouteProbe({ label, state = {} }) {
  return (
    <div
      data-cambra-probe={label}
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 2147483647,
        background: "#ff0033",
        color: "#ffffff",
        padding: "8px 12px",
        borderRadius: 8,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.4,
        fontWeight: 700,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        pointerEvents: "none",
        maxWidth: "70vw",
        whiteSpace: "pre",
      }}
    >
      ROUTE: {label}
      {Object.entries(state).map(([k, v]) => (
        <div key={k} style={{ opacity: 0.9 }}>
          {k}: {String(v)}
        </div>
      ))}
    </div>
  );
}