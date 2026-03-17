import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

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
      toast.success("Saved");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <motion.div className="text-2xl text-muted-foreground/30" animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}>✱</motion.div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="mb-10">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Settings</p>
        <h1 className="text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-muted-foreground text-sm mt-1.5">Manage your profile and brand settings.</p>
      </div>

      <div className="max-w-lg space-y-5">
        {/* Profile */}
        <div className="p-7 rounded-2xl border border-border/60 bg-card">
          <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-6">Profile</p>
          <div className="space-y-5">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Full name</Label>
              <p className="text-sm font-medium">{user?.full_name || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
              <p className="text-sm font-medium">{user?.email || "—"}</p>
            </div>
          </div>
        </div>

        {/* Brand */}
        {brand && (
          <div className="p-7 rounded-2xl border border-border/60 bg-card">
            <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-6">Brand</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Brand name</Label>
                <Input defaultValue={brand.name} onBlur={e => updateBrand("name", e.target.value)} className="h-10 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Website</Label>
                <Input defaultValue={brand.website} onBlur={e => updateBrand("website", e.target.value)} className="h-10 text-sm" placeholder="https://" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Country</Label>
                <Input defaultValue={brand.country} onBlur={e => updateBrand("country", e.target.value)} className="h-10 text-sm" />
              </div>
            </div>
          </div>
        )}

        {/* Sign out */}
        <div className="p-7 rounded-2xl border border-border/60 bg-card">
          <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-4">Session</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => base44.auth.logout()}
            className="text-sm h-9 rounded-full px-5 gap-2"
          >
            <LogOut size={13} />
            Sign out of THE Node
          </Button>
        </div>
      </div>
    </motion.div>
  );
}