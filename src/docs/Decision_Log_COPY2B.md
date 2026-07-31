# Decision Log — CHUNK COPY-2B

**Fecha:** 2026-07-31 · **Alcance:** landing, How it works (`how_*` + `hiw_*`), Pricing, /Security y emails transaccionales. Cero cambios en cálculos, motor, entidades, campos o rutas.

**Paridad i18n:** **617 claves por idioma** (EN = FR = ES) — igual que al empezar. Este chunk no añade ni elimina claves, solo cambia valores. Sin huérfanas, faltantes ni duplicadas.

**Tests sellados:** ninguno de los tests toca las cadenas modificadas. No he parado ni he tocado ningún test.

---

## TAREA 1 — Censo previo (antes de editar)

Búsqueda de `GMV · effective rate/fee · achievable · interchange · scheme fee · processor margin · PSP · cohort · benchmark · bps · basis points · tier · delta` sobre landing, HIW, Pricing, /Security y emails.

**En el diccionario i18n (14 claves):**

| Clave | Idiomas | Jerga encontrada |
|---|---|---|
| `how_step1_desc` | EN | GMV, PSP |
| `how_step2_title` | EN / FR / ES | effective rate / taux effectif / tasa efectiva |
| `how_step2_desc` | EN / FR | interchange floor / plancher d'interchange |
| `hiw_s2_detail` | EN / FR / ES | effective fee, achievable floor, tier, delta, interchange, scheme fees, processor margin |
| `hiw_s3_detail` | EN / ES | benchmark |
| `prc_atbench_label` | EN / ES | benchmark |
| `stack_c4_t` | EN / FR / ES | Benchmark |
| `sec_b2_body` | EN / FR / ES | effective rate, benchmark |
| `coll_ctx_margin` | EN | processor margin |

**Hardcodeado en JSX (sin i18n — en ES/FR salía en inglés igualmente):**

| Archivo | Jerga |
|---|---|
| `Landing.jsx` (JSON-LD + alt del hero) | effective payment rate, interchange floors, "Payment fee benchmarking", "Interchange floor analysis", "Effective rate calculation" |
| `ProblemSectionWow.jsx` | interchange floor, PSP, effective rate, GMV, achievable |
| `SavingsCurveChart.jsx` | Cohort, Benchmark methodology, GMV ×2, effective, achievable |
| `PricingDual.jsx` | "Public-pricing benchmarks", "Interchange floor benchmarking" |
| `AccessModelCards.jsx` (Pricing) | "Benchmarking against similar brands", "Continuous benchmark updates", "benchmark your costs" |
| `TheStackSection.jsx` | benchmark (texto alternativo de la imagen) |

**Emails:** las plantillas son **HTML hardcodeado en las funciones backend, sin i18n** — se envían siempre en inglés. Encontrado en `onBrandCreated` (bienvenida) y `joinCollective` (confirmación de socio fundador). `submitCallRequest` y `submitContactMessage` ya estaban limpios en su parte de cara al comercio.

---

## TAREA 2 + 3 — Sustituciones (misma tabla que 2A, sin variantes nuevas)

### How it works (landing, `how_*`)

| Clave | Antes | Después |
|---|---|---|
| `how_step1_desc` (EN) | "Your annual GMV, average ticket, and current PSP…" | "Your yearly sales, your average ticket, and **who processes your payments**. Sixty seconds. Nothing to connect." |
| `how_step2_title` | See your effective rate / votre taux effectif / tu tasa efectiva | **See what you pay** / Découvrez ce que vous payez / Descubre lo que pagas |
| `how_step2_desc` (EN) | "…against the interchange floor — the real minimum for cards your size." | "We compare it with **the minimum banks and card networks allow** for a business your size." |
| `how_step2_desc` (FR) | "…au plancher d'interchange — le minimum réel pour une structure de votre taille." | "…au **minimum autorisé par la banque et les réseaux de cartes** pour un commerce de votre taille." |

> El título deja de repetir el sujeto y el cuerpo lo retoma con "it" / "le" / (elidido en ES). Dos frases cortas en vez de una con guion largo.

### How it works (página, `hiw_*`) — el peor caso del repo

