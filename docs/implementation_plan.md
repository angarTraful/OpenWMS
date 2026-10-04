# Plan de Implementación: Modelo WMS 3PL en Español Latino (OpenWMS)

Diseño y despliegue del modelo relacional para el sistema de gestión de almacenes (**WMS 3PL - Third-Party Logistics**), adaptado con precisión a los requerimientos operativos de tu operación logística, en **Español Latinoamericano (`es-419`)**, optimizado para **PostgreSQL 17** y **Supabase**.

---

## 1. Arquitectura de Módulos Operativos

```mermaid
erDiagram
    CLIENTES ||--o{ ARTICULOS : es_dueno_de
    CLIENTES ||--o{ DESTINATARIOS : tiene
    CLIENTES ||--o{ ORDENES_RECEPCION : solicita
    CLIENTES ||--o{ INVENTARIO : es_propietario
    CLIENTES ||--o{ PEDIDOS : genera

    CATEGORIAS ||--o{ SUBCATEGORIAS : contiene
    SUBCATEGORIAS ||--o{ ARTICULOS : clasifica

    ALMACENES ||--o{ ZONAS : divide_en
    ZONAS ||--o{ UBICACIONES : contiene

    ORDENES_RECEPCION ||--o{ ORDENES_RECEPCION_DETALLE : compone
    ORDENES_RECEPCION_DETALLE ||--o{ TAREAS_PUTAWAY_CONTROL : valida_recibido_vs_esperado
    TAREAS_PUTAWAY_CONTROL ||--o{ PALLETS_LPN : crea_pallets

    PALLETS_LPN ||--o{ INVENTARIO : agrupa
    UBICACIONES ||--o{ INVENTARIO : aloja
    ARTICULOS ||--o{ INVENTARIO : referencia

    PEDIDOS ||--o{ PEDIDOS_DETALLE : contiene
    DESTINATARIOS ||--o{ PEDIDOS : recibe
    PEDIDOS_DETALLE ||--o{ TAREAS_PICKING : recolecta

    ORDENES_SALIDA ||--o{ ORDENES_SALIDA_PEDIDOS : agrupa_varios_pedidos
    ORDENES_SALIDA ||--o{ REMITOS_TRANSITO : emite_rx
    RUTAS_ENTREGA ||--o{ RUTAS_PARADAS_ITINERARIO : asigna_itinerario
    ORDENES_SALIDA ||--o{ RUTAS_ENTREGA : transporta
``### Módulo A: Clientes 3PL, Destinatarios y Catálogo de Artículos

> [!NOTE]
> Las mercaderías pertenecen a los **Clientes Depositantes**. Por ello, tanto los artículos como los destinatarios y las existencias están directamente segregados por `cliente_id`.
> Estructura de Stock: **Cliente -> Lote -> Artículos (Cantidad y M3)**.

1. **`clientes` (Clientes Depositantes 3PL)**:
   * `id` (UUID), `codigo`, `razon_social`, `unidad_negocio` (clasificación comercial 3PL: ej. Retail, Farmacéutica, Alimentos, etc.), `identificacion_fiscal` (RUT/CUIT/NIT), `direccion`, `telefono`, `email_contacto`, `activo`.
2. **`destinatarios` (Destinatarios y Sucursales de cada Cliente)**:
   * `id`, `cliente_id` (FK), `codigo_sucursal`, `razon_social_destinatario`, `direccion_entrega`, `ciudad`, `coordenadas` (lat/lng opcional), `contacto_recepcion`, `telefono`, `ventana_horaria_entrega`.
3. **`categorias_articulos` y `subcategorias_articulos`**:
   * Clasificación jerárquica para organización de inventario de artículos.
4. **`articulos`**:
   * `id`, `cliente_id` (FK a `clientes`), `categoria_id`, `subcategoria_id`.
   * `sku`, `codigo_barras` (EAN/UPC), `nombre` (con `COLLATE es_latam_ci`), `descripcion`.
   * `unidad_medida` (bulto, caja, rollo, unidad, tambor, etc.).
   * **Campos específicos requeridos:**
     * `unidades_por_bulto` (ej. 12 piezas por caja/bulto).
     * `bultos_por_pallet` (cantidad estándar de bultos/cajas por pallet).
     * `rotacion_abc` (Enum: `'A'`, `'B'`, `'C'`).
     * `valor_declarado` (`numeric(14,2)`), `moneda` (ej. `'USD'`, `'ARS'`).
     * `peso_unitario_kg`, `volumen_unitario_m3` (clave para el cálculo acumulado de M3 ocupados).
   * `activo`.

---

### Módulo B: Infraestructura del Almacén (Ubicaciones)
5. **`almacenes`**: Sedes físicas (código, nombre, dirección, activo).
6. **`zonas`**: Áreas funcionales (recepción, racks/almacenamiento, picking, cuarentena, playa de despacho).
7. **`ubicaciones`**:
   * `id`, `almacen_id`, `zona_id`.
   * `codigo_etiqueta` (código de barra físico ej. `A1-P03-E02-N04`), `pasillo`, `estante`, `nivel`, `posicion`.
   * `capacidad_peso_kg`, `capacidad_volumen_m3` (M3 máximos de la posición), `permite_mezcla_clientes` (boolean, default false), `estado` (`activa`, `bloqueada`).

---

### Módulo C: Recepciones (Inbound) y Control / Putaway
8. **`lotes_cliente` (Lotes del Cliente)**:
   * `id`, `cliente_id` (FK a `clientes`), `numero_lote`, `fecha_fabricacion`, `fecha_vencimiento`, `bloqueado`, `motivo_bloqueo`.
9. **`ordenes_recepcion`**:
   * `id`, `cliente_id` (FK), `almacen_id` (FK), `numero_recepcion`.
   * **Campos solicitados:**
     * `nro_contenedor_oc` (Nro. de contenedor / Orden de Compra).
     * `tipo_contenedor` (ej. 20ft, 40ft High Cube, Furgón, Chasis, etc.).
     * `fecha_hora_arribo` (`timestamptz`).
     * `transporte_empresa`, `chofer_nombre`, `chofer_documento`, `patente_camion` (chapa).
     * `documentos_adjuntos` (`jsonb` / array de URLs de remitos, fotos del precinto, packing list).
     * `lote_defecto` (el lote se declara aquí a nivel de orden o en el detalle).
     * `estado` (`programada`, `en_playa`, `en_descarga`, `en_control`, `finalizada`, `cancelada`).
10. **`ordenes_recepcion_detalle`**:
    * `id`, `recepcion_id`, `articulo_id`.
    * `lote_declarado` (aquí se declara o adosa el lote para el renglón), `fecha_vencimiento`.
    * `cantidad_esperada`, `ubicacion_sugerida_id`, `comentarios`.
11. **`tareas_putaway_control` (Control Recibido vs. Esperado & Guardado)**:
    * Se ejecuta la confronta física y asignación física:
      * `cantidad_recibida`, `diferencia_conteo` (`cantidad_recibida - cantidad_esperada`).
      * `pallet_id` / `lpn` (License Plate ID del pallet generado en la recepción si se paletizan cajas/rollos).
      * `volumen_calculado_m3` (M3 cúbicos calculados para valorización del espacio).
      * `ubicacion_origen_id` (playa de recepción) y `ubicacion_destino_id` (rack final).
      * `operador_control_id`, `estado` (`pendiente`, `en_traslado`, `almacenado`).

---

### Módulo D: Inventario por Cliente, Pallets (LPN) y Trazabilidad (Kardex)
12. **`pallets_lpn` (License Plate Number)**:
    * `id`, `codigo_lpn` (ej: `PLT-2026-000145`), `cliente_id`, `volumen_total_m3` (M3 acumulados del pallet), `peso_total_kg`, `estado` (`en_stock`, `en_transito`, `desarmado`, `despachado`).
13. **`inventario` (Existencias por Cliente -> Lote -> Artículo)**:
    * `id`, `cliente_id` (FK), `lote_id` (FK a `lotes_cliente`), `articulo_id` (FK), `almacen_id` (FK), `ubicacion_id` (FK).
    * `pallet_id` (FK opcional a `pallets_lpn`): permite pallet completo o bultos individuales. Permite extracciones parciales sin perder la trazabilidad.
    * `cantidad_disponible` (CHECK >= 0), `cantidad_reservada` (CHECK >= 0).
    * `volumen_m3` (Metros cúbicos exactos en stock: **base para valorizar y facturar el espacio ocupado 3PL**).
    * `unidad_medida` (caja, rollo, etc.).
14. **`movimientos_inventario` (Kardex auditable)**:
    * Registro transaccional inmutable: `cliente_id`, `lote_id`, `articulo_id`, `pallet_id`, `ubicacion_origen_id`, `ubicacion_destino_id`, `tipo_movimiento`, `cantidad`, `volumen_m3`, `documento_referencia`, `usuario_id`, `fecha_hora`.

---

### Módulo E: Pedidos (Outbound Order Management)
15. **`pedidos`**:
    * `id`, `cliente_id` (FK), `destinatario_id` (FK a destinatarios del cliente).
    * `numero_pedido`, `orden_compra_cliente`, `fecha_solicitud`, `fecha_compromiso_entrega`, `prioridad`, `estado`, `observaciones`.
16. **`pedidos_detalle`**:
    * `id`, `pedido_id`, `articulo_id`, `cantidad_solicitada`, `cantidad_reservada`, `cantidad_separada`.
17. **`tareas_picking`**:
    * `id`, `pedido_id`, `pedido_detalle_id`, `articulo_id`, `lote_id`, `pallet_origen_id`, `ubicacion_origen_id`.
    * `cantidad_a_recolectar`, `cantidad_recolectada`.
    * `observaciones_picking` (instrucciones o modo de pickeo especial para el operario).
    * `operador_id`, `estado`.

---

### Módulo F: Salidas, Despachos, Remitos de Tránsito y Ruteo
18. **`ordenes_salida` (Consolidado de varios pedidos)**:
    * Agrupa pedidos de un mismo cliente o compartidos por ruta/zona.
19. **`ordenes_salida_pedidos`**:
    * Vínculo N:M entre órdenes de salida y pedidos.
20. **`paletizado_despacho`**:
    * Consolidación de bultos/cajas separadas a pallets de transporte (LPN nuevo de salida), con cálculo de M3 y peso total.
21. **`remitos_transito` (Remito Rx de Tránsito)**:
    * `id`, `orden_salida_id`, `pedido_id`, `cliente_id`, `destinatario_id`, `numero_remito_rx`, `cae_o_autorizacion_fiscal`, `total_bultos`, `total_pallets`, `peso_total_kg`, `volumen_total_m3` (M3), `valor_declarado_total`.
22. **`rutas_entrega` (Asignación de transporte e itinerario)**:
    * `id`, `codigo_ruta`, `transporte_empresa`, `vehiculo_patente`, `chofer_nombre`, `chofer_documento`, `chofer_telefono`, `itinerario`.
23. **`rutas_paradas_itinerario`**:
    * Secuencia de paradas (1, 2, 3...) vinculando destinatario, pedido y remito Rx con horas estimadas y estado de entrega.o_entrega` (`pendiente`, `entregado`, `con_novedad`).

