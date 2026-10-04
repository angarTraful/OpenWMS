-- Migration: Restore alias columns with auto-sync trigger for full view compatibility
-- Fixes "column articulos_1.volumen_unitario_m3 does not exist" in database views

-- 1. Re-crear columnas físicas de compatibilidad
ALTER TABLE public.articulos 
  ADD COLUMN IF NOT EXISTS volumen_unitario_m3 numeric(12, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS peso_unitario_kg numeric(12, 3) DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS codigo_barras text NULL,
  ADD COLUMN IF NOT EXISTS bultos_por_pallet integer DEFAULT 1;

-- 2. Trigger para mantener sincronizados los valores en ambos sentidos automáticamente
CREATE OR REPLACE FUNCTION trg_articulos_sync_aliases()
RETURNS TRIGGER AS $$
BEGIN
  -- EAN13 & Codigo Barras
  IF NEW.ean13 IS NOT NULL AND NEW.ean13 <> '' THEN
    NEW.codigo_barras := NEW.ean13;
  ELSIF NEW.codigo_barras IS NOT NULL AND NEW.codigo_barras <> '' THEN
    NEW.ean13 := NEW.codigo_barras;
  END IF;

  -- Peso GW & Peso Unitario
  IF NEW.peso_gw IS NOT NULL AND NEW.peso_gw > 0 THEN
    NEW.peso_unitario_kg := NEW.peso_gw;
  ELSIF NEW.peso_unitario_kg IS NOT NULL AND NEW.peso_unitario_kg > 0 THEN
    NEW.peso_gw := NEW.peso_unitario_kg;
  END IF;

  -- Medida M3 & Volumen Unitario M3
  IF NEW.medida_m3 IS NOT NULL AND NEW.medida_m3 > 0 THEN
    NEW.volumen_unitario_m3 := NEW.medida_m3;
  ELSIF NEW.volumen_unitario_m3 IS NOT NULL AND NEW.volumen_unitario_m3 > 0 THEN
    NEW.medida_m3 := NEW.volumen_unitario_m3;
  END IF;

  -- Cantidad por Pallet & Bultos por Pallet
  IF NEW.cantidad_por_pallet IS NOT NULL AND NEW.cantidad_por_pallet > 0 THEN
    NEW.bultos_por_pallet := GREATEST(1, ROUND(NEW.cantidad_por_pallet)::INTEGER);
  ELSIF NEW.bultos_por_pallet IS NOT NULL AND NEW.bultos_por_pallet > 0 THEN
    NEW.cantidad_por_pallet := NEW.bultos_por_pallet;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articulos_sync_fields ON public.articulos;
CREATE TRIGGER trg_articulos_sync_fields
BEFORE INSERT OR UPDATE ON public.articulos
FOR EACH ROW
EXECUTE FUNCTION trg_articulos_sync_aliases();
