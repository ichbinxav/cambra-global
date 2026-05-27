import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import BrandLogoWordmark from "@/components/shared/BrandLogoWordmark";
import { useAuth } from "@/lib/AuthContext";

const NAV_PUBLIC = [
  { label: "Analyzer", href: "/Analyzer" },
  { label: "Onboarding", href: "/Onboarding" },
  { label: "Insights", href: "/Insights" },
];

const NAV_MEMBER = [
  { label: "Dashboard", href: "/Dashboard" },
  { label: "Analyzer", href: "/Analyzer" },
  { label: "Onboarding", href: "/Onboarding" },
  { label: "Deals", href: "/Deals" },
  { label: "Network", href: "/Network" },
  { label: "Insights", href: "/Insights" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const NAV = isAuthenticated ? NAV_MEMBER : NAV_PUBLIC;

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${scrolled ? "bg-background/95 backdrop-blur-2xl border-b border-border/40 shadow-sm" : "bg-background/80 backdrop-blur-md border-b border-border/20"}`}>
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex-shrink-0 inline-flex items-center gap-2" aria-label="CAMBRA home">
          <BrandLogoWordmark className="h-5" />
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
              <a
                href="/auth/start"
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-5 text-sm font-bold text-white bg-saas-gradient hover:opacity-90 transition-opacity rounded-full shadow-sm inline-flex items-center justify-center"
              >
                Sign in
              </a>
              <Link to="/Analyzer">
                <Button size="sm" className="h-8 rounded-full px-5 text-sm font-bold shadow-sm bg-foreground text-background hover:opacity-90">
                  Run audit
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
        <div className="md:hidden border-t border-border/40 bg-background/98 backdrop-blur-2xl px-5 py-4 space-y-1 overflow-y-auto max-h-[80vh]">
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
            {isAuthenticated ? (
              <>
                <Link to="/Dashboard" onClick={() => setOpen(false)}>
                  <Button className="w-full h-12 rounded-full text-sm font-bold">Open dashboard</Button>
                </Link>
                <Link to="/Analyzer" onClick={() => setOpen(false)}>
                  <Button variant="outline" className="w-full h-12 rounded-full text-sm">Run audit</Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/Analyzer" onClick={() => setOpen(false)}>
                  <Button className="w-full h-12 rounded-full text-sm font-bold">Run audit</Button>
                </Link>
                <a
                  href="/auth/start"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="w-full h-12 rounded-full text-sm border border-border/70 hover:bg-secondary transition-colors font-medium flex items-center justify-center"
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