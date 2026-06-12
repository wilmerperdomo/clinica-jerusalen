-- ═══════════════════════════════════════════════════════════════
-- EJECUTAR TODO EN SUPABASE → SQL Editor (en este orden, una vez)
-- Arregla: no puede entrar + no aparecen usuarios en Configuración
-- ═══════════════════════════════════════════════════════════════

-- A) Políticas RLS perfiles (si aún no corrió FIX-RLS-PERFILES)
CREATE OR REPLACE FUNCTION fn_usuario_es_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles p JOIN roles r ON r.id = p.rol_id
    WHERE p.id = auth.uid() AND (r.es_admin = TRUE OR COALESCE(r.es_super_admin, FALSE) = TRUE)
  ) OR EXISTS (
    SELECT 1 FROM perfil_roles pr JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid() AND (r.es_admin = TRUE OR COALESCE(r.es_super_admin, FALSE) = TRUE)
  );
$$;

DROP POLICY IF EXISTS "admin_gestiona_perfiles" ON perfiles;
CREATE POLICY "admin_gestiona_perfiles" ON perfiles
  FOR ALL TO authenticated USING (fn_usuario_es_admin()) WITH CHECK (fn_usuario_es_admin());

CREATE OR REPLACE FUNCTION fn_admin_upsert_perfil(
  p_user_id UUID, p_nombre TEXT, p_apellido TEXT, p_cedula TEXT, p_telefono TEXT,
  p_rol_id INTEGER, p_sucursal_id INTEGER
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT fn_usuario_es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  INSERT INTO perfiles (id, nombre, apellido, cedula, telefono, rol_id, sucursal_id, activo)
  VALUES (p_user_id, p_nombre, p_apellido, p_cedula, p_telefono, p_rol_id, p_sucursal_id, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre, apellido = EXCLUDED.apellido, cedula = EXCLUDED.cedula,
    telefono = EXCLUDED.telefono, rol_id = EXCLUDED.rol_id, sucursal_id = EXCLUDED.sucursal_id, activo = TRUE;
  DELETE FROM perfil_roles WHERE perfil_id = p_user_id;
  INSERT INTO perfil_roles (perfil_id, rol_id) VALUES (p_user_id, p_rol_id) ON CONFLICT DO NOTHING;
END;
$$;

-- B) Confirmar TODOS los correos (permite login sin verificar email)
UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  confirmed_at       = COALESCE(confirmed_at, NOW())
WHERE email_confirmed_at IS NULL OR confirmed_at IS NULL;

-- C) Crear perfil a quien solo existe en Auth
INSERT INTO perfiles (id, nombre, apellido, sucursal_id, rol_id, activo)
SELECT u.id,
  COALESCE(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1)),
  COALESCE(u.raw_user_meta_data->>'apellido', ''),
  (SELECT id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1),
  (SELECT id FROM roles WHERE nombre = 'Cajero' LIMIT 1),
  TRUE
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM perfiles p WHERE p.id = u.id);

-- D) Sincronizar perfil_roles
INSERT INTO perfil_roles (perfil_id, rol_id)
SELECT p.id, p.rol_id FROM perfiles p
WHERE p.rol_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM perfil_roles pr WHERE pr.perfil_id = p.id AND pr.rol_id = p.rol_id)
ON CONFLICT DO NOTHING;

-- E) Restaurar super admin
UPDATE perfiles p SET
  rol_id = (SELECT id FROM roles WHERE nombre = 'Super Administrador' LIMIT 1),
  sucursal_id = COALESCE(p.sucursal_id, (SELECT id FROM sucursales ORDER BY id LIMIT 1)),
  activo = TRUE
FROM auth.users u WHERE p.id = u.id AND u.email = 'admin@clinica.com';

-- F) Función listar usuarios para Configuración
CREATE OR REPLACE FUNCTION fn_listar_perfiles_admin()
RETURNS TABLE (
  id UUID, nombre TEXT, apellido TEXT, cedula TEXT, telefono TEXT,
  sucursal_id INTEGER, rol_id INTEGER, activo BOOLEAN, created_at TIMESTAMPTZ,
  email TEXT, rol_nombre TEXT, rol_color TEXT, rol_es_admin BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre, p.apellido, p.cedula, p.telefono, p.sucursal_id, p.rol_id,
    p.activo, p.created_at, u.email, r.nombre, r.color, r.es_admin
  FROM perfiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN roles r ON r.id = p.rol_id
  WHERE fn_usuario_es_admin()
  ORDER BY p.created_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION fn_listar_perfiles_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_admin_upsert_perfil(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER) TO authenticated;

-- G) VERIFICACIÓN FINAL
SELECT u.email,
  u.email_confirmed_at IS NOT NULL AS email_confirmado,
  p.nombre, r.nombre AS rol,
  CASE WHEN p.id IS NULL THEN 'SIN PERFIL' ELSE 'OK' END AS estado
FROM auth.users u
LEFT JOIN perfiles p ON p.id = u.id
LEFT JOIN roles r ON r.id = p.rol_id
ORDER BY u.email;
