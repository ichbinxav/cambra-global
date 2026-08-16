// ─────────────────────────────────────────────────────────────────────────────
// SYNC MASTER — no se importa en runtime por diseño. Borrarlo desarma __sync_check__.test.js.
// paymentsGap — pure ES6 engine for the payments savings calculation.
//
// SINGLE SOURCE OF TRUTH for how a merchant's payments gap is computed.
// This file has NO Base44 SDK imports and NO backend dependencies. It exports
// pure functions that operate on plain inputs and a plain rate-table array.
//
// The Deno backend functions (submitPaymentsAnalysis + computeStripeVerifiedGap)
// contain verbatim copies of the block between SYNC-START/SYNC-END markers.
// The `paymentsGap` pair in src/lib/syncEngine/__sync_check__.test.js enforces
// that the three copies stay in sync. When you edit logic here, edit the two
// Deno copies too — the test will fail loud if you don't.
//
// KEY STRUCTURAL DECISIONS
//   Chunk 1b: Rate rows store ATOMIC components (percent_bps + fixed_fee_minor_units).
//             The engine amortizes the fixed fee against the merchant's REAL
//             avg_ticket at runtime.
//   Enmienda 1 (Chunk 1.2.0): ZERO tariff constants in the engine. Every rate
//             — including the international (cross-border) uplift — lives on
//             the PaymentsRateTable row with its own source_url + source_quote
//             (or an intl_uplift_assumption_notes when derived). If a row does
//             not carry intl_uplift_bps, the engine treats it as 0 and emits
//             an assumption "intl uplift not modeled for this cohort". The
//             engine NEVER invents a rate at runtime.
//   M4-refinado (v1.5.0, 2026-07-12): IN-STORE achievable is chosen by
//             MIN-EFFECTIVE across the region's verified in-store anchors,
//             evaluated at the merchant's real ticket. NO interpolation —
//             the achievable is always ONE named, publicly contractable
//             provider (auditability rule). Adds `classification` to output
//             with three deterministic states (savings_opportunity /
//             already_optimized / insufficient_data). Retrocompat online is
//             byte-identical to 1.4.0.
// ─────────────────────────────────────────────────────────────────────────────

// SYNC-START: paymentsGap

// Engine version. Bumped when the SYNC block's arithmetic/logic changes.
// Persisted verbatim on every session by callers — the session reflects what
// the engine said, never a caller-side constant. Keep in one place inside the
// SYNC block so both the src copy and the Deno copy agree by construction.
//
// Version history:
//   payments-gap-1.0.0 (Chunk 2)  — atomic components + runtime amortization.
//   payments-gap-1.1.0 (bumped 2026-07-09, later reverted architecturally in
//                       1.2.0) — first attempt at intl uplift, incorrectly
//                       hardcoded as engine constants (+150/+90 bps). Violated
//                       Enmienda 1 and the numbers themselves were wrong for
//                       Stripe EU/UK (published cross-border is +175 bps, not
//                       +150; +150 is Stripe US). Superseded by 1.2.0.
//   payments-gap-1.2.0 — intl uplift lives on the RATE-TABLE ROW, not in code.
//                       Engine reads intl_uplift_bps and achievable_intl_uplift_bps
//                       from the selected row. Missing values are treated as 0
//                       with an explicit assumption ("intl uplift not modeled
//                       for this cohort") — the engine never fills in a number
//                       the seeder didn't provide.
//   payments-gap-1.3.0 — VERIFIED path. When the caller supplies a
//                       measured_current_bps (all-in effective rate computed
//                       from real PSP data, e.g. fees ÷ net volume over the
//                       last N charges), the engine takes it VERBATIM as
//                       current_effective_bps. NO composition on top — no fixed
//                       amortization, no intl uplift added. The measured rate
//                       is by canonical definition already all-in. The
//                       achievable side stays COMPOSED FROM THE TABLE
//                       (percent_bps + amortize(fixed, ticket) + measured_intl_pct
//                       × achievable_intl_uplift_bps) — because the table is
//                       still the only source of truth for "what could be
//                       negotiated". A verified-path assumption is emitted
//                       verbatim, naming the N charges over M days that
//                       produced measured_current_bps. When measured_current_bps
//                       is ABSENT (undefined / null / non-finite), behavior is
//                       BYTE-IDENTICAL to 1.2.0 — this is the anti-regression
//                       lock for the anonymous submitPaymentsAnalysis path,
//                       which will not start passing measured until Chunk 4.
//   payments-gap-1.4.0 (Fase 2A-redo, 2026-07-12) — IN-STORE CHANNEL. Adds
//                       `channel` dimension to cohort selection ("online" |
//                       "in_store"). Every rate-table row now carries a
//                       channel. selectRow cascade: exact online stays
//                       byte-identical for pre-1.4.0 callers (no `channel` in
//                       input → default 'online', 3-segment legacy keys still
//                       recognized as online). in_store adds terminal-rental
//                       amortization (fixed monthly rental spread over
//                       monthly_gmv), a distinct MEASURED note (invoices/months
//                       vs charges/days), and 4 new required fallback keys for
//                       the in-store side.
//   payments-gap-1.5.0 (M4-refinado, 2026-07-12) — MULTI-ANCHOR ACHIEVABLE +
//                       CLASSIFICATION. Two additions, both IN-STORE ONLY
//                       (online path byte-identical to 1.4.0):
//                       (a) selectMultiAnchorAchievable() enumerates every
//                           verified in-store anchor row in the merchant's
//                           REGION, computes each candidate's effective_bps at
//                           the merchant's ticket (with each candidate's own
//                           percent + fixed + rental), and returns the MINIMUM.
//                           The winner is by definition a real, publicly
//                           contractable provider (never an interpolated
//                           theoretical rate — auditability rule). Excludes the
//                           merchant's current provider from the pool ("never
//                           recommend moving to yourself"). Falls back to the
//                           row's own `achievable_*` fields when the pool is
//                           empty (regions without seeded verified in-store
//                           anchors — UK/US/RoW today).
//                       (b) classification: "savings_opportunity" |
//                           "already_optimized" | "insufficient_data". A
//                           deterministic three-state classifier that reads
//                           annual_savings.point against MAX(€200/year,
//                           15 bps × monthly_gmv × 12) — the LARGER of the
//                           two thresholds (below either would mean a savings
//                           amount so small the operational risk of migrating
//                           outweighs the benefit). already_optimized requires
//                           BOTH (verified benchmark row AND declared ticket).
//                           Any weakness — fallback row, missing ticket, empty
//                           anchor pool — routes to insufficient_data. Never
//                           silently converts "we don't know" into "you're
//                           optimized".
//                       Retrocompat oracle preserved: FR/EU/Stripe/GMV€83.3k/mo
//                       (i.e. €1M/yr) / ticket€50 / intl15% (channel=online)
//                       still produces exactly 226.25 / 149.5 / {lo:6140,
//                       point:7675, hi:9210} — byte-identical to 1.4.0.
//   M5 (2026-07-24) — COUNTRY-AWARE ROW RESOLUTION, deliberately NO version
//                       bump. selectRow (and the in-store anchor pool) now
//                       prefer a rate row whose declared `country` field
//                       matches the merchant's input country over the
//                       pan-regional row, and NEVER serve a row pinned to a
//                       DIFFERENT country. Resolution is FIELD-based —
//                       cohort_key is never parsed (the 'REGION-CC' key
//                       convention is a readable identifier only). With a
//                       table that carries no country rows (the entire table
//                       today), every result is byte-identical to 1.5.0 —
//                       that invariant is the sealed heart of the M5 chunk
//                       and the reason the tag stays 1.5.0 (also pinned by
//                       paymentsGap.test.js). Revisit the bump when SEED-ES
//                       lands the first country rows.
//   payments-gap-1.6.0 (SEED-ES-2, 2026-07-24) — VERSION BUMP, cero cambio de
//                       lógica. Primeras filas country=ES activas en la tabla
//                       (SEED-ES) + anchors ES en el pool multi-anchor: los
//                       resultados reales para merchants ES cambian respecto a
//                       1.5.0, y un motor cuyos resultados cambian merece traza
//                       de versión. La resolución country-aware es de M5; este
//                       bump la acompaña ahora que los datos la activan.
const ENGINE_VERSION = "payments-gap-1.6.0";

// Currency minor-unit divisor. All PaymentsRateTable rows store fixed fees
// in minor units (cents / pence). 100 minor units = 1 major (EUR / GBP / USD).
const MINOR_PER_MAJOR = 100;

// Basis-point divisor. 10000 bps = 100%. All rates in the table live in bps
// so integer arithmetic stays honest; conversion to percentage happens only
// at output boundaries.
const BPS_PER_UNIT = 10000;

