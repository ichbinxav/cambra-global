import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, BarChart3, Users, Zap, FileText, Settings, Menu, X, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const NAV_ITEMS = [
  { path: "/Dashboard", label: "Overview", icon: LayoutDashboard },
  { path: "/Reports", label: "Reports", icon: BarChart3 },
  { path: "/Network", label: "Network", icon: Users },
  { path: "/Deals", label: "Deals", icon: Zap },
  { path: "/Insights", label: "Insights", icon: FileText },
  { path: "/Account", label: "Account", icon: Settings },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card/50 p-6">
        <Link to="/" className="flex items-center gap-2 mb-10">
          <span className="text-base font-semibold tracking-tight">THE N✱DE</span>
        </Link>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  active ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}>
                  <item.icon size={16} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 border-b border-border bg-background/80 backdrop-blur-xl">
        <Link to="/" className="text-sm font-semibold tracking-tight">THE N✱DE</Link>
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </Button>
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-14"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <nav className="p-6 space-y-2">
              {NAV_ITEMS.map(item => {
                const active = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}>
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${
                      active ? "bg-foreground text-background font-medium" : "text-muted-foreground"
                    }`}>
                      <item.icon size={18} />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 lg:overflow-y-auto pt-14 lg:pt-0">
        <div className="max-w-6xl mx-auto p-6 lg:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}