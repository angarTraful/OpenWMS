-- Añadir campos extendidos a la tabla maestra de artículos (SKUs / Ficha Producto)
ALTER TABLE IF EXISTS articulos
  ADD COLUMN IF NOT EXISTS id_producto TEXT,
  ADD COLUMN IF NOT EXISTS marca_bulto TEXT,
  ADD COLUMN IF NOT EXISTS ean13 TEXT,
  ADD COLUMN IF NOT EXISTS tipo_empaque TEXT,
  ADD COLUMN IF NOT EXISTS cantidad_por_pallet INTEGER,
  ADD COLUMN IF NOT EXISTS peso_gw NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS medida_m3 NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS factor_estiba NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS item_so TEXT,
  ADD COLUMN IF NOT EXISTS imagen_url TEXT;

COMMENT ON COLUMN articulos.id_producto IS 'ID o Código Único de Producto asignado por el Cliente / ERP';
COMMENT ON COLUMN articulos.marca_bulto IS 'Marca o rotulado visible en el bulto / caja externa';
COMMENT ON COLUMN articulos.ean13 IS 'Código EAN13 de unidad de venta o código secundario';
COMMENT ON COLUMN articulos.tipo_empaque IS 'Tipo de embalaje exterior (Caja, Atado, Bulto, Rollo, Tambor)';
COMMENT ON COLUMN articulos.factor_estiba IS 'Porcentaje de eficiencia o factor de estiba en almacenaje';
COMMENT ON COLUMN articulos.item_so IS 'Código de Item en Orden de Pedido / Sales Order del cliente';
