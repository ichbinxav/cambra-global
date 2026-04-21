import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useI18n } from "@/lib/i18n.jsx";

export default function FooterSection() {
  const { t } = useI18n();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <footer className="mt-16">
      <section ref={ref} className="relative overflow-hidden py-16">
        <div className="absolute inset-0 pointer-events-none opacity-[0.05]" style={{backgroundImage:"radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize:"22px 22px"}}/>
        <div className="max-w-6xl mx-auto px-5">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="rounded-2xl border border-border/50 bg-card p-8 sm:p-10 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-2">{t('footer.tagline')}</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">{t('footer.headline')}</h2>
            <p className="text-muted-foreground mb-6">{t('footer.sub')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/Analyzer">
                <Button className="h-11 rounded-full px-7 text-sm font-bold bg-saas-gradient text-white">{t('footer.ctaSavings')}</Button>
              </Link>
              <Link to="/Onboarding">
                <Button variant="outline" className="h-11 rounded-full px-7 text-sm font-bold">{t('footer.cta')}</Button>
              </Link>
            </div>
            <p className="text-[11px] text-muted-foreground/50 mt-4">{t('footer.desc')}</p>
          </motion.div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 text-sm text-muted-foreground/60">
            <span>© {new Date().getFullYear()} THE NoDE</span>
            <div className="flex items-center gap-4">
              <Link to="/Privacy" className="hover:text-foreground">{t('footer.privacy')}</Link>
              <Link to="/Terms" className="hover:text-foreground">{t('footer.terms')}</Link>
            </div>
          </div>
        </div>
      </section>
    </footer>
  );
}