# Decision Log — CHUNK COPY-1

**Fecha:** 2026-07-31 · **Alcance:** copy y tono. Cero cambios en motor, entidades, campos, rutas o lógica.

---

## Estado del chunk

| Tarea | Estado |
|---|---|
| T1 — "Brand" → Business / Comercio / Commerce | ✅ Completa (EN/FR/ES, locales + JSX público) |
| T2 — Jerga fintech → lenguaje de tendero | ⏸️ Bloqueada por volumen — ver "Diferido" |
| T3 — Brevedad y calidez | 🟡 Parcial — aplicada a las ~35 cadenas tocadas por T1 |

---

## TAREA 1 — Mapa antes / después

Grep de `brand` / `marque` / `marca` en copy visible → **cero ocurrencias restantes**, salvo las excepciones declaradas abajo.

### Landing / home

| Clave | Antes (EN) | Después (EN) |
|---|---|---|
| `hero_sub` | "Most independent **brands** overpay… hidden inside blended rates. CAMBRA measures your **effective rate** against the **interchange floor** and recovers what's negotiable." | "Most independent **businesses** overpay up to 40% on card payments. We check **what you pay** against the lowest **your bank and the card networks** allow, then recover the difference." |
| `hero_cta_secondary` | "Discover real brands savings" | "See what real businesses saved" |
| `hero_trust_3` | "EU brands only" | "EU businesses only" |
| `how_step4_desc` | "…join the brands negotiating as one… we **unlock** rates…" | "…join the businesses negotiating as one… we **get** rates…" |
| `stack_c3_d` | "…what brands your size actually pay." | "…what **similar businesses** actually pay." |
| `stack_c4_d` | "Real costs from real brands." | "Real costs from real businesses." |
| `ri_sub_pre` | "One real **brand**… paying an **effective** 2.21% per **transaction** when 1.47% was **achievable**." | "One real **business**… paying 2.21% **per sale** when 1.47% was **possible**." |
| `f150_h2_l1` | "150 brands." | "150 businesses." |
| `f150_sub` | "150 independent brands…" | "150 independent businesses…" |

ES: `marca(s)` → `comercio(s)`; "monitoring continuo" → "seguimiento continuo"; "Un gap de" → "Una diferencia de".
FR: `marque(s)` → `commerce(s)`; "taux" → "tarifs" donde il s'agit du prix payé.

### Benchmark / comparativa (Results + PDF)

| Clave | Antes | Después |
|---|---|---|
| `bench_title` | "Where you stand vs brands **like you**" | "Where you stand vs **similar businesses**" |
| `bench_callout` | "…of {country} brands **your size**." | "…of **similar** {country} **businesses**." |
| `bench_callout_cheaper` | idem | idem |
| `pdf_percentile_val_cheaper` | "…of brands your size" | "…of similar businesses" |
| `roadmap_ambition` | "**Brands in your tier** reach ~{x}%" | "**Similar businesses** reach ~{x}%" |

**T3 aplicado aquí:** eliminada la cláusula relacional "like you" / "como la tuya" / "comme vous" y la perífrasis "your size" / "de tu tamaño" / "de votre taille" → sustantivo + adjetivo ("similar businesses" / "comercios similares" / "commerces similaires"). ES pasa de 7 palabras a 3.

### Colectivo / CTAs

| Clave | Antes | Después |
|---|---|---|
| `coll_sub` | "Many brands negotiating as one. The more **GMV** joins, the more **leverage** the collective has to **recover your margin**." | "Many businesses negotiating as one. The more **sales** join, the more **weight** the collective has to **win you a better rate**." |
| `ac_recover_why_coll` | "many brands…" | "many businesses…" |
| `results_cta_coll_sub` | "many brands…" | "many businesses…" |
| `coll_email_ph` / `call_email_ph` | `you@brand.com` / `tu@marca.com` / `vous@marque.com` | `you@yourbusiness.com` / `tu@tucomercio.com` / `vous@votrecommerce.com` |
| `analyzer_email_placeholder` | `you@yourbrand.com` | `you@yourbusiness.com` |
| `analyzer_email_invalid` | idem dentro del ejemplo | idem |

### Testimonials / Pricing / Security / Dashboard

