import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { ArrowRight, X, Quote } from "lucide-react";

/**
 * MeetTheFounder — short founder note with CTA to open the full letter in a modal.
 */
export default function MeetTheFounder() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [open, setOpen] = useState(false);

  // Allow opening via hash (#founder-letter) e.g. from navbar link
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === "#founder-letter") setOpen(true);
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      if (window.location.hash === "#founder-letter") {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <section
      id="founder"
      ref={ref}
      className="py-20 md:py-28 px-5 border-t border-border/40 bg-background relative overflow-hidden"
    >
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="max-w-5xl mx-auto relative">
        <div className="mb-10 md:mb-14">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-3 font-mono">
            Meet the founder
          </p>
          <h2 className="font-display text-[clamp(1.8rem,4vw,2.8rem)] font-black tracking-[-0.04em] leading-[0.95] max-w-2xl">
            A note from <span className="text-saas-gradient">the founder</span>.
          </h2>
        </div>

        <div className="grid grid-cols-[120px_1fr] md:grid-cols-[220px_1fr] gap-3 md:gap-10 items-start">
          {/* Photo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-[120px] md:w-[220px] shrink-0"
          >
            <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-border/40 bg-secondary/50">
              <img
                src="https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/f1e34eda8_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg"
                alt="Xavier M. Contero, Founder of CAMBRA"
                className="w-full h-full object-cover"
              />
            </div>
          </motion.div>

          {/* Short quote card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-2xl border border-border/40 bg-secondary/30 p-4 md:p-8 h-fit"
          >
            <Quote className="h-7 w-7 md:h-12 md:w-12 text-saas-gradient -ml-3.5 -mt-3.5 md:-ml-4 md:-mt-4 opacity-80 absolute" strokeWidth={1.5} />
            <p className="text-sm md:text-lg font-medium leading-snug text-foreground mb-3 md:mb-4">
              After years inside global companies, I realized independent brands were operating without the infrastructure they deserved.
            </p>

            <p className="text-foreground/70 text-xs md:text-sm font-light mb-3 md:mb-4">
              That's why I started CAMBRA.
            </p>

            <div className="flex items-start md:items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm font-bold text-foreground truncate">Xavier M. Contero</p>
                <p className="text-[9px] md:text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mt-0.5">
                  Founder
                </p>
              </div>
              <button
                onClick={() => setOpen(true)}
                className="h-10 w-10 rounded-full border border-foreground/20 flex items-center justify-center hover:bg-foreground hover:text-background transition-all shrink-0"
                aria-label="Read full letter"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Full letter modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-background/80 backdrop-blur-md"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-2xl"
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 h-9 w-9 rounded-full border border-border/60 bg-background flex items-center justify-center hover:bg-foreground hover:text-background hover:border-foreground transition-all z-10"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="p-8 md:p-12">
                <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-4 font-mono">
                  From the founder
                </p>

                <div className="space-y-5 text-[15px] md:text-base leading-[1.75] text-foreground/85 font-light">
                  <p>
                    After years working inside global companies, I realized something strange:
                  </p>
                  <p className="text-foreground font-medium">
                    Independent brands were building incredible businesses; yet still operating without the infrastructure, leverage, and conditions usually reserved for much larger companies.
                  </p>
                  <p>
                    Too many founders were negotiating alone.<br />
                    Overpaying silently.<br />
                    Solving the same operational problems over and over again.
                  </p>
                  <p>
                    Payments. Shipping. Software. Operations…<br />
                    Everyone rebuilding the same infrastructure from scratch.
                  </p>
                  <p className="text-foreground font-medium">
                    So I started CAMBRA.
                  </p>
                  <p>
                    Not as another tool. Not as an agency.<br />
                    But as infrastructure for independent commerce.
                  </p>
                  <p>
                    We're still early and always building.<br />
                    But our path is becoming very clear.
                  </p>
                  <p className="text-foreground font-medium">
                    Join us.
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-border/40">
                  <p className="text-xl font-black tracking-[-0.03em] text-foreground">
                    Xavier M. Contero
                  </p>
                  <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/50 mt-2">
                    Founder, CAMBRA
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}