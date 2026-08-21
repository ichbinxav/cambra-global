import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FRONTEND_ENTRY_BUDGET_BYTES,
  inspectFrontendEntryBudget,
} from "../../scripts/check-frontend-entry-budget.mjs";

const temporaryDirectories = [];

function fixture(entryBytes, source = "/assets/index-test.js", extraHead = "") {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), "cambra-entry-budget-"));
  temporaryDirectories.push(distDir);
  const entryPath = path.join(distDir, "assets", "index-test.js");
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  fs.writeFileSync(entryPath, Buffer.alloc(entryBytes, 97));
  fs.writeFileSync(
    path.join(distDir, "index.html"),
    `<!doctype html>${extraHead}<script crossorigin type="module" src="${source}"></script>`,
  );
  return distDir;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("frontend entry byte budget", () => {
  it("runs immediately after the evidence-producing build", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    expect(pkg.scripts["build:evidence"]).toMatch(
      /run-with-evidence\.mjs build[\s\S]*&& npm run frontend:entry-budget:check$/,
    );
  });

  it("accepts an entry strictly below 500,000 bytes", () => {
    const result = inspectFrontendEntryBudget({
      distDir: fixture(FRONTEND_ENTRY_BUDGET_BYTES - 1),
    });
    expect(result.bytes).toBe(499_999);
    expect(result.remainingBytes).toBe(1);
  });

  it("rejects an entry at the boundary instead of silently widening it", () => {
    const distDir = fixture(FRONTEND_ENTRY_BUDGET_BYTES);
    expect(() => inspectFrontendEntryBudget({ distDir })).toThrow(
      "frontend_entry_budget_exceeded:500000:500000:/assets/index-test.js",
    );
  });

  it("rejects an entry reference that escapes dist", () => {
    const distDir = fixture(1, "../outside.js");
    expect(() => inspectFrontendEntryBudget({ distDir })).toThrow(
      "frontend_entry_outside_dist:../outside.js",
    );
  });

  it("rejects a deferred locale that is silently restored as a modulepreload", () => {
    const distDir = fixture(
      1,
      "/assets/index-test.js",
      '<link rel="modulepreload" href="/assets/fr-regression.js">',
    );
    expect(() => inspectFrontendEntryBudget({ distDir })).toThrow(
      "frontend_deferred_locale_preloaded:/assets/fr-regression.js",
    );
  });
});
