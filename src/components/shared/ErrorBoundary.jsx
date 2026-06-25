import React from "react";

/**
 * CAMBRA ErrorBoundary — catches render-time errors so one page crash does not
 * take down the whole app. Used at the App root and around major routes.
 *
 * Fallback is intentionally HIGH-VISIBILITY (fixed position, high z-index,
 * white text on dark) so a swallowed crash can never produce a silent black
 * screen — the user always sees the error + a Reload action.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("🔴 CAMBRA ErrorBoundary CAUGHT:", error, info?.componentStack);
    this.setState({ errorInfo: info });
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* no-op */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const err = this.state.error;
    const message = String(err?.message || err || "Unknown error");
    const stack = (err?.stack || "").split("\n").slice(0, 8).join("\n");

    return (
      <div
        role="alert"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#0a0a0a",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <div
            aria-hidden="true"
            style={{
              margin: "0 auto 20px",
              width: 48,
              height: 48,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              fontSize: 22,
              fontWeight: 800,
            }}
          >!</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em" }}>
            Something broke on this page
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 16 }}>
            We hit an unexpected error. The details below help us fix it.
          </p>
          <pre
            style={{
              fontSize: 11,
              fontFamily: "ui-monospace, SF Mono, monospace",
              color: "#fca5a5",
              textAlign: "left",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflow: "auto",
              maxHeight: 260,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            {message}
            {stack ? `\n\n${stack}` : ""}
          </pre>
          <button
            onClick={this.handleReload}
            style={{
              height: 40,
              padding: "0 24px",
              borderRadius: 999,
              background: "#ffffff",
              color: "#000000",
              fontWeight: 700,
              fontSize: 13,
              border: "none",
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;