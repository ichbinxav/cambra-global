export const INTEGRATION_CREDENTIAL_BOUNDARY_VERSION = 'integration-credential-boundary-2026.08.13';

export const INTEGRATION_TENANT_ROUTE_INVENTORY = Object.freeze([
  Object.freeze({ route: 'oauthConnector', operations: Object.freeze(['start', 'callback', 'refresh', 'connect_api_key', 'connect_basic_auth']) }),
  Object.freeze({ route: 'dataSyncAgent', operations: Object.freeze(['sync']) }),
  Object.freeze({ route: 'getIntegrationStatus', operations: Object.freeze(['project_metadata']) }),
  Object.freeze({ route: 'stripeConnectionDisconnect', operations: Object.freeze(['revoke']) }),
  Object.freeze({ route: 'maintenanceEngine', operations: Object.freeze(['credential_health', 'refresh']) }),
]);

const CREDENTIAL_TYPES = new Set(['oauth_token', 'api_key', 'basic_auth', 'webhook_secret']);
const ACTIVE = 'active';

export class IntegrationCredentialBoundaryError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 409) {
    super(code);
    this.name = 'IntegrationCredentialBoundaryError';
    this.code = code;
    this.status = status;
  }
}

export function isIntegrationCredentialBoundaryError(error: unknown): error is IntegrationCredentialBoundaryError {
  return error instanceof IntegrationCredentialBoundaryError;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function boundaryError(code: string, status = 409): never {
  throw new IntegrationCredentialBoundaryError(code, status);
}

function credentialKey(brandId: string, integrationId: string) {
  return `integration-credential:${brandId}:${integrationId}`;
}

export function isEncryptedIntegrationCredential(value: unknown) {
  return typeof value === 'string'
    && /^v1:[A-Za-z0-9+/_=-]+:[A-Za-z0-9+/_=-]+$/.test(value);
}

function requireCipher(value: unknown, field: string, optional = false) {
  if ((value === null || value === undefined || value === '') && optional) return null;
  if (!isEncryptedIntegrationCredential(value)) boundaryError(`${field}_ciphertext_invalid`, 500);
  return value as string;
}

function typeForIntegration(integration: any) {
  const method = text(integration?.metadata_json?.auth_method) || 'oauth';
  if (method === 'api_key') return 'api_key';
  if (method === 'basic_auth') return 'basic_auth';
  return 'oauth_token';
}

async function exactIntegration(service: any, integrationIdValue: unknown, brandIdValue: unknown) {
  const integrationId = text(integrationIdValue);
  const brandId = text(brandIdValue);
  if (!integrationId || !brandId) boundaryError('integration_binding_not_available', 404);
  const integration = await service.entities.Integration.get(integrationId);
  if (!integration || text(integration.id) !== integrationId || text(integration.brand_id) !== brandId) {
    boundaryError('integration_binding_not_available', 404);
  }
  return integration;
}

async function rowsForIntegration(service: any, integrationId: string) {
  const rows = await service.entities.IntegrationCredential.filter(
    { integration_id: integrationId },
    '-updated_at',
    100,
  );
  return Array.isArray(rows) ? rows : [];
}

function activeCredentialRow(rows: any[], integrationId: string, brandId: string) {
  const foreign = rows.filter((row) => text(row.integration_id) === integrationId && text(row.brand_id) !== brandId);
  if (foreign.length) boundaryError('integration_credential_binding_ambiguous');
  const active = rows.filter((row) => (
    text(row.integration_id) === integrationId
    && text(row.brand_id) === brandId
    && text(row.status || ACTIVE) === ACTIVE
  ));
  if (active.length > 1) boundaryError('integration_credential_authority_ambiguous');
  return active[0] || null;
}

function credentialProjection(row: any, source: 'credential' | 'legacy_migrated' = 'credential') {
  return Object.freeze({
    id: text(row.id),
    brand_id: text(row.brand_id),
    integration_id: text(row.integration_id),
    credential_type: text(row.credential_type),
    credential_version: Number(row.credential_version || 1),
    encrypted_access_token: row.encrypted_access_token || null,
    encrypted_refresh_token: row.encrypted_refresh_token || null,
    status: text(row.status || ACTIVE),
    source,
  });
}

function verifyPersistedRow(row: any, expected: any) {
  if (!row
    || text(row.integration_id) !== expected.integration_id
    || text(row.brand_id) !== expected.brand_id
    || text(row.status) !== expected.status
    || text(row.credential_type) !== expected.credential_type
    || Number(row.credential_version) !== Number(expected.credential_version)
    || (expected.encrypted_access_token || null) !== (row.encrypted_access_token || null)
    || (expected.encrypted_refresh_token || null) !== (row.encrypted_refresh_token || null)) {
    boundaryError('integration_credential_readback_mismatch');
  }
  return row;
}

async function scrubLegacyAfterCredentialReadback(service: any, integration: any, persisted: any) {
  verifyPersistedRow(persisted, persisted);
  if (!integration.access_token && !integration.refresh_token) return;
  await service.entities.Integration.update(integration.id, {
    access_token: null,
    refresh_token: null,
  });
  const scrubbed = await service.entities.Integration.get(integration.id);
  if (!scrubbed
    || text(scrubbed.brand_id) !== text(integration.brand_id)
    || scrubbed.access_token
    || scrubbed.refresh_token) {
    boundaryError('integration_legacy_credential_scrub_unverified');
  }
}

export async function resolveOwnedBrandForIntegrationActor(service: any, input: any) {
  const brandId = text(input?.brand_id);
  const email = text(input?.actor?.email).toLowerCase();
  const brand = brandId ? await service.entities.Brand.get(brandId) : null;
  const isAdmin = input?.actor?.role === 'admin';
  const owner = brand && email && [brand.created_by, brand.contact_email]
    .map((value) => text(value).toLowerCase())
    .includes(email);
  if (!brand || (!isAdmin && !owner)) boundaryError('integration_tenant_resource_not_available', 404);
  return brand;
}

export async function resolveOwnedIntegrationForActor(service: any, input: any) {
  const integrationId = text(input?.integration_id);
  const integration = integrationId ? await service.entities.Integration.get(integrationId) : null;
  if (!integration) boundaryError('integration_tenant_resource_not_available', 404);
  if (input?.brand_id && text(input.brand_id) !== text(integration.brand_id)) {
    boundaryError('integration_tenant_resource_not_available', 404);
  }
  await resolveOwnedBrandForIntegrationActor(service, {
    brand_id: integration.brand_id,
    actor: input?.actor,
  });
  return integration;
}

export async function findExactIntegrationForProvider(service: any, input: any) {
  const brandId = text(input?.brand_id);
  const provider = text(input?.provider);
  if (!brandId || !provider) boundaryError('integration_provider_binding_invalid', 400);
  const rows = await service.entities.Integration.filter(
    { brand_id: brandId, provider },
    '-created_date',
    100,
  );
  const exact = (Array.isArray(rows) ? rows : []).filter((row) => (
    text(row.brand_id) === brandId && text(row.provider) === provider
  ));
  if (exact.length > 1) boundaryError('integration_provider_authority_ambiguous');
  return exact[0] || null;
}

export async function createIntegrationCredential(service: any, input: any) {
  const integration = await exactIntegration(service, input?.integration_id, input?.brand_id);
  const integrationId = text(integration.id);
  const brandId = text(integration.brand_id);
  const credentialType = text(input?.credential_type) || typeForIntegration(integration);
  if (!CREDENTIAL_TYPES.has(credentialType)) boundaryError('integration_credential_type_invalid', 400);
  const encryptedAccess = requireCipher(input?.encrypted_access_token, 'access_token');
  const encryptedRefresh = requireCipher(input?.encrypted_refresh_token, 'refresh_token', true);
  const rows = await rowsForIntegration(service, integrationId);
  if (activeCredentialRow(rows, integrationId, brandId)) {
    boundaryError('integration_credential_already_exists');
  }
  const now = new Date().toISOString();
  const expected = {
    brand_id: brandId,
    integration_id: integrationId,
    credential_key: credentialKey(brandId, integrationId),
    credential_type: credentialType,
    encrypted_access_token: encryptedAccess,
    encrypted_refresh_token: encryptedRefresh,
    encryption_version: 'v1',
    credential_version: 1,
    scopes: Array.isArray(input?.scopes) ? input.scopes.map(text).filter(Boolean) : [],
    expires_at: input?.expires_at || null,
    status: ACTIVE,
    created_at: now,
    updated_at: now,
  };
  const created = await service.entities.IntegrationCredential.create(expected);
  const readbackRows = await rowsForIntegration(service, integrationId);
  const readback = activeCredentialRow(readbackRows, integrationId, brandId);
  if (!readback || (created?.id && readback.id !== created.id)) {
    boundaryError('integration_credential_create_readback_ambiguous');
  }
  verifyPersistedRow(readback, expected);
  await scrubLegacyAfterCredentialReadback(service, integration, readback);
  return credentialProjection(readback);
}

export async function readIntegrationCredential(service: any, input: any) {
  const integration = await exactIntegration(service, input?.integration_id, input?.brand_id);
  const integrationId = text(integration.id);
  const brandId = text(integration.brand_id);
  const rows = await rowsForIntegration(service, integrationId);
  const row = activeCredentialRow(rows, integrationId, brandId);

  if (row) {
    requireCipher(row.encrypted_access_token, 'access_token');
    requireCipher(row.encrypted_refresh_token, 'refresh_token', true);
    if ((integration.access_token && integration.access_token !== row.encrypted_access_token)
      || (integration.refresh_token && integration.refresh_token !== row.encrypted_refresh_token)) {
      boundaryError('integration_credential_source_conflict');
    }
    await scrubLegacyAfterCredentialReadback(service, integration, row);
    return credentialProjection(row);
  }

  if (!integration.access_token && !integration.refresh_token) {
    boundaryError('integration_credential_not_available', 404);
  }
  requireCipher(integration.access_token, 'legacy_access_token');
  requireCipher(integration.refresh_token, 'legacy_refresh_token', true);
  const migrated = await createIntegrationCredential(service, {
    integration_id: integrationId,
    brand_id: brandId,
    credential_type: typeForIntegration(integration),
    encrypted_access_token: integration.access_token,
    encrypted_refresh_token: integration.refresh_token || null,
    scopes: integration.scopes || [],
    expires_at: integration.access_token_expires_at || null,
  });
  return Object.freeze({ ...migrated, source: 'legacy_migrated' as const });
}

export async function rotateIntegrationCredential(service: any, input: any) {
  const current = await readIntegrationCredential(service, input);
  const integration = await exactIntegration(service, current.integration_id, current.brand_id);
  const encryptedAccess = requireCipher(input?.encrypted_access_token, 'access_token');
  const encryptedRefresh = input?.encrypted_refresh_token === undefined
    ? current.encrypted_refresh_token
    : requireCipher(input.encrypted_refresh_token, 'refresh_token', true);
  const credentialType = text(input?.credential_type) || current.credential_type;
  if (!CREDENTIAL_TYPES.has(credentialType)) boundaryError('integration_credential_type_invalid', 400);
  const now = new Date().toISOString();
  const expected = {
    brand_id: current.brand_id,
    integration_id: current.integration_id,
    credential_type: credentialType,
    encrypted_access_token: encryptedAccess,
    encrypted_refresh_token: encryptedRefresh,
    encryption_version: 'v1',
    credential_version: current.credential_version + 1,
    scopes: Array.isArray(input?.scopes) ? input.scopes.map(text).filter(Boolean) : undefined,
    expires_at: input?.expires_at === undefined ? undefined : input.expires_at,
    status: ACTIVE,
    rotated_at: now,
    updated_at: now,
  };
  const update = Object.fromEntries(Object.entries(expected).filter(([, value]) => value !== undefined));
  await service.entities.IntegrationCredential.update(current.id, update);
  const readback = await service.entities.IntegrationCredential.get(current.id);
  verifyPersistedRow(readback, expected);
  await scrubLegacyAfterCredentialReadback(service, integration, readback);
  return credentialProjection(readback);
}

export async function persistIntegrationCredential(service: any, input: any) {
  try {
    await readIntegrationCredential(service, input);
    return await rotateIntegrationCredential(service, input);
  } catch (error) {
    if (isIntegrationCredentialBoundaryError(error) && error.code === 'integration_credential_not_available') {
      return createIntegrationCredential(service, input);
    }
    throw error;
  }
}

export async function revokeIntegrationCredential(service: any, input: any) {
  const integration = await exactIntegration(service, input?.integration_id, input?.brand_id);
  const integrationId = text(integration.id);
  const brandId = text(integration.brand_id);
  const rows = await rowsForIntegration(service, integrationId);
  const active = activeCredentialRow(rows, integrationId, brandId);
  const revoked = rows.filter((row) => (
    text(row.integration_id) === integrationId
    && text(row.brand_id) === brandId
    && text(row.status) === 'revoked'
  ));
  if (!active && revoked.length > 1) boundaryError('integration_credential_revocation_ambiguous');
  const now = new Date().toISOString();
  let readback: any;
  if (active) {
    const expected = {
      brand_id: brandId,
      integration_id: integrationId,
      credential_type: text(active.credential_type) || typeForIntegration(integration),
      credential_version: Number(active.credential_version || 1) + 1,
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      status: 'revoked',
      revoked_at: now,
      updated_at: now,
    };
    await service.entities.IntegrationCredential.update(active.id, expected);
    readback = await service.entities.IntegrationCredential.get(active.id);
    verifyPersistedRow(readback, expected);
  } else if (revoked.length === 1) {
    readback = revoked[0];
  } else {
    const expected = {
      brand_id: brandId,
      integration_id: integrationId,
      credential_key: credentialKey(brandId, integrationId),
      credential_type: typeForIntegration(integration),
      encryption_version: 'v1',
      credential_version: 1,
      status: 'revoked',
      created_at: now,
      updated_at: now,
      revoked_at: now,
    };
    const created = await service.entities.IntegrationCredential.create(expected);
    readback = await service.entities.IntegrationCredential.get(created.id);
    verifyPersistedRow(readback, expected);
  }
  await scrubLegacyAfterCredentialReadback(service, integration, readback);
  return Object.freeze({
    integration_id: integrationId,
    brand_id: brandId,
    status: 'revoked',
    credential_version: Number(readback.credential_version || 1),
  });
}

export function projectIntegrationMetadata(integration: any) {
  return Object.freeze({
    id: text(integration?.id) || null,
    brand_id: text(integration?.brand_id) || null,
    provider: text(integration?.provider) || null,
    category: text(integration?.category) || null,
    status: text(integration?.status) || null,
    access_token_expires_at: integration?.access_token_expires_at || null,
    scopes: Object.freeze(Array.isArray(integration?.scopes) ? [...integration.scopes] : []),
    connected_at: integration?.connected_at || null,
    last_sync_at: integration?.last_sync_at || null,
    last_sync_status: integration?.last_sync_status || null,
    provider_account_id: integration?.provider_account_id || null,
  });
}
