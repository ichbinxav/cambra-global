# Decision Log · Iter 4 — M4-refinado (v1.5.0)

> **Date sealed:** 2026-07-12 · **Owner:** Xavi + Base44 chief-of-staff
> **Engine version bumped:** `payments-gap-1.4.0` → `payments-gap-1.5.0`
> **SYNC block char delta:** 39,904 → 62,967 (+23,063 chars)

## 1 · Scope

Two capabilities land in v1.5.0. Both are **in-store only** (online path stays
byte-identical to 1.4.0 — retrocompat oracle locked with the Stripe EU
`226.25 / 149.5 / annual {6140, 7675, 9210}` fixture).

1. **Multi-anchor achievable selection.** In-store achievable is picked by
   MIN-EFFECTIVE across every verified in-store anchor in the merchant's
   region, evaluated at THEIR ticket. The winner is a real, publicly
   contractable provider — no interpolated theoretical rates.
2. **Deterministic 3-state classification** written onto every engine result:
   `savings_opportunity | already_optimized | insufficient_data`. Combined
   submits get an additional top-level `combined_classification` following a
   sealed precedence rule.

## 2 · Classifier matrix — SEALED

| # | Annual gap vs threshold | Row provenance | Ticket / pool state | → Classification |
|---|---|---|---|---|
| A | Material (> threshold) | Verified | Ticket present | `savings_opportunity` |
| B | Material (> threshold) | **Fallback** | Ticket present | **`savings_opportunity`** |
| C | Small (≤ threshold) | Verified | Ticket present | `already_optimized` |
| D | Small (≤ threshold) | **Fallback** | Ticket present | **`insufficient_data`** |
| E | Any | Any | **Ticket absent** | `insufficient_data` |
| F | Any | Any | `in_store` + pool empty | `insufficient_data` |

**Threshold:** `MAX(€200 absolute, 15 bps × monthly_gmv × 12 relative)` — the
LARGER of the two. Semantics **≤** — exactly at threshold counts as a
victory (rows C/D). Sealed with Xavi 2026-07-12.

**Precedence when multiple conditions apply:** row E first, row F second,
then the C/D/A/B trio.

## 3 · Combined-mode aggregator — SEALED

Precedence rule:

```
savings_opportunity > insufficient_data > already_optimized
```

* **Any channel `savings_opportunity`** → combined `savings_opportunity`.
  Total sums lo/point/hi across **only** the opportunity channels.
  Optimized channels contribute €0. Insufficient channels contribute €0.
  Per-channel classifications are preserved in the response so Results can
  render the mini-victory ("✓ Already at the best contractable rate") next
  to the recoverable channel's number.
* **Zero opportunity + at least one insufficient** → combined `insufficient_data`.
  Never claim global victory when we couldn't evaluate a channel.
* **All channels `already_optimized`** → combined `already_optimized`.

## 4 · The `verified=false` hotfix

**First draft (2026-07-12 morning):** classifier returned `insufficient_data`
unconditionally whenever `row_verified === false`. Reviewed same day —
would have killed the estimated funnel for every merchant on a bank TPV,
every RoW merchant, and every `other`-provider selection.

**Corrected literal (source `src/lib/paymentsGap.js`, line ~682):**

```js
if (belowThreshold) {
  return row_verified ? "already_optimized" : "insufficient_data";
}
return "savings_opportunity";
```

The corrected rule: `verified=false` **only** blocks `already_optimized`
(rows C↔D) and downgrades **zeros** to `insufficient_data`; a **material
gap** on a fallback row is still `savings_opportunity` (row B) — because
the fallback row already ships `FALLBACK_ASSUMPTION` verbatim next to the
number, so the merchant reads the caveat inline.

## 5 · Multi-anchor rules

Pool composition (in-store only):
- `verified === true`
- `channel === "in_store"`
- `region === merchant's region`
- `achievable_breakdown_json.anchor_provider` present
- `provider_slug !== merchant's current provider` (never recommend
  migrating to yourself)

Empty pool → engine falls back to `row.achievable_*` (regional fallback rows
carry a documented anchor). Winner emitted verbatim in
`result.benchmark_resolution = { method: "multi_anchor_min_effective",
avg_ticket_eur, ticket_source: "declared", candidates, winner,
winner_effective_bps, confidence }`. `confidence: "high"` requires ≥2
candidates AND `row.verified === true`. Any weakness → `"reduced"`.

Ticket-driven breakpoint verified in tests:
- €10 ticket EU → SumUp wins (fixed-fee drag beats Stripe Terminal below ~€17)
- €50 ticket EU → Stripe Terminal wins
- €100 ticket EU → Stripe Terminal wins comfortably

## 6 · Byte-parity triple

Motor lives in three files; SYNC block char-identical in all three:

| File | Block chars | Roundtrip matches src |
|---|---|---|
| `src/lib/paymentsGap.js` (SOURCE) | 62,967 | — |
| `base44/functions/submitPaymentsAnalysis/entry.ts` | 62,967 | ✅ |
| `base44/functions/computeStripeVerifiedGap/entry.ts` | 62,967 | ✅ |

`src/lib/syncEngine/__sync_check__.test.js` — **8 passed, 2 skipped (unrelated structural drift)**, 33 ms.

