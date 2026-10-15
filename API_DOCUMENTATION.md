# Documentación de la API de OpenWMS 3PL

Esta guía describe cómo interactuar con la **API de OpenWMS 3PL**, construida sobre **PostgreSQL 17 en Supabase**. La API cuenta con dos modalidades de consumo:

1. **REST Data API (PostgREST):** Endpoints HTTP directos para consultas, filtros avanzados, inserciones y actualizaciones en tiempo real sobre las 24 tablas.
2. **Procedimientos RPC Atómicos (ACID):** Endpoints de lógica de negocio transaccional para garantizar consistencia estricta en movimientos de stock, pallets y picking.
3. **Capa SDK en TypeScript (`src/api/`):** Servicios fuertemente tipados listos para importar en tu frontend (React, Vite, Next.js) o backend/mobile.

---

## 1. Configuración de Acceso y Credenciales

* **URL Base de la API:** `https://zgrsagjhrwvutrxihhng.supabase.co`
* **Data API (REST Endpoint):** `https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/`
* **RPC Endpoint:** `https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/`
* **Clave Anónima / Publicable:** Disponible en tu archivo [.env](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/.env)

### Encabezados Requeridos para peticiones HTTP directas (cURL / Postman / Fetch)
```http
apikey: <TU_SUPABASE_ANON_KEY>
Authorization: Bearer <TOKEN_DE_SESION_DEL_USUARIO_O_ANON_KEY>
Content-Type: application/json
```

### Ejemplo de Consulta RPC por Teléfono vía HTTP (cURL / Postman)

**Método POST:**
```bash
curl -X POST "https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/wms_obtener_cliente_por_telefono" \
  -H "apikey: <TU_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <TU_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"p_telefono": "+54 11 4789-1000"}'
```

**Método GET (Función STABLE):**
```bash
curl -X GET "https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/wms_obtener_cliente_por_telefono?p_telefono=%2B54%2011%204789-1000" \
  -H "apikey: <TU_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <TU_SUPABASE_ANON_KEY>"
```

### Ejemplo de Consulta RPC de Stock Consolidado por Cliente (cURL / Postman)

**Método POST:**
```bash
curl -X POST "https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/obtener_stock_consolidado_por_cliente" \
  -H "apikey: <TU_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <TU_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"p_cliente_id": "c0000000-0000-0000-0000-000000000001"}'
```

**Método GET (soporta UUID, código comercial o teléfono del cliente):**
```bash
curl -X GET "https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/obtener_stock_consolidado_por_cliente?p_cliente_id=1157617815" \
  -H "apikey: <TU_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <TU_SUPABASE_ANON_KEY>"
```

### Ejemplo de Actualización de FechaUltimoAccesoBot en Usuarios (cURL / Postman / Bot)

El registro de accesos del bot se almacena en la tabla **`usuarios`** en la columna **`fecha_ultimo_acceso_bot`** (y alias `FechaUltimoAccesoBot`). La RPC busca al usuario de forma flexible por UUID, teléfono exacto o normalizado, email o nombre de usuario:

**Método POST (identifica por Teléfono, UUID, Email o Nombre de Usuario y asigna now() por defecto):**
```bash
curl -X POST "https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/actualizar_ultimo_acceso_bot" \
  -H "apikey: <TU_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <TU_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"p_identificador": "+54 9 11 1234-5678"}'
```

### Ejemplo de Consulta RPC de Usuario por Teléfono (cURL / Postman)

**Método POST:**
```bash
curl -X POST "https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/wms_obtener_usuario_por_telefono" \
  -H "apikey: <TU_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <TU_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"p_telefono": "+54 9 11 1234-5678"}'
```

### Ejemplo de Consulta RPC de Clientes por ID / clientes_ids (cURL / Postman / Bot)

La RPC **`wms_obtener_clientes_por_id`** (y su alias **`obtener_clientes_por_id`**) está diseñada específicamente para resolver los clientes autorizados a partir del resultado de `obtener_usuario_por_telefono`.

**Opción A: Pasando el objeto retornado por `obtener_usuario_por_telefono` directamente:**
```bash
curl -X POST "https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/obtener_clientes_por_id" \
  -H "apikey: <TU_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <TU_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "p_clientes_ids": {
      "id": "e5c141d4-831e-450a-9d95-88db09c869ef",
      "nombre_usuario": "Juan Perez",
      "clientes_ids": ["001", "002"]
    }
  }'
```

**Opción B: Pasando el array `clientes_ids` directo:**
```bash
curl -X POST "https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/obtener_clientes_por_id" \
  -H "apikey: <TU_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <TU_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"p_clientes_ids": ["001", "002"]}'
```

