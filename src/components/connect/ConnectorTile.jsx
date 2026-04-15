import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, XCircle, Link as LinkIcon } from 'lucide-react';

export default function ConnectorTile({ title, note, connectorId, functionName }) {
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
      const url = await base44.connectors.connectAppUser(connectorId);
      const popup = window.open(url, '_blank', 'width=500,height=700');
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          fetchData();
        }
      }, 600);
    } catch (e) {
      setError('Connection failed');
    }
  };

  const handleDisconnect = async () => {
    try {
      await base44.connectors.disconnectAppUser(connectorId);
      setConnected(false);
    } catch (e) {
      setError('Disconnect failed');
    }
  };

  const pendingSetup = !connectorId;

  return (
    <div className="p-4 rounded-xl border border-border/50 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-muted-foreground/60" />
            <p className="font-semibold text-sm">{title}</p>
          </div>
          {note && <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">{note}</p>}
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/60" />
        ) : connected ? (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        ) : error ? (
          <XCircle className="w-4 h-4 text-red-500" />
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full border border-border/60 bg-secondary/50">
          {pendingSetup ? 'Setup pending' : connected ? 'Connected' : 'Not connected'}
        </span>
        {!authed && (
          <span className="text-muted-foreground/60">· Sign in to connect</span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {!authed ? (
          <Button size="sm" variant="outline" onClick={() => base44.auth.redirectToLogin(window.location.href)}>
            Sign in
          </Button>
        ) : pendingSetup ? (
          <Button size="sm" variant="outline" disabled>
            Awaiting ID
          </Button>
        ) : connected ? (
          <Button size="sm" variant="outline" onClick={handleDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={handleConnect}>
            Connect
          </Button>
        )}
        {connected && (
          <Button size="sm" variant="ghost" onClick={fetchData}>Refresh</Button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}