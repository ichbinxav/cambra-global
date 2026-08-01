# Decision Log — EMAIL-1 / LEGAL-2 (2026-07-31)

## Alcance
1. **LEGAL-2** — eliminar la calificación de "borrador pendiente de revisión legal" de los Términos del Colectivo en todas las superficies (clickwrap UI + email de confirmación + aviso interno al founder), por instrucción del founder tras su aprobación del texto.
2. **EMAIL-1** — localizar todos los emails transaccionales a EN/FR/ES y enrutar el idioma según la elección de UI del comercio, no según cabeceras HTTP.

## Decisiones
- **Campo `locale` persistido en el registro**, no inferido en el envío: `Brand`, `Lead`, `CollectiveMember`, `PaymentsAnalysisSession` llevan `locale` (`en|fr|es`, default `en`). Fuente: idioma ACTIVO de la UI en el momento del submit (misma clave `cambra_lang`). Nunca `Accept-Language` — una elección manual en el switcher gana (doctrina UX-1 T0).
- **`normalizeLocale` en `base44/shared/emailLocale.ts`**: cualquier valor ausente o no soportado (p. ej. `de`) resuelve a `en`. Un envío nunca falla por falta de idioma.
- **Plantillas centralizadas en `base44/shared/emails/`** (`layout`, `welcome`, `collectiveJoin`, `callRequest`, `monthlySummary`), trilingües con asuntos incluidos. Tuteo en ES, vouvoiement en FR.
- **`terms_version: "draft-v0"` se conserva verbatim** en `joinCollective` y en el esquema de `CollectiveMember`: es un identificador histórico opaco del texto aceptado, no una afirmación sobre su estado. Cambiarlo rompería la comparabilidad de los registros de aceptación existentes. El esquema documenta esta semántica.
- **Clave `coll_terms_draft` eliminada** de los tres diccionarios (era huérfana tras LEGAL-2 — cero usos fuera de locales). Paridad post-cambio: **EN 612 = FR 612 = ES 612**.
- El email de bienvenida (`onBrandCreated`) se corrigió de paso: seguía con copy pre-pivote (Infra Score, Member Network, Shipping/SaaS) y enlazaba una página inexistente.
- `locale` es metadato de entrega: **nunca** entra en `input_snapshot` (no puede desviar un cálculo) y **nunca** lo devuelve el allowlist de `getPaymentsGapTeaser`.

## Evidencia QA (smoke tests reales, 2026-07-31)
Tres altas al Colectivo vía `joinCollective` + una solicitud de llamada vía `submitCallRequest`, con email del builder:

| Flujo | Locale enviado | Persistido | Resultado |
|---|---|---|---|
| joinCollective | `es` | `es` | ✓ email ES enviado |
| joinCollective | `fr` | `fr` | ✓ email FR enviado |
| joinCollective | `de` (no soportado) | `en` | ✓ fallback a EN correcto |
| submitCallRequest | `fr` | `fr` | ✓ confirmación FR enviada |

Grep final: cero apariciones de "draft / borrador / brouillon / pendiente de revisión legal" en plantillas de email, funciones de envío y diccionarios (única excepción sancionada: el identificador `draft-v0` documentado arriba).

Las 4 filas de prueba (`CollectiveMember` ×3, `Lead` ×1) se borraron tras la verificación.