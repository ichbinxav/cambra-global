// v62.2 CP1 — deterministic source-tree hash ("sha256-tree-v1").
// Pure algorithm: walk included files, normalize relative paths with "/",
// sort lexicographically, sha256 each file's bytes, build entries
// `relative/path<TAB>file_sha256<LF>`, sha256 the concatenation.
// RELEASE.json is excluded, which breaks the circularity of embedding the
// archive's own hash inside the archive.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Buffer } from "node:buffer";

export const SOURCE_TREE_HASH_ALGORITHM = "sha256-tree-v1";

// Versioned exclusion list — tested by src/lib/sourceTreeHash.test.js.
export const EXCLUDED_DIRS = [
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".release-evidence",
  ".cache",
  ".vite",
  ".turbo",
  ".release-artifacts",
];
export const EXCLUDED_FILES = [
  "RELEASE.json",
  ".test-results.json",
  // Local Base44 CLI linkage. This file is intentionally gitignored and is
  // recreated per developer machine; including it made a live working tree
  // hash differ from the git-backed release payload by exactly one file.
  "base44/.app.jsonc",
  // v62.2.1 — REVIEW SCRATCH, not source. The baseline candidate is written
  // INTO the tree by typecheck-baseline-candidate.mjs; if it counted toward
  // the hash, the very act of generating it changed the tree and the approve
  // step declared its own candidate "stale" — an impossible cycle.
  "typecheck-baseline.candidate.json",
  // v62.5 — durability EVIDENCE, not source. The manifest records hashes OF the
  // tree; if it counted toward the hash, writing it would change the tree it
  // describes — the same circularity RELEASE.json already breaks.
  "config/p1-durability-manifest.json",
];
export const EXCLUDED_PATTERNS = [
  /\.log$/i,
  /\.tmp$/i,
  /~$/,
  /^\.DS_Store$/,
  /\.zip$/i,
  // v62.2.1 — archived baselines are historical scratch, same reasoning.
  /^typecheck-baseline\.previous\.\d+\.json$/,
];

export function isExcluded(relPath) {
  const segments = relPath.split("/");
  if (segments.some((s) => EXCLUDED_DIRS.includes(s))) return true;
  const base = segments[segments.length - 1];
  if (EXCLUDED_FILES.includes(relPath) || EXCLUDED_FILES.includes(base)) return true;
  return EXCLUDED_PATTERNS.some((p) => p.test(base));
}

const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * Pure core: entries = [{ path: "relative/posix/path", sha256: "<hex>" }].
 * Order-independent (sorted internally); deterministic for identical trees.
 */
export function hashEntries(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const concatenated = sorted.map((e) => `${e.path}\t${e.sha256}\n`).join("");
  return sha256Hex(Buffer.from(concatenated, "utf8"));
}

/**
 * The one canonical source selector used by BOTH hashing and packaging.
 * Returning paths and hashes together makes selection drift testable: a
 * packager is not allowed to maintain a second include/exclude policy.
 */
export function collectSourceTreeEntries(root = ".") {
  const entries = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (isExcluded(rel)) continue;
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) entries.push({ path: rel, sha256: sha256Hex(fs.readFileSync(abs)) });
    }
  };
  walk(root);
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Walks `root` applying the canonical selector and returns the tree hash. */
export function computeSourceTreeHash(root = ".") {
  const entries = collectSourceTreeEntries(root);
  return { hash: hashEntries(entries), fileCount: entries.length, algorithm: SOURCE_TREE_HASH_ALGORITHM };
}
