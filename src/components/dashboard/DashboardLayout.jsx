import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, BarChart3, FileText, Settings, Menu, X, LogOut, ArrowUpRight, Home, ShieldCheck, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useTranslation } from "@/lib/i18n.jsx";
import { BRAND_ASSETS } from "@/lib/brandAssets";

// MVP navigation — focused, minimal. Advanced API/OAuth/Webhook screens are admin-only.
// FASE 1.2 — Unlock Savings + Recovery Tracker removed from sidebar (negotiation
// out of scope for payments-only phase). Routes redirect to home in App.jsx.
// labelKey → resolved through t() at render so the sidebar follows the language
// toggle (previously hardcoded English → didn't translate).
const NAV_ITEMS = [
  { path: "/Dashboard", labelKey: "nav_dashboard", icon: LayoutDashboard },
  { path: "/Analyzer", labelKey: "nav_analyzer", icon: BarChart3 },
  { path: "/Results", labelKey: "sidebar_results", icon: FileText },
  { path: "/Vault", labelKey: "sidebar_documents", icon: FolderOpen },
  { path: "/Account", labelKey: "sidebar_account", icon: Settings },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  // user role tracking handled by AuthContext

  const isAdmin = user?.role === "admin";

  return (
    <div
      className="dark min-h-screen flex font-inter"
      style={{
        color: "#ffffff",
        background: "#0B0E1A",
      }}
    >
      {/* Desktop Sidebar — flat navy, always visible on lg+ */}
      <aside
        className="hidden lg:flex flex-col w-56 shrink-0 relative z-20"
        style={{
          background: "#0B0E1A",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="relative px-5 h-14 flex items-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <Link to="/" className="group flex items-center gap-2" aria-label="CAMBRA home">
            <img src={BRAND_ASSETS.cMarkVoltio} alt="" width={22} height={22} className="h-[22px] w-[22px]" draggable={false} />
            <span className="text-[13px] font-black tracking-[-0.02em] text-white">CAMBRA</span>
            <ArrowUpRight size={10} className="text-white/40 group-hover:text-[#8B7BFF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </Link>
        </div>

        {/* Status pill */}
        <div className="relative px-3 pt-3 pb-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.22em] font-bold"
            style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.65)" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "#8B7BFF" }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#8B7BFF" }} />
            </span>
            {t("sidebar_network_live")}
          </span>
        </div>

        <nav className="relative flex-1 p-3 pt-2 space-y-0.5">
          <p className="px-3 mb-1.5 text-[9px] font-bold tracking-[0.24em] uppercase text-white/40">{t("sidebar_workspace")}</p>
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <motion.div
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all"
                  style={
                    active
                      ? { background: "var(--g-voltio)", color: "#ffffff", fontWeight: 700, boxShadow: "0 6px 18px -8px rgba(91,76,245,0.6)" }
                      : { background: "transparent", color: "rgba(255,255,255,0.6)" }
                  }
                  whileHover={active ? {} : { x: 2, backgroundColor: "rgba(139,123,255,0.10)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                >
                  <item.icon size={14} strokeWidth={active ? 2.4 : 1.8} />
                  {t(item.labelKey)}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {isAdmin && (
            <Link to="/admin">
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors font-semibold text-red-300 hover:bg-red-500/10">
                <ShieldCheck size={14} />
                {t("sidebar_admin")}
              </div>
            </Link>
          )}

          <Link to="/Landing">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-white/60 hover:bg-[rgba(139,123,255,0.10)]">
              <Home size={14} />
              {t("sidebar_homepage")}
            </div>
          </Link>
          <button
            onClick={() => base44.auth.logout("/Landing")}
            className="flex items-center gap-2.5 px-3 py-2.5 w-full rounded-lg text-sm transition-colors text-white/60 hover:bg-[rgba(139,123,255,0.10)]"
          >
            <LogOut size={14} />
            {t("sidebar_signout")}
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 h-14"
        style={{
          background: "rgba(11,14,26,0.9)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Link to="/" className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
          <img src={BRAND_ASSETS.cMarkVoltio} alt="" width={20} height={20} className="h-5 w-5" draggable={false} />
          CAMBRA
        </Link>
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
              style={{ background: "#0B0E1A" }}
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
                      <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors"
                        style={active
                          ? { background: "var(--g-voltio)", color: "#ffffff", fontWeight: 700 }
                          : { color: "rgba(255,255,255,0.6)" }}
                      >
                        <item.icon size={16} />
                        {t(item.labelKey)}
                      </div>
                    </Link>
                  );
                })}
              </nav>
              <div className="px-4 pt-3 mt-3 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                {isAdmin && (
                  <Link to="/admin" onClick={() => setSidebarOpen(false)}>
                    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-red-300 font-semibold">
                      <ShieldCheck size={16} />
                      {t("sidebar_admin")}
                    </div>
                  </Link>
                )}

                <Link to="/Landing" onClick={() => setSidebarOpen(false)}>
                  <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-white/60">
                    <Home size={16} /> {t("sidebar_homepage")}
                  </div>
                </Link>
                <button
                  onClick={() => base44.auth.logout("/Landing")}
                  className="flex items-center gap-3 px-4 py-3.5 w-full rounded-xl text-sm text-white/60"
                >
                  <LogOut size={16} /> {t("sidebar_signout")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main content — flat navy canvas */}
      <main className="relative flex-1 min-w-0 pt-14 lg:pt-0" style={{ background: "#0B0E1A" }}>
        <div className="relative max-w-[1400px] mx-auto p-5 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}