import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, ScanSearch, Workflow, Plug, LineChart, Receipt, LifeBuoy, MessagesSquare, Home, LayoutDashboard, BarChart3, Users, Settings, BookOpen, Shield, Activity } from "lucide-react";

// ─────────────────────────────────────────────
// Premium grouped structure — fintech editorial
// ─────────────────────────────────────────────

const PUBLIC_GROUPS = [
  {
    label: "Home",
    items: [
      { label: "Homepage", sub: "Cambra overview", href: "/", Icon: Home },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Infrastructure audit", sub: "Run the Analyzer", href: "/Analyzer", Icon: ScanSearch },
      { label: "Margin intelligence", sub: "Insights & research", href: "/Insights", Icon: LineChart },
      { label: "Connect infrastructure data", sub: "Read-only integrations", href: "/ConnectTools", Icon: Plug },
    ],
  },
  {
    label: "Workflow",
    items: [
      { label: "Audit workflow", sub: "How Cambra works", href: "/HowItWorks", Icon: Workflow },
      { label: "Access & recovery", sub: "Economic model", href: "/Pricing", Icon: Receipt },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "Contact", sub: "Talk to the team", href: "/Contact", Icon: MessagesSquare },
      { label: "Help", sub: "Documentation", href: "/Help", Icon: LifeBuoy },
    ],
  },
];

const MEMBER_GROUPS = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", sub: "Command center", href: "/Dashboard", Icon: LayoutDashboard },
      { label: "Reports", sub: "Savings intelligence", href: "/Reports", Icon: BarChart3 },
      { label: "Infrastructure audit", sub: "Run new scan", href: "/Analyzer", Icon: ScanSearch },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Margin intelligence", sub: "Insights & research", href: "/Insights", Icon: BookOpen },
      { label: "Operator network", sub: "Peer directory", href: "/Network", Icon: Users },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Account settings", sub: "Profile & billing", href: "/Account", Icon: Settings },
    ],
  },
];

const itemMotion = {
  hidden: { opacity: 0, y: 6 },
  show: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, delay: 0.04 + i * 0.025, ease: [0.22, 1, 0.36, 1] },
  }),
};

function NavRow({ item, index }) {
  const { Icon, label, sub, href } = item;
  return (
    <motion.div custom={index} variants={itemMotion} initial="hidden" animate="show">
      <Link
        to={href}
        className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 active:scale-[0.99] hover:bg-white/[0.04]"
      >
        {/* Icon container */}
        <div className="relative h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border border-white/10 bg-white/[0.04] group-hover:border-cambra-cyan/30 group-hover:bg-white/[0.06] transition-all duration-200 overflow-hidden">
          {/* Ambient glow on hover */}
          <span
            aria-hidden
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.25), transparent 70%)" }}
          />
          <Icon className="relative h-[15px] w-[15px] text-white/75 group-hover:text-cambra-cyan transition-colors" strokeWidth={1.6} />
        </div>

        {/* Text block — tighter, sharper */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-white leading-tight tracking-[-0.01em]">
            {label}
          </p>
          {sub && (
            <p className="text-[11px] text-white/45 mt-0.5 leading-tight">
              {sub}
            </p>
          )}
        </div>

        {/* Subtle arrow on hover */}
        <ArrowRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" strokeWidth={1.8} />
      </Link>
    </motion.div>
  );
}

