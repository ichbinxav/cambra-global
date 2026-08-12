# CAMBRA — Human-first + SEO-first copy pass

## Outcome

The public product now leads with the customer problem: understanding card-payment costs and recovering savings that can be verified. The visual system, page structure, product boundaries, evidence gates and commercial terms are unchanged.

## Search intent by language

| Language | Primary intent | Natural vocabulary used |
|---|---|---|
| English | audit/reduce card processing fees | card payment costs, card fees, effective rate, verified savings |
| French | comprendre/réduire les frais de paiement | frais de paiement par carte, taux effectif, économies vérifiées |
| Spanish | auditar/reducir comisiones de pagos | costes de pago con tarjeta, comisiones, tasa efectiva, ahorro verificado |

Current search results consistently use concrete fee language rather than “infrastructure intelligence”. Stripe’s French and Spanish resources also use *frais de traitement des paiements* and *comisiones de las pasarelas de pagos*, which supports the native terminology selected here.

## Before → after

| Surface | Before | After |
|---|---|---|
| Homepage H1 (EN) | See the infrastructure behind every payment. | Find out what your payments really cost. |
| Homepage H1 (FR) | Voyez l'infrastructure derrière chaque paiement. | Découvrez ce que vos paiements vous coûtent vraiment. |
| Homepage H1 (ES) | Ve la infraestructura detrás de cada pago. | Descubre cuánto te cuestan realmente tus pagos. |
| Main CTA | Analyze my payments / Analyser / Analizar | Check my payment costs / Vérifier mes frais / Comprobar mis costes |
| Process H2 | operating context → governed decision | payment fees → clear next step |
| Pricing promise | abstract two-step narrative | free analysis; recovery fee comes from confirmed results |

## Claims and conversion controls

- “May be overpaying” replaces any implication that every merchant has savings.
- “Verified” and “confirmed” remain attached to savings claims.
- Free applies to the first analysis; recovery economics remain governed by the canonical pricing terms.
- Read-only verification remains explicit in the journey.
- EN, FR and ES are written natively and keep the same factual boundary.

## SEO implementation

- Homepage titles and descriptions now target concrete card-payment audit intent in EN/FR/ES.
- Analyzer metadata targets card processing fees and effective payment rate.
- Static HTML, Open Graph, Twitter and Service JSON-LD match the runtime source of truth.
- Existing canonical URLs, robots behavior, public-route inventory and internal navigation remain unchanged.

## Verification

`humanFirstSeoCopy.test.js` checks native promises, non-guaranteed savings language, removal of technical jargon from the hero and parity between static and runtime metadata. The existing locale, landing, SEO, claims and release suites remain the regression boundary.