**Opción C: Acceso Global con comodín `"000"` (devuelve todos los clientes depositantes):**
```bash
curl -X POST "https://zgrsagjhrwvutrxihhng.supabase.co/rest/v1/rpc/obtener_clientes_por_id" \
  -H "apikey: <TU_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <TU_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"p_clientes_ids": ["000"]}'
```

---

## 2. Servicios del SDK TypeScript (`src/api/`)

En la carpeta [src/api/](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api) tienes módulos especializados:

```typescript
import { 
  clientesApi, 
  obtenerClientesPorId,
  usuariosApi,
  articulosApi, 
  almacenApi, 
  recepcionesApi, 
  inventarioApi, 
  pedidosApi, 
  despachosApi 
} from './src/api';
```

### A. Clientes y Destinatarios (`clientesApi`)
* `listarClientes(soloActivos?)`: Devuelve los clientes depositantes 3PL.
* `obtenerClientePorId(id)`: Devuelve el cliente por su ID UUID.
* `obtenerClientesPorId(input, soloActivos?)`: **Devuelve la lista de clientes depositantes** a partir del retorno de `obtenerUsuarioPorTelefono` o de su array `clientes_ids`. Resuelve códigos comerciales (`'001'`), UUIDs o `'000'` (todos los clientes).
* `obtenerClientePorTelefono(telefono, soloActivos?)`: Devuelve el objeto cliente en formato JSON dado su número de teléfono.
* `obtenerUsuariosRelacionados(codigoCliente)`: **Devuelve los usuarios vinculados al cliente**, incluyendo usuarios asignados explícitamente a su código o usuarios con permiso global `'000'` (Todos).
* `actualizarUltimoAccesoBot(identificador, fecha?)`: Delega la actualización a `usuariosApi.actualizarUltimoAccesoBot`.
* `crearCliente({ codigo, razon_social, unidad_negocio, ... })`: Registra un nuevo cliente depositante.
* `listarDestinatariosPorCliente(clienteId)`: Devuelve las sucursales o destinatarios autorizados para el cliente.

### B. Catálogo y Empaque (`articulosApi`)
* `listarPorCliente(clienteId)`: Lista los artículos pertenecientes al cliente con su categoría y subcategoría.
* `buscarArticulo(clienteId, termino)`: Búsqueda flexible por SKU, Código de barras o Nombre (aprovecha la colación `es_latam_ci`).
* `crearArticulo({ cliente_id, sku, nombre, unidades_por_bulto, bultos_por_pallet, rotacion_abc, valor_declarado, volumen_unitario_m3, ... })`

### C. Recepciones e Inbound (`recepcionesApi`)
* `crearOrdenRecepcion(orden, detalles)`: Registra la orden con contenedor/OC, transporte, patente y renglones con lote declarado.
* `confirmarPutaway({ tareaId, cantidadRecibida, codigoLpn, ubicacionDestinoId })`: **Ejecuta la transacción atómica en base de datos**:
  * Coteja lo recibido vs esperado.
  * Si se pasa `codigoLpn`, genera o consolida el **Pallet LPN**.
  * Calcula el cubicaje exacto **M3** (`cantidad * volumen_unitario_m3`).
  * Incrementa el stock en `inventario` en la ubicación final.
  * Registra el asiento en el Kardex (`movimientos_inventario`).

### D. Inventario y Cubicaje M3 (`inventarioApi`)
* `consultarStock({ clienteId, articuloId, ubicacionId, ... })`: Consulta existencias filtradas con datos del lote, pallet LPN y M3 ocupados.
* `obtenerM3OcupadosPorCliente(clienteId)`: **Cálculo directo del total de M3 ocupados por el cliente para la facturación 3PL del espacio**.
* `obtenerStockConsolidadoPorCliente(clienteId)`: **Stock consolidado por artículo en JSON** (`disponible`, `reservado`, `total`/`stockFisico`, `stockFuturo`, `volumenM3Total`). Invoca la función RPC de Supabase `wms_obtener_stock_consolidado_por_cliente` / `obtener_stock_consolidado_por_cliente` (admite UUID, código o teléfono del cliente).
* `obtenerPalletPorCodigo(codigoLpn)`: Consulta todo el contenido de un pallet específico (bultos, artículos, M3 y ubicación actual).
* `consultarKardex(clienteId, articuloId)`: Trazabilidad inmutable de movimientos físicos.

