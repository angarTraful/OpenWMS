-- Migration: Consolidate and clean public.articulos columns in Supabase
-- Removes redundant alias columns: codigo_barras, bultos_por_pallet, peso_unitario_kg, volumen_unitario_m3

-- 1. Eliminar triggers de alias antiguos
DROP TRIGGER IF EXISTS trg_articulos_sync_fields ON public.articulos;
DROP FUNCTION IF EXISTS trg_articulos_sync_aliases();

-- 2. Eliminar las columnas duplicadas de la tabla
ALTER TABLE public.articulos 
  DROP COLUMN IF EXISTS codigo_barras,
  DROP COLUMN IF EXISTS bultos_por_pallet,
  DROP COLUMN IF EXISTS peso_unitario_kg,
  DROP COLUMN IF EXISTS volumen_unitario_m3;

-- 3. Asegurar valores por defecto limpios en las columnas consolidadas
ALTER TABLE public.articulos
  ALTER COLUMN tipo_empaque SET DEFAULT 'caja',
  ALTER COLUMN unidad_medida SET DEFAULT 'bulto',
  ALTER COLUMN unidades_por_bulto SET DEFAULT 1,
  ALTER COLUMN cantidad_por_pallet SET DEFAULT 1,
  ALTER COLUMN peso_gw SET DEFAULT 0.000,
  ALTER COLUMN medida_m3 SET DEFAULT 0.0000,
  ALTER COLUMN factor_estiba SET DEFAULT 0;
