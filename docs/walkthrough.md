# Recorrido de Implementación: Modelo WMS 3PL en Supabase (OpenWMS)

Se ha creado, desplegado y auditado exitosamente el esquema completo de base de datos para el **WMS 3PL** en tu proyecto de Supabase (`OpenWMS_ssd`), optimizado en **Español Latinoamericano (`es-419`)** sobre **PostgreSQL 17**.

---

## 1. Resumen de Tablas Creadas por Módulo (24 Tablas)

| Módulo | Tablas Creadas | Descripción y Características Clave |
| :--- | :--- | :--- |
| **A. Clientes 3PL y Catálogo** | `clientes`<br>`destinatarios`<br>`categorias_articulos`<br>`subcategorias_articulos`<br>`articulos` | • Segregación por **Cliente Depositante** (`cliente_id`).<br>• `unidad_negocio` en clientes (Retail, Farma, etc.).<br>• Artículos con `unidades_por_bulto`, `bultos_por_pallet`, `rotacion_abc`, `valor_declarado` ($) y `volumen_unitario_m3`.<br>• Colación `es_latam_ci` para búsquedas insensibles a mayúsculas y acentos. |
| **B. Ubicaciones Físicas** | `almacenes`<br>`zonas`<br>`ubicaciones` | • Codificación física de etiquetas (ej: `A1-P02-E01-N03`).<br>• Capacidad en peso (kg) y volumen cúbico (`capacidad_volumen_m3`).<br>• Indicador `permite_mezcla_clientes`. |
| **C. Recepciones (Inbound)** | `lotes_cliente`<br>`pallets_lpn`<br>`ordenes_recepcion`<br>`ordenes_recepcion_detalle`<br>`tareas_putaway_control` | • Nro. Contenedor/OC, tipo contenedor, empresa de transporte, chofer, patente y documentos adjuntos.<br>• **El lote se declara en la recepción**.<br>• Generación de **Pallet LPN** al recepcionar bultos.<br>• Confronta en Putaway: control de recibido vs. esperado y cubicaje M3. |
| **D. Inventario y Kardex** | `inventario`<br>`movimientos_inventario` | • Jerarquía: **Cliente -> Lote -> Artículos**.<br>• Stock por ubicación con cubicaje exacto (`volumen_m3`) para **valorización y cobro del espacio 3PL**.<br>• Soporte de pallets completos y extracciones parciales.<br>• Kardex inmutable para trazabilidad y auditoría. |
| **E. Pedidos (Outbound)** | `pedidos`<br>`pedidos_detalle`<br>`tareas_picking` | • Pedidos orientados a **Destinatarios / Sucursales** de cada cliente.<br>• Instrucciones y `observaciones_picking` para el operario de depósito. |
| **F. Salidas y Transporte** | `ordenes_salida`<br>`ordenes_salida_pedidos`<br>`paletizado_despacho`<br>`remitos_transito`<br>`rutas_entrega`<br>`rutas_paradas_itinerario` | • Órdenes de salida consolidadas (multi-pedido).<br>• Consolidación de bultos a pallets de despacho.<br>• **Remito Rx de Tránsito** con totales de bultos, pallets, kilos y M3.<br>• Asignación de unidad de transporte y hoja de ruta con paradas ordenadas (itinerario). |

---

## 2. Archivos del Proyecto Generados

### A. Base de Datos y Migraciones Supabase (`supabase/migrations/`)
* [20260923000000_wms_3pl_schema.sql](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/supabase/migrations/20260923000000_wms_3pl_schema.sql): Esquema DDL de las 24 tablas, RLS, colación `es_latam_ci` e índices de claves foráneas.
* [20260923000001_wms_stored_procedures.sql](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/supabase/migrations/20260923000001_wms_stored_procedures.sql): Procedimientos atómicos ACID (`rpc_confirmar_putaway` y `rpc_confirmar_picking`).
* [20260923000002_wms_seed_data.sql](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/supabase/migrations/20260923000002_wms_seed_data.sql): Carga inicial de clientes 3PL, artículos, almacenes y ubicaciones.
* [20260925000000_wms_rpc_crear_recepcion.sql](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/supabase/migrations/20260925000000_wms_rpc_crear_recepcion.sql): Procedimiento transaccional para registro integral de recepciones inbound.
* [20260925000001_wms_outbound_procedures.sql](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/supabase/migrations/20260925000001_wms_outbound_procedures.sql): Procedimientos RPC para alocación FEFO/FIFO, recolección con novedades, consolidación en packing station y emisión de Remitos Rx.

