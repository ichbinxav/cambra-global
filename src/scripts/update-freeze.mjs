#!/usr/bin/env node
// v62.2 CP7 — the ONLY sanctioned way to change a pre-ECL frozen hash.
// No generic --force exists. Requires:
//   --path=<frozen file>        the entry to update
//   --reason="..."              non-empty human reason
//   --confirm-token=<newSha256> must equal the file's CURRENT sha256 (proves
//                               the operator inspected the new content)
// Records { date, path, oldHash, newHash, reason } in config/freeze-change-log.json.
import fs from "node:fs";
import crypto from "node:crypto";

const argOf = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : null;
};
const die = (msg) => { console.error(`update-freeze FAIL — ${msg}`); process.exit(1); };

const filePath = argOf("path");
const reason = argOf("reason");
const token = argOf("confirm-token");
if (!filePath || !reason || !token) die("required: --path=… --reason=… --confirm-token=<new sha256>");

const FREEZE = "config/pre-ecl-freeze.json";
const LOG = "config/freeze-change-log.json";
const freeze = JSON.parse(fs.readFileSync(FREEZE, "utf8"));
const entry = freeze.entries.find((e) => e.path === filePath);
if (!entry) die(`not a frozen entry: ${filePath}`);
if (!fs.existsSync(filePath)) die(`file missing: ${filePath}`);

const newHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
if (token !== newHash) die(`confirm token does not match the file's current sha256 (${newHash})`);
if (newHash === entry.sha256) die("file hash unchanged — nothing to update");

const log = JSON.parse(fs.readFileSync(LOG, "utf8"));
log.changes.push({ date: new Date().toISOString(), path: filePath, oldHash: entry.sha256, newHash, reason });
entry.sha256 = newHash;
fs.writeFileSync(FREEZE, JSON.stringify(freeze, null, 2) + "\n");
fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + "\n");
console.log(`freeze updated for ${filePath}; change logged in ${LOG}.`);