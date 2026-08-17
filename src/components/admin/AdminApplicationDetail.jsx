import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const payload = (response) => response?.data || response || {};
async function callIntegration(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `integration_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "integration_operation_failed"), { data });
  }
  return data;
}
import { X, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { ALL_STATUSES, STATUS_COLORS } from "@/lib/adminStatusConstants";

const STATUSES = ALL_STATUSES;

export default function AdminApplicationDetail({ app, brand, onClose, onStatusChange }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [noteError, setNoteError] = useState(null);
  const [retiredNotice, setRetiredNotice] = useState(null);
  const [localApp, setLocalApp] = useState(app);

  useEffect(() => {
    setLocalApp(app);
    Promise.all([
      base44.entities.AdminNote.filter({ target_id: app.id }),
      base44.auth.me(),
    ]).then(([n]) => { setNotes(n); });
  }, [app.id, app]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    // DASHBOARD-C15: this used to send `author: me?.email || "admin"`, so a note written when
    // the current user could not be read was stored as if a person called "admin" had written
    // it — indistinguishable from a real one afterwards. The author is now the authenticated
    // actor on the server, and the write refuses when there is no actor.
    const result = await callIntegration("record_note", {
      target_type: "deal_application", target_id: app.id, note: newNote,
    }).catch((caught) => ({ ok: false, error: caught?.data?.reason || caught?.message }));
    if (!result?.ok) { setNoteError(result?.error || "Note refused."); return; }
    setNoteError(null);
    setNotes(prev => [...prev, { id: result.note_id, target_type: "deal_application", target_id: app.id, note: newNote, author: result.author }]);
    setNewNote("");
  };

  // DASHBOARD-C15: this used to write `estimated_savings` onto DealApplication, which
  // config/dashboard/pipeline-stage-registry.v1.json declares ZERO_PRODUCERS — no .create()
  // exists anywhere in the tree and the entity stands at zero rows, under the rule "do not
  // extend, do not project, do not resurrect". A write to rows that do not exist does nothing,
  // and keeping the control implied a surface that worked. The server answers the attempt with
  // that reason rather than silently accepting it.
  const updateSavings = async (val) => {
    const result = await callIntegration("update_deal_application", { field: "estimated_savings", value: val })
      .catch((caught) => ({ ok: false, error: caught?.data?.reason || caught?.message }));
    setRetiredNotice(result?.error || "DealApplication is retired; nothing was written.");
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden sticky top-6">
      {retiredNotice && (
        <p data-testid="deal-application-retired" className="px-5 py-2 text-[11px] text-amber-900 bg-amber-50 border-b border-amber-200">
          {retiredNotice}
        </p>
      )}
      {noteError && (
        <p data-testid="note-error" className="px-5 py-2 text-[11px] text-amber-900 bg-amber-50 border-b border-amber-200">
          {noteError}
        </p>
      )}
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

      <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(100vh-160px)]">
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
            readOnly
            data-testid="provider-response-readonly"
            onBlur={() => setRetiredNotice(
              "DealApplication is retired (zero producers, zero rows), so this field cannot be saved. "
              + "It is shown read-only rather than accepting text that would go nowhere.",
            )}
            placeholder="Read only — this entity is retired"
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