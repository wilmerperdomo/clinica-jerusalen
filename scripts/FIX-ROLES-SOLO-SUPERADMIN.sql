-- ═══════════════════════════════════════════════════════════════
--  FIX — Asignación de roles SOLO para super administradores
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Equivale a la migración 056_roles_solo_superadmin.sql
-- ═══════════════════════════════════════════════════════════════

-- 1. Helper: ¿el usuario actual es super admin?
CREATE OR REPLACE FUNCTION fn_usuario_es_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles p
    JOIN roles r ON r.id = p.rol_id
    WHERE p.id = auth.uid() AND COALESCE(r.es_super_admin, FALSE) = TRUE
  )
  OR EXISTS (
    SELECT 1 FROM perfil_roles pr
    JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid() AND COALESCE(r.es_super_admin, FALSE) = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION fn_usuario_es_super_admin() TO authenticated;

-- 2. Trigger de perfiles: el rol solo lo cambia el super admin
CREATE OR REPLACE FUNCTION fn_proteger_columnas_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF fn_usuario_es_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.rol_id IS DISTINCT FROM OLD.rol_id THEN
    RAISE EXCEPTION 'Solo el super administrador puede cambiar el rol del usuario';
  END IF;

  IF NOT fn_usuario_es_admin() THEN
    IF NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
       OR NEW.activo IS DISTINCT FROM OLD.activo THEN
      RAISE EXCEPTION 'No autorizado para cambiar sucursal o estado del perfil';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_perfil ON perfiles;
CREATE TRIGGER trg_proteger_perfil
  BEFORE UPDATE ON perfiles
  FOR EACH ROW EXECUTE FUNCTION fn_proteger_columnas_perfil();

-- 3. perfil_roles: escritura SOLO super admin (lectura sigue abierta)
DROP POLICY IF EXISTS "admin_gestiona_perfil_roles" ON perfil_roles;
CREATE POLICY "admin_gestiona_perfil_roles" ON perfil_roles
  FOR ALL TO authenticated
  USING (fn_usuario_es_super_admin())
  WITH CHECK (fn_usuario_es_super_admin());

-- 4. fn_admin_upsert_perfil: permitir crear usuario SIN rol
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

  IF p_rol_id IS NOT NULL AND NOT fn_usuario_es_super_admin() THEN
    RAISE EXCEPTION 'Solo el super administrador puede asignar roles';
  END IF;

  IF p_rol_id IS NOT NULL AND EXISTS (
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
  IF p_rol_id IS NOT NULL THEN
    INSERT INTO perfil_roles (perfil_id, rol_id)
    VALUES (p_user_id, p_rol_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_admin_upsert_perfil(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
