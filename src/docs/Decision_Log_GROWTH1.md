# Decision Log — GROWTH-1 (2026-08-01)

Viral loop: shareable scorecard, collective-framed invites, and time-to-value
instrumentation. No engine change, no pricing change, no new PII.

## T1 — Shareable scorecard

- Card rendered **client-side on canvas** (1080×1080), brand tokens verbatim
  (`--voltio` #5B4CF5, `--voltio-2` #8B7BFF, `--cian` #39C6F0, Space Grotesk).
  No server render, no image storage, no extra credits.
- **Privacy contract (sealed):** the card shows ONLY the efficiency score,
  the possible fee-reduction %, the CAMBRA brand, and — only when the user
  explicitly toggles it — the business name. It NEVER shows savings in euros,
  monthly sales, the current provider, or the effective rate.
  Rationale: € savings + % ⇒ derivable sales volume. Voluntary sharing does
  not make that acceptable.
- **Mandatory preview** before anything leaves the device: the previewed PNG
  IS the shared bytes. Re-renders when the name toggle changes.
- Share path: Web Share API with the PNG file (mobile → WhatsApp/IG/LinkedIn
  native). Desktop fallback: download image + copy suggested text.
- Reduction % derived from figures already in the allowlisted payload
  (point monthly savings ÷ current monthly fees). No new field crosses the wire.
- Score reuses `computePaymentsScore` — same single source of truth as the
  report hero. Score unavailable → the card falls back to reduction-hero mode.

## T2 — Referral / invite

- New entity `ReferralLink` (code, owner_email, times_used). One row per owner,
  find-or-create in `getMyReferralLink` (service role).
- **Code is an opaque random token** (10 chars, crypto RNG), deliberately NOT
  derived from email or record id — a leaked code reveals nothing about its owner.
- `PaymentsAnalysisSession.referred_by_code` persists the `?ref=` code ONLY when
  it matches an existing ReferralLink. Unknown/malformed codes drop silently —
  a mistyped invite link must never break a submit.
- `times_used` incremented best-effort on match. **No reward mechanics in this
  chunk, by design:** first observe whether people invite at all, then design
  the incentive with data instead of guessing.
- Frame is the incentive: "the more businesses join, the better we negotiate."
- Anonymous readers are routed to signup — a ReferralLink needs an owner.
- Code captured on Analyzer mount into sessionStorage so it survives in-page
  navigation before submit.

## T3 — Time-to-value instrumentation

- `PaymentsAnalysisSession.time_to_result_ms` — client-measured ms from Analyzer
  mount to the submit request. Bounded server-side to 0..1,800,000 (30 min);
  out-of-range drops silently. No PII, no new identifier.
- **Semantics caveat:** this measures the FORM-FILLING portion only. Rendering
  the result adds submit latency + redirect + teaser read on top.

## Leak audit (verified, not assumed)

`getPaymentsGapTeaser` uses a hard field-by-name allowlist. Confirmed on a live
session carrying both new fields: `referred_by_code`, `time_to_result_ms` and
`contact_email` are **all absent** from the teaser response. Neither new field
is an engine input, so neither can drift a calculation.

## Baseline measurements (9 real submits + 1 teaser read, 2026-08-01)

Server latency, `submitPaymentsAnalysis`, all 200/ok:

| Mode      | Runs (ms)        | Median |
|-----------|------------------|--------|
| online    | 1090 · 557 · 656 | 656    |
| in-store  | 693 · 611 · 831  | 693    |
| combined  | 701 · 667 · 618  | 667    |

`getPaymentsGapTeaser` read: **539 ms**.

Combined mode runs two engine passes yet costs no more than single-channel —
the cost is dominated by round-trip + persistence, not the arithmetic. The
first online run (1090 ms) is cold start.

**Server-side time-to-result ≈ 1.2 s** (submit + teaser read). Anything above
that in the observed `time_to_result_ms` is the human filling the form — which
is where funnel optimization should focus, not the backend.

All 9 QA sessions were purged and the QA referral counter reset to 0.