---

## 2. Decisiones Técnicas y Mejores Prácticas Supabase / Postgres

* **Segregación 3PL:** Cada consulta a inventario o artículos valida `cliente_id`.
* **Colación e Idioma:** Nombres y descripciones usan `COLLATE es_latam_ci` para que `'TORNILLO' = 'tornillo' = 'Tornillo'`.
* **Índices en Claves Foráneas:** Todas las FKs (`cliente_id`, `articulo_id`, `ubicacion_id`, `pallet_id`, etc.) cuentan con índice para optimizar JOINs y borrados en cascada.
* **Seguridad RLS:** Activado en todas las tablas con directivas `TO authenticated` y filtros optimizados `(select auth.uid())`.
* **Manejo de Stock Concurrente:** Triggers y funciones atómicas para el descuento de `cantidad_disponible` y reserva en picking, previniendo sobreventas (*overselling*).

---

## 3. Plan de Verificación

1. **Despliegue del Script SQL:** Ejecución directa en `OpenWMS_ssd` vía `execute_sql`.
2. **Prueba de Flujo Completo 3PL:**
   - Alta de Cliente 3PL con categorías y subcategorías.
   - Creación de artículo con bultos x pallet, rotación A, valor declarado.
   - Registro de Orden de Recepción con datos de contenedor, transporte y documentos.
   - Ejecución de tarea de control/putaway generando lote y LPN de pallet.
   - Verificación de existencias en `inventario` segregado por cliente.
   - Extracción parcial del pallet y generación de pedido para un destinatario.
   - Picking y agrupación del pedido en una Orden de Salida con emisión de Remito Rx y asignación a una Ruta con itinerario de transporte.
3. **Auditoría Supabase Advisors:** Ejecución de `get_advisors` para certificar 0 advertencias de seguridad y rendimiento.
