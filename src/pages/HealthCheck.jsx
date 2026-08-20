/* Standalone client health check — no shell, auth, or backend data fetches.
   The build injects a source revision when available and falls back truthfully. */
const BUILD_STAMP = import.meta.env.VITE_CAMBRA_BUILD_STAMP || "unidentified";

export default function HealthCheck() {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#bef264", // lime
        color: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 900, letterSpacing: "-0.03em" }}>
        ✅ HealthCheck OK
      </h1>
      <p style={{ marginTop: 12, fontSize: 14, fontWeight: 600, opacity: 0.75 }}>
        client bundle loaded · build: {BUILD_STAMP}
      </p>
    </div>
  );
}