/**
 * CAMBRA — Recovery Model (frontend, declarative)
 *
 * Purpose: classify each savings opportunity by HOW it gets recovered, so the
 * UI can honestly show the user which savings are free (they execute) vs which
 * are cambra-recovered on a success-fee basis.
 *
 * This is pure metadata. It does NOT:
 *   - compute any euro amount (scoreEngine is the single source of truth),
 *   - compute or charge any fee (no billing engine exists yet — deliberately),
 *   - track the 24-month recovery window (belongs to a future billing layer).
 *
 * Only communicates the model. Any real fee calculation must wait until
 * verified savings from connected data exist.
 *
 * Business rules (locked with founder):
 *   - payments, shipping → CAMBRA negotiates & measures → 25% success fee,
 *     24 months, on verified savings only, conditional (no savings → no fee).
 *   - saas → the brand executes themselves → free, no fee.
 *   - other verticals (banking, insurance, telecom, hr, finance ops) are not
 *     surfaced as recovery opportunities today (analyzer doesn't push them
 *     to the recovery flow), so they don't need a classification here.
 */

// Verticals we actively surface as recovery opportunities today.
const CAMBRA_RECOVERED = new Set(["payments", "shipping"]);
const SELF_SERVE = new Set(["saas"]);

/**
 * @param {string} vertical — one of 'payments' | 'shipping' | 'saas' | others
 * @returns {'cambra_recovered' | 'self_serve' | 'unknown'}
 */
export function getRecoveryType(vertical) {
  const v = String(vertical || "").toLowerCase().trim();
  if (CAMBRA_RECOVERED.has(v)) return "cambra_recovered";
  if (SELF_SERVE.has(v)) return "self_serve";
  return "unknown";
}

/**
 * UI copy per recovery type — kept alongside the classifier so every badge
 * renders the same context. The 25% figure NEVER appears without its frame
 * (verified · 24 months · conditional).
 */
export function getRecoveryCopy(recoveryType) {
  if (recoveryType === "cambra_recovered") {
    return {
      label: "Recovery",
      shortHint: "25% on verified savings",
      fullFrame:
        "CAMBRA negotiates & verifies against your real provider data. Fee is 25% of verified savings over 24 months — only if we actually recover margin. No savings, no fee.",
      accent: "cyan",
    };
  }
  if (recoveryType === "self_serve") {
    return {
      label: "Self-serve",
      shortHint: "Free · you execute",
      fullFrame:
        "You execute this yourself using CAMBRA's insight. No fee, ever — this is value we give away to prove the model.",
      accent: "emerald",
    };
  }
  return { label: "", shortHint: "", fullFrame: "", accent: "muted" };
}