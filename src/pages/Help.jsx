import { useEffect, useState } from "react";
import Navbar from "@/components/landing/Navbar";
import HelpHero from "@/components/help/HelpHero";
import HelpSearch from "@/components/help/HelpSearch";
import CategoryGrid from "@/components/help/CategoryGrid";
import PopularArticles from "@/components/help/PopularArticles";
import HelpCTA from "@/components/help/HelpCTA";

export default function Help() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />
      {/* Ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.35,
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
        }}
      />
      <div className="relative">
        <HelpHero onSearchOpen={() => setSearchOpen(true)} />
        <CategoryGrid />
        <PopularArticles />
        <HelpCTA />
        <HelpSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </div>
  );
}