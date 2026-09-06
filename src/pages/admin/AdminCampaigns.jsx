// Campaign workspace: observed operations plus a versioned draft studio.
// The studio prepares audience/content/sequence evidence but never schedules,
// approves or sends a message.
//
// Fail-visible (spec §23.2): an unavailable source renders "Data unavailable"
// with its blocker, never a silently empty table.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, ChevronRight, KeyRound, Layers, Loader2, Pencil, Plus, RefreshCw, Settings2, ShieldAlert, Stethoscope } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import CampaignBuilder from "@/components/admin/campaigns/CampaignBuilder";
import { base44 } from "@/api/base44Client";
import { normalizeBase44FunctionError } from "@/lib/base44FunctionError";

const TABS = [
  ["overview", "Overview"],
  ["create", "Create Campaign"],
  ["all", "All Campaigns"],
  ["detail", "Detail"],
];

const LANES = [
  ["MERCHANT_ACQUISITION", "Merchant acquisition"],
  ["PARTNER_ACQUISITION", "Partner acquisition"],
  ["PROVIDER_RELATIONS", "Provider relations"],
  ["MERCHANT_LIFECYCLE", "Merchant lifecycle"],
];

const CANONICAL_STATUSES = [
  "ALL", "DRAFT", "AUDIENCE_BUILDING", "AUDIENCE_READY", "CONTENT_INCOMPLETE",
  "SEQUENCE_INCOMPLETE", "SENDING_CONFIGURATION_REQUIRED", "PREFLIGHT_BLOCKED",
  "READY_FOR_APPROVAL", "APPROVED", "SCHEDULED", "RUNNING", "PAUSED",
  "COMPLETED", "STOPPED", "REVIEW_REQUIRED", "ARCHIVED",
];

const call = async (action, payload = {}) => {
  try {
    const response = await base44.functions.invoke("adminSummaries", { action: `campaign_${action}`, ...payload });
    const data = response?.data || response;
    if (data?.ok === false) throw Object.assign(new Error(data.error || "Campaign operation failed"), { data });
    return data;
  } catch (caught) {
    throw normalizeBase44FunctionError(caught, "Campaign operation failed");
  }
};

const count = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—");
const date = (value) => (value ? new Date(value).toLocaleString() : "—");

