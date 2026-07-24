# Decision Log — I18N-GAP: cobertura trilingüe de los 7 archivos fuera del sistema

Fecha: 2026-07-24 · Diccionario: `src/lib/i18n.jsx` (EN/FR/ES, flat keys).
Todas las cadenas FR/ES de la tabla fuente migradas VERBATIM. Cero cambios de
lógica, motor, estilos o layout.

## Claves añadidas — 52 por idioma, paridad por construcción

Los tres bloques (EN/FR/ES) se añadieron con el MISMO conjunto de claves en la
misma operación; cualquier desviación sería visible en el diff. Recuento: 484
existentes + **52 nuevas = 536 por idioma** (verificación programática del zip
pendiente, como el resto de lint/tests/build).

### Por archivo
- **TrustSecuritySection.jsx** (13): `trust_sec_eyebrow`, `trust_sec_h2_pre/kw`,
  `trust_sec_b1_t/d` … `b4_t/d`, `trust_sec_link`, `trust_sec_vault_alt`.
- **Security.jsx + SecurityHero + CanCannotTable** (34): `sec_eyebrow`,
  `sec_h1_pre/kw/post`, `sec_sub`, `sec_b1_h2/body` … `sec_b6_h2/body`,
  `sec_can_title` + `sec_can_1-4`, `sec_cannot_title` + `sec_cannot_1-4`,
  `sec_close_h2/body`, `sec_cta_contact`, `sec_cta_analyze`, `sec_chip_1-3`.
- **AnalyzingOverlay.jsx** (5): `overlay_title`, `overlay_step_1-4`.
- **SecurityBlock.jsx**: sin literales propios — recibe title/children por props
  desde Security.jsx. Sin cambios.
- **FieldCard.jsx**: auditado — solo decoración (`aria-hidden`), la copy visible
  llega por children desde PaymentsAnalyzer. Sin cambios, nada que migrar.

## Traducciones propias (no cubiertas por la tabla) — marcadas en código

`// i18n: traducción propia, revisar` en SecurityHero + diccionario:
- `sec_chip_1`: "Read-only OAuth" → FR "OAuth en lecture seule" · ES "OAuth de solo lectura"
- `sec_chip_2`: "Encrypted end-to-end" → FR "Chiffré de bout en bout" · ES "Cifrado de extremo a extremo"
- `sec_chip_3`: "GDPR · France" → FR "RGPD · France" · ES "RGPD · Francia"

## Reutilizaciones y desviaciones deliberadas (documentadas)

1. **`sec_cta_contact` / `sec_cta_analyze` creadas nuevas** — se buscó antes:
   `footer_contact` es "Contact/Contacto" (no "Contact us") y no existe ninguna
   clave "See my payment gap". Sin duplicación real.
2. **`trust_sec_link` sin el " →" final de la tabla** — el componente ya
   renderiza la flecha como icono `<ArrowRight>`; almacenar el "→" en la cadena
   habría producido flecha doble. Única desviación del verbatim, solo tipográfica.
3. **`sec_b5_body` con `{email}`** — verbatim en el diccionario; Security.jsx
   hace `split("{email}")` para mantener el email como enlace mailto vivo (la
   interpolación de t() lo habría aplanado a texto). `CONTACT_EMAIL` sigue
   siendo la única fuente del address.
4. **H1 de /Security actualizado por la tabla**: el literal anterior era "Built
   so you are safe."; la tabla manda "Built so we can't / hurt you." — aplicado
   (es la copy calibrada del chunk, no una mejora propia).
5. **`overlay_title` EN sin "…"** — el literal EN actual no lleva elipsis; FR/ES
   de la tabla sí ("…"). Se respetó cada cadena tal cual.
6. **AnalyzingOverlay STEPS** → `STEP_KEYS` a nivel de módulo + `t()` en render,
   como pedía el chunk (reacciona al cambio de idioma).

## Prueba visual

- **EN verificada por captura**: /Security renderiza el nuevo H1 ("Built so we
  *can't* hurt you." con el kw en gradiente voltio), eyebrow, sub, chips y el
  bloque 01 — sin desbordes ni errores de runtime.
- **FR/ES**: mi herramienta de captura no puede accionar el selector de idioma
  (persiste en localStorage del navegador del usuario), así que la verificación
  visual de desbordes en FR (~20% más largo — bullets de Trust y H2 de Security
  en móvil) queda para tu pasada manual de 1 minuto: cambia a FR/ES en la navbar
  y recorre landing (sección Trust), /Security y un análisis anónimo (overlay).
  Por construcción no hay riesgo de crash: claves ausentes caen a EN por el
  fallback del diccionario.

## Verificación externa pendiente (zip)
- Paridad programática de los 3 diccionarios (536/536/536 esperado).
- Grep de literales huérfanos en los 7 archivos (esperado: cero visibles;
  quedan solo nombres propios y términos exentos).
- lint · vitest · build.

Nota de deuda: `i18n.jsx` supera las 2.100 líneas (límite de edición ~2.500).
Próximo chunk de i18n debería partir los diccionarios en módulos por idioma.