-- ==============================================================================
-- OPENWMS 3PL - Esquema de Base de Datos para Gestión de Almacenes
-- Idioma y Colación: Español Latinoamericano (es-419)
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. EXTENSIONES Y COLACIONES (Ya aseguradas, incluidas por idempotencia)
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'es_latam_ci') THEN
    CREATE COLLATION es_latam_ci (provider = icu, locale = 'es-419-u-ks-level1', deterministic = false);
  END IF;
END $$;

-- 2. ENUMS DE CONTROL OPERATIVO
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rotacion_abc_enum') THEN
    CREATE TYPE rotacion_abc_enum AS ENUM ('A', 'B', 'C');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_recepcion_enum') THEN
    CREATE TYPE estado_recepcion_enum AS ENUM ('programada', 'en_playa', 'en_descarga', 'en_control', 'finalizada', 'cancelada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_putaway_enum') THEN
    CREATE TYPE estado_putaway_enum AS ENUM ('pendiente', 'en_traslado', 'almacenado', 'cancelado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_pallet_enum') THEN
    CREATE TYPE estado_pallet_enum AS ENUM ('en_stock', 'en_transito', 'desarmado', 'despachado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_movimiento_enum') THEN
    CREATE TYPE tipo_movimiento_enum AS ENUM ('recepcion', 'putaway', 'despaletizado', 'paletizado_despacho', 'picking', 'ajuste_positivo', 'ajuste_negativo', 'transferencia', 'merma');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prioridad_pedido_enum') THEN
    CREATE TYPE prioridad_pedido_enum AS ENUM ('baja', 'normal', 'urgente');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_pedido_enum') THEN
    CREATE TYPE estado_pedido_enum AS ENUM ('ingresado', 'asignado_picking', 'en_picking', 'preparado', 'agrupado_salida', 'despachado', 'cancelado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_orden_salida_enum') THEN
    CREATE TYPE estado_orden_salida_enum AS ENUM ('planificacion', 'consolidando_pallets', 'remitida', 'cargando', 'en_transito', 'cerrada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_remito_enum') THEN
    CREATE TYPE estado_remito_enum AS ENUM ('emitido', 'en_transito', 'entregado_conforme', 'rechazado_parcial', 'rechazado_total');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_ruta_enum') THEN
    CREATE TYPE estado_ruta_enum AS ENUM ('programada', 'en_carga', 'en_viaje', 'itinerario_cumplido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_parada_enum') THEN
    CREATE TYPE estado_parada_enum AS ENUM ('pendiente', 'entregado', 'con_novedad');
  END IF;
END $$;

-- 3. FUNCIÓN TRIGGER PARA ACTUALIZACIÓN AUTOMÁTICA DE TIMESTAMP
CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.actualizado_en = clock_timestamp();
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- MÓDULO A: CLIENTES 3PL, DESTINATARIOS Y CATÁLOGO DE ARTÍCULOS
-- ==============================================================================

-- A.1 Clientes Depositantes 3PL
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  razon_social TEXT NOT NULL,
  unidad_negocio TEXT, -- Clasificación comercial: Retail, Farma, Alimentos, etc.
  identificacion_fiscal TEXT, -- RUT, CUIT, RFC, NIT
  direccion TEXT,
  telefono TEXT,
  email_contacto TEXT,
  activo BOOLEAN DEFAULT true NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- A.2 Destinatarios / Sucursales por Cliente
CREATE TABLE IF NOT EXISTS destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  codigo_sucursal TEXT,
  razon_social TEXT NOT NULL,
  direccion_entrega TEXT NOT NULL,
  ciudad TEXT,
  contacto_recepcion TEXT,
  telefono TEXT,
  ventana_horaria_entrega TEXT,
  activo BOOLEAN DEFAULT true NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- A.3 Categorías de Artículos
CREATE TABLE IF NOT EXISTS categorias_articulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- A.4 Subcategorías de Artículos
CREATE TABLE IF NOT EXISTS subcategorias_articulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID NOT NULL REFERENCES categorias_articulos(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT subcategorias_categoria_codigo_uk UNIQUE (categoria_id, codigo)
);

