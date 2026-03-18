import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard, Users, FileText, Handshake, Building2,
  GitBranch, Settings, ChevronRight, Menu, X, LogOut, BarChart2, Sliders
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const NAV = [
  { path: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { path: "/admin/users", label: "Users & Companies", icon: Users },
  { path: "/admin/applications", label: "Deal Applications", icon: FileText },
  { path: "/admin/pipeline", label: "Pipeline", icon: GitBranch },
  { path: "/admin/deals", label: "Deals", icon: Handshake },
  { path: "/admin/providers", label: "Providers", icon: Building2 },
  { path: "/admin/revenue", label: "Revenue", icon: BarChart2 },
  { path: "/admin/benchmarks", label: "Benchmarks", icon: Sliders },
];

export default function AdminLayout() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) base44.auth.me().then(setUser);
  }, [isAuthenticated]);

  if (isLoadingAuth) return null;
  if (!isAuthenticated) {
    base44.auth.redirectToLogin(window.location.href);
    return null;
  }
  if (user && user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h1 className="text-xl font-bold mb-2">Admin access required</h1>
          <p className="text-muted-foreground text-sm mb-6">You don't have permission to access this area.</p>
          <Link to="/Dashboard" className="text-sm font-semibold underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-56 bg-foreground text-background flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="px-5 py-5 border-b border-background/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black tracking-tight">THE NoDE</p>
              <p className="text-[10px] text-background/30 mt-0.5">Admin System</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-background/40 hover:text-background">
              <X size={14} />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive(item.path, item.exact)
                  ? "bg-background/10 text-background"
                  : "text-background/40 hover:text-background hover:bg-background/5"
              }`}
            >
              <item.icon size={13} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-background/10">
          {user && (
            <div className="px-3 py-2 mb-2">
              <p className="text-[11px] font-semibold text-background/70 truncate">{user.full_name}</p>
              <p className="text-[10px] text-background/30 truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={() => base44.auth.logout("/Landing")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-background/40 hover:text-background hover:bg-background/5 transition-all"
          >
            <LogOut size={13} /> Sign out
          </button>
          <Link to="/Dashboard" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-background/40 hover:text-background hover:bg-background/5 transition-all">
            <ChevronRight size={13} /> Back to app
          </Link>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 lg:ml-56 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-12 bg-background border-b border-border/40 flex items-center px-5 gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <Menu size={16} />
          </button>
          <div className="text-xs text-muted-foreground/50 flex items-center gap-1.5">
            {location.pathname.split("/").filter(Boolean).map((seg, i, arr) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={10} />}
                <span className={i === arr.length - 1 ? "text-foreground font-medium" : ""}>{seg}</span>
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 font-semibold">Admin</span>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1400px] mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}