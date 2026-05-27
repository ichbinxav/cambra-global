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
    <div className="relative min-h-screen bg-background font-inter overflow-hidden">
      <Navbar />
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 dot-grid opacity-50" />
        <div className="absolute -top-32 left-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.18]" />
        <div className="absolute top-1/3 -right-32 w-[30rem] h-[30rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.14]" />
      </div>
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