-- A.5 Ficha Maestra de Artículos
CREATE TABLE IF NOT EXISTS articulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES categorias_articulos(id) ON DELETE SET NULL,
  subcategoria_id UUID REFERENCES subcategorias_articulos(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  codigo_barras TEXT,
  nombre TEXT COLLATE es_latam_ci NOT NULL,
  descripcion TEXT,
  unidad_medida TEXT DEFAULT 'bulto' NOT NULL, -- bulto, caja, rollo, etc.
  unidades_por_bulto NUMERIC(12,2) DEFAULT 1 NOT NULL CHECK (unidades_por_bulto > 0),
  bultos_por_pallet INTEGER DEFAULT 1 NOT NULL CHECK (bultos_por_pallet > 0),
  rotacion_abc rotacion_abc_enum DEFAULT 'B' NOT NULL,
  valor_declarado NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (valor_declarado >= 0),
  moneda TEXT DEFAULT 'USD' NOT NULL,
  peso_unitario_kg NUMERIC(12,3) DEFAULT 0.000 NOT NULL CHECK (peso_unitario_kg >= 0),
  volumen_unitario_m3 NUMERIC(12,4) DEFAULT 0.0000 NOT NULL CHECK (volumen_unitario_m3 >= 0),
  activo BOOLEAN DEFAULT true NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT articulos_cliente_sku_uk UNIQUE (cliente_id, sku)
);

-- ==============================================================================
-- MÓDULO B: INFRAESTRUCTURA DEL ALMACÉN (UBICACIONES)
-- ==============================================================================

-- B.1 Almacenes Físicos
CREATE TABLE IF NOT EXISTS almacenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  direccion TEXT,
  activo BOOLEAN DEFAULT true NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- B.2 Zonas del Almacén
CREATE TABLE IF NOT EXISTS zonas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id UUID NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo_zona TEXT DEFAULT 'almacenamiento' NOT NULL, -- recepcion, almacenamiento, picking, cuarentena, mermas, despacho
  activo BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT zonas_almacen_codigo_uk UNIQUE (almacen_id, codigo)
);

-- B.3 Ubicaciones Físicas
CREATE TABLE IF NOT EXISTS ubicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id UUID NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  zona_id UUID NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
  codigo_etiqueta TEXT NOT NULL, -- Código de barras físico ej: A1-P03-E02-N04
  pasillo TEXT,
  estante TEXT,
  nivel TEXT,
  posicion TEXT,
  capacidad_peso_kg NUMERIC(12,2),
  capacidad_volumen_m3 NUMERIC(12,3), -- M3 máximos de capacidad
  permite_mezcla_clientes BOOLEAN DEFAULT false NOT NULL,
  estado TEXT DEFAULT 'activa' NOT NULL CHECK (estado IN ('activa', 'bloqueada')),
  CONSTRAINT ubicaciones_almacen_etiqueta_uk UNIQUE (almacen_id, codigo_etiqueta)
);

-- ==============================================================================
-- MÓDULO C: RECEPCIONES (INBOUND) Y CONTROL / PUTAWAY
-- ==============================================================================

-- C.1 Lotes por Cliente
CREATE TABLE IF NOT EXISTS lotes_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  numero_lote TEXT NOT NULL,
  fecha_fabricacion DATE,
  fecha_vencimiento DATE,
  bloqueado BOOLEAN DEFAULT false NOT NULL,
  motivo_bloqueo TEXT,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT lotes_cliente_numero_uk UNIQUE (cliente_id, numero_lote)
);

