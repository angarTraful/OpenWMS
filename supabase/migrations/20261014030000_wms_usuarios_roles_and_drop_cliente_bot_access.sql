-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: ROLES, USUARIOS Y RELACIÓN CON CLIENTES
-- 1. Elimina FechaUltimoAccesoBot de Clientes
-- 2. Crea tabla de Roles con TipoRol enum
-- 3. Crea tabla de Usuarios con ClientesIds ('000' = Todos) y FechaUltimoAccesoBot
-- 4. Crea tabla intermedia usuarios_roles
-- 5. Procedimientos RPC actualizados para Usuarios
-- ==============================================================================

-- 1. ELIMINAR CAMPOS DE ACCESO BOT DE LA TABLA CLIENTES
DROP TRIGGER IF EXISTS trg_clientes_bot_access_sync ON public.clientes;
DROP FUNCTION IF EXISTS public.trg_clientes_sync_bot_access();

ALTER TABLE public.clientes 
  DROP COLUMN IF EXISTS "FechaUltimoAccesoBot",
  DROP COLUMN IF EXISTS fecha_ultimo_acceso_bot;

-- 2. ENUM Y TABLA DE ROLES
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_rol_enum') THEN
    CREATE TYPE public.tipo_rol_enum AS ENUM (
      'admin',
      'operador',
      'supervisor',
      'cliente',
      'chofer',
      'bot'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rol_nombre TEXT UNIQUE NOT NULL,
  tipo_rol public.tipo_rol_enum NOT NULL DEFAULT 'operador',
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed de Roles por defecto
INSERT INTO public.roles (rol_nombre, tipo_rol, activo)
VALUES 
  ('Administrador del Sistema', 'admin', true),
  ('Operador de Depósito', 'operador', true),
  ('Supervisor Logístico', 'supervisor', true),
  ('Cliente Depositante', 'cliente', true),
  ('Conductor / Chofer', 'chofer', true),
  ('Bot Automatizado', 'bot', true)
ON CONFLICT (rol_nombre) DO UPDATE SET
  tipo_rol = EXCLUDED.tipo_rol,
  activo = EXCLUDED.activo;

-- 3. TABLA DE USUARIOS
-- ClientesIds: Array de texto con los códigos de clientes asociados. '000' representa TODOS.
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_usuario TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  clientes_ids TEXT[] NOT NULL DEFAULT ARRAY['000']::TEXT[],
  fecha_ultimo_acceso_bot TIMESTAMPTZ,
  "FechaUltimoAccesoBot" TIMESTAMPTZ,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger de sincronización de FechaUltimoAccesoBot en Usuarios
CREATE OR REPLACE FUNCTION public.trg_usuarios_sync_bot_access()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fecha_ultimo_acceso_bot IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.fecha_ultimo_acceso_bot IS DISTINCT FROM NEW.fecha_ultimo_acceso_bot) THEN
    NEW."FechaUltimoAccesoBot" := NEW.fecha_ultimo_acceso_bot;
  ELSIF NEW."FechaUltimoAccesoBot" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."FechaUltimoAccesoBot" IS DISTINCT FROM NEW."FechaUltimoAccesoBot") THEN
    NEW.fecha_ultimo_acceso_bot := NEW."FechaUltimoAccesoBot";
  END IF;
  NEW.actualizado_en := clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_bot_access_sync ON public.usuarios;
CREATE TRIGGER trg_usuarios_bot_access_sync
BEFORE INSERT OR UPDATE ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.trg_usuarios_sync_bot_access();

-- 4. TABLA INTERMEDIA USUARIOS_ROLES (M:N)
CREATE TABLE IF NOT EXISTS public.usuarios_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  rol_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_usuarios_roles UNIQUE (usuario_id, rol_id)
);

