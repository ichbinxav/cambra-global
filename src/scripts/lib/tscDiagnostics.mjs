// v62.2 CP4 — tsc diagnostic parsing + baseline comparison (pure, testable).
import crypto from "node:crypto";

/** Parses `tsc --pretty false` output into structured diagnostics. */
export function parseTscOutput(output) {
  const diags = [];
  for (const line of String(output).split(/\r?\n/)) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
    if (!m) continue;
    const [, file, lineNo, , code, message] = m;
    // Normalized message: strip volatile absolute-path fragments.
    const normalizedMessage = message.replace(/'[^']*[\\/]node_modules[\\/][^']*'/g, "'<dep>'");
    diags.push({
      file: file.split("\\").join("/"),
      line: Number(lineNo),
      code,
      message: normalizedMessage,
      fingerprint: fingerprintOf(file, code, normalizedMessage),
    });
  }
  return diags;
}

export function fingerprintOf(file, code, message) {
  return crypto.createHash("sha256")
    .update(`${file.split("\\").join("/")}|${code}|${message}`)
    .digest("hex").slice(0, 16);
}

/** Groups diagnostics into fingerprint → count. */
export function countByFingerprint(diags) {
  const map = new Map();
  for (const d of diags) {
    const cur = map.get(d.fingerprint) || { file: d.file, code: d.code, count: 0 };
    cur.count += 1;
    map.set(d.fingerprint, cur);
  }
  return map;
}

/**
 * Compares current diagnostics against an approved baseline.
 * Fails on: total increase, new fingerprint, worsened count, any error in the
 * critical set, any error in files modified by the current release.
 */
export function compareToBaseline(currentDiags, baselineEntries, { criticalFiles = [], modifiedFiles = [] } = {}) {
  const current = countByFingerprint(currentDiags);
  const failures = [];
  const criticalSet = new Set(criticalFiles.map((f) => f.split("\\").join("/")));
  const modifiedSet = new Set(modifiedFiles.map((f) => f.split("\\").join("/")));

  for (const d of currentDiags) {
    if (criticalSet.has(d.file)) failures.push(`critical-set error: ${d.file} ${d.code}`);
    if (modifiedSet.has(d.file)) failures.push(`modified-file error: ${d.file} ${d.code}`);
  }
  let currentTotal = 0;
  for (const [fp, e] of current.entries()) {
    currentTotal += e.count;
    const base = baselineEntries[fp];
    if (!base) failures.push(`new fingerprint: ${e.file} ${e.code} ×${e.count}`);
    else if (e.count > base.count) failures.push(`worsened: ${e.file} ${e.code} ×${e.count} (baseline ×${base.count})`);
  }
  const eliminated = Object.entries(baselineEntries)
    .filter(([fp]) => !current.has(fp))
    .reduce((n, [, e]) => n + e.count, 0);

  return { ok: failures.length === 0, failures: [...new Set(failures)], currentTotal, eliminated };
}