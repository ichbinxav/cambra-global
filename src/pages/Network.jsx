import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Globe, MapPin, Users } from "lucide-react";
import PageHero from "@/components/shared/PageHero";
import { useToast } from "@/components/shared/Toast.jsx";

const CATEGORIES = [
  { value: "all", label: "All categories" },
  { value: "fashion", label: "Fashion" },
  { value: "beauty", label: "Beauty" },
  { value: "wellness", label: "Wellness" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "food_bev", label: "Food & Beverage" },
  { value: "home", label: "Home" },
  { value: "tech", label: "Tech" },
];

const SIZE_LABELS = { solo: "Solo founder", small: "2–10 people", medium: "11–50 people", large: "50+ people" };
const CATEGORY_DESC = {
  fashion: "Apparel, footwear & accessories",
  beauty: "Skincare, cosmetics & fragrance",
  wellness: "Health, fitness & wellbeing",
  lifestyle: "Lifestyle goods & services",
  food_bev: "Food, drink & nutrition",
  home: "Home goods & interiors",
  tech: "Consumer tech & devices",
  other: "Independent commerce",
};

export default function Network() {
  const { toast } = useToast();
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [subscribed, setSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    base44.entities.Brand.list("-created_date", 100).then(b => { setBrands(b); setLoading(false); });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const authed = await base44.auth.isAuthenticated();
        if (!authed) { setSubscribed(false); return; }
        const me = await base44.auth.me();
        const subs = await base44.entities.Subscription.filter({ user_email: me.email, status: 'active' }, '-created_date', 1);
        setSubscribed(subs.length > 0);
      } finally {
        setSubLoading(false);
      }
    })();
  }, []);

  const filtered = brands.filter(b => {
    const matchSearch = !search || b.name?.toLowerCase().includes(search.toLowerCase()) || b.country?.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || b.category === catFilter;
    const matchSize = sizeFilter === "all" || b.size === sizeFilter;
    return matchSearch && matchCat && matchSize;
  });

  const handleSubscribe = async () => {
    const authed = await base44.auth.isAuthenticated();
    if (!authed) { base44.auth.redirectToLogin(window.location.href); return; }
    const res = await base44.functions.invoke('startSubscription', {});
    const status = res?.data?.status;
    if (status === 'activated_free' || status === 'already_active') {
      setSubscribed(true);
      toast.success('Access activated — early partners free for life.');
    } else if (status === 'requires_checkout') {
      toast.info('Free seats are over. We will enable paid plan (€60/mo) soon.');
    } else if (res?.data?.error) {
      toast.error(res.data.error);
    }
  };

  return (
    <div>
      <PageHero
        eyebrow="Members · Independent operators"
        title="Network."
        subtitle="Independent brands building smarter businesses through CAMBRA."
        icon={Users}
      />

      {!subscribed && (
        <div className="mb-6 p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold">Members-only directory</p>
            <p className="text-xs text-muted-foreground/60">Unlock full access — early partners join for free.</p>
          </div>
          <Button onClick={handleSubscribe} className="h-9 rounded-full px-5 text-xs font-bold">Unlock access — Free</Button>
        </div>
      )}

       {/* Filters */}
       <div className={`${!subscribed ? 'pointer-events-none select-none blur-[2px]' : ''}`}>
       <div className="flex flex-col sm:flex-row gap-2.5 mb-7">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brands or countries..." className="pl-9 h-10 text-sm border-border/60" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-44 h-10 text-sm border-border/60"><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sizeFilter} onValueChange={setSizeFilter}>
          <SelectTrigger className="w-full sm:w-36 h-10 text-sm border-border/60"><SelectValue placeholder="All sizes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sizes</SelectItem>
            <SelectItem value="solo">Solo founder</SelectItem>
            <SelectItem value="small">2–10 people</SelectItem>
            <SelectItem value="medium">11–50 people</SelectItem>
            <SelectItem value="large">50+ people</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-32 border border-dashed border-border/50 rounded-2xl">
          <div className="text-4xl mb-4 select-none opacity-10">✱</div>
          <p className="text-muted-foreground text-sm">No brands found. Be among the first to join.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((brand) => (
            <div
              key={brand.id}
              className="cambra-card group p-6 transition-all hover:-translate-y-0.5"
            >
              <div className="relative">
              {/* Logo + category */}
              <div className="flex items-start justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-base font-black text-white shrink-0">
                  {brand.name?.[0]?.toUpperCase() || "?"}
                </div>
                {brand.category && (
                  <span className="text-[10px] tracking-[0.1em] uppercase text-white/65 bg-white/8 border border-white/10 px-2.5 py-1 rounded-full">
                    {brand.category.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              {/* Name */}
              <h3 className="font-bold text-sm tracking-tight mb-1.5 text-white">{brand.name}</h3>

              {/* Description line */}
              <p className="text-[12px] text-white/65 mb-4 leading-relaxed">
                {brand.category ? CATEGORY_DESC[brand.category] || "Independent commerce brand" : "Independent commerce brand"}
              </p>

              {/* Meta */}
              <div className="flex items-center gap-3 text-[11px] text-white/55">
                {brand.country && (
                  <span className="flex items-center gap-1">
                    <MapPin size={9} />
                    {brand.country}
                  </span>
                )}
                {brand.size && (
                  <span className="flex items-center gap-1">
                    <Globe size={9} />
                    {SIZE_LABELS[brand.size] || brand.size}
                  </span>
                )}
                {brand.annual_revenue && (
                  <span className="ml-auto bg-white/8 border border-white/10 px-2 py-0.5 rounded-full text-[10px]">
                    {brand.annual_revenue.replace(/_/g, " ").replace("under", "<").replace("plus", "+")}
                  </span>
                )}
              </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-center text-xs text-muted-foreground/40 mt-6">{filtered.length} member{filtered.length !== 1 ? "s" : ""} in the network</p>
      )}
      </div>
    </div>
  );
}