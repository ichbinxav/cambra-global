import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, ArrowLeft, Upload, Pencil, CheckCircle2, X, ArrowRight,
  Plug, ExternalLink, Zap, ChevronRight
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import ConnectorTile from "@/components/connect/ConnectorTile.jsx";
import { CONNECTORS as CONNECTOR_IDS } from "@/lib/connectors.config.js";
import Navbar from "@/components/landing/Navbar";
import ConnectStatsBar from "@/components/connect/ConnectStatsBar.jsx";
import DarkConnectorCard from "@/components/connect/DarkConnectorCard.jsx";

const CATEGORIES = ["All", "Payments", "Commerce", "Accounting", "Shipping", "SaaS"];

const CONNECTORS = [
  { name: "Stripe", cat: "Payments", color: "#635BFF", desc: "Payment processing fees & rates", status: "live" },
  { name: "Shopify", cat: "Commerce", color: "#96BF48", desc: "GMV, orders, and app spend", status: "live" },
  { name: "Adyen", cat: "Payments", color: "#0ABF53", desc: "Enterprise payment rates & volume", status: "live" },
  { name: "QuickBooks", cat: "Accounting", color: "#2CA01C", desc: "P&L, costs, and vendor spend", status: "live" },
  { name: "Xero", cat: "Accounting", color: "#13B5EA", desc: "Financial data & cost breakdown", status: "live" },
  { name: "Pennylane", cat: "Accounting", color: "#6C3CE1", desc: "French accounting & expense data", status: "live" },
  { name: "Holded", cat: "Accounting", color: "#0052CC", desc: "Spanish ERP & accounting", status: "live" },
  { name: "DHL", cat: "Shipping", color: "#FFCC00", desc: "Shipping rates & volume data", status: "live" },
  { name: "UPS", cat: "Shipping", color: "#351C15", desc: "Carrier contracts & shipment data", status: "live" },
  { name: "Sendcloud", cat: "Shipping", color: "#0066FF", desc: "Multi-carrier shipping platform", status: "live" },
  { name: "Klaviyo", cat: "SaaS", color: "#000000", desc: "Email & SMS marketing spend", status: "live" },
  { name: "Gorgias", cat: "SaaS", color: "#FF4F00", desc: "Customer support costs", status: "live" },
  { name: "Mollie", cat: "Payments", color: "#FF4444", desc: "European payment processing", status: "live" },
  { name: "PayPal", cat: "Payments", color: "#003087", desc: "Checkout & payment fees", status: "live" },
  { name: "FedEx", cat: "Shipping", color: "#FF6600", desc: "Express & freight shipping", status: "live" },
  { name: "DPD", cat: "Shipping", color: "#DC1E35", desc: "European parcel delivery", status: "live" },
  { name: "WooCommerce", cat: "Commerce", color: "#7F54B3", desc: "WordPress store revenue & costs", status: "soon" },
  { name: "Wix", cat: "Commerce", color: "#FAAD00", desc: "Wix store data & fees", status: "soon" },
  { name: "Sage", cat: "Accounting", color: "#00DC00", desc: "Accounting & ERP data", status: "soon" },
  { name: "Zendesk", cat: "SaaS", color: "#03363D", desc: "Support platform costs", status: "soon" },
  { name: "Colissimo", cat: "Shipping", color: "#FFCD00", desc: "French postal service", status: "soon" },
  { name: "PostNL", cat: "Shipping", color: "#FF6200", desc: "Dutch & Belgian carrier", status: "soon" },
];

function ConnectorAvatar({ name, color, size = "md" }) {
  const s = size === "lg" ? "w-12 h-12 text-sm" : "w-10 h-10 text-[11px]";
  return (
    <div
      className={`${s} rounded-xl flex items-center justify-center font-black shrink-0`}
      style={{ background: color + "18", border: `1px solid ${color}30` }}
    >
      <span style={{ color }}>{name.slice(0, 2).toUpperCase()}</span>
    </div>
  );
}