### E. Pedidos y Preparación Outbound (`pedidosApi`)
* `crearPedido(pedido, detalles)`: Registra el pedido con cliente, destinatario, prioridad y renglones solicitados.
* `buscarPedidosPorCliente(codCliente)`: **Devuelve los pedidos en ejecución de un cliente en JSON** ordenados ascendentemente por fecha de compromiso (`{ NombrePedidoCliente, DestinatarioNombre, Estado, FechaCompromiso }`).
  * Filtra pedidos en ejecución antes de `despachado` o `cancelado`.
  * Si el pedido ingresó en una Orden de Salida activa, progresa dinámicamente con los estados operativos (`agrupado_salida` -> `remitida` -> `cargando` -> `en_transito` -> `entregado`) antes de que la salida se cierre (`cerrada`) y el pedido quede despachado definitivo (FIN).
  * Invoca prioritariamente la RPC de Supabase `wms_buscar_pedidos_por_cliente` con fallback de agregación local resiliente. Admite código comercial (`'001'`), UUID o `'000'` (todos los clientes).
* `asignarPickingFEFO(pedidoId)`: **Ejecuta la alocación inteligente FEFO/FIFO**:
  * Prioriza fechas de vencimiento más próximas (FEFO) para artículos perecederos.
  * Prioriza antigüedad de ingreso (FIFO) y pallets completos antes que fraccionados.
  * Reserva existencias atómicamente y crea las `tareas_picking` dirigidas por ubicación.
* `confirmarPicking({ tareaPickingId, cantidadRecolectada, novedad? })`: **Ejecuta la recolección física ACID**:
  * Descuenta el stock reservado y los $M^3$ de la ubicación y pallet de origen.
  * Si hubo faltante físico, libera el remanente reservado a disponible y registra la novedad de discrepancia.
  * Registra el asiento inmutable de egreso en el Kardex (`movimientos_inventario`).
* `consolidarPalletDespacho({ pedidoId, palletSalidaLpn, totalBultos, pesoEstimadoKg, volumenEstimadoM3 })`: Mesa de control y consolidación sobre el pallet de despacho (`paletizado_despacho`).
* `emitirRemitoRx({ pedidoId, numeroRemitoRx, cae? })`: Emite el Remito Rx fiscal calculando automáticamente bultos, pallets, kilos, $M^3$ y valor declarado total.
* `obtenerRemitoPorPedido(pedidoId)`: Consulta extendida con datos fiscales y renglones para la plantilla de impresión.

### F. Salidas, Despachos y Ruteo (`despachosApi`)
* `crearOrdenSalida(almacenId, numeroOrden, pedidosIds)`: Agrupa múltiples pedidos preparados en una orden de salida consolidada.
* `asignarRuta(ruta, paradas)`: Asigna transportista, vehículo (patente), conductor e itinerario con secuencia de paradas ordenada.
* `listarRemitos(clienteId?)`: Listado maestro de Remitos Rx emitidos para control fiscal y de tráfico.
* `listarRutasConParadas(almacenId?)`: Visualización del estado de transporte y seguimiento de paradas de cada hoja de ruta.
* `obtenerRutaPorId(rutaId)`: Detalle completo de la ruta con pedidos, destinatarios, direcciones e itinerario secuenciado.
* `actualizarEstadoRuta(rutaId, estado, fechaSalidaReal?)`: Transición de estado (`programada` -> `en_viaje` -> `itinerario_cumplido`).
* `registrarEntregaParada(...)`: Registra entrega conforme (receptor, DNI, firma digital, foto POD) o novedad (faltantes de bultos) y finaliza atómicamente la parada.
* `adjuntarDocumentoParada(...)`: Permite adjuntar o actualizar fotos de remitos conformados en paradas ya entregadas sin alterar datos de recepción.

### G. Almacenamiento en Google Drive (`googleDriveService`)
* `subirDocumentoAGoogleDrive({ file, base64, fileName, folder })`: Sube fotos y documentos pesados a la carpeta exclusiva **`OpenWMS_Documentos`** en Google Drive, evitando sobrecargar la base de datos PostgreSQL con datos base64.
* En la base de datos (`rutas_paradas_itinerario.foto_remito_url`), se guarda **únicamente el enlace (URL público)** al archivo en Google Drive.
* `normalizarUrlGoogleDrive(url)`: Genera URLs de visualización rápida y de alta resolución optimizadas para el navegador sin problemas de CORS.
* `probarConexionGoogleDrive()`: Valida la conectividad con el Webhook de Google Apps Script.

