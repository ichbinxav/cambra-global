import { describe, expect, it } from "vitest";
import {
  base44FunctionErrorPayload,
  normalizeBase44FunctionError,
} from "./base44FunctionError.js";

describe("Base44 function error normalization", () => {
  it("unwraps the nested Axios 409 shape returned by Base44 functions", () => {
    const caught = {
      message: "Request failed with status code 409",
      response: {
        status: 409,
        data: {
          data: {
            ok: false,
            error: "active_acquisition_policy_required:merchant_acquisition",
            blockers: ["active_acquisition_policy_required:merchant_acquisition"],
          },
        },
      },
    };

    expect(base44FunctionErrorPayload(caught)).toEqual(caught.response.data.data);
    expect(normalizeBase44FunctionError(caught)).toMatchObject({
      message: "active_acquisition_policy_required:merchant_acquisition",
      status: 409,
      data: caught.response.data.data,
    });
  });

  it("preserves errors already normalized by a function caller", () => {
    const caught = Object.assign(new Error("suppression_not_proven"), {
      data: { ok:false, error:"suppression_not_proven" },
      status: 409,
    });

    expect(normalizeBase44FunctionError(caught)).toMatchObject({
      message: "suppression_not_proven",
      status: 409,
      data: caught.data,
    });
  });
});
