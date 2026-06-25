import { useState } from "react";
import { Copy, Check, ExternalLink, Bot, Sparkles, FileJson, Radio } from "lucide-react";

const ENDPOINTS = {
  openapi: "/functions/apiOpenApiSpec",
  api: "/functions/apiV1",
  mcp: "/functions/mcpServer",
};

function CopyRow({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold shrink-0">{label}</span>
      <code className={`flex-1 truncate text-xs ${mono ? "font-mono" : ""}`}>{value}</code>
      <button onClick={onCopy} className="shrink-0 p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition">
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="relative rounded-lg border border-border/60 bg-[#0a0a0a] text-white">
      <button onClick={onCopy} className="absolute top-2 right-2 p-1.5 rounded bg-white/10 hover:bg-white/20 text-white/80 transition">
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="p-3 pr-10 overflow-x-auto text-[11px] font-mono leading-relaxed whitespace-pre">{children}</pre>
    </div>
  );
}

export default function DeveloperDocsPanel() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.cambra.com";
  const openapiUrl = `${origin}${ENDPOINTS.openapi}`;
  const apiBase = `${origin}${ENDPOINTS.api}`;
  const mcpUrl = `${origin}${ENDPOINTS.mcp}`;

  const curlExample = `curl -X GET "${apiBase}?path=/kpis&method=GET" \\
  -H "Authorization: Bearer cmb_live_YOUR_KEY"`;

  const mcpConfig = `{
  "mcpServers": {
    "cambra": {
      "url": "${mcpUrl}",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer cmb_live_YOUR_KEY"
      }
    }
  }
}`;

  const webhookSample = `// CAMBRA → Your endpoint
POST https://your-app.com/webhooks/cambra
Headers:
  Content-Type: application/json
  X-CAMBRA-Event: analysis_completed
  X-CAMBRA-Signature: <HMAC-SHA256 of body using your webhook secret>

Body:
{
  "event": "analysis_completed",
  "timestamp": "2026-06-25T10:00:00Z",
  "data": { "analysis_id": "...", "brand_id": "...", "total_savings": 24600 }
}`;

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="h-4 w-4 text-cambra-cyan" />
          <h3 className="text-sm font-black">Connect AI assistants & automation tools</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Plug Claude, ChatGPT, Make, n8n, Zapier or any custom agent into CAMBRA in minutes. API key auth today, OAuth-ready architecture for tomorrow.
        </p>
      </div>

      {/* ChatGPT */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <h3 className="text-sm font-bold">ChatGPT Actions / Custom GPT</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          In your Custom GPT → <em>Configure → Actions → Import from URL</em>. Authenticate with a CAMBRA API key as Bearer token.
        </p>
        <CopyRow label="OpenAPI URL" value={openapiUrl} />
        <a href={openapiUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-cambra-blue hover:underline">
          View raw OpenAPI spec <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Claude MCP */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4" />
          <h3 className="text-sm font-bold">Claude (Model Context Protocol)</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Add CAMBRA as a remote MCP server in Claude Desktop or Claude.ai. All 8 tools are exposed (list_brands, get_kpis, trigger_analysis…).
        </p>
        <CopyRow label="MCP URL" value={mcpUrl} />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Config snippet</div>
          <CodeBlock>{mcpConfig}</CodeBlock>
        </div>
      </div>

      {/* REST */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <h3 className="text-sm font-bold">REST API (Make, n8n, Zapier, custom)</h3>
        </div>
        <CopyRow label="Base URL" value={apiBase} />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Sample request</div>
          <CodeBlock>{curlExample}</CodeBlock>
        </div>
        <div className="text-[11px] text-muted-foreground">
          All endpoints accept <code className="font-mono px-1 py-0.5 bg-secondary rounded">?path=/...&method=GET|POST|PATCH</code> with body as JSON.
        </div>
      </div>

      {/* Webhooks */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4" />
          <h3 className="text-sm font-bold">Webhook events</h3>
        </div>
        <ul className="text-xs space-y-1.5 font-mono">
          <li>• <span className="font-semibold">new_brand_created</span> — fires when a brand signs up</li>
          <li>• <span className="font-semibold">new_document_uploaded</span> — fires on every file upload</li>
          <li>• <span className="font-semibold">analysis_completed</span> — fires when an analysis result is ready</li>
          <li>• <span className="font-semibold">savings_unlocked</span> — fires when a deal activation produces realized savings</li>
        </ul>
        <CodeBlock>{webhookSample}</CodeBlock>
        <div className="text-[11px] text-muted-foreground">
          Signature is HMAC SHA-256 of the raw body using your webhook's secret. Verify before trusting the payload.
        </div>
      </div>

      {/* OAuth ready */}
      <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-1">Roadmap</div>
        <p className="text-xs">
          OAuth 2.0 (per-user app authorization) is on the roadmap. API keys created today will continue to work — they're already tagged with <code className="font-mono px-1 py-0.5 bg-secondary rounded">auth_type</code> so we can migrate cleanly.
        </p>
      </div>
    </div>
  );
}