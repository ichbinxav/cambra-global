import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Privacy() {
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
          <h1 className="text-[clamp(2.5rem,6vw,5rem)] font-black tracking-[-0.04em] leading-[0.88] mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm mb-16">Last updated: {new Date().getFullYear()}</p>

          <div className="space-y-10 text-sm text-muted-foreground leading-relaxed">
            {[
              {
                title: "1. What we collect",
                content: "We collect information you provide directly to us, such as your name, email address, brand information, financial benchmarks, and infrastructure data entered through the Analyzer. We also collect usage data to improve the platform."
              },
              {
                title: "2. How we use your data",
                content: "Your data is used to provide the THE NoDE platform, generate infrastructure analyses, calculate benchmarks, and personalize your dashboard. We do not sell your data to third parties. Aggregated, anonymized benchmarks may be used to improve the accuracy of network-wide analysis."
              },
              {
                title: "3. File upload & AI analysis",
                content: "When you upload files (PDF, Excel, CSV) through the Analyzer, they are processed by AI to extract structured financial and operational data. Uploaded files are stored securely and are only accessible by you. AI analysis is performed to help identify infrastructure inefficiencies. You maintain full ownership of your uploaded data."
              },
              {
                title: "4. AI usage",
                content: "THE NoDE uses large language models (LLMs) to power the Analyzer extraction, infrastructure scoring, and the AI assistant. Prompts sent to AI systems may include your uploaded data for analysis purposes. AI outputs are estimates and should not be treated as financial or legal advice."
              },
              {
                title: "5. Data storage & security",
                content: "All data is stored securely in encrypted databases. We use industry-standard security practices including TLS encryption for data in transit and AES-256 encryption for data at rest. Access to your data is strictly controlled."
              },
              {
                title: "6. GDPR compliance",
                content: "If you are in the European Economic Area, you have the right to access, correct, or delete your personal data at any time. You may also request a copy of your data or withdraw consent. Contact us at privacy@thenode.co for data requests."
              },
              {
                title: "7. Cookies",
                content: "We use essential cookies for authentication and session management. We do not use advertising or tracking cookies. You can disable cookies in your browser settings, but this may affect platform functionality."
              },
              {
                title: "8. Contact",
                content: "For any privacy-related questions or data requests, contact us at privacy@thenode.co"
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