-- Migración: Agregar total_articulos y trigger de actualización en ordenes_recepcion
ALTER TABLE public.ordenes_recepcion ADD COLUMN IF NOT EXISTS total_articulos NUMERIC DEFAULT 0;

-- Recalcular totales existentes
UPDATE public.ordenes_recepcion r
SET total_articulos = COALESCE((
  SELECT SUM(d.cantidad_esperada) 
  FROM public.ordenes_recepcion_detalle d 
  WHERE d.recepcion_id = r.id
), 0);

-- Trigger para mantener actualizado total_articulos
CREATE OR REPLACE FUNCTION public.trg_actualizar_total_articulos_recepcion()
RETURNS TRIGGER AS $$
DECLARE
  v_recepcion_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_recepcion_id := OLD.recepcion_id;
  ELSE
    v_recepcion_id := NEW.recepcion_id;
  END IF;

  UPDATE public.ordenes_recepcion
  SET total_articulos = COALESCE((
    SELECT SUM(cantidad_esperada)
    FROM public.ordenes_recepcion_detalle
    WHERE recepcion_id = v_recepcion_id
  ), 0)
  WHERE id = v_recepcion_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actualizar_total_articulos ON public.ordenes_recepcion_detalle;
CREATE TRIGGER trg_actualizar_total_articulos
AFTER INSERT OR UPDATE OR DELETE ON public.ordenes_recepcion_detalle
FOR EACH ROW EXECUTE FUNCTION public.trg_actualizar_total_articulos_recepcion();
