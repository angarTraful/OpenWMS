-- ==============================================================================
-- Migration: Relación N a M entre Clientes y Destinatarios + Modalidad Pick-up
-- Fecha: 2026-10-05
-- Descripción:
--   1. Permite que 'destinatarios' sea un maestro unificado de bocas de entrega/sucursales.
--   2. Crea la tabla intermedia 'clientes_destinatarios' para habilitar/deshabilitar
--      destinatarios por cliente y diferenciar sucursales propias de destinos comerciales.
--   3. Migra automáticamente los destinatarios existentes a la tabla intermedia.
--   4. Agrega modalidad de entrega ('envio_domicilio' vs 'retiro_deposito') y 
--      almacén de origen a la tabla 'pedidos'.
-- ==============================================================================

-- 1. Desacoplar obligatoriedad de cliente_id directo en destinatarios
ALTER TABLE public.destinatarios 
  ALTER COLUMN cliente_id DROP NOT NULL;

-- 2. Crear tabla intermedia clientes_destinatarios (Muchos a Muchos)
CREATE TABLE IF NOT EXISTS public.clientes_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES public.destinatarios(id) ON DELETE CASCADE,
  activo BOOLEAN DEFAULT true NOT NULL,
  es_sucursal_propia BOOLEAN DEFAULT false NOT NULL,
  alias_cliente TEXT,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT clientes_destinatarios_uk UNIQUE (cliente_id, destinatario_id)
);

-- 3. Índices de optimización para consultas rápidas por cliente
CREATE INDEX IF NOT EXISTS idx_clientes_destinatarios_cliente 
  ON public.clientes_destinatarios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_clientes_destinatarios_destinatario 
  ON public.clientes_destinatarios(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_clientes_destinatarios_activo 
  ON public.clientes_destinatarios(cliente_id, activo);

-- 4. Trigger de actualización automática de timestamp
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clientes_destinatarios_actualizado_en') THEN
    CREATE TRIGGER trg_clientes_destinatarios_actualizado_en 
      BEFORE UPDATE ON public.clientes_destinatarios 
      FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
  END IF;
END $$;

-- 5. Row Level Security (RLS)
ALTER TABLE public.clientes_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clientes_destinatarios_auth_all ON public.clientes_destinatarios;
CREATE POLICY clientes_destinatarios_auth_all 
  ON public.clientes_destinatarios 
  TO authenticated 
  USING ((SELECT auth.uid()) IS NOT NULL) 
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS clientes_destinatarios_anon_all ON public.clientes_destinatarios;
CREATE POLICY clientes_destinatarios_anon_all 
  ON public.clientes_destinatarios 
  TO anon 
  USING (true) 
  WITH CHECK (true);

-- 6. Migrar datos existentes: Asociar cada destinatario existente con su cliente actual
INSERT INTO public.clientes_destinatarios (cliente_id, destinatario_id, activo, es_sucursal_propia)
SELECT cliente_id, id, activo, false
FROM public.destinatarios
WHERE cliente_id IS NOT NULL
ON CONFLICT (cliente_id, destinatario_id) DO NOTHING;

-- 7. Soporte para Modalidad de Entrega (Pick-up en Almacén vs Envío por Flete) en Pedidos
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS modalidad_entrega TEXT DEFAULT 'envio_domicilio' NOT NULL;

-- Permitir destinatario_id nulo si es retiro en depósito puro
ALTER TABLE public.pedidos 
  ALTER COLUMN destinatario_id DROP NOT NULL;

-- Asignar almacén de origen del pedido (para saber desde qué muelle/almacén se retira o despacha)
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS almacen_origen_id UUID REFERENCES public.almacenes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_modalidad_entrega 
  ON public.pedidos(modalidad_entrega);
CREATE INDEX IF NOT EXISTS idx_pedidos_almacen_origen 
  ON public.pedidos(almacen_origen_id);

-- 8. En remitos_transito también flexibilizar destinatario_id si es entrega pick-up directa
ALTER TABLE public.remitos_transito 
  ALTER COLUMN destinatario_id DROP NOT NULL;
