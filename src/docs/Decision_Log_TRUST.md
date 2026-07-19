# Decision Log — CHUNK TRUST (Trust & Security landing section + /Security page)

Date: 2026-07-19
Scope: 100% frontend público. Cero cambios en motor, tests, funciones backend o
lógica de negocio.

## Qué se construyó

### Tarea 1 — Sección TRUST & SECURITY en la landing
- Nuevo componente `src/components/landing/TrustSecuritySection.jsx`.
- Renderizado en `src/pages/Landing.jsx` entre `Founding150Section` y `FounderLetter`
  (el cierre real de la landing es `StopLeavingMarginCTA`, por lo que la sección
  queda entre Founding 150 y el cierre, como pide el mapa v1.1).
- Bloque `.panel-dark` (fondo `#0E0E1A` + glow Aurora vía la clase existente).
- Eyebrow con clase `.eyebrow` ("TRUST & SECURITY").
- H2 Space Grotesk: "Your data is yours. **Always.**" — "Always" con `var(--menta)`.
- 4 bullets: título en `.mono-num` (JetBrains Mono) + subtexto Inter `var(--gris-1)`.
  Iconos lucide en `var(--menta)`.
- Render del Vault: se usó `BRAND_ASSETS.vaultGlow` — el asset YA está subido
  (mismo URL que `cubeFrosted`, el vault-glow2x procesado en el sprint de DA).
  No se necesitó fallback.
- Link de cierre "How we handle your data →" hacia `/Security` en `var(--menta)`.

### Tarea 2 — Página /Security
- Nueva página `src/pages/Security.jsx` usando el shell público estándar
  (`PublicPageShell` + `PublicPageHero`) — NO se creó layout nuevo.
- Componentes enfocados nuevos:
  - `src/components/security/SecurityBlock.jsx` — bloque reutilizable con dos
    variantes de superficie: "paper" (tarjeta blanca sobre paper) e "ink"
    (`.panel-dark`). Los bloques alternan paper/ink siguiendo el patrón visual.
  - `src/components/security/CanCannotTable.jsx` — comparativa dos columnas
    "What we can see" (checks en `var(--menta-dark)`) / "What we can never do"
    (X en `var(--coral)`, uso semántico negativo del coral).
- Hero: eyebrow SECURITY, H1 "Built so we **can't** hurt you." ("can't" en
  `var(--menta)`), sub exacto.
- 6 bloques + cierre con copy EXACTA (sin parafrasear).
- Email de contacto para el DPA (Bloque 5): `support@cambra.global` (el mismo
  que ya figura en el footer legal).
- CTAs de cierre: primario Voltio "See my payment gap → /Analyzer" (usando
  `var(--g-voltio)`), secundario "Contact us → /Contact".

### Tarea 3 — Integración
- `src/App.jsx`: ruta pública `/Security` (+ redirect lowercase `/security`).
- Footer: enlace "Security" añadido en `PublicFooter` (páginas públicas) y en el
  `LandingFooter` local de `Landing.jsx`, junto a Privacy/Terms.
- `RobotsMeta`: `/security` añadido al allowlist público → index,follow.
- `sitemap`: `/Security` añadido a `PUBLIC_ROUTES` (monthly, 0.5).

## Reglas respetadas
- Copy en inglés EXACTA, sin parafrasear.
- PROHIBIDO: cero menciones a SOC 2, ISO 27001, PCI-DSS ni cualquier certificación.
- Sistema de diseño: solo tokens CSS existentes (`--voltio`, `--menta`,
  `--menta-dark`, `--coral`, `--gris-1`, `--gris-2`, `--linea`, `--paper`,
  `--g-voltio`), clases `.panel-dark` / `.eyebrow` / `.mono-num`, y jerarquía
  Space Grotesk / Inter / JetBrains Mono.
- Los únicos hex literales usados son los rgba de superficie glass ya presentes
  en el sistema (`rgba(255,255,255,0.05)` etc. — idénticos a los usados en
  `.cambra-card` / `.section-ink` / `PublicPageHero`) y `#ffffff`/`#0E0E1A`
  (fondos del sistema). NO se introdujeron colores de marca hardcodeados fuera
  de tokens.

## Fuera de alcance (no tocado)
- Flow OAuth real, Privacy/Terms, certificaciones, cualquier otra sección de la
  landing.