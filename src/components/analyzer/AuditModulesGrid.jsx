import AuditModuleCard from "@/components/analyzer/AuditModuleCard";
import { CreditCard, Truck, Package, Upload } from "lucide-react";

const MODULES = [
  {
    key: "payments",
    eyebrow: "Payments",
    title: "Audit your Payments",
    description: "Analyze Stripe / PayPal PSP fees and physical TPV / dataphone costs, chargebacks and effective payment rate.",
    cta: "Start payments audit",
    icon: CreditCard,
  },
  {
    key: "logistics",
    eyebrow: "Logistics",
    title: "Audit your Logistics",
    description: "Review carrier fees (DHL, FedEx) and 3PL / fulfillment / warehouse costs, returns and delivery zones.",
    cta: "Start logistics audit",
    icon: Truck,
  },
  {
    key: "saas",
    eyebrow: "Commerce SaaS",
    title: "Audit your Commerce SaaS",
    description: "Analyze Shopify, Klaviyo, apps & plugins, subscriptions and duplicated commerce tools.",
    cta: "Start SaaS audit",
    icon: Package,
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