import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Key, Webhook, Activity, Plug, BookOpen, Lock, Building2, BarChart3, ShieldCheck } from "lucide-react";
import ApiKeyDialog from "@/components/admin/integrations/ApiKeyDialog";
import ApiKeysTable from "@/components/admin/integrations/ApiKeysTable";
import WebhooksTable from "@/components/admin/integrations/WebhooksTable";
import ActivityLogTable from "@/components/admin/integrations/ActivityLogTable";
import DeveloperDocsPanel from "@/components/admin/integrations/DeveloperDocsPanel";
import OAuthAppsPanel from "@/components/admin/integrations/OAuthAppsPanel";
import OrganizationsPanel from "@/components/admin/integrations/OrganizationsPanel";
import UsageAndDLQPanel from "@/components/admin/integrations/UsageAndDLQPanel";
import ApiSelfTestPanel from "@/components/admin/integrations/ApiSelfTestPanel";
import FlowSelfTestPanel from "@/components/admin/integrations/FlowSelfTestPanel";

export default function AdminApiIntegrations() {
  const [keys, setKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [k, w, l] = await Promise.all([
      base44.entities.ApiKey.list("-created_date", 100),
      base44.entities.WebhookEndpoint.list("-created_date", 100),
      base44.entities.ApiActivityLog.list("-created_date", 100),
    ]);
    setKeys(k); setWebhooks(w); setLogs(l);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const activeKeys = keys.filter(k => k.status === "active").length;
  const totalCalls = keys.reduce((s, k) => s + (k.usage_count || 0), 0);
  const connectedTools = new Set(keys.filter(k => k.status === "active").map(k => k.tool_name)).size;

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">External integrations</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">API & Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
            Connect Claude, ChatGPT, Make, n8n, Zapier or custom agents to CAMBRA through scoped API keys and webhooks.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New API key
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-8">
        <StatCard icon={Key} label="Active keys" value={activeKeys} />
        <StatCard icon={Plug} label="Connected tools" value={connectedTools} />
        <StatCard icon={Activity} label="Total API calls" value={totalCalls.toLocaleString()} />
        <StatCard icon={Webhook} label="Webhooks" value={webhooks.filter(w => w.status === "active").length} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys" className="gap-2"><Key className="h-3.5 w-3.5" /> API keys</TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2"><Webhook className="h-3.5 w-3.5" /> Webhooks</TabsTrigger>
          <TabsTrigger value="oauth" className="gap-2"><Lock className="h-3.5 w-3.5" /> OAuth Apps</TabsTrigger>
          <TabsTrigger value="orgs" className="gap-2"><Building2 className="h-3.5 w-3.5" /> Organizations</TabsTrigger>
          <TabsTrigger value="usage" className="gap-2"><BarChart3 className="h-3.5 w-3.5" /> Usage & DLQ</TabsTrigger>
          <TabsTrigger value="tests" className="gap-2"><ShieldCheck className="h-3.5 w-3.5" /> API Self-tests</TabsTrigger>
          <TabsTrigger value="flow" className="gap-2"><ShieldCheck className="h-3.5 w-3.5" /> Flow Tests</TabsTrigger>
          <TabsTrigger value="activity" className="gap-2"><Activity className="h-3.5 w-3.5" /> Activity</TabsTrigger>
          <TabsTrigger value="docs" className="gap-2"><BookOpen className="h-3.5 w-3.5" /> Docs</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="mt-6">
          <ApiKeysTable keys={keys} loading={loading} onChanged={load} />
        </TabsContent>

        <TabsContent value="webhooks" className="mt-6">
          <WebhooksTable webhooks={webhooks} onChanged={load} />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ActivityLogTable logs={logs} />
        </TabsContent>

        <TabsContent value="oauth" className="mt-6">
          <OAuthAppsPanel />
        </TabsContent>

        <TabsContent value="orgs" className="mt-6">
          <OrganizationsPanel />
        </TabsContent>

        <TabsContent value="usage" className="mt-6">
          <UsageAndDLQPanel />
        </TabsContent>

        <TabsContent value="tests" className="mt-6">
          <ApiSelfTestPanel />
        </TabsContent>

        <TabsContent value="flow" className="mt-6">
          <FlowSelfTestPanel />
        </TabsContent>

        <TabsContent value="docs" className="mt-6">
          <DeveloperDocsPanel />
        </TabsContent>
      </Tabs>

      <ApiKeyDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={load} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}