import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/92 backdrop-blur-2xl border-b border-border/40 shadow-sm"
          : "bg-transparent"
      }`}
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5 group">
          <span className="text-base font-black tracking-tight">THE N✱DE</span>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          <a href="#how" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it works</a>
          <a href="#analyzer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Analyzer</a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link to="/Dashboard">
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-4 text-xs text-muted-foreground">
              Dashboard
            </Button>
          </Link>
          <Link to="/Analyzer">
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-4 text-xs">
              Analyzer
            </Button>
          </Link>
          <Link to="/Onboarding">
            <Button size="sm" className="h-8 rounded-full px-5 text-xs font-semibold shadow-sm">
              Join THE NoDE →
            </Button>
          </Link>
        </div>

        <button className="md:hidden p-2 -mr-2" onClick={() => setOpen(!open)}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="md:hidden border-t border-border/40 bg-background/96 backdrop-blur-2xl px-6 py-7 space-y-5"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <a href="#how" className="block text-sm text-muted-foreground py-1" onClick={() => setOpen(false)}>How it works</a>
            <a href="#analyzer" className="block text-sm text-muted-foreground py-1" onClick={() => setOpen(false)}>Analyzer</a>
            <a href="#pricing" className="block text-sm text-muted-foreground py-1" onClick={() => setOpen(false)}>Pricing</a>
            <div className="pt-2 space-y-2 border-t border-border/40">
              <Link to="/Analyzer" className="block" onClick={() => setOpen(false)}>
                <Button variant="outline" size="sm" className="w-full rounded-full text-xs h-10">Run Analyzer</Button>
              </Link>
              <Link to="/Onboarding" className="block" onClick={() => setOpen(false)}>
                <Button size="sm" className="w-full rounded-full text-xs h-10 font-semibold">Join THE NoDE →</Button>
              </Link>
              <Link to="/Dashboard" className="block" onClick={() => setOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full rounded-full text-xs h-10">Dashboard</Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}