import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, BarChart3, FileText, Settings, Menu, X, LogOut, ArrowUpRight, Home, ShieldCheck, FolderOpen } from "lucide-react";
import BrandGlyph from "@/components/shared/BrandGlyph";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// MVP navigation — focused, minimal. Advanced API/OAuth/Webhook screens are admin-only.
// FASE 1.2 — Unlock Savings + Recovery Tracker removed from sidebar (negotiation
// out of scope for payments-only phase). Routes redirect to home in App.jsx.
const NAV_ITEMS = [
  { path: "/Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/Analyzer", label: "Analyzer", icon: BarChart3 },
  { path: "/Results", label: "Results", icon: FileText },
  { path: "/Vault", label: "Documents", icon: FolderOpen },
  { path: "/Account", label: "Account", icon: Settings },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  // user role tracking handled by AuthContext

  const isAdmin = user?.role === "admin";

  return (
    <div
      className="min-h-screen flex font-inter"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #08090f 100%)",
      }}
    >
      {/* Desktop Sidebar — premium dark editorial */}
      <aside
        className="hidden lg:flex flex-col w-56 shrink-0 relative"
        style={{
          background: "rgba(10,10,10,0.65)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/* Subtle radial accent at top */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 right-0 h-40"
          style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(59,130,246,0.15), transparent 70%)" }}
        />

        <div className="relative px-5 h-14 flex items-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <Link to="/" className="group flex items-center gap-2" aria-label="CAMBRA home">
            <BrandGlyph className="h-5 w-5 text-white" />
            <span className="text-[13px] font-black tracking-[-0.02em] text-white">CAMBRA</span>
            <ArrowUpRight size={10} className="text-white/35 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </Link>
        </div>

        {/* Status pill */}
        <div className="relative px-3 pt-3 pb-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.22em] font-bold text-white/65"
            style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            Network live
          </span>
        </div>

        <nav className="relative flex-1 p-3 pt-2 space-y-0.5">
          <p className="px-3 mb-1.5 text-[9px] font-bold tracking-[0.24em] uppercase text-white/35">Workspace</p>
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <motion.div
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] transition-all ${
                    active
                      ? "bg-white text-black font-bold"
                      : "text-white/55 hover:text-white"
                  }`}
                  style={
                    active
                      ? { boxShadow: "0 0 24px rgba(34,211,238,0.25)" }
                      : { background: "transparent" }
                  }
                  whileHover={active ? {} : { x: 2, backgroundColor: "rgba(255,255,255,0.04)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                >
                  <item.icon size={14} strokeWidth={active ? 2.4 : 1.8} />
                  {item.label}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {isAdmin && (
            <Link to="/admin">
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors font-semibold text-red-300 hover:bg-red-500/10">
                <ShieldCheck size={14} />
                Admin Panel
              </div>
            </Link>
          )}

          <Link to="/Landing">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-white/55 hover:text-white hover:bg-white/5 transition-colors">
              <Home size={14} />
              Go to homepage
            </div>
          </Link>
          <button
            onClick={() => base44.auth.logout("/Landing")}
            className="flex items-center gap-2.5 px-3 py-2.5 w-full rounded-lg text-sm text-white/55 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 h-14"
        style={{
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Link to="/" className="text-sm font-black tracking-tight text-white">CAMBRA</Link>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setSidebarOpen(!sidebarOpen)}>
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
              className="fixed inset-0 z-40 pt-14 overflow-y-auto"
              style={{ background: "#0a0a0a" }}
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
                        active ? "bg-white text-black font-semibold" : "text-white/60"
                      }`}>
                        <item.icon size={16} />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </nav>
              <div className="px-4 pt-3 mt-3 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {isAdmin && (
                  <Link to="/admin" onClick={() => setSidebarOpen(false)}>
                    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-red-300 font-semibold">
                      <ShieldCheck size={16} />
                      Admin Panel
                    </div>
                  </Link>
                )}

                <Link to="/Landing" onClick={() => setSidebarOpen(false)}>
                  <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-white/60">
                    <Home size={16} /> Go to homepage
                  </div>
                </Link>
                <button
                  onClick={() => base44.auth.logout("/Landing")}
                  className="flex items-center gap-3 px-4 py-3.5 w-full rounded-xl text-sm text-white/60"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main content — dark editorial */}
      <main className="relative flex-1 min-w-0 pt-14 lg:pt-0 overflow-hidden">
        {/* Ambient backdrop */}
        <div className="pointer-events-none absolute inset-0">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              opacity: 0.3,
              maskImage: "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
            }}
          />
          <div className="absolute -top-40 right-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl"
               style={{ background: "radial-gradient(closest-side, rgba(59,130,246,0.16), transparent 65%)" }} />
          <div className="absolute top-1/2 -left-32 w-[34rem] h-[34rem] rounded-full blur-3xl"
               style={{ background: "radial-gradient(closest-side, rgba(34,211,238,0.14), transparent 65%)" }} />
        </div>
        <div className="relative max-w-[1400px] mx-auto p-5 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}