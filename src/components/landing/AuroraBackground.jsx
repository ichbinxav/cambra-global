export default function AuroraBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        background: "conic-gradient(from 120deg at 50% 50%, rgba(59,130,246,0.15) 0%, rgba(44,167,193,0.10) 25%, rgba(99,91,255,0.08) 50%, rgba(59,130,246,0.15) 100%)",
        filter: "blur(80px)",
      }}
    />
  );
}