// COMMAND-C2 (2026-08-17) — durable "Ask CAMBRA" workspace.
//
// This replaces the previous /admin/chat page, whose conversation id lived in
// sessionStorage and therefore died with the browser tab. Conversations are now
// durable rows the founder can list, resume on another device, rename, pin,
// archive and branch.
//
// Naming: the CAMBRA Command *dashboard* is AdminCommand.jsx at /admin and
// /admin/command — a different, existing page. This file is the conversational
// surface and deliberately keeps the /admin/chat route so every existing link,
// nav entry and i18n key in the admin shell keeps working unchanged.
//
// What C2 does NOT change: sending still goes through chatChiefOrchestrator,
// and every governance gate it applies still applies. The multi-step tool
// coordinator is C4; this chunk changes who owns the conversation, not what
// Command is allowed to do.
//
// Language: this workspace ships in English, like 46 of the 54 admin pages.
// See Decision_Log_COMMAND_C2.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive, GitBranch, Loader2, MessageSquare, Pin, Plus, RefreshCw, Send, ShieldCheck,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import ChatMessageBubble from "@/components/admin/chat/ChatMessageBubble";

const call = async (action, payload = {}) => {
  const response = await base44.functions.invoke("adminSummaries", {
    action: `command_conversation_${action}`, ...payload,
  });
  const data = response?.data || response;
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "Command operation failed"), { data });
  }
  return data;
};

const when = (value) => (value ? new Date(value).toLocaleString() : "—");

function StatusChip({ status }) {
  const tone = {
    PINNED: "border-amber-200 bg-amber-50 text-amber-700",
    ARCHIVED: "border-border/60 bg-secondary/40 text-muted-foreground",
    ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[status] || "border-border/60 bg-secondary/40 text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wide ${tone}`}>
      {status}
    </span>
  );
}

/**
 * States what the founder is looking at and, more importantly, what they are
 * NOT looking at. A branch with an unavailable ancestor shows fewer turns than
 * really happened, and that has to be visible rather than inferred.
 */
export function ContextInspector({ detail }) {
  if (!detail) return null;
  const conversation = detail.conversation || {};
  const ancestry = detail.ancestry || [];
  const inherited = (detail.timeline || []).filter((row) => row.inherited_from).length;
  const own = (detail.timeline || []).length - inherited;
  return (
    <div data-testid="context-inspector" className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Context</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted-foreground">Turns in view</dt>
        <dd className="font-bold">{own + inherited}</dd>
        <dt className="text-muted-foreground">Inherited from a parent</dt>
        <dd className="font-bold">{inherited}</dd>
        <dt className="text-muted-foreground">Branch depth</dt>
        <dd className="font-bold">{Math.max(0, ancestry.length - 1)}</dd>
        <dt className="text-muted-foreground">Attribution</dt>
        <dd className="font-bold">{conversation.attribution_state || "OBSERVED"}</dd>
      </dl>
      {detail.history_complete === false && (
        <p data-testid="history-incomplete" className="text-[11px] text-amber-700 font-semibold">
          Incomplete history: {detail.history_truncated_reason === "branch_cycle_detected"
            ? "this branch points back at itself, so the chain could not be resolved."
            : "a parent conversation could not be read, so earlier turns are missing."}
          {" "}What you see below is less than what was said.
        </p>
      )}
      {conversation.migrated_from === "legacy_admin_chat" && (
        <p data-testid="legacy-notice" className="text-[11px] text-muted-foreground">
          Migrated from the legacy admin chat. These turns predate the receipt ledger and were never receipted.
          {conversation.attribution_state !== "OBSERVED"
            && " Authorship is not recorded, so this conversation is not attributed to anyone."}
        </p>
      )}
    </div>
  );
}

