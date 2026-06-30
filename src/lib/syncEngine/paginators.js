// ─── Pagination styles — FUENTE DE VERDAD LÓGICA ────────────────────────────
//
// Cada estilo es una función pura que, dado:
//   - rawResponse: el JSON parseado de la página actual
//   - responseHeaders: headers de la respuesta (Map-like .get(name))
//   - currentUrl: URL absoluta usada para la página actual
//   - cfg: el subobjeto `pagination` de la entry del REGISTRY del provider
//
// devuelve { nextUrl, nextCursor } o { nextUrl: null, nextCursor: null }
// cuando ya no hay más páginas. `nextCursor` se persiste opcionalmente en
// Integration.metadata_json.last_cursor para reanudar — los providers que no
// usen cursores devolverán null aquí.
//
// IMPORTANTE: este módulo es la FUENTE DE VERDAD. Está duplicado verbatim
// dentro de base44/functions/dataSyncAgent/entry.ts (Deno no puede importar
// de src/). Mismo patrón que stripe.js. Si diverge, los tests aquí lo
// detectan y la copia Deno se realinea a mano.
//
// Estilos hoy implementados (los 3 prioritarios del prompt):
//   - "cursor_stripe"   → has_more + starting_after=<last_id_in_page>
//   - "cursor_hal_body" → _links.next.href (Mollie / HAL)
//   - "page_number"     → ?page=N + per_page=<size>; corta cuando viene array vacío
//
// Estilos preparados como hooks (registrados, pero todavía no migrados a su
// provider). NO se activan si nadie los pone en su registry entry, así que
// añadirlos no afecta a ningún provider existente.
//   - "link_header"     → header `Link: <url>; rel="next"` (Shopify / WC)
//   - "offset_limit"    → offset + limit en query string (sevDesk / Odoo)
//
// Estilo por defecto: cuando un provider no declara `pagination`, devolvemos
// el paginator NULL → 1 página y stop. Este es el "modo viejo" — providers
// sin config siguen funcionando idéntico que antes de este cambio.