// ─── M4-refinado (v1.5.0) — already_optimized thresholds ────────────────────
//
// A merchant is classified `already_optimized` when the annual savings gap is
// smaller than the LARGER of:
//
//   • €200/year absolute floor — below this the operational risk + migration
//     effort of switching providers materially exceeds the recoverable savings
//     (contract renegotiation, payment reconciliation retraining, treasury
//     re-plumbing all cost more than €200 in real terms). Sealed with Xavi
//     2026-07-12.
//
//   • 15 bps relative floor (applied to monthly GMV × 12 to convert to annual
//     EUR) — below this the estimate itself is within measurement noise of the
//     benchmark. A brand with €10M/yr GMV has an absolute threshold of €200 but
//     15bps × €10M = €15,000 — the RELATIVE floor dominates because at that
//     scale a €200 "victory" would be dishonest (it's noise).
//
// The LARGER of the two applies. Semantics: gap <= threshold → already_optimized.
// The <= (not <) is a product decision: at exactly the threshold the merchant
// is "at the floor of what we can honestly measure or recommend acting on" —
// classifying that as a victory is the honest read. Documented in the
// aggregator's docstring and the Decision_Log.
//
// NEVER move these numbers outside the SYNC block — the whole point of Enmienda
// 1 is that ALL business constants that affect merchant outcomes live in one
// place, versioned + testable. If a future re-tuning wants €150 or €300, the
// bump happens here + gets a new engine_version.
const ALREADY_OPTIMIZED_EUR_ANNUAL_THRESHOLD = 200;
const ALREADY_OPTIMIZED_BPS_THRESHOLD = 15;

// Regional fallback cohort keys the engine falls back to when the exact
// (provider|tier|region) cohort is not seeded. Split by channel so
// validateRateTable can be CHANNEL-AWARE: an online-only rate table (every
// row seeded before 1.4.0) must still validate fine when the caller asks
// for an online cohort — the in-store fallbacks are only required when
// somebody actually asks for an in-store lookup. This is the retrocompat
// lock we lost when 1.4.0 first shipped: the initial version demanded all
// 8 fallbacks unconditionally, which broke every pre-1.4.0 test fixture
// and every historical DB snapshot that predates the in-store seed.
//
// Design rule the split enforces:
//   • online request  + table with online fallbacks       → OK (retrocompat).
//   • online request  + table missing an online fallback  → rate_table_incomplete.
//   • in_store request + table missing an in_store fallback → rate_table_incomplete.
//   • in_store request + table with only online fallbacks → rate_table_incomplete
//     (SAFETY: never silently fall back to an online rate for a card-present
//      cohort — a physical-terminal merchant would see a made-up number).
//
// REQUIRED_FALLBACK_KEYS (the legacy export) intentionally keeps its
// pre-1.4.0 SHAPE — the 4 online keys — so external callers that captured
// the list (e.g. test fixtures) don't silently expand behind their back.
// The in-store list is a SEPARATE export.
const REQUIRED_FALLBACK_KEYS_ONLINE = [
  // 3-segment legacy shape kept verbatim. Every seeded row for these keys
  // carries channel='online', but validateRateTable checks by literal
  // cohort_key equality so the 3-segment key stays canonical for the online
  // path (byte-identical to pre-1.4.0). NEVER migrate these to the 4-segment
  // shape "ANY|ANY|<region>|online" — you'd break every historical session
  // that was persisted with these keys.
  "ANY|ANY|EU",
  "ANY|ANY|UK",
  "ANY|ANY|US",
  "ANY|ANY|RoW",
];
const REQUIRED_FALLBACK_KEYS_IN_STORE = [
  // 4-segment. Introduced in 1.4.0 with the channel dimension. Only required
  // by validateRateTable when the caller requests an in_store lookup.
  "ANY|ANY|EU|in_store",
  "ANY|ANY|UK|in_store",
  "ANY|ANY|US|in_store",
  "ANY|ANY|RoW|in_store",
];
// Legacy export — kept AS-IS at the pre-1.4.0 shape (4 online keys) so
// existing callers that snapshot this list don't silently pick up in-store
// keys they never asked for. In-store keys live under
// REQUIRED_FALLBACK_KEYS_IN_STORE. See design rule comment above.
const REQUIRED_FALLBACK_KEYS = REQUIRED_FALLBACK_KEYS_ONLINE;

// Card-mix defaults. When the input doesn't provide a card mix, we assume
// 100% domestic (0% intl). This is conservative — intl uplift only widens
// the effective rate, so assuming 0 keeps estimates from over-selling savings.
const DEFAULT_INTL_PCT = 0;

// Regions we understand. Anything else routes to RoW fallback.
const KNOWN_REGIONS = new Set(["EU", "UK", "US", "RoW"]);

// Provider slugs we treat as first-class (i.e. eligible for a verified row
// lookup). Everything else routes straight to the regional fallback. This
// list mirrors the seeded verified rows in PaymentsRateTable — keep in sync
// when a new provider is seeded.
const KNOWN_PROVIDERS = new Set([
  // Online (pre-M4)
  "stripe", "paypal", "shopify_payments",
  // Online FR PSPs (0.2b, seeded 2026-07-13). Each has a seeded row
  // <slug>|ANY|EU so the engine's exact-match lookup resolves them instead
  // of the regional fallback. payplug is verified=true; the rest are
  // verified=false DRAFT rows (wide band + "Estimate — connect your PSP").
  "payplug", "mollie", "stancer", "checkout_com", "adyen", "lyra",
  // In-store (M4-TPV Fase 2A-redo, 2026-07-12) — slugs that have a verified
  // in-store row seeded in PaymentsRateTable. 'sumup' is DUAL-CHANNEL: the
  // engine segments by (provider_slug, channel), so sumup+online resolves to
  // the regional fallback (no verified online sumup row exists) and
  // sumup+in_store hits the verified in-store row. No cross-channel leakage.
  // 'sumup' now ALSO has a seeded online DRAFT row (sumup|ANY|EU) → online
  // resolves exact too. 'yavin' added (0.2b) — seeded in-store DRAFT row.
  "sumup", "stripe_terminal", "smile_and_pay", "zettle", "yavin",
  // SEED-ES (2026-07-24) — Spanish providers with country=ES rows in
  // PaymentsRateTable (all DRAFT verified=false). 'square' is dual-channel
  // in ES (online + in-store rows). With no country match and no pan-regional
  // row, these slugs fall to the regional fallback for non-ES merchants —
  // same as before this seed. 'bank_tpv_es' is the Spanish bank-TPV (Redsys)
  // point row the UI collapses CaixaBank/Santander/BBVA/Sabadell into.
  "monei", "paycomet", "square", "mypos", "bank_tpv_es",
  // SEED-FR-2 / BANK-BREAKDOWN-ES (2026-08-02) — per-bank Spanish TPV slugs.
  // Sabadell/CaixaBank/Santander now have their OWN country=ES rows (the UI
  // tiles stopped collapsing them into the single bank_tpv_es number). BBVA
  // deliberately has NO slug of its own — no public base rate exists — and
  // its tile keeps submitting the generic 'bank_tpv_es'. 'bank_tpv_fr' is
  // the French bank-TPV row (AXEPTA BNP "a partir de" floor, verified=false)
  // reachable from the FR in-store catalog.
  "bank_tpv_es_sabadell", "bank_tpv_es_caixabank", "bank_tpv_es_santander",
  "bank_tpv_fr",
]);

// M4-TPV Fase 2A-redo — channels the engine understands. Default 'online'
// preserves pre-M4 behavior byte-identically: normalizeInput assigns 'online'
// when input.channel is missing/unknown, and selectRow's cascade recognizes
// legacy 3-segment cohort_keys ("<provider>|ANY|<region>") as online rows.
const KNOWN_CHANNELS = new Set(["online", "in_store"]);

// M4-TPV Fase 2A-redo — default channel when input omits it. Kept as a named
// const rather than an inline literal so a future migration to a different
// default (unlikely, but auditable) touches one place, not scattered branches.
const DEFAULT_CHANNEL = "online";

// ─── Input normalization ─────────────────────────────────────────────────────

