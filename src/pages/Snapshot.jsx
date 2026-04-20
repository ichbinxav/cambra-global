import React from "react";
import { Button } from "@/components/ui/button";

// Gather raw source files (no links, full content)
const glob = (pattern) => import.meta.glob(pattern, { as: "raw", eager: true });

const entries = [
  ...Object.entries(glob('/src/App.jsx')),
  ...Object.entries(glob('/src/index.css')),
  ...Object.entries(glob('/tailwind.config.js')),
  ...Object.entries(glob('/src/pages/**/*.jsx')),
  ...Object.entries(glob('/src/pages/deals/**/*.jsx')),
  ...Object.entries(glob('/src/pages/admin/**/*.jsx')),
  ...Object.entries(glob('/src/components/landing/**/*.jsx')),
  ...Object.entries(glob('/src/components/deals/**/*.jsx')),
  ...Object.entries(glob('/src/components/stripe/**/*.jsx')),
  ...Object.entries(glob('/src/components/ui/*.{jsx,js}')),
  ...Object.entries(glob('/src/lib/**/*.{js,jsx}')),
  ...Object.entries(glob('/functions/**/*.js')),
]
  .map(([path, content]) => ({ path, content }))
  .sort((a, b) => a.path.localeCompare(b.path));

export default function Snapshot() {
  const handleScrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-background/70 bg-background/90 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold tracking-tight">Project Snapshot</h1>
            <p className="text-[11px] text-muted-foreground">Copia y pega desde aquí · docs/PROJECT_SNAPSHOT_B1-5.md</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleScrollTop}>Arriba</Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        <ul className="text-[11px] grid gap-1 mb-4">
          {entries.map((f) => (
            <li key={f.path} className="truncate text-muted-foreground/70">{f.path}</li>
          ))}
        </ul>
        <div className="space-y-6">
          {entries.map((file) => (
            <section key={file.path} className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-secondary/50 border-b border-border/50 text-xs font-semibold flex items-center justify-between">
                <span className="truncate">{file.path}</span>
              </div>
              <pre className="overflow-auto bg-card text-[11px] leading-relaxed p-3"><code>{file.content}</code></pre>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}