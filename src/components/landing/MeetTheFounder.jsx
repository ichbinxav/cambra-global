import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { X, Quote } from "lucide-react";

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
        <div className="mb-12 md:mb-16 text-center">
          <div className="flex items-center gap-2 mb-5 w-fit mx-auto px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">Meet the founder</span>
          </div>
          <h2 className="font-display text-[clamp(2.4rem,6vw,4.2rem)] font-black tracking-[-0.045em] leading-[0.92] max-w-4xl mx-auto">
            A note from <span className="text-saas-gradient">the founder</span>.
          </h2>
        </div>

        <div className="grid grid-cols-5 gap-3 md:gap-6 items-stretch">
          {/* Photo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative col-span-2"
          >
            <img
              src="https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/f1e34eda8_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg"
              alt="Xavier M. Contero, Founder of CAMBRA"
              className="w-full h-full object-cover rounded-[1.25rem]"
            />
          </motion.div>

          {/* Short quote card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="cambra-card p-4 md:p-8 flex flex-col justify-between col-span-3"
          >
            <Quote className="h-5 w-5 md:h-8 md:w-8 text-cambra-cyan mb-2 opacity-90" strokeWidth={1.5} />
            <div className="flex-1">
              <p className="text-[11px] md:text-base font-medium leading-snug text-white mb-1.5 md:mb-3">
                After years inside global companies, I realized independent brands were operating without the infrastructure they deserved.
              </p>

              <p className="text-white/65 text-[10px] md:text-sm font-light">
                That's why I started CAMBRA.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 mt-4 md:mt-6">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] md:text-sm font-bold text-white truncate">Xavier M. Contero</p>
              </div>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm shrink-0">
                <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-[0.2em] text-white/75">Founder</span>
              </div>
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
                <div className="flex items-center gap-2 mb-5 w-fit px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">From the founder</span>
                </div>

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