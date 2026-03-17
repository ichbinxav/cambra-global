import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5">
          <span className="text-lg font-semibold tracking-tight">THE N✱DE</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a href="#how" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it works</a>
          <a href="#analyzer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Analyzer</a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          <Link to="/Analyzer">
            <Button variant="outline" size="sm" className="rounded-full text-xs tracking-wide">
              Run Analyzer
            </Button>
          </Link>
          <Link to="/Onboarding">
            <Button size="sm" className="rounded-full text-xs tracking-wide">
              Join THE NODE
            </Button>
          </Link>
          <Link to="/Dashboard">
            <Button variant="ghost" size="sm" className="rounded-full text-xs tracking-wide">
              Dashboard →
            </Button>
          </Link>
        </div>

        <button className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="md:hidden border-t border-border bg-background px-6 py-6 space-y-4"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <a href="#how" className="block text-sm text-muted-foreground" onClick={() => setOpen(false)}>How it works</a>
            <a href="#analyzer" className="block text-sm text-muted-foreground" onClick={() => setOpen(false)}>Analyzer</a>
            <a href="#pricing" className="block text-sm text-muted-foreground" onClick={() => setOpen(false)}>Pricing</a>
            <Link to="/Analyzer" className="block">
              <Button variant="outline" size="sm" className="w-full rounded-full text-xs">Run Analyzer</Button>
            </Link>
            <Link to="/Dashboard" className="block">
              <Button size="sm" className="w-full rounded-full text-xs">Enter Network</Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}