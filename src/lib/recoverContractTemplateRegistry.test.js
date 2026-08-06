// v61 Checkpoint C — immutable template registry.
// The contractual PDF must render with the template version in force at
// acceptance; an unknown version blocks instead of silently using the current
// template. These tests exercise the EXACT module the backend imports.
import { describe, it, expect } from "vitest";
import {
  contractStringsForVersion,
  resolveContractTemplateVersion,
  knownTemplateVersions,
} from "../../base44/shared/recoverContractTemplateRegistry.ts";
import {
  contractStrings,
  RECOVER_CONTRACT_TEMPLATE_VERSION,
} from "../../base44/shared/recoverContractTemplates.ts";

describe("template registry — resolution precedence", () => {
  it("snapshot template_version wins", () => {
    expect(
      resolveContractTemplateVersion(
        { template_version: "recover-contract-pdf-v2" },
        { contract_pdf_template_version: "other" },
      ),
    ).toBe("recover-contract-pdf-v2");
  });

  it("falls back to the mandate's recorded version when the snapshot has none", () => {
    expect(
      resolveContractTemplateVersion({}, { contract_pdf_template_version: "recover-contract-pdf-v2" }),
    ).toBe("recover-contract-pdf-v2");
  });

  it("legacy (no version anywhere) resolves to the current version", () => {
    expect(resolveContractTemplateVersion({}, {})).toBe(RECOVER_CONTRACT_TEMPLATE_VERSION);
    expect(resolveContractTemplateVersion(null, undefined)).toBe(RECOVER_CONTRACT_TEMPLATE_VERSION);
  });
});

describe("template registry — hard block on unknown versions", () => {
  it("known version returns the exact strings for each locale", () => {
    for (const locale of ["en", "fr", "es"]) {
      expect(contractStringsForVersion(RECOVER_CONTRACT_TEMPLATE_VERSION, locale)).toEqual(
        contractStrings(locale),
      );
    }
  });

  it("unknown version throws template_version_unknown (never silent fallback)", () => {
    expect(() => contractStringsForVersion("recover-contract-pdf-v999", "en")).toThrow(
      /template_version_unknown/,
    );
    expect(() => contractStringsForVersion("", "en")).toThrow(/template_version_unknown/);
  });

  it("the current version is registered", () => {
    expect(knownTemplateVersions()).toContain(RECOVER_CONTRACT_TEMPLATE_VERSION);
  });
});