export function ConversationSidebar({ conversations, activeId, onSelect, onCreate, busy }) {
  const grouped = useMemo(() => {
    const rows = conversations || [];
    return {
      PINNED: rows.filter((row) => row.status === "PINNED"),
      ACTIVE: rows.filter((row) => row.status === "ACTIVE"),
      ARCHIVED: rows.filter((row) => row.status === "ARCHIVED"),
    };
  }, [conversations]);

  return (
    <aside data-testid="conversation-sidebar" className="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto">
      <button
        type="button" onClick={onCreate} disabled={busy}
        className="inline-flex items-center justify-center gap-1.5 h-9 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 disabled:opacity-50"
      >
        <Plus size={12} /> New conversation
      </button>
      {conversations?.length === 0 && (
        <p className="text-[11px] text-muted-foreground px-1 py-2">No conversations yet.</p>
      )}
      {["PINNED", "ACTIVE", "ARCHIVED"].map((group) => (
        grouped[group].length > 0 && (
          <div key={group} className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">{group}</p>
            {grouped[group].map((row) => (
              <button
                key={row.conversation_id} type="button"
                onClick={() => onSelect(row.conversation_id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs ${
                  row.conversation_id === activeId
                    ? "border-foreground/40 bg-secondary"
                    : "border-border/60 bg-card hover:bg-secondary/60"
                }`}
              >
                <span className="block font-bold truncate">{row.title}</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  {row.message_count} turns · {when(row.last_message_at)}
                </span>
                {row.branched_from_conversation_id && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-muted-foreground">
                    <GitBranch size={9} /> branch
                  </span>
                )}
              </button>
            ))}
          </div>
        )
      ))}
    </aside>
  );
}

export default function AdminCommandChat() {
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [listUnavailable, setListUnavailable] = useState(false);
  // Founder confirmation nonces deliberately live only in this React session.
  // Reloading the page requires a fresh preview; raw nonces never enter storage.
  const [confirmationNonces, setConfirmationNonces] = useState({});

  const loadList = useCallback(async () => {
    try {
      const data = await call("list");
      setConversations(data.conversations || []);
      setListUnavailable(false);
      return data.conversations || [];
    } catch (e) {
      // An unreadable list is not an empty history. Say which one it is.
      setListUnavailable(true);
      setError(e?.message || "Could not load conversations.");
      return [];
    }
  }, []);

  const loadDetail = useCallback(async (conversationId) => {
    if (!conversationId) { setDetail(null); return; }
    try {
      setDetail(await call("get", { conversation_id: conversationId }));
      setError(null);
    } catch (e) {
      setDetail(null);
      setError(e?.message || "Could not load this conversation.");
    }
  }, []);

  useEffect(() => { loadList().then((rows) => {
    if (!activeId && rows.length) setActiveId(rows[0].conversation_id);
  }); }, [loadList]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDetail(activeId); }, [activeId, loadDetail]);
  useEffect(() => { const ask = searchParams.get("ask"); if (ask) setInput(ask); }, [searchParams]);

  const create = async () => {
    setBusy(true);
    try {
      const data = await call("create");
      await loadList();
      setActiveId(data.conversation.conversation_id);
    } catch (e) {
      setError(e?.message || "Could not create a conversation.");
    } finally { setBusy(false); }
  };

  const setStatus = async (status) => {
    if (!activeId) return;
    setBusy(true);
    try { await call("set_status", { conversation_id: activeId, status }); await loadList(); }
    catch (e) { setError(e?.message || "Could not update this conversation."); }
    finally { setBusy(false); }
  };

  const branch = async (messageId) => {
    if (!activeId || !messageId) return;
    setBusy(true);
    try {
      const data = await call("branch", { conversation_id: activeId, branch_from_message_id: messageId });
      await loadList();
      setActiveId(data.conversation.conversation_id);
    } catch (e) {
      setError(e?.message || "Could not branch this conversation.");
    } finally { setBusy(false); }
  };

  const send = async (text, opts = {}) => {
    if (!activeId) { setError("Start a conversation first."); return null; }
    if (!text?.trim() && !opts.pending_tool) return null;
    setSending(true); setError(null);
    try {
      const response = await base44.functions.invoke("chatChiefOrchestrator", {
        conversation_id: activeId,
        message: text?.trim() || null,
        confirmed: opts.confirmed || false,
        pending_tool: opts.pending_tool || null,
        confirmation_nonce: opts.confirmation_nonce || undefined,
      });
      const result = response?.data || response;
      const commandKey = String(result?.pending_tool?.command_key || "");
      const confirmationNonce = String(result?.confirmation_nonce || "");
      if (result?.requires_confirmation && commandKey && confirmationNonce) {
        setConfirmationNonces((current) => ({ ...current, [commandKey]: confirmationNonce }));
      }
      setInput("");
      await loadDetail(activeId);
      await loadList();
      return result;
    } catch (e) {
      setError(e?.message || "Could not send message.");
      return null;
    } finally { setSending(false); }
  };

  const handleConfirm = async (pendingCall) => {
    const commandKey = String(pendingCall.command_key || pendingCall.input?.command_key || "");
    const confirmationNonce = commandKey ? confirmationNonces[commandKey] : "";
    if (commandKey && !confirmationNonce) {
      setError("This governed preview is no longer available in memory. Request a fresh preview before confirming.");
      return;
    }
    const result = await send(`Confirmed: proceed with ${pendingCall.name}`, {
      confirmed: true,
      confirmation_nonce: confirmationNonce || undefined,
      pending_tool: { name: pendingCall.name, input: pendingCall.input, command_key: commandKey || undefined },
    });
    if (result?.ok === true && commandKey) {
      setConfirmationNonces((current) => {
        const next = { ...current }; delete next[commandKey]; return next;
      });
    }
  };

  const active = conversations.find((row) => row.conversation_id === activeId);
  const timeline = detail?.timeline || [];

  return (
    <div className="space-y-3 flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <MessageSquare size={18} /> Ask CAMBRA
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Company intelligence and governed action. Conversations are durable: they survive this tab, resume on
            another device, and can be branched without rewriting what was already said.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-700">
          <ShieldCheck size={11} /> Founder OS governance active
        </div>
      </div>

      <div className="flex-1 flex gap-3 min-h-0">
        <ConversationSidebar
          conversations={conversations} activeId={activeId}
          onSelect={setActiveId} onCreate={create} busy={busy}
        />

        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {listUnavailable && (
            <p data-testid="list-unavailable" className="text-[11px] text-amber-700 font-semibold">
              Your conversations could not be read. This is a failed read, not an empty history — nothing has been lost.
            </p>
          )}

          {active && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-sm truncate">{active.title}</span>
                <StatusChip status={active.status} />
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setStatus(active.status === "PINNED" ? "ACTIVE" : "PINNED")}
                  disabled={busy}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-border/60 text-[11px] font-bold hover:bg-secondary disabled:opacity-50">
                  <Pin size={11} /> {active.status === "PINNED" ? "Unpin" : "Pin"}
                </button>
                <button type="button" onClick={() => setStatus("ARCHIVED")} disabled={busy || active.status === "ARCHIVED"}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-border/60 text-[11px] font-bold hover:bg-secondary disabled:opacity-50">
                  <Archive size={11} /> Archive
                </button>
                <button type="button" onClick={() => loadDetail(activeId)}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-border/60 text-[11px] font-bold hover:bg-secondary">
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>
            </div>
          )}

          <ContextInspector detail={detail} />

          <div data-testid="command-timeline" className="flex-1 overflow-y-auto rounded-2xl border border-border/60 bg-secondary/20 p-4 space-y-3">
            {timeline.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md">
                  <p className="text-sm font-bold mb-2">Ask CAMBRA anything</p>
                  <p className="text-xs text-muted-foreground mb-4">For example:</p>
                  <div className="space-y-1.5 text-left">
                    {[
                      "What changed and what needs my attention?",
                      "Why is collected revenue at this level?",
                      "What should I do today?",
                      "Simulate what happens if we double acquisition",
                    ].map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => send(suggestion)}
                        className="block w-full text-left px-3 py-2 rounded-lg border border-border/60 bg-card text-xs text-foreground hover:bg-secondary">
                        “{suggestion}”
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              timeline.map((message) => (
                <div key={message.id} className="group">
                  {message.inherited_from && (
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Inherited from an earlier conversation
                    </p>
                  )}
                  <ChatMessageBubble message={message} onConfirm={handleConfirm} />
                  <button
                    type="button" onClick={() => branch(message.id)} disabled={busy}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <GitBranch size={10} /> Branch from here
                  </button>
                </div>
              ))
            )}
          </div>

          {error && <p data-testid="command-error" className="text-[11px] text-rose-700">{error}</p>}

          <form
            onSubmit={(event) => { event.preventDefault(); send(input); }}
            className="rounded-2xl border border-border/60 bg-card p-2 flex items-center gap-2"
          >
            <input
              type="text" value={input} onChange={(event) => setInput(event.target.value)}
              disabled={sending || !activeId}
              placeholder={activeId ? "Ask CAMBRA: why, compare, find, simulate or do…" : "Start a conversation first"}
              className="flex-1 h-10 px-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="submit" disabled={sending || !input.trim() || !activeId}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-foreground text-background text-sm font-bold hover:opacity-90 disabled:opacity-50"
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
