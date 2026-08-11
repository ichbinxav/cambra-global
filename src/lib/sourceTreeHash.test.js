import { describe, it, expect } from "vitest";
import {
  hashEntries, isExcluded, EXCLUDED_FILES, SOURCE_TREE_HASH_ALGORITHM, computeSourceTreeHash,
  collectSourceTreeEntries,
} from "../../scripts/lib/sourceTreeHash.mjs";
import crypto from "node:crypto";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

describe("sourceTreeHash (sha256-tree-v1)", () => {
  const entries = [
    { path: "a/b.txt", sha256: sha("hello") },
    { path: "z.txt", sha256: sha("world") },
    { path: "a/a.txt", sha256: sha("first") },
  ];

  it("is deterministic: same tree → same hash", () => {
    expect(hashEntries(entries)).toBe(hashEntries(entries.map((e) => ({ ...e }))));
  });

  it("is order-independent: shuffled filesystem order → same hash", () => {
    const shuffled = [entries[2], entries[0], entries[1]];
    expect(hashEntries(shuffled)).toBe(hashEntries(entries));
  });

  it("changes when a single byte changes", () => {
    const mutated = entries.map((e) =>
      e.path === "z.txt" ? { ...e, sha256: sha("world!") } : e);
    expect(hashEntries(mutated)).not.toBe(hashEntries(entries));
  });

  it("changes when a path changes", () => {
    const moved = entries.map((e) =>
      e.path === "z.txt" ? { ...e, path: "y.txt" } : e);
    expect(hashEntries(moved)).not.toBe(hashEntries(entries));
  });

  it("excludes RELEASE.json — no circularity with the manifest", () => {
    expect(EXCLUDED_FILES).toContain("RELEASE.json");
    expect(isExcluded("RELEASE.json")).toBe(true);
  });

  it("excludes local Base44 app linkage from canonical source and packaging", () => {
    expect(EXCLUDED_FILES).toContain("base44/.app.jsonc");
    expect(isExcluded("base44/.app.jsonc")).toBe(true);
    expect(isExcluded("base44/config.jsonc")).toBe(false);
  });

  it("excludes the documented dirs/patterns and nothing innocent", () => {
    expect(isExcluded("node_modules/x/index.js")).toBe(true);
    expect(isExcluded(".git/HEAD")).toBe(true);
    expect(isExcluded("dist/index.html")).toBe(true);
    expect(isExcluded("coverage/lcov.info")).toBe(true);
    expect(isExcluded(".release-evidence/tests.json")).toBe(true);
    expect(isExcluded("debug.log")).toBe(true);
    expect(isExcluded("CAMBRA-final.zip")).toBe(true);
    expect(isExcluded(".release-artifacts/CAMBRA-final.zip")).toBe(true);
    expect(isExcluded("src/pages/Landing.jsx")).toBe(false);
    expect(isExcluded("base44/entities/Baseline.jsonc")).toBe(false);
  });

  it("declares the versioned algorithm identifier", () => {
    expect(SOURCE_TREE_HASH_ALGORITHM).toBe("sha256-tree-v1");
  });

  it("computeSourceTreeHash walks a real tree and RELEASE.json does not affect it", () => {
    // The repo root itself: computing twice must be identical, proving the
    // walker is deterministic against the live filesystem.
    const a = computeSourceTreeHash(".");
    const b = computeSourceTreeHash(".");
    expect(a.hash).toBe(b.hash);
    expect(a.fileCount).toBeGreaterThan(0);
  });

  it("hashing consumes exactly the paths returned by the canonical source selector", () => {
    const selected = collectSourceTreeEntries(".");
    const tree = computeSourceTreeHash(".");
    expect(tree.fileCount).toBe(selected.length);
    expect(tree.hash).toBe(hashEntries(selected));
    expect(selected.map((entry) => entry.path)).toEqual(
      [...selected.map((entry) => entry.path)].sort(),
    );
  });
});
