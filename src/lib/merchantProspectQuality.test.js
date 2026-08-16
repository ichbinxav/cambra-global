import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("merchant prospect quality", () => {
  it("scores company economic/payments fit without inventing GMV, fees or person fit", () => {
    const s = read("base44/functions/leadScoringAgent/entry.ts");
    for (const key of [
      "Commerce/payment fit",
      "Economic potential",
      "Payments complexity/opportunity signals",
      "Timing/growth signal",
      "Company evidence confidence",
      "No inventar GMV",
      "No afirmar fees sin evidencia",
      "No apliques ninguna penalización ni bonus por contacto/cargo/email",
    ]) expect(s).toContain(key);
    expect(s).not.toContain("Decision-maker quality");
    expect(s).not.toContain("Data/contact confidence");
  });

  it("filters obvious non-merchants before spending downstream enrichment capacity", () => {
    const s = read("base44/functions/leadDiscoveryAgent/entry.ts");
    for (const key of [
      "merchantDiscoveryCandidate",
      "NON_MERCHANT_ORG",
      "university",
      "agency",
      "logistics",
      "organization_generic",
      "rejected_count",
    ]) expect(s).toContain(key);
  });

  it("volume send still requires corporate-domain contact and company evidence", () => {
    const s = read("base44/functions/outboundVolumeWorker/entry.ts");
    expect(s).toContain("corporateDomain");
    expect(s).toContain("emailDomain");
    expect(s).toContain("commerce_fit");
    expect(s).toContain("economic_potential");
  });
});
