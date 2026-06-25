import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, BarChart3, FileText, Settings, Menu, X, LogOut, ArrowUpRight, Home, ShieldCheck, Zap, FolderOpen, TrendingUp } from "lucide-react";
import BrandGlyph from "@/components/shared/BrandGlyph";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// MVP navigation — focused, minimal. Advanced API/OAuth/Webhook screens are admin-only.
const NAV_ITEMS = [
  { path: "/Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/Analyzer", label: "Analyzer", icon: BarChart3 },
  { path: "/Results", label: "Results", icon: FileText },
  { path: "/UnlockSavings", label: "Unlock Savings", icon: Zap },
  { path: "/RecoveryTracker", label: "Recovery Tracker", icon: TrendingUp },
  { path: "/Vault", label: "Documents", icon: FolderOpen },
  { path: "/Account", label: "Account", icon: Settings },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  // user role tracking handled by AuthContext

  const isAdmin = user?.role === "admin";
  const isProvider = user?.role === "provider";

  return (
    <div className="min-h-screen flex bg-background font-inter">
      {/* Desktop Sidebar — premium fintech */}
      <aside className="hidden lg:flex flex-col w-56 border-r border-border/40 shrink-0 bg-card/98 backdrop-blur-xl relative">
        {/* Subtle radial accent at top */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 right-0 h-40"
          style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(31,78,216,0.06), transparent 70%)" }}
        />

        <div className="relative px-5 h-14 flex items-center border-b border-border/40">
          <Link to="/" className="group flex items-center gap-2" aria-label="CAMBRA home">
            <BrandGlyph className="h-5 w-5" />
            <span className="text-[13px] font-black tracking-[-0.02em] text-foreground">CAMBRA</span>
            <ArrowUpRight size={10} className="text-muted-foreground/35 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </Link>
        </div>

        {/* Status pill — shared token */}
        <div className="relative px-3 pt-3 pb-2">
          <span className="pill-live">
            <span className="dot" />
            Network live
          </span>
        </div>

        <nav className="relative flex-1 p-3 pt-2 space-y-0.5">
          <p className="px-3 mb-1.5 text-[9px] font-bold tracking-[0.24em] uppercase text-muted-foreground/45">Workspace</p>
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <motion.div
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] transition-all ${
                    active
                      ? "bg-foreground text-background font-bold shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                  }`}
                  whileHover={active ? {} : { x: 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                >
                  <item.icon size={14} strokeWidth={active ? 2.4 : 1.8} />
                  {item.label}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border/40 space-y-0.5">
          {isAdmin && (
            <Link to="/admin">
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors font-semibold">
                <ShieldCheck size={14} />
                Admin Panel
              </div>
            </Link>
          )}

          <Link to="/Landing">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors">
              <Home size={14} />
              Go to homepage
            </div>
          </Link>
          <button
            onClick={() => base44.auth.logout("/Landing")}
            className="flex items-center gap-2.5 px-3 py-2.5 w-full rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 h-14 border-b border-border/40 bg-background/95 backdrop-blur-2xl">
        <Link to="/" className="text-sm font-black tracking-tight gradient-text">CAMBRA</Link>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <div key="mobile-menu" className="lg:hidden">
            <motion.div
              className="fixed inset-0 z-30 bg-black/20"
              onClick={() => setSidebarOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              className="fixed inset-0 z-40 bg-background pt-14 overflow-y-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <nav className="p-4 space-y-0.5">
                {NAV_ITEMS.map(item => {
                  const active = location.pathname === item.path;
                  return (
                    <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}>
                      <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm transition-colors ${
                        active ? "bg-foreground text-background font-semibold" : "text-muted-foreground"
                      }`}>
                        <item.icon size={16} />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </nav>
              <div className="px-4 pt-3 border-t border-border/40 mt-3 space-y-0.5">
                {isAdmin && (
                  <Link to="/admin" onClick={() => setSidebarOpen(false)}>
                    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-destructive font-semibold">
                      <ShieldCheck size={16} />
                      Admin Panel
                    </div>
                  </Link>
                )}

                <Link to="/Landing" onClick={() => setSidebarOpen(false)}>
                  <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-muted-foreground">
                    <Home size={16} /> Go to homepage
                  </div>
                </Link>
                <button
                  onClick={() => base44.auth.logout("/Landing")}
                  className="flex items-center gap-3 px-4 py-3.5 w-full rounded-xl text-sm text-muted-foreground"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main content — light bg with subtle ambient */}
      <main className="relative flex-1 min-w-0 pt-14 lg:pt-0 overflow-hidden bg-background">
        {/* Subtle ambient backdrop */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 dot-grid opacity-40" />
          <div className="absolute -top-40 right-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-[0.12]"
               style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.4), transparent 60%)" }} />
          <div className="absolute top-1/2 -left-32 w-[34rem] h-[34rem] rounded-full blur-3xl opacity-[0.10]"
               style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.35), transparent 60%)" }} />
        </div>
        <div className="relative max-w-[1400px] mx-auto p-5 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}