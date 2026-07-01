import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Loader2, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ChatMessageBubble from "@/components/admin/chat/ChatMessageBubble";

function newConversationId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function AdminChat() {
  const [conversationId] = useState(() => {
    const stored = sessionStorage.getItem("cambra_chat_conv");
    if (stored) return stored;
    const id = newConversationId();
    sessionStorage.setItem("cambra_chat_conv", id);
    return id;
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const load = async () => {
    try {
      const rows = await base44.entities.ChatMessage
        .filter({ conversation_id: conversationId }, "created_date", 200)
        .catch(() => []);
      setMessages(rows);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
    } catch (e) {
      setError(e?.message || "Could not load conversation.");
    }
  };

  useEffect(() => { load(); }, [conversationId]);

  const send = async (text, opts = {}) => {
    if (!text?.trim() && !opts.pending_tool) return;
    setSending(true); setError(null);
    try {
      await base44.functions.invoke("chatChiefOrchestrator", {
        conversation_id: conversationId,
        message: text?.trim() || null,
        confirmed: opts.confirmed || false,
        pending_tool: opts.pending_tool || null,
      });
      setInput("");
      await load();
    } catch (e) {
      setError(e?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = async (pendingCall) => {
    await send(`Confirmed: proceed with ${pendingCall.name}`, {
      confirmed: true,
      pending_tool: { name: pendingCall.name, input: pendingCall.input },
    });
  };

  return (
    <div className="space-y-3 flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <MessageSquare size={18} /> Chat · Chief Orchestrator
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Habla en lenguaje natural. Yo elijo qué agentes lanzar — pero nunca salto el Inbox: cualquier acción L2+ pasa por tu aprobación.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-700">
          <ShieldCheck size={11} /> Inbox gate active · L3-L4 forced to draft
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-2xl border border-border/60 bg-secondary/20 p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <p className="text-sm font-bold mb-2">Empieza una conversación</p>
              <p className="text-xs text-muted-foreground mb-4">
                Prueba con algo como:
              </p>
              <div className="space-y-1.5 text-left">
                {[
                  "Busca 20 leads de moda en Francia",
                  "Prepárame un draft de post de LinkedIn sobre el cluster engineering",
                  "Genera un brief del estado del sistema",
                ].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block w-full text-left px-3 py-2 rounded-lg border border-border/60 bg-card text-xs text-foreground hover:bg-secondary"
                  >
                    "{s}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map(m => (
            <ChatMessageBubble key={m.id} message={m} onConfirm={handleConfirm} />
          ))
        )}
      </div>

      {error && <p className="text-[11px] text-rose-700">{error}</p>}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="rounded-2xl border border-border/60 bg-card p-2 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={sending}
          placeholder="Pídele a la máquina lo que necesitas…"
          className="flex-1 h-10 px-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-foreground text-background text-sm font-bold hover:opacity-90 disabled:opacity-50"
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Send
        </button>
      </form>
    </div>
  );
}