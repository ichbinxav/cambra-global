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

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    name: "", website: "", country: "", category: "",
    annual_revenue: "", channels: [], stack: [], goals: [], size: ""
  });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const toggle = (field, val) => {
    setData(d => ({
      ...d,
      [field]: d[field].includes(val) ? d[field].filter(v => v !== val) : [...d[field], val]
    }));
  };

  const finish = async () => {
    setSaving(true);
    await base44.entities.Brand.create({ ...data, onboarding_complete: true });
    navigate("/Dashboard");
  };

  const slideVariants = {
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="text-center">
            <motion.div className="text-6xl mb-8 select-none" animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity }}>✱</motion.div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter mb-4">Welcome to THE N✱DE</h1>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">Let's set up your brand profile. This takes less than 2 minutes.</p>
          </div>
        );
      case 1:
        return (
          <div className="space-y-6 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-8">Your brand</h2>
            <div className="space-y-2">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Brand name</Label>
              <Input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} placeholder="Enter brand name" className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Website</Label>
              <Input value={data.website} onChange={e => setData({ ...data, website: e.target.value })} placeholder="https://" className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Country</Label>
              <Input value={data.country} onChange={e => setData({ ...data, country: e.target.value })} placeholder="e.g. Germany" className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Category</Label>
              <Select value={data.category} onValueChange={v => setData({ ...data, category: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Team size</Label>
              <Select value={data.size} onValueChange={v => setData({ ...data, size: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select size" /></SelectTrigger>
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
      case 2:
        return (
          <div className="space-y-6 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-8">Revenue</h2>
            <div className="space-y-2">
              <Label className="text-xs tracking-wide uppercase text-muted-foreground">Annual revenue range</Label>
              <Select value={data.annual_revenue} onValueChange={v => setData({ ...data, annual_revenue: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select range" /></SelectTrigger>
                <SelectContent>
                  {REVENUE_RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-8">Sales channels</h2>
            <div className="grid grid-cols-2 gap-3">
              {CHANNELS.map(ch => (
                <button
                  key={ch}
                  onClick={() => toggle("channels", ch)}
                  className={`p-4 rounded-xl border text-sm text-left transition-all ${
                    data.channels.includes(ch)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-8">Your stack</h2>
            <div className="grid grid-cols-2 gap-3">
              {TOOLS.map(t => (
                <button
                  key={t}
                  onClick={() => toggle("stack", t)}
                  className={`p-4 rounded-xl border text-sm text-left transition-all ${
                    data.stack.includes(t)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6 max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold tracking-tighter text-center mb-8">Your goals</h2>
            <div className="grid grid-cols-2 gap-3">
              {GOALS_LIST.map(g => (
                <button
                  key={g}
                  onClick={() => toggle("goals", g)}
                  className={`p-4 rounded-xl border text-sm text-left transition-all ${
                    data.goals.includes(g)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-border">
        <motion.div
          className="h-full bg-foreground"
          animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-semibold tracking-tight">THE N✱DE</span>
        <span className="text-xs text-muted-foreground tracking-wide">
          {step + 1} / {STEPS.length}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full max-w-lg"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-6 border-t border-border">
        <Button
          variant="ghost"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
          className="text-sm"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} className="rounded-full px-8 text-sm">
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finish} disabled={saving} className="rounded-full px-8 text-sm">
            {saving ? "Setting up..." : "Enter THE N✱DE"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}