-- C.2 Pallets LPN (License Plate Number)
CREATE TABLE IF NOT EXISTS pallets_lpn (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  codigo_lpn TEXT UNIQUE NOT NULL, -- ej: PLT-2026-000145
  tipo_pallet TEXT DEFAULT 'estandar', -- madera, arlog, plastico
  volumen_total_m3 NUMERIC(12,4) DEFAULT 0.0000 NOT NULL CHECK (volumen_total_m3 >= 0),
  peso_total_kg NUMERIC(12,3) DEFAULT 0.000 NOT NULL CHECK (peso_total_kg >= 0),
  estado estado_pallet_enum DEFAULT 'en_stock' NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- C.3 Órdenes de Recepción
CREATE TABLE IF NOT EXISTS ordenes_recepcion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  almacen_id UUID NOT NULL REFERENCES almacenes(id) ON DELETE RESTRICT,
  numero_recepcion TEXT UNIQUE NOT NULL,
  nro_contenedor_oc TEXT, -- Nro contenedor / Orden de Compra
  tipo_contenedor TEXT, -- 20ft, 40ft, Chasis, Furgón
  fecha_hora_arribo TIMESTAMPTZ DEFAULT now() NOT NULL,
  transporte_empresa TEXT,
  chofer_nombre TEXT,
  chofer_documento TEXT,
  patente_camion TEXT,
  documentos_adjuntos JSONB DEFAULT '[]'::jsonb NOT NULL,
  lote_defecto TEXT, -- Declaración general de lote para el ingreso si aplica
  estado estado_recepcion_enum DEFAULT 'programada' NOT NULL,
  observaciones TEXT,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- C.4 Detalle de Órdenes de Recepción
CREATE TABLE IF NOT EXISTS ordenes_recepcion_detalle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recepcion_id UUID NOT NULL REFERENCES ordenes_recepcion(id) ON DELETE CASCADE,
  articulo_id UUID NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
  lote_declarado TEXT NOT NULL, -- El lote se declara aquí
  fecha_vencimiento DATE,
  cantidad_esperada NUMERIC(14,2) NOT NULL CHECK (cantidad_esperada > 0),
  ubicacion_sugerida_id UUID REFERENCES ubicaciones(id) ON DELETE SET NULL,
  comentarios TEXT
);

-- C.5 Tareas de Control Recibido vs Esperado y Putaway
CREATE TABLE IF NOT EXISTS tareas_putaway_control (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recepcion_detalle_id UUID NOT NULL REFERENCES ordenes_recepcion_detalle(id) ON DELETE CASCADE,
  articulo_id UUID NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
  lote_id UUID NOT NULL REFERENCES lotes_cliente(id) ON DELETE RESTRICT,
  pallet_id UUID REFERENCES pallets_lpn(id) ON DELETE SET NULL, -- Pallet LPN generado al recibir
  cantidad_recibida NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (cantidad_recibida >= 0),
  volumen_calculado_m3 NUMERIC(14,4) DEFAULT 0.0000 NOT NULL CHECK (volumen_calculado_m3 >= 0),
  ubicacion_origen_id UUID NOT NULL REFERENCES ubicaciones(id) ON DELETE RESTRICT, -- Playa de recepción
  ubicacion_destino_id UUID NOT NULL REFERENCES ubicaciones(id) ON DELETE RESTRICT, -- Rack definitivo
  operador_control_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  estado estado_putaway_enum DEFAULT 'pendiente' NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- MÓDULO D: INVENTARIO POR CLIENTE, LOTE Y ARTÍCULO (M3 VALORIZADO)
-- ==============================================================================

-- D.1 Existencias en Almacén
CREATE TABLE IF NOT EXISTS inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES lotes_cliente(id) ON DELETE RESTRICT,
  articulo_id UUID NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
  almacen_id UUID NOT NULL REFERENCES almacenes(id) ON DELETE RESTRICT,
  ubicacion_id UUID NOT NULL REFERENCES ubicaciones(id) ON DELETE RESTRICT,
  pallet_id UUID REFERENCES pallets_lpn(id) ON DELETE SET NULL, -- LPN opcional (permite bultos sueltos o pallet)
  cantidad_disponible NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (cantidad_disponible >= 0),
  cantidad_reservada NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (cantidad_reservada >= 0),
  volumen_m3 NUMERIC(14,4) DEFAULT 0.0000 NOT NULL CHECK (volumen_m3 >= 0), -- Base de valorización de espacio
  unidad_medida TEXT NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- D.2 Movimientos de Inventario (Kardex Inmutable)
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES lotes_cliente(id) ON DELETE RESTRICT,
  articulo_id UUID NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
  pallet_id UUID REFERENCES pallets_lpn(id) ON DELETE SET NULL,
  ubicacion_origen_id UUID REFERENCES ubicaciones(id) ON DELETE SET NULL,
  ubicacion_destino_id UUID REFERENCES ubicaciones(id) ON DELETE SET NULL,
  tipo_movimiento tipo_movimiento_enum NOT NULL,
  cantidad NUMERIC(14,2) NOT NULL,
  volumen_m3 NUMERIC(14,4) DEFAULT 0.0000 NOT NULL,
  documento_referencia TEXT,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notas TEXT,
  fecha_hora TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- MÓDULO E: PEDIDOS DE SALIDA (OUTBOUND ORDER MANAGEMENT)
-- ==============================================================================

-- E.1 Pedidos de Destinatarios
CREATE TABLE IF NOT EXISTS pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES destinatarios(id) ON DELETE RESTRICT,
  numero_pedido TEXT UNIQUE NOT NULL,
  orden_compra_cliente TEXT,
  fecha_solicitud TIMESTAMPTZ DEFAULT now() NOT NULL,
  fecha_compromiso_entrega TIMESTAMPTZ,
  prioridad prioridad_pedido_enum DEFAULT 'normal' NOT NULL,
  estado estado_pedido_enum DEFAULT 'ingresado' NOT NULL,
  observaciones TEXT,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- E.2 Detalle de Pedidos
CREATE TABLE IF NOT EXISTS pedidos_detalle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  articulo_id UUID NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
  cantidad_solicitada NUMERIC(14,2) NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_reservada NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (cantidad_reservada >= 0),
  cantidad_separada NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (cantidad_separada >= 0)
);

