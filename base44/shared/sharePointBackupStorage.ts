import {
  DR_CANONICAL_SHAREPOINT_DRIVE_ID,
  DR_CANONICAL_SHAREPOINT_DRIVE_NAME,
  DR_CANONICAL_SHAREPOINT_HOSTNAME,
  DR_CANONICAL_SHAREPOINT_SITE_ID,
  DR_FOLDERS,
  DR_GRAPH_CHUNK_BYTES,
  DR_ROOT_FOLDER,
  parseAes256Key,
  parseDrMaxFileBytes,
  readBoundedDrResponseBytes,
  safeFileName,
} from "./disasterRecoveryCore.ts";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const TOKEN_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_JSON_MAX_BYTES = 8 * 1024 * 1024;
const GRAPH_JSON_DECODER = new TextDecoder();

export function sanitizeMicrosoftGraphCode(value: unknown, fallback = "unknown") {
  const raw = String(value || "").trim();
  if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(raw)) return fallback;
  return raw;
}

export class DisasterRecoveryConfigurationError extends Error {
  code = "DR_CONFIGURATION_REQUIRED";
  missing: string[];
  invalid: string[];
  constructor(missing: string[], invalid: string[] = []) {
    const details = [
      ...(missing.length ? [`missing ${missing.join(", ")}`] : []),
      ...(invalid.length ? [`invalid ${invalid.join(", ")}`] : []),
    ].join("; ");
    super(`Disaster-recovery configuration is not safe: ${details}`);
    this.missing = missing;
    this.invalid = invalid;
  }
}

export class MicrosoftGraphError extends Error {
  code = "MICROSOFT_GRAPH_REQUEST_FAILED";
  status: number;
  graphCode: string;
  constructor(status: number, graphCode: string) {
    const safeCode = sanitizeMicrosoftGraphCode(graphCode);
    super(
      `Microsoft Graph request failed (${status}:${safeCode})`,
    );
    this.status = status;
    this.graphCode = safeCode;
  }
}

type EnvironmentReader = { get: (key: string) => string | undefined };
type SharePointConfigurationOptions = { requireCanonicalTarget?: boolean };
type SharePointStorageOptions = SharePointConfigurationOptions & {
  initializeFolders?: boolean;
};

