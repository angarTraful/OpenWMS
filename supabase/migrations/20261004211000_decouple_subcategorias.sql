-- Migration: Decouple subcategorias_articulos from categorias_articulos
-- Removes hierarchy dependency so categories and subcategories operate as independent master entities.

-- 1. Eliminar la restricción única compuesta (categoria_id, codigo) y el FK obligatorio
ALTER TABLE public.subcategorias_articulos 
  DROP CONSTRAINT IF EXISTS subcategorias_categoria_codigo_uk,
  DROP CONSTRAINT IF EXISTS subcategorias_articulos_categoria_id_fkey;

-- 2. Permitir categoria_id NULL en subcategorías
ALTER TABLE public.subcategorias_articulos
  ALTER COLUMN categoria_id DROP NOT NULL;

-- 3. Agregar restricción de clave única independiente sobre el código de subcategoría
ALTER TABLE public.subcategorias_articulos
  ADD CONSTRAINT subcategorias_codigo_uk UNIQUE (codigo);
