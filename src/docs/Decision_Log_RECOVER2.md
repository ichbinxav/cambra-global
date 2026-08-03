# Decision Log — RECOVER-2: cobro del success fee (método de pago)

**Fecha:** 2026-08-03 · **Precedente:** RECOVER-1 (aceptación del mandato electrónico).

RECOVER-1 dejó al comercio **autorizando** a CAMBRA a actuar. RECOVER-2 cierra la
otra mitad: la capacidad **operativa** de cobrar el success fee cuando el ahorro
esté verificado. Son cosas distintas y el esquema lo refleja: `DealActivation.status`
= autorización legal, `DealActivation.payment_method_status` = medio de cobro.
Una activación `authorized` con `payment_method_status='none'` es un estado real y
esperado, no una contradicción: es exactamente el hueco que hay que cerrar antes
de la primera factura.

---

## 1. Las dos relaciones con Stripe nunca se cruzan

| | A. Stripe del COMERCIO | B. Stripe de CAMBRA |
|---|---|---|
| Para qué | leer sus comisiones y verificar el baseline | Customers, SetupIntents, métodos de pago, facturas |
| Cómo | OAuth de solo lectura (`stripeOAuthConnect`, `StripeConnection`, `ConsentRecord`) | claves propias (`STRIPE_SECRET_KEY` / `STRIPE_TEST_SECRET_KEY`) |
| Puede cobrar | **nunca** | sí (facturas futuras) |

Ningún token, `acct_`, `cus_`, secret de webhook o clave cruza entre A y B. Todo lo
que vive en `base44/shared/stripeBilling.ts` pertenece a B por construcción, y esa
separación es la razón de que exista el módulo: ninguna función lee `Deno.env`
directamente, así que **un modo nunca se asume por descuido**.

## 2. El Customer vive en `Brand`, no en `Organization`

`Organization` / `OrganizationMember` son la tenencia de la **plataforma de API**
(cuotas, rate limits) y nunca están ligados a un `Brand`. El `Brand` es el único
registro que mapea 1:1 con el negocio al que facturamos, así que
`Brand.stripe_customer_id` es el sitio correcto. Se reutiliza en cada alta para que
un negocio no acumule Customers duplicados.

## 3. Sandbox y producción son cuentas SEPARADAS

Premisa inicial errónea, corregida el mismo día contra la cuenta real: el `acct_`
**no** es el mismo en test y en live cuando se usa un Stripe Sandbox. Un sandbox es
una cuenta aparte con su propio espacio de objetos. Consecuencias:

- el pin de cuenta esperada es **por modo**: `live acct_1TqFifJw0ka9dDf4`,
  `test acct_1TqFip2Vr0WW305e` (verificados vía `stripeBillingKeyCheck`);
- `Brand.stripe_billing_mode` y `DealActivation.stripe_billing_mode` guardan el modo
  junto a los ids, para **detectar** un cambio de entorno y repetir el alta, en vez
  de fallar con "no such payment method" en la primera factura real;
- el modo se resuelve con `STRIPE_BILLING_MODE`, con `test` por defecto: el default
  equivocado aquí no es un bug, es un cargo real a un comercio real.

Ese pin ya cazó una clave `sk_test_` de **otra** cuenta homónima
(`acct_1TqWzFJtkNunlMvz`) configurada por error. Por eso los ids están escritos en
el código y no se confía en lo que haya en el entorno.

## 4. El orden importa: mandato antes que tarjeta

`startPaymentMethodSetup` exige un `Mandate` en estado `active` y devuelve **409** si
no lo hay. Pedir un medio de pago para algo que el comercio no ha autorizado sería
recolectar medios de cobro sin título, así que el orden no es una preferencia de UX.

## 5. Un SetupIntent no es un cobro

Guarda un método de pago para uso **futuro** (`usage: off_session`). No mueve dinero.
El success fee se factura después, contra ahorro verificado, según Terms §7.
El intent existente se **reutiliza** mientras siga siendo usable, para no sembrar la
cuenta de intents por cada recarga de página.

## 6. Quién decide que hay método de pago: Stripe, no el navegador

`payment_method_status → 'ready'` se escribe **solo** leyendo el SetupIntent en
Stripe desde el servidor (`refreshPaymentMethodStatus`), nunca desde un payload del
cliente. La función es idempotente por diseño: proyecta el estado de Stripe, no
mantiene una máquina de estados propia, así que puede invocarse al cargar la página,
tras un redirect o dos veces seguidas sin daño.

`stripeBillingWebhook` es la **red de seguridad** para lo que ocurre cuando el
comercio ya cerró el navegador (3D Secure completado en otro dispositivo, fallo
posterior): mismo proyección, disparada por evento. Verifica la firma HMAC de Stripe
con un secret **propio por modo** (`STRIPE_BILLING_WEBHOOK_SECRET_TEST/LIVE`), nunca
el `STRIPE_WEBHOOK_SECRET` preexistente, que pertenece a la relación A. Un secret
compartido entre modos permitiría **replicar un evento de sandbox como si fuera de
producción** — es criterio de parada, y `stripeBillingKeyCheck` lo comprueba.

## 7. PCI: los datos de tarjeta no pasan por CAMBRA

Stripe.js se carga **dinámicamente desde el CDN de Stripe** (`src/lib/stripeJs.js`),
nunca empaquetado, y la tarjeta se teclea dentro del iframe del Payment Element. La
clave publicable la sirve el backend según el modo resuelto: la configuración del
entorno no se decide en el cliente.

---

## Estado a 2026-08-03

| Pieza | Estado |
|---|---|
| Claves test/live verificadas contra su cuenta | ✅ ambas `ok` |
| Endpoint de webhook registrado en Stripe (sandbox) | ✅ |
| `STRIPE_BILLING_WEBHOOK_SECRET_TEST` | ✅ configurado |
| `STRIPE_BILLING_WEBHOOK_SECRET_LIVE` | ⏳ pendiente hasta abrir facturación real |
| Prueba de extremo a extremo del webhook | ⏳ con el primer alta real en sandbox (tarjeta 4242…) |

**Deuda declarada:** el flujo funciona sin el webhook, porque la ruta principal
verifica el estado leyendo Stripe de forma síncrona. El webhook solo cubre las
finalizaciones asíncronas; su falta no bloquea el alta, pero sí dejaría sin
actualizar un caso de 3D Secure completado fuera de la sesión.