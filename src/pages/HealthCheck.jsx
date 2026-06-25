export default function HealthCheck() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "lime",
        color: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui",
        fontSize: 24,
        fontWeight: 900,
      }}
    >
      ✅ HealthCheck OK — bundle is fresh
    </div>
  );
}