-- E.3 Tareas de Picking (Recolección en Piso)
CREATE TABLE IF NOT EXISTS tareas_picking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  pedido_detalle_id UUID NOT NULL REFERENCES pedidos_detalle(id) ON DELETE CASCADE,
  articulo_id UUID NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
  lote_id UUID NOT NULL REFERENCES lotes_cliente(id) ON DELETE RESTRICT,
  pallet_origen_id UUID REFERENCES pallets_lpn(id) ON DELETE SET NULL,
  ubicacion_origen_id UUID NOT NULL REFERENCES ubicaciones(id) ON DELETE RESTRICT,
  cantidad_a_recolectar NUMERIC(14,2) NOT NULL CHECK (cantidad_a_recolectar > 0),
  cantidad_recolectada NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (cantidad_recolectada >= 0),
  observaciones_picking TEXT, -- Instrucciones especiales de pickeo para el operador
  operador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  estado TEXT DEFAULT 'pendiente' NOT NULL CHECK (estado IN ('pendiente', 'en_curso', 'completada', 'cancelada')),
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- MÓDULO F: SALIDAS, DESPACHOS, REMITOS DE TRÁNSITO Y RUTEO
-- ==============================================================================

-- F.1 Órdenes de Salida (Multi-pedido)
CREATE TABLE IF NOT EXISTS ordenes_salida (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id UUID NOT NULL REFERENCES almacenes(id) ON DELETE RESTRICT,
  numero_orden_salida TEXT UNIQUE NOT NULL,
  fecha_salida_programada TIMESTAMPTZ,
  estado estado_orden_salida_enum DEFAULT 'planificacion' NOT NULL,
  observaciones TEXT,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- F.2 Asociación Órdenes de Salida y Pedidos (N:M)
CREATE TABLE IF NOT EXISTS ordenes_salida_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_salida_id UUID NOT NULL REFERENCES ordenes_salida(id) ON DELETE CASCADE,
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
  CONSTRAINT ordenes_salida_pedidos_uk UNIQUE (orden_salida_id, pedido_id)
);

