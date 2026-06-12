-- ═══════════════════════════════════════════════════════════════
-- 046 — Corregir recursión infinita en RLS de perfiles
-- Error: infinite recursion detected in policy for relation "perfiles"
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_usuario_es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM perfiles p
    JOIN roles r ON r.id = p.rol_id
    WHERE p.id = auth.uid()
      AND (r.es_admin = TRUE OR COALESCE(r.es_super_admin, FALSE) = TRUE)
  )
  OR EXISTS (
    SELECT 1
    FROM perfil_roles pr
    JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid()
      AND (r.es_admin = TRUE OR COALESCE(r.es_super_admin, FALSE) = TRUE)
  );
$$;

DROP POLICY IF EXISTS "admin_gestiona_perfiles" ON perfiles;
CREATE POLICY "admin_gestiona_perfiles" ON perfiles
  FOR ALL TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

DROP POLICY IF EXISTS "admin_gestiona_sucursales" ON sucursales;
CREATE POLICY "admin_gestiona_sucursales" ON sucursales
  FOR ALL TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

DROP POLICY IF EXISTS "acceso_logs_admin_select" ON acceso_logs;
CREATE POLICY "acceso_logs_admin_select" ON acceso_logs
  FOR SELECT TO authenticated
  USING (fn_usuario_es_admin());

CREATE OR REPLACE FUNCTION fn_admin_upsert_perfil(
  p_user_id     UUID,
  p_nombre      TEXT,
  p_apellido    TEXT,
  p_cedula      TEXT,
  p_telefono    TEXT,
  p_rol_id      INTEGER,
  p_sucursal_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_usuario_es_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM roles WHERE id = p_rol_id AND COALESCE(es_super_admin, FALSE) = TRUE
  ) THEN
    RAISE EXCEPTION 'No se puede asignar Super Administrador desde este formulario';
  END IF;

  INSERT INTO perfiles (id, nombre, apellido, cedula, telefono, rol_id, sucursal_id, activo)
  VALUES (p_user_id, p_nombre, p_apellido, p_cedula, p_telefono, p_rol_id, p_sucursal_id, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    nombre      = EXCLUDED.nombre,
    apellido    = EXCLUDED.apellido,
    cedula      = EXCLUDED.cedula,
    telefono    = EXCLUDED.telefono,
    rol_id      = EXCLUDED.rol_id,
    sucursal_id = EXCLUDED.sucursal_id,
    activo      = TRUE;

  DELETE FROM perfil_roles WHERE perfil_id = p_user_id;
  INSERT INTO perfil_roles (perfil_id, rol_id)
  VALUES (p_user_id, p_rol_id)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_usuario_es_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_admin_upsert_perfil(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
