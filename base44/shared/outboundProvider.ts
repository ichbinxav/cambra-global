export const OUTBOUND_PROVIDER_VERSION = "outbound-provider-1.0.0";
export const INSTANTLY_API_VERSION = "v2";
export const INSTANTLY_API_BASE = "https://api.instantly.ai/api/v2";
export const INSTANTLY_CAMPAIGN_TEMPLATE_REVISION =
  "cambra-controlled-message-v1";

export type OutboundProviderStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "AUTHENTICATED"
  | "DEGRADED"
  | "ACTIVE"
  | "ERROR";

export interface OutboundProvider {
  readonly key: string;
  status(): {
    status: OutboundProviderStatus;
    configured: boolean;
    reason: string | null;
  };
  diagnose(): Promise<any>;
  queueInitial(input: any): Promise<any>;
  sendReply(input: any): Promise<any>;
}

/**
 * This adapter is deliberately persistence-agnostic. Every production caller
 * must obtain a reservePaidOperation reservation before invoking a metered
 * method. Emergency pause is the sole exception: it must remain available
 * after a cost kill-switch has fired.
 */

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const clean = (value: any, limit = 240) =>
  String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, limit);

export class InstantlyApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  automatic_retry_blocked: boolean;
  provider_effect_ambiguous: boolean;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "InstantlyApiError";
    this.status = status;
    this.code = code;
    this.retryable = status === 429 || status >= 500 || status === 0;
    this.automatic_retry_blocked = false;
    this.provider_effect_ambiguous = false;
  }
}

function instantlyReceiptError(message: string) {
  const error = new InstantlyApiError(
    0,
    "INSTANTLY_PROVIDER_RECEIPT_REQUIRED",
    message,
  );
  error.retryable = false;
  error.automatic_retry_blocked = true;
  error.provider_effect_ambiguous = true;
  return error;
}

export async function instantlyRequest(
  apiKey: string,
  path: string,
  options: any = {},
  fetcher: any = fetch,
) {
  if (!apiKey) {
    throw new InstantlyApiError(
      0,
      "INSTANTLY_NOT_CONFIGURED",
      "Instantly API key is not configured",
    );
  }
  const method = String(options.method || "GET").toUpperCase();
  // Instantly does not document an idempotency contract for lead creation or
  // email reply. Retry is therefore restricted to reads (including an
  // explicitly-declared read-only POST); mutations are at-most-once.
  const retrySafe = ["GET", "HEAD"].includes(method) ||
    options.retry_mode === "read_only";
  const maxAttempts = retrySafe ? 3 : 1;
  let last: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetcher(`${INSTANTLY_API_BASE}${path}`, {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(options.headers || {}),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const message = clean(
        payload?.message ||
          payload?.error ||
          `Instantly HTTP ${response.status}`,
      );
      throw new InstantlyApiError(
        Number(response.status || 0),
        response.status === 401
          ? "INSTANTLY_UNAUTHORIZED"
          : response.status === 402
          ? "INSTANTLY_PLAN_REQUIRED"
          : response.status === 429
          ? "INSTANTLY_RATE_LIMITED"
          : response.status >= 500
          ? "INSTANTLY_UPSTREAM_UNAVAILABLE"
          : "INSTANTLY_REQUEST_REJECTED",
        message,
      );
    } catch (error: any) {
      last = error instanceof InstantlyApiError ? error : new InstantlyApiError(
        0,
        "INSTANTLY_NETWORK_ERROR",
        clean(error?.message || error),
      );
      if (!retrySafe) {
        last.retryable = false;
        last.automatic_retry_blocked = true;
        last.provider_effect_ambiguous = true;
      }
      if (!last.retryable || attempt === maxAttempts - 1) break;
      await wait(250 * 2 ** attempt);
    }
  }
  throw (
    last ||
    new InstantlyApiError(
      0,
      "INSTANTLY_REQUEST_FAILED",
      "Instantly request failed",
    )
  );
}