export function readSharePointBackupConfiguration(
  env: EnvironmentReader,
  options: SharePointConfigurationOptions = {},
) {
  const configuredSitePath = String(env.get("DR_SHAREPOINT_SITE_PATH") || "")
    .trim().replace(/^\/+|\/+$/g, "");
  const configuredDriveName = String(
    env.get("DR_SHAREPOINT_DRIVE_NAME") || "",
  ).trim();
  const configuration = {
    tenantId: String(env.get("MS_GRAPH_TENANT_ID") || "").trim(),
    clientId: String(env.get("MS_GRAPH_CLIENT_ID") || "").trim(),
    clientSecret: String(env.get("MS_GRAPH_CLIENT_SECRET") || "").trim(),
    siteId: String(env.get("DR_SHAREPOINT_SITE_ID") || "").trim(),
    siteHostname: String(
      env.get("DR_SHAREPOINT_HOSTNAME") || DR_CANONICAL_SHAREPOINT_HOSTNAME,
    ).trim(),
    sitePath: configuredSitePath,
    driveId: String(env.get("DR_SHAREPOINT_DRIVE_ID") || "").trim(),
    driveName: configuredDriveName || DR_CANONICAL_SHAREPOINT_DRIVE_NAME,
    rootFolder: String(env.get("DR_SHAREPOINT_ROOT_FOLDER") || DR_ROOT_FOLDER)
      .trim(),
  };
  const missing: string[] = [];
  if (!configuration.tenantId) missing.push("MS_GRAPH_TENANT_ID");
  if (!configuration.clientId) missing.push("MS_GRAPH_CLIENT_ID");
  if (!configuration.clientSecret) missing.push("MS_GRAPH_CLIENT_SECRET");
  if (!configuration.siteId && !configuration.sitePath) {
    missing.push("DR_SHAREPOINT_SITE_ID_or_DR_SHAREPOINT_SITE_PATH");
  }
  const invalid: string[] = [];
  if (configuration.siteId && configuration.sitePath) {
    invalid.push("DR_SHAREPOINT_SITE_ID_and_DR_SHAREPOINT_SITE_PATH_are_mutually_exclusive");
  }
  if (configuration.rootFolder !== DR_ROOT_FOLDER) {
    invalid.push(`DR_SHAREPOINT_ROOT_FOLDER_must_equal_${DR_ROOT_FOLDER}`);
  }
  if (
    !configuration.rootFolder ||
    pathParts(configuration.rootFolder).join("/") !== configuration.rootFolder ||
    pathParts(configuration.rootFolder).some((part) => part === "." || part === "..")
  ) {
    invalid.push("DR_SHAREPOINT_ROOT_FOLDER_is_not_a_safe_canonical_path");
  }
  if (options.requireCanonicalTarget) {
    if (!configuration.siteId || configuration.sitePath) {
      invalid.push("DR_SHAREPOINT_PRODUCTION_SITE_REQUIRES_EXACT_ID");
    }
    if (!configuration.driveId) {
      invalid.push("DR_SHAREPOINT_PRODUCTION_DRIVE_REQUIRES_EXACT_ID");
    }
    if (configuration.siteHostname !== DR_CANONICAL_SHAREPOINT_HOSTNAME) {
      invalid.push("DR_SHAREPOINT_HOSTNAME_CANONICAL_MISMATCH");
    }
    if (configuration.siteId !== DR_CANONICAL_SHAREPOINT_SITE_ID) {
      invalid.push("DR_SHAREPOINT_SITE_ID_CANONICAL_MISMATCH");
    }
    if (configuration.driveId !== DR_CANONICAL_SHAREPOINT_DRIVE_ID) {
      invalid.push("DR_SHAREPOINT_DRIVE_ID_CANONICAL_MISMATCH");
    }
    if (configuration.driveName !== DR_CANONICAL_SHAREPOINT_DRIVE_NAME) {
      invalid.push("DR_SHAREPOINT_DRIVE_NAME_CANONICAL_MISMATCH");
    }
  }
  return {
    configuration,
    missing,
    invalid: [...new Set(invalid)],
    ok: missing.length === 0 && invalid.length === 0,
    target: {
      site_resolution: configuration.siteId ? "EXACT_ID" : configuration.sitePath ? "HOSTNAME_AND_PATH" : "UNCONFIGURED",
      drive_resolution: configuration.driveId ? "EXACT_ID" : "EXACT_NAME",
      canonical_root: configuration.rootFolder === DR_ROOT_FOLDER,
      canonical_target: configuration.siteHostname === DR_CANONICAL_SHAREPOINT_HOSTNAME &&
        configuration.siteId === DR_CANONICAL_SHAREPOINT_SITE_ID &&
        configuration.driveId === DR_CANONICAL_SHAREPOINT_DRIVE_ID &&
        configuration.driveName === DR_CANONICAL_SHAREPOINT_DRIVE_NAME &&
        configuration.rootFolder === DR_ROOT_FOLDER,
      canonical_required: options.requireCanonicalTarget === true,
    },
  };
}

