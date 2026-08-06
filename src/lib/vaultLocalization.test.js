// vaultLocalization.test.js — Checkpoint H (2026-08-06).
//
// Guards the /Vault language fix. The bug it freezes was NOT "a missing
// translation": the page rendered hardcoded SPANISH ("Buscar…", "Editar
// documento", "Añadir") to every merchant, including English and French ones. A
// missing key is visible; wrong-language text that happens to be a real sentence
// is not, so it survived until audited.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "./locales/en.js";
import fr from "./locales/fr.js";
import es from "./locales/es.js";
import { DOC_CATEGORIES, DOC_STATUSES, categoryLabel, statusLabel } from "../components/vault/vaultLabels";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SURFACE = [
  "src/pages/Vault.jsx",
  "src/components/vault/VaultDocumentDrawer.jsx",
  "src/components/vault/VaultLinkEditor.jsx",
];

const vltKeys = (dict) => Object.keys(dict).filter((k) => k.startsWith("vlt_"));

describe("vault i18n — key parity across the three languages", () => {
  it("EN defines the vault keys", () => {
    expect(vltKeys(en).length).toBeGreaterThan(25);
  });

  it.each([["fr", fr], ["es", es]])("%s defines every EN vault key", (_name, dict) => {
    const missing = vltKeys(en).filter((k) => !(k in dict));
    expect(missing, `Untranslated vault keys:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it.each([["fr", fr], ["es", es]])("%s defines no vault key EN lacks", (_name, dict) => {
    const orphan = vltKeys(dict).filter((k) => !(k in en));
    expect(orphan, `Orphan keys (EN is the reference):\n  ${orphan.join("\n  ")}`).toEqual([]);
  });

  it.each([["en", en], ["fr", fr], ["es", es]])("%s has no blank vault value", (_name, dict) => {
    const blank = vltKeys(dict).filter((k) => !String(dict[k] ?? "").trim());
    expect(blank).toEqual([]);
  });

  it("every enum value has a label in all three languages", () => {
    const missing = [];
    for (const [name, dict] of [["en", en], ["fr", fr], ["es", es]]) {
      for (const c of DOC_CATEGORIES) if (!dict[`vlt_cat_${c}`]) missing.push(`${name}:vlt_cat_${c}`);
      for (const s of DOC_STATUSES) if (!dict[`vlt_st_${s}`]) missing.push(`${name}:vlt_st_${s}`);
    }
    expect(missing, `A merchant would read the raw stored value:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("FR and ES actually differ from EN (not copy-pasted English)", () => {
    // Category labels are the ones most likely to be left in English.
    const sameAsEn = DOC_CATEGORIES.filter(
      (c) => fr[`vlt_cat_${c}`] === en[`vlt_cat_${c}`] && es[`vlt_cat_${c}`] === en[`vlt_cat_${c}`]
    );
    // "Contracts"/"Contrats"/"Contratos" differ; a full overlap would mean a stub.
    expect(sameAsEn.length).toBeLessThan(DOC_CATEGORIES.length);
  });
});

describe("vault labels — display without touching stored values", () => {
  const tEn = (k) => en[k] ?? k;

  it("maps a stored value to its translated label", () => {
    expect(categoryLabel(tEn, "benchmark_evidence")).toBe("Benchmark evidence");
    expect(statusLabel(tEn, "superseded")).toBe("Superseded");
  });

  it("falls back to the RAW value for an unknown enum, never to empty", () => {
    // Honest and debuggable: a category the UI does not know must still be
    // visible, not silently blank out the document.
    expect(categoryLabel(tEn, "some_new_category")).toBe("some_new_category");
    expect(statusLabel(tEn, "quarantined")).toBe("quarantined");
  });

  it("returns empty for an absent value rather than printing 'undefined'", () => {
    expect(categoryLabel(tEn, undefined)).toBe("");
    expect(statusLabel(tEn, null)).toBe("");
  });

  it("the enum lists still hold the STORED values, unchanged", () => {
    expect(DOC_CATEGORIES).toContain("provider_proposals");
    expect(DOC_CATEGORIES).toContain("internal_files");
    expect(DOC_STATUSES).toEqual(["pending", "approved", "rejected", "superseded"]);
  });
});

describe("vault surface — no hardcoded language left", () => {
  const SPANISH = [
    /"Buscar/i, /'Buscar/i, />\s*Filtrar\s*</, />\s*Añadir\s*</, />\s*Quitar\s*</,
    /Editar documento/, /Etiquetas \(separadas/, /Sin vínculos/, /ID de destino/,
    />\s*Cargando/, />\s*Abrir\s*</, />\s*Cerrar\s*</, /Actuales:/,
  ];

  it.each(SURFACE)("%s contains no hardcoded Spanish", (file) => {
    const src = stripComments(read(file));
    const hits = SPANISH.filter((re) => re.test(src)).map(String);
    expect(hits, `Hardcoded Spanish still rendered:\n  ${hits.join("\n  ")}`).toEqual([]);
  });

  it.each(SURFACE)("%s goes through useTranslation", (file) => {
    expect(read(file)).toContain("useTranslation");
  });

  it("the page no longer prints raw enum values in the cards", () => {
    const src = stripComments(read("src/pages/Vault.jsx"));
    expect(src).not.toContain("{doc.category}");
    expect(src).not.toContain("{doc.review_status}");
    expect(src).toContain("categoryLabel(t, doc.category)");
    expect(src).toContain("statusLabel(t, doc.review_status)");
  });

  it("an empty result is distinguishable from a failed load", () => {
    expect(stripComments(read("src/pages/Vault.jsx"))).toContain("vlt_empty");
  });
});

describe("vault — backend payloads untouched by the presentation fix", () => {
  it("every document call keeps its original shape", () => {
    const src = read("src/pages/Vault.jsx");
    expect(src).toContain("invoke('listDocuments'");
    expect(src).toContain("review_status: status === 'all' ? undefined : status");
    expect(src).toContain("visibility: 'brand_and_admin'");
    const editor = read("src/components/vault/VaultLinkEditor.jsx");
    expect(editor).toContain("target_type: type");
    expect(editor).toContain("is_primary: primary");
  });
});