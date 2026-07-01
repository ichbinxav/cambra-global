import React, { useState, useRef } from "react";
import { useToast } from "@/components/shared/Toast.jsx";

const PUBLIC_ROUTES = [
  "/",
  "/Landing",
  "/Onboarding",
  "/Analyzer",
  "/ConnectTools",
  "/StripeAnalyzer",
  "/Results",
  "/Privacy",
  "/Terms",
];

const AUThed_ROUTES = [
  "/Dashboard",
  "/Reports",
  "/Network",
  "/Deals",
  "/Insights",
  "/InsightDetail",
  "/Account",
  "/ProviderPortal",
];

const ADMIN_ROUTES = [
  "/admin",
  "/admin/users",
  "/admin/applications",
  "/admin/pipeline",
  "/admin/deals",
  "/admin/providers",
  "/admin/revenue",
  "/admin/benchmarks",
  "/admin/contracts",
  "/admin/integrations",
];

function RouteRow({ route, html }) {
  const { toast } = useToast();
  const taRef = useRef(null);
  const handleCopy = async () => {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      toast.success(`Copiado: ${route}`);
    } catch {
      // fallback select
      try {
        taRef.current?.select();
        document.execCommand("copy");
        toast.success(`Copiado (fallback): ${route}`);
      } catch {}
    }
  };
  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between gap-2">
        <code className="text-xs text-muted-foreground">{route}</code>
        <button
          onClick={handleCopy}
          disabled={!html}
          className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-50"
        >Copiar</button>
      </div>
      <textarea
        ref={taRef}
        readOnly
        value={html || "(pendiente / requiere carga)"}
        className="w-full h-40 text-xs font-mono bg-background border border-border rounded-md p-2"
      />
    </div>
  );
}

export default function DevExport() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const loadSet = async (routes) => {
    setLoading(true);
    const settled = (r) => new Promise((resolve) => setTimeout(resolve, r));

    for (const route of routes) {
      await new Promise((resolve) => {
        const iframe = document.createElement("iframe");
        iframe.style.position = "absolute";
        iframe.style.left = "-9999px";
        iframe.width = "1";
        iframe.height = "1";
        iframe.src = `${window.location.origin}${route}?dev_export=1`;
        const handle = async () => {
          try {
            // Give the SPA a moment to render content
            await settled(900);
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            const html = doc?.documentElement?.outerHTML || "";
            setResults((prev) => ({ ...prev, [route]: html }));
            try {
              // redacted: DOM export logs disabled in production
            } catch {}

          } catch (e) {
            setResults((prev) => ({ ...prev, [route]: `/* ERROR: ${e?.message || e} */` }));
          } finally {
            iframe.removeEventListener("load", handle);
            iframe.remove();
            resolve();
          }
        };
        iframe.addEventListener("load", handle);
        containerRef.current?.appendChild(iframe);
      });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-5 space-y-4">
      <h1 className="text-xl font-bold">Exportador de DOM (exacto)</h1>
      <p className="text-sm text-muted-foreground">
        Carga cada ruta en un iframe same-origin y captura document.documentElement.outerHTML exactamente como se renderiza.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => loadSet(PUBLIC_ROUTES)}
          className="px-3 py-2 text-sm rounded-md border border-border hover:bg-accent"
          disabled={loading}
        >Cargar páginas públicas</button>
        <button
          onClick={() => loadSet(AUThed_ROUTES)}
          className="px-3 py-2 text-sm rounded-md border border-border hover:bg-accent"
          disabled={loading}
        >Cargar páginas de usuario (requiere login)</button>
        <button
          onClick={() => loadSet(ADMIN_ROUTES)}
          className="px-3 py-2 text-sm rounded-md border border-border hover:bg-accent"
          disabled={loading}
        >Cargar páginas admin (requiere admin)</button>
        {loading && <span className="text-xs text-muted-foreground">Cargando…</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          ...PUBLIC_ROUTES,
          ...AUThed_ROUTES,
          ...ADMIN_ROUTES,
        ].map((r) => (
          <RouteRow key={r} route={r} html={results[r]} />
        ))}
      </div>

      <div ref={containerRef} />
    </div>
  );
}