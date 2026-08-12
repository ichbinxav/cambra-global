#!/usr/bin/env node
import process from "node:process";
import { execFileSync } from "node:child_process";

export const REQUIRED_NODE = "24.19.0";
export const REQUIRED_NPM = "11.17.0";

const actualNode = process.versions.node;
let actualNpm = null;
try {
  actualNpm = execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
} catch {
  // A missing npm is a hard failure below; never infer a version.
}

const failures = [];
if (actualNode !== REQUIRED_NODE) failures.push(`Node ${REQUIRED_NODE} required; found ${actualNode || "UNKNOWN"}`);
if (actualNpm !== REQUIRED_NPM) failures.push(`npm ${REQUIRED_NPM} required; found ${actualNpm || "UNKNOWN"}`);

if (failures.length) {
  for (const failure of failures) console.error(`toolchain:check FAIL — ${failure}`);
  process.exit(1);
}
console.log(`toolchain:check PASS — Node ${actualNode}, npm ${actualNpm}`);
