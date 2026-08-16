import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FOUNDER_MEETING_POLICY,
  aiSensitiveIdentityReply,
  buildFounderMeetingBrief,
  evaluateFounderMeetingEscalation,
  founderMeetingCapacityDecision,
  normalizeFounderMeetingPolicy,
  normalizeMeetingOutcome,
  parseFounderMeetingCommand,
} from "../../base44/shared/founderMeeting.ts";
import { communicationQuality } from "../../base44/shared/commercialAutonomy.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("human commercial communication and Founder meeting policy", () => {
  it("prioritizes a qualified direct Founder request but remains recommend-only by default", () => {
    const result = evaluateFounderMeetingEscalation({ explicit_request:true, qualified_counterparty:true, relationship_type:"merchant", meeting_type:"MERCHANT_SALES_CALL", p10_allowed:true, p11_allowed:true });
    expect(result.recommended).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.action).toBe("RECOMMEND_ONLY");
    expect(result.reasons).toContain("qualified_counterparty_requested_founder");
  });

  it("does not spend Founder time on low-value routine stalls", () => {
    const result = evaluateFounderMeetingEscalation({ qualified_counterparty:true, relationship_type:"merchant", meeting_type:"MERCHANT_SALES_CALL", expected_value_minor:1000, substantive_rounds:2, p10_allowed:true, p11_allowed:true });
    expect(result.recommended).toBe(false);
    expect(result.blockers).toContain("escalation_score_below_threshold");
    expect(result.blockers).toContain("expected_value_below_threshold");
  });

  it("never lets meeting policy bypass regulatory or legal blocks", () => {
    const result = evaluateFounderMeetingEscalation({ explicit_request:true, qualified_counterparty:true, relationship_type:"provider", meeting_type:"PROVIDER_NEGOTIATION_CALL", p10_allowed:false, p11_allowed:true });
    expect(result.recommended).toBe(false);
    expect(result.blockers).toContain("p10_blocked");
  });

  it("requires an explicit auto-book switch in addition to the mode", () => {
    const policy = normalizeFounderMeetingPolicy({ mode:"AUTO_BOOK_WITHIN_POLICY", auto_book_allowed:false, status:"active" });
    const result = evaluateFounderMeetingEscalation({ explicit_request:true, qualified_counterparty:true, relationship_type:"partner", meeting_type:"PARTNERSHIP_CALL", p10_allowed:true, p11_allowed:true }, policy);
    expect(result.action).toBe("RECOMMEND_ONLY");
  });

  it("rejects invalid Founder calendar windows", () => {
    expect(() => normalizeFounderMeetingPolicy({ preferred_start_hour:17, preferred_end_hour:9 })).toThrow("invalid_founder_meeting_hours");
  });

  it("enforces daily and weekly Founder-time capacity", () => {
    const now = new Date("2026-08-11T10:00:00.000Z");
    const policy = { ...DEFAULT_FOUNDER_MEETING_POLICY, daily_meeting_cap:1, weekly_meeting_cap:2 };
    const capacity = founderMeetingCapacityDecision(policy, [{ meeting_start_at:"2026-08-11T12:00:00.000Z", meeting_status:"booked" }], now);
    expect(capacity.allowed).toBe(false);
    expect(capacity.blockers).toContain("daily_founder_meeting_cap_reached");
  });

  it("translates supported natural-language controls into deterministic policy patches", () => {
    expect(parseFounderMeetingCommand("Esta semana no quiero más de 3 meetings").patch.weekly_meeting_cap).toBe(3);
    expect(parseFounderMeetingCommand("Quiero revisar yo las reuniones antes de confirmarlas").patch.mode).toBe("PROPOSE");
    const auto = parseFounderMeetingCommand("Puedes agendarme directamente providers estratégicos");
    expect(auto.patch.mode).toBe("AUTO_BOOK_WITHIN_POLICY");
    expect(auto.patch.auto_book_allowed).toBe(true);
    expect(parseFounderMeetingCommand("hazlo mejor").ok).toBe(false);
  });

  it("answers AI and Xavi identity questions truthfully in EN, FR and ES", () => {
    expect(aiSensitiveIdentityReply("Are you Xavi?", "en")).toContain("I am not Xavi");
    expect(aiSensitiveIdentityReply("¿Eres un bot?", "es")).toContain("No soy Xavi");
    expect(aiSensitiveIdentityReply("Est-ce une IA ?", "fr")).toContain("Je ne suis pas Xavi");
    expect(aiSensitiveIdentityReply("Can you send the price list?", "en")).toBeNull();
  });

  it("keeps discussed, agreed, proposed and approval-required meeting facts separate", () => {
    const outcome = normalizeMeetingOutcome({ outcome:"WAITING_APPROVAL", discussed:["12-month term"], agreed:["send revised proposal"], proposed:["exclusive terms"], requires_approval:["exclusivity"] });
    expect(outcome.discussed).toEqual(["12-month term"]);
    expect(outcome.agreed).toEqual(["send revised proposal"]);
    expect(outcome.proposed).toEqual(["exclusive terms"]);
    expect(outcome.requires_approval).toEqual(["exclusivity"]);
  });

  it("builds the Founder brief from evidence without inventing missing facts", () => {
    const brief = buildFounderMeetingBrief({ counterparty_name:"Ana", summary:"Asked about migration risk", market_jurisdiction:"ES" }, {});
    expect(brief.person.name).toBe("Ana");
    expect(brief.company.description).toBe("");
    expect(brief.economics.expected_cambra_value_minor).toBe(0);
    expect(brief.evidence_only).toBe(true);
  });

  it("rejects AI clichés, fake familiarity, fake urgency and near-clone replies", () => {
    expect(communicationQuality("Absolutely! Great question.").ok).toBe(false);
    expect(communicationQuality("We've been following your brand for years.").reasons).toContain("generic_llm_phrase");
    expect(communicationQuality("Act now. This limited time offer expires today.").reasons).toContain("unsupported_urgency_pattern");
    const clone = "The revised pricing is clear. Please send the final written terms for review.";
    expect(communicationQuality(clone, { previous_outbound:[clone] }).reasons).toContain("near_duplicate_message");
  });

  it("uses the existing thread, Inbox, Outlook and central sender instead of parallel systems", () => {
    const reply = read("base44/functions/commercialReplyAgent/entry.ts");
    const calendar = read("base44/functions/outlookMeetingCoordinator/entry.ts");
    const post = read("base44/functions/postMeetingWorker/entry.ts");
    const compatibility = read("base44/functions/meetingAgent/entry.ts");
    expect(reply).toContain("action_type:'schedule_founder_meeting'");
    expect(calendar).toContain("FounderMeetingPolicy");
    expect(calendar).toContain("calendar event details are never exposed");
    expect(post).toContain("meeting_outcome_json");
    expect(post).not.toContain("CommunicationThread.create");
    expect(post).toContain("commercialSendMessage");
    expect(compatibility).toContain("outlookMeetingCoordinator");
    expect(compatibility).not.toContain("api.cal.com");
  });

  it("forces legacy outreach and follow-up through the central commercial sender", () => {
    for (const file of ["base44/functions/outreachAgent/entry.ts", "base44/functions/followUpAgent/entry.ts"]) {
      const source = read(file);
      expect(source).toContain("commercialSendMessage");
      expect(source).toContain("communication_thread_id");
      expect(source).toContain("sending_profile_resolution_status: 'REVIEW_REQUIRED'");
      expect(source).toContain("legacy_thread_has_no_deterministic_profile_evidence");
      expect(source).not.toContain("api.resend.com/emails");
      expect(source).not.toContain("api.instantly.ai");
      expect(source).not.toContain("paidProviderFetch");
    }
    const central = read("base44/functions/commercialSendMessage/entry.ts");
    expect(central).toContain("admin_or_approved_internal_manual_override_required");
    expect(central).toMatch(/approvedOverride\?\.status\s*!==\s*["']approved["']/);
    expect(central).toContain("approvalBoundToThread(approvedOverride, thread)");
    expect(central).toMatch(/manual_override_approval_id:\s*approvedOverride\?\.id\s*\|\|\s*null/);
    expect(central).toContain("approved_send_profile_required");
  });

  it("contains no invented public testimonial identities or synthetic outcomes", () => {
    const page = read("src/pages/Testimonials.jsx");
    const carousel = read("src/components/landing/TestimonialsCarousel.jsx");
    const partner = read("base44/functions/autonomousPartnerWorker/entry.ts");
    for (const source of [page, carousel]) {
      expect(source).not.toContain("Camille Laurent");
      expect(source).not.toContain("Maison Épice");
      expect(source).not.toContain("€22K");
    }
    expect(partner).toContain("Never claim the founder personally wrote or sent it");
    expect(partner).not.toContain("from Xavi M. Contero");
  });

  it("excludes anonymous and unverified waitlist estimates from economic totals", () => {
    const aggregate = read("base44/functions/getWaitlistAggregate/entry.ts");
    const panel = read("src/components/admin/waitlist/AggregateDemandPanel.jsx");
    expect(aggregate).toContain("isVerifiedEconomicEvidence");
    expect(aggregate).toContain("result.was_anonymous === true");
    expect(aggregate).toContain("result.verification_status !== 'verified'");
    expect(aggregate.indexOf("if (!isVerifiedEconomicEvidence(result))")).toBeLessThan(aggregate.indexOf("combined_savings +="));
    expect(aggregate).toContain("verified_only_unverified_excluded");
    expect(panel).toContain("Verified-only totals");
    expect(panel).not.toContain("Combined negotiation ammunition");
  });

  it("guards every GO-critical external-effect scheduler against duplicate slots", () => {
    const critical = [
      "processWebhookDeadLetters",
      "eclLifecycleScheduler",
      "reconcileRecoverBilling",
      "autonomousPartnerWorker",
      "postMeetingWorker",
    ];
    for (const worker of critical) {
      expect(read(`base44/functions/${worker}/entry.ts`)).toContain("claimSchedulerRun");
      expect(read("base44/shared/schedulerRun.ts")).toMatch(
        new RegExp(`worker_key\\s*:\\s*["']${worker}["']`),
      );
    }
    const goLive = read("base44/functions/goLiveControlAdmin/entry.ts");
    expect(goLive).toContain("nativeScheduledWorkerKeys");
    expect(goLive).toContain("do not double-count");
  });

  it("renders one automatic/manual language dropdown rather than three navbar buttons", () => {
    const switcher = read("src/components/shared/LanguageSwitcher.jsx");
    const i18n = read("src/lib/i18n.jsx");
    expect(switcher).toContain("<select");
    expect(switcher).toContain('value="auto"');
    expect(switcher).not.toContain("aria-pressed");
    expect(i18n).toContain("detectBrowserLang");
    expect(i18n).toContain("setAutoLang");
  });
});
