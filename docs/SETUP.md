# Puesta en marcha · OCS Almacén

## 1. Conectar Google Sheets

La app ya apunta al archivo actual **Control de Almacén**. Para que Cloudflare pueda leer y escribir sin exponer credenciales en el teléfono:

1. En Google Cloud crea una **cuenta de servicio**.
2. Activa **Google Sheets API** en ese proyecto.
3. Crea una llave JSON para la cuenta de servicio.
4. Comparte el archivo `Control de Almacén` con el correo de la cuenta de servicio con permiso **Editor**.
5. Conserva del JSON:
   - `client_email`
   - `private_key`

## 2. Importar el repositorio en Cloudflare

En Cloudflare:

1. Workers & Pages → **Create**.
2. Importa el repositorio **Rujumagil/OCS-Filler**.
3. Usa:
   - Build command: `npm install`
   - Deploy command: `npm run deploy`
4. El archivo `wrangler.jsonc` ya define el Worker y los assets.

## 3. Secretos del Worker

Configura en **Settings → Variables and Secrets**:

- `WAREHOUSE_PIN`: PIN que usarán los almacenistas.
- `SESSION_SECRET`: texto largo aleatorio, mínimo 32 caracteres.
- `GOOGLE_CLIENT_EMAIL`: correo de la cuenta de servicio.
- `GOOGLE_PRIVATE_KEY`: llave PEM completa del JSON.
- `GOOGLE_SHEET_ID`: opcional. La app ya tiene como valor por defecto el Sheet actual.

Todos salvo `GOOGLE_SHEET_ID` deben guardarse como secretos.

## 4. Flujo operativo

El almacenista abre la app desde su teléfono:

- escribe su nombre;
- escribe el PIN;
- busca por producto o código;
- registra Entrada, Salida, Merma o Conteo físico.

La app usa las pestañas existentes:

- `Inventario` para existencias;
- `Surtido Almacén` como bitácora operativa de entradas/salidas;
- `Entradas` y `Salidas` se alimentan automáticamente desde esa bitácora;
- `Mermas` para pérdidas;
- `Conteos` para auditorías físicas.

## 5. Prueba recomendada

Antes de usarla en producción:

1. Buscar `01010051`.
2. Confirmar que aparece **ACEITE DE CANOLA PATRONA BOT 1 L**.
3. Hacer una entrada pequeña de prueba.
4. Confirmar actualización en `Entradas` e `Inventario`.
5. Revertir con una salida de la misma cantidad.
6. Probar un conteo físico sin diferencia.
