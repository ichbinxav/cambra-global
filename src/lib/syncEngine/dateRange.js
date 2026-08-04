// SYNC MASTER — no se importa en runtime por diseño. Borrarlo desarma __sync_check__.test.js.
// ─── Date-range helpers — FUENTE DE VERDAD LÓGICA ───────────────────────────
//
// Decide la ventana de tiempo que se va a sincronizar y la inyecta en la URL
// del primer fetch usando los nombres de parámetro declarados por el provider
// en su entry de REGISTRY.
//
// Reglas (decisión del usuario):
//   - Backfill inicial: 12 meses.
//   - Incremental: desde `metadata_json.last_synced_until` hasta `now`.
//   - Todo en UTC.
//
// IMPORTANTE: módulo duplicado verbatim dentro de base44/functions/dataSyncAgent/entry.ts.
//
// `provider.date_range` schema (esperado en REGISTRY):
//   {
//     since_param: "created[gte]",      // nombre del query param de inicio
//     until_param: "created[lte]",      // nombre del query param de fin (opcional)
//     format: "unix" | "iso" | "iso_date"  // formato a serializar
//   }
//
// Si `date_range` no está declarado, esta capa es no-op — el provider sigue
// recibiendo su URL tal cual.

// SYNC-START: dateRange
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
// BUG-4 FIX (2026-07-09) — settlement-delay overlap for incremental syncs.
// Cursor almacenado = true high-water mark (max occurred_at real).
// Solape aplicado en lectura, NO horneado en el valor persistido.
export const CURSOR_READ_OVERLAP_MS = 24 * 60 * 60 * 1000;

export function computeSyncWindow({ lastSyncedUntil, now = new Date() }) {
  const until = new Date(now.getTime());
  let since;
  if (lastSyncedUntil) {
    const parsed = new Date(lastSyncedUntil);
    if (Number.isFinite(parsed.getTime())) {
      // Aplica solape en lectura, no en el valor almacenado.
      since = new Date(parsed.getTime() - CURSOR_READ_OVERLAP_MS);
    } else {
      since = new Date(now.getTime() - TWELVE_MONTHS_MS);
    }
  } else {
    // Backfill inicial: 12 meses.
    since = new Date(now.getTime() - TWELVE_MONTHS_MS);
  }
  return { since, until };
}

function formatDateValue(date, format) {
  if (format === "unix") return String(Math.floor(date.getTime() / 1000));
  if (format === "iso_date") return date.toISOString().slice(0, 10); // YYYY-MM-DD
  // default: full ISO 8601 (UTC, Z-suffixed)
  return date.toISOString();
}

// Inyecta los query params declarados en `cfg.date_range` en la URL.
// `cfg.date_range` puede ser falsy → URL devuelta tal cual.
export function applyDateRangeToUrl(url, cfg, window) {
  if (!cfg || typeof cfg !== "object") return url;
  if (!url || typeof url !== "string") return url;
  if (!window?.since || !window?.until) return url;

  const sinceParam = cfg.since_param;
  const untilParam = cfg.until_param;
  const format = cfg.format || "iso";

  // Sin since_param no hay nada que inyectar (until-only no es útil sin since).
  if (!sinceParam) return url;

  const [base, search = ""] = url.split("?");
  const params = new URLSearchParams(search);
  params.set(sinceParam, formatDateValue(window.since, format));
  if (untilParam) params.set(untilParam, formatDateValue(window.until, format));
  return `${base}?${params.toString()}`;
}
// SYNC-END: dateRange