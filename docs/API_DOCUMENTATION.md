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

---

## 2. Servicios del SDK TypeScript (`src/api/`)

En la carpeta [src/api/](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api) tienes módulos especializados:

```typescript
import { 
  clientesApi, 
  articulosApi, 
  almacenApi, 
  recepcionesApi, 
  inventarioApi, 
  pedidosApi, 
  despachosApi 
} from './src/api';
```

### A. Clientes y Destinatarios (`clientesApi`)
* `listarClientes()`: Devuelve los clientes depositantes 3PL activos.
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
* `obtenerPalletPorCodigo(codigoLpn)`: Consulta todo el contenido de un pallet específico (bultos, artículos, M3 y ubicación actual).
* `consultarKardex(clienteId, articuloId)`: Trazabilidad inmutable de movimientos físicos.

### E. Pedidos y Picking (`pedidosApi`)
* `crearPedido(pedido, detalles)`: Registra pedido para un destinatario del cliente.
* `confirmarPicking({ tareaPickingId, cantidadRecolectada })`: **Ejecuta la transacción atómica de picking**:
  * Bloquea la fila de inventario (`FOR UPDATE`).
  * Valida stock disponible.
  * Descuenta el stock y los M3 de la ubicación y pallet.
  * Actualiza el pedido a 'separado'.
  * Registra la salida en el Kardex.

### F. Salidas, Despachos y Ruteo (`despachosApi`)
* `crearOrdenSalida(almacenId, numeroOrden, pedidosIds)`: Agrupa múltiples pedidos en una orden de salida consolidada.
* `emitirRemitoRx({ orden_salida_id, pedido_id, numero_remito_rx, total_bultos, total_pallets, peso_total_kg, volumen_total_m3, valor_declarado_total, ... })`: Genera el remito oficial de tránsito.
* `asignarRuta(ruta, paradas)`: Asigna unidad de transporte, chofer, patente e itinerario con secuencia de paradas de entrega.

---

## 3. Ejemplo Práctico de Uso en Código

```typescript
import { recepcionesApi, inventarioApi, pedidosApi } from './src/api';

async function ejemploFlujo() {
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
