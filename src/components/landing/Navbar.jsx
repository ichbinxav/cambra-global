import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, ArrowRight, Activity, Plug, BookOpen, Tag, HelpCircle, Mail, LayoutDashboard, BarChart3, Users, Settings, Shield, Sparkles } from "lucide-react";
import BrandLogoWordmark from "@/components/shared/BrandLogoWordmark";
import { useAuth } from "@/lib/AuthContext";

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
  const NAV = isAuthenticated ? NAV_MEMBER : NAV_PUBLIC;
  const isAdmin = user?.role === "admin";

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
                {item.label}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-[14px] h-[2px] bg-foreground rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-2">
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs font-semibold gap-1.5 border-border">
                    <Shield size={12} /> Admin
                  </Button>
                </Link>
              )}
              <Link to="/Dashboard">
                <Button size="sm" className="h-8 rounded-full px-5 text-sm font-semibold shadow-sm bg-foreground text-background hover:bg-foreground/90">
                  Dashboard
                </Button>
              </Link>
            </>
          ) : (
            <>
              <a
                href="/auth/start"
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-4 text-sm font-medium text-foreground hover:text-foreground/70 transition-colors rounded-full inline-flex items-center justify-center"
              >
                Sign in
              </a>
              <Link to="/Analyzer">
                <Button size="sm" className="h-8 rounded-full px-5 text-sm font-bold shadow-sm bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-center gap-2">
                  Run free audit <ArrowRight className="h-3 w-3" />
                </Button>
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

      {/* Mobile menu — CAMBRA OS style */}
      {open && (
        <div className="md:hidden absolute inset-x-0 top-14 bg-white border-b border-border/60 shadow-lg max-h-[calc(100vh-3.5rem)] overflow-y-auto">
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground/70 mb-3">
              {isAuthenticated ? "Workspace" : "Platform"}
            </p>
            <div className="space-y-0.5">
              {NAV.map(item => {
                const active = location.pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                      active ? "bg-secondary" : "hover:bg-secondary/60"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      {item.desc && <p className="text-[11px] text-muted-foreground">{item.desc}</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {isAuthenticated && isAdmin && (
            <>
              <div className="h-px bg-border/60" />
              <div className="px-5 py-4">
                <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground/70 mb-3">Operator</p>
                <Link to="/admin" className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary/60 transition-colors">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-foreground text-background">
                    <Shield size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Admin Console</p>
                    <p className="text-[11px] text-muted-foreground">Infrastructure command center</p>
                  </div>
                </Link>
              </div>
            </>
          )}

          <div className="h-px bg-border/60" />
          <div className="px-5 py-4 space-y-2">
            {isAuthenticated ? (
              <Link to="/Analyzer" className="block">
                <Button className="w-full h-11 rounded-full text-sm font-bold bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-center gap-2">
                  Run new audit <ArrowRight size={14} />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/Analyzer" className="block">
                  <Button className="w-full h-11 rounded-full text-sm font-bold bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-center gap-2">
                    Run free audit <ArrowRight size={14} />
                  </Button>
                </Link>
                <a
                  href="/auth/start"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-full text-sm font-medium border border-border hover:bg-secondary/60 transition-colors flex items-center justify-center"
                >
                  Sign in
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}