`hiw_s2_detail` era **una frase de 41 palabras con tres cláusulas y seis términos técnicos**. Partida en dos:

- **EN antes:** "We compare your effective fee against the achievable floor for your tier and geography, and split the delta by interchange, scheme fees and processor margin — the three layers that actually leak money."
- **EN después:** "We compare what you pay with the best rate possible for your size and country. Then we split the gap into three parts: bank fee, card network fee and provider margin — the last one is where the money leaks."
- **ES después:** "Comparamos lo que pagas con la mejor tarifa posible para tu tamaño y tu país. Después partimos la diferencia en tres: comisión del banco, comisión de la tarjeta y margen del proveedor — por ahí es por donde se escapa el dinero."
- **FR después:** "Nous comparons ce que vous payez au meilleur tarif possible pour votre taille et votre pays. Puis nous décomposons l'écart en trois parts : frais banque, frais réseau carte et marge du prestataire — c'est cette dernière qui fuit."

> **Corrección de precisión, no solo de estilo:** el original decía "las tres capas por donde de verdad se escapa el dinero". Es falso — dos de las tres (banco y tarjeta) son exactamente las que **no** se mueven, como decimos en el desglose del informe desde 2A. Ahora dice que la fuga está en la tercera. Cero cambios de número; el copy ahora coincide con lo que el motor calcula.

`hiw_s3_detail` (EN/ES): "de la estimación al cálculo… la verdad a nivel de transacción — el mismo benchmark" → "de la estimación **a la medición**… **sustituye lo que escribiste por tus transacciones reales** — **la misma comparación**".

### Pricing

| Clave / sitio | Antes | Después |
|---|---|---|
| `prc_atbench_label` | Already at benchmark / Ya en el benchmark | **Already at the best rate** / Ya en la mejor tarifa |
| `PricingDual` FREE | "Public-pricing benchmarks" | "Comparison with public prices" |
| `PricingDual` RECOVERY | "Interchange floor benchmarking" | "Comparison vs. the minimum allowed" |
| `AccessModelCards` | "Benchmarking against similar brands" | "Comparison with similar businesses" |
| `AccessModelCards` | "Continuous benchmark updates" | "Always-updated market comparison" |
| `AccessModelCards` | "Run the full infrastructure audit, benchmark your costs, and quantify recoverable margin" | "Run the full audit, compare your costs with the market, and see how much you can recover" |
| `AccessModelCards` | "Typical brands discover €8k–€120k/year in recoverable infrastructure inefficiencies." | "Typical businesses find €8k–€120k/year they can recover." |

### Landing

| Sitio | Antes | Después |
|---|---|---|
| `stack_c4_t` | Benchmark (base layer) / (capa base) / (couche de base) | **What others really pay** / Lo que pagan otros / Ce que paient les autres |
| ProblemSectionWow · tarjeta 1 | "Blended pricing hides the interchange floor. Most brands pay 2.0–2.6%…" | "A single all-in rate hides the minimum. Most businesses pay 2.0–2.6% when their real floor is 1.4–1.5%." |
| ProblemSectionWow · tarjeta 2 | "…on the wrong PSP. On the right one, the schemes' floor is the same — the margin isn't." | "Foreign cards add +1.75% with the wrong **provider**. With the right one the **card networks** charge the same — the provider doesn't." |
| ProblemSectionWow · tarjeta 3 | "…compound on low-ticket flows. Amortised against your real ticket size, they quietly change your effective rate." | "A €0.25 fee per sale piles up when your tickets are small. Spread over your real ticket, it quietly raises **what you pay**." |
| ProblemSectionWow + SavingsCurveChart · pie | "Illustrative — €1M GMV brand, effective 2.21% vs 1.47% achievable." | "Illustrative — a business with €1M in yearly sales, **paying 2.21% when 1.47% was possible**." |
| SavingsCurveChart · meta | "Cohort · DTC €200k–€2M" / "Benchmark methodology" | "Similar businesses · €200k–€2M" / "How we compare" |
| SavingsCurveChart · rango | "…depending on your volume (€200k–€2M GMV)." | "…depending on your sales (€200k–€2M a year)." |
| JSON-LD `description` | "compares your effective payment rate against interchange floors" | "compares what you pay with the minimum banks and card networks allow" |
| JSON-LD `featureList` | "Payment fee benchmarking" · "Interchange floor analysis" · "Effective rate calculation" | "Card fee comparison vs. industry" · "Minimum allowed rate analysis" · "What you really pay, calculated" |
| `alt` hero + `alt` TheStackSection | "effective rate vs interchange floor" · "…and benchmark" | "what you pay vs the minimum allowed" · "…and what others pay" |