-- F.3 Paletizado de Despacho (Consolidación a Pallet para Salida)
CREATE TABLE IF NOT EXISTS paletizado_despacho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_salida_id UUID NOT NULL REFERENCES ordenes_salida(id) ON DELETE CASCADE,
  pallet_salida_lpn TEXT NOT NULL,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  total_bultos INTEGER NOT NULL CHECK (total_bultos > 0),
  peso_estimado_kg NUMERIC(12,3) DEFAULT 0.000 NOT NULL CHECK (peso_estimado_kg >= 0),
  volumen_estimado_m3 NUMERIC(12,4) DEFAULT 0.0000 NOT NULL CHECK (volumen_estimado_m3 >= 0),
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- F.4 Remitos Rx de Tránsito
CREATE TABLE IF NOT EXISTS remitos_transito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_salida_id UUID NOT NULL REFERENCES ordenes_salida(id) ON DELETE RESTRICT,
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  destinatario_id UUID NOT NULL REFERENCES destinatarios(id) ON DELETE RESTRICT,
  numero_remito_rx TEXT UNIQUE NOT NULL,
  cae_o_autorizacion_fiscal TEXT,
  fecha_emision TIMESTAMPTZ DEFAULT now() NOT NULL,
  total_bultos INTEGER NOT NULL CHECK (total_bultos >= 0),
  total_pallets INTEGER DEFAULT 0 NOT NULL CHECK (total_pallets >= 0),
  peso_total_kg NUMERIC(12,3) NOT NULL CHECK (peso_total_kg >= 0),
  volumen_total_m3 NUMERIC(14,4) NOT NULL CHECK (volumen_total_m3 >= 0), -- M3
  valor_declarado_total NUMERIC(14,2) NOT NULL CHECK (valor_declarado_total >= 0),
  estado estado_remito_enum DEFAULT 'emitido' NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- F.5 Rutas de Entrega
CREATE TABLE IF NOT EXISTS rutas_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_salida_id UUID NOT NULL REFERENCES ordenes_salida(id) ON DELETE CASCADE,
  codigo_ruta TEXT UNIQUE NOT NULL,
  transporte_empresa TEXT NOT NULL,
  vehiculo_patente TEXT NOT NULL,
  tipo_vehiculo TEXT,
  chofer_nombre TEXT NOT NULL,
  chofer_documento TEXT,
  chofer_telefono TEXT,
  fecha_hora_salida_estimada TIMESTAMPTZ,
  fecha_hora_salida_real TIMESTAMPTZ,
  estado estado_ruta_enum DEFAULT 'programada' NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- F.6 Paradas del Itinerario por Unidad de Transporte
CREATE TABLE IF NOT EXISTS rutas_paradas_itinerario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta_id UUID NOT NULL REFERENCES rutas_entrega(id) ON DELETE CASCADE,
  secuencia_parada INTEGER NOT NULL CHECK (secuencia_parada > 0),
  destinatario_id UUID NOT NULL REFERENCES destinatarios(id) ON DELETE RESTRICT,
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
  remito_id UUID REFERENCES remitos_transito(id) ON DELETE SET NULL,
  hora_estimada_arribo TIMESTAMPTZ,
  hora_real_arribo TIMESTAMPTZ,
  estado_entrega estado_parada_enum DEFAULT 'pendiente' NOT NULL,
  observaciones TEXT,
  CONSTRAINT rutas_paradas_secuencia_uk UNIQUE (ruta_id, secuencia_parada)
);

