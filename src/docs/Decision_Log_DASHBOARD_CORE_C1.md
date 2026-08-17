# Decision Log — DASHBOARD CORE C1 (navigation registry, workspace contract, gates)

Date: 2026-08-17
Scope: C1 — final navigation registry, the shared Operating Workspace framework, and
the first three gate scripts.

External effects: **zero**.

## 1. The sidebar was NOT cut to twelve entries, on purpose

C1 builds the registry and the framework. It does **not** flip the sidebar.

Cutting the sidebar to twelve now would remove the founder's access to 31 working pages
while `/admin/audits` and `/admin/recover` do not yet exist. §2.5 forbids retiring a legacy
route before parity, redirect, deep-link preservation, data preservation, navigation tests
and documentation are all demonstrated, and §24 puts that removal in C13.

So `config/dashboard/navigation.v1.json` declares **both** states — the twelve-entry target
and the twelve tracked legacy redirects, each with its blocker. A registry that described
only the target would make the gap invisible, which is the opposite of the point.

## 2. The framework was extracted, not designed

`base44/shared/workspaceContract.ts` is derived from the shape
`AdminMerchants` + `getFounderControlCenter` already use
(`AdminMerchants.jsx:118-124`): one server function, a `view` + `action` discriminator, and
zero `base44.entities` calls in the page.

What the contract adds is the part Merchants does inline and the other four must not each
reinvent: a declared envelope with source health, truth classes and freshness, plus
fail-closed helpers.

It deliberately does **not** wrap `readRuntimeSource`. That module already answers "did the
read happen" truthfully — `COMPLETE` / `INCOMPLETE` / `UNAVAILABLE`, with `records_read`
null on failure — and is the only place in the repo where that question is answered
honestly. The contract builds on it.

### Decisions inside the contract

- **`kpi()` refuses to attach a truth class to a value whose sources did not load.** It
  returns `value: null` with `truth_class: 'UNKNOWN'` and names the missing sources. A
  genuine zero still reports a confident zero.
- **A truncated source demotes `OBSERVED` to `DERIVED`.** A truncated read is a lower
  bound, not an observation.
- **`extra` is spread FIRST** so the authoritative fields always win. Spreading it last
  would let a caller's key silently overwrite the verdict — a mistake already made once in
  this repo's campaign preflight and caught by a test. There is now a test for it here too.
- **`sortKeepingUnknownLast` keeps unknowns last in BOTH directions.** A null sorted as
  zero ascending is how an unread merchant ends up looking like the cheapest one.
- **`items.total` is `null` when uncomputable**, never 0.
- **Every response carries `external_send_performed: false`**, so no workspace surface can
  imply it sent something.

## 3. The gate found a real gap in C0's own inventory — corrected, not hidden

`legacy-routes:check` failed on its first run. It scans all of `src/pages/admin` and
`src/components/admin`; C0's reader had been scoped to the 16 legacy pages the prompt
names. **Seven more direct-CRUD sites existed**, and the two worst are worse than anything
C0 found:

| Site | Severity | Why |
|---|---|---|
| `OAuthAppsPanel.jsx:46-47,67` | **CRITICAL** | The OAuth **client secret** is generated in the browser via `randomToken('cmb_secret_', 24)` and written through generic CRUD. Credential entropy must not come from client JS. Revocation at `:67` is also a browser-side generic write. |
| `WebhooksTable.jsx:41,53` | **CRITICAL** | Creates and **hard-deletes** outbound webhook delivery configuration from the browser, with no governed handler and no receipt. Standing configuration is a material effect class. |
| `OrganizationsPanel.jsx` | MEDIUM | Tenant identity written from the browser. |
| `AdminUserDetail.jsx` | LOW | `AdminNote.create`. |

Corrected total: **12 write operations across 8 files** (2 CRITICAL, 2 HIGH, 2 MEDIUM,
2 LOW). C0's deliverables were amended rather than left standing — `Dashboard_Authority_Map.json`
carries a `direct_browser_crud_defects_correction` block and the gap map's SEC-1 item was
rewritten.

**The gate was not weakened to make it pass.** Its design is a ratchet: known sites are
reported every run with their severity, and any **new** site fails the build. The seven
found are pre-existing, so they belong in the known list — not in a relaxed rule.

The two CRITICAL sites are Advanced System surfaces and are scheduled for C12. They are
listed as blockers below because they are the most serious finding of the programme so far.

## 4. Gates created

| Script | What it enforces |
|---|---|
| `dashboard:navigation:check` | 12 target entries, groups valid, LIVE routes exist, a route declared `NOT_BUILT` must not secretly exist, every pending redirect states a blocker, physical target stays 276 |
| `dashboard:workspace-contract:check` | The contract exports every primitive, all nine truth classes present, the reference page stays write-free and keeps its single-aggregator call, any built workspace page is write-free |
| `legacy-routes:check` | Legacy routes exist or redirect, ready redirects are wired, direct-CRUD ratchet with regression failure, unbacked UI claims reported |

All three are wired into `verify` and `verify:chunk` immediately after `retention:check`.

The remaining five gates §25 names (`pipeline:check`, `audits-opportunities:check`,
`recover:check`, `finance:check`, `intelligence:workspace:check`) land with their own
chunks, because a gate for a workspace that does not exist would either be empty or lie.

## 5. Blockers

1. **`OAuthAppsPanel.jsx` generates an OAuth client secret in the browser.** Highest
   severity item in the programme. C12.
2. **`WebhooksTable.jsx` creates and hard-deletes webhook configuration from the browser.**
   C12.
3. Ten further direct-CRUD writes, tracked by the ratchet.
4. `/admin/audits` and `/admin/recover` do not exist, so the sidebar cannot be cut.

## 6. Runtime pending

Unchanged. `productionSealEligible` remains **false**.

## 7. Files

```
config/dashboard/navigation.v1.json              (new)
base44/shared/workspaceContract.ts               (new)
scripts/check-dashboard-navigation.mjs           (new)
scripts/check-dashboard-workspace-contract.mjs   (new)
scripts/check-legacy-routes.mjs                  (new)
src/lib/dashboardWorkspaceContractC1.test.js     (new, 27 tests)
config/dashboard/Dashboard_Authority_Map.json    (corrected: 5 -> 12 CRUD writes)
config/dashboard/Dashboard_Gap_Map.json          (corrected: SEC-1 rewritten)
package.json                                     (3 gates registered and wired)
```