> El JSON-LD y los `alt` no los ve el comercio pero **sí Google**. Si el snippet de búsqueda dice "effective payment rate" y la página dice "lo que pagas", la incoherencia empieza antes del primer clic.

### Restos de 2A barridos aquí (4 claves)

Aparecieron en el grep final y son del flujo ya cerrado; los arreglo porque dejarlos sería incoherente con el propio 2A:
`insufficient_hero_cta` "Connect your PSP" → **"Connect your provider"** (3 idiomas) · `ct_group_psp` "PSP · Online payments" → **"Online payments"** · `ct_page_sub` "improves your benchmark accuracy" → "makes your figures more exact" · `bench_comparison` "Benchmark comparison" → "Comparison vs. industry".

---

## TAREA 4 — /Security: confirmación de que ningún claim cambió de alcance

**Una sola frase tocada en toda la página**, y solo su segunda mitad. `sec_b2_body`, EN:

> **Antes:** "Our analysis runs on **aggregate numbers**: **volumes**, fees, rates, payment mix. […] Statement uploads are used solely to **compute your effective rate**, and the figures we **benchmark** are anonymized and aggregated."
>
> **Después:** "Our analysis runs on **aggregate figures**: **sales**, fees, rates, payment mix. […] **Statements you upload** are used solely to **work out what you pay**, and the figures we **compare** are anonymized and aggregated."

ES: "Los extractos **que subes** se usan únicamente para **saber lo que pagas**, y las cifras que comparamos están anonimizadas y agregadas."
FR: "Les relevés **que vous importez** servent uniquement à **établir ce que vous payez**, et les chiffres que nous comparons sont anonymisés et agrégés."

**Verificación claim por claim — los seis intactos:**

1. El análisis corre sobre cifras agregadas → intacto ("aggregate numbers" → "aggregate figures" es sinónimo; **no** lo reduje a "totals" precisamente para no estrechar el alcance).
2. No necesitamos ni tratamos datos personales de clientes finales → **literal, sin tocar**.
3. Ni nombres, ni emails, ni números de tarjeta → **literal, sin tocar**.
4. Los datos de tarjeta nunca pasan por CAMBRA; permanecen en la infraestructura certificada del proveedor → **literal, sin tocar**.
5. Los extractos se usan **únicamente** para ese cálculo → intacto; "únicamente/solely" se conserva, que es la palabra que limita el alcance. "Calcular tu tasa efectiva" y "saber lo que pagas" designan exactamente la misma operación.
6. Las cifras comparadas están anonimizadas y agregadas → intacto; solo cambia el verbo "benchmark" → "comparar".

**No tocado por precaución** (regla de la tarea 4): `sec_b1_body` (frontera técnica del OAuth de solo lectura), `sec_b3_body` (aislamiento entre comercios), `sec_b4_body` (cifrado), `sec_b5_body` (GDPR/SASU/DPA), `sec_b6_body` (revocación) y las dos listas *can / can never*. Ninguna contenía jerga de la tabla y todas son calibraciones de LEGAL-1/TRUTH-1: reescribirlas sin necesidad solo añade riesgo.

---

## TAREA 5 — Emails transaccionales

Las plantillas **no usan i18n**: son HTML hardcodeado dentro de las funciones backend y salen siempre en inglés. Este chunk **no las localiza** (sería introducir un sistema de plantillas nuevo, muy por encima de un chunk de copy) — corrige el inglés y lo declara como deuda abajo.

**`onBrandCreated` — email de bienvenida.** Era el peor: seguía vendiendo el producto multivertical anterior al pivote y anunciaba una página muerta.

