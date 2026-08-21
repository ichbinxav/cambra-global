const API_V1_FUNCTION_MARKER = "/functions/apiV1";
const API_V1_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);
const LEGACY_ENVELOPE_FIELDS = new Set(["path", "method", "body", "query"]);

function plainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export class ApiV1TransportError extends Error {
  code: string;
  status: number;
  public_safe = true;

  constructor(code: string, status = 400) {
    super(code);
    this.name = "ApiV1TransportError";
    this.code = code;
    this.status = status;
  }
}

export function isApiV1TransportError(
  error: any,
): error is ApiV1TransportError {
  return error?.name === "ApiV1TransportError" &&
    error?.public_safe === true && [400, 413].includes(error?.status) &&
    typeof error?.code === "string";
}

function mismatch(): never {
  throw new ApiV1TransportError("api_transport_contract_mismatch");
}

function parseJsonObject(raw: string) {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiV1TransportError("api_request_json_invalid");
  }
  if (!plainObject(parsed)) mismatch();
  return parsed;
}

function queryProjection(url: URL) {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (Object.prototype.hasOwnProperty.call(query, key)) mismatch();
    query[key] = value;
  }
  return query;
}

function relativeFunctionPath(pathname: string) {
  const first = pathname.indexOf(API_V1_FUNCTION_MARKER);
  if (first < 0 || pathname.indexOf(API_V1_FUNCTION_MARKER, first + 1) >= 0) {
    mismatch();
  }
  const boundary = first + API_V1_FUNCTION_MARKER.length;
  if (pathname[boundary] && pathname[boundary] !== "/") mismatch();
  return pathname.slice(boundary) || "/";
}

function validRoutePath(value: unknown): value is string {
  return typeof value === "string" && /^\/v1(?:\/|$)/.test(value) &&
    !value.includes("?") && !value.includes("#");
}

export type ApiV1TransportRequest = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  transport: "openapi_direct" | "legacy_envelope";
};

/**
 * Resolve the public HTTP contract once. OpenAPI clients address
 * `/functions/apiV1/v1/...` and send the documented body directly. The legacy
 * root endpoint remains available only with an explicit `{path,method,...}`
 * envelope; mixing the two transports is rejected instead of silently routing
 * to another operation.
 */
export async function resolveApiV1TransportRequest(
  req: Request,
  maxRequestBytes = 256 * 1024,
): Promise<ApiV1TransportRequest> {
  const url = new URL(req.url);
  const relativePath = relativeFunctionPath(url.pathname);
  const requestMethod = req.method.toUpperCase();
  const readsBody = requestMethod !== "GET" && requestMethod !== "HEAD";
  const raw = readsBody ? await req.text() : "";
  if (new TextEncoder().encode(raw).byteLength > maxRequestBytes) {
    throw new ApiV1TransportError("request_too_large", 413);
  }

  if (relativePath !== "/") {
    if (!API_V1_METHODS.has(requestMethod) || !validRoutePath(relativePath)) {
      mismatch();
    }
    const body = parseJsonObject(raw);
    if (
      Object.prototype.hasOwnProperty.call(body, "path") ||
      Object.prototype.hasOwnProperty.call(body, "method")
    ) mismatch();
    return {
      path: relativePath,
      method: requestMethod,
      body,
      query: queryProjection(url),
      transport: "openapi_direct",
    };
  }

  // Compatibility mode is intentionally explicit and has one source for every
  // routing field. A direct AnalyzerInput body at the function root is invalid.
  if (requestMethod !== "POST" || url.search) mismatch();
  const envelope = parseJsonObject(raw);
  if (
    Object.keys(envelope).some((field) => !LEGACY_ENVELOPE_FIELDS.has(field)) ||
    !validRoutePath(envelope.path) ||
    typeof envelope.method !== "string"
  ) mismatch();
  const method = envelope.method.toUpperCase();
  if (!API_V1_METHODS.has(method)) mismatch();
  const body = envelope.body === undefined ? {} : envelope.body;
  const query = envelope.query === undefined ? {} : envelope.query;
  if (!plainObject(body) || !plainObject(query)) mismatch();
  return {
    path: envelope.path,
    method,
    body,
    query,
    transport: "legacy_envelope",
  };
}

export async function handleApiV1TransportRequest<T>(
  req: Request,
  dispatch: (request: ApiV1TransportRequest) => Promise<T> | T,
  maxRequestBytes = 256 * 1024,
) {
  return dispatch(await resolveApiV1TransportRequest(req, maxRequestBytes));
}
