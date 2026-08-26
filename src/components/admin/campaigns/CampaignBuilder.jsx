import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, Loader2, Mail, RefreshCw,
  Search, Send, ShieldCheck, Sparkles,
} from "lucide-react";

const STOP_CONDITIONS = [
  "ANY_HUMAN_REPLY", "UNSUBSCRIBE", "HARD_BOUNCE", "COMPLAINT", "MEETING_BOOKED",
  "CONNECTION_STARTED", "CONNECTION_COMPLETED", "ANALYZER_COMPLETED",
  "LEAD_CONVERTED_TO_MERCHANT", "SUPPRESSION", "FOUNDER_PAUSE", "POLICY_PAUSE",
  "MARKET_PROTECTED", "EMERGENCY_STOP",
];

const DEFAULT_BODY = `Hi {{first_name}},

CAMBRA helps European merchants inspect payment costs with evidence before any decision. Would a short, no-obligation Analyzer review be useful for {{company_name}}?

Best,
Xavi

Reply unsubscribe if you do not want further messages.`;

const inputClass = "h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-foreground/40";
const textareaClass = "w-full rounded-xl border bg-background p-3 text-sm leading-6 outline-none focus:border-foreground/40";

function createInitialForm() {
  return {
    name: `Merchant acquisition / ${new Date().toISOString().slice(0, 10)}`,
    lane: "MERCHANT_ACQUISITION",
    objective_type: "BOOK_ANALYZER_REVIEW",
    description: "",
    target_profile_id: "",
    provider_mode: "AUTO",
    market_scope: "",
    language: "en",
    subject: "A payments cost question for {{company_name}}",
    preview_text: "Evidence before any decision",
    text_body: DEFAULT_BODY,
    cta: "Open Analyzer",
    first_followup_enabled: true,
    first_followup_days: 3,
    second_followup_enabled: true,
    second_followup_days: 7,
  };
}

function Label({ children, hint = null }) {
  return (
    <span className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
      <span>{children}</span>{hint && <span className="normal-case tracking-normal">{hint}</span>}
    </span>
  );
}