// Normalize a caller-provided input into the shape the engine expects.
// Rejects malformed inputs by returning { ok: false, reason }. On success
// returns { ok: true, input: <normalized> } where every downstream-consumed
// field has a defensible value.
function normalizeInput(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "input_missing" };
  }
  const monthly_gmv_eur = Number(raw.monthly_gmv_eur);
  if (!isFinite(monthly_gmv_eur) || monthly_gmv_eur <= 0) {
    return { ok: false, reason: "monthly_gmv_eur_invalid" };
  }
  const avg_ticket_eur = Number(raw.avg_ticket_eur);
  if (!isFinite(avg_ticket_eur) || avg_ticket_eur <= 0) {
    return { ok: false, reason: "avg_ticket_eur_invalid" };
  }
  const region = KNOWN_REGIONS.has(raw.region) ? raw.region : "RoW";
  const providerRaw = typeof raw.provider_slug === "string" ? raw.provider_slug.trim().toLowerCase() : "";
  const provider_slug = providerRaw.length > 0 ? providerRaw : "unknown";
  // M4-TPV Fase 2A-redo — channel normalization. Missing/unknown → DEFAULT_CHANNEL
  // ('online'). This is the retrocompat lock: pre-1.4.0 callers that don't send
  // `channel` land on the exact same 'online' branch as before.
  const channelRaw = typeof raw.channel === "string" ? raw.channel.trim().toLowerCase() : "";
  const channel = KNOWN_CHANNELS.has(channelRaw) ? channelRaw : DEFAULT_CHANNEL;
  // M5 (2026-07-24) — optional country (ISO-3166-1 alpha-2, uppercase). Used
  // ONLY as a row-selection preference in selectRow / the in-store anchor
  // pool: a row that declares the same country wins over the pan-regional
  // row; a row that declares a DIFFERENT country is never selected. Missing
  // or malformed → null → selection is byte-identical to pre-M5.
  const countryRaw = typeof raw.country === "string" ? raw.country.trim().toUpperCase() : "";
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : null;
  const intl_pctRaw = Number(raw.intl_pct);
  const intl_pct = isFinite(intl_pctRaw) && intl_pctRaw >= 0 && intl_pctRaw <= 100
    ? intl_pctRaw
    : DEFAULT_INTL_PCT;
  // v1.3.0 — verified path. Optional measured fields describing the merchant's
  // real all-in rate over a real time window. When present, the engine uses
  // measured_current_bps as current_effective_bps VERBATIM (no composition on
  // top) and measured_intl_pct in place of the form intl_pct for the
  // achievable side. Absent → 1.2.0 estimated behavior byte-identical.
  const measured_current_bpsRaw = raw.measured_current_bps;
  const measured_current_bps = (measured_current_bpsRaw !== undefined && measured_current_bpsRaw !== null && isFinite(Number(measured_current_bpsRaw)))
    ? Number(measured_current_bpsRaw)
    : null;
  const measured_intl_pctRaw = raw.measured_intl_pct;
  const measured_intl_pct = (measured_intl_pctRaw !== undefined && measured_intl_pctRaw !== null && isFinite(Number(measured_intl_pctRaw)) && Number(measured_intl_pctRaw) >= 0 && Number(measured_intl_pctRaw) <= 100)
    ? Number(measured_intl_pctRaw)
    : null;
  const measured_sample = (raw.measured_sample && typeof raw.measured_sample === "object")
    ? raw.measured_sample
    : null;
  return {
    ok: true,
    input: {
      monthly_gmv_eur,
      avg_ticket_eur,
      region,
      provider_slug,
      channel,
      country,
      intl_pct,
      measured_current_bps,
      measured_intl_pct,
      measured_sample,
    },
  };
}

// ─── Rate table cache validation ─────────────────────────────────────────────

// Validate a candidate rate-table snapshot before it becomes the warm cache.
// Returns { ok: true } if the required fallback keys FOR THE REQUESTED
// CHANNELS are present and active; otherwise { ok: false, reason, missing }.
// The engine NEVER calculates against a partial table — it either has all
// the required fallbacks for the channels the caller cares about, or it
// refuses to answer with rate_table_incomplete.
//
// `opts.channels` (array of "online" | "in_store") lists the channels the
// caller intends to look up. When omitted, we default to ["online"] — that
// is the retrocompat lock: every pre-1.4.0 caller passed no options and
// only asked online questions. Their rate table only had online fallbacks,
// and the engine validated fine. This code path stays byte-identical to
// pre-1.4.0 for them.
//
// The internal calculateGap entry point calls this AFTER normalizing the
// input, so a single-channel calculateGap call only requires ITS channel's
// fallbacks — an in-store request against a table that carries only online
// fallbacks correctly fails rate_table_incomplete rather than silently
// borrowing an online rate.
function validateRateTable(rows, opts) {
  const channelsRaw = (opts && Array.isArray(opts.channels))
    ? opts.channels
    : ["online"];
  // Dedup + gate to known channels so a caller can't smuggle in a bogus
  // channel name and get an unexpected required-keys list.
  const channels = Array.from(new Set(channelsRaw.filter((c) => KNOWN_CHANNELS.has(c))));
  if (channels.length === 0) channels.push("online");
  const required = [];
  if (channels.includes("online")) required.push(...REQUIRED_FALLBACK_KEYS_ONLINE);
  if (channels.includes("in_store")) required.push(...REQUIRED_FALLBACK_KEYS_IN_STORE);
  if (!Array.isArray(rows)) {
    return { ok: false, reason: "rate_table_not_array", missing: required };
  }
  const activeByKey = new Map();
  for (const r of rows) {
    if (!r || r.active === false) continue;
    if (typeof r.cohort_key === "string") activeByKey.set(r.cohort_key, r);
  }
  const missing = required.filter((k) => !activeByKey.has(k));
  if (missing.length > 0) {
    return { ok: false, reason: "rate_table_incomplete", missing };
  }
  return { ok: true };
}

// ─── Row selection with cascade fallback ─────────────────────────────────────

// Look up the best rate-table row for (provider_slug, region, channel).
//
// M4-TPV Fase 2A-redo — channel-aware cascade. Two shapes coexist:
//
//   ONLINE (channel='online', or channel omitted → DEFAULT_CHANNEL):
//     1. exact:    "<provider>|ANY|<region>"                (3-segment, LEGACY)
//     2. exact_v4: "<provider>|ANY|<region>|online"         (4-segment, NEW)
//     3. fallback: "ANY|ANY|<region>"                       (3-segment, LEGACY)
//     4. fallback_v4: "ANY|ANY|<region>|online"             (4-segment, NEW)
//
//   IN-STORE (channel='in_store'):
//     1. exact:    "<provider>|ANY|<region>|in_store"       (4-segment)
//     2. fallback: "ANY|ANY|<region>|in_store"              (4-segment)
//
// Retrocompat lock: online lookups still match the LEGACY 3-segment keys
// FIRST. Every existing online row keeps working byte-identically without
// any migration of cohort_key. If someone later seeds a 4-segment online
// row for the same provider/region, THAT is a data-drift bug (would cause
// non-determinism), not something the engine needs to reconcile — the
// seeder is the single source of truth for cohort_key uniqueness.
//
// Never returns null when the table passed validateRateTable — the regional
// fallback for the requested channel is guaranteed to exist (validateRateTable
// enforces all 8 REQUIRED_FALLBACK_KEYS in 1.4.0).
function selectRow(rows, provider_slug, region, channel, country) {
  const ch = KNOWN_CHANNELS.has(channel) ? channel : DEFAULT_CHANNEL;
  const isOnline = ch === "online";
  // M5 — country preference. Sanitized to null unless a clean ISO-2 uppercase
  // code; null → selection is byte-identical to pre-M5 (pan-regional only).
  const wantCountry = (typeof country === "string" && /^[A-Z]{2}$/.test(country)) ? country : null;

  // Build the ordered list of candidate keys (highest-priority first).
  const candidates = [];
  if (isOnline) {
    // Prefer LEGACY 3-segment keys so pre-1.4.0 seeded rows match verbatim
    // (retrocompat lock — never reorder these first two).
    if (KNOWN_PROVIDERS.has(provider_slug)) {
      candidates.push({ key: `${provider_slug}|ANY|${region}`,          matched: "exact" });
      candidates.push({ key: `${provider_slug}|ANY|${region}|online`,   matched: "exact" });
    }
    candidates.push({ key: `ANY|ANY|${region}`,                          matched: "fallback" });
    candidates.push({ key: `ANY|ANY|${region}|online`,                   matched: "fallback" });
  } else {
    // in_store: only 4-segment keys. No legacy path — the channel didn't
    // exist before 1.4.0, so there's nothing to be retrocompatible with.
    if (KNOWN_PROVIDERS.has(provider_slug)) {
      candidates.push({ key: `${provider_slug}|ANY|${region}|in_store`, matched: "exact" });
    }
    candidates.push({ key: `ANY|ANY|${region}|in_store`,                 matched: "fallback" });
  }

  // Index the table once, then walk candidates in priority order.
  // M5 — while indexing, ALSO look for a COUNTRY-SPECIFIC exact row by
  // FIELDS (cohort_key is NEVER parsed): same provider, tier ANY, same
  // region, same channel, active, row.country === input country. When one
  // exists it beats every key-based candidate. Rows without a country are
  // the pan-regional rows and behave exactly as pre-M5. The regional
  // fallback chain (ANY|ANY|<region>[|in_store]) stays country-agnostic —
  // fallback rows must never be pinned to a country.
  const byKey = new Map();
  let countryRow = null;
  for (const r of rows) {
    if (!r || r.active === false) continue;
    if (typeof r.cohort_key === "string") byKey.set(r.cohort_key, r);
    if (
      wantCountry !== null &&
      countryRow === null &&
      KNOWN_PROVIDERS.has(provider_slug) &&
      typeof r.country === "string" && r.country === wantCountry &&
      r.provider_slug === provider_slug &&
      r.region === region &&
      (typeof r.tier !== "string" || r.tier === "ANY") &&
      ((typeof r.channel === "string" && KNOWN_CHANNELS.has(r.channel)) ? r.channel : DEFAULT_CHANNEL) === ch
    ) {
      countryRow = r;
    }
  }
  if (countryRow) return { row: countryRow, matched: "exact" };
  for (const cand of candidates) {
    const row = byKey.get(cand.key);
    if (row) {
      // M5 guard — a row pinned to a DIFFERENT country must never be served
      // (an ES row must not answer for an FR merchant). Country-less rows
      // (every pre-M5 row) pass untouched — byte-identical behavior.
      if (typeof row.country === "string" && row.country.length > 0 && row.country !== wantCountry) continue;
      return { row, matched: cand.matched };
    }
  }
  // Should be impossible after validateRateTable; guard anyway.
  return { row: null, matched: "none" };
}

