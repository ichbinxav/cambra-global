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
        className="group relative border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-foreground/40 bg-white transition-all cursor-pointer"
        onClick={() => ref.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      >
        {uploading ? (
          <div className="space-y-3">
            <div className="w-9 h-9 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden max-w-[200px] mx-auto">
              <div className="h-full bg-foreground transition-all duration-200 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto bg-secondary border border-border/60">
              <Upload size={24} className="text-foreground" />
            </div>
            <div>
              <p className="text-base font-black mb-1.5 tracking-tight text-foreground">
                Drop your files here, or click to upload
              </p>
              <p className="text-[11px] text-muted-foreground">PDF, Excel, CSV, images · Max 20MB</p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 mt-3">
              {["Stripe statement", "Shopify export", "Carrier invoice", "SaaS billing"].map(t => (
                <span key={t} className="text-[10px] px-2.5 py-1 rounded-full border border-border/60 bg-white text-muted-foreground">{t}</span>
              ))}
            </div>
          </div>
        )}
        <input ref={ref} type="file" className="hidden" accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg" onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/60 bg-white">
              <CheckCircle2 size={14} className="text-foreground shrink-0" />
              <span className="text-sm flex-1 truncate font-medium text-foreground">
                {f.name}
                {f.analysis?.detected && (
                  <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full border border-border/60 bg-secondary text-muted-foreground">
                    Procesado: {f.analysis.detected}
                  </span>
                )}
              </span>
              <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-foreground transition-colors">
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
    <div className="relative min-h-screen bg-white font-inter flex flex-col">
      <Navbar />

      <div className="relative flex-1 max-w-3xl mx-auto w-full px-5 pt-20 pb-12 space-y-6 mt-14">

        {/* ── HERO — light blue gradient ── */}
         <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-blue-50 to-cyan-50/40 p-7 sm:p-10">
          <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-border/60 bg-white/60">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-foreground opacity-30" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
              </span>
              <Plug size={10} className="text-muted-foreground" />
              <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">{hero.eyebrow}</span>
            </div>
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.92] mb-3 text-foreground">
            {hero.title}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
            {hero.subtitle}
          </p>
        </div>

        {/* ── STATS BAR — navy gradient ── */}
         <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-cambra-navy">
           <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10">
            {hero.stats.map((s, i) => (
              <div key={i} className="px-5 py-5 text-center">
                <p className="font-display text-2xl sm:text-3xl font-black tracking-tight leading-none mb-1.5 text-white">
                  {s.value}
                </p>
                <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/60">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Mode switcher — navy cards */}
         <div className="grid grid-cols-3 gap-3">
           {MODES.map(m => {
             const active = activeMode === m.id;
             return (
               <button
                 key={m.id}
                 onClick={() => setActiveMode(m.id)}
                 className={`group relative p-5 rounded-2xl border text-left transition-all duration-200 ${active ? "border-cambra-navy bg-cambra-navy text-white" : "border-cambra-navy/30 bg-cambra-navy/10 hover:border-cambra-navy/50 text-cambra-navy hover:-translate-y-0.5"}`}
               >
                <div className="relative">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${active ? "bg-white/10" : "bg-white/20"}`}>
                    <m.icon size={16} className={active ? "text-white" : "text-cambra-navy/70"} />
                  </div>
                  <p className={`text-xs font-bold mb-0.5 ${active ? "text-white" : "text-cambra-navy"}`}>{m.label}</p>
                  <p className={`text-[10px] ${active ? "text-white/60" : "text-cambra-navy/60"}`}>{m.sub}</p>
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

            {/* Search + filters — light theme */}
            <div className="flex gap-2 flex-col sm:flex-row">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search integrations..."
                  className="pl-9 h-11 text-sm bg-white border-border/60"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={`h-11 px-3.5 rounded-xl border text-xs font-medium transition-all whitespace-nowrap ${cat === c ? "border-foreground bg-foreground text-background" : "border-border/60 bg-white text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Connected summary */}
            {connectedTools.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-secondary border border-border/60">
                <span className="text-[11px] text-muted-foreground font-medium">Connected:</span>
                {connectedTools.map(t => (
                  <span key={t} className="flex items-center gap-1 text-[11px] bg-white border border-border/60 rounded-full px-2.5 py-1 font-semibold text-foreground">
                    {t}
                    <button onClick={() => toggleConnect(t)} className="text-muted-foreground hover:text-foreground ml-0.5">
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
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-dashed border-border hover:border-foreground/40 bg-white transition-all text-left group"
                >
                  <div className="w-11 h-11 rounded-xl border-2 border-dashed border-border flex items-center justify-center shrink-0 group-hover:border-foreground/40 transition-colors">
                    <span className="text-muted-foreground text-xl leading-none group-hover:text-foreground transition-colors">+</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Connect another tool</p>
                    <p className="text-[11px] text-muted-foreground">Request integration or upload files</p>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground ml-auto shrink-0 group-hover:text-foreground transition-colors" />
                </button>
              ) : (
                <div className="p-4 rounded-2xl border border-border/60 bg-white space-y-3">
                  <p className="text-sm font-semibold text-foreground">Which tool do you use?</p>
                  <Input
                    value={customTool}
                    onChange={e => setCustomTool(e.target.value)}
                    placeholder="Search or enter your provider name"
                    className="h-11 text-sm bg-white border-border/60"
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground">We'll add it to our roadmap. In the meantime, use the upload option below.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveMode('upload')}
                      className="h-9 px-4 rounded-full border border-border/60 text-xs font-medium text-foreground hover:border-foreground/40 transition-colors flex items-center gap-1.5"
                    >
                      <Upload size={12} /> Upload files instead
                    </button>
                    <button onClick={() => setShowCustom(false)} className="h-9 px-4 rounded-full text-xs text-muted-foreground hover:text-foreground transition-colors">
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
            <div className="relative p-5 rounded-2xl bg-white border border-border/60">
              <p className="text-xs font-bold mb-3 text-foreground tracking-wide uppercase text-[10px]">What we extract from your files</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                {[
                  "Payment effective rates", "Monthly fee volumes",
                  "Carrier cost-per-shipment", "SaaS subscription totals",
                  "Provider names & plans", "Hidden fee patterns",
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="w-1 h-1 rounded-full bg-foreground shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <span>🔒 Encrypted</span>
              <span>👁 Read-only access</span>
              <span>🚫 Never shared</span>
            </div>

            {/* Upsell to Connect for higher accuracy */}
            <button
              onClick={() => setActiveMode('connect')}
              className="w-full group relative rounded-2xl border border-border/60 bg-white p-5 flex items-center gap-4 text-left transition-all hover:border-foreground/40"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-secondary border border-border/60">
                <Plug size={18} className="text-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground mb-0.5">Boost accuracy to 99%</p>
                <p className="text-[11px] text-muted-foreground">Connect your tools for live rates and volumes — no manual work.</p>
              </div>
              <ArrowRight size={16} className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        )}

        {/* MODE: Manual — light theme */}
        {activeMode === "manual" && (
          <div className="space-y-4">
            <div className="p-8 rounded-2xl border border-border/60 bg-white text-center space-y-4">
              <div className="text-5xl select-none mb-3 text-foreground">✱</div>
              <p className="font-display font-black text-2xl mb-2 tracking-[-0.03em] text-foreground">
                Use the structured Analyzer
              </p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed mb-5">
                The Analyzer guides you through structured inputs for revenue, payments, shipping, and SaaS — step by step.
              </p>
              <Link to="/Analyzer">
                <Button className="h-11 rounded-full px-7 text-sm font-bold gap-2 bg-foreground text-background hover:opacity-90">
                  Open Analyzer <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Manual inputs will be marked as estimated — you can connect tools later from your dashboard to refine your analysis.
            </p>

            {/* Upsell to Connect for higher accuracy */}
            <button
              onClick={() => setActiveMode('connect')}
              className="w-full group relative rounded-2xl border border-border/60 bg-white p-5 flex items-center gap-4 text-left transition-all hover:border-foreground/40"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-secondary border border-border/60">
                <Plug size={18} className="text-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground mb-0.5">Connect tools for 99% accuracy</p>
                <p className="text-[11px] text-muted-foreground">Skip the typing — we pull real rates and volumes automatically.</p>
              </div>
              <ArrowRight size={16} className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        )}

        {/* Footer CTA — light theme */}
        {(activeMode === "connect" || activeMode === "upload") && (
          <div className="flex items-center justify-between pt-5 border-t border-border/60">
            <p className="text-xs text-muted-foreground">
              {connectedTools.length > 0 || uploadedFiles.length > 0
                ? `${connectedTools.length + uploadedFiles.length} source${connectedTools.length + uploadedFiles.length > 1 ? "s" : ""} added`
                : "No sources connected yet"}
            </p>
            <Button
              onClick={() => navigate("/Analyzer")}
              className={`h-10 rounded-full px-7 text-sm font-bold gap-2 ${hasData ? "bg-foreground text-background hover:opacity-90" : "border border-border/60 bg-white text-foreground hover:border-foreground/40"}`}
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