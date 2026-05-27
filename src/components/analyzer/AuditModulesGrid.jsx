import AuditModuleCard from "@/components/analyzer/AuditModuleCard";
import { CreditCard, Truck, Store, Package, Shield, Upload } from "lucide-react";

const MODULES = [
  {
    key: "payments",
    eyebrow: "Payments",
    title: "Audit your Payments",
    description: "Analyze PSP fees, card rates, terminal costs, chargebacks and effective payment rate.",
    cta: "Start payments audit",
    icon: CreditCard,
  },
  {
    key: "shipping",
    eyebrow: "Shipping",
    title: "Audit your Shipping",
    description: "Review shipping costs, carrier fees, fulfillment costs, returns and delivery zones.",
    cta: "Start shipping audit",
    icon: Truck,
  },
  {
    key: "tpe",
    eyebrow: "In-store payments",
    title: "Audit your Card Terminals",
    description: "Review TPE providers, terminal rental, in-store fees, banking costs and contract lock-ins.",
    cta: "Start TPE audit",
    icon: Store,
  },
  {
    key: "saas",
    eyebrow: "SaaS",
    title: "Audit your SaaS Stack",
    description: "Analyze Shopify, Klaviyo, Gorgias, apps, subscriptions and duplicated tools.",
    cta: "Start SaaS audit",
    icon: Package,
  },
  {
    key: "insurance",
    eyebrow: "Insurance",
    title: "Insurance Audit",
    description: "Benchmark essential insurance costs like RC Pro, employee health cover and business protection.",
    cta: "Start insurance audit",
    icon: Shield,
  },
  {
    key: "upload",
    eyebrow: "Data",
    title: "Connect / Upload Data",
    description: "Connect tools or upload invoices, PSP statements and documents for deeper analysis.",
    cta: "Connect tools / Upload docs",
    icon: Upload,
  },
];

export default function AuditModulesGrid({ onSelectModule }) {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      {MODULES.map((module) => (
        <AuditModuleCard key={module.key} {...module} onClick={() => onSelectModule(module.key)} />
      ))}
    </section>
  );
}