export function readDisasterRecoveryPreflightConfiguration(
  env: EnvironmentReader,
  options: SharePointConfigurationOptions = {},
) {
  const graph = readSharePointBackupConfiguration(env, options);
  const missing = [...graph.missing];
  const invalid = [...graph.invalid];
  const aesKey = String(env.get("DR_BACKUP_AES256_KEY_B64") || "").trim();
  const releaseVersion = String(env.get("CAMBRA_RELEASE_VERSION") || "").trim();
  const gitSha = String(env.get("CAMBRA_GIT_SHA") || "").trim();
  const sourceTreeHash = String(env.get("CAMBRA_SOURCE_TREE_HASH") || "").trim();
  const maxFileBytes = String(env.get("DR_MAX_FILE_BYTES") || "").trim();
  if (!aesKey) missing.push("DR_BACKUP_AES256_KEY_B64");
  else {
    try {
      parseAes256Key(aesKey);
    } catch {
      invalid.push("DR_BACKUP_AES256_KEY_B64_INVALID");
    }
  }
  if (!releaseVersion) missing.push("CAMBRA_RELEASE_VERSION");
  else if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,119}$/.test(releaseVersion)) {
    invalid.push("CAMBRA_RELEASE_VERSION_INVALID");
  }
  if (!gitSha) missing.push("CAMBRA_GIT_SHA");
  else if (!/^[a-f0-9]{40}$/iu.test(gitSha)) invalid.push("CAMBRA_GIT_SHA_INVALID");
  if (!sourceTreeHash) missing.push("CAMBRA_SOURCE_TREE_HASH");
  else if (!/^[a-f0-9]{64}$/iu.test(sourceTreeHash)) {
    invalid.push("CAMBRA_SOURCE_TREE_HASH_INVALID");
  }
  let parsedMaxFileBytes:number | null = null;
  try {
    parsedMaxFileBytes = parseDrMaxFileBytes(maxFileBytes);
  } catch {
    invalid.push("DR_MAX_FILE_BYTES_INVALID");
  }
  const uniqueMissing = [...new Set(missing)];
  const uniqueInvalid = [...new Set(invalid)];
  return {
    ...graph,
    missing: uniqueMissing,
    invalid: uniqueInvalid,
    ok: uniqueMissing.length === 0 && uniqueInvalid.length === 0,
    release_identity: {
      release_version: releaseVersion || null,
      release_version_format: releaseVersion
        ? (/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,119}$/.test(releaseVersion) ? "VALID" : "INVALID")
        : "MISSING",
      git_sha_format: gitSha ? (/^[a-f0-9]{40}$/iu.test(gitSha) ? "SHA40" : "INVALID") : "MISSING",
      source_tree_hash_format: sourceTreeHash
        ? (/^[a-f0-9]{64}$/iu.test(sourceTreeHash) ? "SHA256_TREE_V1" : "INVALID")
        : "MISSING",
    },
    encryption_key: {
      configured: !!aesKey,
      valid_aes256_base64: !!aesKey && !uniqueInvalid.includes("DR_BACKUP_AES256_KEY_B64_INVALID"),
    },
    file_size_limit: {
      configured: !!maxFileBytes,
      valid: parsedMaxFileBytes !== null,
      max_bytes: parsedMaxFileBytes,
    },
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pathParts = (value: string) =>
  String(value || "").split("/").map((part) => part.trim()).filter(Boolean);
const graphPath = (value: string) =>
  pathParts(value).map(encodeURIComponent).join("/");
const ownedBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export function isMicrosoftGraphApiPath(path: string) {
  if (!String(path || "").startsWith("https://")) return String(path || "").startsWith("/");
  try {
    const url = new URL(path);
    return url.origin === "https://graph.microsoft.com" &&
      (url.pathname === "/v1.0" || url.pathname.startsWith("/v1.0/"));
  } catch {
    return false;
  }
}

export function graphAuthorizationHeaders(token: string, path: string) {
  return isMicrosoftGraphApiPath(path) && token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

export function isMicrosoftUploadSessionUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    const hostname = url.hostname.toLowerCase();
    const microsoftStorageHost = [
      ".sharepoint.com",
      ".sharepoint-df.com",
      ".sharepoint.us",
      ".sharepoint.de",
      ".sharepoint.cn",
      ".1drv.com",
    ].some((suffix) => hostname.endsWith(suffix) && hostname.length > suffix.length);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.port && !url.hash && microsoftStorageHost && url.pathname !== "/";
  } catch {
    return false;
  }
}

async function readBoundedGraphJson(
  response: Response,
  invalidCode = "graph_response_invalid_json",
) {
  try {
    const bytes = await readBoundedDrResponseBytes(response, GRAPH_JSON_MAX_BYTES);
    if (!bytes.byteLength) return {};
    return JSON.parse(GRAPH_JSON_DECODER.decode(bytes));
  } catch {
    throw new MicrosoftGraphError(502, invalidCode);
  }
}

async function responseError(response: Response) {
  const body = await readBoundedGraphJson(
    response,
    "graph_error_response_invalid",
  ).catch(() => ({}));
  return new MicrosoftGraphError(
    response.status,
    sanitizeMicrosoftGraphCode(body?.error?.code || body?.code),
  );
}

async function graphRequest(
  token: string,
  path: string,
  init: RequestInit = {},
  allowed: number[] = [],
) {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    let response: Response;
    try {
      response = await fetch(
        path.startsWith("https://") ? path : `${GRAPH_ROOT}${path}`,
        {
          ...init,
          redirect: "error",
          headers: {
            ...graphAuthorizationHeaders(token, path),
            ...(init.headers || {}),
          },
        },
      );
    } catch {
      if (attempt === 4) {
        throw new MicrosoftGraphError(
          502,
          isMicrosoftGraphApiPath(path)
            ? "graph_transport_failed"
            : "upload_transport_failed",
        );
      }
      await wait(Math.min(8000, 400 * 2 ** attempt));
      continue;
    }
    last = response;
    if (response.ok || allowed.includes(response.status)) return response;
    if (![408, 429, 500, 502, 503, 504].includes(response.status)) {
      throw await responseError(response);
    }
    if (attempt === 4) throw await responseError(response);
    await response.body?.cancel("graph_retryable_response").catch(() => undefined);
    const retryAfterRaw = Number(response.headers.get("retry-after") || 0);
    const retryAfter = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0
      ? Math.min(30, retryAfterRaw)
      : 0;
    await wait(
      retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 400 * 2 ** attempt),
    );
  }
  throw await responseError(last as Response);
}

