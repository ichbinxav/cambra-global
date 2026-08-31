# CAMBRA Disaster Recovery — SharePoint hard gate

Runbook version: `cambra-dr-1.2.0` (2026-08-21)

## Truth boundary

The disaster-recovery gate is `PASS` only after a production snapshot has been uploaded to the independent corporate SharePoint location, restored into an isolated Base44 data environment, validated, timed and independently re-attested from production. Local tests and a successful upload alone are not a restore proof.

Target:

- Tenant/hostname: `globalcambra.sharepoint.com`
- Canonical root-site ID: `globalcambra.sharepoint.com,1d97af95-b56a-4e67-ae13-7780e2da65f6,591e702a-e5d8-4b2a-8c05-79813de2c411`
- Dedicated document library: `CAMBRA INFRASTRUCTURE`
- Canonical drive ID: `b!la-XHWq1Z06uE3eA4tpl9ipwHlnY5SpLjAV5gT3ixBH3DsFhdMXTQbUPE9gM2Cc3`
- Root: `Production Backups`
- Folders: `Daily`, `Weekly`, `Monthly`, `Manifests`, `Restore Evidence`
- RPO target: 24 hours
- RTO target: 8 hours

Production data and encrypted backup artifacts must never be stored in GitHub.

## Architecture

The existing `maintenanceEngine` is the only Base44 physical function used. Its internal `disasterRecoveryBackup` route runs daily at 01:30 UTC, and the same entry point exposes admin/internal-only status, backup, restore and attestation actions. This adds no physical Base44 function.

Each first, weekly and monthly run is a full snapshot. Other daily runs are incremental and contain changed records plus tombstones. Every checked-in Base44 entity is generated into the canonical entity catalog. Ephemeral OAuth state/code records are excluded, and the platform-managed `User` entity is reconciled by email during restore instead of recreating authentication identities.

When the canonical entity catalog legitimately changes, the previous latest checkpoint remains immutable and is fully authenticated against its own manifest/index catalog. It is accepted only as the compare-and-swap anchor for a new `FULL` backup; it is never used as an incremental base under the new catalog. The new full snapshot starts a current-catalog restore chain, and the prior backup remains retained under the normal policy. Remote status reports `LEGACY_COMPATIBLE` plus `requires_full_rebase: true` until that rebase completes.

Backup chunk work is invoked through an internal-only route on the existing `getMaintenanceCenter` physical function. This avoids recursive `maintenanceEngine` version-cache drift while preserving the 276-function quota. The host and the shared chunk handler both require canonical internal authority; an admin browser request cannot execute a chunk directly.

Before leaving CAMBRA:

1. secret-like fields are removed recursively;
2. Base44-owned attachments are downloaded and hashed;
3. snapshot, checkpoint journal and attachments are gzip-compressed;
4. every artifact is encrypted using AES-256-GCM with a unique 96-bit IV and authenticated context;
5. plaintext and ciphertext SHA-256 values are recorded;
6. only ciphertext plus metadata-only manifests are sent to SharePoint.

Manifests record schema/catalog/release versions, Git SHA, source-tree hash, timestamps, checkpoints, entity counts, attachment counts, redaction totals, hashes and retention policy. Encryption keys and Microsoft credentials are never written to manifests or logs.

Retention defaults are 35 days for Daily, 91 days for Weekly, 400 days for Monthly and Manifests, and seven years for Restore Evidence.

## Microsoft Entra least-privilege setup

Create one application registration named `CAMBRA Production Backup`. Give it only the Microsoft Graph **application** permission `Sites.Selected`, then grant tenant admin consent.

`Sites.Selected` does not grant access by itself. A Microsoft 365 administrator must separately assign the application the `write` role on the exact canonical root site shown above:

```http
POST https://graph.microsoft.com/v1.0/sites/{CANONICAL_ROOT_SITE_ID}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [{
    "application": {
      "id": "{CAMBRA_BACKUP_APPLICATION_CLIENT_ID}",
      "displayName": "CAMBRA Production Backup"
    }
  }]
}
```

The administrator performing this one-time grant needs an identity allowed to manage site permissions. The runtime application must not receive `Sites.ReadWrite.All` or `Sites.FullControl.All`.

The `Sites.Selected` grant is site-scoped and therefore covers the root site's document libraries, including `CAMBRA INFRASTRUCTURE`; the library is not itself the grant target. Library-only scope would require a different design based on `Lists.SelectedOperations.Selected`, which this runtime does not implement or claim.

Configure these values in the Base44 runtime environment. Mark the Entra credentials and AES key as secrets; the site/drive/root values are non-secret resource configuration:

