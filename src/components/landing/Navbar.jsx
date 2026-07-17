import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ArrowRight, Tag, HelpCircle, Mail, Shield, Sparkles, Activity, MessageSquareQuote } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import MobileNavMenu from "@/components/landing/MobileNavMenu";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n.jsx";

// CAMBRA public navigation — SAME set of links in every public page, whether
// the visitor is signed in or not. Member navigation (Dashboard, Reports,
// Network, Account, Insights, Connect tools, …) lives inside DashboardLayout,
// not here — so the top navbar stays consistent across Landing, Pricing,
// HowItWorks, Contact, etc.
// Every href below MUST resolve to a PUBLIC route in src/App.jsx (routes that
// don't sit under a <ProtectedRoute>). Protected routes (Insights, ConnectTools,
// Dashboard, …) belong in the member sidebar, not the public navbar — putting
// them here breaks the flow for signed-out visitors (they get bounced to
// /LoginGate on click).
const NAV_PUBLIC = [
  { label: "Analyzer",     href: "/Analyzer",     icon: Activity,           desc: "Scan your infrastructure" },
  { label: "How it works", href: "/HowItWorks",   icon: Sparkles,           desc: "The 4-step audit" },
  { label: "Testimonials", href: "/Testimonials", icon: MessageSquareQuote, desc: "Real brand results" },
  { label: "Pricing model", href: "/Pricing",     icon: Tag },
  { label: "Help",         href: "/Help",         icon: HelpCircle },
  { label: "Contact",      href: "/Contact",      icon: Mail },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const NAV = NAV_PUBLIC;
  const isAdmin = user?.role === "admin";

  // Translation map for visible navbar labels
  const labelKey = {
    Analyzer: "nav_analyzer",
    "How it works": "nav_how",
    "Pricing model": "nav_pricing",
    Dashboard: "nav_dashboard",
    Reports: "nav_reports",
    Account: "nav_settings",
  };
  const trLabel = (lbl) => (labelKey[lbl] ? t(labelKey[lbl]) : lbl);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        /* DA v1.1 Chunk 1d — paper-first: navbar claro translúcido. */
        background: "rgba(250,250,252,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--linea)",
      }}
    >
      <div className="max-w-7xl mx-auto px-5 lg:px-8 h-14 flex items-center justify-between">

        {/* Logo — always a way out. Signed in → Dashboard, else → home. */}
        <Link
          to={isAuthenticated ? "/Dashboard" : "/"}
          className="flex-shrink-0 inline-flex items-center gap-2"
          style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: 18, color: "var(--ink)" }}
          aria-label={isAuthenticated ? "CAMBRA dashboard" : "CAMBRA home"}
        >
          CAMBRA
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map(item => {
            const active = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.label}
                to={item.href}
                className={`relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  active
                    ? "text-[color:var(--ink)]"
                    : "text-[color:var(--gris-1)] hover:text-[color:var(--ink)]"
                }`}
              >
                {trLabel(item.label)}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-[14px] h-[2px] rounded-full" style={{ background: "var(--ink)" }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTAs — dark variant to match landing */}
        <div className="hidden md:flex items-center gap-2">
          <LanguageSwitcher variant="light" className="mr-1" />
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <Link to="/admin" className="btn-base btn-secondary btn-sm">
                  <Shield size={12} /> Admin
                </Link>
              )}
              <Link to="/Dashboard" className="btn-base btn-primary btn-sm">
                {t("nav_dashboard")}
              </Link>
            </>
          ) : (
            <>
              <a
                href="/auth/start"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-base btn-ghost btn-sm"
              >
                Sign in
              </a>
              <Link to="/Analyzer" className="btn-base btn-primary btn-sm">
                {t("nav_get_started")} <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-[color:var(--gris-1)] hover:text-[color:var(--ink)] transition-colors -mr-2"
          onClick={() => setOpen(v => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu — premium fintech dropdown */}
      <MobileNavMenu open={open} isAuthenticated={isAuthenticated} isAdmin={isAdmin} />
    </header>
  );
}