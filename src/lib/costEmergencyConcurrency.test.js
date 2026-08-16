import { describe, expect, it } from "vitest";
import {
  claimCostEmergencyStop,
  clearOwnedCostEmergencyStop,
  containOutboundForCostStop,
} from "../../base44/shared/costGovernance.ts";

const matches = (row, query) =>
  Object.entries(query).every(([key, value]) => row?.[key] === value);

function costService(initial, beforeUpdate) {
  let row = structuredClone(initial);
  let hook = beforeUpdate;
  return {
    row: () => structuredClone(row),
    entities: {
      CostBudgetControl: {
        get: async () => structuredClone(row),
        updateMany: async (query, operation) => {
          if (hook) {
            const run = hook;
            hook = null;
            row = run(structuredClone(row));
          }
          if (!matches(row, query)) return { updated: 0 };
          row = { ...row, ...structuredClone(operation.$set) };
          return { updated: 1 };
        },
      },
    },
  };
}

describe("cost emergency-stop concurrency", () => {
  const budget = {
    id: "budget-1",
    control_key: "global",
    status: "active",
    version: "v1",
    reservation_revision: 4,
    emergency_stop_active: false,
    emergency_stop_key: "",
  };

  it("retries after a reservation wins, then installs the stop on the new revision", async () => {
    const svc = costService(budget, (row) => ({
      ...row,
      reservation_revision: row.reservation_revision + 1,
      reserved_daily_total_minor: 25,
    }));
    const result = await claimCostEmergencyStop(
      svc,
      budget.id,
      "hard_cap",
      { stop_key: "real-stop", stop_owner: "cost_governor" },
    );
    expect(result.acquired).toBe(true);
    expect(svc.row()).toMatchObject({
      emergency_stop_active: true,
      emergency_stop_key: "real-stop",
      reservation_revision: 6,
      reserved_daily_total_minor: 25,
    });
  });

  it("never lets an operator drill supersede a concurrent real stop", async () => {
    const svc = costService(budget, (row) => ({
      ...row,
      emergency_stop_active: true,
      emergency_stop_key: "real-stop",
      emergency_stop_owner: "cost_governor",
      reservation_revision: row.reservation_revision + 1,
    }));
    const result = await claimCostEmergencyStop(
      svc,
      budget.id,
      "drill",
      {
        stop_key: "drill-stop",
        stop_owner: "founder",
        operator_exercise: true,
        require_inactive: true,
      },
    );
    expect(result.acquired).toBe(false);
    expect(result.error).toBe("cost_emergency_stop_already_active");
    expect(svc.row()).toMatchObject({
      emergency_stop_active: true,
      emergency_stop_key: "real-stop",
    });
  });

  it("cannot clear a drill after a newer real stop takes ownership", async () => {
    const svc = costService(
      {
        ...budget,
        reservation_revision: 8,
        emergency_stop_active: true,
        emergency_stop_key: "drill-stop",
        emergency_stop_owner: "founder",
      },
      (row) => ({
        ...row,
        reservation_revision: row.reservation_revision + 1,
        emergency_stop_key: "real-stop",
        emergency_stop_owner: "cost_governor",
      }),
    );
    const result = await clearOwnedCostEmergencyStop(svc, {
      control_id: budget.id,
      expected_revision: 8,
      stop_key: "drill-stop",
      actor: "founder",
    });
    expect(result.cleared).toBe(false);
    expect(result.error).toBe("cost_emergency_stop_changed_concurrently");
    expect(svc.row()).toMatchObject({
      reservation_revision: 9,
      emergency_stop_active: true,
      emergency_stop_key: "real-stop",
    });
  });

  it("preempts an outbound START transition even when its first CAS loses", async () => {
    let row = {
      id: "outbound-1",
      control_key: "global",
      control_revision: 11,
      acquisition_enabled: false,
      instantly_enabled: false,
      transition_key: "start-claim",
    };
    let interleaved = false;
    const svc = {
      entities: {
        OutboundControl: {
          filter: async () => [structuredClone(row)],
          get: async () => structuredClone(row),
          updateMany: async (query, operation) => {
            if (!interleaved) {
              interleaved = true;
              row = {
                ...row,
                control_revision: 12,
                acquisition_enabled: true,
                instantly_enabled: true,
              };
            }
            if (!matches(row, query)) return { updated: 0 };
            row = { ...row, ...structuredClone(operation.$set) };
            return { updated: 1 };
          },
        },
      },
    };
    const result = await containOutboundForCostStop(svc, "hard_cap");
    expect(result).toMatchObject({ ok: true, control_revision: 13 });
    expect(row).toMatchObject({
      acquisition_enabled: false,
      instantly_enabled: false,
      transition_key: "",
      control_revision: 13,
    });
  });
});