```text
MS_GRAPH_TENANT_ID
MS_GRAPH_CLIENT_ID
MS_GRAPH_CLIENT_SECRET
DR_SHAREPOINT_SITE_ID
DR_SHAREPOINT_DRIVE_ID
DR_SHAREPOINT_DRIVE_NAME               # CAMBRA INFRASTRUCTURE
DR_SHAREPOINT_ROOT_FOLDER              # Production Backups
DR_BACKUP_AES256_KEY_B64               # exactly 32 random bytes, base64
DR_MAX_FILE_BYTES                      # optional integer; default 104857600, maximum 1073741824
CAMBRA_RELEASE_VERSION                 # deployment-owned release version, for example 0.98.0
CAMBRA_GIT_SHA
CAMBRA_SOURCE_TREE_HASH
```

The canonical production configuration uses the exact site and drive IDs above. These IDs identify SharePoint resources; they are not authentication secrets, but they remain environment configuration so a target change cannot silently alter code. Credentials and the AES key are secrets and must stay in Base44 secret storage.

`DR_SHAREPOINT_SITE_ID` and `DR_SHAREPOINT_SITE_PATH` are mutually exclusive. Path-based site resolution and exact-name drive resolution remain available only for controlled non-production diagnosis. Production backup, restore, attestation and remote status require the canonical site and drive IDs. The runtime verifies the resolved IDs against those constants, verifies that the drive belongs to the selected site, and requires its observed name to be exactly `CAMBRA INFRASTRUCTURE`. Name fallback paginates the complete drive collection, rejects zero or multiple exact matches, and never falls back to `Documents`, `Shared Documents` or another library. `DR_SHAREPOINT_ROOT_FOLDER` must resolve exactly to `Production Backups`, preventing a typo or alternate root from creating a second backup authority.

Preflight also requires `DR_BACKUP_AES256_KEY_B64` to decode to exactly 32 bytes, a bounded deployment-owned `CAMBRA_RELEASE_VERSION`, `CAMBRA_GIT_SHA` to be a 40-character hexadecimal Git SHA, and `CAMBRA_SOURCE_TREE_HASH` to be a 64-character SHA-256 tree hash. The release version, Git SHA and source-tree hash are copied into the AES-GCM-authenticated snapshot payload as well as the manifest; restore requires exact equality, so a SharePoint writer cannot rewrite release provenance by merely recomputing the public manifest hash. If configured, `DR_MAX_FILE_BYTES` must be a positive safe integer no larger than 1 GiB; an invalid value blocks preflight and cannot silently disable the attachment limit.

Do not paste credentials into tickets, chat, source control or evidence. Rotate the client secret and AES key through Base44 secret management. Retain the AES key in a separately controlled recovery escrow: without it, encrypted backups are intentionally unrecoverable.

## Controlled proof procedure

1. From production, invoke `maintenanceEngine` with `action: "dr_status"` and omit `verify_remote` (or set it to `false`). This configuration-only bootstrap preflight must report:
   - `configuration.ok === true`, with empty `missing` and `invalid` arrays;
   - `configuration.destination.site_resolution === "EXACT_ID"`;
   - `configuration.destination.drive_resolution === "EXACT_ID"`;
   - `configuration.destination.canonical_target === true`;
   - `configuration.file_size_limit.valid === true`.

   Do not use remote verification as the first bootstrap operation: it is intentionally read-only and must not create missing folders.
2. Invoke `action: "dr_backup"` with `backup_mode: "FULL"` once under controlled production supervision. This is the only bootstrap operation allowed to initialize the canonical `Production Backups` folder structure. Preserve the returned manifest path and hashes.
3. Invoke `action: "dr_status"` with `verify_remote: true`. Now require:
   - returned `remote.identity.site_id` and `remote.identity.drive_id` match the canonical IDs above;
   - `remote.identity.drive_name === "CAMBRA INFRASTRUCTURE"` and `remote.identity.root_folder === "Production Backups"`;
   - `remote.read_only === true` and all five folders resolve without creating or repairing any folder.

   Keep readiness blocked until `scheduler.healthy === true` is backed by a real scheduled ATTEMPT with `claim_acquired === true`, cadence exactly 86,400 seconds, and a capture inside the 24-hour RPO. A manually invoked bootstrap backup does not satisfy this scheduler gate.

   `scheduler.status` is derived from durable `SchedulerRun` attempts for `disasterRecoveryBackup`. A healthy attempt must be `COMPLETED`, have valid non-future `started_at` and `completed_at`, and have started/captured its checkpoint no more than the 24-hour RPO ago. The RPO clock never uses only `completed_at`, so a long-running backup cannot become falsely healthy by finishing recently. `INACTIVE_OR_UNOBSERVED` means no scheduled attempt exists; `INACTIVE_OR_STALE` means the latest valid capture is beyond the RPO. A future timestamp, missing completion, unknown terminal status, failed/review-required attempt, or expired/stale `RUNNING` lease cannot set `observed_active`. The handler cannot introspect Base44's automation switch, so an inactive/stale status requires checking the deployed automation and then observing a fresh scheduled completion. A manually invoked backup does not satisfy this scheduler check.
