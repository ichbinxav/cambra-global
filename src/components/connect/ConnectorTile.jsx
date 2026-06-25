import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Loader2, XCircle } from 'lucide-react';
import ToolLogo from '@/components/shared/ToolLogo';

const KEY_TO_TOOL = {
  drive: { name: 'Google Drive', logoName: 'google analytics', fallback: 'Drive' },
  sheets: { name: 'Google Sheets', logoName: 'google analytics', fallback: 'Sheets' },
  gmail: { name: 'Gmail', logoName: 'google analytics', fallback: 'Gmail' },
  slack: { name: 'Slack', logoName: 'slack', fallback: 'Slack' },
};

export default function ConnectorTile({ title, note, connectorId, functionName, connectorKey }) {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setError('');
    if (!connectorId) return;
    try {
      const res = await base44.functions.invoke(functionName, { connectorId });
      const ok = !!res?.data?.connected;
      setConnected(ok);
    } catch (e) {
      setConnected(false);
    }
  }, [functionName, connectorId]);

  useEffect(() => {
    (async () => {
      const isA = await base44.auth.isAuthenticated();
      setAuthed(isA);
      if (isA && connectorId) {
        await fetchData();
      }
      setLoading(false);
    })();
  }, [connectorId, fetchData]);

  const handleConnect = async () => {
    try {
      await base44.functions.invoke('securityAuditLog', { event_type: 'connect_attempt', connector: connectorKey, success: true });
      const url = await base44.connectors.connectAppUser(connectorId);
      const popup = window.open(url, '_blank', 'width=500,height=700');
      const timer = setInterval(async () => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          const ok = await fetchData();
          await base44.functions.invoke('securityAuditLog', { event_type: 'integration_access_check', connector: connectorKey, success: !!ok });
        }
      }, 600);
    } catch (e) {
      setError('Connection failed');
      try { await base44.functions.invoke('securityAuditLog', { event_type: 'failure', connector: connectorKey, success: false }); } catch {}
    }
  };

  const handleDisconnect = async () => {
    try {
      await base44.connectors.disconnectAppUser(connectorId);
      setConnected(false);
      await base44.functions.invoke('securityAuditLog', { event_type: 'disconnect', connector: connectorKey, success: true });
    } catch (e) {
      setError('Disconnect failed');
      try { await base44.functions.invoke('securityAuditLog', { event_type: 'failure', connector: connectorKey, success: false }); } catch {}
    }
  };

  const pendingSetup = !connectorId;
  const toolMeta = KEY_TO_TOOL[connectorKey] || { name: title, logoName: title, fallback: title?.slice(0,2) };

  return (
    <div className="group p-4 rounded-2xl border border-border/60 bg-white transition-all hover:border-foreground/40 hover:-translate-y-[1px]">
      <div className="flex items-start gap-3">
        <ToolLogo name={toolMeta.logoName} size={20} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm tracking-tight text-foreground">{title}</p>
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/60" />
            ) : connected ? (
              <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.15em] font-bold text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-foreground" />
                Live
              </span>
            ) : error ? (
              <XCircle className="w-3.5 h-3.5 text-red-500" />
            ) : null}
          </div>
          {note && <p className="text-[11px] text-muted-foreground mt-0.5 max-w-sm">{note}</p>}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px]">
        <span className="px-2 py-0.5 rounded-full border border-border/60 bg-secondary/50 uppercase tracking-[0.14em] font-semibold text-muted-foreground">
          {pendingSetup ? 'Setup pending' : connected ? 'Connected' : 'Not connected'}
        </span>
        {!authed && (
          <span className="text-muted-foreground/60">· Sign in to connect</span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {!authed ? (
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => base44.auth.redirectToLogin(window.location.href)}>
            Sign in
          </Button>
        ) : pendingSetup ? (
          <Button size="sm" variant="outline" className="rounded-full" disabled>
            Awaiting ID
          </Button>
        ) : connected ? (
          <Button size="sm" variant="outline" className="rounded-full" onClick={handleDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" className="rounded-full bg-foreground text-background hover:opacity-90" onClick={handleConnect}>
            Connect
          </Button>
        )}
        {connected && (
          <Button size="sm" variant="ghost" className="rounded-full" onClick={fetchData}>Refresh</Button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}