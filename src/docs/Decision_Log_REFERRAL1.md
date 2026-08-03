# Decision Log — REFERRAL-1 (2026-08-03)

Activation of the referral programme: legal text, merchant-facing page, entry points.

## Programme, as declared
- Standard success fee: **25%** of verified savings (Terms §7).
- Each **activated referral**: **−5 points**, no limit on how many.
- Referred business enters at **20%** (single-step entry reduction).
- **Floor: 5%.** Never lower.
- Trigger: verified **and activated** savings — same standard as Terms §7(c).
  Signup / analysis / link click never count.

## Decisions
1. **Two separate counters.** `ReferralLink.times_used` (already written by
   `submitPaymentsAnalysis` for any `?ref=` analysis) is *measurement*, not a
   discount trigger. A new field `ReferralLink.activated_count` is the
   contractual counter and is the ONLY input to the fee shown. They are never
   conflated in code or in UI copy.
2. **Fee derived, never stored.** `src/lib/referralProgram.js` owns
   `feeForActivated()` / `nextFeePct()`. The backend returns raw counts only.
   Invoicing automation is explicitly OUT OF SCOPE (separate chunk).
3. **New backend function `getMyReferralStatus`** instead of extending
   `getMyReferralLink` (that one is consumed by ShareResultButton +
   InviteCollectiveBlock; its response shape stays untouched). Find-or-create
   mirrors it so /Referrals always has a link.
4. **Third-party data never leaves the tenant.** The endpoint returns only the
   caller's code + two aggregate integers. No referred-business names, emails,
   sales or savings anywhere in the payload or the page. Verified by
   inspection of `getMyReferralStatus/entry.ts` (allowlisted response literal).
5. **Share UI reuse.** `ShareResultButton` was NOT reused on /Referrals: it
   renders an audit result card (score + reduction %) and requires an
   engine_result, which /Referrals does not have. The invite surface here is
   the copy-link control (same pattern as `InviteCollectiveBlock`), so no
   logic was duplicated.
6. **Terms:** new **§8 "Referral discount programme"**; former §8–15 renumbered
   §9–16 in EN/FR/ES. §9 (provider program, formerly §8) unchanged in
   substance. Covers: mechanism, definition of activated referral, permanence
   even if the referred business later terminates, non-retroactivity
   (month following activation), non-cumulation with other discounts, and the
   explicit **no cash consideration / no agent-broker-introducer** statement.
7. **Cookies DID need updating.** Code check (`src/pages/PaymentsAnalyzer.jsx`,
   mount effect): the code is written to
   `sessionStorage.setItem("cambra_ref_code", ref)` so it survives navigation
   before submit. A `cambra_ref_code` row was therefore added to the
   sessionStorage table of the Cookie Policy (EN/FR/ES), category *strictly
   necessary*, plus a matching disclosure in Privacy §2.

## Out of scope
Fee engine in invoicing · agent programme · Certified Partners · Terms §9
(provider program).