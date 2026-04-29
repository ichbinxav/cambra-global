import AuditModuleCard from "@/components/analyzer/AuditModuleCard";

const MODULES = [
  {
    key: "payments",
    eyebrow: "Payments",
    title: "Audit your Payments",
    description: "Analyze PSP fees, card rates, terminal costs, chargebacks and effective payment rate.",
    cta: "Start payments audit",
  },
  {
    key: "shipping",
    eyebrow: "Shipping",
    title: "Audit your Shipping",
    description: "Review shipping costs, carrier fees, fulfillment costs, returns and delivery zones.",
    cta: "Start shipping audit",
  },
  {
    key: "saas",
    eyebrow: "SaaS",
    title: "Audit your SaaS Stack",
    description: "Analyze Shopify, Klaviyo, Gorgias, apps, subscriptions and duplicated tools.",
    cta: "Start SaaS audit",
  },
  {
    key: "upload",
    eyebrow: "Data",
    title: "Connect / Upload Data",
    description: "Connect tools or upload invoices, PSP statements and documents for deeper analysis.",
    cta: "Connect tools / Upload docs",
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