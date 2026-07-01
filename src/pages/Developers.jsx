import { useEffect } from "react";
import Navbar from "@/components/landing/Navbar";
import { Sparkles, Key, Lock, Webhook, Zap, BookOpen, Bot, Shield, Activity } from "lucide-react";

/**
 * Public Developers page — Stripe/Shopify-style entry point.
 * Loads Swagger UI from CDN for interactive API exploration.
 */
export default function Developers() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.cambra.com";
  const openapiUrl = `${origin}/functions/apiOpenApiSpec`;

  useEffect(() => {
    // Load Swagger UI bundle from jsdelivr
    const cssId = "swagger-ui-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css";
      document.head.appendChild(link);
    }
    const scriptId = "swagger-ui-bundle";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js";
      s.onload = () => mountSwagger();
      document.body.appendChild(s);
    } else {
      mountSwagger();
    }
    function mountSwagger() {
      if (window.SwaggerUIBundle && document.getElementById("swagger-ui")) {
        window.SwaggerUIBundle({
          url: openapiUrl,
          dom_id: "#swagger-ui",
          deepLinking: true,
          docExpansion: "list",
          defaultModelsExpandDepth: 0,
        });
      }
    }
  }, [openapiUrl]);

  const features = [
    { Icon: Lock,    title: "OAuth 2.0 + API keys",       desc: "Authorization Code with PKCE, refresh tokens, scoped keys." },
    { Icon: Webhook, title: "Signed webhooks",            desc: "HMAC SHA-256 signed events, automatic retries with backoff." },
    { Icon: Bot,     title: "AI-native endpoints",        desc: "ChatGPT Actions, Claude MCP, Make / n8n / Zapier ready." },
    { Icon: Shield,  title: "Enterprise-grade security",  desc: "Rate limiting, request IDs, full audit log, IP logging." },
    { Icon: Activity,title: "Predictable JSON envelope",  desc: "Every response: { data, meta, request_id } with money objects." },
    { Icon: Zap,     title: "Versioned & extensible",     desc: "Modular /v1/ resources, ready for partners & embedded agents." },
  ];

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-16 px-5 overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />
        <div className="absolute -top-32 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.18] pointer-events-none" />
        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm">
            <Sparkles className="h-3 w-3 text-cambra-cyan" />
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">CAMBRA API · v1</span>
          </div>
          <h1 className="font-display text-[clamp(2.4rem,6vw,4.5rem)] font-black tracking-[-0.045em] leading-[0.92] mb-5">
            Build on the <span className="text-saas-gradient">infrastructure of commerce.</span>
          </h1>
          <p className="text-base md:text-lg text-foreground/70 max-w-2xl mx-auto leading-relaxed mb-8">
            A production-grade REST API with OpenAPI 3.1, OAuth 2.0 and signed webhooks. Designed from day one for AI assistants, automation tools and enterprise integrations.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href={openapiUrl} target="_blank" rel="noopener noreferrer"
              className="h-12 px-6 rounded-full bg-foreground text-background text-sm font-bold inline-flex items-center gap-2 hover:opacity-90 transition">
              <BookOpen className="h-4 w-4" /> View OpenAPI spec
            </a>
            <a href="/auth/start" target="_blank" rel="noopener noreferrer"
              className="h-12 px-6 rounded-full border border-border/60 text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary transition">
              <Key className="h-4 w-4" /> Get API key
            </a>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="py-16 px-5 border-b border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center mb-3">
                  <f.Icon className="h-4 w-4 text-cambra-blue" />
                </div>
                <div className="text-sm font-bold mb-1.5">{f.title}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integration cards */}
      <section className="py-16 px-5 border-b border-border/40">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl font-black tracking-[-0.03em] mb-2">Connect in minutes</h2>
          <p className="text-sm text-muted-foreground mb-8">Same API powers every integration. Pick your tool.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="text-xs font-bold tracking-[0.18em] uppercase text-muted-foreground mb-2">ChatGPT</div>
              <div className="text-sm font-bold mb-1.5">Custom GPT / Actions</div>
              <p className="text-xs text-muted-foreground mb-3">Import OpenAPI URL directly into ChatGPT Actions.</p>
              <code className="block text-[10px] font-mono p-2 rounded bg-secondary truncate">{openapiUrl}</code>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="text-xs font-bold tracking-[0.18em] uppercase text-muted-foreground mb-2">Claude</div>
              <div className="text-sm font-bold mb-1.5">Remote MCP Server</div>
              <p className="text-xs text-muted-foreground mb-3">Add as an MCP server with your API key as Bearer.</p>
              <code className="block text-[10px] font-mono p-2 rounded bg-secondary truncate">{origin}/functions/mcpServer</code>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="text-xs font-bold tracking-[0.18em] uppercase text-muted-foreground mb-2">Automation</div>
              <div className="text-sm font-bold mb-1.5">Make · n8n · Zapier</div>
              <p className="text-xs text-muted-foreground mb-3">Standard REST with Bearer auth and JSON envelope.</p>
              <code className="block text-[10px] font-mono p-2 rounded bg-secondary truncate">{origin}/functions/apiV1</code>
            </div>
          </div>
        </div>
      </section>

      {/* Swagger UI */}
      <section className="py-16 px-5">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-3xl font-black tracking-[-0.03em] mb-2">API Reference</h2>
          <p className="text-sm text-muted-foreground mb-6">Interactive Swagger UI. Try requests live with your API key.</p>
          <div id="swagger-ui" className="rounded-2xl border border-border/60 bg-card p-2 overflow-hidden" />
        </div>
      </section>
    </div>
  );
}