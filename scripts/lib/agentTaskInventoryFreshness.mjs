import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const AGENTTASK_INVENTORY_PATH =
  "config/agenttask-creator-inventory.json";

const failure = (message) => {
  throw new Error(`agenttask_inventory_freshness:${message}`);
};

/**
 * Proves that the checked-in AgentTask inventory is the exact output of the
 * current source scanner. A caller-supplied inventory is accepted only as a
 * byte-identical mirror of that canonical artifact; it can never become an
 * alternative authority.
 */
export function requireFreshAgentTaskInventory(root, candidatePath = null) {
  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(path.resolve(root));
  } catch (error) {
    failure(`root_invalid:${error instanceof Error ? error.message : String(error)}`);
  }
  const canonicalPath = path.join(canonicalRoot, AGENTTASK_INVENTORY_PATH);
  const generatorPath = path.join(
    canonicalRoot,
    "scripts",
    "generate-agenttask-creator-inventory.mjs",
  );
  if (!fs.existsSync(generatorPath)) failure("generator_missing");

  const result = spawnSync(process.execPath, [generatorPath, "--check"], {
    cwd: canonicalRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.error) {
    failure(
      `check_spawn:${String(result.error.code || "UNKNOWN")}:${
        result.error.message
      }`,
    );
  }
  if (result.status !== 0) {
    const diagnostic = String(result.stderr || result.stdout || "")
      .trim()
      .replace(/\s+/gu, " ")
      .slice(0, 500);
    failure(`canonical_stale${diagnostic ? `:${diagnostic}` : ""}`);
  }
  if (!fs.existsSync(canonicalPath)) failure("canonical_missing");

  const canonicalBytes = fs.readFileSync(canonicalPath);
  const resolvedCandidate = candidatePath
    ? path.resolve(canonicalRoot, candidatePath)
    : canonicalPath;
  if (!fs.existsSync(resolvedCandidate)) failure("candidate_missing");
  if (
    resolvedCandidate !== canonicalPath &&
    !fs.readFileSync(resolvedCandidate).equals(canonicalBytes)
  ) {
    failure("candidate_not_byte_identical_to_canonical");
  }
  // A caller-supplied mirror is never consumed after comparison. Returning a
  // captured canonical snapshot prevents a mutable alternative path from
  // changing between verification and parse.
  const postComparisonBytes = fs.readFileSync(canonicalPath);
  if (!postComparisonBytes.equals(canonicalBytes)) {
    failure("canonical_changed_during_check");
  }
  return {
    canonicalPath,
    canonicalBytes: Buffer.from(canonicalBytes),
    canonicalRoot,
  };
}
