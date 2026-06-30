# Normalizer contracts & known debt

## REGISTRY rationale — long-form decision notes

These are rationale notes that live alongside specific provider entries in
the `REGISTRY` constant of `base44/functions/dataSyncAgent/entry.ts` (and
its byte-equivalent twin in `base44/functions/oauthConnector/entry.ts`).
The code keeps short inline pointers; the long-form *why* lives here.

### REGISTRY.bigcommerce — X-Auth-Token via `static_headers`

The BigCommerce token doesn't go in the `Authorization` header — it goes
in `X-Auth-Token`. Implementation: set `api_key_header: "X-Auth-Token"`
so `buildAuthHeaders` emits the right header directly, AND declare
`static_headers: { Accept: "application/json" }` for content negotiation.
Simpler and equivalent to using `{token}` interpolation in `static_headers`
with a suppressed `Authorization` route. The `{token}` interpolation path
remains documented and available for any future provider that needs it.

### REGISTRY.sevdesk — two endpoints on the same provider

`/Voucher` (expenses) and `/Invoice` (revenue) coexist on the same
provider, mirroring Pennylane's customer+supplier pattern. Each endpoint
has its own normalizer; neither is touched when the other changes.

`countAll=true` is REQUIRED on `/Invoice` — without it sevDesk does not
return the total row count and offset-based pagination cannot advance.

Operational note (NOT a `known_data_gap` — covered by `last_sync_status`):
API tokens are bound to a specific sevDesk user account. If that user is
deleted in sevDesk, the token dies silently — the next sync surfaces a
401 via `last_error`, which is already the right behavior.

### REGISTRY.odoo — DEUDA ESTRUCTURAL confirmada (multi-db)

Odoo self-hosted multi-database requires the header `X-Odoo-Database`
with the NAME of the database, in addition to the instance domain. That's
TWO independent per-integration values (domain AND database name) — the
current `requires_shop_domain` mechanism only supports ONE value. The
simple path (reuse `{shop}` in `static_headers`) works for Xero and Sage
(1 value each), but NOT for Odoo multi-db. NOT resolved here until a
generic N>1 per-integration mechanism exists. Odoo Online single-db (the
default SaaS case) is unaffected.

### REGISTRY.payplug — `known_data_gaps`

Provider-level static metadata flagging documented limitations of the
upstream API. Currently flags that `/v1/payments` only returns
API-created payments; portal-created payments are invisible → volume may
be undercounted (`portal_payments_not_visible_via_api`).

DEUDA: `known_data_gaps` is defined in the registry but NOT YET wired
into `DataQualityScore.completeness`. Verify in M2/M3 whether a generic
consumption mechanism exists; if not, that's explicit future work — do
not assume engine behaviour without a human decision.

### REGISTRY.bigcommerce — `known_data_gaps` (refunds_not_inline_v2)

`/v2/orders` does NOT carry refund line items inline. Refunds live on a
separate endpoint (`/v3/orders/{id}/refunds`, V3 API) or are surfaced
only as the aggregate field `refunded_amount` on `/v2/orders` (no
per-tax-line breakdown). Confirmed via BigCommerce support + Medium
(Order Refund API article) + StackOverflow. Net order volume may be
overstated since refunds are not subtracted at this normalizer level.

Same pattern as PayPlug's `known_data_gaps` — purely informational
metadata, NOT consumed by `computeVerticalStatus` /
`generateRecommendations` / savings.

### REGISTRY.freshbooks — `requires_shop_domain` for accountId

FreshBooks Expenses API. OAuth2 + Bearer. Per-account: the FreshBooks API
namespaces every accounting endpoint under an `accountId` that is NOT
returned by the OAuth callback and NOT a fixed value — it must be
resolved by calling `GET /auth/api/v1/users/me` and reading
`business_memberships[].business.account_id`.

