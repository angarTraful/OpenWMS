-- ==============================================================================
-- Migración: Campos extendidos y ficha logística completa de Artículos
-- Soporta: ID_Producto, Cliente, Nombre_producto, Descripcion, Color, Categoria,
-- SubCategoria, Marca de Bulto, EAN13, TipoEmpaque, UnidadMedida, UnidadesXbulto,
-- CantidadXpallet, PesoGW, MedidaM3, Factor Estiba %
-- ==============================================================================

ALTER TABLE public.articulos
  ADD COLUMN IF NOT EXISTS id_producto TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS marca_bulto TEXT,
  ADD COLUMN IF NOT EXISTS ean13 TEXT,
  ADD COLUMN IF NOT EXISTS tipo_empaque TEXT DEFAULT 'caja',
  ADD COLUMN IF NOT EXISTS cantidad_por_pallet NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS peso_gw NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medida_m3 NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS factor_estiba NUMERIC DEFAULT 0;

-- Sincronizar datos históricos
UPDATE public.articulos
SET
  id_producto = COALESCE(id_producto, sku),
  ean13 = COALESCE(ean13, codigo_barras),
  peso_gw = COALESCE(peso_gw, peso_unitario_kg, 0),
  medida_m3 = COALESCE(medida_m3, volumen_unitario_m3, 0),
  cantidad_por_pallet = COALESCE(cantidad_por_pallet, bultos_por_pallet, 1);

-- Trigger para sincronización bidireccional entre nombres legacy y extendidos
CREATE OR REPLACE FUNCTION public.trg_articulos_sync_aliases()
RETURNS TRIGGER AS $$
BEGIN
  -- ID_Producto <-> sku
  IF NEW.id_producto IS NOT NULL AND (NEW.sku IS NULL OR NEW.sku = '') THEN
    NEW.sku := NEW.id_producto;
  ELSIF NEW.sku IS NOT NULL AND (NEW.id_producto IS NULL OR NEW.id_producto = '') THEN
    NEW.id_producto := NEW.sku;
  END IF;

  -- EAN13 <-> codigo_barras
  IF NEW.ean13 IS NOT NULL AND (NEW.codigo_barras IS NULL OR NEW.codigo_barras = '') THEN
    NEW.codigo_barras := NEW.ean13;
  ELSIF NEW.codigo_barras IS NOT NULL AND (NEW.ean13 IS NULL OR NEW.ean13 = '') THEN
    NEW.ean13 := NEW.codigo_barras;
  END IF;

  -- PesoGW <-> peso_unitario_kg
  IF NEW.peso_gw IS NOT NULL AND (NEW.peso_unitario_kg IS NULL OR NEW.peso_unitario_kg = 0) THEN
    NEW.peso_unitario_kg := NEW.peso_gw;
  ELSIF NEW.peso_unitario_kg IS NOT NULL AND (NEW.peso_gw IS NULL OR NEW.peso_gw = 0) THEN
    NEW.peso_gw := NEW.peso_unitario_kg;
  END IF;

  -- MedidaM3 <-> volumen_unitario_m3
  IF NEW.medida_m3 IS NOT NULL AND (NEW.volumen_unitario_m3 IS NULL OR NEW.volumen_unitario_m3 = 0) THEN
    NEW.volumen_unitario_m3 := NEW.medida_m3;
  ELSIF NEW.volumen_unitario_m3 IS NOT NULL AND (NEW.medida_m3 IS NULL OR NEW.medida_m3 = 0) THEN
    NEW.medida_m3 := NEW.volumen_unitario_m3;
  END IF;

  -- CantidadXpallet <-> bultos_por_pallet
  IF NEW.cantidad_por_pallet IS NOT NULL AND (NEW.bultos_por_pallet IS NULL OR NEW.bultos_por_pallet = 0) THEN
    NEW.bultos_por_pallet := NEW.cantidad_por_pallet::integer;
  ELSIF NEW.bultos_por_pallet IS NOT NULL AND (NEW.cantidad_por_pallet IS NULL OR NEW.cantidad_por_pallet = 0) THEN
    NEW.cantidad_por_pallet := NEW.bultos_por_pallet;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articulos_sync_fields ON public.articulos;
CREATE TRIGGER trg_articulos_sync_fields
BEFORE INSERT OR UPDATE ON public.articulos
FOR EACH ROW
EXECUTE FUNCTION public.trg_articulos_sync_aliases();
