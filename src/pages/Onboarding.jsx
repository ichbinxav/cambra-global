import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";

const STEPS = ["Welcome", "Brand", "Revenue", "Channels", "Stack", "Goals"];

const CATEGORIES = [
  { value: "fashion", label: "Fashion" }, { value: "beauty", label: "Beauty" },
  { value: "wellness", label: "Wellness" }, { value: "lifestyle", label: "Lifestyle" },
  { value: "food_bev", label: "Food & Beverage" }, { value: "home", label: "Home" },
  { value: "tech", label: "Tech" }, { value: "other", label: "Other" },
];

const REVENUE_RANGES = [
  { value: "under_500k", label: "Under €500K" }, { value: "500k_1m", label: "€500K – €1M" },
  { value: "1m_5m", label: "€1M – €5M" }, { value: "5m_20m", label: "€5M – €20M" },
  { value: "20m_plus", label: "€20M+" },
];

const CHANNELS = ["DTC Website", "Amazon", "Wholesale", "Retail", "Social Commerce", "Marketplaces"];
const TOOLS = ["Shopify", "WooCommerce", "Stripe", "Klarna", "Mailchimp", "Klaviyo", "Meta Ads", "Google Ads", "ERP System"];
const GOALS_LIST = ["Reduce costs", "Improve margins", "Scale revenue", "Better infrastructure", "Network access", "Benchmarking"];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ name: "", website: "", country: "", category: "", annual_revenue: "", channels: [], stack: [], goals: [], size: "" });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const toggle = (field, val) =>
    setData(d => ({ ...d, [field]: d[field].includes(val) ? d[field].filter(v => v !== val) : [...d[field], val] }));

  const finish = async () => {
    setSaving(true);
    await base44.entities.Brand.create({ ...data, onboarding_complete: true });
    navigate("/Dashboard");
  };

  const Chip = ({ label, selected, onClick }) => (
    <button onClick={onClick} className={`p-4 rounded-xl border text-sm text-left transition-all duration-200 ${selected ? "border-foreground bg-foreground text-background font-semibold" : "border-border/50 text-muted-foreground hover:border-foreground/20 hover:text-foreground"}`}>
      {label}
    </button>
  );

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="text-center">
          <motion.div className="text-5xl mb-10 select-none opacity-20" animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}>✱</motion.div>
          <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground/50 mb-4">Welcome</p>
          <h1 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5">Join THE NoDE</h1>
          <p className="text-muted-foreground text-lg max-w-sm mx-auto leading-relaxed">Let's set up your brand profile. This takes less than 2 minutes.</p>
        </div>
      );
      case 1: return (
        <div className="space-y-5 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">1 of 5</p><h2 className="text-3xl font-black tracking-tight">Your brand</h2></div>
          {[{ field: "name", label: "Brand name", placeholder: "Enter brand name" }, { field: "website", label: "Website", placeholder: "https://" }, { field: "country", label: "Country", placeholder: "e.g. Germany" }].map(({ field, label, placeholder }) => (
            <div key={field} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground/60">{label}</Label>
              <Input value={data[field]} onChange={e => setData({ ...data, [field]: e.target.value })} placeholder={placeholder} className="h-12 text-sm border-border/60" />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground/60">Category — FOR LIFESTYLE COMMERCE</Label>
            <Select value={data.category} onValueChange={v => setData({ ...data, category: v })}>
              <SelectTrigger className="h-12 text-sm border-border/60"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground/60">Team size</Label>
            <Select value={data.size} onValueChange={v => setData({ ...data, size: v })}>
              <SelectTrigger className="h-12 text-sm border-border/60"><SelectValue placeholder="Select size" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solo">Solo founder</SelectItem>
                <SelectItem value="small">2–10 people</SelectItem>
                <SelectItem value="medium">11–50 people</SelectItem>
                <SelectItem value="large">50+ people</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
      case 2: return (
        <div className="space-y-5 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">2 of 5</p><h2 className="text-3xl font-black tracking-tight">Revenue</h2></div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground/60">Annual revenue range</Label>
            <Select value={data.annual_revenue} onValueChange={v => setData({ ...data, annual_revenue: v })}>
              <SelectTrigger className="h-12 text-sm border-border/60"><SelectValue placeholder="Select range" /></SelectTrigger>
              <SelectContent>{REVENUE_RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      );
      case 3: return (
        <div className="space-y-5 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">3 of 5</p><h2 className="text-3xl font-black tracking-tight">Sales channels</h2></div>
          <div className="grid grid-cols-2 gap-2.5">{CHANNELS.map(ch => <Chip key={ch} label={ch} selected={data.channels.includes(ch)} onClick={() => toggle("channels", ch)} />)}</div>
        </div>
      );
      case 4: return (
        <div className="space-y-5 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">4 of 5</p><h2 className="text-3xl font-black tracking-tight">Your stack</h2></div>
          <div className="grid grid-cols-2 gap-2.5">{TOOLS.map(t => <Chip key={t} label={t} selected={data.stack.includes(t)} onClick={() => toggle("stack", t)} />)}</div>
        </div>
      );
      case 5: return (
        <div className="space-y-5 max-w-md mx-auto w-full">
          <div className="mb-8"><p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">5 of 5</p><h2 className="text-3xl font-black tracking-tight">Your goals</h2></div>
          <div className="grid grid-cols-2 gap-2.5">{GOALS_LIST.map(g => <Chip key={g} label={g} selected={data.goals.includes(g)} onClick={() => toggle("goals", g)} />)}</div>
        </div>
      );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-inter">
      {/* Progress */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-border/30">
        <motion.div className="h-full bg-foreground" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.5, ease: "easeInOut" }} />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <span className="text-sm font-black tracking-tight">THE N✱DE</span>
        <span className="text-xs text-muted-foreground/40 tabular-nums">{step + 1} / {STEPS.length}</span>
      </div>
      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-lg">
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-5 border-t border-border/40">
        <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0} className="h-9 rounded-full px-5 text-sm text-muted-foreground">
          <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} className="h-9 rounded-full px-7 text-sm font-semibold shadow-sm">
            Continue <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={finish} disabled={saving} className="h-9 rounded-full px-7 text-sm font-semibold shadow-sm">
            {saving ? "Setting up..." : "Enter THE NoDE →"}
          </Button>
        )}
      </div>
    </div>
  );
}