// ─── Effective-rate calculation ──────────────────────────────────────────────

// Given atomic components + the merchant's real avg_ticket, compute the
// effective rate in bps. This is the CORE of the runtime amortization
// correction: fixed fee is amortized against the actual ticket, not baked in.
//
//   effective_bps = (percent_bps + intl_uplift) + (fixed_fee_major / avg_ticket_eur) * 10000
//
// where fixed_fee_major = fixed_fee_minor_units / 100 and
//   intl_uplift = (intl_pct / 100) * uplift_bps
//
// The caller passes uplift_bps read directly from the selected row (either
// intl_uplift_bps for the current side or achievable_intl_uplift_bps for the
// achievable side). Missing → 0. When both sides are 0 the function reduces
// to the pre-1.1.0 behavior. The engine does NOT own a default uplift
// constant — every value must come from the row (Enmienda 1).
//
// Currency alignment (FX-2, 2026-08-16). The caller is responsible for it,
// and as of FX-2 it actually happens: merchant-entered amounts are converted
// to EUR at the submitPaymentsAnalysis boundary with an evidence-backed ECB
// rate (fail-closed), so avg_ticket_eur/monthly_gmv_eur here are genuinely
// EUR. We do NOT do FX here — inside the engine — for ONE remaining input:
// the rate-table fixed fee, which PaymentsRateTable stores in the provider's
// native currency. Seeded rows only carry EUR/GBP/USD fees (locked by
// paymentsRateCurrency.test.js), and we treat those as ~1:1.
// Exact bound of that approximation: seeded fixed fees are ≤ 0.50 major
// units and EUR/GBP/USD cross rates have stayed within ±25%; at the minimum
// allowed ticket (€5) a 0.50 fee amortizes to 1000 bps, so the worst-case
// currency error is ≤250 bps — but at the P50 ticket (€40+) it is ≤31 bps,
// inside the ±35% honesty band the product already displays. Local-currency
// rate rows (Fase D) remove even this residue; until then the currency lock
// keeps any non-EUR/GBP/USD fee out of the table.
function computeEffectiveBps(
  { percent_bps, fixed_fee_minor_units, terminal_rental_monthly_minor },
  avg_ticket_eur,
  { intl_pct = 0, intl_uplift_bps = 0, monthly_gmv_eur = 0 } = {}
) {
  const fixedMajor = fixed_fee_minor_units / MINOR_PER_MAJOR;
  const amortizedBps = (fixedMajor / avg_ticket_eur) * BPS_PER_UNIT;
  const upliftBps = isFinite(intl_uplift_bps) ? intl_uplift_bps : 0;
  const intlBps = (intl_pct / 100) * upliftBps;
  // M4-TPV Fase 2A-redo — terminal-rental amortization for in-store rows.
  // Traditional bank acquirers charge a fixed monthly rental (€15-40) that
  // sits on top of the per-transaction fees. Modern TPVs (SumUp, Zettle,
  // Stripe Terminal, Smile&Pay) sell hardware one-off with no rental → 0.
  // We amortize monthly rental over monthly GMV to express it in bps:
  //   rental_bps = (rental_major / monthly_gmv_eur) × 10000
  //
  // Retrocompat lock: online rows do NOT carry terminal_rental_monthly_minor,
  // so the field is undefined and rentalBps stays 0 → byte-identical to
  // pre-1.4.0 for every online caller. Even if a future online row
  // accidentally seeds a non-null rental, monthly_gmv_eur=0 (the default
  // when the caller omits it, which happens on every online path today)
  // ALSO produces rentalBps=0 (division-by-zero guarded below). Belt AND
  // suspenders — the retrocompat oracle depends on this line.
  const rentalMinor = isFinite(Number(terminal_rental_monthly_minor)) ? Number(terminal_rental_monthly_minor) : 0;
  const rentalMajor = rentalMinor / MINOR_PER_MAJOR;
  const rentalBps = (rentalMajor > 0 && monthly_gmv_eur > 0)
    ? (rentalMajor / monthly_gmv_eur) * BPS_PER_UNIT
    : 0;
  return percent_bps + intlBps + amortizedBps + rentalBps;
}

// ─── M4-refinado (v1.5.0) — multi-anchor achievable selection (IN-STORE) ────
//
// For in-store cohorts, achievable is chosen by MIN-EFFECTIVE across every
// verified in-store anchor row in the merchant's region — evaluated at the
// merchant's REAL ticket with each candidate's OWN percent+fixed+rental.
// The winner is by definition a REAL, publicly contractable provider — no
// interpolation between anchors, no theoretical composition. This is the
// auditability rule: the merchant must be able to sign the achievable rate
// tomorrow with a named provider.
//
// Pool composition:
//   • rows where verified === true
//   • row.channel === "in_store"
//   • row.region === merchant's region
//   • achievable_breakdown_json.anchor_provider is set (marks the row as a
//     provider anchor, not just a generic in-store row)
//   • provider_slug !== merchant's current provider (never "move to yourself")
//
// Empty pool → returns null. Caller falls back to row.achievable_* (regional
// fallback rows already carry a documented anchor via achievable_breakdown_json;
// UK/US/RoW where no verified in-store providers are seeded yet use the
// per-region fallback documented in seedPaymentsRateTable).
//
// Zettle exclusion: Zettle EU is seeded with verified=false pending FR source
// re-verification (see KNOWN_DEBT). The verified filter excludes it
// automatically — no explicit blacklist needed.
//
// Confidence: "high" when ≥2 candidates in the pool (real competitive
// evaluation happened); "reduced" when only 1 candidate (single-option pool —
// still auditable but no comparison).
function selectMultiAnchorAchievable(rows, region, ticket, monthlyGmv, currentProviderSlug, country) {
  if (!Array.isArray(rows)) return null;
  if (!isFinite(ticket) || ticket <= 0) return null;
  // M5 — same sanitization as selectRow. null → country-less pool (pre-M5).
  const wantCountry = (typeof country === "string" && /^[A-Z]{2}$/.test(country)) ? country : null;
  const candidates = [];
  for (const r of rows) {
    if (!r || r.active === false) continue;
    if (r.verified !== true) continue;
    if (r.channel !== "in_store") continue;
    if (r.region !== region) continue;
    // M5 — country guard on the anchor pool: an anchor pinned to a specific
    // country is only eligible when it matches the merchant's country.
    // Country-less anchors (every pre-M5 row) are always eligible.
    if (typeof r.country === "string" && r.country.length > 0 && r.country !== wantCountry) continue;
    // Must be a provider anchor row (i.e. carries an anchor_provider in its
    // achievable_breakdown_json). Generic in-store rows without an anchor
    // shape are not eligible.
    const bd = r.achievable_breakdown_json;
    if (!bd || typeof bd.anchor_provider !== "string") continue;
    // Exclude the merchant's current provider — never recommend "move to
    // yourself". This matches Guardas Duras 1.4: if the winner ends up
    // being the same provider, the gap should reflect only what's negotiable
    // within that provider (which today is zero, so clamp to 0 naturally
    // happens downstream via computeMonthlySavings).
    if (typeof currentProviderSlug === "string" &&
        r.provider_slug === currentProviderSlug) continue;
    // Compute this candidate's effective rate at the merchant's ticket.
    // Uses the candidate's OWN atomic components — never blended.
    const eff = computeEffectiveBps(
      {
        percent_bps: r.percent_bps,
        fixed_fee_minor_units: r.fixed_fee_minor_units,
        terminal_rental_monthly_minor: r.terminal_rental_monthly_minor,
      },
      ticket,
      { monthly_gmv_eur: monthlyGmv }
    );
    if (!isFinite(eff) || eff < 0) continue;  // Guarda dura: cero tasas negativas.
    candidates.push({
      provider: r.provider_slug,
      effective_bps: eff,
      // Preserve the anchor components so the caller can build a proper
      // ACHIEVABLE_NOTE + populate benchmark_resolution without a second pass.
      percent_bps: r.percent_bps,
      fixed_fee_minor_units: r.fixed_fee_minor_units,
      fixed_fee_currency: r.fixed_fee_currency,
      // Terminal rental on achievable side always 0 by seed policy — we
      // capture the CURRENT side of the winner's row here (usually 0 for
      // modern TPVs). Not fed back into the note; kept for future audit.
      terminal_rental_monthly_minor: r.terminal_rental_monthly_minor,
    });
  }
  if (candidates.length === 0) return null;
  // Winner: minimum effective_bps. On ties, first-inserted wins (stable —
  // deterministic across runs given the same table).
  candidates.sort((a, b) => a.effective_bps - b.effective_bps);
  const winner = candidates[0];
  return {
    method: "multi_anchor_min_effective",
    avg_ticket_eur: ticket,
    ticket_source: "declared",
    candidates: candidates.map(c => ({ provider: c.provider, effective_bps: c.effective_bps })),
    winner: winner.provider,
    winner_effective_bps: winner.effective_bps,
    winner_percent_bps: winner.percent_bps,
    winner_fixed_fee_minor_units: winner.fixed_fee_minor_units,
    winner_fixed_fee_currency: winner.fixed_fee_currency,
    confidence: candidates.length >= 2 ? "high" : "reduced",
  };
}

