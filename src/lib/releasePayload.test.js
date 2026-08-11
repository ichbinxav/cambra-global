import { describe, expect, it } from "vitest";
import { collectSourceTreeEntries } from "../../scripts/lib/sourceTreeHash.mjs";
import { collectReleasePayloadPaths, RELEASE_CONTROL_FILES } from "../../scripts/lib/releasePayload.mjs";

describe("release payload source binding", () => {
  it("contains every and only canonically selected source path plus explicit control evidence", () => {
    const sourcePaths = collectSourceTreeEntries(".").map((entry) => entry.path);
    const payload = collectReleasePayloadPaths(".");
    expect(sourcePaths.every((rel) => payload.includes(rel))).toBe(true);
    const allowedExtra = payload.filter((rel) => !sourcePaths.includes(rel));
    expect(allowedExtra.every((rel) => RELEASE_CONTROL_FILES.includes(rel) || rel.startsWith(".release-evidence/"))).toBe(true);
  });

  it("cannot silently package an excluded zip", () => {
    expect(collectReleasePayloadPaths(".").some((rel) => rel.endsWith(".zip"))).toBe(false);
  });
});
