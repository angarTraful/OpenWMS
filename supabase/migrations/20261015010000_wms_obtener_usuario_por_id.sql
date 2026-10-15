-- ==============================================================================
-- OPENWMS 3PL - RPC Y ENDPOINT SUPABASE: OBTENER USUARIO POR ID
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. PROCEDIMIENTO RPC PRINCIPAL: wms_obtener_usuario_por_id (TEXT)
-- Devuelve el objeto JSONB completo del usuario y sus roles a partir de su ID (UUID).
-- Admite:
--   - UUID en formato string o UUID nativo
--   - Objeto JSON que contenga 'usuario_id' o 'id'
--   - Parámetro opcional p_solo_activos (por defecto false)
CREATE OR REPLACE FUNCTION public.wms_obtener_usuario_por_id(
  p_usuario_id TEXT,
  p_solo_activos BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw TEXT := TRIM(COALESCE(p_usuario_id, ''));
  v_uuid UUID;
  v_usuario public.usuarios%ROWTYPE;
  v_roles JSONB;
BEGIN
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  -- Si viene en formato JSON string: ej. {"usuario_id":"uuid"} o {"id":"uuid"}
  IF v_raw LIKE '{%}' THEN
    BEGIN
      v_raw := COALESCE(
        v_raw::JSONB ->> 'usuario_id',
        v_raw::JSONB ->> 'usuarioId',
        v_raw::JSONB ->> 'id',
        v_raw::JSONB ->> 'p_usuario_id',
        ''
      );
      v_raw := TRIM(v_raw);
    EXCEPTION WHEN OTHERS THEN
      -- Mantener v_raw tal cual si falla el parseo json
    END;
  END IF;

  -- Validar formato UUID
  IF NOT (v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' ) THEN
    RETURN NULL;
  END IF;

  v_uuid := v_raw::UUID;

  -- Consultar usuario
  SELECT * INTO v_usuario
  FROM public.usuarios
  WHERE id = v_uuid
    AND (NOT COALESCE(p_solo_activos, false) OR activo = true)
  LIMIT 1;

  IF v_usuario.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Obtener roles asignados
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'rol_nombre', r.rol_nombre,
        'tipo_rol', r.tipo_rol,
        'activo', r.activo
      )
    ),
    '[]'::JSONB
  )
  INTO v_roles
  FROM public.usuarios_roles ur
  JOIN public.roles r ON r.id = ur.rol_id
  WHERE ur.usuario_id = v_usuario.id;

  -- Retornar el usuario en JSON
  RETURN jsonb_build_object(
    'id', v_usuario.id,
    'nombre_usuario', v_usuario.nombre_usuario,
    'telefono', v_usuario.telefono,
    'email', v_usuario.email,
    'clientes_ids', v_usuario.clientes_ids,
    'fecha_ultimo_acceso_bot', v_usuario.fecha_ultimo_acceso_bot,
    'FechaUltimoAccesoBot', v_usuario."FechaUltimoAccesoBot",
    'activo', v_usuario.activo,
    'creado_en', v_usuario.creado_en,
    'actualizado_en', v_usuario.actualizado_en,
    'roles', v_roles
  );
END;
$$;

-- 2. SOBRECARGA PARA UUID NATIVO
CREATE OR REPLACE FUNCTION public.wms_obtener_usuario_por_id(
  p_usuario_id UUID,
  p_solo_activos BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_usuario_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.wms_obtener_usuario_por_id(p_usuario_id::TEXT, p_solo_activos);
END;
$$;

-- 3. ALIAS DIRECTOS SIN PREFIJO: obtener_usuario_por_id
CREATE OR REPLACE FUNCTION public.obtener_usuario_por_id(
  p_usuario_id TEXT,
  p_solo_activos BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_obtener_usuario_por_id(p_usuario_id, p_solo_activos);
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_usuario_por_id(
  p_usuario_id UUID,
  p_solo_activos BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_obtener_usuario_por_id(p_usuario_id::TEXT, p_solo_activos);
END;
$$;

-- 4. PERMISOS DE EJECUCIÓN PARA ROLES ANÓNIMO, AUTENTICADO Y SERVICIO
GRANT EXECUTE ON FUNCTION public.wms_obtener_usuario_por_id(TEXT, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_obtener_usuario_por_id(UUID, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_usuario_por_id(TEXT, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_usuario_por_id(UUID, BOOLEAN) TO anon, authenticated, service_role;
