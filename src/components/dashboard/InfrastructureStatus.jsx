import { Plug, CreditCard, Truck, Package, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

export default function InfrastructureStatus({ latest }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Your infrastructure</p>
        <Link to="/ConnectTools">
          <button className="text-[11px] font-semibold text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1">
            <Plug size={10} /> Connect tools
          </button>
        </Link>
      </div>
      <div className="divide-y divide-border/20">
        {[
          { label: "Payments", value: latest.details?.payment_current_rate ? `${latest.details.payment_current_rate.toFixed(1)}% fee rate` : "Using estimate", status: "warn", icon: CreditCard },
          { label: "Shipping", value: latest.details?.shipping_current_avg ? `€${latest.details.shipping_current_avg.toFixed(2)}/shipment` : "Rate not connected", status: "warn", icon: Truck },
          { label: "SaaS stack", value: latest.details?.saas_current_total ? `€${latest.details.saas_current_total.toLocaleString()}/mo` : "Tools not listed", status: "neutral", icon: Package },
        ].map((row, i) => (
          <div key={i} className="px-6 py-3.5 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <row.icon size={12} className="text-muted-foreground/50" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground/70 w-20 shrink-0">{row.label}</p>
            <p className="text-xs font-bold flex-1 tabular-nums">{row.value}</p>
            {row.status === "warn" ? (
              <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-500/[0.08] border border-orange-500/20 px-2 py-0.5 rounded-full">
                <AlertTriangle size={8} /> Estimated
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40 bg-secondary px-2 py-0.5 rounded-full">
                Estimated
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}