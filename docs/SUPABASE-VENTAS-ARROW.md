# OCS Filler — Ventas Arrow centralizadas

## Estado
La tabla `public.ocs_filler_sales_days` fue creada en Supabase `compas-one` (`qwxydjotwhniahaovrff`) con RLS activado y sin permisos de lectura/escritura para `anon` ni `authenticated`.

Contiene el histórico del 1 al 22 de octubre de 2026: **16 fechas, $88,588 MXN y 1,178 tickets**. Los registros importados del período histórico que no incluyen detalle de productos se marcan `summary` y no permiten atribuir productos a fechas.

## Configuración pendiente del Worker
Worker: `ocs-filler`. Agregar un secreto de producción en Cloudflare → Workers & Pages → ocs-filler → Settings → Variables and Secrets:

- Nombre: `SUPABASE_SERVICE_ROLE_KEY`
- Tipo: **Secret**
- Valor: clave `service_role` del proyecto Supabase `compas-one` (`qwxydjotwhniahaovrff`), obtenida de Supabase → Project Settings → API Keys. Nunca compartirla en conversaciones o commits.

No es necesario agregar `SUPABASE_URL`: el Worker utiliza `https://qwxydjotwhniahaovrff.supabase.co` por defecto. Si se define, debe apuntar al mismo proyecto.

La clave vive únicamente en el Worker, nunca en los navegadores. Las rutas `/api/sales/*` requieren el token obtenido con el PIN de Almacén.

## Implementación
- `GET /api/sales/status`: indica si el backend está configurado (requiere sesión).
- `GET /api/sales/days?month=2026-10`: consulta fechas registradas.
- `POST /api/sales/import`: reemplaza por fecha el último corte Arrow completo, conservando tickets y evitando duplicación.
- `POST /api/sales/tickets`: registra tickets para una fecha con ventas cargadas.
- `ventas.html`: importa Excel de Arrow, publica ventas y recarga los datos compartidos.

## Operación diaria
1. Abrir Almacén e iniciar sesión con nombre + PIN.
2. Abrir Ventas → Importar movimientos Arrow.
3. Seleccionar Excel del reporte completo del día o del intervalo que se desea actualizar.
4. Comprobar el mensaje «Supabase conectado» y verificar fechas/total.
5. Abrir Ventas en otro equipo autorizado y pulsar «Actualizar desde Supabase».

**No subir el mismo reporte parcial como archivo incremental:** cada importación reemplaza por completo los datos de las fechas contenidas. Es necesario exportar el corte acumulado del día desde Arrow.

## Limitaciones conocidas
- El registro de ventas es compartido únicamente después de agregar el secreto y desplegar la versión actualizada del Worker.
- El histórico precargado del 1 al 22 contiene totales por día y ranking agregado por producto, no detalle producto-fecha.
- Para reportes de consumo por producto por día hay que importar el Excel detallado de ese período.
- Las recetas todavía se guardan por navegador; requieren migración independiente a Supabase.
- El PIN compartido actual no proporciona permisos granulares de operadores. Implementar roles y bitácora por usuario antes de escalar la operación.