async function acquireToken(configuration: any) {
  const body = new URLSearchParams({
    client_id: configuration.clientId,
    client_secret: configuration.clientSecret,
    scope: TOKEN_SCOPE,
    grant_type: "client_credentials",
  });
  let response: Response;
  try {
    response = await fetch(
      `https://login.microsoftonline.com/${
        encodeURIComponent(configuration.tenantId)
      }/oauth2/v2.0/token`,
      {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );
  } catch {
    throw new MicrosoftGraphError(502, "token_transport_failed");
  }
  if (!response.ok) {
    const payload = await readBoundedGraphJson(
      response,
      "token_error_response_invalid",
    ).catch(() => ({}));
    const code = sanitizeMicrosoftGraphCode(payload?.error, "token_request_failed");
    throw new MicrosoftGraphError(response.status, code);
  }
  const payload = await readBoundedGraphJson(response, "token_response_invalid_json");
  if (
    typeof payload?.access_token !== "string" ||
    !payload.access_token ||
    payload.access_token.trim() !== payload.access_token ||
    /\s/u.test(payload.access_token)
  ) {
    throw new MicrosoftGraphError(502, "access_token_missing");
  }
  return payload.access_token;
}

async function resolveSite(token: string, configuration: any) {
  if (configuration.siteId) {
    const response = await graphRequest(
      token,
      `/sites/${encodeURIComponent(configuration.siteId)}?$select=id,displayName,webUrl`,
    );
    return readBoundedGraphJson(response);
  }
  const response = await graphRequest(
    token,
    `/sites/${encodeURIComponent(configuration.siteHostname)}:/${
      graphPath(configuration.sitePath)
    }?$select=id,displayName,webUrl`,
  );
  return readBoundedGraphJson(response);
}

export function assertCanonicalSharePointTarget(
  configuration: any,
  site: any,
  drive: any,
) {
  const invalid: string[] = [];
  if (configuration?.siteHostname !== DR_CANONICAL_SHAREPOINT_HOSTNAME) {
    invalid.push("DR_SHAREPOINT_HOSTNAME_CANONICAL_MISMATCH");
  }
  if (
    configuration?.siteId !== DR_CANONICAL_SHAREPOINT_SITE_ID ||
    String(site?.id || "") !== DR_CANONICAL_SHAREPOINT_SITE_ID
  ) {
    invalid.push("DR_SHAREPOINT_RESOLVED_SITE_ID_CANONICAL_MISMATCH");
  }
  if (
    configuration?.driveId !== DR_CANONICAL_SHAREPOINT_DRIVE_ID ||
    String(drive?.id || "") !== DR_CANONICAL_SHAREPOINT_DRIVE_ID
  ) {
    invalid.push("DR_SHAREPOINT_RESOLVED_DRIVE_ID_CANONICAL_MISMATCH");
  }
  if (
    String(drive?.name || "").trim() !== DR_CANONICAL_SHAREPOINT_DRIVE_NAME
  ) {
    invalid.push("DR_SHAREPOINT_RESOLVED_DRIVE_NAME_CANONICAL_MISMATCH");
  }
  if (configuration?.rootFolder !== DR_ROOT_FOLDER) {
    invalid.push("DR_SHAREPOINT_RESOLVED_ROOT_CANONICAL_MISMATCH");
  }
  if (invalid.length) throw new DisasterRecoveryConfigurationError([], invalid);
  return true;
}

export async function listSharePointSiteDrives(token: string, siteId: string) {
  let url = `/sites/${encodeURIComponent(siteId)}/drives?$select=id,name,webUrl,driveType&$top=100`;
  const drives: any[] = [];
  const seen = new Set<string>();
  for (let page = 0; url && page < 100; page++) {
    if (!isMicrosoftGraphApiPath(url) || seen.has(url)) {
      throw new MicrosoftGraphError(502, "drive_pagination_next_link_invalid");
    }
    seen.add(url);
    const response = await graphRequest(token, url);
    const payload = await readBoundedGraphJson(response);
    drives.push(...(Array.isArray(payload?.value) ? payload.value : []));
    const next = String(payload?.["@odata.nextLink"] || "");
    if (next && !isMicrosoftGraphApiPath(next)) {
      throw new MicrosoftGraphError(502, "drive_pagination_next_link_invalid");
    }
    url = next;
  }
  if (url) throw new MicrosoftGraphError(502, "drive_pagination_limit_exceeded");
  return drives;
}

async function resolveDrive(token: string, siteId: string, configuration: any) {
  if (configuration.driveId) {
    const response = await graphRequest(
      token,
      `/sites/${encodeURIComponent(siteId)}/drives/${
        encodeURIComponent(configuration.driveId)
      }?$select=id,name,webUrl,driveType`,
    );
    const drive = await readBoundedGraphJson(response);
    if (String(drive?.id || "") !== configuration.driveId) {
      throw Object.assign(new Error("dr_sharepoint_drive_identity_mismatch"), {
        code: "DR_SHAREPOINT_DRIVE_IDENTITY_MISMATCH",
      });
    }
    if (
      String(drive?.name || "").trim().toLowerCase() !==
        String(configuration.driveName || "").trim().toLowerCase()
    ) {
      throw Object.assign(new Error("dr_sharepoint_drive_name_mismatch"), {
        code: "DR_SHAREPOINT_DRIVE_NAME_MISMATCH",
        expected: configuration.driveName,
        observed: String(drive?.name || ""),
      });
    }
    return drive;
  }
  const drives = await listSharePointSiteDrives(token, siteId);
  const wanted = String(configuration.driveName || "").toLowerCase();
  const matches = drives.filter((item: any) =>
    String(item.name || "").trim().toLowerCase() === wanted
  );
  if (matches.length > 1) {
    throw Object.assign(new Error("dr_sharepoint_drive_target_ambiguous"), {
      code: "DR_SHAREPOINT_DRIVE_TARGET_AMBIGUOUS",
      matched_count: matches.length,
      drive_name: configuration.driveName,
    });
  }
  const drive = matches[0];
  if (!drive) {
    throw Object.assign(new Error("dr_sharepoint_drive_not_found"), {
      code: "DR_SHAREPOINT_DRIVE_NOT_FOUND",
      available: drives.map((item: any) => item.name).slice(0, 20),
    });
  }
  return drive;
}

async function getItemByPath(
  token: string,
  driveId: string,
  path: string,
  allowed: number[] = [],
) {
  return graphRequest(
    token,
    `/drives/${encodeURIComponent(driveId)}/root:/${
      graphPath(path)
    }?$select=id,name,size,folder,file,createdDateTime,lastModifiedDateTime,webUrl`,
    {},
    allowed,
  );
}

async function ensureFolder(token: string, driveId: string, path: string) {
  const pieces = pathParts(path);
  let parentId = "root";
  let current = "";
  for (const piece of pieces) {
    current = current ? `${current}/${piece}` : piece;
    const existing = await getItemByPath(token, driveId, current, [404]);
    if (existing.status !== 404) {
      parentId = String((await readBoundedGraphJson(existing)).id);
      continue;
    }
    await existing.body?.cancel("graph_item_not_found").catch(() => undefined);
    const created = await graphRequest(
      token,
      `/drives/${encodeURIComponent(driveId)}/items/${
        encodeURIComponent(parentId)
      }/children`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: piece,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      },
      [409],
    );
    if (created.status === 409) {
      await created.body?.cancel("graph_folder_create_conflict").catch(() => undefined);
      const raced = await getItemByPath(token, driveId, current);
      parentId = String((await readBoundedGraphJson(raced)).id);
    } else parentId = String((await readBoundedGraphJson(created)).id);
  }
  return { id: parentId, path };
}

