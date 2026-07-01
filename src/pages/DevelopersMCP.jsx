import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Check, Terminal, Sparkles, Shield, Activity, Code, Key } from "lucide-react";
import Navbar from "@/components/landing/Navbar";

function CopyBlock({ children, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === "string" ? children : "";
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="bg-[#0a0d18] text-[#cbd5e1] text-[12px] leading-relaxed font-mono p-4 pr-12 rounded-xl border border-white/10 overflow-x-auto">
        <code>{children}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded-md bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition"
        aria-label={label}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

const MCP_URL = typeof window !== "undefined" ? `${window.location.origin}/functions/mcpServer` : "https://your-cambra-app.base44.app/functions/mcpServer";

const TOOLS = [
  { name: "list_brands", scope: "read:brands", desc: "List CAMBRA brands" },
  { name: "get_brand", scope: "read:brands", desc: "Get a brand by id" },
  { name: "summarize_brand", scope: "read:brands", desc: "AI brand summary with recoverable margin" },
  { name: "list_analyses", scope: "read:analyses", desc: "Latest infrastructure analyses" },
  { name: "get_analysis", scope: "read:analyses", desc: "One analysis with full breakdown" },
  { name: "trigger_analysis", scope: "trigger:analysis", desc: "Run a fresh analyzer" },
  { name: "list_savings", scope: "read:savings", desc: "Per-brand savings figures" },
  { name: "list_trackers", scope: "read:trackers", desc: "Deal activation trackers" },
  { name: "update_tracker", scope: "update:trackers", desc: "Update tracker status / realized savings" },
  { name: "list_providers", scope: "read:providers", desc: "Provider partners" },
  { name: "list_documents", scope: "read:documents", desc: "Uploaded documents" },
  { name: "create_report", scope: "write:reports", desc: "Create a report document" },
  { name: "get_platform_kpis", scope: "read:kpis", desc: "Aggregated platform KPIs" },
  { name: "weekly_briefing", scope: "read:kpis", desc: "Executive briefing for last 7 days" },
  { name: "list_integrations", scope: "read:integrations", desc: "Connected third-party integrations" },
];

export default function DevelopersMCP() {
  return (
    <div
      className="min-h-screen text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />

      <div className="relative max-w-5xl mx-auto px-5 py-16 md:py-24">
        <Link to="/Developers" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Developers
        </Link>

        {/* HERO */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm mb-5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">MCP server · production</span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-black tracking-[-0.03em] leading-[0.92] mb-5">
            Connect Claude to <span className="gradient-text">CAMBRA</span>
          </h1>
          <p className="text-base md:text-lg text-foreground/70 max-w-2xl leading-relaxed">
            A production-grade Model Context Protocol (MCP) server. Exposes 15 CAMBRA tools — brands, analyses, recoverable margin, trackers, integrations and executive briefings — directly inside Claude.
          </p>
        </div>

        {/* Endpoint card */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 mb-12">
          <div className="flex items-center gap-2 mb-3 text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            <Terminal className="h-3.5 w-3.5" /> Endpoint
          </div>
          <CopyBlock>{MCP_URL}</CopyBlock>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><div className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">Protocol</div><div className="font-bold mt-0.5">MCP 2024-11-05</div></div>
            <div><div className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">Transport</div><div className="font-bold mt-0.5">HTTP / JSON-RPC</div></div>
            <div><div className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">Auth</div><div className="font-bold mt-0.5">Bearer token</div></div>
            <div><div className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">Rate limit</div><div className="font-bold mt-0.5">120 req/min</div></div>
          </div>
        </div>

        {/* CLAUDE DESKTOP */}
        <section className="mb-14">
          <h2 className="font-display text-2xl font-black tracking-[-0.02em] mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cambra-blue" /> Claude Desktop
          </h2>
          <p className="text-sm text-muted-foreground mb-5">Native MCP support. Edit your Claude Desktop config file and restart.</p>

          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-2">1 · Get your API key</div>
              <p className="text-sm text-foreground/70 mb-2">
                Go to <Link to="/admin/api-integrations" className="underline font-semibold">Admin → API Integrations</Link> and create a key with the scopes you need (e.g. <code className="text-xs bg-secondary px-1 rounded">read:brands</code>, <code className="text-xs bg-secondary px-1 rounded">read:analyses</code>, <code className="text-xs bg-secondary px-1 rounded">read:kpis</code>). Tool name = <strong>Claude</strong>.
              </p>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-2">2 · Open the Claude config</div>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="font-bold mb-1">macOS</div>
                  <code className="text-[11px] text-muted-foreground">~/Library/Application Support/Claude/claude_desktop_config.json</code>
                </div>
                <div className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="font-bold mb-1">Windows</div>
                  <code className="text-[11px] text-muted-foreground">%APPDATA%\Claude\claude_desktop_config.json</code>
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-2">3 · Add the CAMBRA server</div>
              <CopyBlock>{`{
  "mcpServers": {
    "cambra": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${MCP_URL}",
        "--header",
        "Authorization:Bearer cmb_live_YOUR_KEY_HERE"
      ]
    }
  }
}`}</CopyBlock>
              <p className="text-[11px] text-muted-foreground mt-2">
                Replace <code className="bg-secondary px-1 rounded">cmb_live_YOUR_KEY_HERE</code> with the key you created in step 1.
              </p>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-2">4 · Restart Claude Desktop</div>
              <p className="text-sm text-foreground/70">
                You'll see <strong>cambra</strong> appear in the tools menu (⚒). Try: <em>"Use cambra to give me this week's CAMBRA briefing"</em>.
              </p>
            </div>
          </div>
        </section>

        {/* CLAUDE.AI WEB */}
        <section className="mb-14">
          <h2 className="font-display text-2xl font-black tracking-[-0.02em] mb-2 flex items-center gap-2">
            <Code className="h-5 w-5 text-cambra-cyan" /> Claude.ai (web)
          </h2>
          <p className="text-sm text-muted-foreground mb-5">Add CAMBRA as a custom connector inside any Claude project.</p>
          <ol className="space-y-3 text-sm text-foreground/80 list-decimal pl-5">
            <li>Open a Claude <strong>Project</strong> → <strong>Settings</strong> → <strong>Connectors</strong>.</li>
            <li>Choose <strong>Add custom connector</strong> → <strong>MCP</strong>.</li>
            <li>Server URL: <code className="text-xs bg-secondary px-1.5 py-0.5 rounded font-mono">{MCP_URL}</code></li>
            <li>Authentication: <strong>Bearer token</strong> → paste your CAMBRA API key (<code className="text-xs bg-secondary px-1 rounded">cmb_live_…</code>).</li>
            <li>Save. Claude will call <code className="text-xs bg-secondary px-1 rounded">tools/list</code> automatically and surface all 15 CAMBRA tools.</li>
          </ol>
        </section>

        {/* TOOLS LIST */}
        <section className="mb-14">
          <h2 className="font-display text-2xl font-black tracking-[-0.02em] mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-cambra-blue" /> Tools exposed ({TOOLS.length})
          </h2>
          <p className="text-sm text-muted-foreground mb-5">Each tool is gated by an OAuth-style scope on your API key.</p>
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2.5 px-4 font-bold">Tool</th>
                  <th className="text-left py-2.5 px-4 font-bold">Required scope</th>
                  <th className="text-left py-2.5 px-4 font-bold">Description</th>
                </tr>
              </thead>
              <tbody>
                {TOOLS.map((t) => (
                  <tr key={t.name} className="border-t border-border/40">
                    <td className="py-2.5 px-4 font-mono text-xs font-bold">{t.name}</td>
                    <td className="py-2.5 px-4"><code className="text-[11px] bg-cambra-blue/10 text-cambra-blue px-1.5 py-0.5 rounded">{t.scope}</code></td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">{t.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* RESOURCES & PROMPTS */}
        <section className="mb-14 grid md:grid-cols-2 gap-5">
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <h3 className="text-sm font-bold mb-1">Resources</h3>
            <p className="text-[11px] text-muted-foreground mb-3">Pull addressable read-only context.</p>
            <ul className="space-y-2 text-xs">
              <li><code className="font-mono bg-secondary px-1.5 py-0.5 rounded">cambra://kpis/platform</code> — live platform KPIs</li>
              <li><code className="font-mono bg-secondary px-1.5 py-0.5 rounded">cambra://briefing/weekly</code> — last-7-days briefing</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <h3 className="text-sm font-bold mb-1">Prompts</h3>
            <p className="text-[11px] text-muted-foreground mb-3">Pre-baked Claude workflows.</p>
            <ul className="space-y-2 text-xs">
              <li><code className="font-mono bg-secondary px-1.5 py-0.5 rounded">audit_brand</code> — full brand infrastructure audit</li>
              <li><code className="font-mono bg-secondary px-1.5 py-0.5 rounded">weekly_review</code> — executive weekly review</li>
            </ul>
          </div>
        </section>

        {/* TEST */}
        <section className="mb-14">
          <h2 className="font-display text-2xl font-black tracking-[-0.02em] mb-2 flex items-center gap-2">
            <Terminal className="h-5 w-5 text-foreground" /> Test from your terminal
          </h2>
          <p className="text-sm text-muted-foreground mb-5">No client required — JSON-RPC over HTTP.</p>
          <CopyBlock>{`# 1 · Discover tools (no auth required)
curl -s ${MCP_URL} \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 2 · Call a tool (auth required)
curl -s ${MCP_URL} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer cmb_live_YOUR_KEY" \\
  -d '{
    "jsonrpc":"2.0","id":2,
    "method":"tools/call",
    "params":{ "name":"get_platform_kpis", "arguments":{} }
  }'`}</CopyBlock>
        </section>

        {/* SECURITY */}
        <section className="mb-14">
          <h2 className="font-display text-2xl font-black tracking-[-0.02em] mb-2 flex items-center gap-2">
            <Shield className="h-5 w-5 text-cambra-blue" /> Security
          </h2>
          <ul className="space-y-2.5 text-sm text-foreground/80">
            <li className="flex gap-2"><Key className="h-4 w-4 text-cambra-blue shrink-0 mt-0.5" /><span>API keys are SHA-256 hashed at rest — the raw token only appears once, at creation.</span></li>
            <li className="flex gap-2"><Shield className="h-4 w-4 text-cambra-blue shrink-0 mt-0.5" /><span>Scope-gated: each tool requires a specific scope; missing scope returns error <code className="bg-secondary px-1 rounded">-32004</code>.</span></li>
            <li className="flex gap-2"><Activity className="h-4 w-4 text-cambra-blue shrink-0 mt-0.5" /><span>Rate-limited at 120 requests/minute per principal (configurable per key).</span></li>
            <li className="flex gap-2"><Activity className="h-4 w-4 text-cambra-blue shrink-0 mt-0.5" /><span>Optional IP allowlist per key — out-of-range requests rejected (<code className="bg-secondary px-1 rounded">-32003</code>).</span></li>
            <li className="flex gap-2"><Activity className="h-4 w-4 text-cambra-blue shrink-0 mt-0.5" /><span>Every call is logged to the Activity Log with key prefix, scope, IP, user agent, duration and status.</span></li>
            <li className="flex gap-2"><Activity className="h-4 w-4 text-cambra-blue shrink-0 mt-0.5" /><span>OAuth 2.0 access tokens (<code className="bg-secondary px-1 rounded">cmb_at_…</code>) are also accepted for delegated user access.</span></li>
          </ul>
        </section>

        {/* FOOTER CTA */}
        <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-secondary/40 to-card p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">Need a key, want to test, or have questions?</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link to="/admin/api-integrations" className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold">Create API key</Link>
            <Link to="/Developers" className="inline-flex items-center gap-2 h-9 px-4 rounded-full border border-border text-xs font-bold">Full API reference</Link>
          </div>
        </div>
      </div>
    </div>
  );
}