4. Invoke the same deployed function against Base44 `X-Data-Env: dev` with:

```json
{
  "action": "dr_restore",
  "manifest_path": "Manifests/{backup-id}.manifest.json",
  "confirmation": "RESTORE_TO_ISOLATED_NON_PRODUCTION",
  "wipe_target": true
}
```

The function hard-rejects the default or production data environment. The selected isolated target is wiped, restored with Base44-generated IDs, then all exact relationships and backed-up file URLs are remapped in a second pass.

5. The restore verifies manifest/checkpoint continuity, ciphertext and plaintext hashes, AES-GCM authentication, attachment hashes and the actual downloaded ciphertext, compressed and plaintext byte lengths, per-entity counts, deterministic record hashes and unresolved relationship references. It measures observed RPO/RTO and uploads AES-256-GCM-authenticated evidence into `Restore Evidence`. The isolated exercise remains `BLOCKED` pending production attestation; local integrity alone is not a production PASS.
6. Back in production, invoke `action: "dr_attest_restore"` with the encrypted evidence path and file SHA-256 returned by step 4. Production downloads and decrypts the evidence, re-verifies every referenced manifest and encrypted snapshot, and validates the complete timeline, metrics and target identity. It persists the short-lived runtime-identity probe, reads it back by ID, proves that it is the unique latest probe authority, and then closes it with a read-back-verified `BLOCKED` row before the `DisasterRecoveryExercise` can become `PASS`. The complete Exercise projection is read back both by ID and through an exact `exercise_key` query; exactly one row with the same ID and field-for-field projection is required. The authoritative `REAL_RESTORE` PASS is created last, binds the canonical Exercise-projection hash and a deterministic compensation-incident key, is read back from the datastore, verified, and proven to be the unique latest `REAL_RESTORE` row; after that successful authority write the only attempted mutation is a best-effort `OperationalLog`. GO-live and production-readiness consumers never accept those embedded claims alone: they repeat the exact Exercise and compensation-marker reads and require one coherent live `PASS` projection with no open/ambiguous marker. Any failure compensates the runtime gate first and verifies that its `BLOCKED` row is uniquely latest before mutating the Exercise. If gate compensation cannot be proven, the Exercise is left untouched, a read-back-verified critical marker is attempted, and `DR_RESTORE_COMPENSATION_AMBIGUOUS` is returned. A failed marker write is also reported as compensation ambiguity; without a successful datastore marker there is no durable claim that the residual row was fenced, so operators must keep release readiness blocked until the exact authorities are inspected and reconciled.
7. Confirm the latest backup and real restore appear in Founder Admin → Maintenance. A missing, stale, unauthoritative or failed proof keeps production readiness blocked.

## Failure behaviour

- Missing or unsafe configuration returns `dr_configuration_required` with separate `missing` and `invalid` names; credentials and key values are never returned.
- Site-ID/path ambiguity, a non-canonical root, an unknown drive, duplicate exact-name drives, a drive outside the selected site, or a drive-name mismatch all fail closed before any folder or backup artifact is created.
- Remote status is read-only: it never calls folder creation or repair. A missing folder remains a hard diagnostic failure for an operator to resolve through the controlled backup/bootstrap path.
- Missing/stale scheduled-attempt evidence is visible in `dr_status.scheduler` and cannot be mistaken for a healthy daily automation.
- A valid older entity catalog forces a new full backup. A malformed or internally inconsistent catalog still returns `DR_CHECKPOINT_IDENTITY_MISMATCH` and cannot become a rebase anchor.
- Microsoft authorization/storage errors remain hard failures.
- Microsoft Graph and upload-session errors retain only bounded status/code metadata; capability URLs, tokens and raw `Error` objects are not returned or logged.
- Both simple and chunked Graph uploads require a drive-item receipt with an exact byte count; malformed successful responses cannot advance backup completion.
- A failed scheduled backup opens or refreshes one deduplicated critical `AutonomyIncident`.
- Restore is impossible without an explicit isolated data environment, exact confirmation phrase and `wipe_target: true`.
- Source credentials and OAuth material are intentionally not restored. Provider credentials must be reconnected or rotated after a real disaster.
- A restore whose counts, hashes, relationships, attachments, RPO or RTO fail cannot be attested as `PASS`.