⚠️ **Architectural decision** (camino 1 — reuse of the QuickBooks
pattern): the generic engine has NO mechanism for "post-OAuth account
resolution via API call". QuickBooks resolves an analogous problem
(`realmId` per-company) by asking the user to paste the ID manually via
`requires_shop_domain` + `{shop}` in the URL. FreshBooks reuses EXACTLY
that pattern instead of inventing a new engine mechanism: the user pastes
their `accountId` at connect time, we store it in
`metadata_json.shop_domain`, and the sync engine interpolates it as
`{shop}`. The engine needs zero changes.

Known trade-off: UX worse than the "ideal" (auto-resolution via
`/users/me`), but (a) consistent with QuickBooks/Odoo, (b) zero new
imperative code in the registry, (c) the multi-membership decision (what
if the user has multiple companies in FreshBooks?) is delegated to the
user, who picks which `accountId` to paste — that problem would be
structural if we automated it. When a SECOND provider also needs
post-OAuth API resolution, then it'll be worth building the generic
mechanism (rule N≥2).

`accountId ≠ businessId`: `/accounting` uses `accountId`; `/timetracking`
and `/projects` use `businessId`, irrelevant here.

DEUDA (also in the normalizer section above):
- (a) Fields written from public docs + real-response example; confirm
  exact paths at first real connect.
- (b) `expense.amount` is a nested object `{ amount: "762.68", code:
  "USD" }` — string in MAJOR unit (not cents). Confirm.
- (c) No direct supplier field → `supplier_name: null` by default.
  There is a referential `vendorid` but it doesn't resolve to a name
  inside the same expense object; degraded to `null` without invention.
- (d) Pagination via `?page&per_page` — sync engine.
- (e) Short-lived token (~12h); single-use refresh token — handled by
  generic `modeRefresh`, same path as Pennylane (RTR).

### Sync engine duplication notes

The sync engine modules (`paginators`, `dateRange`, `rateLimit`,
`refreshOn401`) are **funcionalmente equivalentes** (verified by
execution against 17 paginator fixtures and the unit test suite of each
src/ module) to `src/lib/syncEngine/*.js` — but NOT byte-verbatim. In
Deno the helpers carry `_` prefixes to avoid name collisions inside the
single ~2300-line entry.ts; in `src/` they're plain exports for
testability. The divergence is structural-architectural, not accidental
drift. `__sync_check__.test.js` keeps the structural-drift modules in
`skip` with documented reasons.

The `stripe_transactions` and `bigcommerce_orders` normalizers follow
the same pattern (object-method-shorthand inside `normalizers` in Deno
vs named export in src). Same architectural divergence.

---



This file is the **single source of truth** for the *why* of every normalizer
in `base44/functions/dataSyncAgent/entry.ts`. The code keeps a short header
that points here; the long-form contract, sign conventions, root-key probes,
and DEUDA notes live in this document.

Why this split: `dataSyncAgent/entry.ts` is a single Deno function file
(platform constraint — Deno edge functions cannot import sibling files;
verified end-to-end in the previous session). Long-form contract comments
were inflating the file toward the 2500-line hard limit without changing
behavior. Moving the prose here keeps the *executable* code dense and the
*explanatory* prose searchable.

If a normalizer contract changes, **update both this file and the code in
the same commit**. The inline pointer must always be valid.

---

## payplug_payments

PayPlug `/v1/payments` (French PSP). Bearer `sk_live_...` key + mandatory
`PayPlug-Version` header (declared via `static_headers`).

- `amount` is in **CENTS** → `/100`.
- `created_at` / `paid_at` are **Unix SECONDS** → `*1000` → ISO.
- Prefer `paid_at` over `created_at` for `occurred_at`.
- Root probe: `raw.data` array OR bare array; no further fallback.
- `fee: 0` — honest absence. PayPlug payments API does NOT carry fee
  (fee lives in the settlement endpoint, not wired here).
- `status`: `is_paid === true → "paid"`, else `is_refunded === true →
  "refunded"`, else `null`.

**DEUDA:**
- (a) Verify endpoint + fields at first real connect.
- (b) `fee: 0` — settlement endpoint required for real fee rate. Future work.
- (c) ⚠️ `/v1/payments` ONLY lists API-created payments — portal-created
  payments are invisible; may undercount volume. Flagged in registry
  `known_data_gaps: ["portal_payments_not_visible_via_api"]`.
