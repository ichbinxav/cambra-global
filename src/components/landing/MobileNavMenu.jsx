import { Link } from "react-router-dom";
import {
  ArrowRight, Sparkles, ScanSearch, Workflow, Plug, LineChart, Receipt,
  LifeBuoy, MessagesSquare, Home, LayoutDashboard, BarChart3, Users,
  Settings, BookOpen, Shield, Activity,
} from "lucide-react";

const PUBLIC_GROUPS = [
  { label: "Home", items: [
    { label: "Homepage", sub: "Cambra overview", href: "/", Icon: Home },
  ]},
  { label: "Platform", items: [
    { label: "Infrastructure audit", sub: "Run the Analyzer", href: "/Analyzer", Icon: ScanSearch },
    { label: "Margin intelligence", sub: "Insights & research", href: "/Insights", Icon: LineChart },
    { label: "Connect infrastructure data", sub: "Read-only integrations", href: "/ConnectTools", Icon: Plug },
  ]},
  { label: "Workflow", items: [
    { label: "Audit workflow", sub: "How Cambra works", href: "/HowItWorks", Icon: Workflow },
    { label: "Access & recovery", sub: "Economic model", href: "/Pricing", Icon: Receipt },
  ]},
  { label: "Company", items: [
    { label: "Contact", sub: "Talk to the team", href: "/Contact", Icon: MessagesSquare },
    { label: "Help", sub: "Documentation", href: "/Help", Icon: LifeBuoy },
  ]},
];

const MEMBER_GROUPS = [
  { label: "Workspace", items: [
    { label: "Dashboard", sub: "Command center", href: "/Dashboard", Icon: LayoutDashboard },
    { label: "Reports", sub: "Savings intelligence", href: "/Reports", Icon: BarChart3 },
    { label: "Infrastructure audit", sub: "Run new scan", href: "/Analyzer", Icon: ScanSearch },
  ]},
  { label: "Intelligence", items: [
    { label: "Margin intelligence", sub: "Insights & research", href: "/Insights", Icon: BookOpen },
    { label: "Operator network", sub: "Peer directory", href: "/Network", Icon: Users },
  ]},
  { label: "Account", items: [
    { label: "Account settings", sub: "Profile & billing", href: "/Account", Icon: Settings },
  ]},
];

function NavRow({ item }) {
  const { Icon, label, sub, href } = item;
  return (
    <Link
      to={href}
      className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 active:scale-[0.99] hover:bg-white/[0.04]"
    >
      <div className="relative h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border border-white/10 bg-white/[0.04] group-hover:border-cambra-cyan/30 transition-colors duration-200">
        <Icon className="h-[15px] w-[15px] text-white/75 group-hover:text-cambra-cyan transition-colors" strokeWidth={1.6} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-white leading-tight tracking-[-0.01em]">{label}</p>
        {sub && <p className="text-[11px] text-white/45 mt-0.5 leading-tight">{sub}</p>}
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/60 transition-colors shrink-0" strokeWidth={1.8} />
    </Link>
  );
}

export default function MobileNavMenu({ open, isAuthenticated, isAdmin }) {
  const groups = isAuthenticated ? MEMBER_GROUPS : PUBLIC_GROUPS;
  if (!open) return null;

  return (
    <>
      {/* Backdrop — dims the page behind the menu */}
      <div
        className="md:hidden fixed inset-0 top-14 z-40 bg-black/40 animate-fade-in-fast"
        aria-hidden
      />
      <div
        className="md:hidden fixed left-0 right-0 top-14 z-50 overflow-y-auto overflow-x-hidden border-b border-white/[0.08] animate-slide-down"
        style={{
          maxHeight: "calc(100vh - 3.5rem)",
          background:
            "radial-gradient(120% 60% at 50% 0%, rgba(31,78,216,0.18) 0%, transparent 55%), radial-gradient(80% 50% at 100% 100%, rgba(44,167,193,0.12) 0%, transparent 60%), linear-gradient(180deg, hsl(222 65% 5%) 0%, hsl(222 70% 3%) 100%)",
          boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)",
        }}
      >
      <style>{`
        @keyframes mobileNavFadeInFast { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mobileNavSlideDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-fast { animation: mobileNavFadeInFast 180ms ease-out; }
        .animate-slide-down { animation: mobileNavSlideDown 240ms cubic-bezier(0.22, 1, 0.36, 1); }
      `}</style>
      <div className="relative">
        <div className="px-5 pt-5 pb-4">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[9px] font-bold tracking-[0.22em] uppercase text-white/60">
              Live · Network online
            </span>
          </div>
          <p className="mt-3 text-[12px] text-white/55 leading-snug max-w-[280px]">
            Operational infrastructure intelligence for modern commerce.
          </p>
        </div>

        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        <div className="px-3 py-3 space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[9px] font-bold tracking-[0.24em] uppercase text-white/35">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.label} item={item} />
                ))}
              </div>
            </div>
          ))}

          {isAuthenticated && isAdmin && (
            <div>
              <p className="px-3 mb-1.5 text-[9px] font-bold tracking-[0.24em] uppercase text-white/35">
                Operator
              </p>
              <NavRow item={{ label: "Admin console", sub: "Infrastructure command", href: "/admin", Icon: Shield }} />
            </div>
          )}
        </div>

        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        <div className="px-5 py-5 space-y-2.5">
          {isAuthenticated ? (
            <Link to="/Analyzer" className="block">
              <div className="h-12 rounded-full bg-white text-[#06080F] font-bold text-[14px] inline-flex items-center justify-center gap-2 w-full">
                <Sparkles className="h-3.5 w-3.5" />
                Run new audit
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ) : (
            <>
              <Link to="/Analyzer" className="block">
                <div className="h-12 rounded-full bg-white text-[#06080F] font-bold text-[14px] inline-flex items-center justify-center gap-2 w-full">
                  <Sparkles className="h-3.5 w-3.5" />
                  Run free audit
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
              <a
                href="/auth/start"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-11 rounded-full text-[13px] font-semibold border border-white/[0.12] bg-white/[0.03] text-white/85 hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-2"
              >
                <Activity className="h-3.5 w-3.5 text-cambra-cyan" strokeWidth={2} />
                Sign in
              </a>
            </>
          )}

          <div className="pt-3 flex items-center justify-center gap-3 text-[10px] font-mono tracking-[0.15em] uppercase text-white/30">
            <span>3 min</span>
            <span className="h-1 w-1 rounded-full bg-white/15" />
            <span>No card</span>
            <span className="h-1 w-1 rounded-full bg-white/15" />
            <span>Free</span>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}