| Clave | Antes | Después |
|---|---|---|
| `tst_hero_h1` | "What brands say about CAMBRA." | "What businesses say about CAMBRA." |
| `tst_hero_sub` | "Real results from independent **commerce brands** across Europe." | "Real results from independent **businesses** across Europe." |
| `prc_faq_a1` | "Early founding brands… the audit, **benchmarks**, **scoring** and dashboard" | "Early founding businesses… the audit, the **industry comparison**, the **score** and the dashboard" |
| `sec_b3_body` | "Every **brand's** data… **Benchmarks**… as a number in a **cohort**" | "Every **business's** data… **Industry comparisons**… as a number in a **group**" |
| `sec_b5_body` | "…available for brands that require one" | "…available for businesses that require one" |
| `state_a_sub` (Dashboard) | "…benchmarks your costs against anonymized data from European brands **at your revenue tier**." | "…compares your costs with anonymous data from **similar European businesses**." + frase partida en dos |
| `brand_name_optional` | "Brand name (optional)" | "Business name (optional)" |

### Strings hardcodeadas en JSX (público / miembro)

| Archivo | Antes | Después |
|---|---|---|
| `src/pages/Account.jsx` | label "Brand name", placeholder "Your brand" | "Business name" / "Your business" |
| `src/pages/BrandProfile.jsx` | "Brand Profile", "Tell us about your brand" | "Business Profile", "Tell us about your business" |
| `src/pages/ConnectIntegrations.jsx` | "No brand found" | "No business found" |
| `src/pages/PaymentsAnalyzer.jsx` | error "Brand name: must be between 2 and 80 characters." | "Business name: …" |

---

## Excepciones declaradas (NO tocadas)

1. **Campos de código y esquema** — entidad `Brand`, `brand_name`, `brandName`, `brand_id`, `?brand_id=`, `getBrand()`, `BrandBlock.jsx`, `BrandProfile.jsx` (nombre de archivo y ruta `/BrandProfile`). Fuera de alcance por regla explícita.
2. **Comentarios de código** — p. ej. `/* SWEEP-1 T2 — brand name is optional… */` en `en.js`. Regla explícita: no tocar comentarios.
3. **Páginas admin** (`src/pages/admin/*`) — 21 ocurrencias de "Brand" en cabeceras de tabla, buscadores y etiquetas internas. No son superficie pública; el chunk delimita "web de cara al público". Pendiente de decisión: si el founder-OS también debe hablar de "Business", es un chunk aparte.
4. **`brand_fallback`** — ⚠️ revertida, ver bloqueo abajo.

---

## ⚠️ BLOQUEO — test de contrato que asserta copy de UI

`src/pages/__contracts__/analyzerResultsHandoff.test.js`, líneas 278-280:

```js
expect(en).toMatch(/brand_fallback:\s*"Your brand"/);
expect(fr).toMatch(/brand_fallback:\s*"Votre marque"/);
expect(es).toMatch(/brand_fallback:\s*"Tu marca"/);
```

Es el único test que **busca la palabra "brand" dentro de un string de UI**, y sella el valor exacto de `brand_fallback` en los tres idiomas. Traducirlo a "Your business" / "Tu comercio" / "Votre commerce" rompe la suite.

**Acción tomada:** cambio **revertido**, `brand_fallback` sigue en "Your brand" / "Tu marca" / "Votre marque". Es la única cadena visible que conserva la terminología antigua. Aparece en Results cuando el visitante no rellenó el nombre del comercio.

**Decisión pendiente del founder:** autorizar la actualización simultánea del sello del test + los tres valores. No se toca sin confirmación explícita, por regla del chunk.

---

## Diferido a CHUNK COPY-2 (T2 + resto de T3)

Censo real medido tras completar T1:

- **~50 claves con jerga por idioma** (GMV ×8, effective rate ×12, achievable ×5, interchange/scheme ×4, benchmark ×10, cohort ×3, bps ×1) → **~150 ediciones** en los tres diccionarios.
- **Componente ⓘ nuevo** (`TermHint`) para degradar cada término técnico a segundo nivel sin perderlo, más su cableado en Results / in-store insights.
- **Frase fija Verified/Estimated** una vez por página: 3 claves nuevas + inserción en Analyzer, Results y Dashboard.
- **Plantillas de email transaccional** (confirmación de informe, "statement received").
- **Excepción TPV** ya registrada: se mantiene literal en ES; EN "card terminal", FR "terminal de paiement".

Se difiere entero y no a medias: mezclar media pasada de terminología deja el informe hablando dos idiomas técnicos a la vez, que es peor que la jerga consistente actual.

---

## Verificación

- Grep `brand|marque|marca` en copy visible → 0 (excepciones arriba).
- Paridad EN/FR/ES intacta: ninguna clave añadida ni eliminada en este chunk.
- Trato: tuteo ES / vouvoiement FR respetado en las 35 cadenas reescritas.
- Sin cambios en motor, entidades, rutas ni aritmética.