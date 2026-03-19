import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Send, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { DEAL_STATUSES, ALL_STATUSES, STATUS_COLORS } from "@/lib/adminStatusConstants";

const STATUSES = ALL_STATUSES;

export default function AdminApplicationDetail({ app, brand, onClose, onStatusChange }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [me, setMe] = useState(null);
  const [localApp, setLocalApp] = useState(app);

  useEffect(() => {
    setLocalApp(app);
    Promise.all([
      base44.entities.AdminNote.filter({ target_id: app.id }),
      base44.auth.me(),
    ]).then(([n, u]) => { setNotes(n); setMe(u); });
  }, [app.id, app]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    const note = await base44.entities.AdminNote.create({
      target_type: "deal_application", target_id: app.id, note: newNote, author: me?.email || "admin"
    });
    setNotes(prev => [...prev, note]);
    setNewNote("");
  };

  const updateSavings = async (val) => {
    await base44.entities.DealApplication.update(localApp.id, { estimated_savings: val });
    setLocalApp(prev => ({ ...prev, estimated_savings: val }));
  };

  return (
    <div className="w-1/2 rounded-xl border border-border/50 bg-card overflow-hidden sticky top-20">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold">{app.deal_name}</p>
          <p className="text-[11px] text-muted-foreground/40">{brand?.name || app.user_email}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground/40 hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
        {/* Status update */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map(s => (
              <button key={s} onClick={async () => {
                await onStatusChange(app.id, s);
                setLocalApp(prev => ({ ...prev, status: s }));
              }}
                className={`px-3 h-7 rounded-full text-[11px] font-semibold border transition-all ${localApp.status === s ? STATUS_COLORS[s] : "bg-secondary/50 text-muted-foreground border-border/40 hover:border-foreground/20"}`}>
                {s.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Deal info */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">Deal Details</p>
          {[
            { label: "Provider", val: localApp.provider },
            { label: "Category", val: localApp.category },
            { label: "Mode", val: localApp.deal_mode || "negotiated" },
            { label: "Est. savings", val: localApp.estimated_savings ? `€${localApp.estimated_savings.toLocaleString()}/yr` : "—" },
            { label: "Submitted", val: new Date(localApp.created_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground/50">{row.label}</p>
              <p className="text-xs font-semibold">{row.val}</p>
            </div>
          ))}
        </div>

        {/* User */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">User</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold">{brand?.name || "—"}</p>
              <p className="text-[11px] text-muted-foreground/40">{app.user_email}</p>
            </div>
            <Link to={`/admin/users/u?email=${app.user_email}`} className="text-[11px] text-muted-foreground/40 hover:text-foreground underline">
              Full profile
            </Link>
          </div>
        </div>

        {/* Savings override */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Est. Savings (€/yr)</p>
            <input type="number" defaultValue={localApp.estimated_savings || ""}
              onBlur={e => updateSavings(parseFloat(e.target.value) || 0)}
              className="w-full h-8 px-3 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none" />
          </div>
        </div>

        {/* Provider response */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">Provider Response</p>
          <textarea
            defaultValue={localApp.provider_response || ""}
            onBlur={async (e) => {
              if (e.target.value !== localApp.provider_response) {
                await base44.entities.DealApplication.update(localApp.id, { provider_response: e.target.value });
                setLocalApp(prev => ({ ...prev, provider_response: e.target.value }));
              }
            }}
            placeholder="Log provider response here..."
            className="w-full h-20 px-3 py-2 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none focus:border-foreground/20 resize-none"
          />
        </div>

        {/* Internal notes */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">Internal Notes</p>
          <div className="space-y-2 mb-2">
            {notes.map(n => (
              <div key={n.id} className="p-2.5 rounded-lg bg-secondary/40 border border-border/30">
                <p className="text-xs">{n.note}</p>
                <p className="text-[10px] text-muted-foreground/30 mt-1">{n.author} · {new Date(n.created_date).toLocaleDateString("en-GB")}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newNote} onChange={e => setNewNote(e.target.value)}
              placeholder="Add note..." onKeyDown={e => e.key === "Enter" && addNote()}
              className="flex-1 h-8 px-3 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none focus:border-foreground/20" />
            <button onClick={addNote} className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-bold">
              <Send size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}