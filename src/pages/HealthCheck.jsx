/* Standalone health check — no shell, no auth, no data fetches.
   Used to verify bundle freshness after deploys. */
const BUILD_STAMP = "20260626-force";

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
        bundle is fresh · build: {BUILD_STAMP}
      </p>
    </div>
  );
}