function Readiness({ value }) {
  const style = value === "READY"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
    : value === "BLOCKED"
      ? "border-rose-500/25 bg-rose-500/10 text-rose-700"
      : "border-amber-500/25 bg-amber-500/10 text-amber-700";
  return <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${style}`}>{String(value || "UNKNOWN").replaceAll("_", " ")}</span>;
}

function firstName(value) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function buildContentSample(leads) {
  return leads.slice(0, 50).map((lead) => ({
    subject_id: lead.id,
    values: {
      first_name: firstName(lead.contact_full_name),
      company_name: lead.company_name || "",
      country: lead.country || "",
      vertical: lead.industry || "",
      sender_name: "Xavi",
      analyzer_link: "https://cambra.global/Analyzer",
    },
    evidence: [],
  }));
}

function buildVariableSchema() {
  return {
    first_name: { source: "OutboundLead.contact_full_name", required: false, fallback: "there" },
    company_name: { source: "OutboundLead.company_name", required: false, fallback: "your company" },
    city: { source: "OutboundLead.city", required: false, fallback: null },
    country: { source: "OutboundLead.country", required: false, fallback: null },
    vertical: { source: "OutboundLead.industry", required: false, fallback: null },
    detected_psp: { source: "OutboundLead.probable_payment_stack", required: false, fallback: null },
    specific_observation: { source: "OutboundLead.observed_evidence", required: false, fallback: null },
    sender_name: { source: "campaign.sender_name", required: false, fallback: "Xavi" },
    calendar_link: { source: "campaign.calendar_link", required: false, fallback: null },
    analyzer_link: { source: "campaign.analyzer_link", required: false, fallback: "https://cambra.global/Analyzer" },
    connection_link: { source: "campaign.connection_link", required: false, fallback: null },
  };
}

function buildSequence(form) {
  const steps = [{ step_key: "initial-email", ordinal: 1, channel: "EMAIL", delay_amount: 0, delay_unit: "HOURS", max_attempts: 1 }];
  if (form.first_followup_enabled) {
    steps.push({ step_key: "follow-up-1", ordinal: steps.length + 1, channel: "EMAIL", delay_amount: Number(form.first_followup_days), delay_unit: "BUSINESS_DAYS", max_attempts: 1 });
  }
  if (form.second_followup_enabled) {
    steps.push({ step_key: "follow-up-2", ordinal: steps.length + 1, channel: "EMAIL", delay_amount: Number(form.second_followup_days), delay_unit: "BUSINESS_DAYS", max_attempts: 1 });
  }
  return {
    steps,
    stop_conditions: STOP_CONDITIONS,
    business_hours_policy_json: { start: "09:00", end: "17:30", weekdays: [1, 2, 3, 4, 5] },
    timezone_policy: "RECIPIENT_LOCAL",
    out_of_office_policy_json: { max_reschedules: 1, counts_as_negative_reply: false },
    max_followups: Math.max(0, steps.length - 1),
  };
}

export default function CampaignBuilder({ call, onCreated, onCancel }) {
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [partialCampaignId, setPartialCampaignId] = useState("");
  const [form, setForm] = useState(createInitialForm);
  const [selectedLeads, setSelectedLeads] = useState(() => new Set());
  const [selectedSenders, setSelectedSenders] = useState(() => new Set());
  const [leadSearch, setLeadSearch] = useState("");
  const [leadFilter, setLeadFilter] = useState("ALL");

  const loadOptions = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await call("builder_options", { limit: 500 });
      setOptions(next);
      const firstProfile = next.target_profiles?.[0];
      if (firstProfile) {
        setForm((current) => ({
          ...current,
          target_profile_id: current.target_profile_id || firstProfile.id,
          provider_mode: firstProfile.provider_mode || current.provider_mode,
          market_scope: current.market_scope || (firstProfile.countries || []).join(","),
        }));
      }
    } catch (caught) {
      setError(caught?.message || "Campaign builder options are unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOptions(); }, []);

  const visibleLeads = useMemo(() => {
    const search = leadSearch.trim().toLowerCase();
    return (options?.leads || []).filter((lead) => {
      if (leadFilter !== "ALL" && lead.readiness !== leadFilter) return false;
      if (!search) return true;
      return [lead.company_name, lead.company_domain, lead.contact_full_name, lead.contact_title, lead.contact_email]
        .some((value) => String(value || "").toLowerCase().includes(search));
    });
  }, [leadFilter, leadSearch, options]);

  const selectedLeadRows = useMemo(() => (options?.leads || []).filter((lead) => selectedLeads.has(lead.id)), [options, selectedLeads]);
  const readySelected = selectedLeadRows.filter((lead) => lead.readiness === "READY").length;
  const hasUnsubscribe = /unsubscribe|desabonn|baja|darse de baja/i.test(form.text_body);
  const requiredMissing = !form.name.trim() || !form.target_profile_id || !selectedLeads.size || !selectedSenders.size || !form.subject.trim() || !form.text_body.trim() || !hasUnsubscribe;

  const selectProfile = (profileId) => {
    const profile = options?.target_profiles?.find((row) => row.id === profileId);
    setForm((current) => ({
      ...current,
      target_profile_id: profileId,
      provider_mode: profile?.provider_mode || current.provider_mode,
      market_scope: profile?.countries?.length ? profile.countries.join(",") : current.market_scope,
    }));
    const allowed = new Set(profile?.sending_profile_keys || []);
    if (allowed.size) setSelectedSenders(allowed);
  };

  const toggleLead = (lead) => {
    if (lead.readiness === "BLOCKED") return;
    setSelectedLeads((current) => {
      const next = new Set(current);
      next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id);
      return next;
    });
  };

  const toggleSender = (key) => {
    setSelectedSenders((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectVisible = () => {
    setSelectedLeads((current) => {
      const next = new Set(current);
      visibleLeads.filter((lead) => lead.readiness !== "BLOCKED").forEach((lead) => next.add(lead.id));
      return next;
    });
  };

  const saveDraft = async () => {
    if (requiredMissing || saving) return;
    setSaving(true);
    setError("");
    setPartialCampaignId("");
    let campaignId = "";
    try {
      const marketScope = form.market_scope.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
      const created = await call("create_draft", {
        name: form.name.trim(),
        lane: form.lane,
        objective_type: form.objective_type,
        description: form.description.trim(),
        target_profile_id: form.target_profile_id,
        provider_mode: form.provider_mode,
        market_scope: marketScope,
        language_scope: [form.language],
        lead_ids: [...selectedLeads],
        sending_profile_keys: [...selectedSenders],
        filters: { source: "admin_campaign_builder", lead_filter: leadFilter },
      });
      campaignId = created.campaign.id;
      setPartialCampaignId(campaignId);

      const audience = await call("build_audience", {
        campaign_id: campaignId,
        mode: "SNAPSHOT",
        exclude_existing_merchants: true,
        contact_cooldown_days: 30,
        max_contacts_per_company: 1,
      });
      if (audience.audience_version?.status === "READY") {
        await call("freeze_audience", { campaign_id: campaignId, audience_version_id: audience.audience_version.id });
      }

      const content = {
        language: form.language,
        subject: form.subject.trim(),
        preview_text: form.preview_text.trim(),
        text_body: form.text_body.trim(),
        html_body: "",
        cta: form.cta.trim(),
        variable_schema_json: buildVariableSchema(),
      };
      const contentResult = await call("validate_content", {
        campaign_id: campaignId,
        content,
        sample: buildContentSample(selectedLeadRows),
        require_unsubscribe: true,
        content_source: "HUMAN",
        persist: true,
      });
      const sequence = buildSequence(form);
      const sequenceResult = await call("validate_sequence", { campaign_id: campaignId, sequence, persist: true });
      await call("update_draft", {
        campaign_id: campaignId,
        sending_profile_keys: [...selectedSenders],
        message_json: {
          status: contentResult.validation?.status === "VALIDATED" ? "PREPARED" : "REVIEW_REQUIRED",
          owner: "FOUNDER",
          subject: content.subject,
          body: content.text_body,
          language: content.language,
          content_version_id: contentResult.content_version?.id || null,
        },
        sequence_json: {
          status: sequenceResult.validation?.status === "VALIDATED" ? "PREPARED" : "REVIEW_REQUIRED",
          stop_on_reply: true,
          steps: sequence.steps,
          sequence_version_id: sequenceResult.sequence_version?.id || null,
        },
      });
      const preflight = await call("preflight", { campaign_id: campaignId });
      onCreated(campaignId, {
        audience: audience.audience_version,
        content: contentResult.validation,
        sequence: sequenceResult.validation,
        preflight: preflight.preflight,
      });
    } catch (caught) {
      setError(campaignId
        ? `Draft ${campaignId} was created, but preparation stopped: ${caught?.message || "unknown error"}. Nothing was sent.`
        : caught?.message || "Campaign draft could not be created");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid min-h-[420px] place-items-center text-xs text-muted-foreground"><Loader2 className="animate-spin" /></div>;

  if (!options) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        <p className="text-xs font-black">Campaign builder unavailable</p>
        <p className="mt-1 text-[11px]">{error || "The canonical campaign sources could not be read."}</p>
        <button onClick={loadOptions} className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl border border-amber-300 px-3 text-xs font-bold"><RefreshCw size={12} />Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="campaign-builder">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 text-white shadow-xl">
        <div className="p-5 md:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <div className="flex items-center gap-2"><Sparkles size={17} className="text-cyan-300" /><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Campaign Studio</p></div>
              <h2 className="mt-2 text-2xl font-black tracking-tight">Build the complete draft in one place</h2>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-white/60">Choose the audience and sender identities, write the message, configure follow-ups, then save a versioned draft. Saving never sends.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[.05] px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-white/50">Outbound posture</p>
              <p className="mt-1 text-sm font-black">{options.outbound_posture?.status || "UNKNOWN"}</p>
              <p className="mt-1 text-[10px] text-white/55">Observed send capacity: {options.outbound_posture?.capacity || 0}/day</p>
            </div>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

      <section className="rounded-2xl border bg-card p-4 md:p-5">
        <div className="mb-4 flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-xs font-black text-background">1</span><div><h3 className="text-sm font-black">Campaign setup</h3><p className="text-[10px] text-muted-foreground">Name, authority and scope.</p></div></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="xl:col-span-2"><Label>Campaign name</Label><input aria-label="Campaign name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} /></label>
          <label><Label>Lane</Label><select aria-label="Campaign lane" value={form.lane} onChange={(event) => setForm({ ...form, lane: event.target.value })} className={inputClass}><option value="MERCHANT_ACQUISITION">Merchant acquisition</option><option value="PARTNER_ACQUISITION">Partner acquisition</option><option value="PROVIDER_RELATIONS">Provider relations</option><option value="MERCHANT_LIFECYCLE">Merchant lifecycle</option></select></label>
          <label><Label>Objective</Label><input aria-label="Campaign objective" value={form.objective_type} onChange={(event) => setForm({ ...form, objective_type: event.target.value })} className={inputClass} /></label>
          <label className="md:col-span-2"><Label>Target profile</Label><select aria-label="Target profile" value={form.target_profile_id} onChange={(event) => selectProfile(event.target.value)} className={inputClass}><option value="">Choose a target profile</option>{options.target_profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} / {profile.status} / {(profile.countries || []).join(", ") || "no market"}</option>)}</select></label>
          <label><Label>Markets</Label><input aria-label="Campaign markets" value={form.market_scope} onChange={(event) => setForm({ ...form, market_scope: event.target.value })} placeholder="ES,FR" className={inputClass} /></label>
          <label><Label>Language</Label><select aria-label="Campaign language" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} className={inputClass}><option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="it">Italian</option><option value="pt">Portuguese</option></select></label>
          <label className="md:col-span-2 xl:col-span-4"><Label>Description <span className="font-normal normal-case">optional</span></Label><input aria-label="Campaign description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Internal context for this campaign" className={inputClass} /></label>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-xs font-black text-background">2</span><div><h3 className="text-sm font-black">Add leads</h3><p className="text-[10px] text-muted-foreground">{selectedLeads.size} selected / {readySelected} currently send-ready.</p></div></div>
          <div className="flex flex-wrap gap-2">
            <div className="flex h-9 items-center rounded-xl border bg-background px-2"><Search size={12} /><input aria-label="Search campaign leads" value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Company, person or email" className="h-full w-48 bg-transparent px-2 text-xs outline-none" /></div>
            <select aria-label="Lead readiness filter" value={leadFilter} onChange={(event) => setLeadFilter(event.target.value)} className="h-9 rounded-xl border bg-background px-2 text-xs"><option value="ALL">All leads</option><option value="READY">Ready</option><option value="REVIEW_REQUIRED">Needs review</option><option value="BLOCKED">Blocked</option></select>
            <button onClick={selectVisible} className="h-9 rounded-xl border px-3 text-xs font-bold">Select visible</button>
          </div>
        </div>
        <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border">
          <table className="min-w-[880px] w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-secondary text-[9px] uppercase tracking-wider text-muted-foreground"><tr><th className="p-3">Add</th><th className="p-3">Company</th><th className="p-3">Contact</th><th className="p-3">Market</th><th className="p-3">Score</th><th className="p-3">Readiness</th></tr></thead>
            <tbody>{visibleLeads.map((lead) => <tr key={lead.id} className="border-t align-top hover:bg-secondary/30"><td className="p-3"><input aria-label={`Add ${lead.company_name || lead.id}`} type="checkbox" checked={selectedLeads.has(lead.id)} disabled={lead.readiness === "BLOCKED"} onChange={() => toggleLead(lead)} /></td><td className="p-3"><p className="font-black">{lead.company_name || "Unnamed company"}</p><p className="text-muted-foreground">{lead.company_domain || "Domain not observed"}</p></td><td className="p-3"><p className="font-bold">{lead.contact_full_name || "No named contact"}</p><p>{lead.contact_title || "Role not observed"}</p><p className="text-muted-foreground">{lead.contact_email || "Verified email required"}</p></td><td className="p-3">{lead.country || "Unknown"}</td><td className="p-3 font-black">{lead.score || 0}</td><td className="p-3"><Readiness value={lead.readiness} /><p className="mt-1 max-w-xs text-[9px] text-muted-foreground">{(lead.blockers || []).join(" / ") || "Final suppression and market checks still run when the audience is built."}</p></td></tr>)}</tbody>
          </table>
          {!visibleLeads.length && <p className="p-8 text-center text-xs text-muted-foreground">No real lead matches this filter.</p>}
        </div>
        {selectedLeads.size > readySelected && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" />Leads needing review can be stored in the draft, but invalid email, suppression, protected-market and policy checks will exclude them from the frozen audience.</div>}
      </section>

      <section className="rounded-2xl border bg-card p-4 md:p-5">
        <div className="mb-4 flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-xs font-black text-background">3</span><div><h3 className="text-sm font-black">Write the message</h3><p className="text-[10px] text-muted-foreground">Human-authored content passes the variable and claims gates before it becomes current.</p></div></div>
        <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <label><Label>Subject</Label><input aria-label="Campaign subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} className={inputClass} /></label>
            <label><Label>Preview text</Label><input aria-label="Campaign preview text" value={form.preview_text} onChange={(event) => setForm({ ...form, preview_text: event.target.value })} className={inputClass} /></label>
            <label><Label>Message <span className="normal-case tracking-normal">plain text authority</span></Label><textarea aria-label="Campaign message" value={form.text_body} onChange={(event) => setForm({ ...form, text_body: event.target.value })} rows={11} className={textareaClass} /></label>
            <label><Label>Call to action</Label><input aria-label="Campaign call to action" value={form.cta} onChange={(event) => setForm({ ...form, cta: event.target.value })} className={inputClass} /></label>
          </div>
          <aside className="space-y-3">
            <div className="rounded-xl border bg-secondary/35 p-3"><p className="text-[10px] font-black uppercase tracking-wider">Supported variables</p><div className="mt-2 flex flex-wrap gap-1">{["first_name", "company_name", "country", "vertical", "sender_name", "analyzer_link"].map((key) => <code key={key} className="rounded bg-background px-1.5 py-1 text-[9px]">{`{{${key}}}`}</code>)}</div><p className="mt-2 text-[9px] leading-4 text-muted-foreground">Missing first name and company name use explicit neutral fallbacks. No merchant-specific economic claim is invented.</p></div>
            <div className={`rounded-xl border p-3 ${hasUnsubscribe ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}><div className="flex items-center gap-2">{hasUnsubscribe ? <Check size={13} /> : <AlertTriangle size={13} />}<p className="text-[10px] font-black">Unsubscribe line {hasUnsubscribe ? "present" : "required"}</p></div></div>
          </aside>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 md:p-5">
          <div className="mb-4 flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-xs font-black text-background">4</span><div><h3 className="text-sm font-black">Choose sender emails</h3><p className="text-[10px] text-muted-foreground">Explicit transport identities, never a provider default.</p></div></div>
          <div className="max-h-[360px] space-y-2 overflow-auto pr-1">{options.senders.map((sender) => <label key={sender.profile_key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selectedSenders.has(sender.profile_key) ? "border-cyan-500/40 bg-cyan-500/5" : ""}`}><input aria-label={`Use ${sender.from_address || sender.profile_key}`} type="checkbox" checked={selectedSenders.has(sender.profile_key)} onChange={() => toggleSender(sender.profile_key)} className="mt-1" /><Mail size={14} className="mt-0.5 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{sender.from_address || sender.profile_key}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{sender.provider} / {sender.domain} / cap {sender.current_daily_cap}/day / webhook {sender.webhook_status}</span></span><Readiness value={sender.readiness?.ready ? "READY" : String(sender.status || "NOT_READY").toUpperCase()} /></label>)}</div>
          {!options.senders.length && <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">No sender identity is configured.</p>}
        </div>

        <div className="rounded-2xl border bg-card p-4 md:p-5">
          <div className="mb-4 flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-xs font-black text-background">5</span><div><h3 className="text-sm font-black">Sequence and stop rules</h3><p className="text-[10px] text-muted-foreground">Follow-ups stop on replies, opt-outs, bounces, complaints, conversion, policy pause or emergency.</p></div></div>
          <div className="space-y-3">
            <div className="rounded-xl border p-3"><div className="flex items-center gap-2"><Send size={13} /><p className="text-xs font-black">Initial email</p></div><p className="mt-1 text-[10px] text-muted-foreground">Immediately, during recipient-local business hours.</p></div>
            <label className="flex items-center gap-3 rounded-xl border p-3"><input aria-label="Enable first follow-up" type="checkbox" checked={form.first_followup_enabled} onChange={(event) => setForm({ ...form, first_followup_enabled: event.target.checked })} /><span className="flex-1 text-xs font-black">Follow-up 1</span><input aria-label="First follow-up delay" type="number" min="1" max="30" value={form.first_followup_days} onChange={(event) => setForm({ ...form, first_followup_days: Math.max(1, Math.min(30, event.target.valueAsNumber || 1)) })} disabled={!form.first_followup_enabled} className="h-8 w-16 rounded-lg border bg-background px-2 text-xs" /><span className="text-[10px] text-muted-foreground">business days</span></label>
            <label className="flex items-center gap-3 rounded-xl border p-3"><input aria-label="Enable second follow-up" type="checkbox" checked={form.second_followup_enabled} onChange={(event) => setForm({ ...form, second_followup_enabled: event.target.checked })} /><span className="flex-1 text-xs font-black">Follow-up 2</span><input aria-label="Second follow-up delay" type="number" min="1" max="30" value={form.second_followup_days} onChange={(event) => setForm({ ...form, second_followup_days: Math.max(1, Math.min(30, event.target.valueAsNumber || 1)) })} disabled={!form.second_followup_enabled} className="h-8 w-16 rounded-lg border bg-background px-2 text-xs" /><span className="text-[10px] text-muted-foreground">business days</span></label>
            <details className="rounded-xl border bg-secondary/30 p-3"><summary className="flex cursor-pointer items-center justify-between text-[10px] font-black uppercase tracking-wider">14 mandatory stop conditions <ChevronDown size={12} /></summary><p className="mt-2 text-[9px] leading-4 text-muted-foreground">{STOP_CONDITIONS.join(" / ")}</p></details>
          </div>
        </div>
      </section>

      <section className="sticky bottom-3 z-10 rounded-2xl border bg-background/95 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div className="flex items-start gap-3"><ShieldCheck size={17} className="mt-0.5 text-emerald-600" /><div><p className="text-xs font-black">Safe draft boundary</p><p className="text-[10px] text-muted-foreground">This creates versioned campaign evidence only. It does not schedule, approve or send a message.</p>{requiredMissing && <p className="mt-1 text-[10px] font-bold text-amber-700">Required: name, target profile, at least one lead, one sender, subject, body and an unsubscribe line.</p>}</div></div>
          <div className="flex shrink-0 gap-2"><button onClick={onCancel} disabled={saving} className="h-10 rounded-xl border px-4 text-xs font-bold">Cancel</button>{partialCampaignId && <button onClick={() => onCreated(partialCampaignId, { partial: true })} disabled={saving} className="h-10 rounded-xl border px-4 text-xs font-bold">Open partial draft</button>}<button data-testid="save-campaign-draft" onClick={saveDraft} disabled={requiredMissing || saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{saving ? "Building draft..." : "Save campaign draft"}<ArrowRight size={13} /></button></div>
        </div>
      </section>
    </div>
  );
}
