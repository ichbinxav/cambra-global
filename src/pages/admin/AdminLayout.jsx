import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard, Users, FileText, Handshake, Building2,
  GitBranch, ChevronRight, Menu, X, LogOut, BarChart2, Sliders, FileCheck, Plug, ShieldCheck, Activity, ShieldAlert, Sparkles, Inbox, BarChart3, MessageSquare
} from "lucide-react";
import { Lightbulb } from "lucide-react";
import { base44 } from "@/api/base44Client";

const NAV = [
  { path: "/admin", label: "Command Center", icon: LayoutDashboard, exact: true },
  { path: "/admin/inbox", label: "Inbox", icon: Inbox, showQuestionsBadge: true },
  { path: "/admin/chat", label: "Chat", icon: MessageSquare },
  { path: "/admin/overview", label: "Overview", icon: BarChart3 },
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
  const [pendingQuestions, setPendingQuestions] = useState(0);
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
        const [approvals, questions] = await Promise.all([
          base44.entities.Approval.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
          base44.entities.AgentQuestion.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
        ]);
        if (!cancelled) {
          setPendingApprovals(Array.isArray(approvals) ? approvals.length : 0);
          setPendingQuestions(Array.isArray(questions) ? questions.length : 0);
        }
      } catch { /* non-fatal */ }
    };
    loadCount();
    const id = setInterval(loadCount, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user, location.pathname]);

  // Shared dark editorial background — matches DashboardLayout / Landing / Analyzer
  const darkBg = {
    color: "#ffffff",
    background:
      "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #08090f 100%)",
  };

  if (isLoadingAuth || loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={darkBg}>
        <div
          className="w-6 h-6 rounded-full animate-spin"
          style={{ border: "2px solid rgba(255,255,255,0.12)", borderTopColor: "#22d3ee" }}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={darkBg}>
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold mb-2 text-white">Sign-in required</h1>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>Open the login window and return automatically.</p>
          <a
            href="/auth/start"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-white text-black text-sm font-bold hover:bg-white/90 transition-colors"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={darkBg}>
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h1 className="text-xl font-bold mb-2 text-white">Admin access required</h1>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.55)" }}>
            Your account role: <strong className="text-white">{user?.role || "user"}</strong>. Contact support to get admin access.
          </p>
          <Link to="/Dashboard" className="text-sm font-semibold text-white underline underline-offset-4">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen flex font-inter" style={darkBg}>
      {/* Sidebar — dark editorial glass, matches DashboardLayout */}
      <aside
        className={`fixed inset-y-0 left-0 z-[70] w-56 flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
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

        <div className="relative px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black tracking-[-0.02em] text-white">CAMBRA</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
                </span>
                <p className="text-[10px] tracking-[0.22em] uppercase font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>Admin · Live</p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }}
              className="lg:hidden p-1.5 rounded-lg transition-colors"
              style={{ color: "rgba(255,255,255,0.55)", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="relative flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = isActive(item.path, item.exact);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? "bg-white text-black"
                    : "hover:bg-white/5"
                }`}
                style={
                  active
                    ? { boxShadow: "0 0 24px rgba(34,211,238,0.25)" }
                    : { color: "rgba(255,255,255,0.55)" }
                }
              >
                <item.icon size={13} />
                <span className="flex-1">{item.label}</span>
                {item.showPendingBadge && pendingApprovals > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-black tabular-nums ${
                    active ? "bg-black text-white" : "bg-rose-600 text-white"
                  }`}>
                    {pendingApprovals > 99 ? "99+" : pendingApprovals}
                  </span>
                )}
                {item.showQuestionsBadge && pendingQuestions > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-black tabular-nums ${
                    active ? "bg-black text-white" : "bg-amber-500 text-white"
                  }`}>
                    {pendingQuestions > 99 ? "99+" : pendingQuestions}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="relative px-3 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {user && (
            <div className="px-3 py-2 mb-2">
              <p className="text-[11px] font-semibold text-white truncate">{user.full_name}</p>
              <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.45)" }}>{user.email}</p>
            </div>
          )}
          <button
            onClick={() => base44.auth.logout("/Landing")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-white/5 transition-all"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <LogOut size={13} /> Sign out
          </button>
          <Link
            to="/Dashboard"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-white/5 transition-all"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <ChevronRight size={13} /> Back to app
          </Link>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-[60] bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main — dark editorial */}
      <div className="flex-1 lg:ml-56 min-h-screen flex flex-col">
        {/* Top bar — glass */}
        <header
          className="sticky top-0 z-20 h-12 flex items-center px-5 gap-3"
          style={{
            background: "rgba(10,10,10,0.78)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            style={{ color: "rgba(255,255,255,0.65)", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            <Menu size={20} />
          </button>
          <div className="text-xs flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
            {location.pathname.split("/").filter(Boolean).map((seg, i, arr) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={10} />}
                <span className={i === arr.length - 1 ? "font-semibold text-white" : ""}>{seg}</span>
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/Dashboard"
              className="h-8 px-3 rounded-lg text-xs font-medium transition-colors inline-flex items-center hover:bg-white/5"
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.75)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              Back to app
            </a>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{
                border: "1px solid rgba(34,211,238,0.30)",
                background: "rgba(34,211,238,0.08)",
                color: "#67e8f9",
              }}
            >
              Admin
            </span>
          </div>
        </header>

        <main className="relative flex-1 overflow-hidden">
          {/* Ambient backdrop — same recipe as DashboardLayout */}
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
            <div
              className="absolute -top-40 right-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl"
              style={{ background: "radial-gradient(closest-side, rgba(59,130,246,0.16), transparent 65%)" }}
            />
            <div
              className="absolute top-1/2 -left-32 w-[34rem] h-[34rem] rounded-full blur-3xl"
              style={{ background: "radial-gradient(closest-side, rgba(34,211,238,0.14), transparent 65%)" }}
            />
          </div>
          <div className="relative p-6 max-w-[1400px] mx-auto w-full text-white">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}