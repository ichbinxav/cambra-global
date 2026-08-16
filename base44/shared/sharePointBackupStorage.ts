import {
  DR_FOLDERS,
  DR_GRAPH_CHUNK_BYTES,
  DR_ROOT_FOLDER,
  safeFileName,
} from "./disasterRecoveryCore.ts";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const TOKEN_SCOPE = "https://graph.microsoft.com/.default";

export class DisasterRecoveryConfigurationError extends Error {
  code = "DR_CONFIGURATION_REQUIRED";
  missing: string[];
  constructor(missing: string[]) {
    super(`Missing disaster-recovery configuration: ${missing.join(", ")}`);
    this.missing = missing;
  }
}

export class MicrosoftGraphError extends Error {
  code = "MICROSOFT_GRAPH_REQUEST_FAILED";
  status: number;
  graphCode: string;
  constructor(status: number, graphCode: string) {
    super(
      `Microsoft Graph request failed (${status}:${graphCode || "unknown"})`,
    );
    this.status = status;
    this.graphCode = graphCode;
  }
}

type EnvironmentReader = { get: (key: string) => string | undefined };

export function readSharePointBackupConfiguration(env: EnvironmentReader) {
  const configuration = {
    tenantId: String(env.get("MS_GRAPH_TENANT_ID") || "").trim(),
    clientId: String(env.get("MS_GRAPH_CLIENT_ID") || "").trim(),
    clientSecret: String(env.get("MS_GRAPH_CLIENT_SECRET") || "").trim(),
    siteId: String(env.get("DR_SHAREPOINT_SITE_ID") || "").trim(),
    siteHostname: String(
      env.get("DR_SHAREPOINT_HOSTNAME") || "globalcambra.sharepoint.com",
    ).trim(),
    sitePath: String(env.get("DR_SHAREPOINT_SITE_PATH") || "").trim().replace(
      /^\/+|\/+$/g,
      "",
    ),
    driveId: String(env.get("DR_SHAREPOINT_DRIVE_ID") || "").trim(),
    driveName: String(env.get("DR_SHAREPOINT_DRIVE_NAME") || "Documents")
      .trim(),
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
  return { configuration, missing, ok: missing.length === 0 };
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

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({}));
  return new MicrosoftGraphError(
    response.status,
    String(body?.error?.code || body?.code || "unknown"),
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
    const response = await fetch(
      path.startsWith("https://") ? path : `${GRAPH_ROOT}${path}`,
      {
        ...init,
        headers: {
          ...(path.startsWith(GRAPH_ROOT)
            ? { Authorization: `Bearer ${token}` }
            : {}),
          ...(init.headers || {}),
        },
      },
    );
    last = response;
    if (response.ok || allowed.includes(response.status)) return response;
    if (![408, 429, 500, 502, 503, 504].includes(response.status)) {
      throw await responseError(response);
    }
    const retryAfter = Number(response.headers.get("retry-after") || 0);
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
  const response = await fetch(
    `https://login.microsoftonline.com/${
      encodeURIComponent(configuration.tenantId)
    }/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const code = String(payload?.error || "token_request_failed");
    throw new MicrosoftGraphError(response.status, code);
  }
  const payload = await response.json();
  if (!payload?.access_token) {
    throw new MicrosoftGraphError(502, "access_token_missing");
  }
  return String(payload.access_token);
}

async function resolveSite(token: string, configuration: any) {
  if (configuration.siteId) return { id: configuration.siteId };
  const response = await graphRequest(
    token,
    `/sites/${encodeURIComponent(configuration.siteHostname)}:/${
      graphPath(configuration.sitePath)
    }?$select=id,displayName,webUrl`,
  );
  return response.json();
}

async function resolveDrive(token: string, siteId: string, configuration: any) {
  if (configuration.driveId) {
    return { id: configuration.driveId, name: configuration.driveName };
  }
  const response = await graphRequest(
    token,
    `/sites/${
      encodeURIComponent(siteId)
    }/drives?$select=id,name,webUrl,driveType&$top=100`,
  );
  const payload = await response.json();
  const drives = Array.isArray(payload?.value) ? payload.value : [];
  const wanted = String(configuration.driveName || "Documents").toLowerCase();
  const drive =
    drives.find((item: any) =>
      String(item.name || "").toLowerCase() === wanted
    ) ||
    drives.find((item: any) =>
      ["documents", "shared documents", "documentos"].includes(
        String(item.name || "").toLowerCase(),
      )
    );
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
      parentId = String((await existing.json()).id);
      continue;
    }
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
      const raced = await getItemByPath(token, driveId, current);
      parentId = String((await raced.json()).id);
    } else parentId = String((await created.json()).id);
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
    return response.json();
  }
  const name = safeFileName(pathParts(path).at(-1), "backup.bin");
  const parent = pathParts(path).slice(0, -1).join("/");
  const parentItem = await getItemByPath(token, driveId, parent);
  const parentId = String((await parentItem.json()).id);
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
  const session = await sessionResponse.json();
  if (!session?.uploadUrl) {
    throw new MicrosoftGraphError(502, "upload_session_url_missing");
  }
  let final: any = null;
  for (let start = 0; start < bytes.byteLength; start += DR_GRAPH_CHUNK_BYTES) {
    const end = Math.min(bytes.byteLength, start + DR_GRAPH_CHUNK_BYTES) - 1;
    const chunk = bytes.subarray(start, end + 1);
    const response = await graphRequest("", String(session.uploadUrl), {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
      },
      body: ownedBuffer(chunk),
    });
    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new MicrosoftGraphError(502, "upload_chunk_response_invalid_json");
    }
    const finalChunk = end === bytes.byteLength - 1;
    if (
      finalChunk && (!payload?.id || Number(payload?.size) !== bytes.byteLength)
    ) {
      throw new MicrosoftGraphError(502, "upload_final_receipt_invalid");
    }
    final = payload;
  }
  if (!final?.id) {
    throw new MicrosoftGraphError(502, "upload_final_receipt_missing");
  }
  return final;
}

async function listChildren(token: string, driveId: string, path: string) {
  let url = `/drives/${encodeURIComponent(driveId)}/root:/${
    graphPath(path)
  }:/children?$select=id,name,size,folder,file,createdDateTime,lastModifiedDateTime,webUrl&$top=999`;
  const rows: any[] = [];
  while (url) {
    const response = await graphRequest(token, url);
    const payload = await response.json();
    rows.push(...(Array.isArray(payload?.value) ? payload.value : []));
    url = String(payload?.["@odata.nextLink"] || "");
  }
  return rows;
}

export async function createSharePointBackupStorage(
  env: EnvironmentReader = Deno.env,
) {
  const parsed = readSharePointBackupConfiguration(env);
  if (!parsed.ok) throw new DisasterRecoveryConfigurationError(parsed.missing);
  const configuration = parsed.configuration;
  const token = await acquireToken(configuration);
  const site = await resolveSite(token, configuration);
  const drive = await resolveDrive(token, String(site.id), configuration);
  const root = configuration.rootFolder || DR_ROOT_FOLDER;
  await ensureFolder(token, String(drive.id), root);
  for (const folder of DR_FOLDERS) {
    await ensureFolder(token, String(drive.id), `${root}/${folder}`);
  }
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
    ensureFolder: (relative: string) =>
      ensureFolder(token, String(drive.id), `${root}/${relative}`),
    upload: (relative: string, bytes: Uint8Array, contentType?: string) =>
      uploadBytes(
        token,
        String(drive.id),
        `${root}/${relative}`,
        bytes,
        contentType,
      ),
    download: async (relative: string) => {
      const response = await graphRequest(
        token,
        `/drives/${encodeURIComponent(String(drive.id))}/root:/${
          graphPath(`${root}/${relative}`)
        }:/content`,
      );
      return new Uint8Array(await response.arrayBuffer());
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
      return response.status === 404
        ? null
        : new Uint8Array(await response.arrayBuffer());
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
      return response.json();
    },
  };
}