// ─── Savings computation ─────────────────────────────────────────────────────

// Compute the monthly EUR savings implied by (current_bps - achievable_bps)
// applied to the merchant's GMV. Clamped at zero: if the merchant already
// beats the achievable rate, savings are 0 (never negative).
function computeMonthlySavings({ current_bps, achievable_bps, monthly_gmv_eur }) {
  const gapBps = current_bps - achievable_bps;
  if (gapBps <= 0) return 0;
  return (gapBps / BPS_PER_UNIT) * monthly_gmv_eur;
}

// Apply the row's savings band to a point estimate to yield lo/hi.
//
// TWO INDEPENDENT ± IN THIS ENGINE — do not conflate them.
//
//   1. `savings_band_pct` (this function's input) — RELATIVE band on the
//      point ahorro, editorial per cohort. Reflects overall confidence in
//      the achievable BENCHMARK for that (provider|region) — table drift,
//      mix of card types, tickets, cross-border modeling gaps, all rolled
//      into one number. Verified rows carry 0.20 (±20% relative). Fallback
//      rows carry 0.35 (±35%). This is the band the UI shows around the
//      point savings.
//
//   2. `processor_margin_band_bps` (lives inside `achievable_breakdown_json`,
//      formatted by ACHIEVABLE_NOTE) — ABSOLUTE band on the processor-margin
//      COMPONENT of the achievable rate composition, in bps. Reflects how
//      much a well-negotiated processor margin varies for that cohort.
//      Only meaningful ABOUT the achievable breakdown; NEVER used to scale
//      savings.
//
// The two bands measure different quantities and are not designed to
// reconcile. The engine emits both, the UI shows both, and the copy in
// ACHIEVABLE_NOTE plus the contextual line rendered under the assumptions
// list in AssumptionsFootnote.jsx makes the distinction explicit for the
// merchant. Any future attempt to derive one from the other should first
// revisit Decision_Log 2026-07-10 M3.6 — the trade-offs were argued once
// and this is the sealed outcome.
function applyBand(point, band_pct) {
  const half = point * band_pct;
  return {
    lo: Math.max(0, point - half),
    point,
    hi: point + half,
  };
}

// ─── M4-refinado (v1.5.0) — classification ──────────────────────────────────
//
// Deterministic three-state classifier reading the engine's own outputs +
// input completeness signals. Sealed with Xavi 2026-07-12.
//
//   savings_opportunity
//     Gap is materially above the noise floor. The merchant has money to
//     recover. This is the default state — every historical estimated
//     result before v1.5.0 was effectively this state. Applies to BOTH
//     verified-row results (Stripe/Shopify Payments/SumUp/Stripe Terminal/
//     Smile&Pay in EU) AND fallback-row results (bank TPVs, `other`
//     providers, RoW regions without seeded anchors) — because the funnel
//     mission of the ESTIMATED tier is to surface material gaps for the
//     merchants who most need to hear about them. Fallback rows already
//     ship the FALLBACK_ASSUMPTION verbatim, so the merchant sees the
//     "regional average, not provider-verified" caveat next to the number.
//
//   already_optimized
//     Gap is at or below MAX(€200/year, 15 bps × monthly_gmv × 12) AND the
//     benchmark comes from a VERIFIED row AND the ticket is declared. All
//     three conditions must be true — a low gap on a fallback row is NOT
//     "you're optimized", it's "we don't have a defensible benchmark to
//     claim victory over". Verified guardrail on this state only.
//
//   insufficient_data
//     Two disjoint sub-cases:
//       (a) The inputs themselves are incomplete (missing ticket → the
//           arithmetic doesn't run) — no result to interpret.
//       (b) The result is a ZERO on top of a fallback benchmark. On a
//           verified row a zero is a legitimate "already optimized" claim;
//           on a fallback row a zero is un-defensible — we can't tell the
//           merchant "you're at the floor" when we don't know where the
//           floor is. Same rationale as sub-case (a): we have no defensible
//           statement to make.
//       (c) In-store where multi-anchor selection was attempted but the
//           regional anchor pool is empty (UK/US/RoW today, until we seed
//           verified in-store anchors there). Falls to legacy row.achievable_*
//           which is a documented approximation — a ZERO on top of it is
//           equally un-defensible.
//     NEVER convert "we don't know" into "you're optimized" — the whole
//     product's credibility depends on that line.
//
// KEY DISTINCTION from an earlier draft (2026-07-12, corrected same day):
// verified=false does NOT unconditionally route to insufficient_data. It
// only blocks the already_optimized victory state AND downgrades zeros to
// insufficient_data. A MATERIAL gap on a fallback row is still
// savings_opportunity — this is the funnel-preserving fix. The regression
// case that motivated the correction: bank TPV in EU (fallback row) with
// €40k GMV, €60 ticket, €25/mo rental → ~€3,340/year gap. Pre-fix that
// merchant would have seen "insufficient_data" — actively wrong. Post-fix
// they see the gap with the fallback caveat, which is the honest read.
//
// Precedence when multiple conditions apply: insufficient_data (a) FIRST
// (ticket missing means the number itself is meaningless), then
// insufficient_data (c) (pool-empty in-store), then the already_optimized /
// insufficient_data (b) / savings_opportunity trio below.
function classifyResult({
  annual_point_savings_eur,
  monthly_gmv_eur,
  row_verified,
  ticket_present,
  multi_anchor_ran,
  multi_anchor_empty,
  channel,
}) {
  // (a) Ticket missing — the entire arithmetic depends on it. Should not
  // happen with the current validator (validateInput enforces ticket range)
  // but defensive.
  if (!ticket_present) return "insufficient_data";
  // (c) In-store with multi-anchor attempted but pool empty. Falls to legacy
  // row.achievable_* — even a non-zero gap here is on shaky ground because
  // there's no verified anchor pool to compare against.
  if (channel === "in_store" && multi_anchor_ran && multi_anchor_empty) {
    return "insufficient_data";
  }

  // already_optimized threshold: MAX of absolute + relative.
  //
  // Relative floor: 15 bps applied to monthly GMV, annualized (×12) — the
  // relative floor is expressed as "if the savings on a full year of your
  // volume are less than what 15 bps of noise on your ticket-mix would
  // account for, we can't tell you it's real".
  //
  // Absolute floor: €200/year — below this the operational risk +
  // migration effort of switching providers materially exceeds the
  // recoverable savings.
  //
  // We take the LARGER of the two. At €10M/yr GMV the relative floor
  // (€15,000) dominates. At €50k/yr GMV the absolute floor (€200)
  // dominates. Sealed with Xavi 2026-07-12.
  const relativeThresholdEur =
    (ALREADY_OPTIMIZED_BPS_THRESHOLD / BPS_PER_UNIT) * monthly_gmv_eur * 12;
  const threshold = Math.max(
    ALREADY_OPTIMIZED_EUR_ANNUAL_THRESHOLD,
    relativeThresholdEur,
  );
  const belowThreshold = annual_point_savings_eur <= threshold;

  if (belowThreshold) {
    // At-or-below the noise threshold. Two branches:
    //   • verified row → we can confidently say "you're already optimized".
    //   • fallback row → we can NOT — the floor we'd be claiming victory
    //     over is itself an average, so a zero on top of it is not a
    //     victory, it's a "we don't know" (sub-case (b) above).
    return row_verified ? "already_optimized" : "insufficient_data";
  }
  // Material gap. This is the funnel-preserving branch: applies to BOTH
  // verified AND fallback rows. Fallback rows already emit FALLBACK_ASSUMPTION
  // in the same result, so the merchant sees the caveat next to the number.
  return "savings_opportunity";
}

// ─── Assumption strings ──────────────────────────────────────────────────────

// The assumption strings are part of the engine's OUTPUT contract — the UI
// renders them verbatim in the results screen. Keep the wording auditable:
// no marketing claims, no numbers that aren't derived from the input or the
// verified row.
const FALLBACK_ASSUMPTION =
  "Estimate based on regional averages, not provider-verified rates. Connect your PSP for exact figures.";

