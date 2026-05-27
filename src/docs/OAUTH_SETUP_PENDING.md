# OAuth App User Connectors Setup (PENDIENTE)

## Estado: ⏳ PENDING - Esperando credenciales OAuth

Una vez tengas las credenciales OAuth configuradas en el dashboard de Base44, ejecutar:

### 1. Google Drive (CAMBRA)
```
set_app_user_connector(
  integration_type: "googledrive"
  name: "Google Drive (CAMBRA)"
  scopes: ["https://www.googleapis.com/auth/drive.readonly"]
  description: "Conecta tu Google Drive para que el Analizador lea facturas y documentos (solo lectura)."
)
```

### 2. Google Sheets (CAMBRA)
```
set_app_user_connector(
  integration_type: "googlesheets"
  name: "Google Sheets (CAMBRA)"
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  description: "Conecta tu Google Sheets para que el Analizador lea tus hojas de cálculo de costes (solo lectura)."
)
```

### 3. Gmail (CAMBRA)
```
set_app_user_connector(
  integration_type: "gmail"
  name: "Gmail (CAMBRA)"
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"]
  description: "Conecta tu Gmail para que el Analizador detecte facturas de proveedores automáticamente (solo lectura)."
)
```

### 4. Slack (CAMBRA)
```
set_app_user_connector(
  integration_type: "slack"
  name: "Slack (CAMBRA)"
  scopes: ["channels:read", "users:read"]
  description: "Conecta tu Slack para listar canales básicos (opcional, solo lectura)."
)
```

## Próximos pasos:

1. ✅ Registrar los 4 conectores en paralelo
2. Actualizar `lib/connectors.config.js` con los connector IDs retornados
3. Mejorar `components/connect/ConnectorTile.jsx` para manejar el ciclo completo de conexión/desconexión
4. Añadir backend functions para sincronizar datos desde cada integración

## Notas:
- Los conectores se registran como "per-user" (cada usuario conecta su propia cuenta)
- Los scopes son de solo lectura (read-only) por seguridad
- Google Drive, Sheets y Gmail usan OAuth de Google
- Slack usa su propio OAuth