export function instantlyProviderStatus(apiKeyPresent: boolean): {
  status: OutboundProviderStatus;
  configured: boolean;
  reason: string | null;
} {
  return apiKeyPresent
    ? { status: "CONFIGURED", configured: true, reason: null }
    : { status: "NOT_CONFIGURED", configured: false, reason: "secret_missing" };
}

export function instantlyProfileReady(profile: any) {
  const accounts = Array.isArray(profile?.provider_config_json?.account_emails)
    ? profile.provider_config_json.account_emails.map(String).filter(Boolean)
    : [];
  return Boolean(
    profile?.provider === "instantly" &&
      profile?.external_campaign_id &&
      accounts.length &&
      profile?.from_address &&
      profile?.webhook_status === "ACTIVE" &&
      profile?.provider_config_json?.sender_ready === true &&
      profile?.provider_config_json?.native_ai_conflict !== true &&
      profile?.provider_config_json?.native_ai_reply_enabled !== true,
  );
}

export function instantlyCampaignDefinition(input: any) {
  const daily = Math.max(
    1,
    Math.min(15, Math.floor(Number(input?.daily_limit) || 10)),
  );
  const requestedTimezone = clean(input?.timezone || "Europe/Paris", 80);
  // Instantly accepts a curated timezone enum rather than the full IANA set.
  // Map CAMBRA's common European zones to provider-supported equivalents with
  // the same civil-time/DST behavior instead of sending an invalid value.
  const timezoneAliases: Record<string, string> = {
    "Europe/Paris": "Europe/Belgrade",
    "Europe/Madrid": "Europe/Belgrade",
    "Europe/Brussels": "Europe/Belgrade",
    "Europe/Amsterdam": "Europe/Belgrade",
    "Europe/Berlin": "Europe/Belgrade",
    "Europe/Rome": "Europe/Belgrade",
    "Europe/London": "Europe/Isle_of_Man",
    "Europe/Lisbon": "Atlantic/Canary",
  };
  const timezone = timezoneAliases[requestedTimezone] || requestedTimezone;
  const accounts = [
    ...new Set(
      (Array.isArray(input?.account_emails) ? input.account_emails : [])
        .map((value: any) => clean(value, 200).toLowerCase())
        .filter(Boolean),
    ),
  ];
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
  return {
    name: clean(input?.name || `CAMBRA ${input?.language || "EN"} CANARY`, 120),
    campaign_schedule: {
      schedules: [
        {
          name: "CAMBRA governed hours",
          timing: {
            from: clean(input?.from || "09:00", 5),
            to: clean(input?.to || "17:00", 5),
          },
          days: {
            0: true,
            1: true,
            2: true,
            3: true,
            4: true,
            5: false,
            6: false,
          },
          timezone,
        },
      ],
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
    },
    sequences: [
      {
        steps: [
          {
            type: "email",
            delay: 1,
            delay_unit: "days",
            pre_delay: 1,
            pre_delay_unit: "days",
            variants: [
              {
                subject: "{{cambra_subject}}",
                body: "{{cambra_body}}",
                v_disabled: false,
              },
            ],
          },
        ],
      },
    ],
    email_gap: 15,
    random_wait_max: 10,
    text_only: true,
    first_email_text_only: true,
    email_list: accounts,
    daily_limit: daily,
    daily_max_leads: daily,
    stop_on_reply: true,
    stop_on_auto_reply: true,
    stop_for_company: true,
    prioritize_new_leads: false,
    link_tracking: false,
    open_tracking: false,
    insert_unsubscribe_header: true,
  };
}

function splitName(value: any) {
  const parts = clean(value, 160).split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") };
}

export function instantlyLeadDefinition(input: any) {
  const name = splitName(input?.contact_name);
  return {
    campaign: String(input?.campaign_id || ""),
    email: String(input?.to || ""),
    ...name,
    company_name: clean(input?.company_name, 200) || null,
    website: input?.company_domain
      ? `https://${
        clean(input.company_domain, 200).replace(/^https?:\/\//, "")
      }`
      : null,
    job_title: clean(input?.contact_title, 160) || null,
    personalization: clean(input?.personalization, 500) || null,
    skip_if_in_campaign: true,
    verify_leads_on_import: true,
    custom_variables: {
      cambra_subject: String(input?.subject || ""),
      cambra_body: String(input?.text || ""),
      cambra_thread_id: String(input?.thread_id || ""),
      cambra_idempotency_key: String(input?.idempotency_key || ""),
      cambra_message_source: "CAMBRA",
    },
  };
}

