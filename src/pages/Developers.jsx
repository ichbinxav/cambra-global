import { useEffect } from "react";
import MarketingPageShell from "@/components/landing/MarketingPageShell";
import { Key, Lock, Webhook, Zap, BookOpen, Bot, Shield, Activity } from "lucide-react";

/**
 * Public Developers page — Stripe/Shopify-style entry point.
 * Loads Swagger UI from CDN for interactive API exploration.
 */
export default function Developers() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.cambra.com";
  const openapiUrl = `${origin}/functions/apiOpenApiSpec`;

  useEffect(() => {
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

  const surfaceCard = {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.08)",
  };
  const codeStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.85)",
  };

  return (
    <MarketingPageShell
      eyebrow="CAMBRA API · v1"
      title="Build on the"
      titleAccent="infrastructure of commerce."
      subtitle="A production-grade REST API with OpenAPI 3.1, OAuth 2.0 and signed webhooks. Designed from day one for AI assistants, automation tools and enterprise integrations."
      heroActions={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href={openapiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-12 px-6 rounded-full text-sm font-bold inline-flex items-center gap-2 transition-all hover:translate-y-[-1px]"
            style={{
              background: "#ffffff",
              color: "#06080F",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px -12px rgba(34,211,238,0.45)",
            }}
          >
            <BookOpen className="h-4 w-4" /> View OpenAPI spec
          </a>
          <a
            href="/auth/start"
            target="_blank"
            rel="noopener noreferrer"
            className="h-12 px-6 rounded-full text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.20)", color: "rgba(255,255,255,0.85)" }}
          >
            <Key className="h-4 w-4" /> Get API key
          </a>
        </div>
      }
    >
      {/* Feature grid */}
      <section className="mb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl p-5" style={surfaceCard}>
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.20)" }}
              >
                <f.Icon className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="text-sm font-bold mb-1.5 text-white">{f.title}</div>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Integration cards */}
      <section className="mb-16">
        <h2
          className="mb-2 text-white"
          style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em" }}
        >
          Connect in minutes
        </h2>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.55)" }}>
          Same API powers every integration. Pick your tool.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "ChatGPT", title: "Custom GPT / Actions", desc: "Import OpenAPI URL directly into ChatGPT Actions.", code: openapiUrl },
            { label: "Claude", title: "Remote MCP Server", desc: "Add as an MCP server with your API key as Bearer.", code: `${origin}/functions/mcpServer` },
            { label: "Automation", title: "Make · n8n · Zapier", desc: "Standard REST with Bearer auth and JSON envelope.", code: `${origin}/functions/apiV1` },
          ].map(card => (
            <div key={card.label} className="rounded-2xl p-5" style={surfaceCard}>
              <div className="text-xs font-bold tracking-[0.18em] uppercase mb-2 text-cyan-300/80">{card.label}</div>
              <div className="text-sm font-bold mb-1.5 text-white">{card.title}</div>
              <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>{card.desc}</p>
              <code className="block text-[10px] font-mono p-2 rounded truncate" style={codeStyle}>{card.code}</code>
            </div>
          ))}
        </div>
      </section>

      {/* Swagger UI */}
      <section>
        <h2
          className="mb-2 text-white"
          style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em" }}
        >
          API Reference
        </h2>
        <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>
          Interactive Swagger UI. Try requests live with your API key.
        </p>
        <div id="swagger-ui" className="rounded-2xl p-2 overflow-hidden bg-white" />
      </section>
    </MarketingPageShell>
  );
}