### B. Tipado TypeScript y Database (`types/`)
* [database.types.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/types/database.types.ts): Definiciones y esquemas TypeScript generados a partir de las 24 tablas y RPCs de Supabase.

### C. Capa de Servicios y SDK API (`src/api/`)
* [supabaseClient.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api/supabaseClient.ts): Cliente Supabase configurado con tipado estricto.
* [clientesApi.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api/clientesApi.ts): Gestión de clientes depositantes 3PL y destinatarios/sucursales.
* [articulosApi.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api/articulosApi.ts): Catálogo maestro, empaque, cubicaje unitario y búsqueda `es_latam_ci`.
* [almacenApi.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api/almacenApi.ts): Almacenes, zonas y codificación física de ubicaciones (`capacidad_volumen_m3`).
* [recepcionesApi.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api/recepcionesApi.ts): Órdenes de entrada, generación de LPNs y confirmación de Putaway.
* [inventarioApi.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api/inventarioApi.ts): Control de existencias, cálculo de cubicaje $M^3$ y consulta de Kardex.
* [pedidosApi.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api/pedidosApi.ts): Pedidos outbound, alocación FEFO/FIFO, packing station y remito Rx.
* [despachosApi.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api/despachosApi.ts): Órdenes de salida consolidadas, remitos de tránsito y hojas de ruta con itinerario.
* [index.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/api/index.ts): Barrel export unificado para consumo en la UI.

### D. Frontend y Vistas Operativas (`src/components/`, `src/`)
* [App.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/App.tsx): Interfaz principal con KPIs, selector dinámico de cliente y navegación por pestañas.
* [Navbar.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/layout/Navbar.tsx): Barra de navegación con filtro de cliente depositante y estado operativo.
* [InboundMonitor.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/inbound/InboundMonitor.tsx): Monitor de recepciones y control de putaway.
* [NuevaRecepcionModal.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/inbound/NuevaRecepcionModal.tsx): Modal de ingreso con contenedor, chofer, patente, lotes y bultos.
* [OutboundMonitor.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/outbound/OutboundMonitor.tsx): Monitor integral de pedidos, tareas de picking, remitos emitidos y hojas de ruta.
* [NuevoPedidoModal.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/outbound/NuevoPedidoModal.tsx): Modal de registro de pedidos de salida con destinatarios y cubicaje.
* [PackingStationModal.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/outbound/PackingStationModal.tsx): Mesa de control para consolidación de bultos sobre Pallet LPN de despacho.
* [RemitoPrintModal.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/outbound/RemitoPrintModal.tsx): Emisión fiscal (Punto de Venta/CAE) y plantilla imprimible oficial con firmas.
* [AsignarRutaModal.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/outbound/AsignarRutaModal.tsx): Asignación de unidad de transporte, conductor y organizador de paradas.
* [InventoryTable.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/inventory/InventoryTable.tsx): Visualizador de stock con desglose por cliente, LPN, lote y $M^3$.
* [PalletDetailPanel.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/inventory/PalletDetailPanel.tsx): Inspección de contenido de pallets LPN.
* [KardexView.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/kardex/KardexView.tsx): Historial inmutable y trazabilidad de movimientos.
* [StorageVolumeChart.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/charts/StorageVolumeChart.tsx) y [FlowTrendsChart.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/charts/FlowTrendsChart.tsx): Gráficas de ocupación volumétrica y flujo.
* [AnalyticsDashboard.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/analytics/AnalyticsDashboard.tsx): Tablero ejecutivo con KPIs globales, cubicaje valorizado y suite analítica.
* [RackHeatmap.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/analytics/RackHeatmap.tsx): Mapa de calor interactivo 2D de racks (Pasillo x Nivel x Estante) con inspección de pallet LPN y stock.
* [AbcSlottingAudit.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/analytics/AbcSlottingAudit.tsx): Auditoría de rotación ABC cruzada con Kardex y recomendaciones de reubicación física (Slotting).
* [ExportReportsCenter.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/analytics/ExportReportsCenter.tsx): Centro de exportación de 3 reportes ejecutivos (Inventario Valorizado, Liquidación 3PL y Kardex) en Excel/CSV y vista imprimible PDF.
* [KpiCard.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/ui/KpiCard.tsx) y [Badge.tsx](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/components/ui/Badge.tsx): Componentes atómicos de diseño y badges de estado.