function UploadZone({ onUpload, uploadedFiles, onRemove }) {
  const ref = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handle = async (file) => {
    setUploading(true);
    setProgress(0);
    const interval = setInterval(() => setProgress(p => Math.min(p + 20, 90)), 180);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    let analysis = null;
    try {
      const res = await base44.functions.invoke('processUploadedFile', { file_url, file_name: file.name });
      analysis = res?.data || null;
    } catch (_) {}
    clearInterval(interval);
    setProgress(100);
    setUploading(false);
    onUpload({ name: file.name, url: file_url, analysis });
  };

  return (
    <div className="space-y-3">
      <div
        className="group relative border-2 border-dashed border-white/[0.1] rounded-2xl p-10 text-center hover:border-white/25 bg-[#0b0d14] transition-all cursor-pointer overflow-hidden"
        onClick={() => ref.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl opacity-30 group-hover:opacity-60 transition-opacity duration-300" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.5), transparent)" }} />
        <div className="pointer-events-none absolute -bottom-16 right-0 w-56 h-56 rounded-full blur-3xl opacity-25 group-hover:opacity-50 transition-opacity duration-300" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.4), transparent)" }} />

        {uploading ? (
          <div className="relative space-y-3">
            <div className="w-9 h-9 rounded-full border-2 border-white/20 border-t-white animate-spin mx-auto" />
            <p className="text-sm text-white/60">Uploading...</p>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden max-w-[200px] mx-auto">
              <div className="h-full transition-all duration-200 rounded-full" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #1F4ED8, #2CA7C1)" }} />
            </div>
          </div>
        ) : (
          <div className="relative space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-[0_0_32px_rgba(44,167,193,0.3)]"
                 style={{ background: "linear-gradient(135deg, rgba(31,78,216,0.25), rgba(44,167,193,0.25))", border: "1px solid rgba(44,167,193,0.35)" }}>
              <Upload size={24} className="text-white/80" />
            </div>
            <div>
              <p className="text-base font-black mb-1.5 tracking-tight"
                 style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Drop your files here, or click to upload
              </p>
              <p className="text-[11px] text-white/35">PDF, Excel, CSV, images · Max 20MB</p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 mt-3">
              {["Stripe statement", "Shopify export", "Carrier invoice", "SaaS billing"].map(t => (
                <span key={t} className="text-[10px] px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-white/40">{t}</span>
              ))}
            </div>
          </div>
        )}
        <input ref={ref} type="file" className="hidden" accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg" onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.04]">
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              <span className="text-sm flex-1 truncate font-medium text-white/85">
                {f.name}
                {f.analysis?.detected && (
                  <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-white/50">
                    Procesado: {f.analysis.detected}
                  </span>
                )}
              </span>
              <button onClick={() => onRemove(i)} className="text-white/25 hover:text-white/60 transition-colors">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConnectTools() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [activeMode, setActiveMode] = useState("connect");
  const [connectedTools, setConnectedTools] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [customTool, setCustomTool] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const navigate = useNavigate();

  // Set initial mode from URL (?mode=connect|upload|manual)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const m = urlParams.get('mode');
    if (m && ['connect','upload','manual'].includes(m)) setActiveMode(m);
  }, []);

  const filtered = CONNECTORS.filter(c => {
    const matchCat = cat === "All" || c.cat === cat;
    const matchQ = c.name.toLowerCase().includes(query.toLowerCase()) || c.cat.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQ;
  });

  const toggleConnect = (name) => {
    setConnectedTools(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const removeFile = (i) => setUploadedFiles(f => f.filter((_, idx) => idx !== i));

  const hasData = connectedTools.length > 0 || uploadedFiles.length > 0 || customTool.trim().length > 0;

  const MODES = [
    { id: "connect", icon: Plug, label: "Connect tools", sub: "Most accurate" },
    { id: "upload", icon: Upload, label: "Upload files", sub: "Flexible" },
    { id: "manual", icon: Pencil, label: "Enter manually", sub: "Always available" },
  ];

  const HERO_CONFIG = {
    connect: {
      eyebrow: "Open integration system",
      title: "Connect your tools.",
      subtitle: "Direct integrations pull real rates and volumes — automatically. The most precise way to map your infrastructure.",
      accuracy: "99%",
      accuracyLabel: "Accuracy",
      stats: [
        { value: "99%", label: "Accuracy" },
        { value: "Real-time", label: "Data freshness" },
        { value: "22+", label: "Integrations" },
        { value: "OAuth", label: "Secure access" },
      ],
    },
    upload: {
      eyebrow: "AI-powered ingestion",
      title: "Upload your files.",
      subtitle: "Drop statements, invoices or exports — our AI extracts rates, volumes and costs in seconds. Great when direct integration isn't available.",
      accuracy: "92%",
      accuracyLabel: "Accuracy",
      stats: [
        { value: "92%", label: "Accuracy" },
        { value: "<30s", label: "Processing" },
        { value: "PDF/CSV/XLS", label: "Formats" },
        { value: "AI-extracted", label: "Method" },
      ],
    },
    manual: {
      eyebrow: "Fallback mode",
      title: "Enter manually.",
      subtitle: "Always available — answer a few questions and we'll generate an estimate. Connect tools later to refine your analysis.",
      accuracy: "~75%",
      accuracyLabel: "Estimate confidence",
      stats: [
        { value: "~75%", label: "Confidence" },
        { value: "5 min", label: "Setup time" },
        { value: "Guided", label: "Step-by-step" },
        { value: "Estimated", label: "Result quality" },
      ],
    },
  };
  const hero = HERO_CONFIG[activeMode];

  return (
    <div className="relative min-h-screen bg-[#04060C] font-inter flex flex-col overflow-hidden">
      <Navbar />
      {/* Ambient backdrop — dark page */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="absolute -top-32 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.25), transparent 60%)" }} />
        <div className="absolute top-1/3 -right-32 w-[34rem] h-[34rem] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.2), transparent 60%)" }} />
        <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.15), transparent 60%)" }} />
      </div>

      <div className="relative flex-1 max-w-3xl mx-auto w-full px-5 py-8 space-y-6 mt-16">

        {/* ── PREMIUM DARK HERO — dynamic per mode ── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#06080F] text-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 -left-32 w-[34rem] h-[34rem] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.55), transparent 60%)" }} />
            <div className="absolute -bottom-32 -right-20 w-[32rem] h-[32rem] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.45), transparent 60%)" }} />
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)" }} />
          </div>
          <div className="relative p-7 sm:p-10">
            <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              </span>
              <Plug size={10} className="text-white/60" />
              <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">{hero.eyebrow}</span>
            </div>
            <h1 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.92] mb-3">
              <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 45%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 22px rgba(44,167,193,0.35))" }}>
                {hero.title}
              </span>
            </h1>
            <p className="text-sm text-white/55 leading-relaxed max-w-lg">
              {hero.subtitle}
            </p>
          </div>
        </div>

        {/* ── DYNAMIC STATS BAR — accuracy per mode ── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#06080F]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-20 left-1/4 w-64 h-64 rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.4), transparent 60%)" }} />
            <div className="absolute -bottom-16 right-1/4 w-56 h-56 rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.35), transparent 60%)" }} />
            <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
          </div>
          <div className="relative grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.06]">
            {hero.stats.map((s, i) => (
              <div key={i} className="px-5 py-5 text-center">
                <p className="font-display text-2xl sm:text-3xl font-black tracking-tight leading-none mb-1.5"
                   style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 45%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 18px rgba(44,167,193,0.3))" }}>
                  {s.value}
                </p>
                <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/35">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Mode switcher — dark gradient cards */}
        <div className="grid grid-cols-3 gap-3">
          {MODES.map(m => {
            const active = activeMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setActiveMode(m.id)}
                className={`group relative p-5 rounded-2xl border text-left transition-all duration-200 overflow-hidden ${active ? "border-white/20 text-white shadow-[0_18px_48px_-16px_rgba(31,78,216,0.4)]" : "border-white/[0.08] bg-[#0b0d14] hover:border-white/[0.16] text-white/80 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.4)]"}`}
                style={active ? { background: "linear-gradient(135deg, #0A1024, #1F4ED8 65%, #2CA7C1)" } : {}}
              >
                {active && (
                  <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
                )}
                {!active && (
                  <div className="pointer-events-none absolute -top-14 -right-14 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-50 transition-opacity duration-300" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.4), transparent)" }} />
                )}
                <div className="relative">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${active ? "bg-white/10" : "bg-white/[0.04] border border-white/[0.06]"}`}>
                    <m.icon size={16} className={active ? "text-white/80" : "text-white/30"} />
                  </div>
                  <p className={`text-xs font-bold mb-0.5 ${active ? "text-white" : "text-white/70"}`}>{m.label}</p>
                  <p className={`text-[10px] ${active ? "text-white/50" : "text-white/30"}`}>{m.sub}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* MODE: Connect */}
        {activeMode === "connect" && (
          <div className="space-y-4">
            {/* Direct connections (OAuth) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ConnectorTile
                title="Google Drive"
                note="Read-only access to files for Analyzer"
                connectorId={CONNECTOR_IDS.drive}
                functionName="driveConnectionCheck"
                connectorKey="drive"
              />
              <ConnectorTile
                title="Google Sheets"
                note="Read-only access to spreadsheets"
                connectorId={CONNECTOR_IDS.sheets}
                functionName="sheetsConnectionCheck"
                connectorKey="sheets"
              />
              <ConnectorTile
                title="Gmail"
                note="Read-only labels/messages for ingestion"
                connectorId={CONNECTOR_IDS.gmail}
                functionName="gmailConnectionCheck"
                connectorKey="gmail"
              />
              <ConnectorTile
                title="Slack"
                note="Read-only to list basic channels (optional)"
                connectorId={CONNECTOR_IDS.slack}
                functionName="slackConnectionCheck"
                connectorKey="slack"
              />
            </div>

            {/* Search + filters — dark theme */}
            <div className="flex gap-2 flex-col sm:flex-row">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search integrations..."
                  className="pl-9 h-11 text-sm bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/25 focus-visible:ring-white/20"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={`h-11 px-3.5 rounded-xl border text-xs font-medium transition-all whitespace-nowrap ${cat === c ? "border-white/30 bg-white text-black" : "border-white/[0.08] text-white/40 hover:border-white/20 hover:text-white/70"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Connected summary */}
            {connectedTools.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[11px] text-white/35 font-medium">Connected:</span>
                {connectedTools.map(t => (
                  <span key={t} className="flex items-center gap-1 text-[11px] bg-white/[0.06] border border-white/[0.1] rounded-full px-2.5 py-1 font-semibold text-white/80">
                    {t}
                    <button onClick={() => toggleConnect(t)} className="text-white/20 hover:text-white/50 ml-0.5">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Connector list — dark gradient cards */}
            <div className="space-y-2">
              {filtered.map((c, i) => (
                <DarkConnectorCard
                  key={i}
                  connector={c}
                  connected={connectedTools.includes(c.name)}
                  onToggle={toggleConnect}
                />
              ))}

              {/* Generic connector */}
              {!showCustom ? (
                <button
                  onClick={() => setShowCustom(true)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-dashed border-white/[0.1] hover:border-white/25 bg-white/[0.02] transition-all text-left group"
                >
                  <div className="w-11 h-11 rounded-xl border-2 border-dashed border-white/15 flex items-center justify-center shrink-0 group-hover:border-white/30 transition-colors">
                    <span className="text-white/30 text-xl leading-none group-hover:text-white/60 transition-colors">+</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white/60">Connect another tool</p>
                    <p className="text-[11px] text-white/30">Request integration or upload files</p>
                  </div>
                  <ChevronRight size={14} className="text-white/20 ml-auto shrink-0 group-hover:text-white/50 transition-colors" />
                </button>
              ) : (
                <div className="p-4 rounded-2xl border border-white/[0.08] bg-[#0b0d14] space-y-3">
                  <p className="text-sm font-semibold text-white/90">Which tool do you use?</p>
                  <Input
                    value={customTool}
                    onChange={e => setCustomTool(e.target.value)}
                    placeholder="Search or enter your provider name"
                    className="h-11 text-sm bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/25 focus-visible:ring-white/20"
                    autoFocus
                  />
                  <p className="text-[11px] text-white/30">We'll add it to our roadmap. In the meantime, use the upload option below.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveMode('upload')}
                      className="h-9 px-4 rounded-full border border-white/15 text-xs font-medium text-white/60 hover:text-white hover:border-white/30 transition-colors flex items-center gap-1.5"
                    >
                      <Upload size={12} /> Upload files instead
                    </button>
                    <button onClick={() => setShowCustom(false)} className="h-9 px-4 rounded-full text-xs text-white/40 hover:text-white/70 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODE: Upload — dark theme */}
        {activeMode === "upload" && (
          <div className="space-y-4">
            <UploadZone
              onUpload={f => setUploadedFiles(prev => [...prev, f])}
              uploadedFiles={uploadedFiles}
              onRemove={removeFile}
            />
            <div className="relative p-5 rounded-2xl bg-[#0b0d14] border border-white/[0.08] overflow-hidden">
              <div className="pointer-events-none absolute -top-16 -right-12 w-40 h-40 rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.3), transparent 60%)" }} />
              <p className="relative text-xs font-bold mb-3 text-white/80 tracking-wide uppercase text-[10px]">What we extract from your files</p>
              <div className="relative grid grid-cols-2 gap-y-2 gap-x-4">
                {[
                  "Payment effective rates", "Monthly fee volumes",
                  "Carrier cost-per-shipment", "SaaS subscription totals",
                  "Provider names & plans", "Hidden fee patterns",
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 text-[11px] text-white/55">
                    <span className="w-1 h-1 rounded-full bg-cambra-mint shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 text-[10px] text-white/30">
              <span>🔒 Encrypted</span>
              <span>👁 Read-only access</span>
              <span>🚫 Never shared</span>
            </div>

            {/* Upsell to Connect for higher accuracy */}
            <button
              onClick={() => setActiveMode('connect')}
              className="w-full group relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#0A1024] via-[#1F4ED8]/30 to-[#2CA7C1]/30 p-5 flex items-center gap-4 text-left transition-all hover:border-white/30 hover:shadow-[0_18px_48px_-16px_rgba(31,78,216,0.4)]"
            >
              <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.4), transparent 60%)" }} />
              <div className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, rgba(31,78,216,0.4), rgba(44,167,193,0.4))", border: "1px solid rgba(255,255,255,0.15)" }}>
                <Plug size={18} className="text-white" />
              </div>
              <div className="relative flex-1">
                <p className="text-sm font-bold text-white mb-0.5">Boost accuracy to <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>99%</span></p>
                <p className="text-[11px] text-white/55">Connect your tools for live rates and volumes — no manual work.</p>
              </div>
              <ArrowRight size={16} className="relative text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        )}

        {/* MODE: Manual — dark theme */}
        {activeMode === "manual" && (
          <div className="space-y-4">
            <div className="relative p-8 rounded-2xl border border-white/[0.08] bg-[#0b0d14] text-center space-y-4 overflow-hidden">
              <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.3), transparent 60%)" }} />
              <div className="pointer-events-none absolute -bottom-16 right-0 w-48 h-48 rounded-full blur-3xl opacity-30" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.35), transparent 60%)" }} />
              <div className="relative">
                <div className="text-5xl select-none mb-3"
                     style={{ background: "linear-gradient(135deg, #ffffff 0%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>✱</div>
                <p className="font-display font-black text-2xl mb-2 tracking-[-0.03em]"
                   style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  Use the structured Analyzer
                </p>
                <p className="text-sm text-white/50 max-w-xs mx-auto leading-relaxed mb-5">
                  The Analyzer guides you through structured inputs for revenue, payments, shipping, and SaaS — step by step.
                </p>
                <Link to="/Analyzer">
                  <Button className="h-11 rounded-full px-7 text-sm font-bold gap-2 bg-saas-gradient text-white hover:opacity-90 shadow-[0_0_32px_rgba(44,167,193,0.45)]">
                    Open Analyzer <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <p className="text-center text-[11px] text-white/30">
              Manual inputs will be marked as estimated — you can connect tools later from your dashboard to refine your analysis.
            </p>

            {/* Upsell to Connect for higher accuracy */}
            <button
              onClick={() => setActiveMode('connect')}
              className="w-full group relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#0A1024] via-[#1F4ED8]/30 to-[#2CA7C1]/30 p-5 flex items-center gap-4 text-left transition-all hover:border-white/30 hover:shadow-[0_18px_48px_-16px_rgba(31,78,216,0.4)]"
            >
              <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.4), transparent 60%)" }} />
              <div className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, rgba(31,78,216,0.4), rgba(44,167,193,0.4))", border: "1px solid rgba(255,255,255,0.15)" }}>
                <Plug size={18} className="text-white" />
              </div>
              <div className="relative flex-1">
                <p className="text-sm font-bold text-white mb-0.5">Connect tools for <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>99% accuracy</span></p>
                <p className="text-[11px] text-white/55">Skip the typing — we pull real rates and volumes automatically.</p>
              </div>
              <ArrowRight size={16} className="relative text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        )}

        {/* Footer CTA — dark theme */}
        {(activeMode === "connect" || activeMode === "upload") && (
          <div className="flex items-center justify-between pt-5 border-t border-white/[0.06]">
            <p className="text-xs text-white/35">
              {connectedTools.length > 0 || uploadedFiles.length > 0
                ? `${connectedTools.length + uploadedFiles.length} source${connectedTools.length + uploadedFiles.length > 1 ? "s" : ""} added`
                : "No sources connected yet"}
            </p>
            <Button
              onClick={() => navigate("/Analyzer")}
              className={`h-10 rounded-full px-7 text-sm font-bold gap-2 ${hasData ? "bg-saas-gradient text-white hover:opacity-90 shadow-[0_0_32px_rgba(44,167,193,0.45)]" : "border border-white/15 bg-white/[0.04] text-white/60 hover:text-white hover:border-white/30"}`}
            >
              {hasData ? "Run Analysis" : "Skip — enter manually"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}