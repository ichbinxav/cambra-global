import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Globe } from "lucide-react";

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "fashion", label: "Fashion" },
  { value: "beauty", label: "Beauty" },
  { value: "wellness", label: "Wellness" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "food_bev", label: "Food & Beverage" },
  { value: "home", label: "Home" },
  { value: "tech", label: "Tech" },
];

const SIZE_LABELS = { solo: "Solo", small: "2–10", medium: "11–50", large: "50+" };

export default function Network() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");

  useEffect(() => {
    base44.entities.Brand.list("-created_date", 100).then(b => {
      setBrands(b);
      setLoading(false);
    });
  }, []);

  const filtered = brands.filter(b => {
    const matchSearch = !search || b.name?.toLowerCase().includes(search.toLowerCase()) || b.country?.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || b.category === catFilter;
    const matchSize = sizeFilter === "all" || b.size === sizeFilter;
    return matchSearch && matchCat && matchSize;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="mb-10">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Members</p>
        <h1 className="text-3xl font-bold tracking-tight">Network</h1>
        <p className="text-muted-foreground text-sm mt-1.5">The brands building the future of independent commerce.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-8">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brands or countries..." className="pl-9 h-10 text-sm" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-44 h-10 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sizeFilter} onValueChange={setSizeFilter}>
          <SelectTrigger className="w-full sm:w-36 h-10 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sizes</SelectItem>
            <SelectItem value="solo">Solo</SelectItem>
            <SelectItem value="small">Small (2–10)</SelectItem>
            <SelectItem value="medium">Medium (11–50)</SelectItem>
            <SelectItem value="large">Large (50+)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <motion.div className="text-2xl text-muted-foreground/30" animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}>✱</motion.div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-32 border border-dashed border-border/60 rounded-2xl">
          <div className="text-3xl mb-4 select-none opacity-20">✱</div>
          <p className="text-muted-foreground text-sm">No brands found. Be among the first to join the network.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((brand, i) => (
            <motion.div
              key={brand.id}
              className="group p-6 rounded-2xl border border-border/60 bg-card hover:border-foreground/10 transition-all"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.4 }}
            >
              <div className="flex items-start justify-between mb-5">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-sm font-bold tracking-tight">
                  {brand.name?.[0]?.toUpperCase() || "?"}
                </div>
                {brand.category && (
                  <span className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground bg-secondary/70 px-2.5 py-1 rounded-full">
                    {brand.category.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <h3 className="font-semibold tracking-tight mb-2 text-sm">{brand.name}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {brand.country && (
                  <span className="flex items-center gap-1">
                    <Globe size={11} />
                    {brand.country}
                  </span>
                )}
                {brand.size && <span>· {SIZE_LABELS[brand.size] || brand.size}</span>}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}