- (d) Cents (`/100`) + Unix seconds (`*1000`).
- (e) Root key probe `data` vs bare array — confirm at first connect.
- (f) Pagination — sync engine.

---

## lexoffice_vouchers

Lexoffice (lexware Office) `/v1/voucherlist`. German accounting, OAuth2 Bearer.
`voucherlist` is a SUMMARY endpoint; per-voucher GET carries the net/tax
breakdown.

- Filter: `voucherType === "purchaseinvoice"` OR `"purchasecreditnote"`
  (supplier bills + credit notes = expenses). `"salesinvoice"` /
  `"salescreditnote"` (revenue) dropped silently.
- Root: `raw.content` (Spring-style paginated wrap `{content, totalPages,
  ...}`); no fallback.
- `totalAmount` typically a number in major units (`toNum` tolerates strings
  too).
- `voucherDate` is ISO with TZ (`"2023-04-15T00:00:00.000+02:00"`) —
  preserved AS-IS.

**DEUDA:**
- (a) Verify endpoint + fields at first real connect.
- (b) `amount_before_tax & tax = 0`: `voucherlist` is a SUMMARY without
  reliable net/tax breakdown — honest absence (same pattern as
  `quickbooks_bills`). Per-voucher GET would be needed.
- (c) URL pre-filters `voucherType=purchaseinvoice`; normalizer re-filters
  to accept `purchasecreditnote` too — confirm if the multi-value URL filter
  works or a second call is needed.
- (d) `scopes: []` — confirm if Lexoffice requires explicit OAuth scopes.
- (e) Page+size pagination, `raw.totalPages` — sync engine.

---

## sevdesk_vouchers

sevDesk `/Voucher` (German accounting). A "Voucher" is the unit of
accounting entry; there is NO separate supplier_invoice endpoint.

- Filter: `creditDebit === "C"` (Credit = outgoing = supplier voucher =
  expense). `"D"` (Debit = incoming = revenue) dropped silently.
- Auth header is bare key (`api_key_format "{key}"`, no `"Bearer "` prefix).
- Root: `raw.objects` (sevDesk wraps every list in `{objects:[...]}`);
  no fallback.
- `sum*` values are STRINGS in major units → `parseFloat` (NOT `/100`).
- `supplier_name`: prefer flat string `supplierName`, else nested
  `supplier.name`, else `null`.
- `voucherDate` may be `"YYYY-MM-DD"` or ISO with TZ offset
  (`"2024-01-15T00:00:00+01:00"`) — preserved AS-IS.
- `status` is a numeric sevDesk state code (`50` / `100` / `1000`);
  stringified raw, label mapping is the consumer's job.

**DEUDA:**
- (a) Verify `creditDebit C/D` + `sum*` field names at first connect.
- (b) `supplierName`: string OR nested `supplier.name` — both handled.
- (c) `status` numeric code, kept as raw string.
- (d) `voucherDate` may carry TZ — as-is.
- (e) Offset+limit pagination — sync engine.

---

## sevdesk_invoices

sevDesk `/Invoice` (customer invoice = REVENUE). SISTER of
`sevdesk_vouchers` (which reads `/Voucher` = expenses). Both endpoints live
on the same provider; this normalizer is REVENUE-only (no `direction`
field — per the CAMBRA contract, customer_invoices without `direction`
mean revenue, supplier rows carry `direction: "expense"`).

