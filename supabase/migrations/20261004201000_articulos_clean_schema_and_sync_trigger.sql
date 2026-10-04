-- Migration: Clean articulos schema and maintain sync triggers
-- Description: Ensures alias fields stay automatically synchronized on insert/update in public.articulos

CREATE OR REPLACE FUNCTION trg_articulos_sync_aliases()
RETURNS TRIGGER AS $$
BEGIN
  -- Sincronizar EAN13 y Codigo de Barras
  IF NEW.ean13 IS NOT NULL AND NEW.ean13 <> '' THEN
    NEW.codigo_barras := NEW.ean13;
  ELSIF NEW.codigo_barras IS NOT NULL AND NEW.codigo_barras <> '' THEN
    NEW.ean13 := NEW.codigo_barras;
  END IF;

  -- Sincronizar Peso (peso_gw <-> peso_unitario_kg)
  IF NEW.peso_gw IS NOT NULL AND NEW.peso_gw > 0 THEN
    NEW.peso_unitario_kg := NEW.peso_gw;
  ELSIF NEW.peso_unitario_kg IS NOT NULL AND NEW.peso_unitario_kg > 0 THEN
    NEW.peso_gw := NEW.peso_unitario_kg;
  END IF;

  -- Sincronizar Volumen (medida_m3 <-> volumen_unitario_m3)
  IF NEW.medida_m3 IS NOT NULL AND NEW.medida_m3 > 0 THEN
    NEW.volumen_unitario_m3 := NEW.medida_m3;
  ELSIF NEW.volumen_unitario_m3 IS NOT NULL AND NEW.volumen_unitario_m3 > 0 THEN
    NEW.medida_m3 := NEW.volumen_unitario_m3;
  END IF;

  -- Sincronizar Cantidad Pallet (cantidad_por_pallet <-> bultos_por_pallet)
  IF NEW.cantidad_por_pallet IS NOT NULL AND NEW.cantidad_por_pallet > 0 THEN
    NEW.bultos_por_pallet := GREATEST(1, ROUND(NEW.cantidad_por_pallet)::INTEGER);
  ELSIF NEW.bultos_por_pallet IS NOT NULL AND NEW.bultos_por_pallet > 0 THEN
    NEW.cantidad_por_pallet := NEW.bultos_por_pallet;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Asegurar que el trigger exista
DROP TRIGGER IF EXISTS trg_articulos_sync_fields ON public.articulos;
CREATE TRIGGER trg_articulos_sync_fields
BEFORE INSERT OR UPDATE ON public.articulos
FOR EACH ROW
EXECUTE FUNCTION trg_articulos_sync_aliases();
