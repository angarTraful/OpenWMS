-- ==============================================================================
-- OPENWMS 3PL - SCRIPT DE LIMPIEZA DE DATOS DE PRUEBA (REINICIO A CERO)
-- Archivo: supabase/migrations/reset_test_data.sql
-- ==============================================================================
-- Instrucciones: Ejecutar este script en el Editor SQL del Panel de Supabase
-- para vaciar todas las transacciones de prueba sin romper la estructura de tablas ni relaciones.

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

COMMIT;

-- Confirmación de reinicio limpio
SELECT 'Base de datos reiniciada con éxito. Todos los movimientos transaccionales de prueba fueron vaciados.' AS estado;