function Chip({ children, tone = "neutral" }) {
  const style = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    bad: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-sky-200 bg-sky-50 text-sky-700",
    neutral: "border-border/60 bg-secondary/40 text-muted-foreground",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-bold tracking-wide ${style}`}>{children}</span>;
}

function statusTone(status) {
  if (["RUNNING", "APPROVED", "COMPLETED"].includes(status)) return "good";
  if (["PAUSED", "SCHEDULED"].includes(status)) return "info";
  if (["PREFLIGHT_BLOCKED", "REVIEW_REQUIRED", "STOPPED"].includes(status)) return "bad";
  return "neutral";
}

/** Fail-visible empty/error state — never an unexplained blank table. */
function DataUnavailable({ blockers = [], onRetry }) {
  return (
    <div data-testid="campaigns-data-unavailable" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <p className="text-xs font-black text-amber-900">Data unavailable</p>
          <p className="mt-1 text-[11px] text-amber-800">
            CAMBRA could not read the canonical campaign source, so this view is blocked rather than shown as empty.
          </p>
          {blockers.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-amber-800">
              {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}
          {onRetry && (
            <button onClick={onRetry} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 px-3 text-[10px] font-bold text-amber-900">
              <RefreshCw size={12} />Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ kpi }) {
  const unknown = kpi.status !== "OBSERVED";
  return (
    <div data-testid={`campaign-kpi-${kpi.key}`} className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
        <Chip tone={unknown ? "warn" : "neutral"}>{kpi.status}</Chip>
      </div>
      <p className={`mt-2 text-2xl font-black ${unknown ? "text-muted-foreground" : ""}`}>
        {unknown ? "Unknown" : count(kpi.value)}
      </p>
      <dl className="mt-3 space-y-0.5 text-[9px] text-muted-foreground">
        <div><dt className="inline font-bold">Formula: </dt><dd className="inline">{kpi.formula}</dd></div>
        <div><dt className="inline font-bold">Denominator: </dt><dd className="inline">{kpi.denominator}</dd></div>
        <div><dt className="inline font-bold">Source: </dt><dd className="inline">{kpi.source}</dd></div>
        <div><dt className="inline font-bold">Freshness: </dt><dd className="inline">{kpi.freshness ? date(kpi.freshness) : "Unknown"}</dd></div>
        {unknown && kpi.blocker && (
          <div><dt className="inline font-bold">Blocked by: </dt><dd className="inline">{kpi.blocker}</dd></div>
        )}
      </dl>
    </div>
  );
}

function Overview({ data, loading, reload, onCreate }) {
  if (loading && !data) return <div className="flex items-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading campaigns…</div>;
  if (data?.data_status === "UNAVAILABLE") return <DataUnavailable blockers={["commercial_campaign_source_unavailable"]} onRetry={reload} />;
  const posture = data?.outbound_posture || {};
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Campaigns</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Who we contact, what we send, why, when, from which infrastructure — and with what observed result.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold">
            <RefreshCw size={13} />Refresh
          </button>
          <button onClick={onCreate} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-black text-background">
            <Plus size={13} />Create campaign
          </button>
        </div>
      </div>

      <section data-testid="campaigns-posture" className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
        <ShieldAlert size={16} className="text-muted-foreground" />
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={posture.status === "ENABLED" ? "good" : posture.status === "UNKNOWN" ? "warn" : "info"}>
            Outbound: {posture.status || "UNKNOWN"}
          </Chip>
          <Chip tone={posture.safe_mode === "SAFE_MODE_ACTIVE" ? "bad" : posture.safe_mode === "UNKNOWN" ? "warn" : "neutral"}>
            {posture.safe_mode || "UNKNOWN"}
          </Chip>
        </div>
        <p className="min-w-0 flex-1 text-[10px] text-muted-foreground">{posture.truth_boundary}</p>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(data?.kpis || []).map((kpi) => <KpiCard key={kpi.key} kpi={kpi} />)}
      </div>

      <section className="rounded-2xl border bg-card">
        <div className="border-b p-4">
          <h3 className="text-sm font-black">Needs attention</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">Campaigns with blockers or in REVIEW_REQUIRED.</p>
        </div>
        <div className="divide-y">
          {(data?.needs_attention || []).length === 0
            ? <p className="p-4 text-xs text-muted-foreground">No campaign currently reports a blocker.</p>
            : data.needs_attention.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{row.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(row.blockers || []).join(" · ") || "REVIEW_REQUIRED"}</p>
                </div>
                <Chip tone={statusTone(row.status)}>{row.status}</Chip>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function AllCampaigns({ data, loading, filters, setFilters, reload, onOpen }) {
  if (loading && !data) return <div className="flex items-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading…</div>;
  if (data?.data_status === "UNAVAILABLE") return <DataUnavailable blockers={data?.blockers || []} onRetry={reload} />;
  const items = data?.items || [];
  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-4">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Status</span>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
            {CANONICAL_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Lane</span>
          <select value={filters.lane} onChange={(event) => setFilters((current) => ({ ...current, lane: event.target.value }))} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
            <option value="ALL">ALL</option>
            {LANES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Search</span>
          <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Name or key" className="h-9 w-full rounded-lg border bg-background px-2 text-xs" />
        </label>
        <label className="flex items-end gap-2">
          <input type="checkbox" checked={filters.needs_attention} onChange={(event) => setFilters((current) => ({ ...current, needs_attention: event.target.checked }))} className="h-4 w-4" />
          <span className="pb-2 text-[10px] font-bold uppercase text-muted-foreground">Needs attention</span>
        </label>
      </section>

      <p className="text-[10px] text-muted-foreground">
        Showing {count(data?.returned)} of {count(data?.total)} campaigns.
      </p>

      <section className="overflow-hidden rounded-2xl border bg-card">
        {items.length === 0
          ? <p className="p-6 text-xs text-muted-foreground">No campaign matches these filters.</p>
          : (
            <div className="divide-y">
              {items.map((row) => (
                <button key={row.id} data-testid={`campaign-row-${row.id}`} onClick={() => onOpen(row.id)} className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-secondary/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black">{row.name}</p>
                      <Chip tone={statusTone(row.status)}>{row.status}</Chip>
                      {row.status_is_legacy && <Chip tone="warn">legacy: {row.stored_status}</Chip>}
                      {row.needs_attention && <Chip tone="bad">needs attention</Chip>}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {[row.lane, row.objective_type, (row.markets || []).join("/"), row.owner].filter(Boolean).join(" · ") || "No lane set"}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center text-[10px]">
                    <div><p className="font-black">{count(row.legacy_lead_count)}</p><p className="text-muted-foreground">Leads</p></div>
                    <div><p className="font-black">{row.metrics.provider_accepted === null ? "—" : count(row.metrics.provider_accepted)}</p><p className="text-muted-foreground">Accepted</p></div>
                    <div><p className="font-black">{row.metrics.replied === null ? "—" : count(row.metrics.replied)}</p><p className="text-muted-foreground">Replies</p></div>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
      </section>
    </div>
  );
}

// CAMP-FOLLOWUP (2026-08-16) — human wording for each preflight dimension.
// The raw key and status are still shown, but a founder reading this must not
// have to decode BLOCKED/UNKNOWN to know what to do next.
const DIMENSION_LABELS = {
  audience: "Audience",
  content: "Message content",
  claims_policy: "Claims policy",
  sequence: "Sequence",
  market_authority: "Market authority",
  commercial_policy: "Commercial policy",
  sending_infrastructure: "Sending infrastructure",
  outbound_control: "Global outbound control",
  emergency: "Emergency state",
  budget: "Budget",
  founder_permit: "Founder permit",
};

const STATUS_PHRASE = {
  PASS: "Ready.",
  BLOCKED: "Blocks approval — this must be fixed.",
  REVIEW_REQUIRED: "Needs a decision before approval.",
  UNKNOWN: "Could not be verified, so it counts as not ready.",
};

const VERDICT_PHRASE = {
  PASS: "Everything checked out. This campaign can be sent for approval.",
  REVIEW_REQUIRED: "Some checks need a decision from you before approval.",
  UNKNOWN: "At least one check could not be verified. An unverified check never counts as passed.",
  BLOCKED: "At least one check blocks approval outright.",
};

const DIMENSION_GUIDANCE = {
  audience: "Rebuild and freeze the audience before requesting approval.",
  content: "Create a validated message version with every required variable resolved.",
  claims_policy: "Remove unevidenced claims or add the required recipient evidence.",
  sequence: "Validate the sequence with every mandatory stop condition.",
  market_authority: "Keep the campaign inside CAMBRA's 10 active launch markets.",
  commercial_policy: "Select an active acquisition policy in Campaign setup.",
  sending_infrastructure: "Select at least one prepared mailbox with a verified webhook and bounded capacity.",
  outbound_control: "Run the governed canary preflight in Founder Control. This cannot be bypassed here.",
  emergency: "Resolve the emergency or communications pause in Founder Control.",
  budget: "Set a positive campaign spend ceiling in Campaign setup.",
  founder_permit: "Issue and bind a scoped FounderPermit through CAMBRA Command or Founder Control.",
};

function statusTone2(status) {
  if (status === "PASS") return "good";
  if (status === "BLOCKED") return "bad";
  return "warn";
}

function FounderPermitNotice({ preview, loading, onPreview, onConfirm }) {
  return (
    <div data-testid="preflight-founder-permit-notice" className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <KeyRound size={18} className="mt-0.5 shrink-0 text-amber-700" />
        <div>
          <p className="text-xs font-black text-amber-900">Scoped founder authorization is required</p>
          <p className="mt-1 text-[11px] leading-5 text-amber-800">
            CAMBRA could not verify a valid FounderPermit covering this campaign. Create a narrow permit for this exact
            campaign, its selected markets and its hard contact limit. This does not start sending.
          </p>
          {preview && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-white/70 p-3 text-[10px] text-amber-950">
              <p className="font-black">Review before confirming</p>
              <p className="mt-1">Markets: {(preview.impact?.markets || []).join(", ") || "none"} · Maximum messages: {preview.impact?.max_external_messages || 0} · Expires: {date(preview.impact?.permit_expires_at)}</p>
              <p className="mt-1 font-bold">Global outbound remains paused and no email is sent by this action.</p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!preview && <button data-testid="preview-campaign-permit" onClick={onPreview} disabled={loading} className="rounded-lg bg-amber-900 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">{loading ? "Preparing…" : "Preview scoped permit"}</button>}
            {preview && <button data-testid="confirm-campaign-permit" onClick={onConfirm} disabled={loading} className="rounded-lg bg-amber-900 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">{loading ? "Issuing…" : "Confirm scoped permit"}</button>}
            <a href="/admin/founder-control" className="rounded-lg border border-amber-300 px-3 py-2 text-[10px] font-black">Open Founder Control</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreflightBreakdown({ preflight, permitPreview, loading, onEditConfiguration, onPreviewPermit, onConfirmPermit }) {
  const dimensions = preflight?.dimensions || [];
  const permitBlocked = dimensions.some((dimension) => dimension.key === "founder_permit" && dimension.status !== "PASS");
  const setupBlocked = dimensions.some((dimension) => ["commercial_policy", "sending_infrastructure", "budget"].includes(dimension.key) && dimension.status !== "PASS");
  const authorityBlocked = dimensions.some((dimension) => ["outbound_control", "emergency", "founder_permit"].includes(dimension.key) && dimension.status !== "PASS");
  return (
    <div className="space-y-3">
      <div data-testid="preflight-verdict" className="rounded-xl border bg-secondary/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={statusTone2(preflight?.verdict)}>{preflight?.verdict || "UNKNOWN"}</Chip>
          <p className="text-[11px] font-bold">{VERDICT_PHRASE[preflight?.verdict] || VERDICT_PHRASE.UNKNOWN}</p>
        </div>
      </div>

      {permitBlocked && <FounderPermitNotice preview={permitPreview} loading={loading} onPreview={onPreviewPermit} onConfirm={onConfirmPermit} />}

      <ul data-testid="preflight-dimensions" className="divide-y rounded-xl border">
        {dimensions.map((dimension) => (
          <li key={`${dimension.key}-${dimension.status}`} data-testid={`preflight-dimension-${dimension.key}`} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold">{DIMENSION_LABELS[dimension.key] || dimension.key}</p>
              <Chip tone={statusTone2(dimension.status)}>{dimension.status}</Chip>
            </div>
            <p className="mt-1 text-[10px] font-bold text-muted-foreground">{STATUS_PHRASE[dimension.status] || dimension.status}</p>
            {dimension.detail && <p className="mt-0.5 text-[10px] text-muted-foreground">{dimension.detail}</p>}
            {dimension.status !== "PASS" && DIMENSION_GUIDANCE[dimension.key] && <p className="mt-2 text-[10px] font-bold">Next: {DIMENSION_GUIDANCE[dimension.key]}</p>}
          </li>
        ))}
      </ul>

      {(setupBlocked || authorityBlocked) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {setupBlocked && <button data-testid="fix-campaign-setup" onClick={onEditConfiguration} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-background px-4 text-xs font-black"><Settings2 size={13} />Fix campaign setup</button>}
          {authorityBlocked && <a href="/admin/founder-control" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-xs font-black text-background"><ShieldAlert size={13} />Open Founder Control</a>}
        </div>
      )}
    </div>
  );
}

/** A stale PASS can still be refused by the server; its fresh 409 body wins. */
function PreflightDialog({ state, onClose, onRequestApproval, onApproveCampaign, onEditConfiguration, onRecheck, onPreviewPermit, onConfirmPermit }) {
  const open = Boolean(state);
  const preflight = state?.approvalRejection?.preflight || state?.preflight || null;
  const approval = state?.approval || null;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Campaign status check</DialogTitle>
          <DialogDescription>
            A read-only check of every approval condition. Running it changes nothing and sends nothing.
          </DialogDescription>
        </DialogHeader>

        {state?.loading && (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />Checking…
          </div>
        )}

        {state?.error && !state?.approvalRejection && (
          <div role="alert" data-testid="preflight-error" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">
            {state.error}
          </div>
        )}

        {/* A refused approval is explained with the same breakdown, not as a bare error. */}
        {state?.approvalRejection && (
          <div data-testid="approval-rejected" className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[11px] font-black text-amber-900">Approval was not granted</p>
            <p className="mt-1 text-[10px] text-amber-800">
              The checks below did not pass, so the campaign stays as it was. Nothing was changed and nothing was sent.
            </p>
          </div>
        )}

        {approval && (
          <div data-testid="approval-granted" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-700" />
              <div className="min-w-0">
                <p className="text-[11px] font-black text-emerald-900">Approval package ready · status READY_FOR_APPROVAL</p>
                <p className="mt-1 text-[10px] leading-5 text-emerald-800">
                  The scope is hash-bound and ready for your final campaign approval. Neither step sends anything; real
                  outbound still requires a fresh global GO preflight and an explicit transport start.
                </p>
                <p className="mt-2 break-all text-[10px] text-emerald-800">
                  <span className="font-bold">Approval hash:</span> {approval.approval_hash}
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] font-bold text-emerald-800">Bound scope</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-all text-[9px] text-emerald-900">
                    {JSON.stringify(approval.scope, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          </div>
        )}

        {state?.approved && (
          <div data-testid="campaign-approved" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-bold text-emerald-900">
            Campaign configuration approved. Sending remains paused until the separate global start.
          </div>
        )}

        {preflight && <PreflightBreakdown preflight={preflight} permitPreview={state?.permitPreview} loading={state?.loading} onEditConfiguration={onEditConfiguration} onPreviewPermit={onPreviewPermit} onConfirmPermit={onConfirmPermit} />}

        <DialogFooter>
          <button onClick={onClose} className="h-10 rounded-xl border px-4 text-xs font-bold">Close</button>
          {preflight && !approval && !preflight.approvable && <button onClick={onRecheck} disabled={Boolean(state?.loading)} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-black disabled:opacity-40"><RefreshCw size={13} className={state?.loading ? "animate-spin" : ""} />Recheck</button>}
          {preflight?.approvable && !approval && <button data-testid="request-approval-button" onClick={onRequestApproval} disabled={Boolean(state?.loading)} className="h-10 rounded-xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-40">{state?.loading ? "Working…" : "Request approval"}</button>}
          {approval && !state?.approved && <button data-testid="approve-campaign-button" onClick={onApproveCampaign} disabled={Boolean(state?.loading)} className="h-10 rounded-xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-40">{state?.loading ? "Approving…" : "Approve this campaign"}</button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignSetupDialog({ state, onClose, onChange, onSave }) {
  const open = Boolean(state);
  const form = state?.form || {};
  const options = state?.options || { target_profiles: [], senders: [] };
  const campaign = state?.campaign || {};
  const selectedPolicy = options.target_profiles.find((profile) => profile.id === form.target_profile_id) || null;
  const selectedSenders = new Set(form.sending_profile_keys || []);
  const selectedSenderRows = options.senders.filter((sender) => selectedSenders.has(sender.profile_key));
  const readySenderCount = selectedSenderRows.filter((sender) => sender.readiness?.ready).length;
  const budgetMinor = Math.round(Number(form.budget_eur) * 100);
  const contactLimit = Number(form.contact_limit);
  const companyContactLimit = Number(form.company_contact_limit);
  const audienceSize = Array.isArray(campaign.lead_ids) ? campaign.lead_ids.length : 0;
  const valid = Boolean(form.target_profile_id) && selectedSenders.size > 0
    && Number.isSafeInteger(budgetMinor) && budgetMinor > 0
    && Number.isSafeInteger(contactLimit) && contactLimit > 0 && contactLimit <= audienceSize
    && Number.isSafeInteger(companyContactLimit) && companyContactLimit > 0 && companyContactLimit <= contactLimit;
  const update = (key, value) => onChange((current) => ({ ...current, error: "", form: { ...current.form, [key]: value } }));
  const toggleSender = (profileKey) => {
    const next = new Set(selectedSenders);
    next.has(profileKey) ? next.delete(profileKey) : next.add(profileKey);
    update("sending_profile_keys", [...next]);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fix campaign setup</DialogTitle>
          <DialogDescription>
            Edit the authority, sender identities and hard limits for this draft. Saving rechecks status and never sends.
          </DialogDescription>
        </DialogHeader>

        {state?.loading ? <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading current controls…</div> : (
          <div className="space-y-4">
            {state?.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">{state.error}</div>}

            <section className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-black">Commercial policy</p><p className="mt-1 text-[10px] text-muted-foreground">Approval requires an active acquisition policy with a positive daily cap.</p></div>
                <a href="/admin/settings?tab=autonomy" className="rounded-lg border px-3 py-2 text-[10px] font-black">Manage policies</a>
              </div>
              <select aria-label="Campaign setup target profile" value={form.target_profile_id || ""} onChange={(event) => update("target_profile_id", event.target.value)} className="mt-3 h-10 w-full rounded-xl border bg-background px-3 text-xs">
                <option value="">Choose a policy</option>
                {options.target_profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.readiness?.ready ? "READY" : String(profile.status || "NOT READY").toUpperCase()} · {profile.name} · {(profile.countries || []).join(", ") || "no market"}</option>)}
              </select>
              {selectedPolicy && !selectedPolicy.readiness?.ready && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold text-amber-800">The selected policy is not active. It can remain attached to the draft, but it cannot pass approval.</p>}
            </section>

            <section className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black">Sender emails</p><p className="mt-1 text-[10px] text-muted-foreground">Select explicit identities. A paused but fully verified mailbox counts as prepared; sending stays off until the separate GO start.</p></div><a href="/admin/campaigns?tab=commercial" className="rounded-lg border px-3 py-2 text-[10px] font-black">View mailbox health</a></div>
              <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                {options.senders.map((sender) => <label key={sender.profile_key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selectedSenders.has(sender.profile_key) ? "border-cyan-500/40 bg-cyan-500/5" : ""}`}><input type="checkbox" aria-label={`Configure ${sender.from_address || sender.profile_key}`} checked={selectedSenders.has(sender.profile_key)} onChange={() => toggleSender(sender.profile_key)} className="mt-0.5" /><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black">{sender.from_address || sender.profile_key}</span><span className="block text-[9px] text-muted-foreground">{sender.provider} · {sender.status} · cap {sender.current_daily_cap}/day · webhook {sender.webhook_status}</span></span><Chip tone={sender.readiness?.ready ? "good" : "bad"}>{sender.readiness?.ready ? "READY" : "NOT READY"}</Chip></label>)}
                {!options.senders.length && <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">No sender identity is configured.</p>}
              </div>
              {selectedSenders.size > 0 && readySenderCount === 0 && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold text-amber-800">None of the selected mailboxes is currently ready. This remains a real blocker, not a software error.</p>}
            </section>

            <section className="rounded-2xl border p-4">
              <p className="text-xs font-black">Hard campaign limits</p>
              <p className="mt-1 text-[10px] text-muted-foreground">These are ceilings, not targets. They cannot exceed the {count(audienceSize)} selected people.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-[10px] font-bold">Spend ceiling (€)<input aria-label="Campaign setup spend ceiling" type="number" min="0.01" step="0.01" value={form.budget_eur || ""} onChange={(event) => update("budget_eur", event.target.value)} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-xs font-normal" /></label>
                <label className="text-[10px] font-bold">Total contacts<input aria-label="Campaign setup contact limit" type="number" min="1" max={Math.max(1, audienceSize)} value={form.contact_limit || ""} onChange={(event) => update("contact_limit", event.target.value)} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-xs font-normal" /></label>
                <label className="text-[10px] font-bold">Per company<input aria-label="Campaign setup company contact limit" type="number" min="1" max={Math.max(1, contactLimit || 1)} value={form.company_contact_limit || ""} onChange={(event) => update("company_contact_limit", event.target.value)} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-xs font-normal" /></label>
              </div>
            </section>

            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] text-sky-800"><b>Still separate:</b> global outbound activation and the scoped FounderPermit are only handled by Founder Control. This editor cannot turn sending on.</div>
          </div>
        )}

        <DialogFooter>
          <button onClick={onClose} className="h-10 rounded-xl border px-4 text-xs font-bold">Cancel</button>
          {!state?.loading && <button data-testid="save-campaign-setup" onClick={() => onSave({ budgetMinor, contactLimit, companyContactLimit })} disabled={!valid || state?.saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-40">{state?.saving ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Save and recheck</button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ detail, loading, onBack, onCheckStatus, onEditConfiguration }) {
  if (loading && !detail) return <div className="flex items-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading campaign…</div>;
  if (!detail) return <p className="p-6 text-xs text-muted-foreground">Select a campaign from All Campaigns.</p>;
  const item = detail.item || {};
  const gaps = detail.canonical_model_gaps || [];
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-[10px] font-bold text-muted-foreground">← Back to all campaigns</button>
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black">{item.name}</h2>
          <Chip tone={statusTone(item.status)}>{item.status}</Chip>
          {item.status_is_legacy && <Chip tone="warn">stored as {item.stored_status}</Chip>}
          {/* Never pre-disabled: the check itself is always allowed, and its
              answer is what says whether anything blocks. */}
          <button
            data-testid="check-status-button"
            onClick={onCheckStatus}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold"
          >
            <Stethoscope size={13} />Check status
          </button>
          <button data-testid="edit-campaign-setup" onClick={onEditConfiguration} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-black text-background"><Pencil size={13} />Edit setup</button>
        </div>
        <dl className="mt-4 grid gap-3 text-[11px] md:grid-cols-4">
          <div><dt className="text-muted-foreground">Lane</dt><dd className="font-bold">{item.lane || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Objective</dt><dd className="font-bold">{item.objective_type || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Owner</dt><dd className="font-bold">{item.owner || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Policy</dt><dd className="font-bold">{item.policy_key || "—"}</dd></div>
        </dl>
        {(item.blockers || []).length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] font-black uppercase text-amber-800">Blockers</p>
            <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-800">
              {item.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        )}
        <dl className="mt-4 grid gap-2 rounded-xl border bg-secondary/25 p-3 text-[10px] sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Spend ceiling</dt><dd className="font-black">{Number.isFinite(Number(detail.campaign?.budget_limit_minor)) && Number(detail.campaign?.budget_limit_minor) > 0 ? new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(Number(detail.campaign.budget_limit_minor) / 100) : "Not set"}</dd></div>
          <div><dt className="text-muted-foreground">Contact limit</dt><dd className="font-black">{detail.campaign?.contact_limit || "Not set"}</dd></div>
          <div><dt className="text-muted-foreground">Per company</dt><dd className="font-black">{detail.campaign?.company_contact_limit || "Not set"}</dd></div>
          <div><dt className="text-muted-foreground">Sender identities</dt><dd className="font-black">{(detail.campaign?.sending_profile_keys || []).length || "None"}</dd></div>
        </dl>
      </section>

      <section data-testid="campaign-canonical-model" className="rounded-2xl border bg-card p-5">
        <h3 className="text-sm font-black">Canonical model</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[
            ["Audience", detail.audience_versions, "no_versioned_audience"],
            ["Content", detail.content_versions, "no_versioned_content"],
            ["Sequence", detail.sequence_versions, "no_versioned_sequence"],
          ].map(([label, versions, gapKey]) => (
            <div key={label} className="rounded-xl border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold">{label}</p>
                <Chip tone={gaps.includes(gapKey) ? "warn" : "good"}>
                  {gaps.includes(gapKey) ? "not versioned" : `v${(versions || [])[0]?.version ?? "?"}`}
                </Chip>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {gaps.includes(gapKey)
                  ? "This campaign predates the versioned authority. Its legacy evidence is shown below and is not reconstructed as a version."
                  : `${(versions || []).length} version(s) recorded.`}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-secondary/40 p-3 text-[10px] text-muted-foreground">
          <p className="font-bold">Legacy projection</p>
          <p className="mt-1">
            {count(detail.legacy_projection?.lead_ids_count)} lead id(s) · message {detail.legacy_projection?.message_prepared ? "prepared" : "not prepared"} · sequence {detail.legacy_projection?.sequence_prepared ? "prepared" : "not prepared"}
          </p>
          <p className="mt-1">{detail.legacy_projection?.note}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed bg-card p-5">
        <div className="flex items-start gap-3">
          <Layers size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs font-black">Versioned campaign boundary</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              The <b>Create Campaign</b> studio builds a real versioned audience, message and sequence draft from
              canonical leads and configured sender identities. This detail remains an immutable evidence view:
              <b> Check status</b> runs the full preflight read-only and <b>Request approval</b> records a reviewed
              configuration. Creating, checking and approving never schedules or sends anything.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function AdminCampaigns() {
  const initialAudienceId = new URLSearchParams(window.location.search).get("audience") || "";
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("mode") === "create" ? "create" : "overview");
  const [overview, setOverview] = useState(null);
  const [list, setList] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ status: "ALL", lane: "ALL", search: "", needs_attention: false });
  const [preflightState, setPreflightState] = useState(null);
  const [setupState, setSetupState] = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true); setError("");
    try { setOverview(await call("overview")); }
    catch (caught) { setError(caught.message); setOverview(caught.data || { data_status: "UNAVAILABLE" }); }
    finally { setLoading(false); }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setList(await call("list", {
        status: filters.status, lane: filters.lane, search: filters.search,
        needs_attention: filters.needs_attention,
      }));
    } catch (caught) { setError(caught.message); setList(caught.data || { data_status: "UNAVAILABLE" }); }
    finally { setLoading(false); }
  }, [filters]);

  const openDetail = useCallback(async (campaignId) => {
    setTab("detail"); setLoading(true); setError("");
    try { setDetail(await call("detail", { campaign_id: campaignId })); }
    catch (caught) { setError(caught.message); setDetail(null); }
    finally { setLoading(false); }
  }, []);

  const openConfiguration = useCallback(async () => {
    const campaign = detail?.campaign;
    if (!campaign?.id) return;
    setPreflightState(null);
    setSetupState({ campaignId: campaign.id, campaign, loading: true, saving: false });
    try {
      const options = await call("builder_options", { limit: 1 });
      setSetupState({
        campaignId: campaign.id,
        campaign,
        options,
        loading: false,
        saving: false,
        form: {
          target_profile_id: campaign.target_profile_id || "",
          sending_profile_keys: Array.isArray(campaign.sending_profile_keys) ? campaign.sending_profile_keys : [],
          budget_eur: Number(campaign.budget_limit_minor) > 0 ? String(Number(campaign.budget_limit_minor) / 100) : "",
          contact_limit: Number(campaign.contact_limit) > 0 ? String(campaign.contact_limit) : "",
          company_contact_limit: Number(campaign.company_contact_limit) > 0 ? String(campaign.company_contact_limit) : "1",
        },
      });
    } catch (caught) {
      setSetupState({ campaignId: campaign.id, campaign, loading: false, saving: false, error: caught?.message || "Campaign setup is unavailable" });
    }
  }, [detail]);

  const saveConfiguration = useCallback(async ({ budgetMinor, contactLimit, companyContactLimit }) => {
    const campaignId = setupState?.campaignId;
    const form = setupState?.form;
    if (!campaignId || !form) return;
    setSetupState((current) => ({ ...current, saving: true, error: "" }));
    try {
      await call("update_draft", {
        campaign_id: campaignId,
        target_profile_id: form.target_profile_id,
        sending_profile_keys: form.sending_profile_keys,
        budget_limit_minor: budgetMinor,
        contact_limit: contactLimit,
        company_contact_limit: companyContactLimit,
      });
      const [nextDetail, checked] = await Promise.all([
        call("detail", { campaign_id: campaignId }),
        call("preflight", { campaign_id: campaignId }),
      ]);
      setDetail(nextDetail);
      setSetupState(null);
      setNotice("Campaign setup saved and rechecked. Nothing was sent.");
      setPreflightState({ campaignId, loading: false, preflight: checked.preflight });
    } catch (caught) {
      setSetupState((current) => ({ ...current, saving: false, error: caught?.message || "Campaign setup could not be saved" }));
    }
  }, [setupState]);

  const campaignCreated = useCallback(async (campaignId, result = {}) => {
    setNotice(result.partial
      ? "The draft exists, but preparation needs attention. Nothing was sent."
      : "Campaign draft, audience, message and sequence were saved. Nothing was sent.");
    await openDetail(campaignId);
  }, [openDetail]);

  // `preflight` is the read-only action: it never mutates a campaign.
  const checkStatus = useCallback(async () => {
    const campaignId = detail?.item?.id;
    if (!campaignId) return;
    setPreflightState({ campaignId, loading: true });
    try {
      const response = await call("preflight", { campaign_id: campaignId });
      setPreflightState({ campaignId, loading: false, preflight: response.preflight });
    } catch (caught) {
      setPreflightState({ campaignId, loading: false, error: caught.message, preflight: caught.data?.preflight || null });
    }
  }, [detail]);

  // The server is the authority on approvability, so this always calls it:
  // a cached preflight can be stale, and the 409 carries a FRESH preflight
  // that is more truthful than what is already on screen.
  const requestApproval = useCallback(async () => {
    const campaignId = preflightState?.campaignId || detail?.item?.id;
    if (!campaignId) return;
    setPreflightState((current) => ({ ...(current || {}), campaignId, loading: true, error: "", approvalRejection: null }));
    try {
      const response = await call("request_approval", { campaign_id: campaignId });
      setPreflightState({
        campaignId, loading: false,
        preflight: response.preflight,
        approval: response.approval,
      });
      // Reflect the persisted status change in the open detail view.
      if (response.item) setDetail((current) => (current ? { ...current, item: response.item } : current));
    } catch (caught) {
      const rejected = caught.data?.error === "preflight_not_passed";
      setPreflightState({
        campaignId, loading: false,
        preflight: caught.data?.preflight || preflightState?.preflight || null,
        approvalRejection: rejected ? { preflight: caught.data?.preflight || null } : null,
        error: rejected ? "" : caught.message,
      });
    }
  }, [detail, preflightState]);

  const previewPermit = useCallback(async () => {
    const campaignId = preflightState?.campaignId || detail?.item?.id;
    if (!campaignId) return;
    setPreflightState((current) => ({ ...(current || {}), campaignId, loading: true, error: "" }));
    try {
      const response = await call("issue_permit", { campaign_id: campaignId });
      if (response.already_bound) {
        const checked = await call("preflight", { campaign_id: campaignId });
        setPreflightState({ campaignId, loading: false, preflight: checked.preflight });
        return;
      }
      setPreflightState((current) => ({
        ...(current || {}), campaignId, loading: false,
        permitPreview: response.preview,
        permitCommandKey: response.command_key,
        permitConfirmation: response.confirmation_required,
      }));
    } catch (caught) {
      setPreflightState((current) => ({ ...(current || {}), campaignId, loading: false, error: caught.message }));
    }
  }, [detail, preflightState]);

  const confirmPermit = useCallback(async () => {
    const campaignId = preflightState?.campaignId || detail?.item?.id;
    const preview = preflightState?.permitPreview;
    if (!campaignId || !preview || !preflightState?.permitCommandKey) return;
    setPreflightState((current) => ({ ...(current || {}), loading: true, error: "" }));
    try {
      await call("issue_permit", {
        campaign_id: campaignId,
        confirmed: true,
        confirmation: preflightState.permitConfirmation,
        command_key: preflightState.permitCommandKey,
        preview_hash: preview.preview_hash,
      });
      const [nextDetail, checked] = await Promise.all([
        call("detail", { campaign_id: campaignId }),
        call("preflight", { campaign_id: campaignId }),
      ]);
      setDetail(nextDetail);
      setPreflightState({ campaignId, loading: false, preflight: checked.preflight });
      setNotice("Scoped founder permit issued for this exact campaign. Nothing was sent.");
    } catch (caught) {
      setPreflightState((current) => ({ ...(current || {}), loading: false, error: caught.message }));
    }
  }, [detail, preflightState]);

  const approveCampaign = useCallback(async () => {
    const campaignId = preflightState?.campaignId || detail?.item?.id;
    const approvalHash = preflightState?.approval?.approval_hash;
    if (!campaignId || !approvalHash) return;
    setPreflightState((current) => ({ ...(current || {}), loading: true, error: "" }));
    try {
      const response = await call("approve_campaign", {
        campaign_id: campaignId,
        approval_hash: approvalHash,
        confirmation: "APPROVE_CAMBRA_CAMPAIGN_CONFIGURATION",
      });
      setDetail((current) => current ? { ...current, campaign: response.campaign, item: response.item } : current);
      setPreflightState((current) => ({ ...(current || {}), loading: false, approved: true }));
      setNotice("Campaign configuration approved. Sending is still paused pending the separate GO start.");
    } catch (caught) {
      setPreflightState((current) => ({ ...(current || {}), loading: false, error: caught.message }));
    }
  }, [detail, preflightState]);

  useEffect(() => { if (tab === "overview") loadOverview(); }, [tab, loadOverview]);
  useEffect(() => { if (tab === "all") loadList(); }, [tab, loadList]);

  const body = useMemo(() => {
    if (tab === "overview") return <Overview data={overview} loading={loading} reload={loadOverview} onCreate={() => { setNotice(""); setTab("create"); }} />;
    if (tab === "create") return <CampaignBuilder call={call} initialAudienceId={initialAudienceId} onCancel={() => setTab("overview")} onCreated={campaignCreated} />;
    if (tab === "all") return <AllCampaigns data={list} loading={loading} filters={filters} setFilters={setFilters} reload={loadList} onOpen={openDetail} />;
    return <Detail detail={detail} loading={loading} onBack={() => setTab("all")} onCheckStatus={checkStatus} onEditConfiguration={openConfiguration} />;
  }, [tab, overview, list, detail, loading, filters, loadOverview, loadList, openDetail, checkStatus, openConfiguration, campaignCreated, initialAudienceId]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-1">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => { if (key === "create") setNotice(""); setTab(key); }}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-[11px] font-bold ${tab === key ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
        {/* Still true: nothing here reaches a provider. Spelled out so the new
            check/approve buttons cannot be mistaken for a send. */}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[10px] font-bold text-muted-foreground">
          <Ban size={12} />No sends from this workspace — approving is not sending
        </span>
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">{error}</div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-bold text-emerald-800">{notice}</div>
      )}
      {body}
      <PreflightDialog
        state={preflightState}
        onClose={() => setPreflightState(null)}
        onRequestApproval={requestApproval}
        onApproveCampaign={approveCampaign}
        onEditConfiguration={openConfiguration}
        onRecheck={checkStatus}
        onPreviewPermit={previewPermit}
        onConfirmPermit={confirmPermit}
      />
      <CampaignSetupDialog
        state={setupState}
        onClose={() => setSetupState(null)}
        onChange={setSetupState}
        onSave={saveConfiguration}
      />
    </div>
  );
}
