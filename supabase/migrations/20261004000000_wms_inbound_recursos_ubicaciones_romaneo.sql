-- ==============================================================================
-- OPENWMS 3PL - Módulo de Recursos en Recepción, Romaneo por Excepción y Ubicaciones Flexibles
-- Migración: 20261004000000_wms_inbound_recursos_ubicaciones_romaneo.sql
-- ==============================================================================

-- 1. TABLA DE RECURSOS UTILIZADOS EN RECEPCIÓN / DESCARGA
CREATE TABLE IF NOT EXISTS ordenes_recepcion_recursos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recepcion_id UUID NOT NULL REFERENCES ordenes_recepcion(id) ON DELETE CASCADE,
  tipo_recurso TEXT NOT NULL, -- ej: 'personal_tercerizado', 'horas_extras', 'autoelevador_especial', 'cuadrilla_descarga'
  descripcion TEXT, -- ej: 'Descarga fuera de hora - 3 operarios'
  unidad_medida TEXT NOT NULL DEFAULT 'horas', -- 'horas', 'cantidad', 'servicio', 'bultos'
  cantidad NUMERIC(12, 2) NOT NULL DEFAULT 1.00 CHECK (cantidad > 0),
  costo_unitario NUMERIC(12, 2) DEFAULT 0.00 CHECK (costo_unitario >= 0),
  costo_total NUMERIC(12, 2) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED,
  incluido_en_tarifario BOOLEAN DEFAULT false NOT NULL,
  proveedor_servicio TEXT, -- ej: 'Personal Tercerizado S.A.'
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. TABLA DE EXCEPCIONES DE ROMANEO EN RECEPCIÓN (ROLLOS NO ESTÁNDAR)
CREATE TABLE IF NOT EXISTS ordenes_recepcion_romaneo_excepciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recepcion_id UUID NOT NULL REFERENCES ordenes_recepcion(id) ON DELETE CASCADE,
  recepcion_detalle_id UUID REFERENCES ordenes_recepcion_detalle(id) ON DELETE CASCADE,
  articulo_id UUID NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
  nro_secuencia INTEGER NOT NULL, -- Nro de rollo / bulto dentro del lote no estándar
  codigo_etiqueta_lpn TEXT, -- Código de barra único impreso en Brother QL-820NWB
  medida_estandar NUMERIC(12, 2) NOT NULL CHECK (medida_estandar > 0), -- ej: 50.00 (mts / kg)
  medida_real NUMERIC(12, 2) NOT NULL CHECK (medida_real > 0), -- ej: 54.00 (mts / kg)
  unidad_medida TEXT NOT NULL DEFAULT 'mts', -- 'mts' o 'kg'
  diferencia NUMERIC(12, 2) GENERATED ALWAYS AS (medida_real - medida_estandar) STORED,
  observaciones TEXT,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. TABLA DE ROMANEO DE SALIDA / REVERSO DEL REMITO
CREATE TABLE IF NOT EXISTS remitos_romaneo_excepciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  orden_salida_id UUID REFERENCES ordenes_salida(id) ON DELETE CASCADE,
  articulo_id UUID NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
  nro_secuencia INTEGER NOT NULL,
  codigo_etiqueta_lpn TEXT,
  medida_estandar NUMERIC(12, 2) NOT NULL CHECK (medida_estandar > 0),
  medida_real NUMERIC(12, 2) NOT NULL CHECK (medida_real > 0),
  unidad_medida TEXT NOT NULL DEFAULT 'mts',
  es_estandar BOOLEAN DEFAULT false NOT NULL, -- True si es un rollo estándar impreso en reverso, False si es excepción
  imprimir_en_reverso BOOLEAN DEFAULT true NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. UBICACIONES FLEXIBLES (PERMITIR AUTOESTIBA EN ZONAS SIN RACK OBLIGATORIO)
ALTER TABLE zonas ADD COLUMN IF NOT EXISTS es_autoestiba_piso BOOLEAN DEFAULT false NOT NULL;

-- Permitir ubicacion_id nulo en inventario cuando se almacena en zonas de autoestiba al piso
ALTER TABLE inventario ALTER COLUMN ubicacion_id DROP NOT NULL;
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS zona_id UUID REFERENCES zonas(id) ON DELETE RESTRICT;

-- INDEXES PARA OPTIMIZACIÓN
CREATE INDEX IF NOT EXISTS idx_recursos_recepcion ON ordenes_recepcion_recursos(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_romaneo_excepciones_recepcion ON ordenes_recepcion_romaneo_excepciones(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_romaneo_remitos_pedido ON remitos_romaneo_excepciones(pedido_id);
CREATE INDEX IF NOT EXISTS idx_romaneo_remitos_orden_salida ON remitos_romaneo_excepciones(orden_salida_id);

-- RLS POLICIES
ALTER TABLE ordenes_recepcion_recursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_recepcion_romaneo_excepciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE remitos_romaneo_excepciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo a usuarios autenticados y anon en recursos"
ON ordenes_recepcion_recursos FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a usuarios autenticados y anon en romaneo recep"
ON ordenes_recepcion_romaneo_excepciones FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a usuarios autenticados y anon en romaneo remitos"
ON remitos_romaneo_excepciones FOR ALL USING (true) WITH CHECK (true);

-- TRIGGERS DE ACTUALIZADO_EN
CREATE TRIGGER set_actualizado_en_recursos
  BEFORE UPDATE ON ordenes_recepcion_recursos
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

CREATE TRIGGER set_actualizado_en_romaneo_excepciones
  BEFORE UPDATE ON ordenes_recepcion_romaneo_excepciones
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
