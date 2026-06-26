import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard, Users, FileText, Handshake, Building2,
  GitBranch, ChevronRight, Menu, X, LogOut, BarChart2, Sliders, FileCheck, Plug, ShieldCheck, Activity, ShieldAlert, Sparkles
} from "lucide-react";
import { Lightbulb } from "lucide-react";
import { base44 } from "@/api/base44Client";

const NAV = [
  { path: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { path: "/admin/users", label: "Users & Companies", icon: Users },
  { path: "/admin/applications", label: "Deal Applications", icon: FileText },
  { path: "/admin/pipeline", label: "Pipeline", icon: GitBranch },
  { path: "/admin/deals", label: "Deals", icon: Handshake },
  { path: "/admin/providers", label: "Providers", icon: Building2 },
  { path: "/admin/revenue", label: "Revenue", icon: BarChart2 },
  { path: "/admin/contracts", label: "Contracts", icon: FileCheck },
  { path: "/admin/benchmarks", label: "Benchmarks", icon: Sliders },
  { path: "/admin/recommendations", label: "Recommendations", icon: Lightbulb },
  { path: "/admin/integrations", label: "Integrations", icon: Plug },
  { path: "/admin/api-integrations", label: "API & Webhooks", icon: Plug },
  { path: "/admin/compliance", label: "Compliance", icon: ShieldCheck },
  { path: "/admin/activity", label: "Activity Log", icon: Activity },
  { path: "/admin/approvals", label: "Approvals", icon: ShieldAlert, showPendingBadge: true },
  { path: "/admin/copilot", label: "Founder Copilot", icon: Sparkles },
];

export default function AdminLayout() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      base44.auth.me().then(u => { setUser(u); setLoadingUser(false); });
    } else if (!isLoadingAuth) {
      setLoadingUser(false);
    }
  }, [isAuthenticated, isLoadingAuth]);

  // Poll pending approvals count for sidebar badge (admin-only context)
  useEffect(() => {
    if (user?.role !== "admin") return;
    let cancelled = false;
    const loadCount = async () => {
      try {
        const rows = await base44.entities.Approval.filter({ status: "pending" }, "-created_date", 200);
        if (!cancelled) setPendingApprovals(Array.isArray(rows) ? rows.length : 0);
      } catch { /* non-fatal */ }
    };
    loadCount();
    const id = setInterval(loadCount, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user, location.pathname]);

  if (isLoadingAuth || loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold mb-2">Sign-in required</h1>
          <p className="text-sm text-muted-foreground mb-4">Open the login window and return automatically.</p>
          <a
            href="/auth/start"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-foreground text-background text-sm font-bold"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h1 className="text-xl font-bold mb-2">Admin access required</h1>
          <p className="text-muted-foreground text-sm mb-6">Your account role: <strong>{user?.role || "user"}</strong>. Contact support to get admin access.</p>
          <Link to="/Dashboard" className="text-sm font-semibold underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar — light, uniform */}
      <aside className={`fixed inset-y-0 left-0 z-[70] w-56 bg-white border-r border-border/60 flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="px-5 py-5 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black tracking-tight text-foreground">CAMBRA</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tracking-[0.18em] uppercase">Admin · Live</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }}
              className="lg:hidden text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors"
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = isActive(item.path, item.exact);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <item.icon size={13} />
                <span className="flex-1">{item.label}</span>
                {item.showPendingBadge && pendingApprovals > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-black tabular-nums ${
                    active ? "bg-background text-foreground" : "bg-rose-600 text-white"
                  }`}>
                    {pendingApprovals > 99 ? "99+" : pendingApprovals}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-border/60">
          {user && (
            <div className="px-3 py-2 mb-2">
              <p className="text-[11px] font-semibold text-foreground truncate">{user.full_name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={() => base44.auth.logout("/Landing")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          >
            <LogOut size={13} /> Sign out
          </button>
          <Link to="/Dashboard" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <ChevronRight size={13} /> Back to app
          </Link>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-[60] bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main — light */}
      <div className="flex-1 lg:ml-56 min-h-screen flex flex-col bg-white">
        {/* Top bar — light */}
        <header className="sticky top-0 z-20 h-12 bg-white/95 backdrop-blur-xl border-b border-border/60 flex items-center px-5 gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
            className="lg:hidden text-muted-foreground hover:text-foreground p-2 -ml-2 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            <Menu size={20} />
          </button>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            {location.pathname.split("/").filter(Boolean).map((seg, i, arr) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={10} />}
                <span className={i === arr.length - 1 ? "text-foreground font-semibold" : ""}>{seg}</span>
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/Dashboard"
              className="h-8 px-3 rounded-lg border border-border/60 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
            >
              Back to app
            </a>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border/60 font-semibold">Admin</span>
          </div>
        </header>

        <main className="relative flex-1 bg-white">
          <div className="relative p-6 max-w-[1400px] mx-auto w-full text-foreground">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}