### H. Usuarios, Roles y Permisos 3PL (`usuariosApi`)
* `listarUsuarios(soloActivos?)`: Consulta todos los usuarios del sistema junto a su lista de roles asociados (`usuarios_roles` -> `roles`).
* `obtenerUsuarioPorId(id)`: Retorna el usuario por su ID UUID.
* `obtenerUsuarioPorTelefono(telefono, soloActivos?)`: Búsqueda flexible por teléfono mediante RPC `wms_obtener_usuario_por_telefono` o PostgREST (soporta formatos internacionales, con o sin signos y espacios).
* `actualizarUltimoAccesoBot(identificador, fecha?)`: **Actualiza la fecha de último acceso del bot (`fecha_ultimo_acceso_bot`)**. Resuelve al usuario por UUID, teléfono exacto o normalizado, email o nombre de usuario. Si no se provee fecha, toma `now()`.
* `listarUsuariosPorClienteCodigo(clienteCodigo)`: Devuelve los usuarios con acceso al código del cliente. Incluye automáticamente a aquellos con `'000'` (acceso global a todos los clientes).
* `crearUsuario(usuario, rolesIds?)`: Crea una cuenta de usuario asignándole su array de `clientes_ids` (por defecto `['000']`) y vincula los roles seleccionados.
* `actualizarUsuario(id, cambios, rolesIds?)`: Modifica datos del usuario y sincroniza la tabla intermedia `usuarios_roles`.
* `eliminarUsuario(id)`: Elimina el registro o realiza baja lógica (`activo: false`) si existen restricciones referenciales.
* `alternarEstadoUsuario(id, activoActual)`: Alterna el estado activo/inactivo del usuario.
* `listarRoles(soloActivos?)`: Catálogo de roles (`admin`, `operador`, `supervisor`, `cliente`, `chofer`, `bot`).
* `crearRol(rol)`, `actualizarRol(id, cambios)`, `eliminarRol(id)`: Mantenimiento de roles del sistema.

> **Convención '000':** El array `clientes_ids` en `usuarios` almacena los códigos de los clientes a los que tiene acceso el usuario. El valor `'000'` indica acceso irrestricto a **Todos los Clientes**, permitiendo que consultas de stock y pedidos abarquen el inventario global sin requerir asignar cada código individualmente.

---

## 3. Ejemplo Práctico de Uso en Código

```typescript
import { recepcionesApi, inventarioApi, pedidosApi } from './src/api';

async function ejemploFlujo() {
  // 0. Flujo Bot WhatsApp / Integración: Identificar usuario y obtener sus clientes asignados
  const usuario = await usuariosApi.obtenerUsuarioPorTelefono('+54 9 11 1234-5678');
  if (usuario) {
    // Se puede pasar directamente el objeto 'usuario' (o 'usuario.clientes_ids')
    const clientesAsignados = await clientesApi.obtenerClientesPorId(usuario);
    console.log(`Usuario autenticado: ${usuario.nombre_usuario}. Clientes autorizados:`, clientesAsignados);

    // 0.1 Consultar pedidos en ejecución del cliente (ordenados asc por fechaSolicitud)
    const pedidosEnCurso = await pedidosApi.buscarPedidosPorCliente(clientesAsignados[0]?.codigo || '001');
    console.log('Pedidos en ejecución del cliente:', pedidosEnCurso);
    // Retorna: [{ NombrePedidoCliente, DestinatarioNombre, Estado, FechaHoraSolicitado }]
  }

  // 1. Confirmar un ingreso de mercadería en rack con pallet LPN
  const resultadoPutaway = await recepcionesApi.confirmarPutaway({
    tareaId: '98d5a1bc-7821-4f12-9c32-b89512345678',
    cantidadRecibida: 60,
    codigoLpn: 'PLT-2026-000100',
    ubicacionDestinoId: 'e2a870d1-1234-4567-89ab-cdef01234567'
  });
  console.log('Ingreso confirmado en stock:', resultadoPutaway);

  // 2. Facturación 3PL: Saber cuántos M3 tiene ocupados el cliente
  const espacio = await inventarioApi.obtenerM3OcupadosPorCliente('f4b11234-5678-4321-abcd-ef0123456789');
  console.log(`El cliente tiene ocupados ${espacio.totalM3} M3 en depósito`);

  // 3. Confirmar la recolección de picking para un pedido
  const resultadoPicking = await pedidosApi.confirmarPicking({
    tareaPickingId: '3c123456-7890-4abc-def1-234567890abc',
    cantidadRecolectada: 12
  });
  console.log('Picking realizado:', resultadoPicking);
}
```

---

## 4. Tipos TypeScript Fuertemente Tipados

Todos los tipos de tablas, vistas, enums y llamadas RPC se encuentran completamente actualizados en:
* [types/database.types.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/types/database.types.ts)
