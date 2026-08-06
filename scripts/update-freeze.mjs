#!/usr/bin/env node
// v62.2 CP7 / v62.3 — the ONLY sanctioned way to change a pre-ECL frozen hash,
// or to ADD a new frozen entry. No generic --force exists.
//
// UPDATE an existing entry:
//   --path=<frozen file> --reason="..." --confirm-token=<current sha256>
// ADD a new entry (v62.3):
//   --add --path=<file> --reason="..." --confirm-token=<current sha256>
//   Only allowed when the path is on the CURRENT STAGE's code-owned allowlist,
//   so --add can never be used to smuggle an unsanctioned file into the freeze.
//
// Records { date, type, path, oldHash, newHash, reason } in
// config/freeze-change-log.json.
import fs from "node:fs";
import crypto from "node:crypto";
import process from "node:process";
import { resolveStage, allowlistForStage, normalizePath } from "./lib/preEclFreeze.mjs";

const argOf = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : null;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);
const die = (msg) => { console.error(`update-freeze FAIL — ${msg}`); process.exit(1); };

const filePath = argOf("path");
const reason = argOf("reason");
const token = argOf("confirm-token");
const isAdd = hasFlag("add");
if (!filePath || !reason || !token) die("required: --path=… --reason=… --confirm-token=<sha256> [--add]");
if (!reason.trim()) die("--reason must not be empty");

const FREEZE = "config/pre-ecl-freeze.json";
const LOG = "config/freeze-change-log.json";
const freeze = JSON.parse(fs.readFileSync(FREEZE, "utf8"));

let stage;
try { stage = resolveStage(freeze); } catch (err) { die(err.message); }
const allowlist = allowlistForStage(stage).map(normalizePath);

if (!fs.existsSync(filePath)) die(`file missing: ${filePath}`);
const newHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
if (token !== newHash) die(`confirm token does not match the file's current sha256 (${newHash})`);

const existing = freeze.entries.find((e) => e.path === filePath);
const log = JSON.parse(fs.readFileSync(LOG, "utf8"));

if (isAdd) {
  if (existing) die(`already a frozen entry — use without --add: ${filePath}`);
  if (!allowlist.includes(normalizePath(filePath))) die(`--add refused: ${filePath} is not on the ${stage} allowlist`);
  freeze.entries.push({
    path: filePath,
    sha256: newHash,
    freezeReason: reason,
    allowedChange: false,
  });
  log.changes.push({ date: new Date().toISOString(), type: "freeze_add", stage, path: filePath, oldHash: null, newHash, reason });
} else {
  if (!existing) die(`not a frozen entry (use --add if it is allowlisted): ${filePath}`);
  if (newHash === existing.sha256) die("file hash unchanged — nothing to update");
  log.changes.push({ date: new Date().toISOString(), type: "freeze_update", stage, path: filePath, oldHash: existing.sha256, newHash, reason });
  existing.sha256 = newHash;
}

fs.writeFileSync(FREEZE, JSON.stringify(freeze, null, 2) + "\n");
fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + "\n");
console.log(`freeze ${isAdd ? "entry added" : "updated"} for ${filePath}; change logged in ${LOG}.`);