| Antes | Después |
|---|---|
| Asunto: "Welcome to CAMBRA — your infrastructure intelligence starts here" | "Welcome to CAMBRA — let's see what you're paying" |
| "the infrastructure audit and intelligence platform for independent brands" | "we help independent businesses stop overpaying on card payments" |
| "**Infrastructure Analyzer** — Benchmark your payments, **shipping, and SaaS** against real network rates." | "**The analyzer** — See what you pay on card payments, and the minimum banks and card networks allow." |
| "**AI Copilot** — Ongoing infrastructure intelligence and optimization recommendations." | "**Verified figures** — Connect your payment provider, read-only, and your estimate becomes a measured number." |
| "**Member Network** — Connect with independent brands across Europe." | "**The collective** — Many businesses negotiating as one for a better card rate." |
| "…identifies exactly where your **infrastructure** is costing you more than it should." | "…shows exactly where your **card payments** cost more than they should." |
| Pie: "CAMBRA · Infrastructure Audit & Intelligence Platform" | "CAMBRA · Payments margin recovery" |

> El bloque "Member Network" **prometía una página que redirige a home desde FASE 1.2**. No era jerga: era una promesa falsa en el primer email que recibe un comercio. Lo he reapuntado al colectivo, que sí existe. Menciono el cambio de contenido explícitamente porque va un paso más allá del fraseo.
>
> "shipping and SaaS" tampoco es jerga — es un producto que ya no vendemos. Mismo criterio.

**`joinCollective` — confirmación de socio fundador:** "many **brands** negotiating as one… the margin each of us **leaks**" → "many **businesses** negotiating as one… the margin each of us **loses**". "**€X/mo** added to the collective's negotiating **volume**" → "**€X/mo in sales** added to the collective's negotiating **weight**".

**`submitCallRequest`** (confirmación al comercio) y **`submitContactMessage`**: ya limpios, sin cambios.

**Emails internos a admin/founder** (`joinCollective`, `submitCallRequest`, `submitWaitlistSignup`): **conservan "Monthly GMV"** deliberadamente. Los lees tú, no el comercio, y "GMV" es la etiqueta más precisa para un aviso operativo.

---

## Deuda declarada

1. **Los emails no están localizados.** Un comercio español que se registra recibe el email en inglés. No lo arreglo aquí porque exige un sistema de plantillas i18n en backend — es un chunk propio, y con criterio de producto (¿de dónde sale el idioma preferido del usuario?).
2. **`joinCollective` sigue diciendo "The Collective Terms are a draft pending legal review"** en el pie del email, cuando COPY-1 ya retiró esos marcadores de la interfaz tras tu aprobación. **No lo he tocado**: es una afirmación legal y esa decisión te corresponde a ti, no a un chunk de copy. Dime y lo alineo en un minuto.
3. **`/ForProviders` conservado con su jerga** ("basis point", "benchmark", "ICP", "PSP", "achievable"). Su lector es un director comercial de un proveedor de pagos, no la señora de la mercería — ahí la precisión técnica es la que genera confianza. Fuera del alcance declarado del chunk (landing, HIW, Pricing, Security, emails).
4. **App interna** (`Account`: etiqueta "In-store GMV"; `ConnectIntegrations`: "upgrades a benchmark from estimated to verified"): superficie de usuario registrado, no pública. Pendiente de un COPY-2D si lo quieres.

---

## Verificación

- ✅ Paridad: EN = FR = ES = **617 claves**. Sin huérfanas, faltantes ni duplicadas. El chunk no crea claves.
- ✅ Grep de los 13 términos sobre landing / HIW / Pricing / Security / emails → **cero**, salvo las excepciones documentadas arriba (ForProviders, emails a admin, app interna).
- ✅ Los seis claims de /Security verificados uno a uno; solo una frase tocada y sin cambio de alcance (sección Tarea 4).
- ✅ Ningún test sellado afectado — no he tenido que parar.
- ❌ **No ejecutable desde aquí:** suite, lint, build y las capturas de landing / How it works / Pricing / Security en los tres idiomas + el email renderizado. Quedan para la batería externa sobre el zip.