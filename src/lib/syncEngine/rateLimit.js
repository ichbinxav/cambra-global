// ─── Rate-limit + retry helpers — FUENTE DE VERDAD LÓGICA ───────────────────
//
// Dos cosas, en este orden:
//
//   1) Throttle proactivo: si el provider declara `rate_limit.rps` en el
//      registry, se espera el delay mínimo entre llamadas para no superar
//      el ceiling. Mecanismo simple: pausa síncrona (await sleep) antes de
//      cada fetch. NO usamos un token bucket porque cada sync es un único
//      "consumidor"; el bucket lo construiremos cuando haya varios syncs
//      paralelos por brand (no es el caso hoy).
//
//   2) Backoff reactivo: ante 429 / 5xx, reintentar con exponential backoff.
//      Si la respuesta trae `Retry-After`, lo respetamos. Máximo de
//      reintentos configurable (default 4).
//
// Errores estructurales (4xx que no son 429, p.ej. 401, 400) NO se reintentan
// — son fallos de configuración del cliente, retry solo gasta cuota.
//
// IMPORTANTE: este módulo es la FUENTE DE VERDAD. Duplicado verbatim en
// base44/functions/dataSyncAgent/entry.ts.

const DEFAULT_MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  // RFC 7231: Retry-After can be seconds (integer) OR HTTP-date. Soportamos seconds primero.
  const asInt = parseInt(headerValue, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
  const asDate = Date.parse(headerValue);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

// Devuelve la pausa mínima en ms entre llamadas para no superar `rps`. Cuando
// rps es falsy o <= 0, no hay throttle.
function minDelayMs(rateLimitCfg) {
  const rps = rateLimitCfg?.rps;
  if (!rps || typeof rps !== "number" || rps <= 0) return 0;
  return Math.ceil(1000 / rps);
}

// Wrapper: ejecuta `fetchFn` (que debe devolver una Response). Aplica throttle
// proactivo (si rate_limit.rps está declarado) y backoff reactivo en 429/5xx.
// Devuelve la Response final (o lanza si todos los retries fallan).
//
// `state` permite mantener el timestamp de la última llamada entre invocaciones
// dentro del mismo sync (un objeto opaco que el caller crea con createRateState()
// y reutiliza en todas las páginas del mismo sync).
export async function fetchWithBackoff(fetchFn, rateLimitCfg, state, maxRetries = DEFAULT_MAX_RETRIES) {
  // 1) Throttle proactivo entre llamadas del mismo sync.
  const minDelay = minDelayMs(rateLimitCfg);
  if (minDelay > 0 && state?.lastCallAt) {
    const elapsed = Date.now() - state.lastCallAt;
    if (elapsed < minDelay) await sleep(minDelay - elapsed);
  }

  let attempt = 0;
  while (true) {
    if (state) state.lastCallAt = Date.now();
    let res;
    try {
      res = await fetchFn();
    } catch (err) {
      // Network error / DNS / TLS — also retryable up to max.
      if (attempt >= maxRetries) throw err;
      const wait = BASE_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(wait);
      attempt++;
      continue;
    }

    // OK or non-retryable client error → return immediately.
    if (res.ok) return res;
    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retryable || attempt >= maxRetries) return res;

    // 429 / 5xx → backoff. Respect Retry-After if present.
    const retryAfter = parseRetryAfter(res.headers?.get?.("Retry-After"));
    const wait = retryAfter !== null ? retryAfter : BASE_BACKOFF_MS * Math.pow(2, attempt);
    await sleep(wait);
    attempt++;
  }
}

export function createRateState() {
  return { lastCallAt: 0 };
}

export const __internal = { parseRetryAfter, minDelayMs, sleep };