// Emitted when the selected row lacks a modeled intl uplift and the merchant
// has intl_pct > 0 — makes it explicit that cross-border volume is present
// but the cohort has no source-quoted uplift, so the engine leaves it out
// rather than inventing a rate.
const INTL_UPLIFT_NOT_MODELED_ASSUMPTION =
  "Cross-border card uplift not modeled for this provider/region cohort — the published cross-border rate for this PSP is not seeded. Effective savings for the intl portion of GMV may be understated. Connect your PSP for exact figures.";

const AMORTIZATION_NOTE = (fixedMinor, currency, avgTicket) =>
  `Fixed fee of ${(fixedMinor / MINOR_PER_MAJOR).toFixed(2)} ${currency} amortized over an average ticket of €${avgTicket.toFixed(2)}.`;

// M4-TPV Fase 2A-redo — in-store only. Emitted when a rate row carries a
// non-zero terminal_rental_monthly_minor AND the merchant has monthly GMV
// present. The rental (fixed €/month) is spread across GMV, so the note
// makes the merchant's own volume visible in the rate — otherwise a low-GMV
// in-store merchant sees a surprisingly high effective rate with no
// explanation.
const TERMINAL_RENTAL_NOTE = (rentalMinor, currency, monthlyGmv) =>
  `Monthly terminal rental of ${(rentalMinor / MINOR_PER_MAJOR).toFixed(2)} ${currency} amortized over €${monthlyGmv.toFixed(2)} of monthly card volume.`;

const ACHIEVABLE_NOTE = (breakdown) => {
  if (!breakdown) return null;
  // Three breakdown shapes coexist:
  //
  //   1. ONLINE shape (pre-M4, unchanged):
  //      { interchange_bps, scheme_fees_bps, processor_margin_bps,
  //        processor_margin_band_bps, sources: [...] }
  //      Emits the composition string parseable by FeeBreakdownCard's
  //      parseAchievableBreakdown() regex. The trailing "(±N bps assumption)"
  //      pattern MUST be preserved — it is parsed. Free-text clarifying
  //      sentence follows (not parsed).
  //
  //   2. IN-STORE anchor shape (M4-TPV Fase 2A-redo, single anchor from row):
  //      { anchor_provider, anchor_region, anchor_percent_bps,
  //        anchor_fixed_fee_minor_units, anchor_source_url, anchor_source_quote }
  //      Emits an "Achievable anchored to..." string naming the row's own
  //      declared anchor.
  //
  //   3. MULTI-ANCHOR WINNER shape (M4-refinado v1.5.0, IN-STORE ONLY):
  //      { anchor_provider, anchor_percent_bps, anchor_fixed_fee_minor_units,
  //        selection_method: "multi_anchor_min_effective" }
  //      Emitted by calculateGap when selectMultiAnchorAchievable returned
  //      a winner. Same visual shape as (2) but the note includes "the best
  //      publicly contractable card-present rate at your ticket size" wording
  //      — makes explicit that the anchor was CHOSEN, not fixed.
  //
  // Shape detection: online carries interchange_bps; in-store carries
  // anchor_provider. Neither field ever coexists (enforced by seeder + the
  // multi-anchor builder below). Unknown shape → return null (defensive).
  if (typeof breakdown.interchange_bps === "number") {
    // Online shape — byte-identical to pre-M4.
    const { interchange_bps, scheme_fees_bps, processor_margin_bps, processor_margin_band_bps } = breakdown;
    return (
      `Achievable rate composition: interchange ${interchange_bps} bps + scheme fees ${scheme_fees_bps} bps + ` +
      `assumed processor margin ${processor_margin_bps} bps (±${processor_margin_band_bps} bps assumption). ` +
      `The ± applies to that component of the achievable rate only — separate from the savings range, which reflects overall confidence in the benchmark for this cohort.`
    );
  }
  if (typeof breakdown.anchor_provider === "string" && typeof breakdown.anchor_percent_bps === "number") {
    // In-store anchor shape (single or multi-anchor winner). Same rendering
    // for both, with a "best publicly contractable at your ticket size"
    // trailer when multi-anchor selection was used.
    const pct = (breakdown.anchor_percent_bps / 100).toFixed(2);
    const fixedMinor = typeof breakdown.anchor_fixed_fee_minor_units === "number" ? breakdown.anchor_fixed_fee_minor_units : 0;
    const fixedStr = fixedMinor > 0 ? ` + ${(fixedMinor / MINOR_PER_MAJOR).toFixed(2)} per transaction` : "";
    const provider = breakdown.anchor_provider.replace(/_/g, " ");
    const isMultiAnchor = breakdown.selection_method === "multi_anchor_min_effective";
    if (isMultiAnchor) {
      return (
        `Achievable anchored to ${provider} at ${pct}%${fixedStr}, the best publicly contractable card-present rate at your ticket size. ` +
        `This is a rate you can sign today, not a theoretical floor — the savings range around this anchor reflects overall confidence in the benchmark for this cohort.`
      );
    }
    return (
      `Achievable rate anchored to the best publicly contractable card-present provider for this region: ${provider} at ${pct}%${fixedStr}. ` +
      `This is a rate you can sign today, not a theoretical floor — the savings range around this anchor reflects overall confidence in the benchmark for this cohort.`
    );
  }
  return null;
};

// Emitted only when intl_pct > 0 AND the row carries a modeled uplift. Both
// numbers come from the row (never from code) — the engine only formats them.
const INTL_UPLIFT_NOTE = (intl_pct, current_uplift_bps, achievable_uplift_bps) =>
  `${intl_pct.toFixed(0)}% of GMV assumed cross-border: +${(current_uplift_bps / 100).toFixed(2)}% uplift on the current rate and +${(achievable_uplift_bps / 100).toFixed(2)}% on the achievable rate for that portion (schemes' cross-border interchange is not negotiable).`;

// v1.3.0 verified-path assumption. Emitted verbatim ONLY when the caller
// supplied measured_current_bps. The sample descriptor comes from the caller
// (measured_sample.charge_count / measured_sample.days_covered) — the engine
// only formats it, never invents counts. When the sample descriptor is absent,
// a shorter form is emitted so the assumption still ships alongside the number.
const MEASURED_CURRENT_NOTE = (measured_bps, sample) => {
  const rate = `${(measured_bps / 100).toFixed(2)}%`;
  if (sample && isFinite(Number(sample.charge_count)) && isFinite(Number(sample.days_covered))) {
    const n = Math.round(Number(sample.charge_count));
    const m = Math.round(Number(sample.days_covered));
    return `Current rate is your all-in measured rate (${rate}, fees ÷ net volume, ${n} charges over ${m} days). Achievable is composed from published floors.`;
  }
  return `Current rate is your all-in measured rate (${rate}, fees ÷ net volume from your synced PSP data). Achievable is composed from published floors.`;
};

// ─── Public entry point ──────────────────────────────────────────────────────