- Root: `raw.objects` (sevDesk's standard list wrapper) is the ONLY
  accepted shape — no fallback (consistent with `sevdesk_vouchers`).
- Skip lines without `id`.
- Amounts: `invoice.sumGross` is ALREADY in MAJOR currency units (NOT
  cents). DO NOT divide by 100. This differs from
  Payplug/Stripe/Zettle/Square which emit minor units. Anti-regression
  test T6 specifically guards this.
- Dates: `invoice.invoiceDate` may be `"YYYY-MM-DD"` or ISO with TZ offset
  (`"2024-01-15T00:00:00+01:00"`) — preserved AS-IS. If absent,
  `occurred_at: null` (no invented fallback — sevDesk has no reliable
  alternative timestamp at header level).
- Status: sevDesk uses NUMERIC state codes on `/Invoice`:
  - `100` → `"draft"`
  - `200` → `"open"` (sent / awaiting payment)
  - `1000` → `"paid"`
  - anything else → `null` (do NOT invent labels — same defensive stance
    as `sevdesk_vouchers` which stores raw numeric string for `/Voucher`
    status).
  - ⚠️ Codes from public docs; verify against real API at first connect.
- Currency: `invoice.currency` arrives as ISO code (e.g. `"EUR"`) — no
  Stripe-style lowercase→uppercase transformation needed. Fallback `"EUR"`
  when absent.

**DEUDA:**
- (a) Verify status code mapping at first real connect — `100/200/1000`
  assumption from public docs.
- (b) `limit/offset+countAll` pagination is the sync engine's job;
  `countAll=true` is hard-coded in the URL because sevDesk does NOT return
  total count without it.
- (c) `sumNet/sumTax` not exposed at this normalizer (header-level
  breakdown reliability TBC); add later if needed via a per-invoice GET
  (same pattern as `quickbooks_bills` DEUDA b).

---

## odoo_bills

Odoo REST `/api/account.move` (Odoo 17+, Custom plan only).

- Filter: `move_type === "in_invoice"` (supplier bill = expense);
  `out_invoice` (revenue) and any other `move_type` (entry, in_refund,
  out_refund, …) are skipped silently.
- Root probe: `raw` is array → `raw`; `raw.result` array → `raw.result`;
  `raw.records` array → `raw.records`; else `[]` (no further fallback).
- Relational fields are `[id, "label"]` tuples — `relLabel(v)` returns
  `v[1]` only if `Array.isArray(v) && v.length >= 2`; if Odoo sends a bare
  integer (no context expansion) `supplier_name` / `currency` fall back to
  `null` / `"EUR"` without crashing.
- Amounts are numbers in major units. `invoice_date` is `"YYYY-MM-DD"`
  date-only, preserved AS-IS.

**DEUDA:**
- (a) ⚠️ Odoo external REST API is Custom plan only (not Free/Standard) —
  many clients won't have access.
- (b) REST is Odoo 17+; older versions only XML/JSON-RPC.
- (c) Root shape not 100% standardized across Odoo versions — probed 3
  forms, confirm at first real connect.
- (d) Relational fields may arrive as bare id (no `[id,"label"]`) when
  context doesn't expand — handled via null fallback.
- (e) Multi-db Odoo may require `X-Odoo-Database` header per integration
  (same dynamic-header debt as Xero/Sage, now 3rd API asking for it).
- (f) URL carries domain/fields with brackets+quotes — URL-encoding is
  sync engine's job (same situation as QuickBooks query string).
- (g) Offset+limit pagination — sync engine.

---

## sage_purchase_invoices

Sage Accounting v3.1 `/purchase_invoices` (supplier bills = expense).

- Root `$items` (dollar prefix, bracket notation).
- `contact` / `currency` / `status` are **dual `object|string`** — both
  forms handled.
- `supplier_name = contact.name ?? contact.displayed_as` (NEVER `.id`).
- `currency` from `.id` (ISO), not `.displayed_as`.
- `status` from `.displayed_as`.
- Amounts in major units. Date date-only as-is.

**DEUDA:**
- (a) Verify field names at first real connect.
- (b) Root `$items` confirmed in docs.
- (c) Object/string both handled.
- (d) `full_access` scope assumed.
- (e) Sage multi-business may require per-business header (same
  Xero-Tenant-Id debt).
- (f) Cursor pagination via `$next` / `$back`.

---

## quickbooks_bills

QBO v3 `/query?query=select * from Bill` (`Bill` = supplier bill =
expense).

- Root `QueryResponse.Bill` (two levels, no fallback).
- `VendorRef` and `CurrencyRef` are OBJECTS:
  - `supplier_name = VendorRef.name`
  - `currency = CurrencyRef.value` (ISO).
- Default `"USD"` (not EUR — QBO is US-centric).
- `TotalAmt` is number, major units.
- `TxnDate` `"YYYY-MM-DD"` as-is.

**DEUDA:**
- (a) Verify fields at first connect.
- (b) `amount_before_tax & tax = 0`: header has no reliable tax breakdown,
  real tax in `Line[]` items (honest absence).
- (c) `status = null`: no header-level status.
- (d) `{shop} = realmId` (numeric), generic helper handles strings.
- (e) URL has spaces in query string (`"select * from Bill"`); `fetch`
  tolerates, encode if breaks.
- (f) Pagination via `STARTPOSITION + MAXRESULTS` — sync engine.

---

## xero_bills

Xero `/Invoices`, filter `Type === "ACCPAY"` (supplier bills = expense);
`ACCREC` (revenue) dropped silently.

- Root `raw.Invoices`, no fallback.
- `Total` / `SubTotal` / `TotalTax` are numbers in major units.
- `supplier_name = Contact.Name`.
- Date is Microsoft `"/Date(MILLISECONDS+0000)/"` — extract digits,
  `new Date(ms).toISOString()` (NOT seconds).

**DEUDA:**
- (a) Verify fields at first connect.
- (b) Date in `/Date(ms)/` — MILLISECONDS, confirm.
- (c) `static_headers` forces JSON over XML default; confirm no
  `?format=json` also needed.
- (d) `Xero-Tenant-Id` captured at connect via `shop_domain` and injected
  by `static_headers` (`{shop}` interpolation). Same UX pattern as Sage
  `X-Business`.
- (e) `?page=N` pagination — sync engine.

---

## holded_purchases

Holded `/documents/purchase` (purchase = supplier bill = expense).

- Root bare array, no fallback.
- `supplier_name = doc.contactName ?? doc.contact?.name`.
- `currency` uppercased (`"eur"` → `"EUR"`).
- `date` is UNIX SECONDS → `new Date(s*1000).toISOString()`.

**DEUDA HIGH UNCERTAINTY** (docs hidden behind login):
- (a) Field names assumed from public docs, verify ALL at first connect.
- (b) Root shape assumed bare array; confirm if wrapped.
- (c) `date` assumed UNIX SECONDS — if ms, drop `*1000`.
- (d) Pagination — sync engine.

---

## bigcommerce_orders

BigCommerce Orders v2 (storefront, not processor → `fee: 0` honest
absence).

- Root bare array, no fallback.
- Amounts strings, major units, `parseFloat` (NOT `/100`).
- Status: prefer textual `status`, fall back to `String(status_id)`.
- `date_created` is RFC-2822, preserved AS-IS (NOT converted to ISO —
  would invent TZ).

**DEUDA:**
- (a) Verify root + fields at first connect.
- (b) `date_created` RFC-2822 as-is.
- (c) `{shop} = store_hash`, generic helper handles.
- (d) `X-Auth-Token` via `static_headers` (no code branch).
- (e) `?page&limit` pagination — sync engine.
- (f) ⚠️ Refunds NOT inline in `/v2/orders` — live on `/v3/orders/{id}/refunds`
  or as aggregate `refunded_amount` field. Flagged in registry
  `known_data_gaps: ["refunds_not_inline_v2"]`. Net volume may be overstated.

---

## woocommerce_orders

WooCommerce v3 `/orders` (storefront, not processor → `fee: 0` honest
absence).

- Root bare array, no fallback (NOT `raw.orders` — that's Shopify).
- Amounts strings, major units.
- Prefer `date_created_gmt` over `date_created`.
- `date_created_gmt` is UTC but WITHOUT `"Z"` suffix
  (`"2017-03-22T19:28:02"`) — preserved AS-IS, no synthetic `Z`.

**DEUDA:**
- (a) Verify root + fields at first connect.
- (b) `{shop} = full domain` (vs Shopify handle), generic helper handles.
- (c) `?page&per_page` + `X-WP-Total` — sync engine.
- (d) `gmt` lacks `Z`, as-is.

---

## klarna_settlements

Klarna `/payouts/transactions`. **Fee is a SEPARATE LINE TYPE, not a
field.**

- Line types per `order_id`: `SALE` (+), `RETURN` (refund), `FEE`
  (commission), `FEE_REFUND`.
- GROUP BY `order_id`, emit ONE row per order:
  - `amount = sum(SALE) - sum(RETURN)`
  - `fee = sum(FEE) - sum(FEE_REFUND)` (sign as-is, may go negative).
- NET mode: SALE+FEE in same payout. GROSS mode: payout with only FEE
  lines (no SALE) is VALID → emit `amount: 0` + `fee` (otherwise we
  silently drop fee data in GROSS).
- `amount` is STRING in MAJOR units (NOT `/100`, different from
  Stripe/Zettle/Square minor units).
- Prefer `sale_date` of SALE line; fallback `capture_date` of first line
  (GROSS).

**DEUDA:**
- (a) Verify root key + fields at first connect.
- (b) `amount` major units — confirm.
- (c) NET+GROSS both supported.
- (d) Pagination — sync engine.

---

## square_payments

Square `/v2/payments`. One payment = one row (no grouping vs Zettle).

- `amount_money.amount` is MINOR units → `/100` (same as Stripe/Zettle).
- `processing_fee[]` is ARRAY (may carry INITIAL+REFUND entries); SUM all
  `amount_money.amount`. Absent/empty → `fee: 0` (honest absence).
- `card_last4` from `card_details.card.last_4` or `null`.
- Status whitelist — only the 5 documented Square states are preserved
  (`COMPLETED`, `APPROVED`, `PENDING`, `CANCELED`, `FAILED`); anything
  else → `null`. Strict over permissive — see audit T5.

**DEUDA:**
- (a) Verify field paths at first connect.
- (b) `Square-Version` header REQUIRED — handled via `static_headers`,
  not normalizer.
- (c) Cursor pagination — sync engine.
- (d) `/v2/refunds` is separate endpoint not wired; `processing_fee` may
  include refund entries (negative), summed as-is.

---

## zettle_finance

Zettle Finance v2. **Fee is a SEPARATE LINE (not field).**

- One sale = TWO lines same `originatingTransactionUuid`: `PAYMENT` (+)
  and `PAYMENT_FEE` (-).
- GROUP BY uuid, emit ONE row: `amount = PAYMENT/100`,
  `fee = abs(PAYMENT_FEE)/100` (sign normalized).
- No `PAYMENT_FEE` → `fee: 0` honest absence.
- `PAYMENT` with negative amount = refund, emit AS-IS.
- SKIP: `PAYOUT` lines (money to bank, would double-count GMV); groups
  without `PAYMENT`; lines without uuid (no way to pair).
- Minor units → `/100`.
- Type whitelist — only `PAYMENT` is the documented Zettle anchor type;
  anything else (new type added by Zettle, garbage) → `null`. Consistent
  with the same fix applied to `square_payments.status`. See audit T6.
- ⚠️ NOTE: REFUND handling is unresolved (see T3 audit) and intentionally
  NOT added to the whitelist here — preserving raw on unknown would
  contradict the strict-over-permissive decision applied to Square.
- Observability: groups dropped due to missing `PAYMENT` anchor are logged
  via `console.warn` with their sample types, so a real sync surfaces
  whether Zettle is actually emitting literal `"REFUND"` as a separate
  type. Zero behavior change — logging only.

**DEUDA:**
- (a) Verify field paths at first connect.
- (b) `currency` HARDCODED `"EUR"` — line response has no currency field;
  confirm source (account-level?) for multi-currency merchants.
- (c) `limit/offset` pagination — sync engine.

---

## pennylane_supplier_invoices

Supplier invoices = brand EXPENSES, propagates `supplier_name`. Twin of
`pennylane_invoices` but adds `direction: "expense"` + `supplier_name`
(Klaviyo, EDF, etc).

- **CONTRATO ASIMÉTRICO con cerebro:** customer_invoices (no `direction`) =
  revenue; supplier_invoices (`direction: "expense"`) = expense.
  Intentional, NOT a bug.
- Reads `items[]` only, no fallback.
- STRING amounts, `fee: 0` honest, date as-is, skip no-id.

**DEUDA:**
- (a) Verify fields at first connect.
- (b) Cursor pagination + 2-4 req/s — sync engine.
- (c) CORE of 3-source spend model — long tail of infra spend lives here.

---

## pennylane_invoices

Pennylane v2 `customer_invoices` = GROSS REVENUE (NOT fee, NOT expense).

- Root `items[]` only, NO fallback to `data[]` or root.
- `amount = currency_amount` (with tax).
- `amount_before_tax + tax` propagated separately for downstream net/gross
  reconstruction.
- STRING amounts, `parseFloat`.
- `fee: 0` honest invariant.
- Date date-only as-is, no synthetic UTC.

**DEUDA:**
- (a) `customer_invoices` = revenue; `supplier_invoices` wired separately
  (sibling normalizer).
- (b) Cursor pagination + 2-4 req/s rate limits — sync engine.
- (c) Verify fields at first connect.
- (d) `companies:readonly` scope format assumed.

---

## sendcloud_shipments

Sendcloud v3 `/shipments`. Maps SHIPPING VOLUME only (weight, count,
dates).

- `cost: 0` HONEST ABSENCE — real carrier rate lives in
  `/shipping-options/rates` (separate endpoint).
- Granularity: **ONE ROW PER PARCEL** (not per shipment). `order_price`
  repeated per parcel as context — MUST NOT be summed at portfolio level
  without dedup by `shipment_id`.
- `external_id = shipment.id + ":" + parcel.id` (compound for context).
- Skip: shipments without `parcels[]`; parcels without `id`.

**DEUDA:**
- (a) `cost: 0` invariant — carrier rate is separate endpoint.
- (b) v3 cursor pagination (base64) — sync engine.
- (c) Verify fields at first connect.

---

## shopify_orders

Shopify REST `/orders.json` (storefront, not processor → `fee: 0` honest
absence).

- Two money forms: flat `total_price` OR nested
  `total_price_set.shop_money.amount`; prefer flat, fallback to nested.
- Amounts strings, major units. Dates ISO as-is. `financial_status`
  preserved.

**⚠️ DEUDA GRANDE:**
- (a) REST Admin LEGACY since Oct 2024 — Shopify pushes GraphQL; may need
  `shopify_orders_gql` sibling + sync engine change (cursor
  `pageInfo.endCursor`).
- (b) Without `read_all_orders` scope: REST returns only last 60 days;
  extended requires Shopify approval.
- (c) Cursor pagination via Link header — sync engine.
- (d) `data_type` still `"transactions"`; flip to `"commerce"` when CAMBRA
  introduces that bucket.

---

## paypal_transactions

PayPal `/v1/reporting/transactions`. Money objects
`{currency_code, value}`.

- `fee_amount.value` comes NEGATIVE (PayPal models as debit); CAMBRA
  `fee ≥ 0` → `Math.abs` (sign normalized, magnitude untouched).
- `external_id = transaction_id + ":" + date` (same `tx_id` can appear on
  multiple pages with different event codes).
- Skip items without `transaction_info`.

**DEUDA:** written from docs + example, NOT real payload. Transaction
Search API requires PayPal approval. Verify field paths + sign
conventions at first connect. Pagination — sync engine.

---

## mollie_settlements

Mollie `/v2/settlements`. The Payments object has no fee — fee aggregated
per method in `settlements.costs[]`.

- One settlement → N rows (one per method: iDEAL, PayPal, ...).
- Defensive nesting probe: `costs` may be at root, in `periods[]`, or
  year→month nested.
- Supports both `_embedded.settlements` wrap and bare single settlement.

**DEUDA:** written from DOCS not real payload. `periods` nesting can
shift by API version. `amount.net/vat/gross` are strings. Pagination via
`_links.next` — sync engine. Requires `settlements.read` scope;
`payments.read` kept for future refunds/disputes endpoint.

---

## freshbooks_expenses

FreshBooks `/accounting/account/{accountId}/expenses/expenses`. Supplier
expenses = brand EXPENSES.

- Root nested at `raw.response.result.expenses[]` — NO fallback to bare
  array or other shapes (FreshBooks documented contract).
- ⚠️ `amount` is an **OBJECT**: `expense.amount = { amount: "762.68", code:
  "USD" }`. Easy failure mode: copy a flat-amount pattern from another
  normalizer and read `expense.amount` directly as string → NaN. Extract
  `amount.amount` (string in MAJOR units, NOT cents, NOT `/100`) AND
  `amount.code` in the same step.
- Multi-currency: API does NOT convert currencies; each row keeps its
  real currency without inventing an FX rate.
- No direct supplier field in `expense` object → `supplier_name: null`
  (NO invention).
- `billable`: reflected as-is, no default filter.
- `direction: "expense"` fixed (endpoint is expenses-only).

**DEUDA:**
- (a) Confirm paths at first real connect.
- (b) `amount.amount` = string major, confirm.
- (c) `supplier_name: null` by honest absence — add if vendor expanded in
  real response.
- (d) `page/per_page` pagination — sync engine.

---

## stripe_transactions

Stripe `/v1/balance_transactions`.

- ⚠️ **FUNCIONALMENTE EQUIVALENTE** a `src/lib/normalizers/stripe.js`
  (verificado por ejecución contra 7 fixtures reales + edge cases). NO
  byte-verbatim: en Deno los helpers (`KNOWN_TYPES`, `toNum`, `mapType`)
  viven DENTRO del arrow function como método de objeto-literal; el
  módulo src los declara a top-level. Divergencia estructural-arquitectural,
  no drift accidental.

**Contrato (D1–D5):**
- One row per `balance_transaction` (NO grouping).
- `type` whitelisted from `reporting_category`
  (`charge | refund | dispute | payout | transfer | stripe_fee |
  application_fee | adjustment`); unknown → `null`.
  `application_fee_refund` collapses to `application_fee` (sign of
  `amount` indicates the refund).
- `refund` preserves its native sign (negative) — el cerebro suma con
  signo.
- `dispute` propagates `amount + fee` from Stripe (~15€).
- Multi-currency preserved per row, ZERO FX conversion.
- `application_fee` NOT mixed with processing fee (separate type).
- Cents → `/100`, UNIX seconds → ISO, currency lowercase → uppercase.
- Rows without `id` discarded. Standard defensiveness (`toNum`, null-safe).

Pagination (`has_more` / `starting_after`) is the sync engine's job.

---

## Generic legacy normalizers (smoke-test only)

### transactions
Generic shape used ONLY by `demo_provider` for end-to-end engine smoke
testing. Real providers each have their own dedicated normalizer above.
Do not extend.

### shipments
Generic shape used ONLY by `demo_apikey_provider` and
`demo_basicauth_provider` for end-to-end engine smoke testing of api_key
and basic_auth paths. Do not extend.

---

## Conventions across all normalizers

These rules hold globally and are NOT repeated per normalizer:

- **Defensive numeric parse** (`toNum`): handles `null` / `undefined` /
  `""` / strings / numbers → number with fallback.
- **Skip rows without external_id anchor**: a row without `id` (or its
  provider-specific equivalent) cannot be deduped on resync, so it's
  dropped silently. NEVER `throw` on individual row issues — partial
  ingest is preferable to a hard failure on a single malformed record.
- **Honest absence**: when a field genuinely doesn't exist in the API
  payload (e.g. PayPlug `fee`, BigCommerce per-transaction `fee`),
  emit `0` or `null` — NEVER invent a synthetic value.
- **Sign normalization vs preservation**: documented per normalizer.
  PayPal fees normalized to positive; Stripe refunds preserved native
  negative; Klarna FEE/FEE_REFUND netted with signed sum.
- **Whitelist over passthrough** for enumerated fields (status, type):
  unknown values → `null`, not raw passthrough. Prevents downstream
  consumers from seeing garbage states.
- **Currency fallback to `"EUR"`** when absent, EXCEPT `quickbooks_bills`
  which falls back to `"USD"` (US-centric provider).
- **`direction: "expense"`** marks supplier-side accounting rows;
  customer-side (revenue) rows OMIT the field. Asymmetric on purpose —
  the brain reads it.