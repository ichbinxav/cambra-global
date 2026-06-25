import React from "react";

/**
 * CAMBRA ErrorBoundary — catches render-time errors so one page crash does not
 * take down the whole app. Used at the App root and around major routes.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("CAMBRA ErrorBoundary:", error, info?.componentStack);
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* no-op */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="min-h-[60vh] flex items-center justify-center px-6 py-12"
        style={{ background: "#0a0a0a", color: "#ffffff" }}
      >
        <div className="max-w-sm w-full text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-5 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <span style={{ fontSize: 22 }}>!</span>
          </div>
          <h1 className="text-xl font-black tracking-[-0.02em] mb-2">Something went wrong</h1>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.65)" }}>
            We hit an unexpected error. This has been logged. Refresh to continue.
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center justify-center h-10 px-6 rounded-full bg-white text-black text-sm font-bold hover:opacity-90"
          >
            Refresh page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;