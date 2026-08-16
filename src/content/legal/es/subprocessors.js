// DPA-1 (2026-08-16) — traducción del maestro inglés (en/subprocessors.js) con
// sentido jurídico idéntico. Anexo III del DPA (/Dpa §7.1).
// Coherente con src/content/legal/es/privacy.js §5. Ninguna fila afirma una
// entidad, región o instrumento de transferencia que no esté verificado.

export default {
  badge: "Legal · Anexo III",
  title: "Subencargados.",
  version: "1.0",
  lastUpdated: "Última actualización: 16 de agosto de 2026",
  back: "Volver",
  intro: [
    {
      title: "1. Qué es esta página",
      body: "Esta página es el Anexo III del Acuerdo de Encargo de Tratamiento de CAMBRA. Enumera los subencargados de los que CAMBRA se sirve para prestar el servicio, el país de la entidad contratante, qué hace cada uno y el mecanismo en el que se ampara la salida de datos personales del Espacio Económico Europeo. Conforme al apartado 7.2 del DPA, CAMBRA avisa con al menos 30 días de antelación antes de añadir o sustituir un subencargado; la fecha de arriba es la referencia de ese preaviso.",
    },
    {
      title: "2. Cómo leer la columna de estado",
      body: "CONFIRMADO significa que el proveedor está declarado públicamente en nuestra Política de Privacidad y que su uso es verificable en la plataforma. PENDIENTE DE REVISIÓN JURÍDICA significa que aún no hemos confirmado un punto concreto — normalmente la entidad contratante exacta, la región de alojamiento o el instrumento de transferencia. Publicamos esos huecos en lugar de rellenarlos con texto verosímil: una afirmación no verificada en un documento de protección de datos es peor que un hueco reconocido.",
    },
  ],
  columns: { name: "Proveedor", country: "País", service: "Servicio", transfer: "Mecanismo de transferencia", status: "Estado" },
  tables: [
    {
      heading: "3. Subencargados del servicio CAMBRA",
      note: "Proveedores que tratan datos personales por cuenta del cliente, es decir, subencargados en el sentido del artículo 28, apartados 2 y 4, del RGPD.",
      rows: [
        { name: "Base44 (Wix.com Ltd.)", country: "Israel (sede de Wix.com Ltd., operador de Base44) — región de alojamiento de los datos no publicada por el proveedor", service: "Alojamiento de la aplicación, base de datos, autenticación y envío de correo transaccional desde la plataforma", transfer: "El propio DPA de Base44 declara el EU-US Data Privacy Framework y Cláusulas Contractuales Tipo de la UE (Módulo 2/3) como mecanismo para transferencias desde EEE/Suiza/Reino Unido. El proveedor no publica región de alojamiento ni infraestructura cloud subyacente — pendiente de confirmación directa con Base44/Wix", status: "CONFIRMADO — instrumento de transferencia declarado por el proveedor; región de alojamiento pendiente de confirmación directa" },
        { name: "Anthropic PBC", country: "Estados Unidos", service: "Tratamiento con IA — extracción de extractos, inteligencia de producto y el Copilot integrado", transfer: "Acuerdo de tratamiento del proveedor (cláusulas contractuales tipo) — instrumento concreto pendiente de revisión", status: "CONFIRMADO" },
        { name: "OpenAI", country: "Estados Unidos", service: "Contraste de extracción con IA (segundo lector independiente de los extractos subidos)", transfer: "Acuerdo de tratamiento del proveedor (cláusulas contractuales tipo) — instrumento concreto pendiente de revisión", status: "CONFIRMADO" },
        { name: "Resend, Inc.", country: "Estados Unidos", service: "Entrega de correo y enrutado de correo entrante", transfer: "Acuerdo de tratamiento del proveedor (cláusulas contractuales tipo) — instrumento concreto pendiente de revisión", status: "CONFIRMADO" },
        { name: "Stripe Payments Europe Ltd.", country: "Irlanda", service: "Procesamiento de pagos para la facturación de la comisión de éxito de CAMBRA; acceso de solo lectura a la cuenta Stripe del propio cliente cuando éste lo autoriza", transfer: "Dentro del EEE para la entidad contratante; las transferencias ulteriores se rigen por el propio acuerdo de Stripe", status: "CONFIRMADO" },
      ],
    },
    {
      heading: "4. Otros proveedores — operaciones propias de CAMBRA",
      note: "Estos proveedores aparecen en el código de la plataforma pero NO son subencargados declarados del servicio al cliente: dan soporte a la prospección y la investigación de mercado propias de CAMBRA, donde CAMBRA actúa como responsable de sus propios datos de contacto profesional y no como encargado del cliente. Se enumeran por transparencia y su clasificación está pendiente de confirmación jurídica.",
      rows: [
        { name: "Microsoft (Graph / Outlook)", country: "Pendiente de confirmación", service: "Buzón profesional propio de CAMBRA — correspondencia comercial saliente y entrante", transfer: "Pendiente de revisión jurídica", status: "PENDIENTE DE REVISIÓN JURÍDICA" },
        { name: "Instantly", country: "Pendiente de confirmación", service: "Campañas comerciales salientes de CAMBRA hacia potenciales clientes", transfer: "Pendiente de revisión jurídica", status: "PENDIENTE DE REVISIÓN JURÍDICA" },
        { name: "Apollo", country: "Pendiente de confirmación", service: "Descubrimiento y enriquecimiento de contactos profesionales para la prospección propia de CAMBRA", transfer: "Pendiente de revisión jurídica", status: "PENDIENTE DE REVISIÓN JURÍDICA" },
        { name: "Perplexity", country: "Pendiente de confirmación", service: "Investigación pública de mercado y proveedores (páginas de tarifas de proveedores de pago, seguimiento de competencia)", transfer: "Pendiente de revisión jurídica", status: "PENDIENTE DE REVISIÓN JURÍDICA" },
      ],
    },
  ],
  outro: [
    {
      title: "5. Oponerse a un subencargado",
      body: "Conforme al apartado 7.2 del DPA, puedes oponerte, por motivos razonables relacionados con la protección de datos, a cualquier alta o sustitución anunciada aquí. Escribe a privacy@cambra.global dentro del plazo de preaviso. Si la oposición no puede resolverse, cualquiera de las partes podrá resolver la parte del servicio afectada.",
    },
    {
      title: "6. Contacto",
      body: "Para cualquier consulta sobre esta lista, los mecanismos de transferencia o los acuerdos subyacentes: privacy@cambra.global.",
    },
  ],
};
