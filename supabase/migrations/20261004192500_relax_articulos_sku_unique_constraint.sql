-- Flexibilizar la restricción UNIQUE de SKU por cliente
-- Permite que los clientes puedan subir SKUs repetidos o correlativos genéricos (ej: 1, 2, 3),
-- utilizando `id_producto` como clave única principal del producto por cliente.

ALTER TABLE articulos DROP CONSTRAINT IF EXISTS articulos_cliente_sku_uk;

-- Crear un índice único opcional por (cliente_id, id_producto) cuando id_producto no sea nulo
DROP INDEX IF EXISTS articulos_cliente_id_producto_uk;
CREATE UNIQUE INDEX articulos_cliente_id_producto_uk 
  ON articulos (cliente_id, id_producto) 
  WHERE id_producto IS NOT NULL AND id_producto <> '';
