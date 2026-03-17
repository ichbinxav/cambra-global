import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight, ArrowLeft, CheckCircle2, Zap, Upload, Edit3,
  CreditCard, Truck, Package, ShoppingBag, Building2, BarChart2,
  FileText, Link as LinkIcon, ChevronRight, X, Shield
} from "lucide-react";
import { base44 } from "@/api/base44Client";

/* ── DATA ─────────────────────────────────────────────────────────────── */

const STEPS = [
  { id: "welcome",   label: "Welcome" },
  { id: "brand",     label: "Your brand" },
  { id: "revenue",   label: "Revenue" },
  { id: "connect",   label: "Connect data" },
  { id: "finish",    label: "You're in" },
];

const CATEGORIES = ["Fashion", "Beauty", "Wellness", "Lifestyle", "Food & Bev", "Home", "Tech", "Other"];

const REVENUE_RANGES = [
  { value: "under_500k", label: "Under €500K", sub: "Early growth" },
  { value: "500k_1m",    label: "€500K – €1M", sub: "Scaling" },
  { value: "1m_5m",      label: "€1M – €5M",   sub: "Established" },
  { value: "5m_20m",     label: "€5M – €20M",  sub: "High-growth" },
  { value: "20m_plus",   label: "€20M+",        sub: "Enterprise" },
];

const INTEGRATIONS = [
  { id: "stripe",    label: "Stripe",    icon: CreditCard, color: "text-blue-600",   bg: "bg-blue-500/[0.07] border-blue-500/20",    cat: "Payments" },
  { id: "shopify",   label: "Shopify",   icon: ShoppingBag,color: "text-green-600",  bg: "bg-green-500/[0.07] border-green-500/20",  cat: "Commerce" },
  { id: "paypal",    label: "PayPal",    icon: CreditCard, color: "text-blue-500",   bg: "bg-blue-400/[0.07] border-blue-400/20",    cat: "Payments" },
  { id: "adyen",     label: "Adyen",     icon: CreditCard, color: "text-orange-500", bg: "bg-orange-500/[0.07] border-orange-500/20",cat: "Payments" },
  { id: "dhl",       label: "DHL",       icon: Truck,      color: "text-orange-500", bg: "bg-orange-400/[0.07] border-orange-400/20",cat: "Shipping" },
  { id: "klaviyo",   label: "Klaviyo",   icon: BarChart2,  color: "text-purple-500", bg: "bg-purple-500/[0.07] border-purple-500/20",cat: "SaaS" },
  { id: "woocommerce",label:"WooCommerce",icon:ShoppingBag,color:"text-violet-500",  bg: "bg-violet-500/[0.07] border-violet-500/20",cat:"Commerce" },
  { id: "ups",       label: "UPS",       icon: Truck,      color: "text-amber-600",  bg: "bg-amber-500/[0.07] border-amber-500/20",  cat: "Shipping" },
];

