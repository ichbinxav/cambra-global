import { Fragment, useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard, FileText, Handshake, Building2,
  ClipboardCheck, GitBranch, ChevronRight, Menu, X, LogOut, FileCheck, Plug, ShieldCheck, Activity, MessageSquare, Search, FileSearch, Bot, Workflow, Code2, BrainCircuit, Landmark, Gauge, Wrench, BookOpen, HelpCircle, Settings2, Megaphone, MessagesSquare
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n.jsx";

export const ADMIN_LAYOUT_COPY = {
  en: {
    "nav.Founder OS": "Founder OS",
    "nav.Inbox": "Inbox",
    "nav.AI Operations": "AI Operations",
    "nav.CAMBRA Developer": "CAMBRA Developer",
    "nav.Automations": "Automations",
    "nav.Ask CAMBRA": "Ask CAMBRA",
    "nav.Discovery": "Discovery",
    "nav.Campaigns": "Campaigns",
    "nav.Inbox & Conversations": "Inbox & Conversations",
    "nav.Commercial OS": "Commercial OS",
    "nav.Commercial Autonomy": "Commercial Autonomy",
    "nav.Intelligence": "Intelligence",
    "nav.Europe · Markets": "Europe · Markets",
    "nav.Europe · Growth": "Europe · Growth",
    "nav.Routing Intelligence": "Routing Intelligence",
    "nav.Aggregate": "Aggregate",
    "nav.Finance": "Finance",
    "nav.Provider Economics": "Provider Economics",
    "nav.Founder Control": "Founder Control",
    "nav.Settings": "Settings",
    "nav.Maintenance": "Maintenance",
    "nav.Operating Bible": "Operating Bible",
    "nav.Evidence Review": "Evidence Review",
    "nav.ECL Operations": "ECL Operations",
    "nav.Overview": "Overview",
    "nav.Users & Companies": "Users & Companies",
    "nav.Merchants": "Merchants",
    "nav.Waitlist": "Waitlist",
    "nav.Deal Applications": "Deal Applications",
    "nav.Pipeline": "Pipeline",
    "nav.Audits & Opportunities": "Audits & Opportunities",
    "nav.Recover": "Recover",
    "nav.Deals": "Deals",
    "nav.Providers": "Providers",
    "nav.Revenue": "Revenue",
    "nav.Recover Billing": "Recover Billing",
    "nav.Contracts": "Contracts",
    "nav.Benchmarks": "Benchmarks",
    "nav.Recommendations": "Recommendations",
    "nav.Integrations": "Integrations",
    "nav.API & Webhooks": "API & Webhooks",
    "nav.Compliance": "Compliance",
    "nav.Activity Log": "Activity Log",
    "nav.Approvals": "Approvals",
    "nav.Founder Copilot": "Founder Copilot",
    "group.Overview": "Overview",
    "group.Command": "Command",
    "group.Inbox": "Inbox",
    "group.Intelligence": "Intelligence",
    "group.Commercial": "Commercial",
    "group.Operations": "Operations",
    "group.Company": "Company",
    "group.System": "System",
    sign_in_required: "Sign-in required",
    sign_in_help: "Open the login window and return automatically.",
    sign_in: "Sign in",
    admin_access_required: "Admin access required",
    account_role: "Your account role: {role}. Contact support to get admin access.",
    back_dashboard: "Back to Dashboard",
    admin_live: "Admin · Live",
    close_menu: "Close navigation",
    open_menu: "Open navigation",
    sign_out: "Sign out",
    back_to_app: "Back to app",
    search_or_ask: "Search or ask CAMBRA…",
    searching: "Searching…",
    no_matches: "No exact matches. Press Enter to ask CAMBRA.",
    ask_cambra: "Ask CAMBRA",
    how_it_works: "How does this work?",
    admin: "Admin",
  },
  fr: {
    "nav.Founder OS": "OS Fondateur",
    "nav.Inbox": "Boîte de réception",
    "nav.AI Operations": "Opérations IA",
    "nav.CAMBRA Developer": "Développement CAMBRA",
    "nav.Automations": "Automatisations",
    "nav.Ask CAMBRA": "Demander à CAMBRA",
    "nav.Discovery": "Découverte",
    "nav.Campaigns": "Campagnes",
    "nav.Inbox & Conversations": "Boîte & Conversations",
    "nav.Commercial OS": "OS Commercial",
    "nav.Commercial Autonomy": "Autonomie commerciale",
    "nav.Intelligence": "Intelligence",
    "nav.Europe · Markets": "Europe · Marchés",
    "nav.Europe · Growth": "Europe · Croissance",
    "nav.Routing Intelligence": "Intelligence de routage",
    "nav.Aggregate": "Agrégats",
    "nav.Finance": "Finances",
    "nav.Provider Economics": "Économie des prestataires",
    "nav.Founder Control": "Contrôle Fondateur",
    "nav.Settings": "Paramètres",
    "nav.Maintenance": "Maintenance",
    "nav.Operating Bible": "Manuel opérationnel",
    "nav.Evidence Review": "Revue des preuves",
    "nav.ECL Operations": "Opérations ECL",
    "nav.Overview": "Vue d’ensemble",
    "nav.Users & Companies": "Utilisateurs et entreprises",
    "nav.Merchants": "Marchands",
    "nav.Waitlist": "Liste d’attente",
    "nav.Deal Applications": "Demandes commerciales",
    "nav.Pipeline": "Pipeline",
    "nav.Audits & Opportunities": "Audits et opportunités",
    "nav.Recover": "Recover",
    "nav.Deals": "Opportunités",
    "nav.Providers": "Prestataires",
    "nav.Revenue": "Chiffre d’affaires",
    "nav.Recover Billing": "Facturation Recover",
    "nav.Contracts": "Contrats",
    "nav.Benchmarks": "Référentiels",
    "nav.Recommendations": "Recommandations",
    "nav.Integrations": "Intégrations",
    "nav.API & Webhooks": "API et webhooks",
    "nav.Compliance": "Conformité",
    "nav.Activity Log": "Journal d’activité",
    "nav.Approvals": "Approbations",
    "nav.Founder Copilot": "Copilote Fondateur",
    "group.Overview": "Vue d’ensemble",
    "group.Command": "Pilotage",
    "group.Inbox": "Boîte de réception",
    "group.Intelligence": "Intelligence",
    "group.Commercial": "Commercial",
    "group.Operations": "Opérations",
    "group.Company": "Entreprise",
    "group.System": "Système",
    sign_in_required: "Connexion requise",
    sign_in_help: "Ouvrez la fenêtre de connexion, puis revenez automatiquement.",
    sign_in: "Se connecter",
    admin_access_required: "Accès administrateur requis",
    account_role: "Rôle de votre compte : {role}. Contactez l’assistance pour obtenir l’accès administrateur.",
    back_dashboard: "Retour au tableau de bord",
    admin_live: "Admin · En direct",
    close_menu: "Fermer la navigation",
    open_menu: "Ouvrir la navigation",
    sign_out: "Se déconnecter",
    back_to_app: "Retour à l’application",
    search_or_ask: "Rechercher ou demander à CAMBRA…",
    searching: "Recherche…",
    no_matches: "Aucun résultat exact. Appuyez sur Entrée pour demander à CAMBRA.",
    ask_cambra: "Demander à CAMBRA",
    how_it_works: "Comment cela fonctionne-t-il ?",
    admin: "Admin",
  },
  es: {
    "nav.Founder OS": "OS del Fundador",
    "nav.Inbox": "Bandeja de entrada",
    "nav.AI Operations": "Operaciones de IA",
    "nav.CAMBRA Developer": "Desarrollo CAMBRA",
    "nav.Automations": "Automatizaciones",
    "nav.Ask CAMBRA": "Preguntar a CAMBRA",
    "nav.Discovery": "Descubrimiento",
    "nav.Campaigns": "Campañas",
    "nav.Inbox & Conversations": "Bandeja y Conversaciones",
    "nav.Commercial OS": "Sistema Comercial",
    "nav.Commercial Autonomy": "Autonomía comercial",
    "nav.Intelligence": "Inteligencia",
    "nav.Europe · Markets": "Europa · Mercados",
    "nav.Europe · Growth": "Europa · Crecimiento",
    "nav.Routing Intelligence": "Inteligencia de enrutamiento",
    "nav.Aggregate": "Agregados",
    "nav.Finance": "Finanzas",
    "nav.Provider Economics": "Economía de proveedores",
    "nav.Founder Control": "Control del Fundador",
    "nav.Settings": "Configuración",
    "nav.Maintenance": "Mantenimiento",
    "nav.Operating Bible": "Manual operativo",
    "nav.Evidence Review": "Revisión de evidencias",
    "nav.ECL Operations": "Operaciones ECL",
    "nav.Overview": "Resumen",
    "nav.Users & Companies": "Usuarios y empresas",
    "nav.Merchants": "Merchants",
    "nav.Waitlist": "Lista de espera",
    "nav.Deal Applications": "Solicitudes comerciales",
    "nav.Pipeline": "Pipeline",
    "nav.Audits & Opportunities": "Auditorías y oportunidades",
    "nav.Recover": "Recover",
    "nav.Deals": "Acuerdos",
    "nav.Providers": "Proveedores",
    "nav.Revenue": "Ingresos",
    "nav.Recover Billing": "Facturación Recover",
    "nav.Contracts": "Contratos",
    "nav.Benchmarks": "Comparativas",
    "nav.Recommendations": "Recomendaciones",
    "nav.Integrations": "Integraciones",
    "nav.API & Webhooks": "API y webhooks",
    "nav.Compliance": "Cumplimiento",
    "nav.Activity Log": "Registro de actividad",
    "nav.Approvals": "Aprobaciones",
    "nav.Founder Copilot": "Copiloto del Fundador",
    "group.Overview": "Resumen",
    "group.Command": "Control",
    "group.Inbox": "Bandeja de entrada",
    "group.Intelligence": "Inteligencia",
    "group.Commercial": "Comercial",
    "group.Operations": "Operaciones",
    "group.Company": "Empresa",
    "group.System": "Sistema",
    sign_in_required: "Inicio de sesión obligatorio",
    sign_in_help: "Abre la ventana de acceso y volverás automáticamente.",
    sign_in: "Iniciar sesión",
    admin_access_required: "Se requiere acceso de administrador",
    account_role: "El rol de tu cuenta es: {role}. Contacta con soporte para obtener acceso de administrador.",
    back_dashboard: "Volver al panel",
    admin_live: "Admin · En vivo",
    close_menu: "Cerrar navegación",
    open_menu: "Abrir navegación",
    sign_out: "Cerrar sesión",
    back_to_app: "Volver a la aplicación",
    search_or_ask: "Buscar o preguntar a CAMBRA…",
    searching: "Buscando…",
    no_matches: "No hay coincidencias exactas. Pulsa Intro para preguntar a CAMBRA.",
    ask_cambra: "Preguntar a CAMBRA",
    how_it_works: "¿Cómo funciona?",
    admin: "Admin",
  },
};

export function adminLayoutText(lang, key, params = {}) {
  const dictionary = ADMIN_LAYOUT_COPY[lang] || ADMIN_LAYOUT_COPY.en;
  const raw = dictionary[key] ?? ADMIN_LAYOUT_COPY.en[key] ?? key;
  return String(raw).replace(/\{(\w+)\}/g, (_match, name) => params[name] == null ? `{${name}}` : String(params[name]));
}

// DASHBOARD-C13: the ten routes below were removed from the sidebar because each now
// redirects into a workspace tab that serves the same content (verified per row by
// dashboard:navigation:check). Nothing is orphaned by this. The full cut to twelve entries is
// BLOCKED: ten further routes have no declared destination yet — see unmapped_routes in
// config/dashboard/navigation.v1.json.
const NAV = [
  { path: "/admin", label: "Founder OS", icon: LayoutDashboard, exact: true },
  { path: "/admin/agents", label: "AI Operations", icon: Bot, advanced: true },
  { path: "/admin/developer", label: "CAMBRA Developer", icon: Code2, advanced: true },
  { path: "/admin/automations", label: "Automations", icon: Workflow, advanced: true },
  { path: "/admin/chat", label: "Ask CAMBRA", icon: MessageSquare },
  { path: "/admin/discovery", label: "Discovery", icon: Search },
  { path: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
  { path: "/admin/conversations", label: "Inbox & Conversations", icon: MessagesSquare },
  { path: "/admin/intelligence", label: "Intelligence", icon: BrainCircuit },
  { path: "/admin/finance", label: "Finance", icon: Landmark },
  { path: "/admin/founder-control", label: "Founder Control", icon: Gauge },
  { path: "/admin/settings", label: "Settings", icon: Settings2 },
  { path: "/admin/maintenance", label: "Maintenance", icon: Wrench, advanced: true },
  { path: "/admin/documentation", label: "Operating Bible", icon: BookOpen, advanced: true },
  { path: "/admin/evidence-review", label: "Evidence Review", icon: FileSearch, advanced: true },
  { path: "/admin/ecl-operations", label: "ECL Operations", icon: Activity, advanced: true },
  { path: "/admin/merchants", label: "Merchants", icon: Building2 },
  { path: "/admin/applications", label: "Deal Applications", icon: FileText },
  { path: "/admin/pipeline", label: "Pipeline", icon: GitBranch },
  // DASHBOARD-C13: neither of these was in the sidebar. /admin/recover has been unreachable
  // from navigation since C7 built it — only by typing the URL. The reverse-coverage check in
  // dashboard:navigation:check found it.
  { path: "/admin/audits", label: "Audits & Opportunities", icon: ClipboardCheck },
  { path: "/admin/recover", label: "Recover", icon: FileCheck },
  { path: "/admin/deals", label: "Deals", icon: Handshake },
  { path: "/admin/integrations", label: "Integrations", icon: Plug, advanced: true },
  { path: "/admin/api-integrations", label: "API & Webhooks", icon: Plug, advanced: true },
  { path: "/admin/compliance", label: "Compliance", icon: ShieldCheck, advanced: true },
  { path: "/admin/activity", label: "Activity Log", icon: Activity, advanced: true },
];

// DASHBOARD-C14 (2026-08-17): the eleven entries flagged `advanced: true` are the
// advanced_system_children the registry declares. They render nested under Settings instead of
// as eleven top-level entries — that nesting is the last step of the consolidation, and it is
// what takes the sidebar from 26 top-level entries to the declared architecture.
const ADVANCED_NAV = NAV.filter((item) => item.advanced);
const GROUP_ORDER = ["Overview", "Command", "Inbox", "Intelligence", "Commercial", "Operations", "Company", "System"];
function navGroup(path) {
  if (["/admin", "/admin/overview"].includes(path)) return "Overview";
  if (["/admin/founder-control", "/admin/chat", "/admin/copilot"].includes(path)) return "Command";
  if (["/admin/inbox", "/admin/approvals"].includes(path)) return "Inbox";
  if (["/admin/intelligence", "/admin/markets", "/admin/growth", "/admin/routing-intelligence", "/admin/benchmarks", "/admin/recommendations"].includes(path)) return "Intelligence";
  if (["/admin/discovery", "/admin/campaigns", "/admin/conversations", "/admin/commercial", "/admin/commercial-autonomy", "/admin/pipeline", "/admin/deals", "/admin/aggregate", "/admin/providers", "/admin/provider-economics", "/admin/contracts", "/admin/audits", "/admin/recover"].includes(path)) return "Commercial";
  if (["/admin/agents", "/admin/automations", "/admin/developer", "/admin/maintenance", "/admin/evidence-review", "/admin/ecl-operations", "/admin/activity"].includes(path)) return "Operations";
  if (["/admin/users", "/admin/merchants", "/admin/waitlist", "/admin/applications", "/admin/finance", "/admin/revenue", "/admin/recover-billing"].includes(path)) return "Company";
  return "System";
}
const GROUPED_NAV = [...NAV].sort((a, b) => GROUP_ORDER.indexOf(navGroup(a.path)) - GROUP_ORDER.indexOf(navGroup(b.path)) || NAV.indexOf(a) - NAV.indexOf(b));

function documentationTopic(path) {
  if (path.startsWith('/admin/discovery') || path.startsWith('/admin/campaigns') || path.startsWith('/admin/conversations') || path.startsWith('/admin/commercial-autonomy') || path.startsWith('/admin/pipeline')) return 'acquisition';
  if (path.startsWith('/admin/markets') || path.startsWith('/admin/growth')) return 'markets';
  if (path.startsWith('/admin/intelligence')) return 'moat';
  if (path.startsWith('/admin/aggregate')) return 'aggregate';
  if (path.startsWith('/admin/provider-economics') || path.startsWith('/admin/providers')) return 'provider_economics';
  if (path.startsWith('/admin/finance') || path.startsWith('/admin/recover-billing') || path.startsWith('/admin/invoices')) return 'billing';
  if (path.startsWith('/admin/maintenance') || path.startsWith('/admin/ecl-operations')) return 'maintenance';
  if (path.startsWith('/admin/developer')) return 'developer';
  if (path.startsWith('/admin/agents') || path.startsWith('/admin/automations')) return 'ai_workforce';
  if (path.startsWith('/admin/routing-intelligence')) return 'routing';
  if (path.startsWith('/admin/recommendations') || path.startsWith('/admin/benchmarks')) return 'product';
  if (path.startsWith('/admin/compliance') || path.startsWith('/admin/integrations') || path.startsWith('/admin/api-integrations')) return 'security_privacy';
  if (path.startsWith('/admin/documentation')) return 'documentation';
  return 'founder_os';
}

export default function AdminLayout() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const { lang, setLang } = useTranslation();
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [pendingQuestions, setPendingQuestions] = useState(0);
  const [newWaitlist, setNewWaitlist] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const [quickCommand, setQuickCommand] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const syncedPreferenceFor = useRef("");
  const copy = (key, params) => adminLayoutText(lang, key, params);

  useEffect(() => {
    const query = quickCommand.trim();
    if (query.length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      base44.functions.invoke("adminSummaries", { action: "global_search", query }).then(response => {
        const data = response?.data || response || {};
        setSearchResults(data.results || []);
      }).catch(() => setSearchResults([])).finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [quickCommand]);

  useEffect(() => {
    if (isAuthenticated) {
      base44.auth.me().then(u => { setUser(u); setLoadingUser(false); });
    } else if (!isLoadingAuth) {
      setLoadingUser(false);
    }
  }, [isAuthenticated, isLoadingAuth]);

  // Apply the canonical Admin preference once per signed-in identity. This is
  // intentionally non-blocking: a Settings read failure must never strand the
  // shell, and the ref prevents a setLang/localStorage update from reloading it.
  useEffect(() => {
    if (user?.role !== "admin") return;
    const identity = String(user.id || user.email || "admin");
    if (syncedPreferenceFor.current === identity) return;
    syncedPreferenceFor.current = identity;
    base44.functions.invoke("getFounderControlCenter", { view: "settings", section: "language_region" })
      .then((response) => {
        const envelope = response?.data || response || {};
        const settings = envelope?.data || envelope;
        const preferred = String(settings?.current?.language || "").toLowerCase();
        if (["en", "fr", "es"].includes(preferred) && preferred !== lang) setLang(preferred);
      })
      .catch(() => {});
  }, [user, lang, setLang]);

  // Poll pending approvals count for sidebar badge (admin-only context)
  useEffect(() => {
    if (user?.role !== "admin") return;
    let cancelled = false;
    const loadCount = async () => {
      try {
        const [approvals, questions, waitlistRes] = await Promise.all([
          base44.entities.Approval.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
          base44.entities.AgentQuestion.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
          base44.functions.invoke("getWaitlistLeads", {}).catch(() => null),
        ]);
        if (!cancelled) {
          setPendingApprovals(Array.isArray(approvals) ? approvals.length : 0);
          setPendingQuestions(Array.isArray(questions) ? questions.length : 0);
          const wPayload = waitlistRes?.data || waitlistRes;
          setNewWaitlist(Number(wPayload?.fresh_24h) || 0);
        }
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
          <h1 className="text-lg font-bold mb-2">{copy("sign_in_required")}</h1>
          <p className="text-sm text-muted-foreground mb-4">{copy("sign_in_help")}</p>
          <a
            href="/auth/start"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-foreground text-background text-sm font-bold"
          >
            {copy("sign_in")}
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
          <h1 className="text-xl font-bold mb-2">{copy("admin_access_required")}</h1>
          <p className="text-muted-foreground text-sm mb-6">{copy("account_role", { role: user?.role || "user" })}</p>
          <Link to="/Dashboard" className="text-sm font-semibold underline">{copy("back_dashboard")}</Link>
        </div>
      </div>
    );
  }

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — glass, matches landing */}
      <aside className={`fixed inset-y-0 left-0 z-[70] w-56 glass-panel border-r border-white/[0.06] flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="px-5 py-5 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black tracking-tight text-foreground">CAMBRA</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tracking-[0.18em] uppercase">{copy("admin_live")}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }}
              aria-label={copy("close_menu")}
              className="lg:hidden text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors"
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {GROUPED_NAV.filter((item) => !item.advanced).map((item, index, visible) => {
            const active = isActive(item.path, item.exact);
            const group = navGroup(item.path);
            const startsGroup = index === 0 || navGroup(visible[index - 1].path) !== group;
            return (
              <Fragment key={item.path}>
              {startsGroup && <p className={`${index ? "mt-5" : ""} px-3 pb-1 text-[9px] font-black uppercase tracking-[.18em] text-muted-foreground/65`}>{copy(`group.${group}`)}</p>}
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
                <span className="flex-1">{copy(`nav.${item.label}`)}</span>
                {item.showPendingBadge && pendingApprovals > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-black tabular-nums ${
                    active ? "bg-background text-foreground" : "bg-rose-600 text-white"
                  }`}>
                    {pendingApprovals > 99 ? "99+" : pendingApprovals}
                  </span>
                )}
                {item.showQuestionsBadge && pendingQuestions > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-black tabular-nums ${
                    active ? "bg-background text-foreground" : "bg-amber-500 text-white"
                  }`}>
                    {pendingQuestions > 99 ? "99+" : pendingQuestions}
                  </span>
                )}
                {item.showWaitlistBadge && newWaitlist > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-black tabular-nums ${
                    active ? "bg-background text-foreground" : "bg-cyan-500 text-white"
                  }`}>
                    {newWaitlist > 99 ? "99+" : newWaitlist}
                  </span>
                )}
              </Link>
              </Fragment>
            );
          })}

          {/* DASHBOARD-C14: Advanced System. The eleven registry-declared children render here,
              nested and collapsed, instead of as eleven top-level entries. Excluding them from
              the list above without rendering them here would have made eleven routes
              unreachable — the orphaning C13 refused to do. */}
          <details data-testid="advanced-system" className="mt-5">
            <summary className="px-3 pb-1 text-[9px] font-black uppercase tracking-[.18em] text-muted-foreground/65 cursor-pointer">
              {copy("group.SYSTEM")} · {ADVANCED_NAV.length}
            </summary>
            <div className="pl-2 border-l border-border/40 ml-3 mt-1">
              {ADVANCED_NAV.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive(item.path, item.exact)
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <item.icon size={12} />
                  <span className="flex-1">{copy(`nav.${item.label}`)}</span>
                </Link>
              ))}
            </div>
          </details>
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
            <LogOut size={13} /> {copy("sign_out")}
          </button>
          <Link to="/Dashboard" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <ChevronRight size={13} /> {copy("back_to_app")}
          </Link>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-[60] bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main — transparent, inherits body gradient */}
      <div className="flex-1 lg:ml-56 min-h-screen flex flex-col">
        {/* Top bar — glass */}
        <header className="sticky top-0 z-20 h-12 glass-panel border-b border-white/[0.06] flex items-center px-5 gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
            aria-label={copy("open_menu")}
            className="lg:hidden text-muted-foreground hover:text-foreground p-2 -ml-2 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            <Menu size={20} />
          </button>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            {location.pathname.split("/").filter(Boolean).map((seg, i, arr) => {
              const partialPath = `/${arr.slice(0, i + 1).join("/")}`;
              const item = NAV.find((entry) => entry.path === partialPath);
              const label = i === 0 ? copy("admin") : item ? copy(`nav.${item.label}`) : seg;
              return <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={10} />}
                <span className={i === arr.length - 1 ? "text-foreground font-semibold" : ""}>{label}</span>
              </span>;
            })}
          </div>
          <div className="ml-auto flex items-center gap-2 min-w-0">
            <form onSubmit={(e)=>{e.preventDefault();const q=quickCommand.trim();if(searchResults[0]){navigate(searchResults[0].route);setQuickCommand("");setSearchResults([])}else if(q){navigate(`/admin/chat?ask=${encodeURIComponent(q)}`);setQuickCommand("")}}} className="relative hidden md:flex items-center h-8 min-w-[220px] lg:min-w-[340px] rounded-lg border border-border/60 bg-background/50 px-2">
              <Search size={12} className="text-muted-foreground shrink-0"/>
              <input value={quickCommand} onChange={e=>setQuickCommand(e.target.value)} placeholder={copy("search_or_ask")} aria-label={copy("search_or_ask")} className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"/>
              <span className="text-[9px] text-muted-foreground">↵</span>
              {quickCommand.trim().length >= 2 && <div className="absolute z-50 top-10 left-0 right-0 max-h-80 overflow-auto rounded-xl border border-white/10 bg-slate-950/95 shadow-2xl p-2 backdrop-blur-xl">{searching ? <p className="p-3 text-xs text-muted-foreground">{copy("searching")}</p> : searchResults.length ? searchResults.map(result => <button type="button" key={`${result.entity}:${result.id}`} onClick={() => { navigate(result.route); setQuickCommand(""); setSearchResults([]); }} className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/5"><span className="block text-xs font-bold truncate">{result.title}</span><span className="block text-[10px] text-muted-foreground truncate">{result.type} · {result.subtitle || result.status || result.id}</span></button>) : <p className="p-3 text-xs text-muted-foreground">{copy("no_matches")}</p>}</div>}
            </form>
            <button onClick={()=>navigate('/admin/chat')} className="md:hidden h-8 w-8 rounded-lg border border-border/60 inline-flex items-center justify-center" aria-label={copy("ask_cambra")}><MessageSquare size={13}/></button>
            <LanguageSwitcher variant="light" className="hidden sm:inline-flex" />
            <Link to={`/admin/documentation?topic=${documentationTopic(location.pathname)}`} className="hidden lg:inline-flex h-8 px-3 rounded-lg border border-border/60 text-[11px] font-bold items-center gap-1.5 hover:bg-secondary"><HelpCircle size={12}/>{copy("how_it_works")}</Link>
            <a
              href="/Dashboard"
              className="h-8 px-3 rounded-lg border border-border/60 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
            >
              {copy("back_to_app")}
            </a>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border/60 font-semibold">{copy("admin")}</span>
          </div>
        </header>

        <main className="relative flex-1">
          <div className="relative p-6 max-w-[1400px] mx-auto w-full text-foreground">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