async function uploadBytes(
  token: string,
  driveId: string,
  path: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
) {
  if (bytes.byteLength <= DR_GRAPH_CHUNK_BYTES) {
    const response = await graphRequest(
      token,
      `/drives/${encodeURIComponent(driveId)}/root:/${
        graphPath(path)
      }:/content`,
      {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: ownedBuffer(bytes),
      },
    );
    let payload: any;
    try {
      payload = await readBoundedGraphJson(response, "upload_small_response_invalid_json");
    } catch {
      throw new MicrosoftGraphError(502, "upload_small_response_invalid_json");
    }
    if (typeof payload?.id !== "string" || !payload.id.trim() ||
      !Number.isSafeInteger(payload?.size) || payload.size !== bytes.byteLength) {
      throw new MicrosoftGraphError(502, "upload_small_receipt_invalid");
    }
    return payload;
  }
  const name = safeFileName(pathParts(path).at(-1), "backup.bin");
  const parent = pathParts(path).slice(0, -1).join("/");
  const parentItem = await getItemByPath(token, driveId, parent);
  const parentId = String((await readBoundedGraphJson(parentItem)).id);
  const sessionResponse = await graphRequest(
    token,
    `/drives/${encodeURIComponent(driveId)}/items/${
      encodeURIComponent(parentId)
    }:/${encodeURIComponent(name)}:/createUploadSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: { "@microsoft.graph.conflictBehavior": "replace", name },
      }),
    },
  );
  const session = await readBoundedGraphJson(
    sessionResponse,
    "upload_session_response_invalid_json",
  );
  if (!isMicrosoftUploadSessionUrl(session?.uploadUrl)) {
    throw new MicrosoftGraphError(502, "upload_session_url_invalid");
  }
  const uploadUrl = session.uploadUrl as string;
  let final: any = null;
  for (let start = 0; start < bytes.byteLength; start += DR_GRAPH_CHUNK_BYTES) {
    const end = Math.min(bytes.byteLength, start + DR_GRAPH_CHUNK_BYTES) - 1;
    const chunk = bytes.subarray(start, end + 1);
    const response = await graphRequest("", uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
      },
      body: ownedBuffer(chunk),
    });
    let payload: any;
    try {
      payload = await readBoundedGraphJson(response, "upload_chunk_response_invalid_json");
    } catch {
      throw new MicrosoftGraphError(502, "upload_chunk_response_invalid_json");
    }
    const finalChunk = end === bytes.byteLength - 1;
    if (!finalChunk) {
      const ranges = payload?.nextExpectedRanges;
      const expectedNext = end + 1;
      const payloadIsObject = payload !== null && typeof payload === "object" &&
        !Array.isArray(payload);
      const hasRanges = payloadIsObject &&
        Object.prototype.hasOwnProperty.call(payload, "nextExpectedRanges");
      const coherentRange = payloadIsObject && hasRanges && (
        Array.isArray(ranges) && ranges.length === 1 &&
        typeof ranges[0] === "string" && (() => {
          const match = ranges[0].match(/^(\d+)-(\d*)$/);
          if (!match) return false;
          const start = Number(match[1]);
          const rangeEnd = match[2] ? Number(match[2]) : null;
          return Number.isSafeInteger(start) && start === expectedNext &&
            (rangeEnd === null || (
              Number.isSafeInteger(rangeEnd) && rangeEnd >= start &&
              rangeEnd === bytes.byteLength - 1
            ));
        })()
      );
      if (response.status !== 202 || !coherentRange) {
        throw new MicrosoftGraphError(502, "upload_chunk_receipt_invalid");
      }
    } else if (
      ![200, 201].includes(response.status) ||
      typeof payload?.id !== "string" || !payload.id.trim() ||
      !Number.isSafeInteger(payload?.size) || payload.size !== bytes.byteLength
    ) {
      throw new MicrosoftGraphError(502, "upload_final_receipt_invalid");
    }
    final = payload;
  }
  if (typeof final?.id !== "string" || !final.id.trim()) {
    throw new MicrosoftGraphError(502, "upload_final_receipt_missing");
  }
  return final;
}

async function listChildren(token: string, driveId: string, path: string) {
  let url = `/drives/${encodeURIComponent(driveId)}/root:/${
    graphPath(path)
  }:/children?$select=id,name,size,folder,file,createdDateTime,lastModifiedDateTime,webUrl&$top=999`;
  const rows: any[] = [];
  const seen = new Set<string>();
  for (let page = 0; url && page < 100; page++) {
    if (!isMicrosoftGraphApiPath(url) || seen.has(url)) {
      throw new MicrosoftGraphError(502, "children_pagination_next_link_invalid");
    }
    seen.add(url);
    const response = await graphRequest(token, url);
    const payload = await readBoundedGraphJson(response);
    rows.push(...(Array.isArray(payload?.value) ? payload.value : []));
    const next = String(payload?.["@odata.nextLink"] || "");
    if (next && !isMicrosoftGraphApiPath(next)) {
      throw new MicrosoftGraphError(502, "children_pagination_next_link_invalid");
    }
    url = next;
  }
  if (url) throw new MicrosoftGraphError(502, "children_pagination_limit_exceeded");
  return rows;
}

export async function openSharePointBackupStorage(
  env: EnvironmentReader = Deno.env,
  options: SharePointStorageOptions = {},
) {
  const parsed = readSharePointBackupConfiguration(env, options);
  if (!parsed.ok) {
    throw new DisasterRecoveryConfigurationError(parsed.missing, parsed.invalid);
  }
  const configuration = parsed.configuration;
  const token = await acquireToken(configuration);
  const site = await resolveSite(token, configuration);
  const drive = await resolveDrive(token, String(site.id), configuration);
  if (options.requireCanonicalTarget) {
    assertCanonicalSharePointTarget(configuration, site, drive);
  }
  const root = configuration.rootFolder || DR_ROOT_FOLDER;
  const maxFileBytes = parseDrMaxFileBytes(env.get("DR_MAX_FILE_BYTES"));
  return {
    identity: {
      hostname: configuration.siteHostname,
      site_id: String(site.id),
      site_name: site.displayName || null,
      site_url: site.webUrl || null,
      drive_id: String(drive.id),
      drive_name: drive.name || configuration.driveName,
      root_folder: root,
    },
    path: (relative: string) => `${root}/${pathParts(relative).join("/")}`,
    initializeFolders: async () => {
      await ensureFolder(token, String(drive.id), root);
      for (const folder of DR_FOLDERS) {
        await ensureFolder(token, String(drive.id), `${root}/${folder}`);
      }
    },
    ensureFolder: (relative: string) =>
      ensureFolder(token, String(drive.id), `${root}/${relative}`),
    upload: (relative: string, bytes: Uint8Array, contentType?: string) => {
      if (bytes.byteLength > maxFileBytes) {
        throw Object.assign(
          new Error("dr_owned_file_exceeds_configured_limit"),
          {
            code: "DR_OWNED_FILE_TOO_LARGE",
            bytes: bytes.byteLength,
            max: maxFileBytes,
          },
        );
      }
      return uploadBytes(
        token,
        String(drive.id),
        `${root}/${relative}`,
        bytes,
        contentType,
      );
    },
    download: async (relative: string) => {
      const response = await graphRequest(
        token,
        `/drives/${encodeURIComponent(String(drive.id))}/root:/${
          graphPath(`${root}/${relative}`)
        }:/content`,
      );
      return readBoundedDrResponseBytes(response, maxFileBytes);
    },
    downloadIfExists: async (relative: string) => {
      const response = await graphRequest(
        token,
        `/drives/${encodeURIComponent(String(drive.id))}/root:/${
          graphPath(`${root}/${relative}`)
        }:/content`,
        {},
        [404],
      );
      if (response.status === 404) {
        await response.body?.cancel("dr_owned_file_not_found").catch(() => undefined);
        return null;
      }
      return readBoundedDrResponseBytes(response, maxFileBytes);
    },
    list: (relative: string) =>
      listChildren(token, String(drive.id), `${root}/${relative}`),
    deleteById: async (id: string) => {
      const response = await graphRequest(
        token,
        `/drives/${encodeURIComponent(String(drive.id))}/items/${
          encodeURIComponent(id)
        }`,
        { method: "DELETE" },
      );
      return response.status === 204;
    },
    metadata: async (relative: string) => {
      const response = await getItemByPath(
        token,
        String(drive.id),
        `${root}/${relative}`,
      );
      return readBoundedGraphJson(response);
    },
  };
}

export async function createSharePointBackupStorage(
  env: EnvironmentReader = Deno.env,
  options: SharePointStorageOptions = {},
) {
  const storage = await openSharePointBackupStorage(env, options);
  if (options.initializeFolders !== false) await storage.initializeFolders();
  return storage;
}

export async function verifySharePointBackupStorage(
  env: EnvironmentReader = Deno.env,
  options: SharePointConfigurationOptions = {},
) {
  const storage = await openSharePointBackupStorage(env, options);
  return {
    identity: storage.identity,
    list: storage.list,
    metadata: storage.metadata,
  };
}
