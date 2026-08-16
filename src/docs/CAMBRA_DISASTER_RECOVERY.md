# CAMBRA Disaster Recovery — SharePoint hard gate

## Truth boundary

The disaster-recovery gate is `PASS` only after a production snapshot has been uploaded to the independent corporate SharePoint location, restored into an isolated Base44 data environment, validated, timed and independently re-attested from production. Local tests and a successful upload alone are not a restore proof.

Target:

- Tenant: `globalcambra.sharepoint.com`
- Site: `CAMBRA INFRASTRUCTURE`
- Root: `Production Backups`
- Folders: `Daily`, `Weekly`, `Monthly`, `Manifests`, `Restore Evidence`
- RPO target: 24 hours
- RTO target: 8 hours

Production data and encrypted backup artifacts must never be stored in GitHub.

## Architecture

The existing `maintenanceEngine` is the only Base44 physical function used. Its internal `disasterRecoveryBackup` route runs daily at 01:30 UTC, and the same entry point exposes admin/internal-only status, backup, restore and attestation actions. This adds no physical Base44 function.

Each first, weekly and monthly run is a full snapshot. Other daily runs are incremental and contain changed records plus tombstones. Every checked-in Base44 entity is generated into the canonical entity catalog. Ephemeral OAuth state/code records are excluded, and the platform-managed `User` entity is reconciled by email during restore instead of recreating authentication identities.

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

`Sites.Selected` does not grant access by itself. A Microsoft 365 administrator must separately assign the application the `write` role on the exact `CAMBRA INFRASTRUCTURE` site:

```http
POST https://graph.microsoft.com/v1.0/sites/{CAMBRA_INFRASTRUCTURE_SITE_ID}/permissions
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

Store these values only in Base44 secrets:

```text
MS_GRAPH_TENANT_ID
MS_GRAPH_CLIENT_ID
MS_GRAPH_CLIENT_SECRET
DR_SHAREPOINT_SITE_ID
DR_SHAREPOINT_DRIVE_ID                 # recommended
DR_BACKUP_AES256_KEY_B64               # exactly 32 random bytes, base64
CAMBRA_GIT_SHA
CAMBRA_SOURCE_TREE_HASH
```

Alternative site/drive resolution is available through `DR_SHAREPOINT_SITE_PATH` and `DR_SHAREPOINT_DRIVE_NAME`. Defaults are hostname `globalcambra.sharepoint.com`, drive `Documents` and root `Production Backups`.

Do not paste credentials into tickets, chat, source control or evidence. Rotate the client secret and AES key through Base44 secret management. Retain the AES key in a separately controlled recovery escrow: without it, encrypted backups are intentionally unrecoverable.

## Controlled proof procedure

1. From production, invoke `maintenanceEngine` with `action: "dr_status"` and `verify_remote: true`. The exact SharePoint identity and all five folders must resolve.
2. From production, invoke it with `action: "dr_backup"` and `backup_mode: "FULL"`. Preserve the returned manifest path and hashes.
3. Invoke the same deployed function against Base44 `X-Data-Env: dev` with:

```json
{
  "action": "dr_restore",
  "manifest_path": "Manifests/{backup-id}.manifest.json",
  "confirmation": "RESTORE_TO_ISOLATED_NON_PRODUCTION",
  "wipe_target": true
}
```

The function hard-rejects the default or production data environment. The selected isolated target is wiped, restored with Base44-generated IDs, then all exact relationships and backed-up file URLs are remapped in a second pass.

4. The restore verifies the manifest chain, ciphertext and plaintext hashes, AES-GCM authentication, attachment hashes, per-entity counts, deterministic record hashes and unresolved relationship references. It measures observed RPO/RTO and uploads raw evidence into `Restore Evidence`.
5. Back in production, invoke `action: "dr_attest_restore"` with the evidence path and file SHA-256 returned by step 3. Production downloads and independently verifies the evidence before writing a `PASS` `DisasterRecoveryExercise` and `REAL_RESTORE` runtime-gate record.
6. Confirm the latest backup and real restore appear in Founder Admin → Maintenance. A missing, stale or failed proof keeps production readiness blocked.

## Failure behaviour

- Missing configuration returns `dr_configuration_required` and only the missing secret names.
- Microsoft authorization/storage errors remain hard failures.
- A failed scheduled backup opens or refreshes one deduplicated critical `AutonomyIncident`.
- Restore is impossible without an explicit isolated data environment, exact confirmation phrase and `wipe_target: true`.
- Source credentials and OAuth material are intentionally not restored. Provider credentials must be reconnected or rotated after a real disaster.
- A restore whose counts, hashes, relationships, attachments, RPO or RTO fail cannot be attested as `PASS`.

