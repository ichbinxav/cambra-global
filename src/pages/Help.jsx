import { useEffect, useState } from "react";
import PublicPageShell from "@/components/shared/PublicPageShell";
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
    <PublicPageShell>
      <div className="relative">
        <HelpHero onSearchOpen={() => setSearchOpen(true)} />
        <CategoryGrid />
        <PopularArticles />
        <HelpCTA />
        <HelpSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </PublicPageShell>
  );
}