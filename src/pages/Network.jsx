import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Globe, MapPin } from "lucide-react";

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
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");

  useEffect(() => {
    base44.entities.Brand.list("-created_date", 100).then(b => { setBrands(b); setLoading(false); });
  }, []);

  const filtered = brands.filter(b => {
    const matchSearch = !search || b.name?.toLowerCase().includes(search.toLowerCase()) || b.country?.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || b.category === catFilter;
    const matchSize = sizeFilter === "all" || b.size === sizeFilter;
    return matchSearch && matchCat && matchSize;
  });

  return (
    <div>
      <div className="mb-8">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">Members</p>
        <h1 className="text-3xl font-black tracking-[-0.03em]">Network</h1>
        <p className="text-muted-foreground text-sm mt-1">Independent brands building smarter businesses through THE NoDE.</p>
      </div>

      {/* Filters */}
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
              className="group p-6 rounded-2xl border border-border/50 bg-card/60 hover:border-border hover:bg-card transition-all"
            >
              {/* Logo + category */}
              <div className="flex items-start justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center text-base font-black text-foreground/60 shrink-0">
                  {brand.name?.[0]?.toUpperCase() || "?"}
                </div>
                {brand.category && (
                  <span className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground/50 bg-secondary/80 px-2.5 py-1 rounded-full">
                    {brand.category.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              {/* Name */}
              <h3 className="font-bold text-sm tracking-tight mb-1.5">{brand.name}</h3>

              {/* Description line */}
              <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">
                {brand.category ? CATEGORY_DESC[brand.category] || "Independent commerce brand" : "Independent commerce brand"}
              </p>

              {/* Meta */}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50">
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
                  <span className="ml-auto bg-secondary/80 px-2 py-0.5 rounded-full text-[10px]">
                    {brand.annual_revenue.replace(/_/g, " ").replace("under", "<").replace("plus", "+")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-center text-xs text-muted-foreground/40 mt-6">{filtered.length} member{filtered.length !== 1 ? "s" : ""} in the network</p>
      )}
    </div>
  );
}