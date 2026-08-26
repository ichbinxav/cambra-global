import { describe, expect, it } from "vitest";
import { handleDiscoveryV2Admin } from "../../base44/shared/discoveryV2Admin.ts";

function entity(initial = []) {
  const store = initial.map((row) => ({ ...row }));
  const calls = [];
  return {
    store, calls,
    async list(_sort, limit) { calls.push({ op: "list" }); return store.slice(0, limit); },
    async filter(query, _sort, limit) {
      calls.push({ op: "filter", query });
      return store.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)).slice(0, limit);
    },
    async create(value) { calls.push({ op: "create", value }); const row = { id: `row-${store.length + 1}`, ...value }; store.push(row); return row; },
    async update(id, patch) { calls.push({ op: "update", id, patch }); const row = store.find((item) => item.id === id); Object.assign(row, patch); return row; },
  };
}

function service(leads) {
  return {
    entities: {
      OutboundLead: entity(leads),
      FounderSavedView: entity([]),
    },
  };
}

describe("Discovery people audiences", () => {
  it("returns people-first evidence and saves an idempotent explicit snapshot", async () => {
    const svc = service([{
      id: "lead-1", company_name: "Acme", contact_full_name: "Ada", contact_title: "CFO",
      country: "ES", score: 84, estimated_tpv_min_eur: 5_000_000, estimated_tpv_max_eur: 9_000_000,
    }, {
      id: "lead-fr", company_name: "Protected", contact_full_name: "Grace", contact_title: "Founder",
      country: "FR", score: 95,
    }]);
    const user = { id: "founder", email: "founder@cambra.global", role: "admin" };

    const peopleResponse = await handleDiscoveryV2Admin(svc, user, {
      action: "discovery_v2_people", persona: "FINANCE", gmv_band: "FROM_5M_TO_20M", named_only: true,
    });
    const people = await peopleResponse.json();
    expect(people.ok).toBe(true);
    expect(people.items[0]).toMatchObject({
      id: "lead-1", person_name: "Ada", personas: ["FINANCE"], score: 84, gmv_truth_class: "ESTIMATED",
    });
    expect(people.items.map((row) => row.id)).not.toContain("lead-fr");
    expect(people.market_scope).toMatchObject({ active_launch_count: 10, excluded_non_launch: 1 });

    const payload = {
      action: "discovery_v2_save_audience", view_key: "lead-audience:test", name: "ES CFOs",
      lead_ids: ["lead-1"], filters: { persona: "FINANCE", country: "ES" },
    };
    const first = await (await handleDiscoveryV2Admin(svc, user, payload)).json();
    const second = await (await handleDiscoveryV2Admin(svc, user, payload)).json();

    expect(first.audience).toMatchObject({ name: "ES CFOs", member_count: 1, lead_ids: ["lead-1"] });
    expect(first.external_send_performed).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(svc.entities.FounderSavedView.calls.filter((call) => call.op === "create")).toHaveLength(1);

    const rejected = await (await handleDiscoveryV2Admin(svc, user, {
      action: "discovery_v2_save_audience", name: "Not allowed", lead_ids: ["lead-fr"],
    })).json();
    expect(rejected.error).toBe("audience_contains_non_launch_leads");
    expect(rejected.blocked_lead_ids).toEqual(["lead-fr"]);
  });
});
