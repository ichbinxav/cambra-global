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
      <aside className="hidden lg:flex flex-col w-60 border-r border-border/50 bg-background shrink-0">
        <div className="p-6 border-b border-border/50">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight">THE N✱DE</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                }`}>
                  <item.icon size={15} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50">
          <button
            onClick={() => base44.auth.logout()}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-all"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 h-14 border-b border-border/50 bg-background/90 backdrop-blur-xl">
        <Link to="/" className="text-sm font-bold tracking-tight">THE N✱DE</Link>
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={17} /> : <Menu size={17} />}
        </Button>
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-40 bg-background/96 backdrop-blur-xl pt-14"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <nav className="p-5 space-y-0.5">
              {NAV_ITEMS.map(item => {
                const active = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}>
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
                      active ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground"
                    }`}>
                      <item.icon size={16} />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </nav>
            <div className="px-5 pt-2 border-t border-border/50 mt-2">
              <button
                onClick={() => base44.auth.logout()}
                className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm text-muted-foreground"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">
        <div className="max-w-5xl mx-auto p-6 lg:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}