// calculateGap — the single function the backend endpoint wraps.
//
// Contract:
//   input: {
//     monthly_gmv_eur: number > 0,
//     avg_ticket_eur:  number > 0,
//     region:          'EU' | 'UK' | 'US' | 'RoW',    (unknown → 'RoW')
//     provider_slug:   'stripe' | 'paypal' | 'shopify_payments' | ...,
//     intl_pct:        0..100                          (default 0)
//   }
//   rateTable: array of PaymentsRateTable rows (as returned by base44 SDK)
//
// Returns:
//   { ok: false, error: 'rate_table_incomplete', missing: [...] }  // caller must refuse
//   { ok: false, error: '<validation_reason>' }                     // input malformed
//   { ok: true,
//     current_effective_bps, achievable_effective_bps,
//     monthly_savings_eur:  { lo, point, hi },
//     annual_savings_eur:   { lo, point, hi },
//     cohort: { key, verified, matched, channel },
//     mode: 'estimated' | 'verified',
//     classification: 'savings_opportunity' | 'already_optimized' | 'insufficient_data',
//     benchmark_resolution: { method, avg_ticket_eur, ticket_source, candidates,
//                             winner, winner_effective_bps, confidence } | undefined,
//     assumptions: [ ...strings... ]
//   }
function calculateGap(rawInput, rateTable) {
  // Normalize FIRST — we need input.channel to run the channel-aware
  // rate-table check. Order swap vs pre-1.4.0 is safe because
  // normalizeInput is pure (no DB), and it only fails on shape errors the
  // caller must fix anyway. If normalization fails we return before
  // touching the table.
  const parsed = normalizeInput(rawInput);
  if (!parsed.ok) {
    return { ok: false, error: parsed.reason };
  }
  const { input } = parsed;
  // Channel-aware table validation: only require the fallback rows for the
  // channel this call actually needs. Retrocompat lock — an online call
  // (channel omitted → 'online' default) still checks exactly the 4 legacy
  // 3-segment keys, so any pre-1.4.0 rate table (test fixture or historical
  // DB snapshot) validates fine. An in_store call on that same table
  // correctly fails rate_table_incomplete rather than silently reusing
  // an online row.
  const tableCheck = validateRateTable(rateTable, { channels: [input.channel] });
  if (!tableCheck.ok) {
    return { ok: false, error: tableCheck.reason, missing: tableCheck.missing };
  }

  const { row, matched } = selectRow(rateTable, input.provider_slug, input.region, input.channel, input.country);
  if (!row) {
    // Defensive — validateRateTable already guarantees the regional fallback.
    // The missing-key hint uses the 4-segment shape only for in_store lookups
    // (where 4-segment is the canonical shape); online falls back to the
    // 3-segment legacy shape it always used.
    const missKey = input.channel === "in_store"
      ? `ANY|ANY|${input.region}|in_store`
      : `ANY|ANY|${input.region}`;
    return { ok: false, error: "rate_table_incomplete", missing: [missKey] };
  }

  // Read intl uplifts DIRECTLY from the row. Missing → 0 (engine never fills
  // in a number from code). We track "modeled" separately so we can emit the
  // right assumption when the merchant has intl volume but the row doesn't
  // carry an uplift.
  const rowCurrentUplift = typeof row.intl_uplift_bps === "number" ? row.intl_uplift_bps : 0;
  const rowAchievableUplift = typeof row.achievable_intl_uplift_bps === "number" ? row.achievable_intl_uplift_bps : 0;
  const intlModeled = typeof row.intl_uplift_bps === "number";

  // v1.3.0 verified-path split.
  //
  // measured_current_bps present ("verified" mode):
  //   • current_effective_bps = measured_current_bps DIRECT (all-in by canonical
  //     definition — fees ÷ net volume from real PSP data). NO recomposition on
  //     top: no fixed amortization, no intl uplift added. This is the
  //     anti-double-counting lock — the caller must NEVER measure something
  //     that then has extras stacked on.
  //   • achievable side: composed from the table (published floors) using
  //     measured_intl_pct when the caller supplied it (real cross-border share
  //     over the measurement window), else the form input.intl_pct.
  //
  // measured_current_bps absent ("estimated" mode):
  //   • Byte-identical 1.2.0 behavior. Both sides composed from the row via
  //     computeEffectiveBps with input.intl_pct. Anti-regression lock for the
  //     anonymous submitPaymentsAnalysis path (Chunk 4 will start passing
  //     measured; Chunk 3 does not).
  const measured = input.measured_current_bps;
  const isMeasured = typeof measured === "number" && isFinite(measured);
  // Achievable-side intl_pct: prefer measured when present, else form value.
  const achievableIntlPct = (isMeasured && typeof input.measured_intl_pct === "number")
    ? input.measured_intl_pct
    : input.intl_pct;

  const current_bps = isMeasured
    ? measured
    : computeEffectiveBps(
        {
          percent_bps: row.percent_bps,
          fixed_fee_minor_units: row.fixed_fee_minor_units,
          // M4-TPV Fase 2A-redo — undefined on online rows → rentalBps=0
          // inside computeEffectiveBps → byte-identical to pre-1.4.0.
          terminal_rental_monthly_minor: row.terminal_rental_monthly_minor,
        },
        input.avg_ticket_eur,
        {
          intl_pct: input.intl_pct,
          intl_uplift_bps: rowCurrentUplift,
          monthly_gmv_eur: input.monthly_gmv_eur,
        }
      );

  // M4-refinado (v1.5.0) — achievable side.
  //
  // IN-STORE branch: try multi-anchor selection FIRST. Pick the region's
  // best publicly contractable in-store provider evaluated at THIS merchant's
  // ticket. If the pool is empty (regions without seeded verified anchors —
  // UK/US/RoW today), fall through to the legacy row.achievable_* path so
  // no in-store call is left without an answer.
  //
  // ONLINE branch: unchanged from 1.4.0 — read row.achievable_percent_bps +
  // row.achievable_fixed_fee_minor_units directly. Retrocompat lock.
  let multiAnchorRan = false;
  let multiAnchorEmpty = false;
  let multiAnchor = null;
  let achievable_bps;
  let achievableBreakdownForNote = row.achievable_breakdown_json;

  if (input.channel === "in_store") {
    multiAnchorRan = true;
    multiAnchor = selectMultiAnchorAchievable(
      rateTable,
      input.region,
      input.avg_ticket_eur,
      input.monthly_gmv_eur,
      input.provider_slug,
      input.country,
    );
    if (multiAnchor) {
      // Winner from the region's verified in-store anchor pool. Use its
      // effective_bps directly (already amortized against the merchant's
      // real ticket + rental=0 on all seeded anchors).
      achievable_bps = multiAnchor.winner_effective_bps;
      // Rebuild the achievable_breakdown for ACHIEVABLE_NOTE — this is what
      // the merchant sees. Uses the WINNER's components, marks the shape as
      // multi_anchor_min_effective.
      achievableBreakdownForNote = {
        anchor_provider: multiAnchor.winner,
        anchor_percent_bps: multiAnchor.winner_percent_bps,
        anchor_fixed_fee_minor_units: multiAnchor.winner_fixed_fee_minor_units,
        selection_method: "multi_anchor_min_effective",
      };
    } else {
      multiAnchorEmpty = true;
      // Pool empty — fall back to the row's own achievable_* fields (used
      // for regions where no verified in-store anchors are seeded yet).
      const hasAchievable =
        typeof row.achievable_percent_bps === "number" &&
        typeof row.achievable_fixed_fee_minor_units === "number";
      achievable_bps = hasAchievable
        ? computeEffectiveBps(
            {
              percent_bps: row.achievable_percent_bps,
              fixed_fee_minor_units: row.achievable_fixed_fee_minor_units,
              terminal_rental_monthly_minor: row.achievable_terminal_rental_monthly_minor,
            },
            input.avg_ticket_eur,
            {
              intl_pct: achievableIntlPct,
              intl_uplift_bps: rowAchievableUplift,
              monthly_gmv_eur: input.monthly_gmv_eur,
            }
          )
        : current_bps;
    }
  } else {
    // ONLINE — unchanged from 1.4.0.
    const hasAchievable =
      typeof row.achievable_percent_bps === "number" &&
      typeof row.achievable_fixed_fee_minor_units === "number";
    achievable_bps = hasAchievable
      ? computeEffectiveBps(
          {
            percent_bps: row.achievable_percent_bps,
            fixed_fee_minor_units: row.achievable_fixed_fee_minor_units,
            // Achievable rental — on all seeded in-store rows this is 0
            // (assumes migration to a modern TPV with no rental). Field is
            // OPTIONAL on the schema — future negotiated tiers may set a
            // non-zero achievable rental. Missing → 0 → byte-identical online.
            terminal_rental_monthly_minor: row.achievable_terminal_rental_monthly_minor,
          },
          input.avg_ticket_eur,
          {
            intl_pct: achievableIntlPct,
            intl_uplift_bps: rowAchievableUplift,
            monthly_gmv_eur: input.monthly_gmv_eur,
          }
        )
      : current_bps;
  }

  const pointSavings = computeMonthlySavings({
    current_bps,
    achievable_bps,
    monthly_gmv_eur: input.monthly_gmv_eur,
  });
  const band_pct = typeof row.savings_band_pct === "number" ? row.savings_band_pct : 0.35;
  const monthly = applyBand(pointSavings, band_pct);
  const annual = {
    lo: monthly.lo * 12,
    point: monthly.point * 12,
    hi: monthly.hi * 12,
  };

  const assumptions = [];
  if (isMeasured) {
    // Verified path — mandatory assumption naming the measured rate and, when
    // provided, the sample descriptor. This is the audit trail: the user's
    // Results view must show WHY current is that exact number.
    assumptions.push(MEASURED_CURRENT_NOTE(measured, input.measured_sample));
    // Achievable side is still composed from the table (fixed fee is amortized
    // against the same avg_ticket_eur the caller passed — the merchant's real
    // ticket in the measurement window when going through Chunk 4). So the
    // amortization note stays, but it now describes ONLY the achievable side.
    assumptions.push(
      AMORTIZATION_NOTE(row.achievable_fixed_fee_minor_units ?? row.fixed_fee_minor_units, row.fixed_fee_currency, input.avg_ticket_eur)
    );
    // M4-TPV Fase 2A-redo — mirror the estimated-path rental note. On the
    // verified path the achievable side is still composed from the table,
    // so if the row's ACHIEVABLE rental is set (rare — all seeded rows are
    // 0), we amortize it and emit a note. Same gate as estimated: rental > 0
    // AND monthly_gmv_eur > 0.
    const rentalMinorAch = Number(row.achievable_terminal_rental_monthly_minor);
    if (isFinite(rentalMinorAch) && rentalMinorAch > 0 && input.monthly_gmv_eur > 0) {
      assumptions.push(TERMINAL_RENTAL_NOTE(rentalMinorAch, row.fixed_fee_currency, input.monthly_gmv_eur));
    }
    // Achievable breakdown assumption unchanged.
    const achievableNote = ACHIEVABLE_NOTE(achievableBreakdownForNote);
    if (achievableNote) assumptions.push(achievableNote);
    // Intl uplift on the ACHIEVABLE side only (the current side is verbatim).
    if (achievableIntlPct > 0) {
      if (intlModeled) {
        assumptions.push(INTL_UPLIFT_NOTE(achievableIntlPct, rowCurrentUplift, rowAchievableUplift));
      } else {
        assumptions.push(INTL_UPLIFT_NOT_MODELED_ASSUMPTION);
      }
    }
  } else {
    // Estimated path — 1.2.0 behavior verbatim for online rows (rental fields
    // absent → no rental note emitted). In-store rows may carry a non-zero
    // terminal_rental_monthly_minor → emit a dedicated rental note so the
    // merchant sees where that portion of the rate comes from.
    assumptions.push(
      AMORTIZATION_NOTE(row.fixed_fee_minor_units, row.fixed_fee_currency, input.avg_ticket_eur)
    );
    // M4-TPV Fase 2A-redo — emit rental note when the row carries a non-zero
    // monthly rental AND the merchant declared monthly GMV. This gates the
    // note on both signals to avoid a nonsensical amortization message on
    // rows where rental is null/0 or GMV is 0.
    const rentalMinor = Number(row.terminal_rental_monthly_minor);
    if (isFinite(rentalMinor) && rentalMinor > 0 && input.monthly_gmv_eur > 0) {
      assumptions.push(TERMINAL_RENTAL_NOTE(rentalMinor, row.fixed_fee_currency, input.monthly_gmv_eur));
    }
    const achievableNote = ACHIEVABLE_NOTE(achievableBreakdownForNote);
    if (achievableNote) assumptions.push(achievableNote);
    if (input.intl_pct > 0) {
      if (intlModeled) {
        assumptions.push(INTL_UPLIFT_NOTE(input.intl_pct, rowCurrentUplift, rowAchievableUplift));
      } else {
        assumptions.push(INTL_UPLIFT_NOT_MODELED_ASSUMPTION);
      }
    }
  }
  if (row.verified !== true) assumptions.push(FALLBACK_ASSUMPTION);

  // M4-refinado (v1.5.0) — deterministic three-state classification. See
  // classifyResult() docstring for the sealed rules.
  const classification = classifyResult({
    annual_point_savings_eur: annual.point,
    monthly_gmv_eur: input.monthly_gmv_eur,
    row_verified: row.verified === true,
    ticket_present: input.avg_ticket_eur > 0,
    multi_anchor_ran: multiAnchorRan,
    multi_anchor_empty: multiAnchorEmpty,
    channel: input.channel,
  });

  const result = {
    ok: true,
    engine_version: ENGINE_VERSION,
    current_effective_bps: current_bps,
    achievable_effective_bps: achievable_bps,
    monthly_savings_eur: monthly,
    annual_savings_eur: annual,
    cohort: {
      key: row.cohort_key,
      verified: row.verified === true,
      matched,
      // M4-TPV Fase 2A-redo — surface the channel to the UI (Results pill).
      // Derived from the row itself when present (canonical), else from the
      // input (which normalizeInput already defaulted to 'online'). Legacy
      // 3-segment rows have row.channel undefined → we fall to input.channel,
      // which is 'online'. Retrocompat lock: an online caller reading the
      // output on 1.4.0 sees channel='online' — no undefined leaking to UI.
      channel: (typeof row.channel === "string" && KNOWN_CHANNELS.has(row.channel))
        ? row.channel
        : input.channel,
    },
    // Engine mode — "verified" when current came from a real measurement,
    // "estimated" when both sides were composed from the table. Consumed by
    // Results.jsx (badge copy) and future benchmark aggregators (filter by
    // origin). Persisted verbatim on every session row.
    mode: isMeasured ? "verified" : "estimated",
    classification,
    assumptions,
  };
  // benchmark_resolution — ONLY emitted when multi-anchor selection actually
  // ran (in-store with a non-empty pool). Absent on every online result and
  // on in-store results that fell back to legacy row.achievable_*. Consumers
  // must check for presence, not assume the field exists.
  if (multiAnchor) {
    result.benchmark_resolution = {
      method: multiAnchor.method,
      avg_ticket_eur: multiAnchor.avg_ticket_eur,
      ticket_source: multiAnchor.ticket_source,
      candidates: multiAnchor.candidates,
      winner: multiAnchor.winner,
      winner_effective_bps: multiAnchor.winner_effective_bps,
      // Confidence reduced when the row itself is unverified (fallback in a
      // region with a non-empty anchor pool — currently EU fallback bank row,
      // where the CURRENT side is a regional estimate but the achievable
      // side is a legitimate multi-anchor pick).
      confidence: (row.verified === true && multiAnchor.confidence === "high") ? "high" : "reduced",
    };
  }
  return result;
}

