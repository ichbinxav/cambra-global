import { useState, useRef } from "react";
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
    clearInterval(interval);
    setProgress(100);
    setUploading(false);
    onUpload({ name: file.name, url: file_url });
  };

  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed border-border/50 rounded-2xl p-8 text-center hover:border-foreground/20 transition-colors cursor-pointer"
        onClick={() => ref.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      >
        {uploading ? (
          <div className="space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden max-w-[180px] mx-auto">
              <div className="h-full bg-foreground transition-all duration-200 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto">
              <Upload size={20} className="text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-semibold mb-1">Drop your files here, or click to upload</p>
              <p className="text-[11px] text-muted-foreground/50">PDF, Excel, CSV, images · Max 20MB</p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 mt-2">
              {["Stripe statement", "Shopify export", "Carrier invoice", "SaaS billing"].map(t => (
                <span key={t} className="text-[10px] px-2.5 py-1 rounded-full bg-secondary text-muted-foreground/50">{t}</span>
              ))}
            </div>
          </div>
        )}
        <input ref={ref} type="file" className="hidden" accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg" onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-green-500/25 bg-green-500/[0.04]">
              <CheckCircle2 size={14} className="text-green-500 shrink-0" />
              <span className="text-sm flex-1 truncate font-medium">{f.name}</span>
              <button onClick={() => onRemove(i)} className="text-muted-foreground/30 hover:text-muted-foreground transition-colors">
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

  return (
    <div className="min-h-screen bg-background font-inter flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 border-b border-border/40 bg-background/98 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link to="/Analyzer" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <span className="text-sm font-black tracking-tight">THE NoDE</span>
          <span className="text-muted-foreground/30 text-sm">/</span>
          <span className="text-sm text-muted-foreground/60">Connect your tools</span>
        </div>
        {hasData && (
          <Button
            size="sm"
            onClick={() => navigate("/Analyzer")}
            className="h-9 rounded-full px-5 text-xs font-bold gap-1.5 shadow-sm"
          >
            Continue to Analyzer <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-5 py-8 space-y-8">

        {/* Header */}
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-3">Open integration system</p>
          <h1 className="text-3xl font-black tracking-[-0.03em] mb-2">Connect your tools.</h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-lg">
            The more you connect, the more precise your infrastructure intelligence. Use direct integrations for best results — or upload files and enter data manually if needed.
          </p>
        </div>

        {/* Mode switcher */}
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setActiveMode(m.id)}
              className={`p-4 rounded-xl border text-left transition-all ${activeMode === m.id ? "border-foreground bg-foreground text-background" : "border-border/50 hover:border-foreground/30 bg-card"}`}
            >
              <m.icon size={15} className={`mb-2 ${activeMode === m.id ? "text-background/60" : "text-muted-foreground/40"}`} />
              <p className={`text-xs font-bold mb-0.5 ${activeMode === m.id ? "text-background" : ""}`}>{m.label}</p>
              <p className={`text-[10px] ${activeMode === m.id ? "text-background/40" : "text-muted-foreground/40"}`}>{m.sub}</p>
            </button>
          ))}
        </div>

        {/* MODE: Connect */}
        {activeMode === "connect" && (
          <div className="space-y-4">
            {/* Info strip */}
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-green-500/[0.05] border border-green-500/15 text-xs text-muted-foreground">
              <CheckCircle2 size={13} className="text-green-500 shrink-0" />
              Connect your tools for a more accurate analysis — we pull real rates and volumes automatically.
            </div>

            {/* Direct connections (OAuth) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ConnectorTile
                title="Google Drive"
                note="Read-only access to files for Analyzer"
                connectorId={CONNECTOR_IDS.drive}
                functionName="driveConnectionCheck"
              />
              <ConnectorTile
                title="Google Sheets"
                note="Read-only access to spreadsheets"
                connectorId={CONNECTOR_IDS.sheets}
                functionName="sheetsConnectionCheck"
              />
              <ConnectorTile
                title="Gmail"
                note="Read-only labels/messages for ingestion"
                connectorId={CONNECTOR_IDS.gmail}
                functionName="gmailConnectionCheck"
              />
              <ConnectorTile
                title="Slack"
                note="Read-only to list basic channels (optional)"
                connectorId={CONNECTOR_IDS.slack}
                functionName="slackConnectionCheck"
              />
            </div>

            {/* Search + filters */}
            <div className="flex gap-2 flex-col sm:flex-row">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search integrations..."
                  className="pl-9 h-11 text-sm border-border/60"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={`h-11 px-3.5 rounded-xl border text-xs font-medium transition-all whitespace-nowrap ${cat === c ? "border-foreground bg-foreground text-background" : "border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Connected summary */}
            {connectedTools.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-secondary/50">
                <span className="text-[11px] text-muted-foreground/50 font-medium">Connected:</span>
                {connectedTools.map(t => (
                  <span key={t} className="flex items-center gap-1 text-[11px] bg-background border border-border/50 rounded-full px-2.5 py-1 font-semibold">
                    {t}
                    <button onClick={() => toggleConnect(t)} className="text-muted-foreground/30 hover:text-muted-foreground ml-0.5">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Connector grid */}
            <div className="space-y-2">
              {filtered.map((c, i) => {
                const connected = connectedTools.includes(c.name);
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${connected ? "border-green-500/30 bg-green-500/[0.03]" : "border-border/50 bg-card hover:border-border"}`}
                  >
                    <ConnectorAvatar name={c.name} color={c.color} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold">{c.name}</p>
                        {c.status === "soon" && (
                          <span className="text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground/50 font-semibold">Soon</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/50 truncate">{c.desc}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/30 hidden sm:block">{c.cat}</span>
                    {connected ? (
                      <button
                        onClick={() => toggleConnect(c.name)}
                        className="flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-green-500/30 bg-green-500/[0.08] text-green-600 text-xs font-semibold shrink-0 hover:bg-green-500/[0.15] transition-colors"
                      >
                        <CheckCircle2 size={11} /> Connected
                      </button>
                    ) : c.name === "Stripe" && c.status !== "soon" ? (
                      <Link to="/StripeAnalyzer">
                        <button
                          className="h-8 px-3.5 rounded-full border text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 border-[#635BFF]/40 text-[#635BFF] hover:bg-[#635BFF]/10"
                          style={{ borderColor: "#635BFF55" }}
                        >
                          <Plug size={11} /> Analyze
                        </button>
                      </Link>
                    ) : (
                      <button
                        onClick={() => c.status !== "soon" && toggleConnect(c.name)}
                        className={`h-8 px-3.5 rounded-full border text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${c.status === "soon" ? "border-border/30 text-muted-foreground/30 cursor-default" : "border-border/60 text-muted-foreground hover:border-foreground hover:text-foreground"}`}
                      >
                        {c.status === "soon" ? "Coming soon" : <><Plug size={11} /> Connect</>}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Generic connector */}
              {!showCustom ? (
                <button
                  onClick={() => setShowCustom(true)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-dashed border-border/50 hover:border-foreground/20 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl border-2 border-dashed border-border/50 flex items-center justify-center shrink-0">
                    <span className="text-muted-foreground/30 text-xl leading-none">+</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground/60">Connect another tool</p>
                    <p className="text-[11px] text-muted-foreground/35">Request integration or upload files</p>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground/25 ml-auto shrink-0" />
                </button>
              ) : (
                <div className="p-4 rounded-xl border border-border/50 bg-card space-y-3">
                  <p className="text-sm font-semibold">Which tool do you use?</p>
                  <Input
                    value={customTool}
                    onChange={e => setCustomTool(e.target.value)}
                    placeholder="Search or enter your provider name"
                    className="h-11 text-sm border-border/60"
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground/40">We'll add it to our roadmap. In the meantime, use the upload option below.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveMode("upload")}
                      className="h-9 px-4 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1.5"
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

        {/* MODE: Upload */}
        {activeMode === "upload" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-blue-500/[0.05] border border-blue-500/15 text-xs text-muted-foreground">
              <Upload size={13} className="text-blue-500 shrink-0" />
              Upload your files if your provider is not yet supported. We extract rates, volumes, and costs automatically using AI.
            </div>
            <UploadZone
              onUpload={f => setUploadedFiles(prev => [...prev, f])}
              uploadedFiles={uploadedFiles}
              onRemove={removeFile}
            />
            <div className="p-4 rounded-xl bg-secondary/40 border border-border/40">
              <p className="text-xs font-semibold mb-2">What we extract from your files</p>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
                {[
                  "Payment effective rates", "Monthly fee volumes",
                  "Carrier cost-per-shipment", "SaaS subscription totals",
                  "Provider names & plans", "Hidden fee patterns",
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                    <span className="w-1 h-1 rounded-full bg-border shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground/35">
              <span>🔒 Encrypted</span>
              <span>👁 Read-only access</span>
              <span>🚫 Never shared</span>
            </div>
          </div>
        )}

        {/* MODE: Manual */}
        {activeMode === "manual" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-orange-500/[0.05] border border-orange-500/15 text-xs text-muted-foreground">
              <Pencil size={13} className="text-orange-500 shrink-0" />
              Enter your details manually if needed — always available as a fallback. We'll generate an estimate based on your inputs.
            </div>
            <div className="p-6 rounded-2xl border border-border/50 bg-card text-center space-y-4">
              <div className="text-4xl select-none text-muted-foreground/10">✱</div>
              <div>
                <p className="font-bold text-base mb-1.5">Use the structured Analyzer</p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  The Analyzer guides you through structured inputs for revenue, payments, shipping, and SaaS — step by step.
                </p>
              </div>
              <Link to="/Analyzer">
                <Button className="h-11 rounded-full px-7 text-sm font-bold gap-2 shadow-sm mt-2">
                  Open Analyzer <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <p className="text-center text-[11px] text-muted-foreground/35">
              Manual inputs will be marked as estimated — you can connect tools later from your dashboard to refine your analysis.
            </p>
          </div>
        )}

        {/* Footer CTA */}
        {(activeMode === "connect" || activeMode === "upload") && (
          <div className="flex items-center justify-between pt-4 border-t border-border/40">
            <p className="text-xs text-muted-foreground/40">
              {connectedTools.length > 0 || uploadedFiles.length > 0
                ? `${connectedTools.length + uploadedFiles.length} source${connectedTools.length + uploadedFiles.length > 1 ? "s" : ""} added`
                : "No sources connected yet"}
            </p>
            <Button
              onClick={() => navigate("/Analyzer")}
              variant={hasData ? "default" : "outline"}
              className="h-10 rounded-full px-7 text-sm font-bold gap-2"
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