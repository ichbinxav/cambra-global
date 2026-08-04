import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarCheck } from "lucide-react";

const SOURCES = [
  ["provider_confirmation", "Provider confirmation"],
  ["pricing_schedule", "Signed pricing schedule"],
  ["first_settlement", "First settlement at new rates"],
  ["api_verification", "API verification"],
  ["admin_documented_review", "Documented admin review"],
];

export default function ConditionsActivationCard({ activation, onSaved }) {
  const [date, setDate] = useState(activation.conditions_activated_at?.slice(0, 10) || "");
  const [source, setSource] = useState(activation.conditions_activation_source || "provider_confirmation");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(confirmCorrection) {
    setSaving(true);
    setMsg(null);
    const res = await base44.functions.invoke("recordConditionsActivation", {
      deal_activation_id: activation.id,
      conditions_activated_at: new Date(`${date}T12:00:00Z`).toISOString(),
      source,
      evidence_note: note,
      confirm_correction: confirmCorrection,
    });
    const d = res?.data || res;
    if (d?.ok) {
      setMsg({ kind: "ok", text: `Anchored. First measured month: ${d.first_measurement_month} · agreement ends ${d.agreement_end_at.slice(0, 10)}.` });
      onSaved?.();
    } else if (d?.error === "conditions_activated_at_already_set") {
      if (confirm(`A date is already anchored (${d.current.slice(0, 10)}). Correct it? This is logged as a correction.`)) {
        setSaving(false);
        return submit(true);
      }
      setMsg({ kind: "warn", text: "Correction cancelled." });
    } else {
      setMsg({ kind: "warn", text: d?.error || "Could not save." });
    }
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-border p-4 bg-card space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck size={14} />
        <p className="text-sm font-bold">Conditions activation date</p>
      </div>
      <p className="text-xs text-muted-foreground">
        The real date the new conditions started applying, backed by evidence. It anchors the whole billing calendar — nothing can be invoiced without it.
      </p>

      {activation.conditions_activated_at ? (
        <div className="text-xs space-y-0.5 p-2 rounded-lg bg-secondary/40">
          <div>Anchored: <b>{activation.conditions_activated_at.slice(0, 10)}</b> · {activation.conditions_activation_source}</div>
          <div>First measured month: <b>{activation.first_measurement_month || "—"}</b></div>
          <div>Agreement ends: <b>{activation.agreement_end_at?.slice(0, 10) || "—"}</b></div>
          <div className="text-muted-foreground">Verified by {activation.conditions_activation_verified_by || "—"}</div>
        </div>
      ) : (
        <div className="text-xs p-2 rounded-lg bg-amber-500/10 text-amber-800 border border-amber-500/25">
          Not anchored yet — every measured month will stay blocked.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
        >
          {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Evidence note (required) — what document or statement proves this date"
        className="w-full text-xs bg-background border border-border rounded-lg p-2"
      />
      {msg && (
        <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-700" : "text-amber-800"}`}>{msg.text}</p>
      )}
      <button
        disabled={saving || !date || !note.trim()}
        onClick={() => submit(false)}
        className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-bold disabled:opacity-50"
      >
        {saving ? "Saving…" : "Anchor date"}
      </button>
    </div>
  );
}