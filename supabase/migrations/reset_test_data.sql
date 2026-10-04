-- ==============================================================================
-- OPENWMS 3PL - SCRIPT DE LIMPIEZA DE DATOS DE PRUEBA (REINICIO A CERO)
-- Archivo: supabase/migrations/reset_test_data.sql
-- ==============================================================================
-- Instrucciones: Ejecutar este script en el Editor SQL del Panel de Supabase
-- para vaciar todas las transacciones de prueba sin romper la estructura de tablas ni relaciones.

BEGIN;

-- 1. Vaciar Transacciones y Movimientos de Salida / Outbound
TRUNCATE TABLE remitos_romaneo_excepciones CASCADE;
TRUNCATE TABLE remitos_rx CASCADE;
TRUNCATE TABLE rutas_despacho_paradas CASCADE;
TRUNCATE TABLE hojas_ruta_despacho CASCADE;
TRUNCATE TABLE ordenes_salida_detalle CASCADE;
TRUNCATE TABLE ordenes_salida CASCADE;
TRUNCATE TABLE tareas_picking CASCADE;
TRUNCATE TABLE pedidos_detalle CASCADE;
TRUNCATE TABLE pedidos CASCADE;

-- 2. Vaciar Transacciones e Ingesta de Entrada / Inbound
TRUNCATE TABLE ordenes_recepcion_romaneo_excepciones CASCADE;
TRUNCATE TABLE ordenes_recepcion_recursos CASCADE;
TRUNCATE TABLE ordenes_recepcion_detalle CASCADE;
TRUNCATE TABLE ordenes_recepcion CASCADE;

-- 3. Vaciar Inventario, Trazabilidad LPN y Kardex Fisico
TRUNCATE TABLE kardex_movimientos CASCADE;
TRUNCATE TABLE trazabilidad_lpn CASCADE;
TRUNCATE TABLE inventario CASCADE;

-- 4. Opcional: Si deseas mantener los maestros de artículos, clientes y depósitos,
-- omite las siguientes líneas. Si deseas limpiar todo salvo la estructura base, descoméntalas:
-- TRUNCATE TABLE articulos CASCADE;
-- TRUNCATE TABLE clientes CASCADE;
-- TRUNCATE TABLE destinatarios CASCADE;

COMMIT;

-- Confirmación de reinicio limpio
SELECT 'Base de datos reiniciada con éxito. Todos los movimientos transaccionales de prueba fueron vaciados.' AS estado;
