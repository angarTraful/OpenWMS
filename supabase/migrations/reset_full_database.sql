-- ==============================================================================
-- OPENWMS 3PL - SCRIPT DE LIMPIEZA TOTAL (INCLUYE MAESTROS DE CLIENTES Y ARTÍCULOS)
-- Archivo: supabase/migrations/reset_full_database.sql
-- ==============================================================================
-- Instrucciones: Ejecutar este script en el Editor SQL del Panel de Supabase
-- para borrar absolutamente todos los datos (Transacciones + Maestros) y dejar el WMS 100% limpio.

BEGIN;

-- 1. Vaciar Tablas Opcionales / Nuevas (Si existen)
DROP TABLE IF EXISTS remitos_romaneo_excepciones CASCADE;
DROP TABLE IF EXISTS ordenes_recepcion_romaneo_excepciones CASCADE;
DROP TABLE IF EXISTS ordenes_recepcion_recursos CASCADE;

-- 2. Vaciar Transacciones y Movimientos de Salida / Outbound (Nombres exactos del esquema)
TRUNCATE TABLE rutas_paradas_itinerario CASCADE;
TRUNCATE TABLE rutas_entrega CASCADE;
TRUNCATE TABLE remitos_transito CASCADE;
TRUNCATE TABLE paletizado_despacho CASCADE;
TRUNCATE TABLE ordenes_salida_pedidos CASCADE;
TRUNCATE TABLE ordenes_salida CASCADE;
TRUNCATE TABLE tareas_picking CASCADE;
TRUNCATE TABLE pedidos_detalle CASCADE;
TRUNCATE TABLE pedidos CASCADE;

-- 3. Vaciar Transacciones e Ingesta de Entrada / Inbound
TRUNCATE TABLE tareas_putaway_control CASCADE;
TRUNCATE TABLE ordenes_recepcion_detalle CASCADE;
TRUNCATE TABLE ordenes_recepcion CASCADE;

-- 4. Vaciar Inventario y Trazabilidad Físico
TRUNCATE TABLE movimientos_inventario CASCADE;
TRUNCATE TABLE inventario CASCADE;
TRUNCATE TABLE pallets_lpn CASCADE;

-- 5. Vaciar Catálogos Maestros
TRUNCATE TABLE articulos CASCADE;
TRUNCATE TABLE subcategorias_articulos CASCADE;
TRUNCATE TABLE categorias_articulos CASCADE;
TRUNCATE TABLE destinatarios CASCADE;
TRUNCATE TABLE clientes CASCADE;

COMMIT;

-- Confirmación de reinicio total
SELECT 'Limpieza Total completada. Se han vaciado las transacciones, inventarios y catálogos maestros de Clientes, Artículos y Destinatarios.' AS estado;