export default function MobileNavMenu({ open, isAuthenticated, isAdmin }) {
  // The top navbar is the PUBLIC navbar on every public page, whether the user
  // is signed in or not — member navigation lives inside DashboardLayout.
  // Keep MEMBER_GROUPS declared above for future reuse but always render the
  // public grouping here.
  const groups = PUBLIC_GROUPS;
  // Reference MEMBER_GROUPS so the constant isn't linted as unused.
  void MEMBER_GROUPS;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="mobile-menu"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="md:hidden absolute inset-x-0 top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto overflow-x-hidden border-b border-white/[0.08]"
          style={{
            background:
              "radial-gradient(120% 60% at 50% 0%, rgba(31,78,216,0.18) 0%, transparent 55%), radial-gradient(80% 50% at 100% 100%, rgba(44,167,193,0.12) 0%, transparent 60%), linear-gradient(180deg, hsl(222 65% 5%) 0%, hsl(222 70% 3%) 100%)",
            boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)",
          }}
        >
          {/* Faint grid texture */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.4]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(ellipse 100% 60% at 50% 0%, #000 30%, transparent 80%)",
              WebkitMaskImage: "radial-gradient(ellipse 100% 60% at 50% 0%, #000 30%, transparent 80%)",
            }}
          />

          {/* Floating ambient orb */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-[80px]"
            style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.35), transparent)" }}
            animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.08, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative">
            {/* Status header — premium statement */}
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="px-5 pt-5 pb-4"
            >
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
                </span>
                <span className="text-[9px] font-bold tracking-[0.22em] uppercase text-white/60">
                  Live · Network online
                </span>
              </div>
              <p className="mt-3 text-[12px] text-white/55 leading-snug max-w-[280px]">
                Operational infrastructure intelligence for modern commerce.
              </p>
            </motion.div>

            {/* Divider */}
            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            {/* Grouped nav */}
            <div className="px-3 py-3 space-y-4">
              {groups.map((group, gi) => (
                <div key={group.label}>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.08 + gi * 0.04 }}
                    className="px-3 mb-1.5 text-[9px] font-bold tracking-[0.24em] uppercase text-white/35"
                  >
                    {group.label}
                  </motion.p>
                  <div className="space-y-0.5">
                    {group.items.map((item, ii) => (
                      <NavRow key={item.label} item={item} index={gi * 4 + ii} />
                    ))}
                  </div>
                </div>
              ))}

              {/* Admin block */}
              {isAuthenticated && isAdmin && (
                <div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                    className="px-3 mb-1.5 text-[9px] font-bold tracking-[0.24em] uppercase text-white/35"
                  >
                    Operator
                  </motion.p>
                  <NavRow
                    item={{ label: "Admin console", sub: "Infrastructure command", href: "/admin", Icon: Shield }}
                    index={20}
                  />
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            {/* CTA block — premium */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="px-5 py-5 space-y-2.5"
            >
              {isAuthenticated ? (
                <Link to="/Analyzer" className="block group">
                  <div className="relative">
                    <div
                      aria-hidden
                      className="absolute -inset-0.5 rounded-full opacity-50 group-hover:opacity-80 blur-md transition-opacity"
                      style={{ background: "linear-gradient(110deg, #1F4ED8, #2CA7C1)" }}
                    />
                    <div className="relative h-12 rounded-full bg-card text-[#06080F] font-bold text-[14px] inline-flex items-center justify-center gap-2 w-full overflow-hidden">
                      <Sparkles className="h-3.5 w-3.5" />
                      Run new audit
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              ) : (
                <>
                  <Link to="/Analyzer" className="block group">
                    <div className="relative">
                      {/* Glow halo */}
                      <div
                        aria-hidden
                        className="absolute -inset-0.5 rounded-full opacity-60 group-hover:opacity-90 blur-md transition-opacity"
                        style={{ background: "linear-gradient(110deg, #1F4ED8, #2CA7C1)" }}
                      />
                      <div className="relative h-12 rounded-full bg-card text-[#06080F] font-bold text-[14px] inline-flex items-center justify-center gap-2 w-full overflow-hidden">
                        {/* Shimmer sweep */}
                        <motion.span
                          aria-hidden
                          className="absolute inset-0 pointer-events-none"
                          style={{ background: "linear-gradient(110deg, transparent 35%, rgba(31,78,216,0.18) 50%, transparent 65%)" }}
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
                        />
                        <Sparkles className="relative h-3.5 w-3.5" />
                        <span className="relative">Run free audit</span>
                        <ArrowRight className="relative h-3.5 w-3.5" />
                      </div>
                    </div>
                  </Link>
                  <a
                    href="/auth/start"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-11 rounded-full text-[13px] font-semibold border border-white/[0.12] bg-white/[0.03] text-white/85 hover:bg-white/[0.06] hover:border-white/[0.2] transition-all flex items-center justify-center gap-2"
                  >
                    <Activity className="h-3.5 w-3.5 text-cambra-cyan" strokeWidth={2} />
                    Sign in
                  </a>
                </>
              )}

              {/* Bottom meta strip */}
              <div className="pt-3 flex items-center justify-center gap-3 text-[10px] font-mono tracking-[0.15em] uppercase text-white/30">
                <span>3 min</span>
                <span className="h-1 w-1 rounded-full bg-white/15" />
                <span>No card</span>
                <span className="h-1 w-1 rounded-full bg-white/15" />
                <span>Free</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}