# OCS Filler · Almacén

Aplicación interna mobile-first para el control de almacén de **OCS · Operadora de Comedores Saludables**, cafetería **Filler**.

## Objetivo
Que el almacenista opere desde el teléfono sin editar Google Sheets directamente:

- Buscar por nombre o código.
- Registrar entrada.
- Registrar salida.
- Registrar merma.
- Hacer conteo físico con ajuste automático.
- Consultar existencia, mínimos, máximos y productos por pedir.
- Revisar movimientos recientes.

## Arquitectura
- Frontend: HTML/CSS/JS mobile-first.
- Backend: Cloudflare Worker.
- Fuente operativa inicial: Google Sheets `Control de Almacén`.
- Despliegue: Cloudflare Workers con Static Assets.

## Variables y secretos de Cloudflare
Configura en el Worker:

- `WAREHOUSE_PIN` — PIN de acceso del almacenista.
- `SESSION_SECRET` — secreto largo para firmar sesiones.
- `GOOGLE_CLIENT_EMAIL` — correo de una cuenta de servicio con acceso Editor al Sheet.
- `GOOGLE_PRIVATE_KEY` — llave privada PEM de esa cuenta de servicio.
- `GOOGLE_SHEET_ID` — ID del archivo Control de Almacén.

El Sheet debe compartirse con `GOOGLE_CLIENT_EMAIL` como Editor.

## Desarrollo

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```
