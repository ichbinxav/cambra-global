import React from "react";
import { Button } from "@/components/ui/button";

// Gather raw source files (no links, full content)
const fileLoaders = {
  ...import.meta.glob('/src/App.jsx', { as: 'raw' }),
  ...import.meta.glob('/src/index.css', { as: 'raw' }),
  ...import.meta.glob('/tailwind.config.js', { as: 'raw' }),
  ...import.meta.glob('/src/pages/**/*.jsx', { as: 'raw' }),
  ...import.meta.glob('/src/pages/deals/**/*.jsx', { as: 'raw' }),
  ...import.meta.glob('/src/pages/admin/**/*.jsx', { as: 'raw' }),
  ...import.meta.glob('/src/components/landing/**/*.jsx', { as: 'raw' }),
  ...import.meta.glob('/src/components/deals/**/*.jsx', { as: 'raw' }),
  ...import.meta.glob('/src/components/stripe/**/*.jsx', { as: 'raw' }),
  ...import.meta.glob('/src/components/ui/*.{jsx,js}', { as: 'raw' }),
  ...import.meta.glob('/src/lib/**/*.{js,jsx}', { as: 'raw' }),
  ...import.meta.glob('/functions/**/*.js', { as: 'raw' }),
};
const paths = Object.keys(fileLoaders).sort();

export default function Snapshot() {
  const [contents, setContents] = React.useState({});
  const [loadingPath, setLoadingPath] = React.useState(null);
  const loadFile = async (path) => {
    if (contents[path]) return;
    try {
      setLoadingPath(path);
      const mod = await fileLoaders[path]();
      setContents((prev) => ({ ...prev, [path]: mod?.default ?? mod }));
    } finally {
      setLoadingPath(null);
    }
  };

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
          {paths.map((p) => (
            <li key={p} className="truncate text-muted-foreground/70">{p}</li>
          ))}
        </ul>
        <div className="space-y-3">
          {paths.map((path) => (
            <details key={path} className="border border-border rounded-xl overflow-hidden group" onToggle={(e) => { if (e.currentTarget.open) loadFile(path); }}>
              <summary className="px-4 py-2 bg-secondary/50 hover:bg-secondary/60 cursor-pointer text-xs font-semibold flex items-center justify-between">
                <span className="truncate">{path}</span>
                <span className="ml-3 text-[10px] text-muted-foreground">{contents[path] ? 'abierto' : (loadingPath === path ? 'cargando…' : 'cerrado')}</span>
              </summary>
              {contents[path] ? (
                <pre className="overflow-auto bg-card text-[11px] leading-relaxed p-3"><code>{contents[path]}</code></pre>
              ) : (
                <div className="p-3 text-[11px] text-muted-foreground">Abre para cargar el contenido.</div>
              )}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}