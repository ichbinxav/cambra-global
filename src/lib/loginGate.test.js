import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// P0.4 — Static test: LoginGate must NOT render two buttons that call the
// same handler (which would be a visual-only distinction). Base44 exposes
// one combined auth flow (redirectToLogin), so the gate must show ONE
// honest CTA + supporting text.

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");
const LOGIN_GATE_FILE = path.join(REPO_ROOT, "src/pages/LoginGate.jsx");

function readLoginGate() {
  return fs.readFileSync(LOGIN_GATE_FILE, "utf-8");
}

describe("LoginGate single CTA (P0.4)", () => {
  const src = readLoginGate();

  it("does not use two separate auth button labels (login_gate_create / login_gate_signin)", () => {
    expect(src).not.toContain("login_gate_create");
    expect(src).not.toContain("login_gate_signin");
  });

  it("uses the combined login_gate_continue CTA", () => {
    expect(src).toContain("login_gate_continue");
  });

  it("has supporting text explaining the next screen (login_gate_continue_sub)", () => {
    expect(src).toContain("login_gate_continue_sub");
  });

  it("calls base44.auth.redirectToLogin (the only available auth method)", () => {
    expect(src).toContain("redirectToLogin");
  });

  it("preserves open-redirect protection (safeReturnUrl)", () => {
    expect(src).toContain("safeReturnUrl");
  });

  // Count the number of onClick={handleContinue} occurrences — should be
  // exactly 1 (one button), not 2 (two buttons doing the same thing).
  it("has exactly one primary button calling handleContinue", () => {
    const matches = src.match(/onClick=\{handleContinue\}/g) || [];
    expect(matches.length).toBe(1);
  });
});