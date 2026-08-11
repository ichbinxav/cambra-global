// LEGAL-1 — Traducción española del texto maestro inglés (en/cookies.js).
// Sentido idéntico, tuteo.

export default {
  badge: "Legal · Política de cookies",
  title: "Política de cookies.",
  lastUpdated: "Última actualización: 24 de julio de 2026",
  back: "Volver",
  columns: { name: "Nombre", purpose: "Finalidad", duration: "Duración", category: "Categoría" },
  intro: [
    {
      title: "1. Qué cubre esta política",
      body: "Las cookies son pequeños archivos de texto que tu navegador guarda en tu dispositivo. La plataforma también usa almacenamiento del navegador — localStorage (persiste tras cerrar el navegador) y sessionStorage (se borra al cerrar la pestaña). El almacenamiento del navegador no es técnicamente una cookie, pero cumple finalidades comparables: esta política lista ambos — exactamente tal y como los usa la aplicación, verificados sobre nuestro código fuente.",
    },
    {
      title: "2. Cómo los usa CAMBRA",
      body: "Estrictamente para que la plataforma funcione: mantenerte con la sesión iniciada, vincular tu análisis anónimo a tu nueva cuenta y recordar preferencias como el idioma. No ponemos cookies publicitarias, ni rastreadores de terceros, ni perfilado de comportamiento, ni identificadores entre sitios.",
    },
  ],
  tables: [
    {
      heading: "3. Cookies",
      note: "Cookies propias (first-party) establecidas en el dominio cambra.global.",
      rows: [
        { name: "cambra_anon_session", purpose: "Transporta tu sesión de análisis anónima durante el registro para que tu informe quede vinculado a tu nueva cuenta", duration: "30 minutos", category: "Estrictamente necesaria" },
      ],
    },
    {
      heading: "4. localStorage",
      note: "Persiste hasta que borres los datos de sitio de tu navegador.",
      rows: [
        { name: "base44_access_token", purpose: "Token de autenticación emitido por nuestro proveedor de plataforma (Base44) que mantiene tu sesión iniciada. El SDK de la plataforma escribe en paralelo un alias heredado llamado «token»", duration: "Hasta cerrar sesión o borrar los datos del navegador", category: "Estrictamente necesario" },
        { name: "cambra_pending_anon_session", purpose: "Misma finalidad que la cookie cambra_anon_session, por el mismo navegador; se elimina automáticamente una vez vinculado tu informe", duration: "Se elimina automáticamente tras su uso", category: "Estrictamente necesario" },
        { name: "cambra_cookie_consent", purpose: "Registra tu elección de consentimiento de cookies y su marca de tiempo", duration: "Hasta borrar los datos del navegador", category: "Estrictamente necesario" },
        { name: "cambra_lang", purpose: "Recuerda tu preferencia de idioma (EN/FR/ES). Una clave heredada de una versión anterior (node_lang) puede seguir leyéndose — nunca se escribe — para migrar esta preferencia", duration: "Hasta borrar los datos del navegador", category: "Funcional" },
        { name: "cambra_copilot_open", purpose: "Recuerda si el panel del asistente está abierto o cerrado", duration: "Hasta borrar los datos del navegador", category: "Funcional" },
      ],
    },
    {
      heading: "5. sessionStorage",
      note: "Se borra automáticamente al cerrar la pestaña del navegador.",
      rows: [
        { name: "cambra_redirect_after_login", purpose: "Recuerda la página a la que intentabas llegar para devolverte a ella tras iniciar sesión", duration: "Hasta cerrar la pestaña", category: "Estrictamente necesario" },
        { name: "cambra_ref_code", purpose: "Recuerda el código de referido del comercio cuyo enlace de invitación abriste, para que el referido pueda registrarse cuando ejecutas tu análisis unas pantallas después. Código aleatorio opaco, no derivado de datos personales", duration: "Hasta que se cierra la pestaña", category: "Estrictamente necesario" },
        { name: "cambra_chat_conv", purpose: "Recuerda la conversación activa en el chat de administración (solo cuentas de administrador)", duration: "Hasta cerrar la pestaña", category: "Funcional" },
      ],
    },
  ],
  after: [
    {
      title: "6. Tus opciones de consentimiento",
      body: "En tu primera visita, un banner de consentimiento ofrece «Aceptar todo» y «Gestionar preferencias», donde analítica y marketing pueden activarse por separado (el almacenamiento estrictamente necesario permanece activo). Tu elección se registra en cambra_cookie_consent con una marca de tiempo. CAMBRA usa dos mediciones propias en la misma plataforma de alojamiento: un contador de páginas vistas envía el nombre de la página al navegar y, solo cuando activas analítica, una lista cerrada de eventos del embudo de producto, como análisis iniciado/completado o Recover aceptado. Estos eventos rechazan correos, nombres, tokens, URL, identificadores de sesión/usuario/entidad, nombres de archivo y texto libre. Ninguna medición instala cookies analíticas o publicitarias y no interviene ninguna red publicitaria externa. Desactivar analítica impide los eventos de producto sujetos a consentimiento.",
    },
    {
      title: "7. Gestionar cookies y almacenamiento",
      body: "Los elementos estrictamente necesarios no pueden desactivarse — la plataforma no funciona sin ellos. Los funcionales pueden eliminarse en cualquier momento desde los ajustes de tu navegador (borrar cookies y datos de sitios); el único efecto es perder la preferencia correspondiente.",
    },
    {
      title: "8. Contacto",
      body: "Preguntas sobre cómo usa CAMBRA las cookies y el almacenamiento del navegador: privacy@cambra.global. Editor: CAMBRA GLOBAL SASU, SIREN 105 452 916, 47 rue Vivienne, 75002 París, Francia.",
    },
  ],
};
