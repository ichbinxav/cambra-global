import fs from "node:fs";
import path from "node:path";
import { collectSourceTreeEntries } from "./sourceTreeHash.mjs";

export const RELEASE_CONTROL_FILES = [
  "RELEASE.json",
  "config/p1-durability-manifest.json",
  "base44/.deploy/manifest.json",
];

// Generated deployment material is excluded from the canonical source-tree
// hash, but the release ZIP deliberately carries the exact verified bundle.
// This lets an extracted artifact deploy without relying on an ignored local
// directory or an unpinned network download.
export const RELEASE_GENERATED_DIRS = ["base44/.deploy"];

function walkFiles(root, relDir) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir)) return [];
  const paths = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) paths.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  };
  walk(absDir);
  return paths;
}

/** Exact source selection plus non-source control/evidence files. */
export function collectReleasePayloadPaths(root = ".") {
  const sourcePaths = collectSourceTreeEntries(root).map((entry) => entry.path);
  const controlPaths = RELEASE_CONTROL_FILES.filter((rel) => fs.existsSync(path.join(root, rel)));
  const generatedPaths = RELEASE_GENERATED_DIRS.flatMap((rel) => walkFiles(root, rel));
  const evidencePaths = walkFiles(root, ".release-evidence");
  return [...new Set([...sourcePaths, ...controlPaths, ...generatedPaths, ...evidencePaths])].sort();
}