// M4-refinado (v1.5.0) — combined-mode aggregator. Combines per-channel
// engine results into a single top-level classification + total savings.
//
// Precedence rule (sealed with Xavi 2026-07-12):
//
//   savings_opportunity > insufficient_data > already_optimized
//
// The three-state precedence in one line, with the reasoning behind each step:
//
//   1. ANY channel is `savings_opportunity`
//        → combined = `savings_opportunity`.
//        The merchant has money to recover in at least one channel. The total
//        savings row displays the SUM ACROSS THAT SUBSET (channels with an
//        opportunity), and individual channel classifications are preserved
//        in `per_channel` so Results can render "online: ✓ already optimized /
//        in-store: €3,340 recoverable" side by side. NEVER dilute a real
//        recovery signal by averaging in the "no-signal" channels.
//
//   2. ZERO channels with `savings_opportunity` AND at least one
//      `insufficient_data`
//        → combined = `insufficient_data`.
//        This is the CRITICAL rule the operator called out — an
//        already_optimized + an insufficient_data is NOT a global victory,
//        it's a partial victory + a data gap. Declaring "you're optimized"
//        when we couldn't even evaluate a channel would be dishonest and
//        would erode the product's core credibility.
//
//   3. ALL channels are `already_optimized`
//        → combined = `already_optimized`.
//        The only way to claim the global victory state is to win it in
//        every evaluable channel.
//
// Total savings: sum lo/point/hi across ONLY the channels classified as
// `savings_opportunity`. Channels classified `already_optimized` contribute
// €0 (correct — they have no gap). Channels classified `insufficient_data`
// also contribute €0 (we can't defend a number). This makes the top-level
// total legible even in mixed states: the number the merchant sees is
// EXACTLY what we can defend across the evaluable-with-opportunity channels.
function aggregateCombinedClassification(perChannel) {
  if (!Array.isArray(perChannel) || perChannel.length === 0) {
    return {
      combined_classification: "insufficient_data",
      total_monthly_savings_eur: { lo: 0, point: 0, hi: 0 },
      total_annual_savings_eur: { lo: 0, point: 0, hi: 0 },
    };
  }
  let hasOpportunity = false;
  let hasInsufficient = false;
  const monthly = { lo: 0, point: 0, hi: 0 };
  const annual  = { lo: 0, point: 0, hi: 0 };
  for (const ch of perChannel) {
    const c = ch?.classification;
    if (c === "savings_opportunity") {
      hasOpportunity = true;
      const m = ch?.engine_result?.monthly_savings_eur || {};
      const a = ch?.engine_result?.annual_savings_eur || {};
      monthly.lo    += Number(m.lo)    || 0;
      monthly.point += Number(m.point) || 0;
      monthly.hi    += Number(m.hi)    || 0;
      annual.lo     += Number(a.lo)    || 0;
      annual.point  += Number(a.point) || 0;
      annual.hi     += Number(a.hi)    || 0;
    } else if (c === "insufficient_data") {
      hasInsufficient = true;
    }
    // already_optimized channels contribute 0 to the total — no branch needed.
  }
  let combined;
  if (hasOpportunity) combined = "savings_opportunity";
  else if (hasInsufficient) combined = "insufficient_data";
  else combined = "already_optimized";
  return {
    combined_classification: combined,
    total_monthly_savings_eur: monthly,
    total_annual_savings_eur: annual,
  };
}

// SYNC-END: paymentsGap

// Exports used by tests and by the Deno endpoint's parity layer.
export {
  calculateGap,
  aggregateCombinedClassification,
  validateRateTable,
  normalizeInput,
  selectRow,
  selectMultiAnchorAchievable,
  computeEffectiveBps,
  computeMonthlySavings,
  applyBand,
  classifyResult,
  REQUIRED_FALLBACK_KEYS,
  REQUIRED_FALLBACK_KEYS_ONLINE,
  REQUIRED_FALLBACK_KEYS_IN_STORE,
  KNOWN_PROVIDERS,
  KNOWN_CHANNELS,
  DEFAULT_CHANNEL,
  FALLBACK_ASSUMPTION,
  INTL_UPLIFT_NOT_MODELED_ASSUMPTION,
  ALREADY_OPTIMIZED_EUR_ANNUAL_THRESHOLD,
  ALREADY_OPTIMIZED_BPS_THRESHOLD,
  ENGINE_VERSION,
};