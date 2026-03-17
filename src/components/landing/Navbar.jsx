import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const NAV_PUBLIC = [
  { label: "How it works", href: "#how" },
  { label: "Analyzer", href: "/Analyzer" },
  { label: "Join THE NoDE", href: "/Onboarding" },
];

const NAV_MEMBER = [
  { label: "How it works", href: "#how" },
  { label: "Analyzer", href: "/Analyzer" },
  { label: "Deals", href: "/Deals" },
  { label: "Insights", href: "/Insights" },
  { label: "Network", href: "/Network" },
  { label: "Join THE NoDE", href: "/Onboarding" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${scrolled ? "bg-background/95 backdrop-blur-2xl border-b border-border/40 shadow-sm" : "bg-transparent"}`}>
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="text-sm font-black tracking-tight flex-shrink-0">
          THE NoDE
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV.map(item => (
            item.href.startsWith("/") ? (
              <Link key={item.label} to={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {item.label}
              </Link>
            ) : (
              <a key={item.label} href={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {item.label}
              </a>
            )
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-2">
          {isAuthenticated ? (
            <Link to="/Dashboard">
              <Button size="sm" className="h-8 rounded-full px-5 text-sm font-semibold shadow-sm">
                Dashboard →
              </Button>
            </Link>
          ) : (
            <>
              <button
                onClick={() => base44.auth.redirectToLogin(window.location.href)}
                className="h-8 px-5 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors rounded-full shadow-sm"
              >
                Sign in
              </button>
              <Link to="/Analyzer">
                <Button size="sm" className="h-8 rounded-full px-5 text-sm font-semibold shadow-sm" variant="outline">
                  Run free Analyzer
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setOpen(v => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border/40 bg-background/98 backdrop-blur-2xl px-5 py-4 space-y-1">
          {NAV.map(item => (
            item.href.startsWith("/") ? (
              <Link key={item.label} to={item.href} onClick={() => setOpen(false)} className="block py-3 text-sm text-muted-foreground border-b border-border/30 last:border-0">
                {item.label}
              </Link>
            ) : (
              <a key={item.label} href={item.href} onClick={() => setOpen(false)} className="block py-3 text-sm text-muted-foreground border-b border-border/30 last:border-0">
                {item.label}
              </a>
            )
          ))}
          <div className="pt-4 flex flex-col gap-2">
            <Link to="/Analyzer" onClick={() => setOpen(false)}>
              <Button className="w-full h-12 rounded-full text-sm font-bold">Run the Analyzer</Button>
            </Link>
            {isAuthenticated ? (
              <Link to="/Dashboard" onClick={() => setOpen(false)}>
                <Button variant="outline" className="w-full h-12 rounded-full text-sm">Dashboard</Button>
              </Link>
            ) : (
              <>
                <button
                  onClick={() => { setOpen(false); base44.auth.redirectToLogin(window.location.href); }}
                  className="w-full h-12 rounded-full text-sm border border-border/70 hover:bg-secondary transition-colors font-medium"
                >
                  Sign in with Google / Apple
                </button>
                <Link to="/Onboarding" onClick={() => setOpen(false)}>
                  <Button variant="outline" className="w-full h-12 rounded-full text-sm">Join THE NoDE</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}