// Behaviour tests for who may originate a provider negotiation.
//
// The invariant under test: a machine can continue what a human started, and
// can never start anything itself. Every case executes the real decision
// function.
import { describe, expect, it } from "vitest";
import {
  collectiveOutboundEnabled,
  resolveLaunchAuthority,
} from "../../base44/shared/negotiationLaunchAuthority.ts";

const human = { isAdmin: true, isInternal: false, email: "founder@cambra.global" };
const machine = { isAdmin: false, isInternal: true, email: null };
const anonymous = { isAdmin: false, isInternal: false, email: null };

describe("launch — only a human can originate outbound contact", () => {
  it("allows a human admin to launch and records who did it", () => {
    expect(resolveLaunchAuthority({ mode: "launch", actor: human })).toEqual({
      ok: true,
      mode: "launch",
      launched_by: "founder@cambra.global",
    });
  });

  it("refuses a scheduled worker holding the internal secret", () => {
    const decision = resolveLaunchAuthority({ mode: "launch", actor: machine });
    expect(decision.ok).toBe(false);
    expect(decision.error).toBe("human_launch_authorization_required");
    expect(decision.status).toBe(403);
  });

  it("refuses an anonymous caller", () => {
    expect(resolveLaunchAuthority({ mode: "launch", actor: anonymous }).ok).toBe(false);
  });

  it("refuses an admin session with no identity — an unattributable launch is not an authorization", () => {
    const decision = resolveLaunchAuthority({
      mode: "launch",
      actor: { isAdmin: true, email: "" },
    });
    expect(decision.ok).toBe(false);
    expect(decision.error).toBe("launch_actor_identity_required");
  });

  it("normalizes the recorded identity", () => {
    const decision = resolveLaunchAuthority({
      mode: "launch",
      actor: { isAdmin: true, email: "  Founder@CAMBRA.Global  " },
    });
    expect(decision.launched_by).toBe("founder@cambra.global");
  });
});

describe("mode is mandatory — never defaulted", () => {
  it.each([undefined, null, "", "start", "initial_contact", 1, {}])(
    "refuses mode %p rather than assuming one",
    (mode) => {
      const decision = resolveLaunchAuthority({ mode, actor: human });
      expect(decision.ok).toBe(false);
      expect(decision.error).toBe("launch_mode_required");
    },
  );
});

describe("resume — continue what a human already launched", () => {
  const launchedCase = {
    id: "case_1",
    status: "awaiting_provider",
    launched_by: "founder@cambra.global",
  };

  it("lets a worker resume a human-launched case", () => {
    expect(
      resolveLaunchAuthority({ mode: "resume", actor: machine, existingCase: launchedCase }),
    ).toEqual({
      ok: true,
      mode: "resume",
      launched_by: "founder@cambra.global",
      case_id: "case_1",
    });
  });

  it("blocks the back door: resuming a case no human ever launched", () => {
    const decision = resolveLaunchAuthority({
      mode: "resume",
      actor: machine,
      existingCase: { id: "case_2", status: "ready", launched_by: null },
    });
    expect(decision.ok).toBe(false);
    expect(decision.error).toBe("case_was_never_human_launched");
  });

  it("refuses resume with no case and no carried attribution", () => {
    const decision = resolveLaunchAuthority({ mode: "resume", actor: machine });
    expect(decision.ok).toBe(false);
    expect(decision.error).toBe("resume_requires_launch_attribution");
  });

  // A launch can die before the case exists: provider contact resolution runs
  // first and, when it finds no address, opens a MerchantInformationRequest and
  // stops. The retry therefore has no case to inspect — only the attribution
  // stamped into that request when the human launched.
  it("allows the retry of a launch that died before the case existed", () => {
    const decision = resolveLaunchAuthority({
      mode: "resume",
      actor: machine,
      existingCase: null,
      carriedLaunchedBy: "founder@cambra.global",
    });
    expect(decision).toEqual({
      ok: true,
      mode: "resume",
      launched_by: "founder@cambra.global",
      case_id: "",
    });
  });

  it("a worker cannot invent an attribution out of an empty string", () => {
    for (const carried of [null, undefined, "", "   "]) {
      const decision = resolveLaunchAuthority({
        mode: "resume",
        actor: machine,
        carriedLaunchedBy: carried,
      });
      expect(decision.ok).toBe(false);
    }
  });

  it("a terminal case is refused even with a carried attribution", () => {
    const decision = resolveLaunchAuthority({
      mode: "resume",
      actor: machine,
      existingCase: { ...launchedCase, status: "closed" },
      carriedLaunchedBy: "founder@cambra.global",
    });
    expect(decision.ok).toBe(false);
    expect(decision.error).toBe("case_is_terminal");
  });

  it.each(["closed", "rejected", "expired", "CLOSED"])(
    "refuses to resume a %s case",
    (status) => {
      const decision = resolveLaunchAuthority({
        mode: "resume",
        actor: machine,
        existingCase: { ...launchedCase, status },
      });
      expect(decision.ok).toBe(false);
      expect(decision.error).toBe("case_is_terminal");
    },
  );

  it("refuses an anonymous resume", () => {
    expect(
      resolveLaunchAuthority({ mode: "resume", actor: anonymous, existingCase: launchedCase }).ok,
    ).toBe(false);
  });
});

describe("no path lets a machine originate contact", () => {
  it("exhaustively: every machine/anonymous combination either resumes or fails", () => {
    const cases = [
      { id: "c", status: "ready", launched_by: null },
      { id: "c", status: "ready", launched_by: "founder@cambra.global" },
      null,
    ];
    for (const actor of [machine, anonymous]) {
      for (const mode of ["launch", "resume", "", undefined]) {
        for (const existingCase of cases) {
          for (const carriedLaunchedBy of [null, "", "founder@cambra.global"]) {
            const decision = resolveLaunchAuthority({
              mode,
              actor,
              existingCase,
              carriedLaunchedBy,
            });
            if (decision.ok) {
              // The only permitted success for a non-human is a resume, and it
              // must be backed by a human launcher — on the case or carried
              // forward from the launch that created the retry request.
              expect(decision.mode).toBe("resume");
              expect(decision.launched_by).toBeTruthy();
              expect(
                Boolean(existingCase?.launched_by) || Boolean(carriedLaunchedBy),
              ).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("collective outbound is fail-closed", () => {
  const env = (value) => ({ get: () => value });

  it("is disabled when the variable is absent", () => {
    expect(collectiveOutboundEnabled(env(undefined))).toBe(false);
    expect(collectiveOutboundEnabled({})).toBe(false);
  });

  it.each(["false", "0", "no", "", "  ", "disabled", "yes"])(
    "stays disabled for %p",
    (value) => {
      expect(collectiveOutboundEnabled(env(value))).toBe(false);
    },
  );

  it.each(["true", "1", "enabled", "TRUE", " Enabled "])(
    "is enabled only for the explicit opt-in %p",
    (value) => {
      expect(collectiveOutboundEnabled(env(value))).toBe(true);
    },
  );
});
