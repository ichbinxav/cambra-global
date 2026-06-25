import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";

/**
 * AuthenticatedShell — minimal, bulletproof chrome for the 4 problem routes
 * (/Analyzer, /Dashboard, /Results, /UnlockSavings).
 *
 * Rules:
 *  - Plain white background, dark text, normal document flow.
 *  - No framer-motion, no backdrop-filter, no mask-image, no fixed/absolute
 *    decorative layers, no opacity:0 base, no IntersectionObserver gating.
 *  - Everything renders visible immediately on Safari/iOS/Chrome.
 *
 * Visual polish can be reintroduced later — only AFTER visibility is stable.
 */
const NAV = [
  { path: "/Dashboard",     label: "Dashboard" },
  { path: "/Analyzer",      label: "Analyzer" },
  { path: "/Results",       label: "Results" },
  { path: "/UnlockSavings", label: "Recover" },
  { path: "/ConnectTools",  label: "Connect" },
  { path: "/Account",       label: "Account" },
];

export default function AuthenticatedShell({ children }) {
  const location = useLocation();
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#ffffff",
        color: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header style={{ borderBottom: "1px solid #e5e5e5", background: "#ffffff" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 20px",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/Dashboard"
            style={{
              fontWeight: 900,
              letterSpacing: "-0.02em",
              fontSize: 18,
              color: "#0a0a0a",
              textDecoration: "none",
            }}
          >
            CAMBRA
          </Link>
          <nav style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            {NAV.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                    textDecoration: "none",
                    fontWeight: active ? 700 : 500,
                    color: active ? "#0a0a0a" : "#666666",
                    background: active ? "#f4f4f5" : "transparent",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => base44.auth.logout("/Landing")}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 14,
                border: "1px solid #e5e5e5",
                background: "#ffffff",
                color: "#666666",
                cursor: "pointer",
                marginLeft: 4,
              }}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          minHeight: "50vh",
          maxWidth: 1200,
          width: "100%",
          margin: "0 auto",
          padding: "24px 20px",
        }}
      >
        {children}
      </main>
    </div>
  );
}