import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, Truck, Package, Shield, Building2, Warehouse,
  CheckCircle2, ArrowRight, Lock, Zap, ChevronRight, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DEALS = [
  {
    id: "payments-stripe",
    category: "payments",
    icon: CreditCard,
    provider: "Stripe",
    title: "Network Payment Rate",
    headline: "1.4% effective rate",
    normal_rate: "2.9% + €0.25",
    node_rate: "1.4% + €0.10",
    saving: "€8,400/yr",
    saving_note: "Based on €500K/yr GMV",
    desc: "THE NoDE has negotiated enterprise-level Stripe processing fees on behalf of the collective. Available immediately to all members upon activation.",
    tags: ["Live", "Payments"],
    phase: "live",
    activation: "Connect your Stripe account and THE NoDE will automatically apply negotiated rates to your account within 5 business days.",
    steps: ["Click Activate Deal", "Connect your Stripe account", "Network rates applied within 5 days"],
  },
  {
    id: "payments-adyen",
    category: "payments",
    icon: CreditCard,
    provider: "Adyen",
    title: "Adyen Volume Discount",
    headline: "Up to 0.9% processing",
    normal_rate: "Interchange + 0.3%",
    node_rate: "Interchange + 0.08%",
    saving: "€12,000/yr",
    saving_note: "Based on €1M/yr GMV",
    desc: "Adyen's enterprise interchange++ pricing, unlocked for THE NoDE members processing above €100K/month.",
    tags: ["Live", "Payments", "Enterprise"],
    phase: "live",
    activation: "Submit your Adyen MID and THE NoDE will negotiate updated pricing on your behalf.",
    steps: ["Click Activate Deal", "Submit your Adyen MID", "Negotiation completed within 10 days"],
  },
  {
    id: "shipping-dhl",
    category: "shipping",
    icon: Truck,
    provider: "DHL Express",
    title: "DHL Network Contract",
    headline: "−18% on all shipments",
    normal_rate: "Standard retail",
    node_rate: "−18% collective discount",
    saving: "€5,200/yr",
    saving_note: "Based on 400 shipments/mo",
    desc: "Collective volume across the network unlocks DHL business account pricing normally reserved for brands shipping 10,000+ parcels per month.",
    tags: ["Live", "Shipping"],
    phase: "live",
    activation: "Link your DHL account number and we'll migrate it to the network contract within 3 business days.",
    steps: ["Click Activate Deal", "Provide your DHL account number", "Network pricing applied within 3 days"],
  },
  {
    id: "shipping-dpd",
    category: "shipping",
    icon: Truck,
    provider: "DPD",
    title: "DPD Pan-European Rate",
    headline: "−15% pan-EU parcels",
    normal_rate: "Standard B2C rate",
    node_rate: "−15% on all zones",
    saving: "€3,800/yr",
    saving_note: "Based on 300 shipments/mo",
    desc: "THE NoDE's DPD network contract covers all 35+ European countries. Ideal for brands scaling cross-border.",
    tags: ["Live", "Shipping", "EU"],
    phase: "live",
    activation: "Activate to connect your DPD account to the network master contract.",
    steps: ["Click Activate Deal", "Provide your DPD depot code", "Migration completed within 5 days"],
  },
  {
    id: "saas-klaviyo",
    category: "saas",
    icon: Package,
    provider: "Klaviyo",
    title: "Klaviyo Group License",
    headline: "30% off any plan",
    normal_rate: "Standard pricing",
    node_rate: "30% perpetual discount",
    saving: "€2,160/yr",
    saving_note: "Based on 50K contacts plan",
    desc: "Group licensing agreement with Klaviyo delivers a 30% perpetual discount on all plans — no cap on contacts tier.",
    tags: ["Soon", "SaaS", "Email"],
    phase: "soon",
    activation: "Join the waitlist and you'll be activated when the group contract launches in Q2 2026.",
    steps: ["Join the waitlist", "Get notified when live", "Switch billing to group contract"],
  },
  {
    id: "saas-shopify",
    category: "saas",
    icon: Package,
    provider: "Shopify",
    title: "Shopify Plus Network",
    headline: "€500/mo off Plus",
    normal_rate: "€2,000/mo",
    node_rate: "€1,500/mo",
    saving: "€6,000/yr",
    saving_note: "Per brand on Shopify Plus",
    desc: "Group agreement with Shopify negotiated for brands already on Plus, or brands migrating to Plus through THE NoDE.",
    tags: ["Soon", "SaaS", "Platform"],
    phase: "soon",
    activation: "Express interest and we'll include you in the group contract negotiation.",
    steps: ["Express interest", "We negotiate on your behalf", "Receive updated contract"],
  },
  {
    id: "insurance",
    category: "insurance",
    icon: Shield,
    provider: "AXA / Specialist",
    title: "Group Business Insurance",
    headline: "−25% on premiums",
    normal_rate: "Individual underwriting",
    node_rate: "Group risk pool",
    saving: "€4,000/yr",
    saving_note: "Based on typical SME cover",
    desc: "THE NoDE is building a group insurance product for independent brands — covering product liability, D&O, and e-commerce specific risk.",
    tags: ["Planned", "Insurance"],
    phase: "planned",
    activation: "Register interest to join the founding group for the insurance product.",
    steps: ["Register interest", "Provide cover requirements", "Receive group quote in Q4 2026"],
  },
  {
    id: "banking",
    category: "banking",
    icon: Building2,
    provider: "Pan-European Bank",
    title: "Business Banking Bundle",
    headline: "Zero FX + credit lines",
    normal_rate: "Retail bank rates",
    node_rate: "Zero-fee FX + group credit",
    saving: "€3,500/yr",
    saving_note: "FX savings for EU cross-border",
    desc: "A dedicated business banking product built for THE NoDE — zero-fee FX, instant IBAN, and group credit facilities for inventory and growth.",
    tags: ["Planned", "Banking"],
    phase: "planned",
    activation: "Join the waitlist. Banking product launches 2027.",
    steps: ["Join the waitlist", "KYB process", "Account activated 2027"],
  },
  {
    id: "warehousing",
    category: "logistics",
    icon: Warehouse,
    provider: "Network 3PL",
    title: "Shared Fulfillment Network",
    headline: "From €2.50/fulfillment",
    normal_rate: "€4–6 per fulfillment",
    node_rate: "From €2.50 shared network",
    saving: "€18,000/yr",
    saving_note: "Based on 500 orders/mo",
    desc: "Distributed fulfillment centers across Europe, shared across the network. Pick, pack, ship — at wholesale cost.",
    tags: ["Planned", "Logistics"],
    phase: "planned",
    activation: "Join the waitlist for when the first fulfillment nodes launch.",
    steps: ["Join the waitlist", "Onboarding call", "Go live in network node"],
  },
];

