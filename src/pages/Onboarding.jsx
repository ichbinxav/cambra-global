import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const STEPS = ["Welcome", "Your brand", "Revenue", "Channels", "Stack", "Goals"];

const CATEGORIES = [
  { value: "fashion", label: "Fashion" },
  { value: "beauty", label: "Beauty" },
  { value: "wellness", label: "Wellness" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "food_bev", label: "Food & Beverage" },
  { value: "home", label: "Home" },
  { value: "tech", label: "Tech" },
  { value: "other", label: "Other" },
];

const REVENUE_RANGES = [
  { value: "under_500k", label: "Under €500K" },
  { value: "500k_1m", label: "€500K – €1M" },
  { value: "1m_5m", label: "€1M – €5M" },
  { value: "5m_20m", label: "€5M – €20M" },
  { value: "20m_plus", label: "€20M+" },
];

const CHANNELS = ["DTC Website", "Amazon", "Wholesale", "Retail", "Social Commerce", "Marketplaces"];
const TOOLS = ["Shopify", "WooCommerce", "Stripe", "Klarna", "Mailchimp", "Klaviyo", "Meta Ads", "Google Ads", "ERP System"];
const GOALS_LIST = ["Reduce costs", "Improve margins", "Scale revenue", "Better infrastructure", "Network access", "Benchmarking"];

const Chip = ({ label, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`py-3.5 px-4 rounded-xl border text-sm font-medium text-left transition-all ${
      selected
        ? "border-foreground bg-foreground text-background"
        : "border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
    }`}
  >
    {label}
  </button>
);

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

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="text-center py-4">
          <div className="text-6xl mb-8 select-none opacity-10">✱</div>
          <h1 className="text-[clamp(2rem,6vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-5">
            Join THE NoDE
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-sm mx-auto">
            Benchmark your infrastructure costs and unlock collective savings. Takes less than 2 minutes.
          </p>
          <div className="space-y-3 text-sm text-left max-w-xs mx-auto mb-8">
            {[
              "We use your info to benchmark your infrastructure",
              "We identify savings opportunities against network data",
              "You unlock deals negotiated across 1,000+ brands",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>
      );
      case 1: return (
        <div className="space-y-5">
          {[
            { field: "name", label: "Brand name", placeholder: "Your brand name" },
            { field: "website", label: "Website", placeholder: "https://" },
            { field: "country", label: "Country", placeholder: "e.g. Germany, UK, Netherlands" },
          ].map(({ field, label, placeholder }) => (
            <div key={field} className="space-y-1.5">
              <Label className="text-sm font-medium">{label}</Label>
              <Input value={data[field]} onChange={e => setData({ ...data, [field]: e.target.value })} placeholder={placeholder} className="h-12 text-sm border-border/60" />
            </div>
          ))}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Category</Label>
            <Select value={data.category} onValueChange={v => setData({ ...data, category: v })}>
              <SelectTrigger className="h-12 text-sm border-border/60"><SelectValue placeholder="Select your category" /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Team size</Label>
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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Annual revenue range</Label>
            <Select value={data.annual_revenue} onValueChange={v => setData({ ...data, annual_revenue: v })}>
              <SelectTrigger className="h-12 text-sm border-border/60"><SelectValue placeholder="Select range" /></SelectTrigger>
              <SelectContent>{REVENUE_RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground/50">Used to benchmark savings potential within the network.</p>
          </div>
        </div>
      );
      case 3: return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-2">Select all that apply — each channel affects your cost structure.</p>
          <div className="grid grid-cols-2 gap-2">
            {CHANNELS.map(ch => <Chip key={ch} label={ch} selected={data.channels.includes(ch)} onClick={() => toggle("channels", ch)} />)}
          </div>
        </div>
      );
      case 4: return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-2">Select your current tools — we benchmark costs and identify group licensing savings.</p>
          <div className="grid grid-cols-2 gap-2">
            {TOOLS.map(t => <Chip key={t} label={t} selected={data.stack.includes(t)} onClick={() => toggle("stack", t)} />)}
          </div>
        </div>
      );
      case 5: return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-2">What are you most focused on right now?</p>
          <div className="grid grid-cols-2 gap-2">
            {GOALS_LIST.map(g => <Chip key={g} label={g} selected={data.goals.includes(g)} onClick={() => toggle("goals", g)} />)}
          </div>
        </div>
      );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-inter">
      {/* Progress */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-border/30">
        <div className="h-full bg-foreground transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-background/98">
        <span className="text-sm font-black tracking-tight">THE NoDE</span>
        <span className="text-xs font-semibold tabular-nums">{step + 1} / {STEPS.length}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-md mx-auto px-5 py-10">
          {step > 0 && (
            <div className="mb-7">
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">
                Step {step} of {STEPS.length - 1}
              </p>
              <h2 className="text-2xl font-black tracking-tight">{STEPS[step]}</h2>
            </div>
          )}
          {renderStep()}
        </div>
      </div>

      {/* Sticky bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 border-t border-border/40 bg-background/98 backdrop-blur-xl">
        <Button
          variant="ghost"
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="h-12 rounded-full px-5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} className="h-12 rounded-full px-8 text-sm font-bold shadow-sm gap-2">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finish} disabled={saving} className="h-12 rounded-full px-8 text-sm font-bold shadow-sm">
            {saving ? (
              <><div className="w-4 h-4 rounded-full border-2 border-background/30 border-t-background animate-spin mr-2" />Setting up...</>
            ) : "Enter THE NoDE →"}
          </Button>
        )}
      </div>
    </div>
  );
}