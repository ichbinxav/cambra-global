import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Globe, LayoutGrid, List } from "lucide-react";

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

const SIZE_LABELS = { solo: "Solo founder", small: "2–10", medium: "11–50", large: "50+" };

export default function Network() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [view, setView] = useState("grid");

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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <div className="mb-10">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">Members</p>
        <h1 className="text-3xl font-black tracking-[-0.03em]">Network</h1>
        <p className="text-muted-foreground text-sm mt-1.5">
          The brands building independent commerce — FOR LIFESTYLE COMMERCE.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-8">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brands or countries..." className="pl-9 h-9 text-sm border-border/60" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-44 h-9 text-sm border-border/60"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sizeFilter} onValueChange={setSizeFilter}>
          <SelectTrigger className="w-full sm:w-36 h-9 text-sm border-border/60"><SelectValue placeholder="Size" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sizes</SelectItem>
            <SelectItem value="solo">Solo</SelectItem>
            <SelectItem value="small">2–10</SelectItem>
            <SelectItem value="medium">11–50</SelectItem>
            <SelectItem value="large">50+</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center border border-border/60 rounded-lg overflow-hidden h-9">
          {([{ v: "grid", icon: LayoutGrid }, { v: "list", icon: List }]).map(({ v, icon: IconComp }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 h-full flex items-center transition-colors ${view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              <IconComp size={14} />
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-40">
          <motion.div className="text-2xl text-muted-foreground/25" animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>✱</motion.div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-36 border border-dashed border-border/50 rounded-2xl">
          <div className="text-3xl mb-4 select-none opacity-15">✱</div>
          <p className="text-muted-foreground text-sm">No brands found. Be among the first to join the network.</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence>
            {filtered.map((brand, i) => (
              <motion.div
                key={brand.id}
                className="group p-6 rounded-2xl border border-border/50 bg-card/60 hover:border-border hover:bg-card transition-all"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35 }}
                whileHover={{ y: -2 }}
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-sm font-black">
                    {brand.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  {brand.category && (
                    <span className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground/50 bg-secondary/70 px-2.5 py-1 rounded-full">
                      {brand.category.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <h3 className="font-bold tracking-tight mb-2 text-sm">{brand.name}</h3>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                  {brand.country && <span className="flex items-center gap-1"><Globe size={10} />{brand.country}</span>}
                  {brand.size && <span>· {SIZE_LABELS[brand.size] || brand.size}</span>}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 overflow-hidden bg-card/60">
          <div className="divide-y divide-border/40">
            {filtered.map((brand, i) => (
              <motion.div
                key={brand.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-black">
                    {brand.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{brand.name}</p>
                    <p className="text-[11px] text-muted-foreground/60">{brand.country} {brand.size && `· ${SIZE_LABELS[brand.size]}`}</p>
                  </div>
                </div>
                {brand.category && (
                  <span className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground/40 bg-secondary px-2.5 py-1 rounded-full">
                    {brand.category.replace(/_/g, " ")}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-center text-xs text-muted-foreground/40 mt-6">{filtered.length} member{filtered.length !== 1 ? "s" : ""} in the network</p>
      )}
    </motion.div>
  );
}