const CATEGORIES = [
  { id: "all", label: "All Deals" },
  { id: "payments", label: "Payments" },
  { id: "shipping", label: "Shipping" },
  { id: "saas", label: "SaaS" },
  { id: "insurance", label: "Insurance" },
  { id: "banking", label: "Banking" },
  { id: "logistics", label: "Logistics" },
];

const PHASE_CONFIG = {
  live: { label: "Live", dot: "bg-green-500", badge: "bg-green-500/10 text-green-600" },
  soon: { label: "Q2 2026", dot: "bg-blue-500", badge: "bg-blue-500/10 text-blue-600" },
  planned: { label: "Planned", dot: "bg-border", badge: "bg-secondary text-muted-foreground/60" },
};

function DealModal({ deal, onClose }) {
  const [activated, setActivated] = useState(false);
  const [loading, setLoading] = useState(false);
  const phase = PHASE_CONFIG[deal.phase];

  const handleActivate = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1400));
    setActivated(true);
    setLoading(false);
    toast.success(`${deal.provider} deal activated — check your email for next steps.`);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg bg-background border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-border/40">
          <button onClick={onClose} className="absolute top-5 right-5 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
            <X size={15} />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <deal.icon size={16} className="text-foreground/70" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.2em]">{deal.provider}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5 ${phase.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${phase.dot}`} />
                  {phase.label}
                </span>
              </div>
              <h2 className="text-xl font-black tracking-tight">{deal.title}</h2>
              <p className="text-2xl font-black text-node-blue mt-1 tracking-tight">{deal.headline}</p>
            </div>
          </div>
        </div>

        {/* Rate comparison */}
        <div className="px-7 py-5 grid grid-cols-2 gap-3 border-b border-border/40 bg-secondary/20">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-1.5">Standard rate</p>
            <p className="text-sm font-semibold line-through text-muted-foreground/50">{deal.normal_rate}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-1.5">Network rate</p>
            <p className="text-sm font-bold text-foreground">{deal.node_rate}</p>
          </div>
          <div className="col-span-2 pt-3 border-t border-border/30">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-1">Estimated savings</p>
            <p className="text-2xl font-black tabular-nums">{deal.saving} <span className="text-xs font-normal text-muted-foreground">{deal.saving_note}</span></p>
          </div>
        </div>

        {/* Description */}
        <div className="px-7 py-5">
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">{deal.desc}</p>

          {/* Steps */}
          <div className="space-y-2.5 mb-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">How it works</p>
            {deal.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5 ${activated && i === 0 ? "bg-green-500 text-white" : "bg-secondary text-muted-foreground"}`}>
                  {activated && i === 0 ? <CheckCircle2 size={11} /> : i + 1}
                </div>
                <p className="text-sm text-muted-foreground">{s}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="px-7 pb-7">
          {activated ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/8 border border-green-500/20">
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              <p className="text-sm font-semibold text-green-600">Deal activated — check your email for next steps.</p>
            </div>
          ) : (
            <Button
              onClick={handleActivate}
              disabled={loading || deal.phase === "planned"}
              className="w-full h-12 rounded-xl text-sm font-semibold gap-2 shadow-sm"
            >
              {loading ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>✱</motion.div>
              ) : deal.phase === "planned" ? (
                <><Lock size={13} /> Coming {deal.tags.find(t => t !== "Planned")?.toLowerCase() || "2027"}</>
              ) : deal.phase === "soon" ? (
                <><Zap size={13} /> Join waitlist <ArrowRight size={13} /></>
              ) : (
                <><Zap size={13} /> Activate Deal <ArrowRight size={13} /></>
              )}
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground/40 text-center mt-3">{deal.activation}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Deals() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedDeal, setSelectedDeal] = useState(null);

  const filtered = activeCategory === "all" ? DEALS : DEALS.filter(d => d.category === activeCategory);

  const liveSavings = DEALS.filter(d => d.phase === "live").reduce((sum, d) => {
    const num = parseFloat(d.saving.replace(/[€,]/g, "").replace("/yr", ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">Member exclusive</p>
        <h1 className="text-3xl font-black tracking-[-0.03em]">Network Deals</h1>
        <p className="text-muted-foreground text-sm mt-1.5">Pre-negotiated infrastructure discounts. Available only to THE NoDE members.</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Live deals", value: DEALS.filter(d => d.phase === "live").length.toString() },
          { label: "Total available savings", value: `€${(liveSavings / 1000).toFixed(0)}K+/yr` },
          { label: "Categories", value: "6" },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-xl border border-border/50 bg-card/60">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1">{stat.label}</p>
            <p className="text-xl font-black tabular-nums tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Member badge */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-secondary/20 mb-7">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 animate-pulse-slow" />
        <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">THE NoDE member</span> — you have access to all live deals below. Click any card to activate.</p>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-7">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 h-8 rounded-full text-xs font-medium transition-all ${
              activeCategory === cat.id
                ? "bg-foreground text-background"
                : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Deal cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((deal, i) => {
            const phase = PHASE_CONFIG[deal.phase];
            return (
              <motion.button
                key={deal.id}
                layout
                className="group text-left p-6 rounded-2xl border border-border/50 bg-card/60 hover:bg-card hover:border-border transition-all cursor-pointer"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ delay: i * 0.04, duration: 0.35 }}
                whileHover={{ y: -2 }}
                onClick={() => setSelectedDeal(deal)}
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                    <deal.icon size={14} className="text-foreground/60" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${phase.dot} ${deal.phase === "live" ? "animate-pulse-slow" : ""}`} />
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${phase.badge}`}>{phase.label}</span>
                  </div>
                </div>

                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1">{deal.provider}</p>
                <h3 className="font-bold tracking-tight mb-1 text-sm">{deal.title}</h3>
                <p className="text-xl font-black text-node-blue tracking-tight mb-3">{deal.headline}</p>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/40">
                  <div>
                    <p className="text-[10px] text-muted-foreground/40 mb-0.5">Est. savings</p>
                    <p className="text-sm font-bold">{deal.saving}</p>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground/40 group-hover:text-foreground transition-colors text-xs">
                    View deal <ChevronRight size={12} />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {selectedDeal && <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}