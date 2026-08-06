#!/usr/bin/env node
// v62.3 — the ONLY sanctioned way to move the ECL freeze stage.
// Requires ALL of: --from=<current> --to=<target> --reason="..." --confirm=ADVANCE
// There is deliberately NO --force and NO way to widen the allowlist from the
// CLI: the allowlist for each stage is owned by scripts/lib/preEclFreeze.mjs,
// so an operator can move between declared stages but can never invent scope.
// Every transition is appended to config/freeze-change-log.json.
import fs from "node:fs";
import process from "node:process";
import { STAGES, STAGE_TRANSITIONS, allowlistForStage } from "./lib/preEclFreeze.mjs";

const argOf = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : null;
};
const die = (msg) => { console.error(`advance-stage FAIL — ${msg}`); process.exit(1); };

const from = argOf("from");
const to = argOf("to");
const reason = argOf("reason");
const confirm = argOf("confirm");

if (!from || !to || !reason || !confirm) die('required: --from=<stage> --to=<stage> --reason="..." --confirm=ADVANCE');
if (!reason.trim()) die("--reason must not be empty");
if (confirm !== "ADVANCE") die("--confirm must be exactly ADVANCE");
if (!STAGES.includes(from)) die(`unknown --from stage: ${from} (known: ${STAGES.join(", ")})`);
if (!STAGES.includes(to)) die(`unknown --to stage: ${to} (known: ${STAGES.join(", ")})`);
if (from === to) die("--from and --to are identical — nothing to advance");

const FREEZE = "config/pre-ecl-freeze.json";
const LOG = "config/freeze-change-log.json";
const freeze = JSON.parse(fs.readFileSync(FREEZE, "utf8"));

// The declared current stage must match --from: an operator who is wrong about
// where the repo stands must be stopped, not silently obeyed.
if (freeze.stage !== from) die(`repo stage is "${freeze.stage}", not "${from}" — refusing to advance from a state that is not current`);

const allowed = STAGE_TRANSITIONS[from] || [];
if (!allowed.includes(to)) die(`transition ${from} → ${to} is not declared (allowed from ${from}: ${allowed.join(", ") || "none"})`);

const nextAllowlist = allowlistForStage(to);
const log = JSON.parse(fs.readFileSync(LOG, "utf8"));
log.changes.push({
  date: new Date().toISOString(),
  type: "stage_advance",
  fromStage: from,
  toStage: to,
  allowlist: nextAllowlist,
  reason,
});

freeze.stage = to;
freeze.allowlist = nextAllowlist;
fs.writeFileSync(FREEZE, JSON.stringify(freeze, null, 2) + "\n");
fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + "\n");
console.log(`stage advanced ${from} → ${to}; allowlist now ${nextAllowlist.length} path(s); change logged in ${LOG}.`);