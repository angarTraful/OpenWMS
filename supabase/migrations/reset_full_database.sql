-- ==============================================================================
-- OPENWMS 3PL - SCRIPT DE LIMPIEZA TOTAL (INCLUYE MAESTROS DE CLIENTES Y ARTÍCULOS)
-- Archivo: supabase/migrations/reset_full_database.sql
-- ==============================================================================
-- Instrucciones: Ejecutar este script en el Editor SQL del Panel de Supabase
-- para borrar absolutamente todos los datos (Transacciones + Maestros) y dejar el WMS 100% limpio.

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

-- 3. Vaciar Inventario, Trazabilidad LPN y Kardex Físico
TRUNCATE TABLE kardex_movimientos CASCADE;
TRUNCATE TABLE trazabilidad_lpn CASCADE;
TRUNCATE TABLE inventario CASCADE;

-- 4. Vaciar Maestros y Configuración Base (Catálogo Completo)
TRUNCATE TABLE articulos CASCADE;
TRUNCATE TABLE categorias CASCADE;
TRUNCATE TABLE destinatarios CASCADE;
TRUNCATE TABLE clientes CASCADE;

COMMIT;

-- Confirmación de reinicio total
SELECT 'Limpieza Total completada. Se han vaciado las transacciones, inventarios y catálogos maestros de Clientes, Artículos y Destinatarios.' AS estado;