-- Índices de Cobertura y Rendimiento
CREATE INDEX IF NOT EXISTS idx_usuarios_telefono ON public.usuarios(telefono) WHERE telefono IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_clientes_ids ON public.usuarios USING GIN(clientes_ids);
CREATE INDEX IF NOT EXISTS idx_usuarios_roles_usuario_id ON public.usuarios_roles(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_roles_rol_id ON public.usuarios_roles(rol_id);

-- 5. PROCEDIMIENTO RPC: wms_actualizar_ultimo_acceso_bot (AHORA SOBRE USUARIOS)
-- Busca en tabla USUARIOS por:
--  1. ID (UUID)
--  2. Teléfono (exacto o normalizado)
--  3. Email
--  4. Nombre de Usuario
CREATE OR REPLACE FUNCTION public.wms_actualizar_ultimo_acceso_bot(
  p_identificador TEXT,
  p_fecha TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_usuario public.usuarios%ROWTYPE;
  v_clean_id TEXT;
  v_digits TEXT;
  v_fecha_final TIMESTAMPTZ;
  v_roles JSONB;
BEGIN
  IF p_identificador IS NULL OR TRIM(p_identificador) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debe proporcionar un identificador válido (ID, teléfono, email o nombre de usuario).'
    );
  END IF;

  v_clean_id := TRIM(p_identificador);
  v_fecha_final := COALESCE(p_fecha, clock_timestamp());

  -- 1. Intentar por UUID si cumple el formato
  IF v_clean_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_usuario
    FROM public.usuarios
    WHERE id = v_clean_id::UUID
    LIMIT 1;
  END IF;

  -- 2. Si no, buscar por Teléfono exacto
  IF v_usuario.id IS NULL THEN
    SELECT * INTO v_usuario
    FROM public.usuarios
    WHERE telefono = v_clean_id
    LIMIT 1;
  END IF;

  -- 3. Si no, buscar por dígitos normalizados de teléfono
  IF v_usuario.id IS NULL THEN
    v_digits := regexp_replace(v_clean_id, '[^0-9]', '', 'g');
    IF length(v_digits) >= 6 THEN
      SELECT * INTO v_usuario
      FROM public.usuarios
      WHERE regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = v_digits
         OR regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits
         OR v_digits LIKE '%' || regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')
      ORDER BY
        CASE
          WHEN regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = v_digits THEN 1
          ELSE 2
        END
      LIMIT 1;
    END IF;
  END IF;

  -- 4. Si no, buscar por Email
  IF v_usuario.id IS NULL THEN
    SELECT * INTO v_usuario
    FROM public.usuarios
    WHERE LOWER(email) = LOWER(v_clean_id)
    LIMIT 1;
  END IF;

  -- 5. Si no, buscar por Nombre de Usuario
  IF v_usuario.id IS NULL THEN
    SELECT * INTO v_usuario
    FROM public.usuarios
    WHERE LOWER(nombre_usuario) = LOWER(v_clean_id)
    LIMIT 1;
  END IF;

  -- 6. Si no existe ningún usuario coincidente
  IF v_usuario.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No se encontró ningún usuario con el identificador proporcionado (' || v_clean_id || ').'
    );
  END IF;

  -- 7. Actualizar fecha de acceso
  UPDATE public.usuarios
  SET fecha_ultimo_acceso_bot = v_fecha_final,
      "FechaUltimoAccesoBot" = v_fecha_final,
      actualizado_en = clock_timestamp()
  WHERE id = v_usuario.id
  RETURNING * INTO v_usuario;

  -- 8. Obtener roles asignados
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'rol_nombre', r.rol_nombre,
        'tipo_rol', r.tipo_rol
      )
    ),
    '[]'::JSONB
  )
  INTO v_roles
  FROM public.usuarios_roles ur
  JOIN public.roles r ON r.id = ur.rol_id
  WHERE ur.usuario_id = v_usuario.id;

  -- 9. Retornar resultado estructurado
  RETURN jsonb_build_object(
    'success', true,
    'mensaje', 'Fecha de último acceso del bot actualizada exitosamente para el usuario.',
    'usuario_id', v_usuario.id,
    'nombre_usuario', v_usuario.nombre_usuario,
    'telefono', v_usuario.telefono,
    'email', v_usuario.email,
    'clientes_ids', v_usuario.clientes_ids,
    'fecha_ultimo_acceso_bot', v_usuario.fecha_ultimo_acceso_bot,
    'FechaUltimoAccesoBot', v_usuario."FechaUltimoAccesoBot",
    'roles', v_roles,
    'usuario', to_jsonb(v_usuario)
  );
END;
$$;

