import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function Account() {
  const [user, setUser] = useState(null);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.auth.me(),
      base44.entities.Brand.list("-created_date", 1),
    ]).then(([u, b]) => {
      setUser(u);
      setBrands(b);
      setLoading(false);
    });
  }, []);

  const brand = brands[0];

  const updateBrand = async (field, value) => {
    if (brand) {
      await base44.entities.Brand.update(brand.id, { [field]: value });
      setBrands([{ ...brand, [field]: value }]);
      toast.success("Updated");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div className="text-3xl" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>✱</motion.div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tighter">Account</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your profile and brand settings.</p>
      </div>

      <div className="max-w-lg space-y-8">
        {/* Profile */}
        <div className="p-6 rounded-2xl border border-border bg-card">
          <h3 className="text-sm font-medium tracking-tight mb-6 uppercase tracking-[0.1em] text-muted-foreground">Profile</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <p className="text-sm font-medium mt-1">{user?.full_name || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm font-medium mt-1">{user?.email || "—"}</p>
            </div>
          </div>
        </div>

        {/* Brand */}
        {brand && (
          <div className="p-6 rounded-2xl border border-border bg-card">
            <h3 className="text-sm font-medium tracking-tight mb-6 uppercase tracking-[0.1em] text-muted-foreground">Brand</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Brand name</Label>
                <Input defaultValue={brand.name} onBlur={e => updateBrand("name", e.target.value)} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Website</Label>
                <Input defaultValue={brand.website} onBlur={e => updateBrand("website", e.target.value)} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Country</Label>
                <Input defaultValue={brand.country} onBlur={e => updateBrand("country", e.target.value)} className="h-10" />
              </div>
            </div>
          </div>
        )}

        {/* Danger zone */}
        <div className="p-6 rounded-2xl border border-destructive/20 bg-card">
          <h3 className="text-sm font-medium tracking-tight mb-4 text-destructive">Sign out</h3>
          <Button variant="outline" size="sm" onClick={() => base44.auth.logout()} className="text-destructive border-destructive/30 hover:bg-destructive/10">
            Sign out of THE N✱DE
          </Button>
        </div>
      </div>
    </motion.div>
  );
}