import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background font-inter">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-10 -ml-2 h-8 text-xs rounded-full px-3 text-muted-foreground">
            <ArrowLeft size={13} className="mr-1.5" /> Back
          </Button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-4">Legal</p>
          <h1 className="text-[clamp(2.5rem,6vw,5rem)] font-black tracking-[-0.04em] leading-[0.88] mb-4">Terms & Conditions</h1>
          <p className="text-muted-foreground text-sm mb-16">Last updated: {new Date().getFullYear()}</p>

          <div className="space-y-10 text-sm text-muted-foreground leading-relaxed">
            {[
              {
                title: "1. Acceptance",
                content: "By accessing or using THE NoDE platform, you agree to be bound by these Terms & Conditions. If you do not agree, do not use the platform. THE NoDE reserves the right to modify these terms at any time with notice."
              },
              {
                title: "2. Platform use",
                content: "THE NoDE provides infrastructure analysis, network access, and business intelligence tools for independent brands. The platform is intended for business use only. You must be authorized to represent the brand or business you register."
              },
              {
                title: "3. Analyzer and estimates",
                content: "All analyzer outputs, savings estimates, and infrastructure scores are estimates based on benchmarks and user-provided data. They are not financial guarantees. THE NoDE is not liable for business decisions made based on platform outputs. Always consult qualified advisors for financial decisions."
              },
              {
                title: "4. Data and confidentiality",
                content: "You retain ownership of all data you submit to the platform. By using the platform, you grant THE NoDE a limited license to process your data for the purpose of providing the service. Aggregated, anonymized data may be used to improve benchmarks. We will not share your identifiable data with third parties without consent."
              },
              {
                title: "5. Network directory",
                content: "The member directory is available exclusively to authenticated members. Directory listings are not endorsements. Brands are responsible for the accuracy of their own profile information. Contact information visible in the directory may only be used for legitimate business collaboration."
              },
              {
                title: "6. Pricing",
                content: "Current early-partner pricing is free of charge. THE NoDE reserves the right to introduce pricing in the future with reasonable advance notice. Existing members who joined under the free early-partner arrangement will receive preferential terms."
              },
              {
                title: "7. Limitation of liability",
                content: "THE NoDE is not liable for indirect, incidental, or consequential damages arising from your use of the platform. Our total liability is limited to the amounts you have paid for the service in the preceding 12 months."
              },
              {
                title: "8. Governing law",
                content: "These terms are governed by the laws of the European Union. Any disputes shall be resolved through good-faith negotiation or, if necessary, through arbitration."
              }
            ].map((section, i) => (
              <div key={i} className="pb-10 border-b border-border/40 last:border-0">
                <h2 className="text-base font-bold text-foreground mb-3">{section.title}</h2>
                <p>{section.content}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}