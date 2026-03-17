import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

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

const SIZE_LABELS = { solo: "Solo", small: "Small", medium: "Medium", large: "Large" };

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
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tighter">Network</h1>
        <p className="text-muted-foreground text-sm mt-1">The brands building the future of independent commerce.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brands..." className="pl-10 h-10" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-44 h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sizeFilter} onValueChange={setSizeFilter}>
          <SelectTrigger className="w-full sm:w-36 h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sizes</SelectItem>
            <SelectItem value="solo">Solo</SelectItem>
            <SelectItem value="small">Small</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="large">Large</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <motion.div className="text-3xl" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>✱</motion.div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <div className="text-3xl mb-4 select-none">✱</div>
          <p className="text-muted-foreground text-sm">No brands found. Be among the first to join the network.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((brand, i) => (
            <motion.div
              key={brand.id}
              className="p-6 rounded-2xl border border-border bg-card hover:shadow-md hover:border-foreground/10 transition-all"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold">
                  {brand.name?.[0]?.toUpperCase() || "?"}
                </div>
                {brand.category && (
                  <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                    {brand.category.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <h3 className="font-semibold tracking-tight mb-1">{brand.name}</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {brand.country && <span>{brand.country}</span>}
                {brand.size && <span>· {SIZE_LABELS[brand.size] || brand.size}</span>}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}