-- Migration: Add generated alias columns for backward compatibility with database views
-- Prevents errors on database views expecting volumen_unitario_m3, peso_unitario_kg, etc.

ALTER TABLE public.articulos
  ADD COLUMN IF NOT EXISTS volumen_unitario_m3 numeric GENERATED ALWAYS AS (medida_m3) STORED,
  ADD COLUMN IF NOT EXISTS peso_unitario_kg numeric GENERATED ALWAYS AS (peso_gw) STORED,
  ADD COLUMN IF NOT EXISTS codigo_barras text GENERATED ALWAYS AS (ean13) STORED,
  ADD COLUMN IF NOT EXISTS bultos_por_pallet numeric GENERATED ALWAYS AS (cantidad_por_pallet) STORED;
