import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "bg-background/90 backdrop-blur-xl border-b border-border/50 shadow-sm" : "bg-transparent"
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5">
          <span className="text-base font-bold tracking-tight">THE N✱DE</span>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          <a href="#how" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it works</a>
          <a href="#analyzer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Analyzer</a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link to="/Analyzer">
            <Button variant="ghost" size="sm" className="rounded-full text-xs h-8 px-4">
              Run Analyzer
            </Button>
          </Link>
          <Link to="/Dashboard">
            <Button variant="ghost" size="sm" className="rounded-full text-xs h-8 px-4">
              Dashboard
            </Button>
          </Link>
          <Link to="/Onboarding">
            <Button size="sm" className="rounded-full text-xs h-8 px-5 font-medium">
              Join THE Node →
            </Button>
          </Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl px-6 py-6 space-y-4"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <a href="#how" className="block text-sm text-muted-foreground py-1" onClick={() => setOpen(false)}>How it works</a>
            <a href="#analyzer" className="block text-sm text-muted-foreground py-1" onClick={() => setOpen(false)}>Analyzer</a>
            <a href="#pricing" className="block text-sm text-muted-foreground py-1" onClick={() => setOpen(false)}>Pricing</a>
            <div className="pt-2 space-y-2">
              <Link to="/Analyzer" className="block" onClick={() => setOpen(false)}>
                <Button variant="outline" size="sm" className="w-full rounded-full text-xs">Run Analyzer</Button>
              </Link>
              <Link to="/Onboarding" className="block" onClick={() => setOpen(false)}>
                <Button size="sm" className="w-full rounded-full text-xs">Join THE Node →</Button>
              </Link>
              <Link to="/Dashboard" className="block" onClick={() => setOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full rounded-full text-xs">Dashboard</Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}