-- ==============================================================================
-- 4. ÍNDICES EN TODAS LAS CLAVES FORÁNEAS (Regla schema-foreign-key-indexes)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_destinatarios_cliente ON destinatarios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_subcategorias_categoria ON subcategorias_articulos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_articulos_cliente ON articulos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_articulos_categoria ON articulos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_articulos_subcategoria ON articulos(subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_articulos_codigo_barras ON articulos(codigo_barras);

CREATE INDEX IF NOT EXISTS idx_zonas_almacen ON zonas(almacen_id);
CREATE INDEX IF NOT EXISTS idx_ubicaciones_almacen ON ubicaciones(almacen_id);
CREATE INDEX IF NOT EXISTS idx_ubicaciones_zona ON ubicaciones(zona_id);
CREATE INDEX IF NOT EXISTS idx_ubicaciones_codigo_etiqueta ON ubicaciones(codigo_etiqueta);

CREATE INDEX IF NOT EXISTS idx_lotes_cliente_cliente ON lotes_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pallets_lpn_cliente ON pallets_lpn(cliente_id);

CREATE INDEX IF NOT EXISTS idx_ordenes_recepcion_cliente ON ordenes_recepcion(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_recepcion_almacen ON ordenes_recepcion(almacen_id);
CREATE INDEX IF NOT EXISTS idx_recepcion_detalle_recepcion ON ordenes_recepcion_detalle(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_recepcion_detalle_articulo ON ordenes_recepcion_detalle(articulo_id);
CREATE INDEX IF NOT EXISTS idx_recepcion_detalle_ubicacion ON ordenes_recepcion_detalle(ubicacion_sugerida_id);

CREATE INDEX IF NOT EXISTS idx_putaway_recepcion_detalle ON tareas_putaway_control(recepcion_detalle_id);
CREATE INDEX IF NOT EXISTS idx_putaway_articulo ON tareas_putaway_control(articulo_id);
CREATE INDEX IF NOT EXISTS idx_putaway_lote ON tareas_putaway_control(lote_id);
CREATE INDEX IF NOT EXISTS idx_putaway_pallet ON tareas_putaway_control(pallet_id);
CREATE INDEX IF NOT EXISTS idx_putaway_ubicacion_origen ON tareas_putaway_control(ubicacion_origen_id);
CREATE INDEX IF NOT EXISTS idx_putaway_ubicacion_destino ON tareas_putaway_control(ubicacion_destino_id);
CREATE INDEX IF NOT EXISTS idx_putaway_operador ON tareas_putaway_control(operador_control_id);

CREATE INDEX IF NOT EXISTS idx_inventario_cliente ON inventario(cliente_id);
CREATE INDEX IF NOT EXISTS idx_inventario_lote ON inventario(lote_id);
CREATE INDEX IF NOT EXISTS idx_inventario_articulo ON inventario(articulo_id);
CREATE INDEX IF NOT EXISTS idx_inventario_almacen ON inventario(almacen_id);
CREATE INDEX IF NOT EXISTS idx_inventario_ubicacion ON inventario(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_inventario_pallet ON inventario(pallet_id);

CREATE INDEX IF NOT EXISTS idx_movimientos_cliente ON movimientos_inventario(cliente_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_lote ON movimientos_inventario(lote_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_articulo ON movimientos_inventario(articulo_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_pallet ON movimientos_inventario(pallet_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_ubicacion_origen ON movimientos_inventario(ubicacion_origen_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_ubicacion_destino ON movimientos_inventario(ubicacion_destino_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_usuario ON movimientos_inventario(usuario_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_destinatario ON pedidos(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_pedido ON pedidos_detalle(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_articulo ON pedidos_detalle(articulo_id);

CREATE INDEX IF NOT EXISTS idx_picking_pedido ON tareas_picking(pedido_id);
CREATE INDEX IF NOT EXISTS idx_picking_pedido_detalle ON tareas_picking(pedido_detalle_id);
CREATE INDEX IF NOT EXISTS idx_picking_articulo ON tareas_picking(articulo_id);
CREATE INDEX IF NOT EXISTS idx_picking_lote ON tareas_picking(lote_id);
CREATE INDEX IF NOT EXISTS idx_picking_pallet_origen ON tareas_picking(pallet_origen_id);
CREATE INDEX IF NOT EXISTS idx_picking_ubicacion_origen ON tareas_picking(ubicacion_origen_id);
CREATE INDEX IF NOT EXISTS idx_picking_operador ON tareas_picking(operador_id);

CREATE INDEX IF NOT EXISTS idx_ordenes_salida_almacen ON ordenes_salida(almacen_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_salida_pedidos_salida ON ordenes_salida_pedidos(orden_salida_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_salida_pedidos_pedido ON ordenes_salida_pedidos(pedido_id);

CREATE INDEX IF NOT EXISTS idx_paletizado_despacho_orden ON paletizado_despacho(orden_salida_id);
CREATE INDEX IF NOT EXISTS idx_paletizado_despacho_pedido ON paletizado_despacho(pedido_id);

CREATE INDEX IF NOT EXISTS idx_remitos_orden_salida ON remitos_transito(orden_salida_id);
CREATE INDEX IF NOT EXISTS idx_remitos_pedido ON remitos_transito(pedido_id);
CREATE INDEX IF NOT EXISTS idx_remitos_cliente ON remitos_transito(cliente_id);
CREATE INDEX IF NOT EXISTS idx_remitos_destinatario ON remitos_transito(destinatario_id);

CREATE INDEX IF NOT EXISTS idx_rutas_entrega_orden_salida ON rutas_entrega(orden_salida_id);
CREATE INDEX IF NOT EXISTS idx_rutas_paradas_ruta ON rutas_paradas_itinerario(ruta_id);
CREATE INDEX IF NOT EXISTS idx_rutas_paradas_destinatario ON rutas_paradas_itinerario(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_rutas_paradas_pedido ON rutas_paradas_itinerario(pedido_id);
CREATE INDEX IF NOT EXISTS idx_rutas_paradas_remito ON rutas_paradas_itinerario(remito_id);

-- ==============================================================================
-- 5. TRIGGERS DE ACTUALIZACIÓN DE TIMESTAMP
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clientes_actualizado_en') THEN
    CREATE TRIGGER trg_clientes_actualizado_en BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_destinatarios_actualizado_en') THEN
    CREATE TRIGGER trg_destinatarios_actualizado_en BEFORE UPDATE ON destinatarios FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_articulos_actualizado_en') THEN
    CREATE TRIGGER trg_articulos_actualizado_en BEFORE UPDATE ON articulos FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ordenes_recepcion_actualizado_en') THEN
    CREATE TRIGGER trg_ordenes_recepcion_actualizado_en BEFORE UPDATE ON ordenes_recepcion FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_putaway_actualizado_en') THEN
    CREATE TRIGGER trg_putaway_actualizado_en BEFORE UPDATE ON tareas_putaway_control FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_inventario_actualizado_en') THEN
    CREATE TRIGGER trg_inventario_actualizado_en BEFORE UPDATE ON inventario FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pedidos_actualizado_en') THEN
    CREATE TRIGGER trg_pedidos_actualizado_en BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ordenes_salida_actualizado_en') THEN
    CREATE TRIGGER trg_ordenes_salida_actualizado_en BEFORE UPDATE ON ordenes_salida FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
  END IF;
END $$;

-- ==============================================================================
-- 6. SEGURIDAD ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_articulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategorias_articulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE articulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE almacenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE zonas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ubicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE pallets_lpn ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_recepcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_recepcion_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas_putaway_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas_picking ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_salida ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_salida_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE paletizado_despacho ENABLE ROW LEVEL SECURITY;
ALTER TABLE remitos_transito ENABLE ROW LEVEL SECURITY;
ALTER TABLE rutas_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE rutas_paradas_itinerario ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas iniciales para usuarios autenticados del sistema interno (operadores/supervisores)
-- aplicando el patrón optimizado (SELECT auth.uid()) de Supabase
CREATE POLICY clientes_auth_all ON clientes TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY destinatarios_auth_all ON destinatarios TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY categorias_auth_all ON categorias_articulos TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY subcategorias_auth_all ON subcategorias_articulos TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY articulos_auth_all ON articulos TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY almacenes_auth_all ON almacenes TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY zonas_auth_all ON zonas TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY ubicaciones_auth_all ON ubicaciones TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY lotes_auth_all ON lotes_cliente TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY pallets_auth_all ON pallets_lpn TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY recepcion_auth_all ON ordenes_recepcion TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY recepcion_det_auth_all ON ordenes_recepcion_detalle TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY putaway_auth_all ON tareas_putaway_control TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY inventario_auth_all ON inventario TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY movimientos_auth_all ON movimientos_inventario TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY pedidos_auth_all ON pedidos TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY pedidos_det_auth_all ON pedidos_detalle TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY picking_auth_all ON tareas_picking TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY salidas_auth_all ON ordenes_salida TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY salidas_pedidos_auth_all ON ordenes_salida_pedidos TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY paletizado_auth_all ON paletizado_despacho TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY remitos_auth_all ON remitos_transito TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY rutas_auth_all ON rutas_entrega TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY paradas_auth_all ON rutas_paradas_itinerario TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