## 7 · Retrocompat oracle

Case Stripe / EU / online / GMV€1M-yr / ticket€50 / intl15%:

| Metric | 1.4.0 | 1.5.0 | Match |
|---|---|---|---|
| `current_effective_bps` | 226.25 | 226.25 | ✅ |
| `achievable_effective_bps` | 149.5 | 149.5 | ✅ |
| `annual.point` | 7675 | 7675 | ✅ |
| `annual.lo` | 6140 | 6140 | ✅ |
| `annual.hi` | 9210 | 9210 | ✅ |
| `benchmark_resolution` | absent | absent | ✅ |
| `classification` | (n/a in 1.4.0) | `savings_opportunity` | new field |

## 8 · Files touched

**Source of truth:** `src/lib/paymentsGap.js`
**Mirrors:** the two Deno functions above.
**UI:** `src/pages/PaymentsResults.jsx` (branches per classification),
`src/components/paymentsResults/OptimizedHero.jsx` (new),
`src/components/paymentsResults/CombinedGapHero.jsx` (mini-victory + honest sum).
**i18n:** `src/lib/i18n.jsx` — 10 new keys × 3 locales = 30 slots.
**Tests:** `src/lib/paymentsGap.classifier.test.js` (new, 3 families × N cases).

## 9 · Post-deploy verification — 2026-07-12 evening

**Diagnóstico del stale runtime.** Tras el bump a 1.5.0, el sandbox Deno de
Base44 siguió sirviendo 1.4.0 durante ~40 s pese a que los `entry.ts` en disco
llevaban 1.5.0 (`has_1_5_0_string: true` en las 3 copias, SYNC block byte-
idéntico). Descartado fallo de parse silencioso mediante:
1. **Scanner regex-aware** sobre ambos `entry.ts`: balance perfecto
   (curly 0 / paren 0 / square 0). El paren=1 inicial del scanner naif era
   falso positivo por no saltar RegExp literals (`/^https?:\/\//i`).
2. **Deploy probe:** añadido `__deploy_probe: "PROBE_20260712_A"` al response
   handler. Tras touch de whitespace en ambos `entry.ts` + 25 s → la probe
   apareció **junto con `engine_version: "payments-gap-1.5.0"` y
   `classification` presente**. Prueba definitiva de que el redeploy ocurre
   pero necesita un touch explícito + ~40-50 s cumulativos, no ~20 s.
3. Probe retirada tras confirmación; deploy limpio de vuelta.

**Regla operativa añadida a KNOWN_DEBT** (patrón repetitivo, no bug de código):
> "Base44 sandbox — cambios sólo en constantes o strings dentro de `entry.ts`
> pueden requerir touch de whitespace + ~40 s para propagar al runtime Deno.
> Verificar SIEMPRE con probe `__deploy_probe` cuando el cambio sea de tipo
> version-bump-only, antes de correr tests end-to-end."

**5 casos reales contra 1.5.0 en producción** (cita literal de responses):

| # | Payload | engine_version | classification | benchmark_resolution.winner | annual point |
|---|---|---|---|---|---|
| 1 | Bank TPV Boutique €40k/€60/ES/in_store | `1.5.0` ✅ | `savings_opportunity` | `smile_and_pay` @ 155 bps | €3,420 |
| 2 | Cafetería €20k/€10/FR/in_store | `1.5.0` ✅ | `savings_opportunity` | `smile_and_pay` @ 155 bps | €1,860 |
| 3 | Boutique €60k/€120/FR/in_store | `1.5.0` ✅ | `savings_opportunity` | `stripe_terminal` @ 148.33 bps | €5,460 |
| 4 | Stripe EU €83k/€50/15% online (retrocompat) | `1.5.0` ✅ | `savings_opportunity` | (online — n/a) | €7,675 |
| 5 | Combined DTC€50k + popup€20k FR | `1.5.0` ✅ | (heredado top) | (per-channel) | €6,312 (total) |

**Retrocompat oracle CLAVADO** (Case 4): `226.25 / 149.5 / annual {6140, 7675, 9210}` — **byte-idéntico** a 1.4.0 y a 1.3.0 desde producción.

**Descubrimiento empírico del corte.** El pool multi-anchor EU en la tabla
deployada tiene **3 candidatos verificados** (`smile_and_pay`,
`stripe_terminal`, `sumup`) — no 2 como el fixture local. Smile & Pay a
1.55% flat gana a tickets bajos/medios donde el fixed-fee drag de Stripe
Terminal (`+ €0.10`) domina. La aritmética publicada en el response
confirma que el breakpoint es correcto:
- €10 ticket: Smile 155 < SumUp 175 < Stripe Terminal 240 → Smile gana
- €60 ticket: Smile 155 < Stripe Terminal 156.67 < SumUp 175 → Smile gana por 1.67 bps
- €120 ticket: Stripe Terminal 148.33 < Smile 155 < SumUp 175 → **Stripe Terminal gana** (breakpoint disparado)

Los tests locales (que sí usan un fixture de 2 anchors) siguen siendo
válidos como oracle de la LÓGICA del selector; los responses de producción
son el oracle de la SELECCIÓN real dada la tabla actual. Ambas están
coherentes.

**Corte 2 sellado con el motor 1.5.0 verificado en producción, no en disco.**