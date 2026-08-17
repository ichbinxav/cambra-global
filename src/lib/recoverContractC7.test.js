// DASHBOARD-C7 (2026-08-17) — the governed Contract handler.
//
// This replaces the highest-severity page defect C0 found: a generic entity update
// on Contract taking the ENTIRE browser form object, with no validation, no field
// allowlist and no receipt. Whatever the form held became the contract.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  applyContractEdit, checkContractEdit, EDITABLE_FIELDS,
  previewContractEdit, PROTECTED_FIELDS,
} from "../../base44/shared/recoverContractCore.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      get rows() { return stores[name]; },
      async get(id) { if (broken.includes(name)) throw new Error("down"); const r = stores[name].find((x) => String(x.id) === String(id)); return r ? { ...r } : null; },
      async updateMany(q, patch) {
        const m = stores[name].filter((r) => Object.entries(q).every(([k, v]) => String(r[k]) === String(v)));
        for (const r of m) Object.assign(r, patch);
        return { matched_count: m.length, modified_count: m.length };
      },
    };
    return built[name];
  };
  return { stores, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const CONTRACT = {
  id: "c1", user_email: "merchant@acme.example", deal_name: "Acme payments",
  provider: "Stripe", category: "payments", status: "active",
  node_revenue_pct: 20, estimated_savings_annual: 40000,
  deal_activation_id: "d1", start_date: "2026-01-01", end_date: "2027-01-01",
};

describe("C7 — the field allowlist is the point", () => {
  it("allows only correctable metadata", () => {
    expect([...EDITABLE_FIELDS]).toEqual(["deal_name", "provider", "category", "start_date", "end_date"]);
  });

  it("protects every field that binds a party, a case or economics — with a stated reason", () => {
    for (const field of ["user_email", "deal_activation_id", "node_revenue_pct", "estimated_savings_annual", "status", "activity_log"]) {
      expect(PROTECTED_FIELDS[field], field).toBeTruthy();
      expect(PROTECTED_FIELDS[field].length, field).toBeGreaterThan(20);
    }
  });

  it("refuses a patch touching CAMBRA economics", () => {
    const out = checkContractEdit({ contract: CONTRACT, patch: { node_revenue_pct: 5 }, reason: "x" });
    expect(out.allowed).toBe(false);
    expect(out.blockers).toContain("protected_field:node_revenue_pct");
  });

  it("refuses re-partying the agreement", () => {
    expect(checkContractEdit({ contract: CONTRACT, patch: { user_email: "someone@else.example" }, reason: "x" }).blockers)
      .toContain("protected_field:user_email");
  });

  it("refuses a lifecycle move disguised as a field edit", () => {
    expect(checkContractEdit({ contract: CONTRACT, patch: { status: "terminated" }, reason: "x" }).blockers)
      .toContain("protected_field:status");
  });

  it("refuses an unknown key rather than ignoring it", () => {
    // The browser used to send the whole form, so an unrecognised key IS the old defect.
    expect(checkContractEdit({ contract: CONTRACT, patch: { some_new_field: 1 }, reason: "x" }).blockers)
      .toContain("field_not_editable:some_new_field");
  });

  it("refuses a mixed patch ENTIRELY rather than partially applying it", async () => {
    const svc = makeSvc({ Contract: [CONTRACT] });
    const p = await previewContractEdit({
      svc, contract_id: "c1", patch: { deal_name: "New name", node_revenue_pct: 5 }, reason: "cleanup", sha256,
    });
    expect(p.preview.allowed).toBe(false);
    const out = await applyContractEdit({
      svc, actor: "f", contract_id: "c1", patch: { deal_name: "New name", node_revenue_pct: 5 },
      reason: "cleanup", expected_preview_hash: p.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(false);
    // Silently dropping the forbidden key and writing the rest would let a caller
    // believe the whole change landed.
    expect(svc.stores.Contract[0].deal_name).toBe("Acme payments");
    expect(svc.stores.Contract[0].node_revenue_pct).toBe(20);
  });

  it("names why each protected field was refused", async () => {
    const p = await previewContractEdit({
      svc: makeSvc({ Contract: [CONTRACT] }), contract_id: "c1",
      patch: { node_revenue_pct: 5 }, reason: "x", sha256,
    });
    expect(p.preview.protected_fields_refused[0].field).toBe("node_revenue_pct");
    expect(p.preview.protected_fields_refused[0].why).toContain("what CAMBRA charges");
  });
});

describe("C7 — a correction requires a reason and records it", () => {
  it("refuses without a reason", () => {
    expect(checkContractEdit({ contract: CONTRACT, patch: { deal_name: "X" } }).blockers)
      .toContain("reason_required");
  });

  it("refuses a no-op", () => {
    expect(checkContractEdit({ contract: CONTRACT, patch: { deal_name: "Acme payments" }, reason: "x" }).blockers)
      .toContain("no_effective_change");
  });

  it("applies and appends to the contract's own activity log", async () => {
    const svc = makeSvc({ Contract: [CONTRACT] });
    const p = await previewContractEdit({ svc, contract_id: "c1", patch: { provider: "Adyen" }, reason: "provider renamed", sha256 });
    const out = await applyContractEdit({
      svc, actor: "founder@cambra.global", contract_id: "c1", patch: { provider: "Adyen" },
      reason: "provider renamed", expected_preview_hash: p.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(true);
    expect(out.fields_changed).toEqual(["provider"]);
    const row = svc.stores.Contract[0];
    expect(row.provider).toBe("Adyen");
    const entry = row.activity_log[row.activity_log.length - 1];
    expect(entry.action).toBe("metadata_corrected");
    expect(entry.by).toBe("founder@cambra.global");
    expect(entry.reason).toBe("provider renamed");
    // Nothing contractual changed and no document was issued.
    expect(out.issues_document).toBe(false);
    expect(row.status).toBe("active");
    expect(row.node_revenue_pct).toBe(20);
  });

  it("states that a correction is not a contractual act", async () => {
    const p = await previewContractEdit({
      svc: makeSvc({ Contract: [CONTRACT] }), contract_id: "c1",
      patch: { deal_name: "Acme payments v2" }, reason: "typo", sha256,
    });
    expect(p.preview.claim_boundary).toContain("does not change contractual terms");
    expect(p.preview.claim_boundary).toContain("issues no document");
  });
});

describe("C7 — concurrency and readability", () => {
  it("refuses when the field changed under it", async () => {
    const svc = makeSvc({ Contract: [CONTRACT] });
    const p = await previewContractEdit({ svc, contract_id: "c1", patch: { provider: "Adyen" }, reason: "x", sha256 });
    svc.stores.Contract[0].provider = "Checkout";
    const out = await applyContractEdit({
      svc, actor: "f", contract_id: "c1", patch: { provider: "Adyen" },
      reason: "x", expected_preview_hash: p.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("preview_hash_mismatch");
    expect(svc.stores.Contract[0].provider).toBe("Checkout");
  });

  it("reports an unreadable contract rather than assuming absence", async () => {
    const out = await previewContractEdit({
      svc: makeSvc({ Contract: [CONTRACT] }, ["Contract"]), contract_id: "c1",
      patch: { provider: "X" }, reason: "y", sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("contract_unreadable");
  });
});

describe("C7 — the page no longer writes the entity directly", () => {
  it("AdminContracts contains no generic Contract write", () => {
    const source = fs.readFileSync("src/pages/admin/AdminContracts.jsx", "utf8");
    expect(source).not.toMatch(/base44\.entities\.Contract\.(update|create|delete)\(/);
  });

  it("AdminContracts routes corrections through the governed handler", () => {
    const source = fs.readFileSync("src/pages/admin/AdminContracts.jsx", "utf8");
    expect(source).toContain("preview_contract_edit");
    expect(source).toContain("apply_contract_edit");
    // The form sends only allowlisted fields, never the whole object.
    expect(source).toContain("EDITABLE_CONTRACT_FIELDS");
  });

  it("the page field list matches the handler allowlist exactly", () => {
    const source = fs.readFileSync("src/pages/admin/AdminContracts.jsx", "utf8");
    const match = /const EDITABLE_CONTRACT_FIELDS = \[([^\]]+)\]/.exec(source);
    const pageFields = match[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
    // A form offering a field the handler refuses would fail at apply time with no
    // explanation the operator could act on.
    expect(pageFields).toEqual([...EDITABLE_FIELDS]);
  });
});
