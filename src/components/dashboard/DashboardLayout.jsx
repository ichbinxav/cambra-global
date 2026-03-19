import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, BarChart3, Users, Zap, FileText, Settings, Menu, X, LogOut, ArrowUpRight, Plug, Home, ShieldCheck, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const NAV_ITEMS = [
  { path: "/Dashboard", label: "Overview", icon: LayoutDashboard },
  { path: "/Reports", label: "Reports", icon: BarChart3 },
  { path: "/Network", label: "Network", icon: Users },
  { path: "/Deals", label: "Deals", icon: Zap },
  { path: "/Insights", label: "Insights", icon: FileText },
  { path: "/ConnectTools", label: "Data sources", icon: Plug },
  { path: "/Account", label: "Account", icon: Settings },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    console.log("DashboardLayout - Current user:", user);
    console.log("DashboardLayout - User role:", user?.role);
    console.log("DashboardLayout - isAdmin:", user?.role === "admin");
  }, [user]);

  const isAdmin = user?.role === "admin";
  const isProvider = user?.role === "provider";

  return (
    <div className="min-h-screen flex bg-background font-inter">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 border-r border-border/40 shrink-0 bg-background/98">
        <div className="px-5 h-14 flex items-center border-b border-border/40">
          <Link to="/" className="text-sm font-black tracking-tight group flex items-center gap-1.5">
            THE NoDE
            <ArrowUpRight size={11} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <motion.div
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-foreground text-background font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                  }`}
                  whileHover={active ? {} : { x: 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                >
                  <item.icon size={14} />
                  {item.label}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border/40 space-y-0.5">
          {isAdmin && (
            <Link to="/admin">
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-500/10 transition-colors font-semibold">
                <ShieldCheck size={14} />
                Admin Panel
              </div>
            </Link>
          )}
          {(isProvider || isAdmin) && (
            <Link to="/ProviderPortal">
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-blue-600 hover:bg-blue-500/10 transition-colors font-semibold">
                <Building2 size={14} />
                Provider Portal
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
        <Link to="/" className="text-sm font-black tracking-tight">THE NoDE</Link>
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
                    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-red-600 font-semibold">
                      <ShieldCheck size={16} />
                      Admin Panel
                    </div>
                  </Link>
                )}
                {(isProvider || isAdmin) && (
                  <Link to="/ProviderPortal" onClick={() => setSidebarOpen(false)}>
                    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm text-blue-600 font-semibold">
                      <Building2 size={16} />
                      Provider Portal
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

      {/* Main */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0 bg-background">
        <div className="max-w-5xl mx-auto p-6 lg:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}