const INGESTION_MODES = [
  {
    id: "connect",
    icon: Zap,
    color: "text-blue-600",
    bg: "bg-blue-500/[0.07] border-blue-500/25",
    label: "Connect your tools",
    sub: "Stripe, Shopify, PayPal & more",
    badge: "Most accurate",
    badgeColor: "bg-green-500/10 text-green-600 border-green-500/20",
  },
  {
    id: "upload",
    icon: Upload,
    color: "text-orange-500",
    bg: "bg-orange-500/[0.07] border-orange-500/25",
    label: "Upload a statement",
    sub: "PDF, CSV, Excel — any format",
    badge: "Easy start",
    badgeColor: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
  {
    id: "manual",
    icon: Edit3,
    color: "text-muted-foreground",
    bg: "bg-secondary/60 border-border/50",
    label: "Enter manually",
    sub: "Quick estimates in 2 minutes",
    badge: "Estimated",
    badgeColor: "bg-secondary text-muted-foreground/60 border-border/50",
  },
];

/* ── SMALL COMPONENTS ─────────────────────────────────────────────────── */

const Chip = ({ label, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all ${
      selected
        ? "border-foreground bg-foreground text-background"
        : "border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
    }`}
  >
    {label}
  </button>
);

const SavingBadge = ({ label, value, color }) => (
  <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${color}`}>
    <span className="text-xs font-medium">{label}</span>
    <span className="text-sm font-black">{value}</span>
  </div>
);

/* ── STEP VIEWS ───────────────────────────────────────────────────────── */

function StepWelcome() {
  return (
    <div className="text-center space-y-8">
      {/* Hero badge */}
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-3xl bg-foreground flex items-center justify-center">
          <span className="text-background text-3xl font-black select-none">✱</span>
        </div>
      </div>

      <div>
        <h1 className="text-[clamp(2.2rem,7vw,4rem)] font-black tracking-[-0.05em] leading-[0.9] mb-4">
          Stop overpaying<br />for infrastructure.
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed max-w-xs mx-auto">
          In 3 steps, discover how much you can save — and unlock network deals unavailable to individual brands.
        </p>
      </div>

      {/* Value proof */}
      <div className="space-y-2 max-w-xs mx-auto">
        <SavingBadge label="Payment fees" value="−52%" color="bg-blue-500/[0.06] border-blue-500/15 text-blue-600" />
        <SavingBadge label="Shipping rates" value="−18%" color="bg-green-500/[0.06] border-green-500/15 text-green-600" />
        <SavingBadge label="SaaS spend" value="−30%" color="bg-orange-500/[0.06] border-orange-500/15 text-orange-500" />
        <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/50">
          <span className="text-lg font-black text-foreground">€29K</span> average savings per brand per year
        </div>
      </div>

      {/* Trust */}
      <div className="flex flex-wrap justify-center gap-4 text-[11px] text-muted-foreground/50">
        {["1,000+ brands", "15 countries", "< 3 min setup"].map((t, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <CheckCircle2 size={10} className="text-green-500" /> {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepBrand({ data, setData }) {
  const COUNTRIES = ["Germany", "France", "United Kingdom", "Netherlands", "Belgium", "Spain", "Italy", "Other"];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-1">Step 1 of 3</p>
        <h2 className="text-2xl font-black tracking-tight">Tell us about your brand</h2>
        <p className="text-sm text-muted-foreground mt-1">We benchmark you against similar brands in the network.</p>
      </div>

      <div className="space-y-3">
        <Input
          value={data.name}
          onChange={e => setData(d => ({ ...d, name: e.target.value }))}
          placeholder="Brand name"
          className="h-12 text-sm border-border/60"
          autoFocus
        />
        <Input
          value={data.website}
          onChange={e => setData(d => ({ ...d, website: e.target.value }))}
          placeholder="Website (optional)"
          className="h-12 text-sm border-border/60"
        />
      </div>

      <div>
        <p className="text-xs text-muted-foreground/60 mb-2">Category</p>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map(c => (
            <Chip key={c} label={c} selected={data.category === c} onClick={() => setData(d => ({ ...d, category: c }))} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground/60 mb-2">Country</p>
        <div className="grid grid-cols-2 gap-2">
          {COUNTRIES.map(c => (
            <Chip key={c} label={c} selected={data.country === c} onClick={() => setData(d => ({ ...d, country: c }))} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StepRevenue({ data, setData }) {
  const leverage = {
    "under_500k": { msg: "You can recover €10K–€20K/yr via network rates.", color: "text-muted-foreground" },
    "500k_1m":    { msg: "Realistic savings of €20K–€40K/yr from payments + shipping.", color: "text-blue-600" },
    "1m_5m":      { msg: "At your scale, network deals save €40K–€100K/yr.", color: "text-blue-600" },
    "5m_20m":     { msg: "Major leverage. €100K–€400K/yr in recoverable costs.", color: "text-green-600" },
    "20m_plus":   { msg: "Full enterprise rate access. Significant structural savings.", color: "text-green-600" },
  };
  const current = leverage[data.annual_revenue];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-1">Step 2 of 3</p>
        <h2 className="text-2xl font-black tracking-tight">What's your revenue range?</h2>
        <p className="text-sm text-muted-foreground mt-1">Used to calculate your savings potential in the network.</p>
      </div>

      <div className="space-y-2">
        {REVENUE_RANGES.map(r => (
          <button
            key={r.value}
            onClick={() => setData(d => ({ ...d, annual_revenue: r.value }))}
            className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
              data.annual_revenue === r.value
                ? "border-foreground bg-foreground text-background"
                : "border-border/50 hover:border-foreground/30"
            }`}
          >
            <div>
              <p className="font-bold text-sm">{r.label}</p>
              <p className={`text-[11px] ${data.annual_revenue === r.value ? "opacity-50" : "text-muted-foreground/50"}`}>{r.sub}</p>
            </div>
            {data.annual_revenue === r.value && <CheckCircle2 size={16} className="shrink-0 opacity-70" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={data.annual_revenue}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-xl border border-border/40 bg-secondary/40"
          >
            <p className="text-[11px] text-muted-foreground/50 mb-0.5">Estimated savings potential</p>
            <p className={`text-sm font-semibold ${current.color}`}>{current.msg}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StepConnect({ mode, setMode, connected, setConnected, uploaded, setUploaded, uploading, setUploading, fileRef, handleUpload }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-1">Step 3 of 3</p>
        <h2 className="text-2xl font-black tracking-tight">Connect your data</h2>
        <p className="text-sm text-muted-foreground mt-1">More data = more accurate savings analysis. Pick your method.</p>
      </div>

      {/* Mode picker */}
      <div className="space-y-2">
        {INGESTION_MODES.map(m => {
          const Icon = m.icon;
          const isActive = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`w-full p-4 rounded-xl border text-left flex items-center gap-4 transition-all ${
                isActive ? m.bg + " ring-1 ring-foreground/10" : "border-border/40 hover:border-border bg-card"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${isActive ? m.bg : "bg-secondary/50 border-border/30"}`}>
                <Icon size={16} className={isActive ? m.color : "text-muted-foreground/40"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{m.label}</p>
                <p className="text-[11px] text-muted-foreground/50">{m.sub}</p>
              </div>
              <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${m.badgeColor} shrink-0`}>{m.badge}</span>
            </button>
          );
        })}
      </div>

      {/* Connect tools panel */}
      <AnimatePresence mode="wait">
        {mode === "connect" && (
          <motion.div key="connect" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <p className="text-xs text-muted-foreground/60">Select the tools you use — we'll guide connection after setup:</p>
            <div className="grid grid-cols-2 gap-2">
              {INTEGRATIONS.map(tool => {
                const Icon = tool.icon;
                const isConn = connected.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    onClick={() => setConnected(prev => isConn ? prev.filter(t => t !== tool.id) : [...prev, tool.id])}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      isConn ? tool.bg + " ring-1 ring-foreground/5" : "border-border/40 hover:border-border bg-card"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${isConn ? tool.bg : "bg-secondary/50 border-border/30"}`}>
                      <Icon size={12} className={isConn ? tool.color : "text-muted-foreground/40"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{tool.label}</p>
                      <p className="text-[10px] text-muted-foreground/40">{tool.cat}</p>
                    </div>
                    {isConn && <CheckCircle2 size={12} className="text-green-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
            {connected.length > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/[0.07] border border-green-500/20">
                <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                <p className="text-xs text-green-700 font-medium">{connected.length} tool{connected.length > 1 ? "s" : ""} selected — you'll connect them right after setup</p>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/40 text-center flex items-center justify-center gap-1">
              <Shield size={9} /> Encrypted · Read-only · Never shared
            </p>
          </motion.div>
        )}

        {mode === "upload" && (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <input ref={fileRef} type="file" accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg" className="hidden"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            {!uploaded ? (
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
                className="border-2 border-dashed border-border/40 rounded-2xl p-8 text-center cursor-pointer hover:border-border hover:bg-secondary/20 transition-all"
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-500/[0.08] border border-orange-500/20 flex items-center justify-center mx-auto mb-4">
                  <Upload size={18} className="text-orange-500" />
                </div>
                <p className="text-sm font-semibold mb-1">Drop your file here</p>
                <p className="text-xs text-muted-foreground/50 mb-3">PDF · CSV · Excel · Images</p>
                <span className="text-xs font-semibold text-orange-500">Browse files</span>
              </div>
            ) : uploading ? (
              <div className="p-5 rounded-xl border border-border/40 space-y-3">
                <div className="flex items-center gap-3">
                  <FileText size={15} className="text-orange-500 shrink-0" />
                  <p className="text-sm font-medium truncate flex-1">{uploaded.name}</p>
                </div>
                <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
                  <div className="h-full rounded-full bg-orange-500 transition-all duration-300" style={{ width: `${uploaded.progress}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground/50">Uploading... {uploaded.progress}%</p>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-green-500/[0.07] border border-green-500/20">
                <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-700">File uploaded</p>
                  <p className="text-[11px] text-muted-foreground/60 truncate">{uploaded.name}</p>
                </div>
                <button onClick={() => setUploaded(null)} className="text-muted-foreground/40 hover:text-foreground">
                  <X size={13} />
                </button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/40 text-center flex items-center justify-center gap-1">
              <Shield size={9} /> Your data is encrypted and never shared
            </p>
          </motion.div>
        )}

        {mode === "manual" && (
          <motion.div key="manual" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="p-4 rounded-xl border border-border/40 bg-secondary/30 space-y-3">
              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                You'll complete a quick 7-step questionnaire right after this. It takes about 2 minutes and gives you an estimated Infrastructure Score.
              </p>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60">
                <ChevronRight size={12} /> Payments · Shipping · SaaS costs
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60">
                <ChevronRight size={12} /> Estimated savings in < 2 min
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StepFinish({ data, mode, connected }) {
  const savings = {
    "under_500k": "€10K–€20K", "500k_1m": "€20K–€40K",
    "1m_5m": "€40K–€100K", "5m_20m": "€100K–€400K", "20m_plus": "€400K+",
  };
  return (
    <div className="text-center space-y-8">
      <div className="flex justify-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 18 }}
          className="w-20 h-20 rounded-3xl bg-green-500 flex items-center justify-center"
        >
          <CheckCircle2 size={36} className="text-white" />
        </motion.div>
      </div>

      <div>
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">You're in</p>
        <h2 className="text-3xl font-black tracking-tight mb-2">
          {data.name ? `Welcome, ${data.name}.` : "You're all set."}
        </h2>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Your infrastructure intelligence is ready. Here's what happens next.
        </p>
      </div>

      {/* What's ready */}
      <div className="space-y-2 text-left max-w-xs mx-auto">
        {[
          { icon: BarChart2, label: "Infrastructure Score", sub: "Calculated based on your inputs", color: "text-blue-600" },
          { icon: CreditCard, label: "Savings analysis", sub: savings[data.annual_revenue] ?? "Personalised estimate", color: "text-green-600" },
          {
            icon: mode === "connect" ? Zap : mode === "upload" ? FileText : Edit3,
            label: mode === "connect" ? `${connected.length || 1} tool${connected.length > 1 ? "s" : ""} ready to connect` : mode === "upload" ? "Statement ready to process" : "Manual inputs queued",
            sub: mode === "manual" ? "Run the Analyzer to complete" : "We'll guide you through connection",
            color: "text-orange-500"
          },
        ].map(({ icon: Icon, label, sub, color }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border/40 bg-card"
          >
            <div className={`w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0`}>
              <Icon size={13} className={color} />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold">{label}</p>
              <p className="text-[10px] text-muted-foreground/50">{sub}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── MAIN ─────────────────────────────────────────────────────────────── */

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ name: "", website: "", country: "", category: "", annual_revenue: "", channels: [], stack: [], goals: [], size: "" });
  const [mode, setMode] = useState("connect");
  const [connected, setConnected] = useState([]);
  const [uploaded, setUploaded] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const navigate = useNavigate();

  const handleUpload = async (file) => {
    setUploaded({ name: file.name, progress: 0 });
    setUploading(true);
    const interval = setInterval(() => {
      setUploaded(prev => prev ? { ...prev, progress: Math.min(prev.progress + 20, 90) } : prev);
    }, 200);
    await base44.integrations.Core.UploadFile({ file });
    clearInterval(interval);
    setUploaded(prev => prev ? { ...prev, progress: 100 } : prev);
    setUploading(false);
  };

  const finish = async () => {
    setSaving(true);
    await base44.entities.Brand.create({ ...data, onboarding_complete: true });
    if (mode === "manual") navigate("/Analyzer");
    else if (mode === "connect") navigate("/ConnectTools");
    else navigate("/Dashboard");
  };

  const canAdvance = () => {
    if (step === 1) return data.name.trim().length > 0;
    if (step === 2) return data.annual_revenue.length > 0;
    return true;
  };

  const renderStep = () => {
    const steps = [
      <StepWelcome key="welcome" />,
      <StepBrand key="brand" data={data} setData={setData} />,
      <StepRevenue key="revenue" data={data} setData={setData} />,
      <StepConnect key="connect" mode={mode} setMode={setMode} connected={connected} setConnected={setConnected}
        uploaded={uploaded} setUploaded={setUploaded} uploading={uploading} setUploading={setUploading}
        fileRef={fileRef} handleUpload={handleUpload} />,
      <StepFinish key="finish" data={data} mode={mode} connected={connected} />,
    ];
    return steps[step] || null;
  };

  const progress = (step / (STEPS.length - 1)) * 100;

  const nextLabel = () => {
    if (step === STEPS.length - 1) {
      if (mode === "connect") return "Connect tools →";
      if (mode === "upload") return "Go to dashboard →";
      return "Run the Analyzer →";
    }
    return "Continue";
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-inter">

      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-border/30">
        <div className="h-full bg-foreground transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 border-b border-border/40 bg-background/98 backdrop-blur-xl">
        <span className="text-sm font-black tracking-tight">THE NoDE</span>

        {/* Step pills */}
        <div className="flex items-center gap-1.5 absolute left-1/2 -translate-x-1/2">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === step ? "w-7 bg-foreground" : i < step ? "w-4 bg-foreground/40" : "w-4 bg-border"
              }`}
            />
          ))}
        </div>

        <span className="text-[11px] text-muted-foreground/50 tabular-nums">
          {step > 0 && step < STEPS.length - 1 ? `${step}/3` : ""}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-md mx-auto px-5 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 border-t border-border/40 bg-background/98 backdrop-blur-xl">
        <Button
          variant="ghost"
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="h-12 rounded-full px-5 text-sm font-medium text-muted-foreground disabled:opacity-0"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            disabled={!canAdvance()}
            className="h-12 rounded-full px-8 text-sm font-bold shadow-sm gap-2 disabled:opacity-40"
          >
            {nextLabel()} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={finish}
            disabled={saving}
            className="h-12 rounded-full px-8 text-sm font-bold shadow-sm gap-2"
          >
            {saving ? (
              <><div className="w-4 h-4 rounded-full border-2 border-background/30 border-t-background animate-spin" />Setting up...</>
            ) : (
              <>{nextLabel()}</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}