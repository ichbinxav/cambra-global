import { useEffect, useMemo, useState } from "react";
import { useNavigate } from 'react-router-dom';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { LogOut, User, Building2, Shield, Store, Mail } from "lucide-react";
import MonthlyEmailPreference from "@/components/account/MonthlyEmailPreference";

const Section = ({ icon: IconComp, title, children }) => (
  <div className="p-7 rounded-2xl border border-border/50 bg-card/60">
    <div className="flex items-center gap-2.5 mb-6">
      <IconComp size={13} className="text-muted-foreground/50" />
      <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">{title}</p>
    </div>
    {children}
  </div>
);

export default function Account() {
  const [user, setUser] = useState(null);
  const [brands, setBrands] = useState([]);
  const [paymentsProfiles, setPaymentsProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const makeAdmin = async () => {
    const res = await base44.functions.invoke('promoteMeToAdmin', {});
    if (res?.data?.success) {
      const u = await base44.auth.me();
      setUser(u);
      toast.success('Ahora tienes rol administrador');
    } else {
      toast.error(res?.data?.error || 'No se pudo otorgar el rol admin');
    }
  };

  const createProvider = async () => {
    const res = await base44.functions.invoke('createMyProvider', {});
    if (res?.data?.provider) {
      toast.success(res?.data?.existed ? 'Ya tienes un proveedor vinculado' : 'Proveedor creado');
      navigate('/ProviderPortal');
    } else {
      toast.error(res?.data?.error || 'No se pudo crear el proveedor');
    }
  };

  useEffect(() => {
    Promise.all([base44.auth.me(), base44.entities.Brand.list("-created_date", 1), base44.entities.PaymentsProfile.list("-created_date", 1)]).then(([u, b, p]) => {
      setUser(u);
      setBrands(b);
      setPaymentsProfiles(p);
      setLoading(false);
    });
  }, []);

  const brand = brands[0];
  const paymentsProfile = paymentsProfiles[0];

  const updatePaymentsProfile = async (field, value) => {
    if (paymentsProfile) {
      await base44.entities.PaymentsProfile.update(paymentsProfile.id, { [field]: value });
      setPaymentsProfiles([{ ...paymentsProfile, [field]: value }]);
      toast.success("Saved");
    }
  };

  const updateBrand = async (field, value) => {
    if (brand) {
      await base44.entities.Brand.update(brand.id, { [field]: value });
      setBrands([{ ...brand, [field]: value }]);
      toast.success("Saved");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <motion.div className="text-2xl text-muted-foreground/25" animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>✱</motion.div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <div className="mb-10">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">Settings</p>
        <h1 className="text-3xl font-black tracking-[-0.03em]">Account</h1>
        <p className="text-muted-foreground text-sm mt-1.5">Manage your profile and brand settings.</p>
      </div>

      <div className="max-w-lg space-y-4">
        <Section icon={User} title="Profile">
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground/60 mb-1.5 block">Full name</Label>
              <p className="text-sm font-semibold">{user?.full_name || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground/60 mb-1.5 block">Email</Label>
              <p className="text-sm font-semibold">{user?.email || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground/60 mb-1.5 block">Role</Label>
              <span className="inline-flex items-center text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                {user?.role || "Member"}
              </span>
            </div>
          </div>
        </Section>

        {brand && (
          <Section icon={Building2} title="Brand">
            <div className="space-y-4">
              {[
                { field: "name", label: "Brand name", placeholder: "Your brand" },
                { field: "website", label: "Website", placeholder: "https://" },
                { field: "country", label: "Country", placeholder: "e.g. Germany" },
              ].map(({ field, label, placeholder }) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground/60">{label}</Label>
                  <Input
                    defaultValue={brand[field]}
                    onBlur={e => updateBrand(field, e.target.value)}
                    className="h-9 text-sm border-border/60"
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
          </Section>
        )}

        {paymentsProfile && (
          <Section icon={Store} title="TPE / In-store payments">
            <div className="space-y-4">
              {[
                { field: "tpe_provider", label: "TPE provider", placeholder: "Worldline, SumUp..." },
                { field: "terminal_count", label: "Number of terminals", placeholder: "2" },
                { field: "monthly_terminal_rental", label: "Monthly rental", placeholder: "40" },
                { field: "fixed_banking_fees", label: "Fixed banking fees", placeholder: "15" },
                { field: "in_store_gmv", label: "In-store GMV", placeholder: "15000" },
                { field: "in_store_avg_ticket", label: "Average ticket", placeholder: "45" },
                { field: "tpe_transaction_fee_pct", label: "Transaction fee %", placeholder: "1.2" },
                { field: "contract_duration_months", label: "Contract duration (months)", placeholder: "24" },
                { field: "renewal_date", label: "Renewal date", placeholder: "2026-12-31" },
              ].map(({ field, label, placeholder }) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground/60">{label}</Label>
                  <Input
                    defaultValue={paymentsProfile[field]}
                    onBlur={e => updatePaymentsProfile(field, e.target.value)}
                    className="h-9 text-sm border-border/60"
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section icon={Mail} title="Email notifications">
          <MonthlyEmailPreference user={user} onUpdate={setUser} />
        </Section>

        <Section icon={Shield} title="Session">
          <p className="text-sm text-muted-foreground mb-5">
            Signing out will end your current session. You can always sign back in with your credentials.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => base44.auth.logout()}
            className="h-9 rounded-full px-5 text-xs font-medium gap-2 border-border/60"
          >
            <LogOut size={12} />
            Sign out of THE NoDE
          </Button>
        </Section>
      </div>
    </motion.div>
  );
}