-- 6. PROCEDIMIENTO RPC: wms_obtener_usuario_por_telefono
CREATE OR REPLACE FUNCTION public.wms_obtener_usuario_por_telefono(
  p_telefono TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_usuario public.usuarios%ROWTYPE;
  v_clean_tel TEXT;
  v_digits TEXT;
  v_roles JSONB;
BEGIN
  IF p_telefono IS NULL OR TRIM(p_telefono) = '' THEN
    RETURN NULL;
  END IF;

  v_clean_tel := TRIM(p_telefono);
  v_digits := regexp_replace(v_clean_tel, '[^0-9]', '', 'g');

  -- 1. Búsqueda exacta
  SELECT * INTO v_usuario
  FROM public.usuarios
  WHERE telefono = v_clean_tel
  LIMIT 1;

  -- 2. Búsqueda por dígitos normalizados
  IF v_usuario.id IS NULL AND length(v_digits) >= 6 THEN
    SELECT * INTO v_usuario
    FROM public.usuarios
    WHERE regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = v_digits
       OR regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits
       OR v_digits LIKE '%' || regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')
    ORDER BY
      CASE
        WHEN regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = v_digits THEN 1
        ELSE 2
      END,
      activo DESC
    LIMIT 1;
  END IF;

  IF v_usuario.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Obtener roles del usuario
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'rol_nombre', r.rol_nombre,
        'tipo_rol', r.tipo_rol
      )
    ),
    '[]'::JSONB
  )
  INTO v_roles
  FROM public.usuarios_roles ur
  JOIN public.roles r ON r.id = ur.rol_id
  WHERE ur.usuario_id = v_usuario.id;

  RETURN jsonb_build_object(
    'id', v_usuario.id,
    'nombre_usuario', v_usuario.nombre_usuario,
    'telefono', v_usuario.telefono,
    'email', v_usuario.email,
    'clientes_ids', v_usuario.clientes_ids,
    'fecha_ultimo_acceso_bot', v_usuario.fecha_ultimo_acceso_bot,
    'FechaUltimoAccesoBot', v_usuario."FechaUltimoAccesoBot",
    'activo', v_usuario.activo,
    'roles', v_roles
  );
END;
$$;

-- 7. PROCEDIMIENTO RPC: wms_obtener_usuarios_por_cliente
-- Devuelve los usuarios que tienen asignado el código del cliente o '000' (Todos)
CREATE OR REPLACE FUNCTION public.wms_obtener_usuarios_por_cliente(
  p_codigo_cliente TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_res JSONB;
BEGIN
  IF p_codigo_cliente IS NULL OR TRIM(p_codigo_cliente) = '' THEN
    RETURN '[]'::JSONB;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'nombre_usuario', u.nombre_usuario,
        'telefono', u.telefono,
        'email', u.email,
        'clientes_ids', u.clientes_ids,
        'fecha_ultimo_acceso_bot', u.fecha_ultimo_acceso_bot,
        'FechaUltimoAccesoBot', u."FechaUltimoAccesoBot",
        'activo', u.activo,
        'roles', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'rol_nombre', r.rol_nombre,
                'tipo_rol', r.tipo_rol
              )
            ),
            '[]'::JSONB
          )
          FROM public.usuarios_roles ur
          JOIN public.roles r ON r.id = ur.rol_id
          WHERE ur.usuario_id = u.id
        )
      )
      ORDER BY u.nombre_usuario ASC
    ),
    '[]'::JSONB
  )
  INTO v_res
  FROM public.usuarios u
  WHERE u.activo = true
    AND ('000' = ANY(u.clientes_ids) OR TRIM(p_codigo_cliente) = ANY(u.clientes_ids));

  RETURN v_res;
END;
$$;

-- 8. ALIASES DIRECTOS RPC
CREATE OR REPLACE FUNCTION public.actualizar_ultimo_acceso_bot(
  p_identificador TEXT,
  p_fecha TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_actualizar_ultimo_acceso_bot(p_identificador, p_fecha);
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_usuario_por_telefono(
  p_telefono TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_obtener_usuario_por_telefono(p_telefono);
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_usuarios_por_cliente(
  p_codigo_cliente TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_obtener_usuarios_por_cliente(p_codigo_cliente);
END;
$$;

-- 9. PERMISOS DE EJECUCIÓN
GRANT EXECUTE ON FUNCTION public.wms_actualizar_ultimo_acceso_bot(TEXT, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_ultimo_acceso_bot(TEXT, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_obtener_usuario_por_telefono(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_usuario_por_telefono(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_obtener_usuarios_por_cliente(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_usuarios_por_cliente(TEXT) TO anon, authenticated, service_role;

-- 10. SEGURIDAD RLS Y PERMISOS DE TABLA
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura abierta roles" ON public.roles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Gestion roles anon/authenticated" ON public.roles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Lectura abierta usuarios" ON public.usuarios FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Gestion usuarios anon/authenticated" ON public.usuarios FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Lectura abierta usuarios_roles" ON public.usuarios_roles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Gestion usuarios_roles anon/authenticated" ON public.usuarios_roles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.roles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.usuarios TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.usuarios_roles TO anon, authenticated, service_role;