### E. Documentación y Scripts
* [API_DOCUMENTATION.md](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/API_DOCUMENTATION.md): Documentación técnica del consumo HTTP/REST y RPC.
* [walkthrough.md](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/docs/walkthrough.md): Resumen de implementación del modelo 3PL.
* [implementation_plan.md](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/docs/implementation_plan.md): Plan de trabajo y requerimientos del WMS.
* [seed.ts](file:///c:/Users/intra/Documents/SISTEMAS/WMS_SSD/src/scripts/seed.ts): Script ejecutable de inicialización y verificación.

---

## 3. Pruebas y Verificaciones Realizadas

### A. Auditoría de Seguridad (Supabase Advisors)
```json
{
  "lints": []
}
```
* **0 advertencias de seguridad:** RLS activo en las 24 tablas, funciones con `search_path = ''` inmutable, extensión en esquema `extensions`.

### B. Auditoría de Rendimiento
* Todas las claves foráneas (FKs) cuentan con índices explícitos creados, garantizando JOINs de alta velocidad y eliminando escaneos secuenciales.

### C. Prueba de Integración Operativa
Se simuló un ciclo completo de recepción e inventario:
1. Inserción de Cliente 3PL con unidad de negocio `Alimentos y Bebidas`.
2. Alta de artículo con `unidades_por_bulto: 12`, `bultos_por_pallet: 60`, `rotacion_abc: 'A'` y cubicaje unitario de `0.0250 m3`.
3. Registro de orden de recepción con datos de contenedor `40HC`, chofer y patente.
4. Generación de pallet LPN `PLT-2026-000001` y cálculo automático de cubicaje: **1.5000 M3** (60 cajas x 0.025 m3).
5. Consulta de stock con colación `es_latam_ci`, comprobando que `'JUGO DE NARANJA 1L (CAJA X 12)'` coincide exactamente con `'Jugo de Naranja 1L (Caja x 12)'`.
6. Comprobación de disparo de triggers para `actualizado_en`.
7. Limpieza final de datos de prueba, dejando la base de datos limpia y lista para su uso.

---

## 4. ABMs Maestros y Sistema de Ingreso Rápido ("Quick-Add")

Se implementaron interfaces completas CRUD para todas las entidades maestras definidas en la base de datos y la capacidad de invocar el alta rápida directamente desde los selectores desplegables:

### A. Nuevos Módulos ABM en la Pestaña "Maestros & ABMs"
1. **Categorías & Subcategorías de Artículos (`categorias_articulos`, `subcategorias_articulos`):**
   - Código normalizado, denominación, descripción y control de estado activo/inactivo.
   - Panel inline para registrar y eliminar subcategorías asociadas dinámicamente.
2. **Destinatarios / Sucursales (`destinatarios`):**
   - Vinculación con Cliente 3PL, código interno, razón social y CUIT.
   - Dirección completa de entrega, localidad, provincia, código postal.
   - Contacto de recepción, teléfono, correo y ventana horaria de entrega.
   - Borrado seguro con fallback a inactivación si existen pedidos históricos vinculados.
3. **Lotes de Cliente & Cuarentena (`lotes_cliente`):**
   - Número de lote formal, fecha de elaboración y fecha de vencimiento con semáforo FEFO (*Vencido*, *Por vencer < 30d*, *Vigente*).
   - Modal de Bloqueo de Calidad / Cuarentena con registro de motivo de bloqueo para impedir picking erróneo.

### B. Componente Universal de Selección Rápida (`QuickSelect`)
- **Primer ítem interactivo:** `✨ + {addNewLabel}` (ej. `✨ + Agregar nuevo artículo al catálogo...`, `✨ + Agregar nuevo destinatario/sucursal...`, `✨ + Registrar nuevo cliente 3PL...`).
- **Botón directo `+` lateral:** Permite disparar el alta con 1 solo clic sin alterar el formulario en curso.
- **Actualización en caliente:** Al confirmar la creación en el modal emergente, se persiste en Supabase, se refresca la lista local y se auto-selecciona el nuevo elemento inmediatamente en el formulario padre.

### C. Integración en Flujos Operativos
- **Nuevo Pedido Outbound:** Quick-Add para *Destinatario* y *Artículos* en cada renglón.
- **Nueva Recepción Inbound:** Quick-Add para *Cliente*, *Artículos* y *Lotes*.
- **Catálogo de Artículos:** Quick-Add para *Cliente* y *Categoría*.
- **Barra Superior (Navbar):** Quick-Add para *Cliente 3PL* desde cualquier pantalla.

---

## 5. Emisión Fiscal Electrónica y Enlace con Remitos Rx (AFIP)

Se implementó el ciclo completo de facturación fiscal electrónica sobre las liquidaciones de estadía y servicios 3PL:

### A. Base de Datos y Motor Transaccional (Supabase / Postgres 17)
- **Migración `20260925000005_wms_factura_fiscal_module.sql`:**
  - Extensión de `liquidaciones_cliente`: `tipo_comprobante` (`FACTURA_A`, `FACTURA_B`, `FACTURA_C`), `punto_venta`, `numero_factura`, `cae` (14 dígitos), `fecha_vencimiento_cae`, `alicuota_iva` (21% / 10.5% / 0%), `monto_neto_gravado`, `monto_iva`, `monto_total_facturado`, `fecha_facturacion`, `remitos_asociados` (`jsonb`) y auditoría de anulación (`motivo_anulacion`, `fecha_anulacion`).
  - Procedimiento ACID `wms_emitir_factura_fiscal_liquidacion`: Formatea y valida punto de venta y correlativo con padding, computa IVA con precisión fiscal de 2 decimales y congela la liquidación en estado `facturada`.
  - Procedimiento `wms_anular_factura_fiscal`: Permite revertir una liquidación facturada a `anulada` registrando el motivo legal / nota de crédito y liberando el período.
  - Procedimiento `wms_obtener_remitos_periodo_cliente`: Recopila todos los remitos de tránsito emitidos en el período para su vinculación y anexado automático.
  - **Auditoría de Seguridad RLS:** 0 alertas en Supabase Advisors tras activar RLS y políticas seguras en todas las tablas de liquidación y tarifas.

### B. Componentes e Interfaz de Usuario
1. **Modal de Emisión Fiscal (`EmitirFacturaModal.tsx`):**
   - Detección automática de Factura A o B analizando el CUIT del cliente depositante.
   - Modo Dual de CAE: Botón *"Simular CAE de Prueba AFIP"* (genera 14 dígitos numéricos según RG 4291 y vencimiento a 10 días) + campo habilitado para ingreso del CAE real de AFIP.
   - Cálculo impositivo en tiempo real de Neto Gravado + IVA (21%) = Total Facturado.
   - Cuadro desplegable con los **Remitos Rx de Tránsito vinculados** (número Rx, destinatario, fecha, bultos y $M^3$).
2. **Plantilla Imprimible Oficial AFIP A4 (`FacturaFiscalPrintModal.tsx`):**
   - Formato normativo de comprobante fiscal electrónico con letra central (**A** o **B**), datos del emisor 3PL, receptor, tabla de conceptos y cuadro impositivo.
   - **Pie Fiscal AFIP:** CAE, Vto. CAE y **Código QR interactivo AFIP** según RG 4291.
   - **Hoja 2 / Anexo Logístico:** Tabla de remitos de despacho vinculados para conciliación con firmas.
3. **Modal de Anulación / Nota de Crédito (`AnularFacturaModal.tsx`):**
   - Confirmación segura con registro obligatorio del motivo de reversión.

---

## 6. Operación de Depósito Móvil / Handheld RF (Pistola Colectora de Código de Barras)

Se implementó el módulo integral para **Terminales Móviles RF y Smartphones de Depósito**, diseñado específicamente para operarios de piso con colectores de datos (Zebra, Honeywell, Datalogic) y pistolas láser de código de barras:

### A. Base de Datos y Motores ACID (`supabase/migrations/20260925000007_wms_rf_relocation.sql`)
1. **Procedimiento `wms_reubicar_stock`:**
   - Permite la reubicación física inmediata de mercadería entre racks.
   - **Modo Pallet Completo (LPN):** Actualiza la ubicación de todo el pallet y sus bultos, actualizando el cubicaje $M^3$ de las ubicaciones origen y destino.
   - **Modo Parcial (Bultos Sueltos):** Descuenta los bultos seleccionados de la ubicación origen e incrementa o inserta la existencia en la ubicación destino.
   - **Trazabilidad Kardex:** Registra automáticamente los movimientos en `movimientos_inventario` con tipo `REUBICACION_INTERNA`.
2. **Procedimiento `wms_rf_consulta_libre`:**
   - Decodificación y búsqueda multipropósito instantánea de cualquier código de barras:
     - Si es un Pallet LPN (ej: `PLT-...`): Devuelve SKU, descripción, cliente depositante, lote, bultos y ubicación actual.
     - Si es una Ubicación de Rack (ej: `A1-P01-E01-N01`): Devuelve todos los pallets y bultos almacenados en dicha posición física.
     - Si es un SKU o EAN de Artículo: Localiza todas las posiciones de rack donde existe stock disponible de dicho producto.

### B. Motor Sensorial y Entrada de Datos de Campo
1. **Servicio de Audio y Háptico (`src/lib/rfSoundService.ts`):**
   - **Audio Sintetizado Nativo (Web Audio API):**
     - *Chime de Éxito:* Melodía armónica de doble tono ascendente (880 Hz $\rightarrow$ 1320 Hz) para confirmaciones rápidas.
     - *Buzzer de Error:* Tono grave de advertencia industrial (220 Hz $\rightarrow$ 150 Hz en onda cuadrada) ante discrepancias o lecturas inválidas.
   - **Vibración Háptica:** Pulsos de motor en terminales rugerizados y teléfonos móviles (`navigator.vibrate`).
2. **Componente de Escaneo Híbrido (`RfScannerInput.tsx`):**
   - **Pistola Láser / Teclado Cuña (Keyboard Wedge):** Mantiene el foco continuo en el campo de texto e intercepta el terminador `Enter` emitido por el láser.
   - **Cámara Integrada:** Escaneo mediante cámara de smartphone usando `Html5Qrcode`.
   - **Tags de Prueba:** Acceso rápido a códigos de barras de prueba con 1 solo toque.

### C. Los 4 Módulos Operativos de la Terminal RF
1. **Guardado en Racks / Putaway (`RfPutawayView.tsx`):**
   - Lectura del Pallet LPN en playa de recepción.
   - Sugerencia inteligente de posición de rack y verificación obligatoria escaneando la etiqueta física de destino.
2. **Picking Guiado (`RfPickingView.tsx`):**
   - Secuencia optimizada de recolección de pedidos.
   - Confirmación por escaneo de la ubicación física, validación de código de barras del producto y teclado numérico gigante para confirmación de bultos.
3. **Consulta Libre / Inquiry (`RfInquiryView.tsx`):**
   - Escaneo universal para inventarios rápidos, comprobación de racks vacíos o ubicación de productos de clientes depositantes.
4. **Reubicación Interna entre Racks (`RfRelocationView.tsx`):**
   - Movimiento ágil entre posiciones de estantería en modo dual (Pallet LPN completo o bultos parciales).

### D. Interfaz Terminal y Navegación
- **Acceso:** Nueva pestaña dedicada **"Terminal RF"** con ícono de colector en la barra de navegación principal.
- **Diseño Ergonómico:** Pantalla de alto contraste industrial oscuro (`#0d0d0d`), tipografía de gran tamaño, teclado táctil numérico y ocultamiento automático de elementos de escritorio para maximizar el área de trabajo en dispositivos portátiles.
- **Gestión de Turno:** Identificación del operario y selección de almacén activo con persistencia en `localStorage`.


