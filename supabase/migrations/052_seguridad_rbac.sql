-- ═══════════════════════════════════════════════════════════════
--  052 — Seguridad RBAC: cerrar escalación de privilegios
--  Problemas corregidos:
--   1. perfil_propio_editar permitía cambiar rol_id/sucursal_id propios
--   2. perfil_roles / rol_permisos / permisos tenían escritura abierta
--      (USING true) para cualquier usuario autenticado.
--  Requiere fn_usuario_es_admin() (migración 046_fix_perfiles_rls).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Trigger que impide auto-ascenso de rol/sucursal/estado ──
-- Un usuario no-admin puede editar su propio perfil (nombre, teléfono,
-- avatar) pero NO sus columnas sensibles. Los administradores usan
-- fn_admin_upsert_perfil (SECURITY DEFINER, ya valida permisos).

CREATE OR REPLACE FUNCTION fn_proteger_columnas_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Administradores y super admins pueden cambiar todo
  IF fn_usuario_es_admin() THEN
    RETURN NEW;
  END IF;

  -- Usuario sin privilegios: no puede modificar columnas sensibles propias
  IF NEW.rol_id      IS DISTINCT FROM OLD.rol_id
     OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
     OR NEW.activo    IS DISTINCT FROM OLD.activo THEN
    RAISE EXCEPTION 'No autorizado para cambiar rol, sucursal o estado del perfil';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_perfil ON perfiles;
CREATE TRIGGER trg_proteger_perfil
  BEFORE UPDATE ON perfiles
  FOR EACH ROW
  EXECUTE FUNCTION fn_proteger_columnas_perfil();

-- ── 2. perfil_roles: escritura solo administradores ──
-- (la lectura sigue abierta vía auth_lee_perfil_roles para el login)
DROP POLICY IF EXISTS "admin_gestiona_perfil_roles" ON perfil_roles;
CREATE POLICY "admin_gestiona_perfil_roles" ON perfil_roles
  FOR ALL TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

-- ── 3. rol_permisos: escritura solo administradores ──
-- (lectura abierta vía auth_lee_rol_permisos)
DROP POLICY IF EXISTS "admin_gestiona_rol_permisos" ON rol_permisos;
CREATE POLICY "admin_gestiona_rol_permisos" ON rol_permisos
  FOR ALL TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

-- ── 4. permisos: escritura solo administradores ──
-- (lectura abierta vía auth_lee_permisos)
DROP POLICY IF EXISTS "admin_gestiona_permisos" ON permisos;
CREATE POLICY "admin_gestiona_permisos" ON permisos
  FOR ALL TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

GRANT EXECUTE ON FUNCTION fn_proteger_columnas_perfil() TO authenticated;