// SYNC-START: paginators
function withQueryParam(url, key, value) {
  // Manipulación de query strings tolerante: si el provider ya añadió
  // ?starting_after=… al endpoint base (raro), lo respetamos sustituyendo.
  // Evita doble-? y duplicados del mismo key.
  const [base, search = ""] = url.split("?");
  const params = new URLSearchParams(search);
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

function withQueryParams(url, kvPairs) {
  const [base, search = ""] = url.split("?");
  const params = new URLSearchParams(search);
  for (const [k, v] of Object.entries(kvPairs)) params.set(k, v);
  return `${base}?${params.toString()}`;
}

// ─── Paginators ──────────────────────────────────────────────────────────────

// Stripe-style: has_more + starting_after=<last_id>.
// raw.data[] must be an array; raw.has_more is boolean. The cursor is the
// id of the LAST element of the current page.
function cursorStripe(rawResponse, _headers, currentUrl, _cfg) {
  const data = Array.isArray(rawResponse?.data) ? rawResponse.data : [];
  if (!rawResponse?.has_more || data.length === 0) {
    return { nextUrl: null, nextCursor: null };
  }
  const lastId = data[data.length - 1]?.id;
  if (!lastId) return { nextUrl: null, nextCursor: null };
  return {
    nextUrl: withQueryParam(currentUrl, "starting_after", lastId),
    nextCursor: lastId,
  };
}

// Mollie / HAL-style: _links.next.href in the body. Stops when next is null/absent.
function cursorHalBody(rawResponse, _headers, _currentUrl, _cfg) {
  const next = rawResponse?._links?.next?.href;
  if (!next || typeof next !== "string") {
    return { nextUrl: null, nextCursor: null };
  }
  return { nextUrl: next, nextCursor: next };
}

// Page-number style: ?page=N&per_page=<size>.
// cfg may declare `page_param` (default "page"), `size_param` (default "per_page"),
// `page_size` (default 100), `start_page` (default 1), and `array_root` (default null
// → assumes the response body itself is the array, or .data if that's an array).
// Stops when the current page returns an empty array OR fewer items than page_size.
function pageNumber(rawResponse, _headers, currentUrl, cfg) {
  const pageParam = cfg?.page_param || "page";
  const sizeParam = cfg?.size_param || "per_page";
  const pageSize = cfg?.page_size || 100;
  const arrayRoot = cfg?.array_root;

  // Extract the array we just read so we can detect end-of-pages.
  let arr;
  if (arrayRoot && typeof arrayRoot === "string") {
    arr = rawResponse?.[arrayRoot];
  } else if (Array.isArray(rawResponse?.data)) {
    arr = rawResponse.data;
  } else if (Array.isArray(rawResponse)) {
    arr = rawResponse;
  } else {
    arr = [];
  }
  arr = Array.isArray(arr) ? arr : [];

  // Si la página actual viene vacía o incompleta, hemos terminado.
  if (arr.length === 0 || arr.length < pageSize) {
    return { nextUrl: null, nextCursor: null };
  }

  // Avanzar página: leemos la página actual del query, sumamos 1.
  const [, search = ""] = currentUrl.split("?");
  const params = new URLSearchParams(search);
  const currentPage = parseInt(params.get(pageParam) || `${cfg?.start_page || 1}`, 10);
  const nextPage = (Number.isFinite(currentPage) ? currentPage : 1) + 1;
  return {
    nextUrl: withQueryParams(currentUrl, { [pageParam]: String(nextPage), [sizeParam]: String(pageSize) }),
    nextCursor: String(nextPage),
  };
}

// Link-header style (Shopify, WooCommerce). Reads `Link: <url>; rel="next"`
// from response headers. Hook only — no provider migrated to it yet.
function linkHeader(_rawResponse, headers, _currentUrl, _cfg) {
  const linkHeaderValue = headers?.get?.("Link") || headers?.get?.("link");
  if (!linkHeaderValue) return { nextUrl: null, nextCursor: null };
  // Parse RFC 5988 minimally: split by comma, find rel="next".
  const parts = linkHeaderValue.split(",").map(s => s.trim());
  for (const p of parts) {
    const m = p.match(/^<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return { nextUrl: m[1], nextCursor: m[1] };
  }
  return { nextUrl: null, nextCursor: null };
}

// Offset+limit style (sevDesk, Odoo). Hook only — no provider migrated yet.
function offsetLimit(rawResponse, _headers, currentUrl, cfg) {
  const offsetParam = cfg?.offset_param || "offset";
  const limitParam = cfg?.limit_param || "limit";
  const pageSize = cfg?.page_size || 100;
  const arrayRoot = cfg?.array_root;

  let arr;
  if (arrayRoot && typeof arrayRoot === "string") arr = rawResponse?.[arrayRoot];
  else if (Array.isArray(rawResponse?.objects)) arr = rawResponse.objects;
  else if (Array.isArray(rawResponse?.data)) arr = rawResponse.data;
  else if (Array.isArray(rawResponse)) arr = rawResponse;
  else arr = [];
  arr = Array.isArray(arr) ? arr : [];

  if (arr.length === 0 || arr.length < pageSize) {
    return { nextUrl: null, nextCursor: null };
  }
  const [, search = ""] = currentUrl.split("?");
  const params = new URLSearchParams(search);
  const currentOffset = parseInt(params.get(offsetParam) || "0", 10);
  const nextOffset = (Number.isFinite(currentOffset) ? currentOffset : 0) + pageSize;
  return {
    nextUrl: withQueryParams(currentUrl, { [offsetParam]: String(nextOffset), [limitParam]: String(pageSize) }),
    nextCursor: String(nextOffset),
  };
}

// Null paginator — used when a provider does NOT declare `pagination`.
// Always returns no-more-pages → single fetch. This is the legacy behavior
// that every untouched provider continues to follow byte-for-byte.
function nullPaginator() {
  return { nextUrl: null, nextCursor: null };
}

const PAGINATORS = {
  cursor_stripe: cursorStripe,
  cursor_hal_body: cursorHalBody,
  page_number: pageNumber,
  link_header: linkHeader,
  offset_limit: offsetLimit,
};

export function getPaginator(style) {
  if (!style) return nullPaginator;
  const fn = PAGINATORS[style];
  return fn || nullPaginator;
}
// SYNC-END: paginators

// Para tests / debugging.
export const __internal = { cursorStripe, cursorHalBody, pageNumber, linkHeader, offsetLimit, nullPaginator };