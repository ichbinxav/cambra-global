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
// SYNC contract: el bloque entre SYNC-START/SYNC-END debe permanecer
// byte-normalized idéntico a base44/functions/dataSyncAgent/entry.ts.
// Realineado el 2026-07-10 (Chunk 1a M3): forma compacta inline al estilo
// del archivo Deno gigante para que ambas copias converjan tras el
// normalizador del test.

// SYNC-START: rateLimit
// --- rate limit + backoff ---------------------------------------------------
const BASE_BACKOFF_MS = 500;
const DEFAULT_MAX_RETRIES = 4;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function parseRetryAfter(v) {
  if (!v) return null;
  const asInt = parseInt(v, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
  const asDate = Date.parse(v);
  if (Number.isFinite(asDate)) { const d = asDate - Date.now(); return d > 0 ? d : 0; }
  return null;
}
function minDelayMs(rl) {
  const rps = rl?.rps;
  if (!rps || typeof rps !== "number" || rps <= 0) return 0;
  return Math.ceil(1000 / rps);
}
export function createRateState() { return { lastCallAt: 0 }; }
export async function fetchWithBackoff(fetchFn, rlCfg, state, maxRetries = DEFAULT_MAX_RETRIES) {
  const minDelay = minDelayMs(rlCfg);
  if (minDelay > 0 && state?.lastCallAt) {
    const elapsed = Date.now() - state.lastCallAt;
    if (elapsed < minDelay) await sleep(minDelay - elapsed);
  }
  let attempt = 0;
  while (true) {
    if (state) state.lastCallAt = Date.now();
    let res;
    try { res = await fetchFn(); }
    catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
      attempt++; continue;
    }
    if (res.ok) return res;
    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retryable || attempt >= maxRetries) return res;
    const retryAfter = parseRetryAfter(res.headers?.get?.("Retry-After"));
    await sleep(retryAfter !== null ? retryAfter : BASE_BACKOFF_MS * Math.pow(2, attempt));
    attempt++;
  }
}
// SYNC-END: rateLimit

export const __internal = { parseRetryAfter, minDelayMs, sleep };