export function instantlyReplyDefinition(input: any) {
  return {
    eaccount: String(input?.eaccount || ""),
    reply_to_uuid: String(input?.reply_to_uuid || ""),
    subject: String(input?.subject || ""),
    body: { html: String(input?.html || ""), text: String(input?.text || "") },
  };
}

export class InstantlyOutboundProvider implements OutboundProvider {
  readonly key = "instantly";
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: any = fetch,
  ) {}
  status() {
    return instantlyProviderStatus(Boolean(this.apiKey));
  }
  async diagnose() {
    const [accounts, campaigns, webhooks] = await Promise.all([
      instantlyRequest(this.apiKey, "/accounts?limit=100", {}, this.fetcher),
      instantlyRequest(this.apiKey, "/campaigns?limit=100", {}, this.fetcher),
      instantlyRequest(this.apiKey, "/webhooks?limit=100", {}, this.fetcher),
    ]);
    return {
      status: "AUTHENTICATED",
      accounts: Array.isArray(accounts?.items) ? accounts.items : [],
      campaigns: Array.isArray(campaigns?.items) ? campaigns.items : [],
      webhooks: Array.isArray(webhooks?.items) ? webhooks.items : [],
    };
  }
  createCampaign(input: any) {
    return instantlyRequest(
      this.apiKey,
      "/campaigns",
      { method: "POST", body: instantlyCampaignDefinition(input) },
      this.fetcher,
    );
  }
  activateCampaign(id: string) {
    return instantlyRequest(
      this.apiKey,
      `/campaigns/${encodeURIComponent(id)}/activate`,
      { method: "POST" },
      this.fetcher,
    );
  }
  pauseCampaign(id: string) {
    return instantlyRequest(
      this.apiKey,
      `/campaigns/${encodeURIComponent(id)}/pause`,
      { method: "POST" },
      this.fetcher,
    );
  }
  listEmails(limit = 100) {
    return instantlyRequest(
      this.apiKey,
      `/emails?limit=${
        Math.max(1, Math.min(100, Math.floor(Number(limit) || 100)))
      }`,
      {},
      this.fetcher,
    );
  }
  createWebhook(input: any) {
    return instantlyRequest(
      this.apiKey,
      "/webhooks",
      {
        method: "POST",
        body: {
          target_hook_url: String(input.target_url),
          name: clean(input.name || "CAMBRA commercial events", 120),
          event_type: "all_events",
          campaign: input.campaign_id || null,
          headers: {
            "x-cambra-instantly-secret": String(input.webhook_secret),
          },
        },
      },
      this.fetcher,
    );
  }
  updateWebhook(id: string, input: any) {
    return instantlyRequest(
      this.apiKey,
      `/webhooks/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: {
          target_hook_url: String(input.target_url),
          name: clean(input.name || "CAMBRA commercial events", 120),
          event_type: "all_events",
          campaign: input.campaign_id || null,
          headers: {
            "x-cambra-instantly-secret": String(input.webhook_secret),
          },
        },
      },
      this.fetcher,
    );
  }
  testWebhook(id: string) {
    return instantlyRequest(
      this.apiKey,
      `/webhooks/${encodeURIComponent(id)}/test`,
      { method: "POST" },
      this.fetcher,
    );
  }
  async queueInitial(input: any) {
    if (!input?.campaign_id) {
      throw new InstantlyApiError(
        0,
        "INSTANTLY_CAMPAIGN_REQUIRED",
        "Instantly campaign is not configured",
      );
    }
    const lead = await instantlyRequest(
      this.apiKey,
      "/leads",
      { method: "POST", body: instantlyLeadDefinition(input) },
      this.fetcher,
    );
    if (!String(lead?.id || "").trim()) {
      throw instantlyReceiptError(
        "Instantly lead response did not include a provider ID",
      );
    }
    return {
      queued: true,
      provider_lead_id: String(lead?.id || ""),
      campaign_id: String(input.campaign_id),
      raw: { lead_id: lead?.id || null, status: lead?.status ?? null },
    };
  }
  async sendReply(input: any) {
    if (!input?.reply_to_uuid) {
      throw new InstantlyApiError(
        0,
        "INSTANTLY_REPLY_REFERENCE_REQUIRED",
        "Instantly reply reference is missing",
      );
    }
    if (!input?.eaccount) {
      throw new InstantlyApiError(
        0,
        "INSTANTLY_SENDING_ACCOUNT_REQUIRED",
        "Instantly sending account is missing",
      );
    }
    const email = await instantlyRequest(
      this.apiKey,
      "/emails/reply",
      { method: "POST", body: instantlyReplyDefinition(input) },
      this.fetcher,
    );
    if (!String(email?.id || "").trim()) {
      throw instantlyReceiptError(
        "Instantly reply response did not include a provider ID",
      );
    }
    return {
      queued: false,
      provider_message_id: String(email?.id || ""),
      external_thread_id: String(email?.thread_id || ""),
      raw: { email_id: email?.id || null, thread_id: email?.thread_id || null },
    };
  }
}

export function normalizeInstantlyEvent(event: any) {
  const nested =
    event?.data && typeof event.data === "object" && !Array.isArray(event.data)
      ? event.data
      : {};
  const value = { ...nested, ...event };
  const aliases: Record<string, string> = {
    email_reply_received: "reply_received",
    reply: "reply_received",
    bounce: "email_bounced",
    unsubscribed: "lead_unsubscribed",
    unsubscribe: "lead_unsubscribed",
    out_of_office: "lead_out_of_office",
  };
  const rawType = clean(value?.event_type || value?.type, 100).toLowerCase();
  const type = aliases[rawType] || rawType;
  const providerTimestamp = clean(
    value?.timestamp || value?.timestamp_created,
    80,
  );
  return {
    provider: "instantly",
    event_type: type,
    // Never invent event time: it participates in ordering and deduplication.
    timestamp: providerTimestamp,
    workspace_id: clean(value?.workspace || value?.workspace_id, 100),
    campaign_id: clean(value?.campaign_id || value?.campaign, 100),
    campaign_name: clean(value?.campaign_name, 200),
    lead_email: clean(value?.lead_email || value?.email, 320).toLowerCase(),
    email_account: clean(
      value?.email_account || value?.eaccount,
      320,
    ).toLowerCase(),
    message_id: clean(value?.email_id || value?.message_id, 160),
    subject: clean(
      value?.reply_subject || value?.email_subject || value?.subject,
      300,
    ),
    text: String(
      value?.reply_text || value?.email_text || value?.reply_text_snippet || "",
    ).slice(0, 16000),
    html: String(value?.reply_html || value?.email_html || "").slice(0, 30000),
    unibox_url: clean(value?.unibox_url, 1000),
    is_first: value?.is_first === true,
    step: Number(value?.step) || null,
    variant: Number(value?.variant) || null,
  };
}

export async function instantlyEventKey(event: any) {
  const normalized = normalizeInstantlyEvent(event);
  if (!normalized.timestamp) {
    throw new Error("INSTANTLY_EVENT_TIMESTAMP_REQUIRED");
  }
  if (normalized.event_type === "reply_received" && !normalized.message_id) {
    throw new Error("INSTANTLY_EVENT_MESSAGE_ID_REQUIRED");
  }
  const value = [
    normalized.workspace_id,
    normalized.event_type,
    normalized.campaign_id,
    normalized.message_id,
    normalized.lead_email,
    normalized.timestamp,
  ].join("|");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `instantly:${
    [...new Uint8Array(digest)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  }`;
}
