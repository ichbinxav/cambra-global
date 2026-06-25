import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ArrowRight, Plug, BookOpen, Tag, HelpCircle, Mail, LayoutDashboard, BarChart3, Users, Settings, Shield, Sparkles, Activity } from "lucide-react";
import BrandLogoWordmark from "@/components/shared/BrandLogoWordmark";
import { useAuth } from "@/lib/AuthContext";
import MobileNavMenu from "@/components/landing/MobileNavMenu";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n.jsx";

// CAMBRA OS navigation — grouped by intent
const NAV_PUBLIC = [
  { label: "Analyzer", href: "/Analyzer", icon: Activity, desc: "Scan your infrastructure" },
  { label: "How it works", href: "/HowItWorks", icon: Sparkles, desc: "The 4-step audit" },
  { label: "Connect your tools", href: "/ConnectTools", icon: Plug, desc: "Connect or upload data" },
  { label: "Insights", href: "/Insights", icon: BookOpen, desc: "Margin intelligence" },
  { label: "Pricing", href: "/Pricing", icon: Tag },
  { label: "Help", href: "/Help", icon: HelpCircle },
  { label: "Contact", href: "/Contact", icon: Mail },
];

const NAV_MEMBER = [
  { label: "Dashboard", href: "/Dashboard", icon: LayoutDashboard, desc: "Command center" },
  { label: "Reports", href: "/Reports", icon: BarChart3, desc: "Savings intelligence" },
  { label: "Analyzer", href: "/Analyzer", icon: Activity, desc: "Run new scan" },
  { label: "Network", href: "/Network", icon: Users, desc: "Operator directory" },
  { label: "Insights", href: "/Insights", icon: BookOpen },
  { label: "Account", href: "/Account", icon: Settings },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const NAV = isAuthenticated ? NAV_MEMBER : NAV_PUBLIC;
  const isAdmin = user?.role === "admin";

  // Translation map for visible navbar labels
  const labelKey = {
    Analyzer: "nav_analyzer",
    "How it works": "nav_how",
    "Connect your tools": "nav_connect",
    Pricing: "nav_pricing",
    Dashboard: "nav_dashboard",
    Reports: "nav_reports",
    Account: "nav_settings",
  };
  const trLabel = (lbl) => (labelKey[lbl] ? t(labelKey[lbl]) : lbl);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-border/60">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex-shrink-0 inline-flex items-center gap-2" aria-label="CAMBRA home">
          <BrandLogoWordmark className="h-5" />
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
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {trLabel(item.label)}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-[14px] h-[2px] bg-foreground rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTAs — unified btn-* token system */}
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
          className="md:hidden p-2 text-foreground transition-colors -mr-2"
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