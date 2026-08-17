// DASHBOARD-C11 (2026-08-17) — the governed Provider registry.
//
// The navigation registry flagged AdminProviders.jsx HIGHEST SEVERITY because it set
// `revenue_share_pct` — provider compensation — from a browser form via generic CRUD.
//
// What C11 verified sharpens that in both directions. No production code reads the field:
// the real rate is ProviderRevenueLedger.rate_bps, bound to an agreement_id and an
// agreement_terms_hash. So it is not biasing anything today. But an unbound duplicate of a
// governed number, editable from an admin page, is a shadow rate waiting for the first
// aggregator that picks it up — and whichever of the two that aggregator reads becomes
// provider economics.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyProviderWrite, PROVIDER_API_STATUSES, PROVIDER_CATEGORIES, PROVIDER_EDITABLE_FIELDS,
  PROVIDER_PROTECTED_FIELDS, previewProviderWrite, readProviderCompensation,
} from "../../base44/shared/providerRegistryCore.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (value) => `h:${JSON.stringify(value).length}`;

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {}; const writes = [];
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      async filter(where) {
        if (broken.includes(name)) throw new Error("down");
        return stores[name].filter((r) => Object.entries(where || {}).every(([k, v]) => r[k] === v)).map((r) => ({ ...r }));
      },
      async create(row) {
        if (broken.includes(`${name}:create`)) throw new Error("refused");
        const created = { id: `${name.toLowerCase()}-${stores[name].length + 1}`, ...row };
        stores[name].push(created); writes.push({ op: "create", entity: name, row: created });
        return created;
      },
      async update(id, patch) {
        if (broken.includes(`${name}:update`)) throw new Error("refused");
        const row = stores[name].find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        writes.push({ op: "update", entity: name, id, patch });
        return row;
      },
    };
    return built[name];
  };
  return { stores, writes, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const provider = (extra = {}) => ({
  id: "prov-1", name: "SumUp", category: "payments", contact_email: "ops@sumup.test",
  account_manager: "Ana", api_status: "connected", contract_type: "standard",
  revenue_share_pct: 15, notes: "", ...extra,
});

describe("C11 — provider compensation cannot be set from a form", () => {
  it("does not list revenue_share_pct as editable", () => {
    expect([...PROVIDER_EDITABLE_FIELDS]).not.toContain("revenue_share_pct");
  });

  it("refuses a patch containing it, and names the authoritative field", async () => {
    const out = await previewProviderWrite({
      svc: makeSvc({ Provider: [provider()] }), provider_id: "prov-1",
      patch: { name: "SumUp", revenue_share_pct: 25 }, sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("protected_field_in_patch");
    expect(out.reason).toContain("agreement_terms_hash");
    expect(out.reason).toContain("shadow rate");
  });

  it("refuses the bps variant too, so the unit is not a loophole", async () => {
    const out = await previewProviderWrite({
      svc: makeSvc({ Provider: [provider()] }), provider_id: "prov-1",
      patch: { revenue_share_bps: 2500 }, sha256,
    });
    expect(out.error).toBe("protected_field_in_patch");
  });

  it("refuses is_demo, which would make a demo provider look real", async () => {
    const out = await previewProviderWrite({
      svc: makeSvc({ Provider: [provider()] }), provider_id: "prov-1",
      patch: { is_demo: false }, sha256,
    });
    expect(out.error).toBe("protected_field_in_patch");
  });

  it("refuses the whole-row patch the old form would have sent", async () => {
    // The page used to do setForm(providerRow), so the patch carried id, created_date and
    // revenue_share_pct. Every save would be refused; the page now narrows the form.
    const out = await previewProviderWrite({
      svc: makeSvc({ Provider: [provider()] }), provider_id: "prov-1",
      patch: { ...provider(), name: "SumUp Ltd" }, sha256,
    });
    expect(out.ok).toBe(false);
  });

  it("gives every protected field a reason and a governed alternative", () => {
    for (const row of PROVIDER_PROTECTED_FIELDS) {
      expect(row.why.length, row.field).toBeGreaterThan(20);
      expect(row.governed_by, row.field).toBeTruthy();
    }
  });
});

describe("C11 — the handler's enums match the entity's", () => {
  const entity = JSON.parse(fs.readFileSync("base44/entities/Provider.jsonc", "utf8"));

  it("accepts every category the entity allows", () => {
    // The first version of this list invented 'other' and dropped 'insurance' and
    // 'logistics', both of which the page already offers in its dropdown.
    expect([...PROVIDER_CATEGORIES].sort()).toEqual([...entity.properties.category.enum].sort());
  });

  it("accepts every api_status the entity allows", () => {
    expect([...PROVIDER_API_STATUSES].sort()).toEqual([...entity.properties.api_status.enum].sort());
  });

  it("refuses a category the entity does not declare", async () => {
    const out = await previewProviderWrite({
      svc: makeSvc({ Provider: [provider()] }), provider_id: "prov-1",
      patch: { category: "crypto" }, sha256,
    });
    expect(out.error).toBe("provider_invalid");
    expect(out.reason).toContain("category_not_supported:crypto");
  });

  it("refuses a malformed contact email but allows an empty one", async () => {
    const bad = await previewProviderWrite({
      svc: makeSvc({ Provider: [provider()] }), provider_id: "prov-1",
      patch: { contact_email: "not-an-email" }, sha256,
    });
    expect(bad.reason).toContain("contact_email_malformed");

    const cleared = await previewProviderWrite({
      svc: makeSvc({ Provider: [provider()] }), provider_id: "prov-1",
      patch: { contact_email: "" }, sha256,
    });
    expect(cleared.ok).toBe(true);
    expect(cleared.preview.changes[0].clears_existing_value).toBe(true);
  });
});

describe("C11 — the write is previewed, including a create", () => {
  it("previews a create and warns that a duplicate is not free to undo", async () => {
    const out = await previewProviderWrite({
      svc: makeSvc({ Provider: [] }), provider_id: null,
      patch: { name: "New PSP", category: "payments" }, sha256,
    });
    expect(out.ok).toBe(true);
    expect(out.preview.mode).toBe("create");
    expect(out.preview.consequences.join(" ")).toContain("not free to undo");
  });

  it("states on every preview that commercial terms are untouched", async () => {
    const out = await previewProviderWrite({
      svc: makeSvc({ Provider: [provider()] }), provider_id: "prov-1",
      patch: { notes: "renewal in March" }, sha256,
    });
    expect(out.preview.commercial_terms_untouched).toBe(true);
    expect(out.preview.consequences.join(" ")).toContain("ProviderRevenueLedger.rate_bps");
  });

  it("applies an update and leaves the legacy revenue share exactly as it was", async () => {
    const svc = makeSvc({ Provider: [provider()] });
    const preview = await previewProviderWrite({
      svc, provider_id: "prov-1", patch: { account_manager: "Bea" }, sha256,
    });
    const out = await applyProviderWrite({
      svc, actor: "founder", provider_id: "prov-1", patch: { account_manager: "Bea" },
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(true);
    expect(out.commercial_terms_touched).toBe(false);
    expect(svc.stores.Provider[0].account_manager).toBe("Bea");
    expect(svc.stores.Provider[0].revenue_share_pct).toBe(15);
    expect(out.applied_fields).toEqual(["account_manager"]);
  });

  it("refuses to apply a change the operator did not see", async () => {
    const svc = makeSvc({ Provider: [provider()] });
    const out = await applyProviderWrite({
      svc, actor: "a", provider_id: "prov-1", patch: { notes: "x" },
      expected_preview_hash: "stale", now: NOW, sha256,
    });
    expect(out.error).toBe("preview_hash_mismatch");
    expect(svc.writes).toHaveLength(0);
  });

  it("refuses a create with no name", async () => {
    const out = await previewProviderWrite({
      svc: makeSvc({ Provider: [] }), provider_id: null, patch: { category: "payments" }, sha256,
    });
    expect(out.reason).toContain("name_required");
  });

  it("tells an unreadable provider apart from a missing one", async () => {
    const missing = await previewProviderWrite({
      svc: makeSvc({ Provider: [] }), provider_id: "prov-1", patch: { notes: "x" }, sha256,
    });
    expect(missing.error).toBe("provider_not_found");
    const unreadable = await previewProviderWrite({
      svc: makeSvc({ Provider: [provider()] }, ["Provider"]), provider_id: "prov-1", patch: { notes: "x" }, sha256,
    });
    expect(unreadable.error).toBe("provider_unreadable");
  });
});

describe("C11 — compensation is reported with both numbers and their status", () => {
  it("tells a never-set legacy share from a deliberate zero", async () => {
    const never = await readProviderCompensation({
      svc: makeSvc({ Provider: [provider({ revenue_share_pct: undefined })] }), provider_id: "prov-1",
    });
    expect(never.legacy_revenue_share_pct).toBeNull();
    expect(never.legacy_state).toBe("NEVER_SET");

    // The `|| 0` in the old form is exactly how a never-set share became a stored zero.
    const zero = await readProviderCompensation({
      svc: makeSvc({ Provider: [provider({ revenue_share_pct: 0 })] }), provider_id: "prov-1",
    });
    expect(zero.legacy_revenue_share_pct).toBe(0);
    expect(zero.legacy_state).toBe("RECORDED_AS_ZERO");
  });

  it("never presents the legacy number as authoritative", async () => {
    const out = await readProviderCompensation({
      svc: makeSvc({ Provider: [provider()] }), provider_id: "prov-1",
    });
    expect(out.legacy_is_authoritative).toBe(false);
    expect(out.legacy_note).toContain("not the commercial rate");
  });

  it("reports the agreement-bound rate when exactly one exists", async () => {
    const out = await readProviderCompensation({
      svc: makeSvc({
        Provider: [provider()],
        ProviderRevenueLedger: [{ id: "l1", provider_id: "prov-1", agreement_id: "ag-1", rate_bps: 1500 }],
      }),
      provider_id: "prov-1",
    });
    expect(out.governed_rate_bps).toBe(1500);
    expect(out.governed_rate_state).toBe("SINGLE_RATE");
    // 15% and 1500 bps agree here, so there is no divergence to report.
    expect(out.diverges_from_agreement).toBe(false);
  });

  it("surfaces a divergence between the legacy number and the agreement", async () => {
    const out = await readProviderCompensation({
      svc: makeSvc({
        Provider: [provider({ revenue_share_pct: 15 })],
        ProviderRevenueLedger: [{ id: "l1", provider_id: "prov-1", agreement_id: "ag-1", rate_bps: 2000 }],
      }),
      provider_id: "prov-1",
    });
    // This is the divergence the protection exists to prevent, so it is surfaced rather
    // than reconciled silently.
    expect(out.diverges_from_agreement).toBe(true);
  });

  it("refuses to report a single rate when the ledger holds several", async () => {
    const out = await readProviderCompensation({
      svc: makeSvc({
        Provider: [provider()],
        ProviderRevenueLedger: [
          { id: "l1", provider_id: "prov-1", agreement_id: "ag-1", rate_bps: 1500 },
          { id: "l2", provider_id: "prov-1", agreement_id: "ag-2", rate_bps: 1800 },
        ],
      }),
      provider_id: "prov-1",
    });
    expect(out.governed_rate_bps).toBeNull();
    expect(out.governed_rate_state).toBe("MULTIPLE_RATES");
    expect(out.diverges_from_agreement).toBeNull();
  });

  it("ignores ledger entries with no agreement behind them", async () => {
    const out = await readProviderCompensation({
      svc: makeSvc({
        Provider: [provider()],
        ProviderRevenueLedger: [{ id: "l1", provider_id: "prov-1", rate_bps: 9999 }],
      }),
      provider_id: "prov-1",
    });
    // A rate with no agreement_id is not an agreement-bound rate.
    expect(out.governed_rate_state).toBe("NO_AGREEMENT_BOUND_RATE");
    expect(out.agreement_bound_entries).toBe(0);
  });

  it("reports an unreadable ledger as unreadable, not as no agreement", async () => {
    const out = await readProviderCompensation({
      svc: makeSvc({ Provider: [provider()] }, ["ProviderRevenueLedger"]), provider_id: "prov-1",
    });
    expect(out.governed_rate_state).toBe("LEDGER_UNREADABLE");
    expect(out.agreement_bound_entries).toBeNull();
    expect(out.diverges_from_agreement).toBeNull();
  });
});
